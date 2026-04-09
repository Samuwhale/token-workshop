import { useState, useCallback, useRef, useEffect } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { getErrorMessage } from '../shared/utils';
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
  type SourceFamily,
  type ImportWorkflowStage,
  markDuplicatePaths,
  defaultSetName,
  modeKey,
  validateDTCGStructure,
  formatSupportedFileFormats,
  getAllSupportedFileFormats,
} from '../components/importPanelTypes';

export interface UseImportSourceParams {
  onClearConflictState: () => void;
  onResetExistingPathsCache: () => void;
}

export function useImportSource({ onClearConflictState, onResetExistingPathsCache }: UseImportSourceParams) {
  const [source, setSource] = useState<'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null>(null);
  const [sourceFamily, setSourceFamily] = useState<SourceFamily | null>(null);
  const [workflowStage, setWorkflowStage] = useState<ImportWorkflowStage>('family');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ImportToken[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [collectionData, setCollectionData] = useState<CollectionData[]>([]);
  const [modeSetNames, setModeSetNames] = useState<Record<string, string>>({});
  const [modeEnabled, setModeEnabled] = useState<Record<string, boolean>>({});
  const [skippedEntries, setSkippedEntries] = useState<SkippedEntry[]>([]);
  const [skippedExpanded, setSkippedExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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
    setWorkflowStage('family');
    setError(null);
    onClearConflictState();
  }, [onClearConflictState, resetLoadedImportState]);

  const selectSourceFamily = useCallback((family: SourceFamily) => {
    onClearConflictState();
    if (sourceFamily !== family || source !== null || tokens.length > 0 || collectionData.length > 0) {
      resetLoadedImportState();
    }
    setError(null);
    setSourceFamily(family);
    setWorkflowStage('format');
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
      const msg = event.data?.pluginMessage;
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
            names[key] = defaultSetName(col.name, mode.modeName, col.modes.length);
            enabled[key] = true;
          }
        }
        setModeSetNames(names);
        setModeEnabled(enabled);
        setSourceFamily('figma');
        setWorkflowStage('destination');
        setLoading(false);
      }
      if (msg.type === 'styles-read-error' && pendingSourceRef.current === 'styles' && msg.correlationId === correlationIdRef.current) {
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        pendingSourceRef.current = null;
        correlationIdRef.current = null;
        setLoading(false);
        setError(`Figma Styles API error: ${msg.error ?? 'Unknown error'}`);
      }
      if (msg.type === 'styles-read' && msg.correlationId != null && msg.correlationId === correlationIdRef.current) {
        pendingSourceRef.current = null;
        correlationIdRef.current = null;
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        const markedTokens = markDuplicatePaths(msg.tokens || []);
        setTokens(markedTokens);
        setSelectedTokens(new Set((msg.tokens || []).map((t: ImportToken) => t.path)));
        setTypeFilter(null);
        setSourceFamily('figma');
        setWorkflowStage('destination');
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
    pendingSourceRef.current = 'variables';
    const cid = `import-${Date.now()}-${Math.random()}`;
    correlationIdRef.current = cid;
    setSourceFamily('figma');
    setSource('variables');
    setLoading(true);
    setCollectionData([]);
    setTokens([]);
    setError(null);
    startReadTimeout('variables');
    parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
  }, [startReadTimeout]);

  const handleReadStyles = useCallback(() => {
    pendingSourceRef.current = 'styles';
    const cid = `import-${Date.now()}-${Math.random()}`;
    correlationIdRef.current = cid;
    setSourceFamily('figma');
    setSource('styles');
    setLoading(true);
    setTokens([]);
    setError(null);
    startReadTimeout('styles');
    parent.postMessage({ pluginMessage: { type: 'read-styles', correlationId: cid } }, '*');
  }, [startReadTimeout]);

  const processTokensStudioContent = useCallback((raw: string, collectionName = 'Token Sets') => {
    const { sets: parsedSets, errors } = parseTokensStudioFile(raw);
    if (parsedSets.size === 0) {
      setError(errors.length > 0 ? errors.join('; ') : 'No tokens found in Tokens Studio file.');
      return;
    }
    setError(null);
    onResetExistingPathsCache();
    setCollectionData([]);
    setSourceFamily('migration');
    setWorkflowStage('destination');

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
      for (const [setName, setTokenList] of parsedSets) {
        const importTokens: ImportToken[] = setTokenList.map(t => ({ path: t.path, $type: t.$type, $value: t.$value }));
        modes.push({ modeId: setName, modeName: setName, tokens: importTokens });
        const key = modeKey(collectionName, setName);
        names[key] = setName;
        enabled[key] = true;
      }
      setSource('tokens-studio');
      setCollectionData([{ name: collectionName, modes }]);
      setModeSetNames(names);
      setModeEnabled(enabled);
    }
  }, [onResetExistingPathsCache]);

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
          setError(`Invalid JSON: ${detail}`);
          return;
        }

        if (json === null || typeof json !== 'object' || Array.isArray(json)) {
          const actual = json === null ? 'null' : Array.isArray(json) ? 'an array' : `a ${typeof json}`;
          setError(`Invalid token file: expected a JSON object but got ${actual}. DTCG token files must be a JSON object with nested groups or tokens containing $type and $value fields.`);
          return;
        }

        const root = json as Record<string, unknown>;

        if (isTokensStudioFormat(root)) {
          processTokensStudioContent(raw, file.name.replace(/\.json$/i, '') || 'Token Sets');
          return;
        }

        const group = (root.tokens ?? root) as Record<string, unknown>;

        const validationError = validateDTCGStructure(group);
        if (validationError) {
          setError(validationError);
          return;
        }

        const flat = flattenTokenGroup(group as import('@tokenmanager/core').DTCGGroup);
        const importTokens: ImportToken[] = [];
        for (const [path, token] of flat) {
          importTokens.push({ path, $type: token.$type ?? 'unknown', $value: token.$value });
        }
        if (importTokens.length === 0) {
          setError('No tokens found in file. The file appears to be valid JSON but contains no DTCG tokens (objects with $value fields).');
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
        setWorkflowStage('destination');
        onResetExistingPathsCache();
      } catch (err) {
        setError(`Failed to process token file: ${getErrorMessage(err)}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. The file may be corrupt or inaccessible.');
    };
    reader.readAsText(file);
  }, [processTokensStudioContent, onResetExistingPathsCache]);

  const processCSSFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = reader.result as string;
        const { tokens: parsed, errors, skipped } = parseCSSCustomProperties(raw);
        if (parsed.length === 0 && skipped.length === 0) {
          setError(errors.length > 0 ? errors.join('; ') : 'No CSS custom properties found in file.');
          return;
        }
        if (parsed.length === 0) {
          setError(`All ${skipped.length} CSS custom propert${skipped.length === 1 ? 'y' : 'ies'} contained dynamic expressions and were skipped. Only static values can be imported.`);
          setSkippedEntries(skipped);
          setSkippedExpanded(true);
          return;
        }
        const importTokens: ImportToken[] = parsed.map(t => ({ path: t.path, $type: t.$type, $value: t.$value }));
        const markedImportTokens = markDuplicatePaths(importTokens);
        setSource('css');
        setTokens(markedImportTokens);
        setSelectedTokens(new Set(importTokens.map(t => t.path)));
        setTypeFilter(null);
        setSkippedEntries(skipped);
        setSkippedExpanded(false);
        setError(null);
        setCollectionData([]);
        setSourceFamily('code');
        setWorkflowStage('destination');
        onResetExistingPathsCache();
      } catch (err) {
        setError(`Could not parse CSS file: ${getErrorMessage(err)}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. The file may be corrupt or inaccessible.');
    };
    reader.readAsText(file);
  }, [onResetExistingPathsCache]);

  const processTailwindFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = reader.result as string;
        const { tokens: parsed, errors, skipped } = parseTailwindConfigFile(raw);
        if (parsed.length === 0) {
          setError(errors.length > 0 ? errors.join('; ') : 'No theme values found in file. Expected a Tailwind config with a theme object containing static values.');
          if (skipped.length > 0) {
            setSkippedEntries(skipped);
            setSkippedExpanded(true);
          }
          return;
        }
        const importTokens: ImportToken[] = parsed.map(t => ({ path: t.path, $type: t.$type, $value: t.$value }));
        const markedImportTokens = markDuplicatePaths(importTokens);
        setSource('tailwind');
        setTokens(markedImportTokens);
        setSelectedTokens(new Set(importTokens.map(t => t.path)));
        setTypeFilter(null);
        setSkippedEntries(skipped);
        setSkippedExpanded(false);
        setError(null);
        setCollectionData([]);
        setSourceFamily('code');
        setWorkflowStage('destination');
        onResetExistingPathsCache();
      } catch (err) {
        setError(`Could not parse Tailwind config: ${getErrorMessage(err)}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. The file may be corrupt or inaccessible.');
    };
    reader.readAsText(file);
  }, [onResetExistingPathsCache]);

  const processTokensStudioFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        processTokensStudioContent(reader.result as string, file.name.replace(/\.json$/i, '') || 'Token Sets');
      } catch (err) {
        setError(`Failed to process Tokens Studio file: ${getErrorMessage(err)}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. The file may be corrupt or inaccessible.');
    };
    reader.readAsText(file);
  }, [processTokensStudioContent]);

  const handleReadJson = useCallback(() => { fileInputRef.current?.click(); }, []);
  const handleReadCSS = useCallback(() => { cssFileInputRef.current?.click(); }, []);
  const handleReadTailwind = useCallback(() => { tailwindFileInputRef.current?.click(); }, []);
  const handleReadTokensStudio = useCallback(() => { tokensStudioFileInputRef.current?.click(); }, []);

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
    setError(`Please drop one supported file: ${formatSupportedFileFormats(getAllSupportedFileFormats())}.`);
  }, [processJsonFile, processCSSFile, processTailwindFile]);

  const handleBack = useCallback(() => {
    if (workflowStage === 'preview') {
      onClearConflictState();
      setWorkflowStage('destination');
      return;
    }
    if (workflowStage === 'destination') {
      resetLoadedImportState();
      setError(null);
      onClearConflictState();
      setWorkflowStage(sourceFamily ? 'format' : 'family');
      return;
    }
    if (workflowStage === 'format') {
      resetLoadedImportState();
      setSourceFamily(null);
      setError(null);
      onClearConflictState();
      setWorkflowStage('family');
      return;
    }
    resetImportFlow();
  }, [onClearConflictState, resetImportFlow, resetLoadedImportState, sourceFamily, workflowStage]);

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
    setWorkflowStage('family');
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
    modeSetNames,
    setModeSetNames,
    modeEnabled,
    setModeEnabled,
    skippedEntries,
    skippedExpanded,
    setSkippedExpanded,
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
  };
}
