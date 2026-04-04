import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';
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
  markDuplicatePaths,
  defaultSetName,
  modeKey,
  validateDTCGStructure,
  slugify,
} from './importPanelTypes';

export interface ImportPanelProps {
  serverUrl: string;
  connected: boolean;
  onImported: () => void;
  onImportComplete: (targetSet: string) => void;
}

export interface ImportPanelContextValue {
  // Props
  serverUrl: string;
  connected: boolean;

  // Variables state
  collectionData: CollectionData[];
  modeSetNames: Record<string, string>;
  modeEnabled: Record<string, boolean>;
  setModeSetNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setModeEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  // Flat list state
  tokens: ImportToken[];
  selectedTokens: Set<string>;
  typeFilter: string | null;
  setTypeFilter: React.Dispatch<React.SetStateAction<string | null>>;

  // Shared state
  loading: boolean;
  importing: boolean;
  error: string | null;
  source: 'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null;

  // Sets state
  targetSet: string;
  sets: string[];
  setsError: string | null;
  newSetInputVisible: boolean;
  newSetDraft: string;
  newSetError: string | null;
  setNewSetInputVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setNewSetDraft: React.Dispatch<React.SetStateAction<string>>;
  setNewSetError: React.Dispatch<React.SetStateAction<string | null>>;

  // Success / results state
  successMessage: string | null;
  failedImportPaths: string[];
  failedImportBatches: { setName: string; tokens: Record<string, unknown>[] }[];
  failedImportStrategy: 'overwrite' | 'skip' | 'merge';
  succeededImportCount: number;
  retrying: boolean;
  copyFeedback: boolean;
  lastImport: { entries: { setName: string; paths: string[] }[] } | null;
  undoing: boolean;

  // Conflict state
  conflictPaths: string[] | null;
  conflictExistingValues: Map<string, { $type: string; $value: unknown }> | null;
  conflictDecisions: Map<string, 'accept' | 'merge' | 'reject'>;
  conflictSearch: string;
  conflictStatusFilter: 'all' | 'accept' | 'merge' | 'reject';
  conflictTypeFilter: string;
  checkingConflicts: boolean;
  setConflictSearch: React.Dispatch<React.SetStateAction<string>>;
  setConflictStatusFilter: React.Dispatch<React.SetStateAction<'all' | 'accept' | 'merge' | 'reject'>>;
  setConflictTypeFilter: React.Dispatch<React.SetStateAction<string>>;
  setConflictDecisions: React.Dispatch<React.SetStateAction<Map<string, 'accept' | 'merge' | 'reject'>>>;

  // Progress state
  importProgress: { done: number; total: number } | null;

  // Skipped entries
  skippedEntries: SkippedEntry[];
  skippedExpanded: boolean;
  setSkippedExpanded: React.Dispatch<React.SetStateAction<boolean>>;

  // Drag
  isDragging: boolean;

  // Existing tokens cache
  existingTokenMap: Map<string, { $type: string; $value: unknown }> | null;
  existingPathsFetching: boolean;
  existingTokenMapError: string | null;

  // Variables conflict preview
  varConflictPreview: { newCount: number; overwriteCount: number } | null;
  varConflictDetails: { path: string; setName: string; existing: { $type: string; $value: unknown }; incoming: ImportToken }[] | null;
  varConflictDetailsExpanded: boolean;
  setVarConflictDetailsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  checkingVarConflicts: boolean;

  // Derived values
  totalEnabledSets: number;
  totalEnabledTokens: number;
  previewNewCount: number | null;
  previewOverwriteCount: number | null;

  // File input refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cssFileInputRef: React.RefObject<HTMLInputElement | null>;
  tailwindFileInputRef: React.RefObject<HTMLInputElement | null>;
  tokensStudioFileInputRef: React.RefObject<HTMLInputElement | null>;

  // Callbacks
  clearConflictState: () => void;
  handleReadVariables: () => void;
  handleReadStyles: () => void;
  handleReadJson: () => void;
  handleReadCSS: () => void;
  handleReadTailwind: () => void;
  handleReadTokensStudio: () => void;
  handleJsonFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCSSFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTailwindFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTokensStudioFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleBack: () => void;
  handleImportVariables: (strategy?: 'overwrite' | 'skip' | 'merge') => Promise<void>;
  handleImportStyles: () => Promise<void>;
  executeImport: (strategy: 'skip' | 'overwrite', excludePaths?: Set<string>, mergePaths?: Set<string>) => Promise<void>;
  handleUndoImport: () => Promise<void>;
  handleRetryFailed: () => Promise<void>;
  handleCopyFailedPaths: () => void;
  toggleToken: (path: string) => void;
  toggleAll: () => void;
  commitNewSet: () => void;
  cancelNewSet: () => void;
  setTargetSetAndPersist: (name: string) => void;
  fetchSets: () => Promise<void>;
  clearSuccessState: () => void;
}

const ImportPanelContext = createContext<ImportPanelContextValue | null>(null);

export function useImportPanel(): ImportPanelContextValue {
  const ctx = useContext(ImportPanelContext);
  if (!ctx) throw new Error('useImportPanel must be used within ImportPanelProvider');
  return ctx;
}

export function ImportPanelProvider({
  serverUrl,
  connected,
  onImported,
  onImportComplete,
  children,
}: ImportPanelProps & { children: React.ReactNode }) {
  // Variables import state
  const [collectionData, setCollectionData] = useState<CollectionData[]>([]);
  const [modeSetNames, setModeSetNames] = useState<Record<string, string>>({});
  const [modeEnabled, setModeEnabled] = useState<Record<string, boolean>>({});

  // Styles import state
  const [tokens, setTokens] = useState<ImportToken[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSet, setTargetSet] = useState(() => lsGet(STORAGE_KEYS.IMPORT_TARGET_SET, 'imported'));
  const [sets, setSets] = useState<string[]>([]);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [source, setSource] = useState<'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio' | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cssFileInputRef = useRef<HTMLInputElement | null>(null);
  const tailwindFileInputRef = useRef<HTMLInputElement | null>(null);
  const tokensStudioFileInputRef = useRef<HTMLInputElement | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [failedImportPaths, setFailedImportPaths] = useState<string[]>([]);
  const [failedImportBatches, setFailedImportBatches] = useState<{ setName: string; tokens: Record<string, unknown>[] }[]>([]);
  const [failedImportStrategy, setFailedImportStrategy] = useState<'overwrite' | 'skip' | 'merge'>('overwrite');
  const [succeededImportCount, setSucceededImportCount] = useState<number>(0);
  const [retrying, setRetrying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [conflictPaths, setConflictPaths] = useState<string[] | null>(null);
  const [conflictExistingValues, setConflictExistingValues] = useState<Map<string, { $type: string; $value: unknown }> | null>(null);
  const [conflictDecisions, setConflictDecisions] = useState<Map<string, 'accept' | 'merge' | 'reject'>>(new Map());
  const [conflictSearch, setConflictSearch] = useState('');
  const [conflictStatusFilter, setConflictStatusFilter] = useState<'all' | 'accept' | 'merge' | 'reject'>('all');
  const [conflictTypeFilter, setConflictTypeFilter] = useState<string>('all');
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [newSetInputVisible, setNewSetInputVisible] = useState(false);
  const [newSetDraft, setNewSetDraft] = useState('');
  const [newSetError, setNewSetError] = useState<string | null>(null);
  const [skippedEntries, setSkippedEntries] = useState<SkippedEntry[]>([]);
  const [skippedExpanded, setSkippedExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const readTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSourceRef = useRef<'variables' | 'styles' | null>(null);
  const correlationIdRef = useRef<string | null>(null);
  const targetSetRef = useRef(targetSet);
  const [existingTokenMap, setExistingTokenMap] = useState<Map<string, { $type: string; $value: unknown }> | null>(null);
  const [existingPathsFetching, setExistingTokenMapFetching] = useState(false);
  const [existingTokenMapError, setExistingTokenMapError] = useState<string | null>(null);
  const existingPathsCacheRef = useRef<{ set: string; tokens: Map<string, { $type: string; $value: unknown }> } | null>(null);

  // Variables conflict preview state
  const [varConflictPreview, setVarConflictPreview] = useState<{ newCount: number; overwriteCount: number } | null>(null);
  const [varConflictDetails, setVarConflictDetails] = useState<{ path: string; setName: string; existing: { $type: string; $value: unknown }; incoming: ImportToken }[] | null>(null);
  const [varConflictDetailsExpanded, setVarConflictDetailsExpanded] = useState(false);
  const [checkingVarConflicts, setCheckingVarConflicts] = useState(false);
  const varConflictFetchIdRef = useRef(0);

  // Rollback state
  const [lastImport, setLastImport] = useState<{ entries: { setName: string; paths: string[] }[] } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const clearConflictState = useCallback(() => {
    setConflictPaths(null);
    setConflictExistingValues(null);
    setConflictDecisions(new Map());
    setConflictSearch('');
    setConflictStatusFilter('all');
    setConflictTypeFilter('all');
  }, []);

  const clearSuccessState = useCallback(() => {
    setSuccessMessage(null);
    setFailedImportPaths([]);
    setFailedImportBatches([]);
    setSucceededImportCount(0);
    setLastImport(null);
  }, []);

  // Pre-fetch existing tokens for the target set
  const prefetchExistingPaths = useCallback((setName: string) => {
    if (existingPathsCacheRef.current?.set === setName) {
      setExistingTokenMap(existingPathsCacheRef.current.tokens);
      setExistingTokenMapError(null);
      return;
    }
    setExistingTokenMapFetching(true);
    setExistingTokenMapError(null);
    apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`)
      .then(data => {
        const flat = flattenTokenGroup(data.tokens ?? {});
        const map = new Map<string, { $type: string; $value: unknown }>();
        for (const [path, tok] of flat) {
          map.set(path, { $type: (tok as any).$type ?? 'unknown', $value: (tok as any).$value });
        }
        return map;
      })
      .then(toks => {
        existingPathsCacheRef.current = { set: setName, tokens: toks };
        setExistingTokenMap(toks);
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 404) {
          // New/non-existent set — treat as empty, not an error
          const empty = new Map<string, { $type: string; $value: unknown }>();
          existingPathsCacheRef.current = { set: setName, tokens: empty };
          setExistingTokenMap(empty);
          setExistingTokenMapError(null);
        } else {
          setExistingTokenMap(null);
          setExistingTokenMapError(err instanceof Error ? err.message : 'Failed to load existing tokens');
        }
      })
      .finally(() => setExistingTokenMapFetching(false));
  }, [serverUrl]);

  // Fetch available sets
  const fetchSets = useCallback(async () => {
    if (!connected) return;
    setSetsError(null);
    try {
      const data = await apiFetch<{ sets?: string[] }>(`${serverUrl}/api/sets`);
      const fetchedSets: string[] = data.sets || [];
      setSets(fetchedSets);
      setTargetSet(prev => {
        if (fetchedSets.includes(prev)) return prev;
        return fetchedSets[0] ?? prev;
      });
    } catch (err) {
      setSetsError(err instanceof Error ? err.message : 'Failed to load sets');
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  // Pre-fetch existing paths when tokens first load
  useEffect(() => {
    if (tokens.length > 0) {
      prefetchExistingPaths(targetSetRef.current);
    }
  }, [tokens, prefetchExistingPaths]);

  // Re-run preview when target set changes while tokens are loaded
  useEffect(() => {
    targetSetRef.current = targetSet;
    clearConflictState();
    if (tokens.length > 0) {
      existingPathsCacheRef.current = null;
      prefetchExistingPaths(targetSet);
    }
  }, [targetSet, tokens.length, prefetchExistingPaths, clearConflictState]);

  // Pre-fetch conflict counts and per-token details for Variables import preview
  useEffect(() => {
    if (collectionData.length === 0) {
      setVarConflictPreview(null);
      setVarConflictDetails(null);
      setVarConflictDetailsExpanded(false);
      return;
    }
    const allModes = collectionData.flatMap(col =>
      col.modes
        .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
        .map(m => ({
          mode: m,
          setName: modeSetNames[modeKey(col.name, m.modeId)] || defaultSetName(col.name, m.modeName, col.modes.length),
        }))
    );
    if (allModes.length === 0) {
      setVarConflictPreview({ newCount: 0, overwriteCount: 0 });
      setVarConflictDetails([]);
      return;
    }
    const setsToCheck = allModes.filter(({ setName }) => sets.includes(setName));
    if (setsToCheck.length === 0) {
      const totalTokens = allModes.reduce((acc, { mode }) => acc + mode.tokens.length, 0);
      setVarConflictPreview({ newCount: totalTokens, overwriteCount: 0 });
      setVarConflictDetails([]);
      return;
    }
    const fetchId = ++varConflictFetchIdRef.current;
    setCheckingVarConflicts(true);
    (async () => {
      try {
        let overwriteCount = 0;
        const details: { path: string; setName: string; existing: { $type: string; $value: unknown }; incoming: ImportToken }[] = [];
        for (const { mode, setName } of setsToCheck) {
          if (fetchId !== varConflictFetchIdRef.current) return;
          const data = await apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`);
          if (fetchId !== varConflictFetchIdRef.current) return;
          const flat = flattenTokenGroup(data.tokens ?? {});
          for (const t of mode.tokens) {
            if (flat.has(t.path)) {
              const ex = flat.get(t.path);
              details.push({
                path: t.path,
                setName,
                existing: { $type: (ex as any)?.$type ?? 'unknown', $value: (ex as any)?.$value },
                incoming: t,
              });
              overwriteCount++;
            }
          }
        }
        if (fetchId !== varConflictFetchIdRef.current) return;
        const totalTokens = allModes.reduce((acc, { mode }) => acc + mode.tokens.length, 0);
        setVarConflictPreview({ newCount: totalTokens - overwriteCount, overwriteCount });
        setVarConflictDetails(details);
      } catch {
        if (fetchId === varConflictFetchIdRef.current) {
          setVarConflictPreview(null);
          setVarConflictDetails(null);
        }
      } finally {
        if (fetchId === varConflictFetchIdRef.current) setCheckingVarConflicts(false);
      }
    })();
  }, [collectionData, modeEnabled, modeSetNames, sets, serverUrl]);

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
        setLoading(false);
        existingPathsCacheRef.current = null;
        setExistingTokenMap(null);
      }
    };

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    };
  }, []);

  const startReadTimeout = () => {
    if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
    const timedOutSource = pendingSourceRef.current;
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
  };

  const handleReadVariables = useCallback(() => {
    pendingSourceRef.current = 'variables';
    const cid = `import-${Date.now()}-${Math.random()}`;
    correlationIdRef.current = cid;
    setSource('variables');
    setLoading(true);
    setCollectionData([]);
    setTokens([]);
    setError(null);
    setSuccessMessage(null);
    startReadTimeout();
    parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
  }, []);

  const handleReadStyles = useCallback(() => {
    pendingSourceRef.current = 'styles';
    const cid = `import-${Date.now()}-${Math.random()}`;
    correlationIdRef.current = cid;
    setSource('styles');
    setLoading(true);
    setTokens([]);
    setError(null);
    setSuccessMessage(null);
    startReadTimeout();
    parent.postMessage({ pluginMessage: { type: 'read-styles', correlationId: cid } }, '*');
  }, []);

  const handleReadJson = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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

        const flat = flattenTokenGroup(group);
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
        setSuccessMessage(null);
        setCollectionData([]);
        existingPathsCacheRef.current = null;
        setExistingTokenMap(null);
      } catch (err) {
        setError(`Failed to process token file: ${getErrorMessage(err)}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. The file may be corrupt or inaccessible.');
    };
    reader.readAsText(file);
  }, []);

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
        setSuccessMessage(null);
        setCollectionData([]);
        existingPathsCacheRef.current = null;
        setExistingTokenMap(null);
      } catch (err) {
        setError(`Could not parse CSS file: ${getErrorMessage(err)}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. The file may be corrupt or inaccessible.');
    };
    reader.readAsText(file);
  }, []);

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
        setSuccessMessage(null);
        setCollectionData([]);
        existingPathsCacheRef.current = null;
        setExistingTokenMap(null);
      } catch (err) {
        setError(`Could not parse Tailwind config: ${getErrorMessage(err)}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file. The file may be corrupt or inaccessible.');
    };
    reader.readAsText(file);
  }, []);

  const processTokensStudioContent = useCallback((raw: string, collectionName = 'Token Sets') => {
    const { sets: parsedSets, errors } = parseTokensStudioFile(raw);
    if (parsedSets.size === 0) {
      setError(errors.length > 0 ? errors.join('; ') : 'No tokens found in Tokens Studio file.');
      return;
    }
    setError(null);
    setSuccessMessage(null);
    existingPathsCacheRef.current = null;
    setExistingTokenMap(null);
    setCollectionData([]);

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
  }, []);

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
    setError('Please drop a .json (DTCG or Tokens Studio), .css, or .js/.ts file.');
  }, [processJsonFile, processCSSFile, processTailwindFile]);

  const handleBack = useCallback(() => {
    setCollectionData([]);
    setTokens([]);
    setSource(null);
    setTypeFilter(null);
    setSkippedEntries([]);
    setSkippedExpanded(false);
    clearConflictState();
    setExistingTokenMap(null);
  }, [clearConflictState]);

  // ── Variables import ──────────────────────────────────────────────────────

  const handleImportVariables = useCallback(async (strategy: 'overwrite' | 'skip' | 'merge' = 'overwrite') => {
    setImporting(true);
    setError(null);
    setFailedImportPaths([]);
    setFailedImportBatches([]);
    setFailedImportStrategy(strategy);
    let importedSets = 0;
    let importedTokens = 0;
    const failedPaths: string[] = [];
    const failedBatches: { setName: string; tokens: Record<string, unknown>[] }[] = [];
    const rollbackEntries: { setName: string; paths: string[] }[] = [];
    try {
      const allModes = collectionData.flatMap(col =>
        col.modes
          .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
          .map(m => ({ col, mode: m, setName: modeSetNames[modeKey(col.name, m.modeId)] || defaultSetName(col.name, m.modeName, col.modes.length) }))
      );
      setImportProgress({ done: 0, total: allModes.length });

      for (const { mode, setName } of allModes) {
        try {
          await apiFetch(`${serverUrl}/api/sets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: setName }),
          });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) {
            throw new Error(`Failed to create set "${setName}": ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }

        try {
          const { imported } = await apiFetch<{ imported: number; skipped: number }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tokens: mode.tokens.map(t => {
                  const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
                  if (t.$description) tok.$description = t.$description;
                  if (t.$scopes && t.$scopes.length > 0) tok.$scopes = t.$scopes;
                  const srcTag = source === 'tokens-studio' ? 'tokens-studio' : 'figma-variables';
                  tok.$extensions = { ...(t.$extensions ?? {}), tokenmanager: { ...(t.$extensions?.tokenmanager ?? {}), source: srcTag } };
                  return tok;
                }),
                strategy,
              }),
            },
          );
          importedTokens += imported;
          if (imported > 0) {
            rollbackEntries.push({ setName, paths: mode.tokens.map(t => t.path) });
          }
        } catch (err) {
          console.warn('[ImportPanel] failed to import token batch:', err);
          const batchTokens = mode.tokens.map(t => {
            const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
            if (t.$description) tok.$description = t.$description;
            if (t.$scopes && t.$scopes.length > 0) tok.$scopes = t.$scopes;
            const srcTag = source === 'tokens-studio' ? 'tokens-studio' : 'figma-variables';
            tok.$extensions = { ...(t.$extensions ?? {}), tokenmanager: { ...(t.$extensions?.tokenmanager ?? {}), source: srcTag } };
            return tok;
          });
          for (const t of mode.tokens) failedPaths.push(t.path);
          failedBatches.push({ setName, tokens: batchTokens });
        }
        importedSets++;
        setImportProgress({ done: importedSets, total: allModes.length });
      }

      const failedCount = failedPaths.length;
      const notifyMsg = failedCount > 0
        ? `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''} (${failedCount} failed)`
        : `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
      parent.postMessage({ pluginMessage: { type: 'notify', message: notifyMsg } }, '*');
      onImported();
      const firstSet = allModes[0]?.setName ?? '';
      if (firstSet) onImportComplete(firstSet);
      setCollectionData([]);
      setSource(null);
      if (failedCount > 0) { setFailedImportPaths(failedPaths); setFailedImportBatches(failedBatches); setSucceededImportCount(importedTokens); }
      if (rollbackEntries.length > 0) setLastImport({ entries: rollbackEntries });
      const successMsg = failedCount > 0
        ? `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''} — ${failedCount} token${failedCount !== 1 ? 's' : ''} could not be saved`
        : `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
      setSuccessMessage(successMsg);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }, [collectionData, modeEnabled, modeSetNames, serverUrl, source, onImported, onImportComplete]);

  // ── Styles import ─────────────────────────────────────────────────────────

  const toggleToken = useCallback((path: string) => {
    clearConflictState();
    setSelectedTokens(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, [clearConflictState]);

  const toggleAll = useCallback(() => {
    clearConflictState();
    setSelectedTokens(prev =>
      prev.size === tokens.length ? new Set() : new Set(tokens.map(t => t.path))
    );
  }, [clearConflictState, tokens]);

  const commitNewSet = useCallback(() => {
    const name = newSetDraft.trim();
    if (!name) { setNewSetError('Name cannot be empty'); return; }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name)) {
      setNewSetError('Use letters, numbers, - and _ (/ for folders)');
      return;
    }
    setNewSetError(null);
    setTargetSet(name);
    lsSet(STORAGE_KEYS.IMPORT_TARGET_SET, name);
    clearConflictState();
    setNewSetInputVisible(false);
    setNewSetDraft('');
  }, [newSetDraft, clearConflictState]);

  const cancelNewSet = useCallback(() => {
    setNewSetInputVisible(false);
    setNewSetDraft('');
    setNewSetError(null);
  }, []);

  const setTargetSetAndPersist = useCallback((name: string) => {
    setTargetSet(name);
    lsSet(STORAGE_KEYS.IMPORT_TARGET_SET, name);
  }, []);

  const executeImport = useCallback(async (strategy: 'skip' | 'overwrite', excludePaths?: Set<string>, mergePaths?: Set<string>) => {
    setImporting(true);
    clearConflictState();
    setError(null);

    try {
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path) && !excludePaths?.has(t.path));
      setImportProgress({ done: 0, total: tokensToImport.length });

      try {
        await apiFetch(`${serverUrl}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: targetSet }),
        });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) {
          throw new Error(`Failed to create set "${targetSet}": ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      const buildTok = (t: ImportToken) => {
        const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
        if (source) tok.$extensions = { tokenmanager: { source: source === 'variables' ? 'figma-variables' : source === 'styles' ? 'figma-styles' : source } };
        return tok;
      };

      const mergeTokens = mergePaths ? tokensToImport.filter(t => mergePaths.has(t.path)) : [];
      const overwriteTokens = mergePaths ? tokensToImport.filter(t => !mergePaths.has(t.path)) : tokensToImport;

      let imported = 0;

      if (overwriteTokens.length > 0) {
        const result = await apiFetch<{ imported: number; skipped: number }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: overwriteTokens.map(buildTok), strategy }),
          },
        );
        imported += result.imported;
      }

      if (mergeTokens.length > 0) {
        const result = await apiFetch<{ imported: number; skipped: number }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens: mergeTokens.map(buildTok), strategy: 'merge' }),
          },
        );
        imported += result.imported;
      }

      setImportProgress({ done: tokensToImport.length, total: tokensToImport.length });

      parent.postMessage({ pluginMessage: { type: 'notify', message: `Imported ${imported} tokens to "${targetSet}"` } }, '*');
      onImported();
      onImportComplete(targetSet);
      existingPathsCacheRef.current = null;
      setExistingTokenMap(null);
      if (imported > 0) {
        setLastImport({ entries: [{ setName: targetSet, paths: tokensToImport.map(t => t.path) }] });
      }
      setTokens([]);
      setSource(null);
      setSuccessMessage(`Imported ${imported} token${imported !== 1 ? 's' : ''} to "${targetSet}"`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }, [tokens, selectedTokens, serverUrl, targetSet, source, clearConflictState, onImported, onImportComplete]);

  const handleUndoImport = useCallback(async () => {
    if (!lastImport || undoing) return;
    setUndoing(true);
    setError(null);
    try {
      for (const entry of lastImport.entries) {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(entry.setName)}/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: entry.paths, force: true }),
        });
      }
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Import undone' } }, '*');
      onImported();
      setLastImport(null);
      setSuccessMessage(null);
      setFailedImportPaths([]);
      setFailedImportBatches([]);
      setSucceededImportCount(0);
    } catch (err) {
      setError(`Undo failed: ${getErrorMessage(err)}`);
    } finally {
      setUndoing(false);
    }
  }, [lastImport, undoing, serverUrl, onImported]);

  const handleRetryFailed = useCallback(async () => {
    if (failedImportBatches.length === 0 || retrying) return;
    setRetrying(true);
    setError(null);
    const stillFailed: string[] = [];
    const stillFailedBatches: { setName: string; tokens: Record<string, unknown>[] }[] = [];
    let retried = 0;
    try {
      for (const batch of failedImportBatches) {
        try {
          const { imported } = await apiFetch<{ imported: number; skipped: number }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(batch.setName)}/batch`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens: batch.tokens, strategy: failedImportStrategy }),
            },
          );
          retried += imported;
        } catch (err) {
          console.warn('[ImportPanel] retry failed for batch:', batch.setName, err);
          for (const t of batch.tokens) stillFailed.push(t.path as string);
          stillFailedBatches.push(batch);
        }
      }
      if (stillFailed.length === 0) {
        setFailedImportPaths([]);
        setFailedImportBatches([]);
        setSucceededImportCount(prev => prev + retried);
        setSuccessMessage(prev => prev ? `${prev} (${retried} recovered on retry)` : `Recovered ${retried} token${retried !== 1 ? 's' : ''} on retry`);
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Retried: ${retried} tokens imported` } }, '*');
      } else {
        setFailedImportPaths(stillFailed);
        setFailedImportBatches(stillFailedBatches);
        setSucceededImportCount(prev => prev + retried);
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Retry: ${retried} recovered, ${stillFailed.length} still failed` } }, '*');
      }
      onImported();
    } catch (err) {
      setError(`Retry failed: ${getErrorMessage(err)}`);
    } finally {
      setRetrying(false);
    }
  }, [failedImportBatches, retrying, serverUrl, failedImportStrategy, onImported]);

  const handleCopyFailedPaths = useCallback(() => {
    if (failedImportPaths.length === 0) return;
    navigator.clipboard.writeText(failedImportPaths.join('\n')).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = failedImportPaths.join('\n');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, [failedImportPaths]);

  const handleImportStyles = useCallback(async () => {
    if (!connected || selectedTokens.size === 0) return;
    setError(null);
    setSuccessMessage(null);
    setCheckingConflicts(true);
    const checkingForSet = targetSet;

    try {
      let flat = new Map<string, unknown>();
      try {
        const data = await apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(checkingForSet)}`);
        flat = flattenTokenGroup(data.tokens || {});
      } catch (fetchErr) {
        if (!(fetchErr instanceof ApiError && fetchErr.status === 404)) {
          throw fetchErr;
        }
        // 404 = new/non-existent set — treat as empty, no conflicts
      }
      const existingKeys = new Set(flat.keys());
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));
      const conflicts = tokensToImport.filter(t => existingKeys.has(t.path)).map(t => t.path);
      if (conflicts.length > 0) {
        if (checkingForSet === targetSetRef.current) {
          setConflictPaths(conflicts);
          const existingVals = new Map<string, { $type: string; $value: unknown }>();
          for (const p of conflicts) {
            const tok = flat.get(p);
            if (tok) existingVals.set(p, { $type: (tok as any).$type ?? 'unknown', $value: (tok as any).$value });
          }
          setConflictExistingValues(existingVals);
          const decisions = new Map<string, 'accept' | 'reject'>();
          for (const p of conflicts) decisions.set(p, 'accept');
          setConflictDecisions(decisions as Map<string, 'accept' | 'merge' | 'reject'>);
        }
        return;
      }
      await executeImport('overwrite');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCheckingConflicts(false);
    }
  }, [connected, selectedTokens, targetSet, serverUrl, tokens, executeImport]);

  // ── Derived values ────────────────────────────────────────────────────────

  const { totalEnabledSets, totalEnabledTokens } = useMemo(() => {
    const enabledModes = collectionData.flatMap(col =>
      col.modes.filter(m => modeEnabled[modeKey(col.name, m.modeId)])
    );
    const sets = enabledModes.length;
    const toks = collectionData.reduce((acc, col) =>
      acc + col.modes
        .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
        .reduce((a, m) => a + m.tokens.length, 0), 0);
    return { totalEnabledSets: sets, totalEnabledTokens: toks };
  }, [collectionData, modeEnabled]);

  const previewNewCount = existingTokenMap !== null
    ? [...selectedTokens].filter(p => !existingTokenMap.has(p)).length
    : null;
  const previewOverwriteCount = existingTokenMap !== null
    ? [...selectedTokens].filter(p => existingTokenMap.has(p)).length
    : null;

  const value = useMemo<ImportPanelContextValue>(() => ({
    serverUrl,
    connected,
    collectionData,
    modeSetNames,
    modeEnabled,
    setModeSetNames,
    setModeEnabled,
    tokens,
    selectedTokens,
    typeFilter,
    setTypeFilter,
    loading,
    importing,
    error,
    source,
    targetSet,
    sets,
    setsError,
    newSetInputVisible,
    newSetDraft,
    newSetError,
    setNewSetInputVisible,
    setNewSetDraft,
    setNewSetError,
    successMessage,
    failedImportPaths,
    failedImportBatches,
    failedImportStrategy,
    succeededImportCount,
    retrying,
    copyFeedback,
    lastImport,
    undoing,
    conflictPaths,
    conflictExistingValues,
    conflictDecisions,
    conflictSearch,
    conflictStatusFilter,
    conflictTypeFilter,
    checkingConflicts,
    setConflictSearch,
    setConflictStatusFilter,
    setConflictTypeFilter,
    setConflictDecisions,
    importProgress,
    skippedEntries,
    skippedExpanded,
    setSkippedExpanded,
    isDragging,
    existingTokenMap,
    existingPathsFetching,
    existingTokenMapError,
    varConflictPreview,
    varConflictDetails,
    varConflictDetailsExpanded,
    setVarConflictDetailsExpanded,
    checkingVarConflicts,
    totalEnabledSets,
    totalEnabledTokens,
    previewNewCount,
    previewOverwriteCount,
    fileInputRef,
    cssFileInputRef,
    tailwindFileInputRef,
    tokensStudioFileInputRef,
    clearConflictState,
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
    handleImportVariables,
    handleImportStyles,
    executeImport,
    handleUndoImport,
    handleRetryFailed,
    handleCopyFailedPaths,
    toggleToken,
    toggleAll,
    commitNewSet,
    cancelNewSet,
    setTargetSetAndPersist,
    fetchSets,
    clearSuccessState,
  }), [
    serverUrl, connected, collectionData, modeSetNames, modeEnabled,
    tokens, selectedTokens, typeFilter, loading, importing, error, source,
    targetSet, sets, setsError, newSetInputVisible, newSetDraft, newSetError,
    successMessage, failedImportPaths, failedImportBatches, failedImportStrategy,
    succeededImportCount, retrying, copyFeedback, lastImport, undoing,
    conflictPaths, conflictExistingValues, conflictDecisions, conflictSearch,
    conflictStatusFilter, conflictTypeFilter, checkingConflicts, importProgress,
    skippedEntries, skippedExpanded, isDragging, existingTokenMap,
    existingPathsFetching, existingTokenMapError, varConflictPreview,
    varConflictDetails, varConflictDetailsExpanded,
    checkingVarConflicts, totalEnabledSets, totalEnabledTokens,
    previewNewCount, previewOverwriteCount,
    clearConflictState, handleReadVariables, handleReadStyles, handleReadJson,
    handleReadCSS, handleReadTailwind, handleReadTokensStudio, handleJsonFileChange,
    handleCSSFileChange, handleTailwindFileChange, handleTokensStudioFileChange,
    handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handleBack,
    handleImportVariables, handleImportStyles, executeImport, handleUndoImport,
    handleRetryFailed, handleCopyFailedPaths, toggleToken, toggleAll,
    commitNewSet, cancelNewSet, setTargetSetAndPersist, fetchSets, clearSuccessState,
  ]);

  return (
    <ImportPanelContext.Provider value={value}>
      {children}
    </ImportPanelContext.Provider>
  );
}
