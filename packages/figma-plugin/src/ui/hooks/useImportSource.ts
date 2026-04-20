import { useState, useCallback, useRef, useEffect } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { getErrorMessage } from '../shared/utils';
import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';
import {
  parseCSSCustomProperties,
  parseTailwindConfigFile,
  isTokensStudioFormat,
  parseTokensStudioFile,
  type SkippedEntry,
} from '../shared/tokenParsers';
import {
  type ImportToken,
  type ModeData,
  type CollectionData,
  type ImportSource,
  type SourceFamily,
  type ImportWorkflowStage,
  IMPORT_SOURCE_DEFINITIONS,
  markDuplicatePaths,
  defaultCollectionName,
  modeKey,
  validateDTCGStructure,
  formatSupportedFileFormats,
  getAllSupportedFileFormats,
} from '../components/importPanelTypes';

export interface UseImportSourceParams {
  onClearConflictState: () => void;
  onResetExistingPathsCache: () => void;
}

export type FileImportSource = Exclude<ImportSource, 'variables' | 'styles'>;
export type FileImportValidationStatus = 'ready' | 'partial' | 'error' | 'unsupported';

export interface FileImportValidationIssue {
  message: string;
  severity: 'error' | 'warning';
}

export interface FileImportValidation {
  fileName: string;
  source: FileImportSource | null;
  status: FileImportValidationStatus;
  summary: string;
  detail: string;
  nextAction: string;
  tokenCount: number;
  skippedCount: number;
  issues: FileImportValidationIssue[];
  skippedEntries: SkippedEntry[];
  supportedFormats: string[];
  parserLimits: string[];
}

const FILE_IMPORT_PARSER_LIMITS: Record<FileImportSource, string[]> = {
  json: [
    'The root must be a JSON object with nested token groups or a top-level "tokens" object.',
    'Only DTCG token objects with $value fields are imported.',
    'Tokens Studio exports are auto-detected and routed to the migration parser when possible.',
  ],
  css: [
    'Only static custom property values are imported.',
    'Expressions using var(), calc(), env(), min(), max(), or clamp() are skipped.',
  ],
  tailwind: [
    'Only static values from theme or theme.extend are imported.',
    'Arrays, functions, booleans, and null values are skipped.',
  ],
  'tokens-studio': [
    'Single-collection exports stay in one collection; multi-collection exports preserve collection boundaries.',
    'Only nested groups containing value or $value fields are imported.',
  ],
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getSupportedFormatsForSource(source: FileImportSource | null): string[] {
  if (!source) return getAllSupportedFileFormats();
  const label = IMPORT_SOURCE_DEFINITIONS[source].fileSupport?.label;
  return label ? [label] : [];
}

function getParserLimitsForSource(source: FileImportSource | null): string[] {
  if (!source) {
    return [
      'JSON imports expect DTCG or Tokens Studio exports.',
      'CSS and Tailwind imports accept static values only.',
    ];
  }
  return FILE_IMPORT_PARSER_LIMITS[source];
}

export function useImportSource({ onClearConflictState, onResetExistingPathsCache }: UseImportSourceParams) {
  const [source, setSource] = useState<'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null>(null);
  const [sourceFamily, setSourceFamily] = useState<SourceFamily | null>(null);
  const [workflowStage, setWorkflowStage] = useState<ImportWorkflowStage>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ImportToken[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [collectionData, setCollectionData] = useState<CollectionData[]>([]);
  const [modeCollectionNames, setModeCollectionNames] = useState<
    Record<string, string>
  >({});
  const [modeEnabled, setModeEnabled] = useState<Record<string, boolean>>({});
  const [skippedEntries, setSkippedEntries] = useState<SkippedEntry[]>([]);
  const [skippedExpanded, setSkippedExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileImportValidation, setFileImportValidation] = useState<FileImportValidation | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cssFileInputRef = useRef<HTMLInputElement | null>(null);
  const tailwindFileInputRef = useRef<HTMLInputElement | null>(null);
  const tokensStudioFileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const readTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSourceRef = useRef<'variables' | 'styles' | null>(null);
  const correlationIdRef = useRef<string | null>(null);

  const resetLoadedImportState = useCallback(() => {
    if (readTimeoutRef.current) {
      clearTimeout(readTimeoutRef.current);
      readTimeoutRef.current = null;
    }
    pendingSourceRef.current = null;
    correlationIdRef.current = null;
    setLoading(false);
    setSource(null);
    setCollectionData([]);
    setTokens([]);
    setSelectedTokens(new Set());
    setTypeFilter(null);
    setSkippedEntries([]);
    setSkippedExpanded(false);
  }, []);

  const resetImportFlow = useCallback(() => {
    resetLoadedImportState();
    setSourceFamily(null);
    setWorkflowStage('home');
    setError(null);
    setFileImportValidation(null);
    onClearConflictState();
  }, [onClearConflictState, resetLoadedImportState]);

  const clearFileImportValidation = useCallback(() => {
    setFileImportValidation(null);
  }, []);

  const updateFileImportValidation = useCallback((validation: FileImportValidation) => {
    setFileImportValidation(validation);
  }, []);

  const selectSourceFamily = useCallback((family: SourceFamily) => {
    onClearConflictState();
    if (sourceFamily !== family || source !== null || tokens.length > 0 || collectionData.length > 0) {
      resetLoadedImportState();
    }
    setError(null);
    setSourceFamily(family);
    setWorkflowStage('home');
  }, [collectionData.length, onClearConflictState, resetLoadedImportState, source, sourceFamily, tokens.length]);

  const continueToPreview = useCallback(() => {
    onClearConflictState();
    setWorkflowStage('preview');
  }, [onClearConflictState]);

  const startReadTimeout = useCallback((timedOutSource: 'variables' | 'styles' | null) => {
    if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    readTimeoutRef.current = setTimeout(() => {
      readTimeoutRef.current = null;
      pendingSourceRef.current = null;
      correlationIdRef.current = null;
      setLoading(false);
      setError(
        timedOutSource === 'variables'
          ? 'Timed out waiting for Figma. Make sure the Figma Variables API is available (requires a Professional plan or above) and that this file has local variables defined.'
          : 'Timed out waiting for Figma. Try again or reload the plugin.'
      );
    }, 45000);
  }, []);

  // Listen for messages from sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{
        type?: string;
        correlationId?: string;
        error?: string;
        collections?: CollectionData[];
        tokens?: ImportToken[];
      }>(event);
      if (!msg) return;

      if (msg.type === 'variables-read-error' && pendingSourceRef.current === 'variables' && msg.correlationId === correlationIdRef.current) {
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        pendingSourceRef.current = null;
        correlationIdRef.current = null;
        setLoading(false);
        setError(`Figma Variables API error: ${msg.error}. The Variables API requires a Figma Professional plan or above.`);
      }
      if (msg.type === 'variables-read' && pendingSourceRef.current === 'variables' && msg.correlationId === correlationIdRef.current) {
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        pendingSourceRef.current = null;
        correlationIdRef.current = null;
        const cols: CollectionData[] = msg.collections || [];
        setCollectionData(cols);
        const names: Record<string, string> = {};
        const enabled: Record<string, boolean> = {};
        for (const col of cols) {
          for (const mode of col.modes) {
            const key = modeKey(col.name, mode.modeId);
            names[key] = defaultCollectionName(
              col.name,
              mode.modeName,
              col.modes.length,
            );
            enabled[key] = true;
          }
        }
        setModeCollectionNames(names);
        setModeEnabled(enabled);
        setSourceFamily('figma');
        setWorkflowStage('preview');
        setLoading(false);
      }
      if (msg.type === 'styles-read-error' && pendingSourceRef.current === 'styles' && msg.correlationId === correlationIdRef.current) {
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        pendingSourceRef.current = null;
        correlationIdRef.current = null;
        setLoading(false);
        setError(`Figma Styles API error: ${msg.error ?? 'Unknown error'}`);
      }
      if (msg.type === 'styles-read' && pendingSourceRef.current === 'styles' && msg.correlationId === correlationIdRef.current) {
        pendingSourceRef.current = null;
        correlationIdRef.current = null;
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        const markedTokens = markDuplicatePaths(msg.tokens || []);
        setTokens(markedTokens);
        setSelectedTokens(new Set((msg.tokens || []).map((t: ImportToken) => t.path)));
        setTypeFilter(null);
        setSourceFamily('figma');
        setWorkflowStage('preview');
        setLoading(false);
        onResetExistingPathsCache();
      }
    };

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    };
  }, [onResetExistingPathsCache]);

  const handleReadVariables = useCallback(() => {
    clearFileImportValidation();
    pendingSourceRef.current = 'variables';
    const cid = `import-${Date.now()}-${Math.random()}`;
    correlationIdRef.current = cid;
    setSourceFamily('figma');
    setSource('variables');
    setCollectionData([]);
    setTokens([]);
    setError(null);
    const sent = postPluginMessage({ type: 'read-variables', correlationId: cid });
    if (!sent) {
      pendingSourceRef.current = null;
      correlationIdRef.current = null;
      setError('Could not reach the Figma plugin. Make sure the plugin is running inside Figma.');
      return;
    }
    setLoading(true);
    startReadTimeout('variables');
  }, [clearFileImportValidation, startReadTimeout]);

  const handleReadStyles = useCallback(() => {
    clearFileImportValidation();
    pendingSourceRef.current = 'styles';
    const cid = `import-${Date.now()}-${Math.random()}`;
    correlationIdRef.current = cid;
    setSourceFamily('figma');
    setSource('styles');
    setTokens([]);
    setError(null);
    const sent = postPluginMessage({ type: 'read-styles', correlationId: cid });
    if (!sent) {
      pendingSourceRef.current = null;
      correlationIdRef.current = null;
      setError('Could not reach the Figma plugin. Make sure the plugin is running inside Figma.');
      return;
    }
    setLoading(true);
    startReadTimeout('styles');
  }, [clearFileImportValidation, startReadTimeout]);

  const processTokensStudioContent = useCallback((
    raw: string,
    {
      collectionName = 'Token Sets',
      fileName = 'Tokens Studio JSON',
    }: {
      collectionName?: string;
      fileName?: string;
    } = {},
  ) => {
    const { sets: parsedSets, errors } = parseTokensStudioFile(raw);
    if (parsedSets.size === 0) {
      setError(null);
      updateFileImportValidation({
        fileName,
        source: 'tokens-studio',
        status: 'error',
        summary: `Could not import ${fileName}`,
        detail: errors.length > 0 ? errors.join('; ') : 'No tokens found in Tokens Studio file.',
        nextAction: 'Use a Tokens Studio JSON export with nested token groups, then try again.',
        tokenCount: 0,
        skippedCount: 0,
        issues: errors.map(message => ({ message, severity: 'error' as const })),
        skippedEntries: [],
        supportedFormats: getSupportedFormatsForSource('tokens-studio'),
        parserLimits: getParserLimitsForSource('tokens-studio'),
      });
      return;
    }
    setError(null);
    onResetExistingPathsCache();
    setCollectionData([]);
    setSourceFamily('migration');
    setWorkflowStage('preview');
    setSkippedEntries([]);
    setSkippedExpanded(false);

    if (parsedSets.size === 1) {
      const [, setTokenList] = [...parsedSets.entries()][0];
      const importTokens: ImportToken[] = setTokenList.map(t => ({ path: t.path, $type: t.$type, $value: t.$value }));
      const markedTokens = markDuplicatePaths(importTokens);
      setSource('tokens-studio');
      setTokens(markedTokens);
      setSelectedTokens(new Set(importTokens.map(t => t.path)));
      setTypeFilter(null);
    } else {
      const modes: ModeData[] = [];
      const names: Record<string, string> = {};
      const enabled: Record<string, boolean> = {};
      for (const [collectionId, setTokenList] of parsedSets) {
        const importTokens: ImportToken[] = setTokenList.map(t => ({ path: t.path, $type: t.$type, $value: t.$value }));
        modes.push({ modeId: collectionId, modeName: collectionId, tokens: importTokens });
        const key = modeKey(collectionName, collectionId);
        names[key] = collectionId;
        enabled[key] = true;
      }
      setSource('tokens-studio');
      setCollectionData([{ name: collectionName, modes }]);
      setModeCollectionNames(names);
      setModeEnabled(enabled);
    }
    const tokenCount = [...parsedSets.values()].reduce((count, setTokenList) => count + setTokenList.length, 0);
    const setCount = parsedSets.size;
    updateFileImportValidation({
      fileName,
      source: 'tokens-studio',
      status: 'ready',
      summary: `Parsed ${pluralize(tokenCount, 'token')} from ${fileName}`,
      detail:
        setCount === 1
          ? 'Detected a single Tokens Studio collection and prepared it for import.'
          : `Detected ${pluralize(setCount, 'collection')} and preserved each collection mapping for import.`,
      nextAction:
        setCount === 1
          ? 'Choose the destination collection, then continue to preview or import.'
          : 'Review the destination collection names, then import the parsed collections.',
      tokenCount,
      skippedCount: 0,
      issues: [],
      skippedEntries: [],
      supportedFormats: getSupportedFormatsForSource('tokens-studio'),
      parserLimits: getParserLimitsForSource('tokens-studio'),
    });
  }, [onResetExistingPathsCache, updateFileImportValidation]);

  const processJsonFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = reader.result as string;
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch (syntaxErr) {
          const detail = syntaxErr instanceof SyntaxError ? syntaxErr.message : String(syntaxErr);
          setError(null);
          updateFileImportValidation({
            fileName: file.name,
            source: 'json',
            status: 'error',
            summary: `Could not parse ${file.name}`,
            detail: `Invalid JSON: ${detail}`,
            nextAction: 'Fix the JSON syntax, then retry the import.',
            tokenCount: 0,
            skippedCount: 0,
            issues: [{ message: detail, severity: 'error' }],
            skippedEntries: [],
            supportedFormats: getSupportedFormatsForSource('json'),
            parserLimits: getParserLimitsForSource('json'),
          });
          return;
        }

        if (json === null || typeof json !== 'object' || Array.isArray(json)) {
          const actual = json === null ? 'null' : Array.isArray(json) ? 'an array' : `a ${typeof json}`;
          const detail = `Expected a JSON object but got ${actual}.`;
          setError(null);
          updateFileImportValidation({
            fileName: file.name,
            source: 'json',
            status: 'error',
            summary: `Could not import ${file.name}`,
            detail: `${detail} DTCG token files must contain nested groups or tokens with $type and $value fields.`,
            nextAction: 'Export a DTCG token object or a Tokens Studio JSON file, then retry.',
            tokenCount: 0,
            skippedCount: 0,
            issues: [{ message: detail, severity: 'error' }],
            skippedEntries: [],
            supportedFormats: getSupportedFormatsForSource('json'),
            parserLimits: getParserLimitsForSource('json'),
          });
          return;
        }

        const root = json as Record<string, unknown>;

        if (isTokensStudioFormat(root)) {
          processTokensStudioContent(raw, {
            collectionName: file.name.replace(/\.json$/i, '') || 'Token Sets',
            fileName: file.name,
          });
          return;
        }

        const group = (root.tokens ?? root) as Record<string, unknown>;

        const validationError = validateDTCGStructure(group);
        if (validationError) {
          setError(null);
          updateFileImportValidation({
            fileName: file.name,
            source: 'json',
            status: 'error',
            summary: `Could not import ${file.name}`,
            detail: validationError,
            nextAction: 'Use a DTCG JSON token export or switch to the Tokens Studio importer for migration files.',
            tokenCount: 0,
            skippedCount: 0,
            issues: [{ message: validationError, severity: 'error' }],
            skippedEntries: [],
            supportedFormats: getSupportedFormatsForSource('json'),
            parserLimits: getParserLimitsForSource('json'),
          });
          return;
        }

        const flat = flattenTokenGroup(group as import('@tokenmanager/core').DTCGGroup);
        const importTokens: ImportToken[] = [];
        for (const [path, token] of flat) {
          importTokens.push({ path, $type: token.$type ?? 'unknown', $value: token.$value });
        }
        if (importTokens.length === 0) {
          const detail = 'No tokens found in file. The file is valid JSON but does not contain any DTCG token objects with $value fields.';
          setError(null);
          updateFileImportValidation({
            fileName: file.name,
            source: 'json',
            status: 'error',
            summary: `Could not import ${file.name}`,
            detail,
            nextAction: 'Check that the export contains token objects with $type and $value fields, then retry.',
            tokenCount: 0,
            skippedCount: 0,
            issues: [{ message: detail, severity: 'error' }],
            skippedEntries: [],
            supportedFormats: getSupportedFormatsForSource('json'),
            parserLimits: getParserLimitsForSource('json'),
          });
          return;
        }
        const markedImportTokens = markDuplicatePaths(importTokens);
        setSource('json');
        setTokens(markedImportTokens);
        setSelectedTokens(new Set(importTokens.map(t => t.path)));
        setTypeFilter(null);
        setError(null);
        setCollectionData([]);
        setSourceFamily('token-files');
        setWorkflowStage('preview');
        setSkippedEntries([]);
        setSkippedExpanded(false);
        onResetExistingPathsCache();
        updateFileImportValidation({
          fileName: file.name,
          source: 'json',
          status: 'ready',
          summary: `Parsed ${pluralize(importTokens.length, 'token')} from ${file.name}`,
          detail: 'The file matched the DTCG JSON parser and is ready to import.',
          nextAction: 'Choose the destination collection, then continue to preview or import.',
          tokenCount: importTokens.length,
          skippedCount: 0,
          issues: [],
          skippedEntries: [],
          supportedFormats: getSupportedFormatsForSource('json'),
          parserLimits: getParserLimitsForSource('json'),
        });
      } catch (err) {
        const detail = getErrorMessage(err);
        setError(null);
        updateFileImportValidation({
          fileName: file.name,
          source: 'json',
          status: 'error',
          summary: `Could not import ${file.name}`,
          detail: `Failed to process token file: ${detail}`,
          nextAction: 'Check the file contents and retry the import.',
          tokenCount: 0,
          skippedCount: 0,
          issues: [{ message: detail, severity: 'error' }],
          skippedEntries: [],
          supportedFormats: getSupportedFormatsForSource('json'),
          parserLimits: getParserLimitsForSource('json'),
        });
      }
    };
    reader.onerror = () => {
      const detail = 'Failed to read file. The file may be corrupt or inaccessible.';
      setError(null);
      updateFileImportValidation({
        fileName: file.name,
        source: 'json',
        status: 'error',
        summary: `Could not open ${file.name}`,
        detail,
        nextAction: 'Confirm the file is accessible, then retry the import.',
        tokenCount: 0,
        skippedCount: 0,
        issues: [{ message: detail, severity: 'error' }],
        skippedEntries: [],
        supportedFormats: getSupportedFormatsForSource('json'),
        parserLimits: getParserLimitsForSource('json'),
      });
    };
    reader.readAsText(file);
  }, [processTokensStudioContent, onResetExistingPathsCache, updateFileImportValidation]);

  const processCSSFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = reader.result as string;
        const { tokens: parsed, errors, skipped } = parseCSSCustomProperties(raw);
        if (parsed.length === 0 && skipped.length === 0) {
          const detail = errors.length > 0 ? errors.join('; ') : 'No CSS custom properties found in file.';
          setError(null);
          updateFileImportValidation({
            fileName: file.name,
            source: 'css',
            status: 'error',
            summary: `Could not import ${file.name}`,
            detail,
            nextAction: 'Use CSS custom properties in the form "--name: value" and retry.',
            tokenCount: 0,
            skippedCount: 0,
            issues: errors.map(message => ({ message, severity: 'error' as const })),
            skippedEntries: [],
            supportedFormats: getSupportedFormatsForSource('css'),
            parserLimits: getParserLimitsForSource('css'),
          });
          return;
        }
        if (parsed.length === 0) {
          const detail = `All ${pluralize(skipped.length, 'CSS custom property', 'CSS custom properties')} contained dynamic expressions and were skipped.`;
          setSkippedEntries(skipped);
          setSkippedExpanded(true);
          setError(null);
          updateFileImportValidation({
            fileName: file.name,
            source: 'css',
            status: 'error',
            summary: `No importable tokens found in ${file.name}`,
            detail,
            nextAction: 'Replace dynamic expressions with static values or aliases before retrying the import.',
            tokenCount: 0,
            skippedCount: skipped.length,
            issues: [],
            skippedEntries: skipped,
            supportedFormats: getSupportedFormatsForSource('css'),
            parserLimits: getParserLimitsForSource('css'),
          });
          return;
        }
        const importTokens: ImportToken[] = parsed.map(t => ({ path: t.path, $type: t.$type, $value: t.$value }));
        const markedImportTokens = markDuplicatePaths(importTokens);
        const isPartial = skipped.length > 0 || errors.length > 0;
        setSource('css');
        setTokens(markedImportTokens);
        setSelectedTokens(new Set(importTokens.map(t => t.path)));
        setTypeFilter(null);
        setSkippedEntries(skipped);
        setSkippedExpanded(false);
        setError(null);
        setCollectionData([]);
        setSourceFamily('code');
        setWorkflowStage('preview');
        onResetExistingPathsCache();
        updateFileImportValidation({
          fileName: file.name,
          source: 'css',
          status: isPartial ? 'partial' : 'ready',
          summary: isPartial
            ? `Parsed ${pluralize(importTokens.length, 'token')} from ${file.name} with warnings`
            : `Parsed ${pluralize(importTokens.length, 'token')} from ${file.name}`,
          detail: isPartial
            ? [
              skipped.length > 0 ? `${pluralize(skipped.length, 'entry')} skipped because the parser could not resolve them statically` : null,
              errors.length > 0 ? `${pluralize(errors.length, 'line')} could not be parsed` : null,
            ].filter(Boolean).join('; ')
            : 'The file is ready to import.',
          nextAction: isPartial
            ? 'Review the skipped entries before importing. Retry only re-sends tokens that parsed successfully.'
            : 'Choose the destination collection, then continue to preview or import.',
          tokenCount: importTokens.length,
          skippedCount: skipped.length,
          issues: errors.map(message => ({ message, severity: 'warning' as const })),
          skippedEntries: skipped,
          supportedFormats: getSupportedFormatsForSource('css'),
          parserLimits: getParserLimitsForSource('css'),
        });
      } catch (err) {
        const detail = getErrorMessage(err);
        setError(null);
        updateFileImportValidation({
          fileName: file.name,
          source: 'css',
          status: 'error',
          summary: `Could not import ${file.name}`,
          detail: `Could not parse CSS file: ${detail}`,
          nextAction: 'Check the stylesheet syntax and retry.',
          tokenCount: 0,
          skippedCount: 0,
          issues: [{ message: detail, severity: 'error' }],
          skippedEntries: [],
          supportedFormats: getSupportedFormatsForSource('css'),
          parserLimits: getParserLimitsForSource('css'),
        });
      }
    };
    reader.onerror = () => {
      const detail = 'Failed to read file. The file may be corrupt or inaccessible.';
      setError(null);
      updateFileImportValidation({
        fileName: file.name,
        source: 'css',
        status: 'error',
        summary: `Could not open ${file.name}`,
        detail,
        nextAction: 'Confirm the file is accessible, then retry the import.',
        tokenCount: 0,
        skippedCount: 0,
        issues: [{ message: detail, severity: 'error' }],
        skippedEntries: [],
        supportedFormats: getSupportedFormatsForSource('css'),
        parserLimits: getParserLimitsForSource('css'),
      });
    };
    reader.readAsText(file);
  }, [onResetExistingPathsCache, updateFileImportValidation]);

  const processTailwindFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = reader.result as string;
        const { tokens: parsed, errors, skipped } = parseTailwindConfigFile(raw);
        if (parsed.length === 0) {
          const detail = errors.length > 0
            ? errors.join('; ')
            : 'No theme values found in file. Expected a Tailwind config with a theme object containing static values.';
          if (skipped.length > 0) {
            setSkippedEntries(skipped);
            setSkippedExpanded(true);
          }
          setError(null);
          updateFileImportValidation({
            fileName: file.name,
            source: 'tailwind',
            status: 'error',
            summary: `Could not import ${file.name}`,
            detail,
            nextAction: skipped.length > 0
              ? 'Replace dynamic or unsupported theme values with static values before retrying.'
              : 'Use a Tailwind config with a static theme or theme.extend object, then retry.',
            tokenCount: 0,
            skippedCount: skipped.length,
            issues: errors.map(message => ({ message, severity: 'error' as const })),
            skippedEntries: skipped,
            supportedFormats: getSupportedFormatsForSource('tailwind'),
            parserLimits: getParserLimitsForSource('tailwind'),
          });
          return;
        }
        const importTokens: ImportToken[] = parsed.map(t => ({ path: t.path, $type: t.$type, $value: t.$value }));
        const markedImportTokens = markDuplicatePaths(importTokens);
        const isPartial = skipped.length > 0 || errors.length > 0;
        setSource('tailwind');
        setTokens(markedImportTokens);
        setSelectedTokens(new Set(importTokens.map(t => t.path)));
        setTypeFilter(null);
        setSkippedEntries(skipped);
        setSkippedExpanded(false);
        setError(null);
        setCollectionData([]);
        setSourceFamily('code');
        setWorkflowStage('preview');
        onResetExistingPathsCache();
        updateFileImportValidation({
          fileName: file.name,
          source: 'tailwind',
          status: isPartial ? 'partial' : 'ready',
          summary: isPartial
            ? `Parsed ${pluralize(importTokens.length, 'token')} from ${file.name} with warnings`
            : `Parsed ${pluralize(importTokens.length, 'token')} from ${file.name}`,
          detail: isPartial
            ? [
              skipped.length > 0 ? `${pluralize(skipped.length, 'theme entry')} skipped because it was not a static token value` : null,
              errors.length > 0 ? `${pluralize(errors.length, 'parser issue')} found while reading the config` : null,
            ].filter(Boolean).join('; ')
            : 'The Tailwind theme values are ready to import.',
          nextAction: isPartial
            ? 'Review the skipped entries before importing. Retry only re-sends tokens that parsed successfully.'
            : 'Choose the destination collection, then continue to preview or import.',
          tokenCount: importTokens.length,
          skippedCount: skipped.length,
          issues: errors.map(message => ({ message, severity: 'warning' as const })),
          skippedEntries: skipped,
          supportedFormats: getSupportedFormatsForSource('tailwind'),
          parserLimits: getParserLimitsForSource('tailwind'),
        });
      } catch (err) {
        const detail = getErrorMessage(err);
        setError(null);
        updateFileImportValidation({
          fileName: file.name,
          source: 'tailwind',
          status: 'error',
          summary: `Could not import ${file.name}`,
          detail: `Could not parse Tailwind config: ${detail}`,
          nextAction: 'Check the Tailwind config syntax and retry.',
          tokenCount: 0,
          skippedCount: 0,
          issues: [{ message: detail, severity: 'error' }],
          skippedEntries: [],
          supportedFormats: getSupportedFormatsForSource('tailwind'),
          parserLimits: getParserLimitsForSource('tailwind'),
        });
      }
    };
    reader.onerror = () => {
      const detail = 'Failed to read file. The file may be corrupt or inaccessible.';
      setError(null);
      updateFileImportValidation({
        fileName: file.name,
        source: 'tailwind',
        status: 'error',
        summary: `Could not open ${file.name}`,
        detail,
        nextAction: 'Confirm the file is accessible, then retry the import.',
        tokenCount: 0,
        skippedCount: 0,
        issues: [{ message: detail, severity: 'error' }],
        skippedEntries: [],
        supportedFormats: getSupportedFormatsForSource('tailwind'),
        parserLimits: getParserLimitsForSource('tailwind'),
      });
    };
    reader.readAsText(file);
  }, [onResetExistingPathsCache, updateFileImportValidation]);

  const processTokensStudioFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        processTokensStudioContent(reader.result as string, {
          collectionName: file.name.replace(/\.json$/i, '') || 'Token Sets',
          fileName: file.name,
        });
      } catch (err) {
        const detail = getErrorMessage(err);
        setError(null);
        updateFileImportValidation({
          fileName: file.name,
          source: 'tokens-studio',
          status: 'error',
          summary: `Could not import ${file.name}`,
          detail: `Failed to process Tokens Studio file: ${detail}`,
          nextAction: 'Check that the export is valid Tokens Studio JSON, then retry.',
          tokenCount: 0,
          skippedCount: 0,
          issues: [{ message: detail, severity: 'error' }],
          skippedEntries: [],
          supportedFormats: getSupportedFormatsForSource('tokens-studio'),
          parserLimits: getParserLimitsForSource('tokens-studio'),
        });
      }
    };
    reader.onerror = () => {
      const detail = 'Failed to read file. The file may be corrupt or inaccessible.';
      setError(null);
      updateFileImportValidation({
        fileName: file.name,
        source: 'tokens-studio',
        status: 'error',
        summary: `Could not open ${file.name}`,
        detail,
        nextAction: 'Confirm the file is accessible, then retry the import.',
        tokenCount: 0,
        skippedCount: 0,
        issues: [{ message: detail, severity: 'error' }],
        skippedEntries: [],
        supportedFormats: getSupportedFormatsForSource('tokens-studio'),
        parserLimits: getParserLimitsForSource('tokens-studio'),
      });
    };
    reader.readAsText(file);
  }, [processTokensStudioContent, updateFileImportValidation]);

  const handleReadJson = useCallback(() => { fileInputRef.current?.click(); }, []);
  const handleReadCSS = useCallback(() => { cssFileInputRef.current?.click(); }, []);
  const handleReadTailwind = useCallback(() => { tailwindFileInputRef.current?.click(); }, []);
  const handleReadTokensStudio = useCallback(() => { tokensStudioFileInputRef.current?.click(); }, []);

  const handleBrowseFile = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleUnifiedFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const name = file.name.toLowerCase();
    if (name.endsWith('.css')) { processCSSFile(file); return; }
    if (/\.(js|ts|mjs|cjs)$/.test(name)) { processTailwindFile(file); return; }
    processJsonFile(file);
  }, [processCSSFile, processTailwindFile, processJsonFile]);

  const handleJsonFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    processJsonFile(file);
  }, [processJsonFile]);

  const handleCSSFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    processCSSFile(file);
  }, [processCSSFile]);

  const handleTailwindFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    processTailwindFile(file);
  }, [processTailwindFile]);

  const handleTokensStudioFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    processTokensStudioFile(file);
  }, [processTokensStudioFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const jsonFile = files.find(f => f.name.endsWith('.json') || f.type === 'application/json');
    if (jsonFile) { processJsonFile(jsonFile); return; }
    const cssFile = files.find(f => f.name.endsWith('.css') || f.type === 'text/css');
    if (cssFile) { processCSSFile(cssFile); return; }
    const twFile = files.find(f => /\.(js|ts|mjs|cjs)$/.test(f.name));
    if (twFile) { processTailwindFile(twFile); return; }
    const firstFileName = files[0]?.name ?? 'Dropped file';
    setError(null);
    updateFileImportValidation({
      fileName: firstFileName,
      source: null,
      status: 'unsupported',
      summary: `Unsupported file: ${firstFileName}`,
      detail: `Use ${formatSupportedFileFormats(getAllSupportedFileFormats())}.`,
      nextAction: 'Drop a supported file or choose a source family to open the matching picker.',
      tokenCount: 0,
      skippedCount: 0,
      issues: files.length > 1
        ? [{ message: `Received ${files.length} files but none matched a supported import format.`, severity: 'error' }]
        : [{ message: `${firstFileName} does not match a supported import format.`, severity: 'error' }],
      skippedEntries: [],
      supportedFormats: getSupportedFormatsForSource(null),
      parserLimits: getParserLimitsForSource(null),
    });
  }, [processJsonFile, processCSSFile, processTailwindFile, updateFileImportValidation]);

  const handleBack = useCallback(() => {
    if (workflowStage === 'preview') {
      resetLoadedImportState();
      setError(null);
      onClearConflictState();
      setWorkflowStage('home');
      return;
    }
    resetImportFlow();
  }, [onClearConflictState, resetImportFlow, resetLoadedImportState, workflowStage]);

  const toggleToken = useCallback((path: string) => {
    onClearConflictState();
    setSelectedTokens(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, [onClearConflictState]);

  const toggleAll = useCallback(() => {
    onClearConflictState();
    setSelectedTokens(prev =>
      prev.size === tokens.length ? new Set() : new Set(tokens.map(t => t.path))
    );
  }, [onClearConflictState, tokens]);

  const resetAfterImport = useCallback(() => {
    resetLoadedImportState();
    setSourceFamily(null);
    setWorkflowStage('home');
  }, [resetLoadedImportState]);

  return {
    source,
    setSource,
    sourceFamily,
    setSourceFamily,
    workflowStage,
    setWorkflowStage,
    loading,
    setLoading,
    error,
    setError,
    tokens,
    setTokens,
    selectedTokens,
    setSelectedTokens,
    typeFilter,
    setTypeFilter,
    collectionData,
    setCollectionData,
    modeCollectionNames,
    setModeCollectionNames,
    modeEnabled,
    setModeEnabled,
    skippedEntries,
    skippedExpanded,
    setSkippedExpanded,
    fileImportValidation,
    isDragging,
    fileInputRef,
    cssFileInputRef,
    tailwindFileInputRef,
    tokensStudioFileInputRef,
    handleReadVariables,
    handleReadStyles,
    handleReadJson,
    handleReadCSS,
    handleReadTailwind,
    handleReadTokensStudio,
    handleBrowseFile,
    handleUnifiedFileChange,
    handleJsonFileChange,
    handleCSSFileChange,
    handleTailwindFileChange,
    handleTokensStudioFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleBack,
    continueToPreview,
    selectSourceFamily,
    toggleToken,
    toggleAll,
    resetAfterImport,
    resetImportFlow,
    clearFileImportValidation,
  };
}
