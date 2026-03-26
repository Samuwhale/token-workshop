import { useState, useEffect, useRef } from 'react';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';

interface ImportPanelProps {
  serverUrl: string;
  connected: boolean;
  onImported: () => void;
}

interface ImportToken {
  path: string;
  $type: string;
  $value: any;
  collection?: string;
}

export function ImportPanel({ serverUrl, connected, onImported }: ImportPanelProps) {
  const [tokens, setTokens] = useState<ImportToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSet, setTargetSet] = useState(() => localStorage.getItem('importTargetSet') || 'imported');
  const [sets, setSets] = useState<string[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<'variables' | 'styles' | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [conflictPaths, setConflictPaths] = useState<string[] | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [newSetInputVisible, setNewSetInputVisible] = useState(false);
  const [newSetDraft, setNewSetDraft] = useState('');
  const readTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSourceRef = useRef<'variables' | 'styles' | null>(null);

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

      if (msg.type === 'variables-read' && pendingSourceRef.current === 'variables') {
        if (readTimeoutRef.current) clearTimeout(readTimeoutRef.current);
        pendingSourceRef.current = null;
        setTokens(msg.tokens || []);
        setSelectedTokens(new Set((msg.tokens || []).map((t: ImportToken) => t.path)));
        setTypeFilter(null);
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
    setSource('variables');
    setLoading(true);
    setTokens([]);
    setError(null);
    setSuccessMessage(null);
    startReadTimeout();
    parent.postMessage({ pluginMessage: { type: 'read-variables' } }, '*');
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

  const toggleToken = (path: string) => {
    setConflictPaths(null);
    setSelectedTokens(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setConflictPaths(null);
    if (selectedTokens.size === tokens.length) {
      setSelectedTokens(new Set());
    } else {
      setSelectedTokens(new Set(tokens.map(t => t.path)));
    }
  };

  const commitNewSet = () => {
    const name = newSetDraft.trim();
    if (!name) return;
    setTargetSet(name);
    localStorage.setItem('importTargetSet', name);
    setConflictPaths(null);
    setNewSetInputVisible(false);
    setNewSetDraft('');
  };

  const cancelNewSet = () => {
    setNewSetInputVisible(false);
    setNewSetDraft('');
  };

  const handleBack = () => {
    setTokens([]);
    setSource(null);
    setTypeFilter(null);
    setConflictPaths(null);
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

      let imported = 0;
      for (const token of tokensToImport) {
        const res = await fetch(`${serverUrl}/api/tokens/${targetSet}/${token.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: token.$type, $value: token.$value }),
        });
        if (res.status === 409) {
          if (strategy === 'overwrite') {
            await fetch(`${serverUrl}/api/tokens/${targetSet}/${token.path}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: token.$type, $value: token.$value }),
            });
            imported++;
          }
        } else {
          imported++;
        }
        setImportProgress({ done: imported, total: tokensToImport.length });
      }

      parent.postMessage({ pluginMessage: { type: 'notify', message: `Imported ${imported} tokens to "${targetSet}"` } }, '*');
      onImported();
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

  const handleImport = async () => {
    if (!connected || selectedTokens.size === 0) return;
    setError(null);
    setSuccessMessage(null);
    setCheckingConflicts(true);

    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}`);
      if (res.ok) {
        const data = await res.json();
        const existing = new Set(Object.keys(data.tokens || {}));
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
        {tokens.length === 0 && !loading && !successMessage && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1">
              Import Source
            </div>
            <button
              onClick={handleReadVariables}
              className="flex items-center gap-3 px-3 py-3 rounded bg-[var(--color-figma-accent)] hover:opacity-90 transition-opacity"
            >
              <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[11px] font-medium text-white">Import from Figma Variables</div>
                <div className="text-[9px] text-white/70">Read all local variable collections</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-white/70">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
            <button
              onClick={handleReadStyles}
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
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Read paint, text, and effect styles</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
          </div>
        )}

        {/* Success state */}
        {tokens.length === 0 && !loading && successMessage && (
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
            {source === 'variables' ? 'Reading variables from Figma\u2026' : 'Reading styles from Figma\u2026'}
          </div>
        )}

        {/* Preview */}
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
                {source === 'variables' ? 'Figma Variables' : 'Figma Styles'}
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

            {/* Token list - grouped by collection (variables) or type (styles) */}
            {(() => {
              const filtered = typeFilter ? tokens.filter(t => t.$type === typeFilter) : tokens;
              const getGroupKey = (t: ImportToken) =>
                source === 'variables' ? (t.collection ?? 'Default') : t.$type;

              const groupMap = new Map<string, ImportToken[]>();
              for (const t of filtered) {
                const key = getGroupKey(t);
                if (!groupMap.has(key)) groupMap.set(key, []);
                groupMap.get(key)!.push(t);
              }
              const groups = [...groupMap.entries()];
              const useGroups = groups.length > 1;

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

              if (!useGroups) {
                return (
                  <div className="rounded border border-[var(--color-figma-border)] overflow-hidden divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                    {filtered.map(renderRow)}
                  </div>
                );
              }

              return (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden max-h-64 overflow-y-auto">
                  {groups.map(([groupName, groupTokens], i) => {
                    const selectedCount = groupTokens.filter(t => selectedTokens.has(t.path)).length;
                    return (
                      <div key={groupName}>
                        {i > 0 && <div className="border-t border-[var(--color-figma-border)]" />}
                        <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
                          <span className="text-[9px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wide truncate">{groupName}</span>
                          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 ml-2">{selectedCount}/{groupTokens.length}</span>
                        </div>
                        <div className="divide-y divide-[var(--color-figma-border)]">
                          {groupTokens.map(renderRow)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Footer: set selector + action button (visible when preview is active) */}
      {tokens.length > 0 && !loading && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">

          {/* Target set row — always visible in footer */}
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
                    localStorage.setItem('importTargetSet', e.target.value);
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
                    : 'Skip conflicts'}
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
                    : 'Overwrite all'}
                </button>
              </div>
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
              onClick={handleImport}
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
        </div>
      )}
    </div>
  );
}
