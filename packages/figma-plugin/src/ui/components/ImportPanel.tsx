import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

interface ImportPanelProps {
  serverUrl: string;
  connected: boolean;
  onImported: () => void;
  onImportComplete: (targetSet: string) => void;
}

interface ImportToken {
  path: string;
  $type: string;
  $value: any;
  collection?: string;
  _warning?: string;
}

interface ModeData {
  modeId: string;
  modeName: string;
  tokens: ImportToken[];
}

interface CollectionData {
  name: string;
  modes: ModeData[];
}

function slugify(str: string) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9/_-]/g, '');
}

function markDuplicatePaths(importTokens: ImportToken[]): ImportToken[] {
  const pathCounts = new Map<string, number>();
  for (const t of importTokens) pathCounts.set(t.path, (pathCounts.get(t.path) ?? 0) + 1);
  return importTokens.map(t => {
    if ((pathCounts.get(t.path) ?? 1) <= 1) return t;
    return { ...t, _warning: `Path conflict: multiple tokens share "${t.path}" — only the last will be saved` };
  });
}

function defaultSetName(collectionName: string, modeName: string, totalModes: number) {
  const base = slugify(collectionName);
  if (totalModes <= 1) return base;
  return `${base}/${slugify(modeName)}`;
}

function modeKey(collectionName: string, modeId: string) {
  return `${collectionName}|${modeId}`;
}

export function ImportPanel({ serverUrl, connected, onImported, onImportComplete }: ImportPanelProps) {
  // Variables import state
  const [collectionData, setCollectionData] = useState<CollectionData[]>([]);
  const [modeSetNames, setModeSetNames] = useState<Record<string, string>>({});
  const [modeEnabled, setModeEnabled] = useState<Record<string, boolean>>({});

  // Styles import state (unchanged flat list)
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
  const [source, setSource] = useState<'variables' | 'styles' | 'json' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [failedImportPaths, setFailedImportPaths] = useState<string[]>([]);
  const [succeededImportCount, setSucceededImportCount] = useState<number>(0);
  const [conflictPaths, setConflictPaths] = useState<string[] | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [newSetInputVisible, setNewSetInputVisible] = useState(false);
  const [newSetDraft, setNewSetDraft] = useState('');
  const [newSetError, setNewSetError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const readTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSourceRef = useRef<'variables' | 'styles' | null>(null);
  const correlationIdRef = useRef<string | null>(null);
  const targetSetRef = useRef(targetSet);
  const [existingPaths, setExistingPaths] = useState<Set<string> | null>(null);
  const [existingPathsFetching, setExistingPathsFetching] = useState(false);
  const existingPathsCacheRef = useRef<{ set: string; paths: Set<string> } | null>(null);

  // Rollback state: tracks the last import so it can be undone
  const [lastImport, setLastImport] = useState<{ entries: { setName: string; paths: string[] }[] } | null>(null);
  const [undoing, setUndoing] = useState(false);

  // Pre-fetch existing token paths for the target set to show new vs. overwrite preview
  const prefetchExistingPaths = useCallback((setName: string) => {
    if (existingPathsCacheRef.current?.set === setName) {
      setExistingPaths(existingPathsCacheRef.current.paths);
      return;
    }
    setExistingPathsFetching(true);
    fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`)
      .then(res => {
        if (!res.ok) return new Set<string>();
        return res.json().then((data: { tokens?: Record<string, unknown> }) =>
          new Set<string>(flattenTokenGroup(data.tokens ?? {}).keys())
        );
      })
      .then(paths => {
        existingPathsCacheRef.current = { set: setName, paths };
        setExistingPaths(paths);
      })
      .catch(() => setExistingPaths(null))
      .finally(() => setExistingPathsFetching(false));
  }, [serverUrl]);

  // Fetch available sets
  const fetchSets = async () => {
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
  };
  useEffect(() => {
    fetchSets();
  }, [serverUrl, connected]);

  // Pre-fetch existing paths when tokens first load (styles / JSON)
  useEffect(() => {
    if (tokens.length > 0) {
      prefetchExistingPaths(targetSetRef.current);
    }
  }, [tokens, prefetchExistingPaths]);

  // Re-run preview when target set changes while tokens are loaded
  useEffect(() => {
    targetSetRef.current = targetSet;
    setConflictPaths(null);
    if (tokens.length > 0) {
      existingPathsCacheRef.current = null;
      prefetchExistingPaths(targetSet);
    }
  }, [targetSet, tokens.length, prefetchExistingPaths]);

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
        setError(`Figma Variables API error: ${msg.message}. The Variables API requires a Figma Professional plan or above.`);
      }
      if (msg.type === 'variables-read' && pendingSourceRef.current === 'variables' && msg.correlationId === correlationIdRef.current) {
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        pendingSourceRef.current = null;
        correlationIdRef.current = null;
        const cols: CollectionData[] = msg.collections || [];
        setCollectionData(cols);
        // Build default set names and enabled map
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
        setExistingPaths(null);
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

  const handleReadVariables = () => {
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
  };

  const handleReadStyles = () => {
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
  };

  const handleReadJson = () => {
    fileInputRef.current?.click();
  };

  const processJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const group = json.tokens ?? json;
        const flat = flattenTokenGroup(group);
        const importTokens: ImportToken[] = [];
        for (const [path, token] of flat) {
          importTokens.push({ path, $type: token.$type ?? 'unknown', $value: token.$value });
        }
        if (importTokens.length === 0) {
          setError('No tokens found in file. Make sure it is a valid DTCG JSON file.');
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
        setExistingPaths(null);
      } catch (err) {
        const detail = err instanceof SyntaxError ? err.message : String(err);
        setError(`Could not parse JSON file: ${detail}`);
      }
    };
    reader.readAsText(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.json') || f.type === 'application/json');
    if (!file) {
      setError('Please drop a .json file.');
      return;
    }
    processJsonFile(file);
  };

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so same file can be re-selected
    e.target.value = '';
    processJsonFile(file);
  };

  const handleBack = () => {
    setCollectionData([]);
    setTokens([]);
    setSource(null);
    setTypeFilter(null);
    setConflictPaths(null);
    setExistingPaths(null);
  };

  // ── Variables import (multi-set) ──────────────────────────────────────────

  const enabledModes = collectionData.flatMap(col =>
    col.modes.filter(m => modeEnabled[modeKey(col.name, m.modeId)])
  );
  const totalEnabledSets = enabledModes.length;
  const totalEnabledTokens = collectionData.reduce((acc, col) =>
    acc + col.modes
      .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
      .reduce((a, m) => a + m.tokens.length, 0), 0);

  // Preview counts for styles/JSON import
  const previewNewCount = existingPaths !== null
    ? [...selectedTokens].filter(p => !existingPaths.has(p)).length
    : null;
  const previewOverwriteCount = existingPaths !== null
    ? [...selectedTokens].filter(p => existingPaths.has(p)).length
    : null;

  const handleImportVariables = async () => {
    setImporting(true);
    setError(null);
    setFailedImportPaths([]);
    let importedSets = 0;
    let importedTokens = 0;
    const failedPaths: string[] = [];
    const rollbackEntries: { setName: string; paths: string[] }[] = [];
    try {
      const allModes = collectionData.flatMap(col =>
        col.modes
          .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
          .map(m => ({ col, mode: m, setName: modeSetNames[modeKey(col.name, m.modeId)] || defaultSetName(col.name, m.modeName, col.modes.length) }))
      );
      setImportProgress({ done: 0, total: allModes.length });

      for (const { mode, setName } of allModes) {
        // Ensure set exists (409 = already exists, which is fine)
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

        // Import tokens via batch endpoint
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
                  return tok;
                }),
                strategy: 'overwrite',
              }),
            },
          );
          importedTokens += imported;
          if (imported > 0) {
            rollbackEntries.push({ setName, paths: mode.tokens.map(t => t.path) });
          }
        } catch {
          for (const t of mode.tokens) failedPaths.push(t.path);
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
      if (failedCount > 0) { setFailedImportPaths(failedPaths); setSucceededImportCount(importedTokens); }
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
  };

  // ── Styles import (flat list, unchanged) ─────────────────────────────────

  const toggleToken = (path: string) => {
    setConflictPaths(null);
    setSelectedTokens(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    setConflictPaths(null);
    if (selectedTokens.size === tokens.length) setSelectedTokens(new Set());
    else setSelectedTokens(new Set(tokens.map(t => t.path)));
  };

  const commitNewSet = () => {
    const name = newSetDraft.trim();
    if (!name) { setNewSetError('Name cannot be empty'); return; }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name)) {
      setNewSetError('Use letters, numbers, - and _ (/ for folders)');
      return;
    }
    setNewSetError(null);
    setTargetSet(name);
    lsSet(STORAGE_KEYS.IMPORT_TARGET_SET, name);
    setConflictPaths(null);
    setNewSetInputVisible(false);
    setNewSetDraft('');
  };

  const cancelNewSet = () => {
    setNewSetInputVisible(false);
    setNewSetDraft('');
    setNewSetError(null);
  };

  const executeImport = async (strategy: 'skip' | 'overwrite') => {
    setImporting(true);
    setConflictPaths(null);
    setError(null);

    try {
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));
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

      const { imported } = await apiFetch<{ imported: number; skipped: number }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: tokensToImport.map(t => {
              const tok: Record<string, unknown> = { path: t.path, $type: t.$type, $value: t.$value };
              if (t._warning) tok.$description = t._warning;
              return tok;
            }),
            strategy,
          }),
        },
      );
      setImportProgress({ done: tokensToImport.length, total: tokensToImport.length });

      parent.postMessage({ pluginMessage: { type: 'notify', message: `Imported ${imported} tokens to "${targetSet}"` } }, '*');
      onImported();
      onImportComplete(targetSet);
      existingPathsCacheRef.current = null;
      setExistingPaths(null);
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
  };

  const handleUndoImport = async () => {
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
      setSucceededImportCount(0);
    } catch (err) {
      setError(`Undo failed: ${getErrorMessage(err)}`);
    } finally {
      setUndoing(false);
    }
  };

  const handleImportStyles = async () => {
    if (!connected || selectedTokens.size === 0) return;
    setError(null);
    setSuccessMessage(null);
    setCheckingConflicts(true);
    const checkingForSet = targetSet;

    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(checkingForSet)}`);
      if (res.ok) {
        const data = await res.json();
        const existing = new Set(flattenTokenGroup(data.tokens || {}).keys());
        const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));
        const conflicts = tokensToImport.filter(t => existing.has(t.path)).map(t => t.path);
        if (conflicts.length > 0) {
          // Discard results if the user changed the target set while the fetch was in flight
          if (checkingForSet === targetSetRef.current) {
            setConflictPaths(conflicts);
          }
          return;
        }
      }
      await executeImport('overwrite');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCheckingConflicts(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to import tokens
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded bg-[var(--color-figma-accent)]/10 border-2 border-dashed border-[var(--color-figma-accent)] pointer-events-none">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <div className="text-[11px] font-medium text-[var(--color-figma-accent)]">Drop JSON file to import</div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
            {error}
          </div>
        )}

        {/* Source selection */}
        {collectionData.length === 0 && tokens.length === 0 && !loading && !successMessage && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1">
              Import Source
            </div>
            <button
              onClick={handleReadVariables}
              title="Reads variables from the currently open Figma file"
              className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="w-8 h-8 rounded bg-[var(--color-figma-accent)]/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Figma Variables</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Read variables from this file and map to token sets</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[1px]" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Requires a <strong className="font-medium text-[var(--color-figma-text)]">Figma Professional</strong> plan (or above) and at least one local variable collection defined in this file.</span>
            </div>
            <button
              onClick={handleReadStyles}
              title="Reads styles from the currently open Figma file"
              className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="w-8 h-8 rounded bg-[#9b59b6]/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9b59b6" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Figma Styles</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Read paint, text, and effect styles from this file</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
            <button
              onClick={handleReadJson}
              className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="w-8 h-8 rounded bg-[#27ae60]/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#27ae60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from JSON file</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Load a DTCG-format .json token file — or drag &amp; drop</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleJsonFileChange}
            />
          </div>
        )}

        {/* Success state */}
        {collectionData.length === 0 && tokens.length === 0 && !loading && successMessage && (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="var(--color-figma-success)" strokeWidth="1.5" />
              <path d="M6 10l3 3 5-5" stroke="var(--color-figma-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div role="status" aria-live="polite" className="text-[11px] text-[var(--color-figma-success)] font-medium text-center">{successMessage}</div>
            {failedImportPaths.length > 0 && (
              <div className="w-full mt-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] p-2">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-[10px] text-[var(--color-figma-success)] font-medium">
                    ✓ {succeededImportCount} succeeded
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-error)] font-medium">
                    ✗ {failedImportPaths.length} failed
                  </span>
                </div>
                <ul className="text-[10px] text-[var(--color-figma-text-secondary)] space-y-0.5">
                  {failedImportPaths.slice(0, 5).map(p => (
                    <li key={p} className="font-mono truncate" title={p}>{p}</li>
                  ))}
                  {failedImportPaths.length > 5 && (
                    <li className="italic">…and {failedImportPaths.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1">
              {lastImport && (
                <button
                  onClick={handleUndoImport}
                  disabled={undoing}
                  className="text-[10px] text-[var(--color-figma-error)] hover:underline disabled:opacity-50"
                >
                  {undoing ? 'Undoing…' : 'Undo import'}
                </button>
              )}
              <button
                onClick={() => { setSuccessMessage(null); setFailedImportPaths([]); setSucceededImportCount(0); setLastImport(null); }}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
              >
                Import more
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-[var(--color-figma-text-secondary)] text-[11px]">
            <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" />
            </svg>
            {source === 'variables' ? 'Reading variables from Figma…' : 'Reading styles from Figma…'}
          </div>
        )}

        {/* Variables: collection/mode mapping UI */}
        {collectionData.length > 0 && !loading && (
          <>
            {/* Header row */}
            <div className="flex items-center gap-2 pb-1 border-b border-[var(--color-figma-border)]">
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 5l3 3" />
                </svg>
                Back
              </button>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto">
                Figma Variables
              </span>
            </div>

            <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
              Map to Token Sets
            </div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] -mt-2">
              Each enabled mode will be imported as a separate token set.
            </div>

            {collectionData.map(col => (
              <div key={col.name} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                {/* Collection header */}
                <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wide flex-1 truncate">
                    {col.name}
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {col.modes.reduce((a, m) => a + m.tokens.length, 0)} tokens
                  </span>
                </div>

                {/* Mode rows */}
                <div className="divide-y divide-[var(--color-figma-border)]">
                  {col.modes.map(mode => {
                    const key = modeKey(col.name, mode.modeId);
                    const enabled = modeEnabled[key] ?? true;
                    const setName = modeSetNames[key] ?? defaultSetName(col.name, mode.modeName, col.modes.length);
                    return (
                      <div key={mode.modeId} className={`flex items-center gap-2 px-3 py-2 transition-colors ${enabled ? 'bg-[var(--color-figma-accent)]/5' : 'bg-transparent opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={e => setModeEnabled(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="accent-[var(--color-figma-accent)] shrink-0"
                        />
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-medium ${enabled ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)] line-through'}`}>{mode.modeName}</span>
                            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                              {mode.tokens.length} token{mode.tokens.length !== 1 ? 's' : ''}
                            </span>
                            {enabled && (sets.includes(setName) ? (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-warning,#f59e0b)]/10 text-[var(--color-figma-warning,#e8a100)] font-medium">existing</span>
                            ) : setName ? (
                              <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-success,#22c55e)]/10 text-[var(--color-figma-success,#16a34a)] font-medium">new</span>
                            ) : null)}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                            <span className="shrink-0">→</span>
                            <input
                              type="text"
                              value={setName}
                              disabled={!enabled}
                              onChange={e => setModeSetNames(prev => ({ ...prev, [key]: e.target.value }))}
                              className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] disabled:opacity-50 font-mono"
                              placeholder="set-name"
                              aria-label="Set name for mode"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Styles: flat token list */}
        {tokens.length > 0 && !loading && (
          <>
            {/* Back row */}
            <div className="flex items-center gap-2 pb-1 border-b border-[var(--color-figma-border)]">
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 5l3 3" />
                </svg>
                Back
              </button>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto">
                {source === 'json' ? 'JSON File' : 'Figma Styles'}
              </span>
            </div>

            {/* Preview header */}
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                Preview ({selectedTokens.size}/{tokens.length} selected)
              </div>
              <button
                onClick={toggleAll}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
              >
                {selectedTokens.size === tokens.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {/* Type filter pills */}
            {(() => {
              const types = [...new Set(tokens.map(t => t.$type))].sort();
              if (types.length <= 1) return null;
              return (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setTypeFilter(null)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                      typeFilter === null
                        ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
                        : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'
                    }`}
                  >
                    All
                  </button>
                  {types.map(type => {
                    const count = tokens.filter(t => t.$type === type).length;
                    return (
                      <button
                        key={type}
                        onClick={() => setTypeFilter(prev => prev === type ? null : type)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          typeFilter === type
                            ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
                            : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'
                        }`}
                      >
                        {type} <span className="opacity-60">{count}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Path conflict warning banner */}
            {tokens.some(t => t._warning?.startsWith('Path conflict')) && (
              <div className="px-3 py-2 rounded bg-[var(--color-figma-warning,#f59e0b)]/10 border border-[var(--color-figma-warning,#e8a100)]/30 text-[10px] text-[var(--color-figma-warning,#e8a100)]">
                ⚠ Some tokens share the same path after normalization. Conflicting tokens are highlighted below — only the last one with each path will be saved.
              </div>
            )}

            {/* Token list */}
            {(() => {
              const filtered = typeFilter ? tokens.filter(t => t.$type === typeFilter) : tokens;
              const tokensByPath = new Map(tokens.map(t => [t.path, t]));
              const resolveAlias = (value: any, depth = 0): string | null => {
                if (depth > 10 || typeof value !== 'string') return null;
                const match = value.match(/^\{(.+)\}$/);
                if (!match) return null;
                const target = tokensByPath.get(match[1]);
                if (!target) return match[1];
                if (typeof target.$value === 'string' && /^\{.+\}$/.test(target.$value)) {
                  return resolveAlias(target.$value, depth + 1) ?? String(target.$value);
                }
                return String(target.$value);
              };

              const renderRow = (token: ImportToken, index: number) => {
                const isAlias = typeof token.$value === 'string' && /^\{.+\}$/.test(token.$value);
                const aliasTarget = isAlias ? (token.$value as string).slice(1, -1) : null;
                const resolvedValue = isAlias ? resolveAlias(token.$value) : null;
                const tooltipText = isAlias
                  ? resolvedValue && resolvedValue !== aliasTarget
                    ? `→ ${aliasTarget}\nResolved: ${resolvedValue}`
                    : `→ ${aliasTarget}`
                  : undefined;

                return (
                  <label
                    key={index}
                    title={tooltipText}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                      selectedTokens.has(token.path) ? 'bg-[var(--color-figma-accent)]/5' : 'hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTokens.has(token.path)}
                      onChange={() => toggleToken(token.path)}
                      className="accent-[var(--color-figma-accent)]"
                    />
                    {token.$type === 'color' && typeof token.$value === 'string' && !isAlias && (
                      <div
                        className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                        style={{ backgroundColor: token.$value }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[var(--color-figma-text)] truncate">{token.path}</div>
                      {isAlias && (
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
                          → <span className="font-mono">{aliasTarget}</span>
                        </div>
                      )}
                      {token._warning && (
                        <div className="text-[10px] text-[var(--color-figma-warning,#e8a100)] truncate" title={token._warning}>
                          ⚠ {token._warning}
                        </div>
                      )}
                    </div>
                    <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[token.$type ?? ''] ?? 'token-type-string'}`}>
                      {token.$type}
                    </span>
                  </label>
                );
              };

              return (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                  {filtered.map(renderRow)}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Footer: variables import button */}
      {collectionData.length > 0 && !loading && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">
          <button
            onClick={handleImportVariables}
            disabled={totalEnabledSets === 0 || importing}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {importing
              ? importProgress
                ? `Importing set ${importProgress.done}/${importProgress.total}…`
                : 'Importing…'
              : `Import ${totalEnabledTokens} token${totalEnabledTokens !== 1 ? 's' : ''} into ${totalEnabledSets} set${totalEnabledSets !== 1 ? 's' : ''}`}
          </button>
          {importing && importProgress && importProgress.total > 0 && (
            <div className="w-full h-1.5 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all duration-300"
                style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Footer: styles import */}
      {tokens.length > 0 && !loading && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">

          {/* Target set row */}
          {newSetInputVisible ? (
            <div className="flex flex-col gap-1">
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={newSetDraft}
                  onChange={e => { setNewSetDraft(e.target.value); setNewSetError(null); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitNewSet();
                    if (e.key === 'Escape') cancelNewSet();
                  }}
                  placeholder="New set name…"
                  className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-[11px] outline-none"
                />
                <button
                  onClick={commitNewSet}
                  className="px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:opacity-90"
                >
                  Create
                </button>
                <button
                  onClick={cancelNewSet}
                  className="px-2 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Cancel
                </button>
              </div>
              {newSetError && <p className="text-[10px] text-[var(--color-figma-text-danger)]">{newSetError}</p>}
              {!newSetError && newSetDraft.trim() && sets.includes(newSetDraft.trim()) && (
                <p className="text-[10px] text-[var(--color-figma-warning,#e8a100)]">Set already exists — tokens will be merged in</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">To</label>
                <select
                  value={sets.includes(targetSet) ? targetSet : targetSet}
                  onChange={e => {
                    setConflictPaths(null);
                    if (e.target.value === '__new__') {
                      setNewSetInputVisible(true);
                    } else {
                      setTargetSet(e.target.value);
                      lsSet(STORAGE_KEYS.IMPORT_TARGET_SET, e.target.value);
                    }
                  }}
                  className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none"
                >
                  {sets.map(s => <option key={s} value={s}>{s}</option>)}
                  {!sets.includes(targetSet) && targetSet && (
                    <option value={targetSet}>{targetSet} (new)</option>
                  )}
                  <option value="__new__">+ New set…</option>
                </select>
              </div>
              {setsError ? (
                <p className="text-[10px] text-[var(--color-figma-text-danger,#e53935)] pl-[26px]">
                  Could not load sets.{' '}
                  <button type="button" onClick={fetchSets} className="underline hover:opacity-80">Retry</button>
                </p>
              ) : (
                <p className="text-[10px] text-[var(--color-figma-text-tertiary)] pl-[26px]">Pick an existing set or choose <button type="button" onClick={() => setNewSetInputVisible(true)} className="underline hover:text-[var(--color-figma-text-secondary)]">+ New set…</button> to create one</p>
              )}
            </div>
          )}

          {/* Import preview summary */}
          {tokens.length > 0 && (existingPathsFetching || previewNewCount !== null) && (
            <div className="flex items-center gap-2 text-[10px] py-0.5">
              {existingPathsFetching ? (
                <span className="text-[var(--color-figma-text-secondary)]">Checking existing tokens…</span>
              ) : previewNewCount !== null && previewOverwriteCount !== null && (
                <>
                  {previewNewCount > 0 && (
                    <span className="flex items-center gap-1 text-[var(--color-figma-success,#16a34a)]">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M4 1v6M1 4h6" />
                      </svg>
                      {previewNewCount} new
                    </span>
                  )}
                  {previewNewCount > 0 && previewOverwriteCount > 0 && (
                    <span className="text-[var(--color-figma-border)]">·</span>
                  )}
                  {previewOverwriteCount > 0 && (
                    <span className="flex items-center gap-1 text-[var(--color-figma-warning,#e8a100)]">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M4 1v4M4 6.5v.5" />
                      </svg>
                      {previewOverwriteCount} will overwrite
                    </span>
                  )}
                  {previewNewCount === 0 && previewOverwriteCount === 0 && (
                    <span className="text-[var(--color-figma-text-secondary)]">No tokens selected</span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Action row */}
          {conflictPaths !== null && conflictPaths.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {(() => {
                const newCount = selectedTokens.size - conflictPaths.length;
                return (
                  <div className="text-[10px] text-[var(--color-figma-text)]">
                    <span className="font-medium">{conflictPaths.length} conflict{conflictPaths.length !== 1 ? 's' : ''}</span>
                    {newCount > 0 && <span className="text-[var(--color-figma-text-secondary)]">, {newCount} new</span>}
                    {' '}— how should conflicts be handled?
                  </div>
                );
              })()}
              <div className="max-h-[72px] overflow-y-auto rounded border border-[var(--color-figma-warning,#f59e0b)]/30 bg-[var(--color-figma-warning,#f59e0b)]/5 divide-y divide-[var(--color-figma-border)]">
                {conflictPaths.map(path => (
                  <div key={path} className="px-2 py-1 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                    {path}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => executeImport('skip')}
                  disabled={importing}
                  className="flex-1 px-2 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                >
                  {importing
                    ? importProgress
                      ? `Importing ${importProgress.done}/${importProgress.total}…`
                      : 'Importing…'
                    : 'Skip & import new'}
                </button>
                <button
                  onClick={() => executeImport('overwrite')}
                  disabled={importing}
                  className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {importing
                    ? importProgress
                      ? `Importing ${importProgress.done}/${importProgress.total}…`
                      : 'Importing…'
                    : 'Overwrite & import all'}
                </button>
              </div>
              {importing && importProgress && importProgress.total > 0 && (
                <div className="w-full h-1.5 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all duration-300"
                    style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
                  />
                </div>
              )}
              <button
                onClick={() => setConflictPaths(null)}
                disabled={importing}
                className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline disabled:opacity-40"
              >
                Revise selection
              </button>
            </div>
          ) : (
            <button
              onClick={handleImportStyles}
              disabled={selectedTokens.size === 0 || importing || checkingConflicts}
              className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
            >
              {checkingConflicts
                ? 'Checking for conflicts…'
                : importing
                  ? importProgress
                    ? `Importing ${importProgress.done}/${importProgress.total}…`
                    : 'Importing…'
                  : `Import ${selectedTokens.size} token${selectedTokens.size !== 1 ? 's' : ''} to "${targetSet}"`}
            </button>
          )}
          {importing && importProgress && importProgress.total > 0 && (
            <div className="w-full h-1.5 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all duration-300"
                style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
