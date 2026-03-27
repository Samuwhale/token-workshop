import { useState, useEffect, useRef } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
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
  const [source, setSource] = useState<'variables' | 'styles' | 'json' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [conflictPaths, setConflictPaths] = useState<string[] | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [newSetInputVisible, setNewSetInputVisible] = useState(false);
  const [newSetDraft, setNewSetDraft] = useState('');
  const readTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSourceRef = useRef<'variables' | 'styles' | null>(null);
  const correlationIdRef = useRef<string | null>(null);

  // Fetch available sets
  useEffect(() => {
    if (!connected) return;
    fetch(`${serverUrl}/api/sets`)
      .then(res => res.json())
      .then(data => {
        const fetchedSets: string[] = data.sets || [];
        setSets(fetchedSets);
        setTargetSet(prev => {
          if (fetchedSets.includes(prev)) return prev;
          return fetchedSets[0] ?? prev;
        });
      })
      .catch(() => {});
  }, [serverUrl, connected]);

  // Listen for messages from sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

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
      if (msg.type === 'styles-read' && pendingSourceRef.current === 'styles') {
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        pendingSourceRef.current = null;
        setTokens(msg.tokens || []);
        setSelectedTokens(new Set((msg.tokens || []).map((t: ImportToken) => t.path)));
        setTypeFilter(null);
        setLoading(false);
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
    readTimeoutRef.current = setTimeout(() => {
      setLoading(false);
      setError('Timed out waiting for Figma. Try again or reload the plugin.');
    }, 15000);
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
    setSource('styles');
    setLoading(true);
    setTokens([]);
    setError(null);
    setSuccessMessage(null);
    startReadTimeout();
    parent.postMessage({ pluginMessage: { type: 'read-styles' } }, '*');
  };

  const handleReadJson = () => {
    fileInputRef.current?.click();
  };

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so same file can be re-selected
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        // Support both bare token group and wrapped { tokens: ... }
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
        setSource('json');
        setTokens(importTokens);
        setSelectedTokens(new Set(importTokens.map(t => t.path)));
        setTypeFilter(null);
        setError(null);
        setSuccessMessage(null);
        setCollectionData([]);
      } catch {
        setError('Could not parse JSON file. Make sure it is valid JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleBack = () => {
    setCollectionData([]);
    setTokens([]);
    setSource(null);
    setTypeFilter(null);
    setConflictPaths(null);
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

  const handleImportVariables = async () => {
    setImporting(true);
    setError(null);
    let importedSets = 0;
    let importedTokens = 0;
    let failedTokens = 0;
    try {
      const allModes = collectionData.flatMap(col =>
        col.modes
          .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
          .map(m => ({ col, mode: m, setName: modeSetNames[modeKey(col.name, m.modeId)] || defaultSetName(col.name, m.modeName, col.modes.length) }))
      );
      setImportProgress({ done: 0, total: allModes.length });

      for (const { mode, setName } of allModes) {
        // Ensure set exists
        const setRes = await fetch(`${serverUrl}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: setName }),
        });
        if (!setRes.ok && setRes.status !== 409) {
          throw new Error(`Failed to create set "${setName}": ${setRes.statusText}`);
        }

        // Import tokens
        for (const token of mode.tokens) {
          const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${token.path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: token.$type, $value: token.$value }),
          }).catch(() => null);
          if (res && res.ok) {
            importedTokens++;
          } else {
            failedTokens++;
          }
        }
        importedSets++;
        setImportProgress({ done: importedSets, total: allModes.length });
      }

      const notifyMsg = failedTokens > 0
        ? `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''} (${failedTokens} failed)`
        : `Imported ${importedTokens} tokens across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
      parent.postMessage({ pluginMessage: { type: 'notify', message: notifyMsg } }, '*');
      onImported();
      const firstSet = allModes[0]?.setName ?? '';
      if (firstSet) onImportComplete(firstSet);
      setCollectionData([]);
      setSource(null);
      const successMsg = failedTokens > 0
        ? `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''} — ${failedTokens} token${failedTokens !== 1 ? 's' : ''} could not be saved`
        : `Imported ${importedTokens} token${importedTokens !== 1 ? 's' : ''} across ${importedSets} set${importedSets !== 1 ? 's' : ''}`;
      setSuccessMessage(successMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
    if (!name) return;
    setTargetSet(name);
    lsSet(STORAGE_KEYS.IMPORT_TARGET_SET, name);
    setConflictPaths(null);
    setNewSetInputVisible(false);
    setNewSetDraft('');
  };

  const cancelNewSet = () => {
    setNewSetInputVisible(false);
    setNewSetDraft('');
  };

  const executeImport = async (strategy: 'skip' | 'overwrite') => {
    setImporting(true);
    setConflictPaths(null);
    setError(null);

    try {
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));
      setImportProgress({ done: 0, total: tokensToImport.length });

      const setRes = await fetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: targetSet }),
      });
      if (!setRes.ok && setRes.status !== 409) {
        throw new Error(`Failed to create set "${targetSet}": ${setRes.statusText}`);
      }

      const batchRes = await fetch(`${serverUrl}/api/tokens/${targetSet}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: tokensToImport.map(t => ({ path: t.path, $type: t.$type, $value: t.$value })),
          strategy,
        }),
      });
      if (!batchRes.ok) {
        const errBody = await batchRes.json().catch(() => ({ error: batchRes.statusText }));
        throw new Error(`Import failed: ${(errBody as { error?: string }).error ?? batchRes.statusText}`);
      }
      const { imported } = await batchRes.json() as { imported: number; skipped: number };
      setImportProgress({ done: tokensToImport.length, total: tokensToImport.length });

      parent.postMessage({ pluginMessage: { type: 'notify', message: `Imported ${imported} tokens to "${targetSet}"` } }, '*');
      onImported();
      onImportComplete(targetSet);
      setTokens([]);
      setSource(null);
      setSuccessMessage(`Imported ${imported} token${imported !== 1 ? 's' : ''} to "${targetSet}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleImportStyles = async () => {
    if (!connected || selectedTokens.size === 0) return;
    setError(null);
    setSuccessMessage(null);
    setCheckingConflicts(true);

    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}`);
      if (res.ok) {
        const data = await res.json();
        const existing = new Set(flattenTokenGroup(data.tokens || {}).keys());
        const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));
        const conflicts = tokensToImport.filter(t => existing.has(t.path)).map(t => t.path);
        if (conflicts.length > 0) {
          setConflictPaths(conflicts);
          return;
        }
      }
      await executeImport('overwrite');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
    <div className="flex flex-col h-full">
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
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Read variables from this file and map to token sets</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
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
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Read paint, text, and effect styles from this file</div>
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
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Load a DTCG-format .json token file</div>
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
            <div className="text-[11px] text-[var(--color-figma-success)] font-medium text-center">{successMessage}</div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="mt-1 text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              Import more
            </button>
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
            <div className="text-[9px] text-[var(--color-figma-text-secondary)] -mt-2">
              Each enabled mode will be imported as a separate token set.
            </div>

            {collectionData.map(col => (
              <div key={col.name} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                {/* Collection header */}
                <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center gap-2">
                  <span className="text-[9px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wide flex-1 truncate">
                    {col.name}
                  </span>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
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
                      <div key={mode.modeId} className={`flex items-center gap-2 px-3 py-2 ${!enabled ? 'opacity-40' : ''}`}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={e => setModeEnabled(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="accent-[var(--color-figma-accent)] shrink-0"
                        />
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[var(--color-figma-text)] font-medium">{mode.modeName}</span>
                            <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                              {mode.tokens.length} token{mode.tokens.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-[var(--color-figma-text-secondary)]">
                            <span className="shrink-0">→</span>
                            <input
                              type="text"
                              value={setName}
                              disabled={!enabled}
                              onChange={e => setModeSetNames(prev => ({ ...prev, [key]: e.target.value }))}
                              className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[9px] outline-none focus:border-[var(--color-figma-accent)] disabled:opacity-50 font-mono"
                              placeholder="set-name"
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
                    className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-colors ${
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
                        className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-colors ${
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

              const renderRow = (token: ImportToken) => {
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
                    key={token.path}
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
                        <div className="text-[9px] text-[var(--color-figma-text-secondary)] truncate">
                          → <span className="font-mono">{aliasTarget}</span>
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
            <div className="flex gap-1.5">
              <input
                autoFocus
                type="text"
                value={newSetDraft}
                onChange={e => setNewSetDraft(e.target.value)}
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
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">To</label>
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
              <p className="text-[9px] text-[var(--color-figma-text-tertiary)] pl-[26px]">Pick an existing set or choose <button type="button" onClick={() => setNewSetInputVisible(true)} className="underline hover:text-[var(--color-figma-text-secondary)]">+ New set…</button> to create one</p>
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
                  <div key={path} className="px-2 py-1 text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate">
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
