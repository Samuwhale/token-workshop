import React, { useState, useEffect, useCallback, useRef } from 'react';

interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  remote: string | null;
  status: {
    modified: string[];
    created: string[];
    deleted: string[];
    not_added: string[];
    staged: string[];
    isClean: boolean;
  } | null;
}

interface SyncPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
}

interface VarDiffRow {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
}

function flattenForVarDiff(
  group: Record<string, any>,
  prefix = ''
): { path: string; value: string; type: string }[] {
  const result: { path: string; value: string; type: string }[] = [];
  for (const [key, val] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && '$value' in val) {
      result.push({ path, value: String(val.$value), type: String(val.$type ?? 'string') });
    } else if (val && typeof val === 'object') {
      result.push(...flattenForVarDiff(val, path));
    }
  }
  return result;
}

export function SyncPanel({ serverUrl, connected, activeSet }: SyncPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [diffView, setDiffView] = useState<{ localOnly: string[]; remoteOnly: string[]; conflicts: string[] } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffChoices, setDiffChoices] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [applyingDiff, setApplyingDiff] = useState(false);

  // Variable sync state
  const [varRows, setVarRows] = useState<VarDiffRow[]>([]);
  const [varDirs, setVarDirs] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [varLoading, setVarLoading] = useState(false);
  const [varSyncing, setVarSyncing] = useState(false);
  const [varError, setVarError] = useState<string | null>(null);
  const varReadResolveRef = useRef<((tokens: any[]) => void) | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    try {
      const res = await fetch(`${serverUrl}/api/sync/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.remote) setRemoteUrl(data.remote);
      } else {
        setStatus({ isRepo: false, branch: null, remote: null, status: null });
      }

      const branchRes = await fetch(`${serverUrl}/api/sync/branches`);
      if (branchRes.ok) {
        const branchData = await branchRes.json();
        setBranches(branchData.branches || []);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for variables-read response from controller
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variables-read' && varReadResolveRef.current) {
        varReadResolveRef.current(msg.tokens ?? []);
        varReadResolveRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const computeVarDiff = useCallback(async () => {
    if (!activeSet) return;
    setVarLoading(true);
    setVarError(null);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          varReadResolveRef.current = null;
          reject(new Error('Figma read timed out — is the plugin running?'));
        }, 10000);
        varReadResolveRef.current = (tokens) => {
          clearTimeout(timeout);
          resolve(tokens);
        };
        parent.postMessage({ pluginMessage: { type: 'read-variables' } }, '*');
      });

      const res = await fetch(`${serverUrl}/api/tokens/${activeSet}`);
      if (!res.ok) throw new Error('Could not fetch local tokens');
      const data = await res.json();
      const localFlat = flattenForVarDiff(data.tokens || {});

      const figmaMap = new Map<string, { value: string; type: string }>(
        figmaTokens.map(t => [t.path, { value: String(t.$value ?? ''), type: String(t.$type ?? 'string') }])
      );
      const localMap = new Map<string, { value: string; type: string }>(
        localFlat.map(t => [t.path, { value: t.value, type: t.type }])
      );

      const rows: VarDiffRow[] = [];
      for (const [path, local] of localMap) {
        const figma = figmaMap.get(path);
        if (!figma) {
          rows.push({ path, cat: 'local-only', localValue: local.value, localType: local.type });
        } else if (figma.value !== local.value) {
          rows.push({ path, cat: 'conflict', localValue: local.value, figmaValue: figma.value, localType: local.type, figmaType: figma.type });
        }
      }
      for (const [path, figma] of figmaMap) {
        if (!localMap.has(path)) {
          rows.push({ path, cat: 'figma-only', figmaValue: figma.value, figmaType: figma.type });
        }
      }

      setVarRows(rows);
      const dirs: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const r of rows) {
        dirs[r.path] = r.cat === 'figma-only' ? 'pull' : 'push';
      }
      setVarDirs(dirs);
    } catch (err) {
      setVarError(String(err));
    } finally {
      setVarLoading(false);
    }
  }, [serverUrl, activeSet]);

  const applyVarDiff = useCallback(async () => {
    setVarSyncing(true);
    setVarError(null);
    try {
      const pushRows = varRows.filter(r => varDirs[r.path] === 'push');
      const pullRows = varRows.filter(r => varDirs[r.path] === 'pull');

      if (pushRows.length > 0) {
        const tokens = pushRows.map(r => ({
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localValue ?? '',
        }));
        parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens } }, '*');
      }

      if (pullRows.length > 0) {
        await Promise.all(pullRows.map(r =>
          fetch(`${serverUrl}/api/tokens/${activeSet}/${r.path}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: r.figmaType ?? 'string', $value: r.figmaValue ?? '' }),
          })
        ));
      }

      setVarRows([]);
      setVarDirs({});
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Variable sync applied' } }, '*');
    } catch (err) {
      setVarError(String(err));
    } finally {
      setVarSyncing(false);
    }
  }, [serverUrl, activeSet, varRows, varDirs]);

  const doAction = async (action: string, body?: any) => {
    setActionLoading(action);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `${action} failed`);
      }
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Git ${action} completed` } }, '*');
      fetchStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setActionLoading(null);
    }
  };

  const computeDiff = useCallback(async () => {
    setDiffLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/diff`);
      if (!res.ok) throw new Error('Could not compute diff');
      const data = await res.json() as { localOnly: string[]; remoteOnly: string[]; conflicts: string[] };
      setDiffView(data);
      // Default choices: local-only → push, remote-only → pull, conflicts → skip
      const choices: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const f of data.localOnly) choices[f] = 'push';
      for (const f of data.remoteOnly) choices[f] = 'pull';
      for (const f of data.conflicts) choices[f] = 'skip';
      setDiffChoices(choices);
    } catch (err) {
      setError(String(err));
    } finally {
      setDiffLoading(false);
    }
  }, [serverUrl]);

  const applyDiff = useCallback(async () => {
    setApplyingDiff(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/apply-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices: diffChoices }),
      });
      if (!res.ok) throw new Error('Failed to apply diff');
      setDiffView(null);
      fetchStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setApplyingDiff(false);
    }
  }, [serverUrl, diffChoices, fetchStatus]);

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to use Git sync
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Loading Git status...
      </div>
    );
  }

  if (!status?.isRepo) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-[12px] text-[var(--color-figma-text-secondary)]">No Git repository initialized</p>
        <button
          onClick={() => doAction('init')}
          disabled={actionLoading !== null}
          className="px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
        >
          {actionLoading === 'init' ? 'Initializing...' : 'Initialize Repository'}
        </button>
      </div>
    );
  }

  const allChanges = status?.status
    ? [
        ...status.status.modified.map(f => ({ file: f, status: 'M' })),
        ...status.status.created.map(f => ({ file: f, status: 'A' })),
        ...status.status.deleted.map(f => ({ file: f, status: 'D' })),
        ...status.status.not_added.map(f => ({ file: f, status: '?' })),
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Branch info */}
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
            Branch
          </div>
          <div className="px-3 py-2 flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 01-9 9" />
            </svg>
            <span className="text-[11px] font-medium">{status.branch || 'main'}</span>
          </div>
          {branches.length > 1 && (
            <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
              <select
                value={status.branch || ''}
                onChange={e => doAction('checkout', { branch: e.target.value })}
                className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none"
              >
                {branches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Remote */}
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
            Remote
          </div>
          <div className="px-3 py-2 flex gap-2">
            <input
              type="text"
              value={remoteUrl}
              onChange={e => setRemoteUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
            />
            <button
              onClick={() => doAction('remote', { url: remoteUrl })}
              disabled={!remoteUrl || actionLoading !== null}
              className="px-2 py-1 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-border)] disabled:opacity-40"
            >
              Set
            </button>
          </div>
        </div>

        {/* Variable Sync — Figma ↔ Local */}
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Variable Sync</span>
            <button
              onClick={computeVarDiff}
              disabled={varLoading || !activeSet}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {varLoading ? 'Reading…' : 'Compute Diff'}
            </button>
          </div>
          {varError && (
            <div className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{varError}</div>
          )}
          {varRows.length > 0 && (() => {
            const catLabel = (cat: VarDiffRow['cat']) =>
              cat === 'local-only' ? '↑ local' : cat === 'figma-only' ? '↓ Figma' : '⚡ conflict';
            const catColor = (cat: VarDiffRow['cat']) =>
              cat === 'local-only' ? 'text-[var(--color-figma-success)]'
              : cat === 'figma-only' ? 'text-[var(--color-figma-accent)]'
              : 'text-yellow-600';
            return (
              <>
                <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                  {varRows.map(row => {
                    const dir = varDirs[row.path] ?? 'push';
                    return (
                      <div key={row.path} className="flex items-center gap-2 px-3 py-1.5">
                        <span className={`text-[9px] font-medium shrink-0 ${catColor(row.cat)}`}>{catLabel(row.cat)}</span>
                        <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={row.path}>{row.path}</span>
                        <select
                          value={dir}
                          onChange={e => setVarDirs(prev => ({ ...prev, [row.path]: e.target.value as 'push' | 'pull' | 'skip' }))}
                          className="text-[9px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5 shrink-0"
                        >
                          <option value="push">Push ↑</option>
                          <option value="pull">Pull ↓</option>
                          <option value="skip">Skip</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">{varRows.length} token{varRows.length !== 1 ? 's' : ''} differ</span>
                  <button
                    onClick={applyVarDiff}
                    disabled={varSyncing}
                    className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                  >
                    {varSyncing ? 'Applying…' : 'Apply Choices'}
                  </button>
                </div>
              </>
            );
          })()}
          {!varLoading && varRows.length === 0 && !varError && (
            <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
              Click "Compute Diff" to compare local tokens with Figma variables.
            </div>
          )}
        </div>

        {/* Two-Way Sync unified diff */}
        {status?.remote && (
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Two-Way Sync</span>
              <button
                onClick={computeDiff}
                disabled={diffLoading}
                className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
              >
                {diffLoading ? 'Computing…' : 'Compute Diff'}
              </button>
            </div>
            {diffView && (() => {
              const allFiles = [
                ...diffView.localOnly.map(f => ({ file: f, cat: 'local' as const })),
                ...diffView.remoteOnly.map(f => ({ file: f, cat: 'remote' as const })),
                ...diffView.conflicts.map(f => ({ file: f, cat: 'conflict' as const })),
              ];
              if (allFiles.length === 0) {
                return <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">Local and remote are in sync ✓</div>;
              }
              return (
                <>
                  <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                    {allFiles.map(({ file, cat }) => {
                      const choice = diffChoices[file] ?? 'skip';
                      const catLabel = cat === 'local' ? '↑ local' : cat === 'remote' ? '↓ remote' : '⚡ conflict';
                      const catColor = cat === 'local' ? 'text-[var(--color-figma-success)]' : cat === 'remote' ? 'text-[var(--color-figma-accent)]' : 'text-yellow-600';
                      return (
                        <div key={file} className="flex items-center gap-2 px-3 py-1.5">
                          <span className={`text-[9px] font-medium shrink-0 ${catColor}`}>{catLabel}</span>
                          <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono">{file}</span>
                          <select
                            value={choice}
                            onChange={e => setDiffChoices(prev => ({ ...prev, [file]: e.target.value as 'push' | 'pull' | 'skip' }))}
                            className="text-[9px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5"
                          >
                            <option value="push">Push ↑</option>
                            <option value="pull">Pull ↓</option>
                            <option value="skip">Skip</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex justify-end">
                    <button
                      onClick={applyDiff}
                      disabled={applyingDiff}
                      className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {applyingDiff ? 'Applying…' : 'Apply Choices'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Changes */}
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
              Changes
            </span>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {allChanges.length} file(s)
            </span>
          </div>
          {allChanges.length > 0 ? (
            <div className="max-h-32 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
              {allChanges.map((change, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1">
                  <span className={`text-[9px] font-mono font-bold w-3 ${
                    change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                    change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                    change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                    'text-[var(--color-figma-text-secondary)]'
                  }`}>
                    {change.status}
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-text)] truncate">{change.file}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] text-center">
              No uncommitted changes
            </div>
          )}
        </div>

        {/* Commit */}
        {!status.status?.isClean && (
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
              Commit
            </div>
            <div className="p-3 flex flex-col gap-2">
              <input
                type="text"
                value={commitMsg}
                onChange={e => setCommitMsg(e.target.value)}
                placeholder="Commit message"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                onKeyDown={e => {
                  if (e.key === 'Enter' && commitMsg) doAction('commit', { message: commitMsg }).then(() => setCommitMsg(''));
                }}
              />
              <button
                onClick={() => doAction('commit', { message: commitMsg }).then(() => setCommitMsg(''))}
                disabled={!commitMsg || actionLoading !== null}
                className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                {actionLoading === 'commit' ? 'Committing...' : 'Commit Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Push / Pull */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex gap-2">
        <button
          onClick={() => doAction('pull')}
          disabled={actionLoading !== null || !status.remote}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
        >
          {actionLoading === 'pull' ? 'Pulling...' : 'Pull'}
        </button>
        <button
          onClick={() => doAction('push')}
          disabled={actionLoading !== null || !status.remote}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {actionLoading === 'push' ? 'Pushing...' : 'Push'}
        </button>
      </div>
    </div>
  );
}
