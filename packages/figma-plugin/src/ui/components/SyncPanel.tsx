import { useState, useEffect, useCallback, useRef } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';

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
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
}

interface VarDiffRow {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
}

interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'pending';
  count?: number;
  detail?: string;
  fixLabel?: string;
  onFix?: () => void;
}


function truncateValue(v: string, max = 24): string {
  return v.length > max ? v.slice(0, max) + '…' : v;
}

export function SyncPanel({ serverUrl, connected, activeSet, collectionMap = {}, modeMap = {} }: SyncPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
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
  const [varChecked, setVarChecked] = useState(false);
  const [varSyncResult, setVarSyncResult] = useState<number | null>(null);
  const varSyncResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const varPendingRef = useRef<Map<string, (tokens: any[]) => void>>(new Map());
  const applyPendingRef = useRef<Map<string, { resolve: () => void; reject: (err: Error) => void }>>(new Map());

  // Publish readiness state
  const [readinessChecks, setReadinessChecks] = useState<ReadinessCheck[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [orphansDeleting, setOrphansDeleting] = useState(false);
  const orphansResolveRef = useRef<((count: number) => void) | null>(null);

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;

    if (!connected) { setLoading(false); return; }
    try {
      const res = await fetch(`${serverUrl}/api/sync/status`, { signal });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.remote) setRemoteUrl(data.remote);
      } else {
        setStatus({ isRepo: false, branch: null, remote: null, status: null });
      }

      const branchRes = await fetch(`${serverUrl}/api/sync/branches`, { signal });
      if (branchRes.ok) {
        const branchData = await branchRes.json();
        setBranches(branchData.branches || []);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchStatus();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchStatus]);

  const computeVarDiff = useCallback(async () => {
    if (!activeSet) return;
    setVarLoading(true);
    setVarError(null);
    setVarChecked(false);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `sync-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
          varPendingRef.current.delete(cid);
          reject(new Error('Figma read timed out — is the plugin running?'));
        }, 10000);
        varPendingRef.current.set(cid, (tokens) => {
          clearTimeout(timeout);
          resolve(tokens);
        });
        parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
      });

      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      if (!res.ok) throw new Error('Could not fetch local tokens');
      const data = await res.json();
      const localFlat = [...flattenTokenGroup(data.tokens || {})].map(([path, token]) => ({
        path,
        value: String(token.$value),
        type: String(token.$type ?? 'string'),
      }));

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
      setVarChecked(true);
      const dirs: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const r of rows) {
        dirs[r.path] = r.cat === 'figma-only' ? 'pull' : 'push';
      }
      setVarDirs(dirs);
    } catch (err) {
      setVarError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setVarLoading(false);
    }
  }, [serverUrl, activeSet]);

  // Auto-run var diff when the panel loads (so users see the state immediately)
  useEffect(() => {
    if (connected && activeSet) computeVarDiff();
  }, [connected, activeSet, computeVarDiff]);

  // Auto-run readiness checks when the panel loads (so status dot reflects real state immediately)
  useEffect(() => {
    if (connected && activeSet) runReadinessChecks();
  }, [connected, activeSet, runReadinessChecks]);

  // Listen for variables-read, variables-applied, and orphans-deleted responses from controller
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variables-read' && msg.correlationId) {
        const resolve = varPendingRef.current.get(msg.correlationId);
        if (resolve) {
          varPendingRef.current.delete(msg.correlationId);
          resolve(msg.tokens ?? []);
        }
      }
      if (msg?.type === 'variables-applied' && msg.correlationId) {
        const pending = applyPendingRef.current.get(msg.correlationId);
        if (pending) {
          applyPendingRef.current.delete(msg.correlationId);
          pending.resolve();
        }
      }
      if (msg?.type === 'apply-variables-error' && msg.correlationId) {
        const pending = applyPendingRef.current.get(msg.correlationId);
        if (pending) {
          applyPendingRef.current.delete(msg.correlationId);
          pending.reject(new Error(msg.message ?? 'Figma variable apply failed'));
        }
      }
      if (msg?.type === 'orphans-deleted' && orphansResolveRef.current) {
        orphansResolveRef.current(msg.count ?? 0);
        orphansResolveRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const applyVarDiff = useCallback(async () => {
    const dirsSnapshot = varDirs;
    const rowsSnapshot = varRows;
    setVarSyncing(true);
    setVarError(null);
    try {
      const pushRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'push');
      const pullRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'pull');

      if (pushRows.length > 0) {
        const tokens = pushRows.map(r => ({
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localValue ?? '',
          setName: activeSet,
        }));
        const cid = `apply-${Date.now()}-${Math.random()}`;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            applyPendingRef.current.delete(cid);
            reject(new Error('Figma apply timed out — is the plugin running?'));
          }, 15000);
          applyPendingRef.current.set(cid, {
            resolve: () => { clearTimeout(timeout); resolve(); },
            reject: (err) => { clearTimeout(timeout); reject(err); },
          });
          parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap, correlationId: cid } }, '*');
        });
      }

      if (pullRows.length > 0) {
        await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategy: 'overwrite',
            tokens: pullRows.map(r => ({
              path: r.path,
              $type: r.figmaType ?? 'string',
              $value: r.figmaValue ?? '',
            })),
          }),
        });
      }

      const syncedCount = pushRows.length + pullRows.length;
      setVarRows([]);
      setVarDirs({});
      setVarChecked(true);
      setVarSyncResult(syncedCount);
      if (varSyncResultTimer.current) clearTimeout(varSyncResultTimer.current);
      varSyncResultTimer.current = setTimeout(() => setVarSyncResult(null), 4000);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Variable sync applied' } }, '*');
    } catch (err) {
      setVarError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setVarSyncing(false);
    }
  }, [serverUrl, activeSet, varRows, varDirs]);

  const runReadinessChecks = useCallback(async () => {
    if (!activeSet) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `sync-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
          varPendingRef.current.delete(cid);
          reject(new Error('Figma did not respond in time — try reloading the plugin.'));
        }, 10000);
        varPendingRef.current.set(cid, (tokens) => { clearTimeout(timeout); resolve(tokens); });
        parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
      });

      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      if (!res.ok) throw new Error('Could not fetch local tokens');
      const data = await res.json();
      const localFlat = [...flattenTokenGroup(data.tokens || {})].map(([path, token]) => ({
        path,
        value: String(token.$value),
        type: String(token.$type ?? 'string'),
      }));

      const figmaMap = new Map<string, any>(figmaTokens.map(t => [t.path, t]));
      const localPaths = new Set(localFlat.map(t => t.path));

      const missingInFigma = localFlat.filter(t => !figmaMap.has(t.path));
      const missingScopes = figmaTokens.filter(t =>
        !t.$scopes || t.$scopes.length === 0 || (t.$scopes.length === 1 && t.$scopes[0] === 'ALL_SCOPES')
      );
      const missingDescriptions = figmaTokens.filter(t => !t.$description);
      const orphans = figmaTokens.filter(t => !localPaths.has(t.path));

      const checks: ReadinessCheck[] = [
        {
          id: 'all-vars',
          label: 'All tokens have Figma variables',
          status: missingInFigma.length === 0 ? 'pass' : 'fail',
          count: missingInFigma.length || undefined,
          fixLabel: missingInFigma.length > 0 ? `Push ${missingInFigma.length} missing` : undefined,
          onFix: missingInFigma.length > 0 ? () => {
            const tokens = missingInFigma.map(t => ({ path: t.path, $type: t.type, $value: t.value, setName: activeSet }));
            parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap } }, '*');
          } : undefined,
        },
        {
          id: 'scopes',
          label: 'Scopes set for every variable',
          status: missingScopes.length === 0 ? 'pass' : 'fail',
          count: missingScopes.length || undefined,
          detail: missingScopes.length > 0 ? 'Open Figma Variables panel → select each variable → set scopes to limit where it can be applied.' : undefined,
        },
        {
          id: 'descriptions',
          label: 'Descriptions populated',
          status: missingDescriptions.length === 0 ? 'pass' : 'fail',
          count: missingDescriptions.length || undefined,
          detail: missingDescriptions.length > 0 ? 'Add $description fields to tokens in the token editor, then re-sync to Figma.' : undefined,
        },
        {
          id: 'orphans',
          label: 'No orphan Figma variables',
          status: orphans.length === 0 ? 'pass' : 'fail',
          count: orphans.length || undefined,
          fixLabel: orphans.length > 0 ? `Delete ${orphans.length} orphan${orphans.length !== 1 ? 's' : ''}` : undefined,
          onFix: orphans.length > 0 ? async () => {
            setOrphansDeleting(true);
            try {
              await new Promise<number>((resolve, reject) => {
                const timeout = setTimeout(() => { orphansResolveRef.current = null; reject(new Error('Figma did not respond in time — try reloading the plugin.')); }, 10000);
                orphansResolveRef.current = (count) => { clearTimeout(timeout); resolve(count); };
                parent.postMessage({ pluginMessage: { type: 'delete-orphan-variables', knownPaths: [...localPaths] } }, '*');
              });
              runReadinessChecks();
            } catch (e) {
              setReadinessError(String(e));
            } finally {
              setOrphansDeleting(false);
            }
          } : undefined,
        },
      ];
      setReadinessChecks(checks);
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setReadinessLoading(false);
    }
  }, [serverUrl, activeSet]);

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
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
      const choices: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const f of data.localOnly) choices[f] = 'push';
      for (const f of data.remoteOnly) choices[f] = 'pull';
      for (const f of data.conflicts) choices[f] = 'skip';
      setDiffChoices(choices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin" aria-hidden="true" />
        Loading Git status...
      </div>
    );
  }

  if (!status?.isRepo) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 px-6">
        <p className="text-[12px] text-[var(--color-figma-text-secondary)]">No Git repository initialized</p>
        <div className="w-full flex flex-col gap-2">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Remote URL (optional)</label>
          <input
            type="text"
            value={remoteUrl}
            onChange={e => setRemoteUrl(e.target.value)}
            placeholder="https://github.com/org/repo.git"
            className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
        </div>
        <button
          onClick={() => doAction('init', remoteUrl ? { remoteUrl } : undefined)}
          disabled={actionLoading !== null}
          className="w-full px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
        >
          {actionLoading === 'init' ? 'Initializing…' : 'Initialize Repository'}
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

  // Compute counts for var sync
  const varSyncCount = Object.values(varDirs).filter(d => d !== 'skip').length;
  const varPushCount = Object.values(varDirs).filter(d => d === 'push').length;
  const varPullCount = Object.values(varDirs).filter(d => d === 'pull').length;

  // Readiness pass/fail summary
  const readinessFails = readinessChecks.filter(c => c.status === 'fail').length;
  const readinessPasses = readinessChecks.filter(c => c.status === 'pass').length;

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
          {error}
        </div>
      )}

      {/* Quick-status overview bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex-wrap">
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            varLoading ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' :
            varChecked && varRows.length === 0 ? 'bg-[var(--color-figma-success)]' :
            varRows.length > 0 ? 'bg-yellow-500' :
            'bg-[var(--color-figma-border)]'
          }`} />
          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
            {varLoading ? 'Comparing…' :
             varChecked && varRows.length === 0 ? 'Figma in sync' :
             varRows.length > 0 ? `${varRows.length} token${varRows.length !== 1 ? 's' : ''} differ` :
             'Figma not checked'}
          </span>
        </div>
        <span className="text-[var(--color-figma-border)] text-[9px]">·</span>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            readinessLoading ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' :
            readinessFails === 0 && readinessPasses > 0 ? 'bg-[var(--color-figma-success)]' :
            readinessFails > 0 ? 'bg-[var(--color-figma-error)]' :
            'bg-[var(--color-figma-border)]'
          }`} />
          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
            {readinessLoading ? 'Checking…' :
             readinessFails === 0 && readinessPasses > 0 ? 'Ready to publish' :
             readinessFails > 0 ? `${readinessFails} issue${readinessFails !== 1 ? 's' : ''}` :
             'Readiness unknown'}
          </span>
        </div>
        <span className="text-[var(--color-figma-border)] text-[9px]">·</span>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            allChanges.length > 0 ? 'bg-yellow-500' : 'bg-[var(--color-figma-success)]'
          }`} />
          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
            {allChanges.length > 0 ? `${allChanges.length} uncommitted` : 'Git clean'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">

        {/* ── Section 1: Figma Variable Sync ─────────────────────────── */}
        <section>
          <div className="mb-2">
            <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">Figma Variables</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
              Keep local tokens and Figma variables in sync. Push local changes to Figma, or pull Figma changes back.
            </div>
          </div>

          {/* Variable Diff */}
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Token differences</span>
                {varChecked && varRows.length === 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
                )}
                {varRows.length > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{varRows.length} differ</span>
                )}
              </div>
              <button
                onClick={computeVarDiff}
                disabled={varLoading || !activeSet}
                className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
              >
                {varLoading ? 'Checking…' : varChecked ? 'Re-check' : 'Compare'}
              </button>
            </div>

            {varError && (() => {
              const raw = varError;
              let message = 'Sync failed.';
              let action = 'Try again or reload the plugin.';
              if (raw.includes('timed out')) {
                message = 'Could not read variables from Figma.';
                action = 'Make sure the plugin is open and active, then try again.';
              } else if (raw.includes('Could not fetch local tokens') || raw.includes('fetch local tokens')) {
                message = 'Could not load tokens from the server.';
                action = 'Check that the token server is running, then retry.';
              } else if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('network')) {
                message = 'Could not reach the token server.';
                action = 'Check the server URL in settings and make sure the server is running.';
              }
              return (
                <div className="mx-3 my-2 px-2 py-1.5 rounded border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/5">
                  <p className="text-[10px] text-[var(--color-figma-error)] font-medium">{message}</p>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">{action}</p>
                </div>
              );
            })()}

            {varRows.length > 0 && (() => {
              const localOnly = varRows.filter(r => r.cat === 'local-only');
              const figmaOnly = varRows.filter(r => r.cat === 'figma-only');
              const conflicts = varRows.filter(r => r.cat === 'conflict');

              return (
                <>
                  {/* Bulk actions */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                    <span className="text-[9px] text-[var(--color-figma-text-secondary)] mr-0.5">Select all:</span>
                    {(['push', 'pull', 'skip'] as const).map(action => (
                      <button
                        key={action}
                        onClick={() => setVarDirs(Object.fromEntries(varRows.map(r => [r.path, action])))}
                        className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] capitalize"
                      >
                        {action === 'push' ? '↑ Push all' : action === 'pull' ? '↓ Pull all' : 'Skip all'}
                      </button>
                    ))}
                  </div>

                  <div className="divide-y divide-[var(--color-figma-border)] max-h-52 overflow-y-auto">
                    {/* Group by category for clarity */}
                    {localOnly.length > 0 && (
                      <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                        <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                          Local only — not yet in Figma ({localOnly.length})
                        </span>
                      </div>
                    )}
                    {localOnly.map(row => (
                      <VarDiffRowItem key={row.path} row={row} dir={varDirs[row.path] ?? 'push'} onChange={d => setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                    ))}

                    {figmaOnly.length > 0 && (
                      <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                        <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                          Figma only — not in local files ({figmaOnly.length})
                        </span>
                      </div>
                    )}
                    {figmaOnly.map(row => (
                      <VarDiffRowItem key={row.path} row={row} dir={varDirs[row.path] ?? 'pull'} onChange={d => setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                    ))}

                    {conflicts.length > 0 && (
                      <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                        <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                          Values differ — choose which to keep ({conflicts.length})
                        </span>
                      </div>
                    )}
                    {conflicts.map(row => (
                      <VarDiffRowItem key={row.path} row={row} dir={varDirs[row.path] ?? 'push'} onChange={d => setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                    ))}
                  </div>

                  <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                    <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                      {varSyncCount === 0
                        ? 'Nothing to apply — all skipped'
                        : [
                            varPushCount > 0 ? `↑ ${varPushCount} to Figma` : null,
                            varPullCount > 0 ? `↓ ${varPullCount} to local` : null,
                          ].filter(Boolean).join(' · ')
                      }
                    </span>
                    <button
                      onClick={applyVarDiff}
                      disabled={varSyncing || varSyncCount === 0}
                      className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {varSyncing ? 'Syncing…' : `Apply ${varSyncCount > 0 ? varSyncCount + ' change' + (varSyncCount !== 1 ? 's' : '') : ''}`}
                    </button>
                  </div>
                </>
              );
            })()}

            {varLoading && (
              <div className="px-3 py-3 flex items-center gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                <div className="w-3 h-3 rounded-full border-[1.5px] border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin shrink-0" aria-hidden="true" />
                Comparing local tokens with Figma variables…
              </div>
            )}

            {!varLoading && !varError && (
              varChecked && varRows.length === 0 ? (
                <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex flex-col gap-1.5">
                  {varSyncResult !== null && (
                    <div className="flex items-center gap-1.5 text-[var(--color-figma-success)]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Synced {varSyncResult} variable{varSyncResult !== 1 ? 's' : ''}.
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Local tokens match Figma variables.
                  </div>
                </div>
              ) : !varChecked && varRows.length === 0 ? (
                <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which tokens differ between local files and Figma.
                </div>
              ) : null
            )}
          </div>

          {/* Publish Readiness */}
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mt-2">
            <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Publish Readiness</span>
                {readinessFails > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] font-medium">{readinessFails} issue{readinessFails !== 1 ? 's' : ''}</span>
                )}
                {readinessFails === 0 && readinessPasses > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">Ready</span>
                )}
              </div>
              <button
                onClick={runReadinessChecks}
                disabled={readinessLoading || !activeSet}
                className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
              >
                {readinessLoading ? 'Checking…' : readinessChecks.length > 0 ? 'Re-check' : 'Run checks'}
              </button>
            </div>
            {readinessError && (
              <div className="px-3 py-2 flex items-start gap-2">
                <span className="text-[10px] text-[var(--color-figma-error)] flex-1">{readinessError}</span>
                <button
                  onClick={runReadinessChecks}
                  disabled={readinessLoading}
                  className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 shrink-0 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
            {readinessChecks.length > 0 && (
              <div className="divide-y divide-[var(--color-figma-border)]">
                {readinessChecks.map(check => (
                  <div key={check.id} className="flex items-center gap-2 px-3 py-2">
                    <span className={`shrink-0 ${check.status === 'pass' ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-error)]'}`}>
                      {check.status === 'pass' ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[var(--color-figma-text)]">{check.label}</div>
                      {check.count !== undefined && check.status === 'fail' && (
                        <div className="text-[9px] text-[var(--color-figma-text-secondary)]">{check.count} affected</div>
                      )}
                      {check.detail && check.status === 'fail' && (
                        <div className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">{check.detail}</div>
                      )}
                    </div>
                    {check.fixLabel && check.onFix && (
                      <button
                        onClick={check.onFix}
                        disabled={orphansDeleting}
                        className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 shrink-0 disabled:opacity-40"
                      >
                        {orphansDeleting && check.id === 'orphans' ? 'Deleting…' : check.fixLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {readinessLoading && readinessChecks.length === 0 && (
              <div className="px-3 py-3 flex items-center gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                <div className="w-3 h-3 rounded-full border-[1.5px] border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin shrink-0" aria-hidden="true" />
                Running publish readiness checks…
              </div>
            )}
            {!readinessLoading && readinessChecks.length === 0 && !readinessError && (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                Click <strong className="font-medium text-[var(--color-figma-text)]">Run checks</strong> to validate your Figma variables before publishing.
              </div>
            )}
          </div>
        </section>

        {/* ── Section 2: Git Repository ──────────────────────────────── */}
        <section>
          <div className="mb-2">
            <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">Git Repository</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
              After syncing tokens to Figma, commit and push to track changes in version control.
            </div>
          </div>

          {/* Branch */}
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 01-9 9" />
                </svg>
                <span className="text-[11px] font-medium truncate max-w-[140px]" title={status.branch || 'main'}>{status.branch || 'main'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-medium ${allChanges.length > 0 ? 'text-yellow-600' : 'text-[var(--color-figma-success)]'}`}>
                  {allChanges.length > 0 ? `${allChanges.length} change${allChanges.length !== 1 ? 's' : ''}` : 'Clean'}
                </span>
                <button
                  onClick={() => { setLoading(true); fetchStatus(); }}
                  disabled={loading}
                  title="Refresh git status"
                  className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-40"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={loading ? 'animate-spin' : ''}>
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                  </svg>
                </button>
              </div>
            </div>
            {branches.length > 1 && (
              <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
                <div className="flex items-center gap-1.5">
                  <select
                    value={pendingBranch ?? status.branch ?? ''}
                    onChange={e => {
                      const target = e.target.value;
                      if (target !== status.branch) setPendingBranch(target);
                    }}
                    className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none"
                  >
                    {branches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setShowNewBranch(v => !v); setNewBranchName(''); setPendingBranch(null); }}
                    title="Create new branch"
                    className="flex items-center justify-center w-6 h-6 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors shrink-0"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14"/>
                    </svg>
                  </button>
                </div>
                {showNewBranch && (
                  <div className="mt-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col gap-1.5">
                    <span className="text-[10px] text-[var(--color-figma-text)]">New branch from <strong>{status.branch || 'current'}</strong></span>
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={e => setNewBranchName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newBranchName.trim()) {
                          doAction('checkout', { branch: newBranchName.trim(), create: true });
                          setShowNewBranch(false);
                          setNewBranchName('');
                        } else if (e.key === 'Escape') {
                          setShowNewBranch(false);
                          setNewBranchName('');
                        }
                      }}
                      placeholder="branch-name"
                      autoFocus
                      className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
                    />
                    <div className="flex gap-1.5">
                      <button
                        disabled={!newBranchName.trim()}
                        onClick={() => { doAction('checkout', { branch: newBranchName.trim(), create: true }); setShowNewBranch(false); setNewBranchName(''); }}
                        className="flex-1 px-2 py-0.5 rounded text-[10px] bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        Create &amp; checkout
                      </button>
                      <button
                        onClick={() => { setShowNewBranch(false); setNewBranchName(''); }}
                        className="flex-1 px-2 py-0.5 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {pendingBranch && !showNewBranch && (
                  <div className="mt-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col gap-1.5">
                    <span className="text-[10px] text-[var(--color-figma-text)]">
                      Switch to <strong>{pendingBranch}</strong>?
                      {allChanges.length > 0 && (
                        <span className="text-yellow-600"> ({allChanges.length} uncommitted change{allChanges.length !== 1 ? 's' : ''} will remain staged)</span>
                      )}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { doAction('checkout', { branch: pendingBranch }); setPendingBranch(null); }}
                        className="flex-1 px-2 py-0.5 rounded text-[10px] bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
                      >
                        Checkout
                      </button>
                      <button
                        onClick={() => setPendingBranch(null)}
                        className="flex-1 px-2 py-0.5 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Changed files */}
          {allChanges.length > 0 && (
            <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mt-2">
              <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                Uncommitted changes
              </div>
              <div className="max-h-28 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                {allChanges.map((change, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1">
                    <span
                      className={`text-[9px] font-mono font-bold w-3 ${
                        change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                        change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                        change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                        'text-[var(--color-figma-text-secondary)]'
                      }`}
                      title={
                        change.status === 'M' ? 'Modified — has uncommitted changes' :
                        change.status === 'A' ? 'Added — staged for commit' :
                        change.status === 'D' ? 'Deleted — removed from repository' :
                        'Untracked — new file not yet staged'
                      }
                    >
                      {change.status}
                    </span>
                    <span className="text-[10px] text-[var(--color-figma-text)] truncate">{change.file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commit */}
          {(status.status?.staged.length > 0 ||
            status.status?.modified.length > 0 ||
            status.status?.created.length > 0 ||
            status.status?.deleted.length > 0) && (
            <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mt-2">
              <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                Commit message
              </div>
              <div className="p-3 flex flex-col gap-2">
                <input
                  type="text"
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  placeholder="Describe your changes…"
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && commitMsg.trim()) doAction('commit', { message: commitMsg }).then(() => setCommitMsg(''));
                  }}
                />
                <button
                  onClick={() => doAction('commit', { message: commitMsg }).then(() => setCommitMsg(''))}
                  disabled={!commitMsg.trim() || actionLoading !== null}
                  className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  {actionLoading === 'commit' ? 'Committing…' : 'Commit changes'}
                </button>
              </div>
            </div>
          )}

          {/* Remote URL */}
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mt-2">
            <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
              Remote URL
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
                Save
              </button>
            </div>
          </div>

          {/* Git diff (Two-Way Sync) — only shown when remote is configured */}
          {status?.remote && (
            <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mt-2">
              <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Remote differences</span>
                  {diffView && diffView.localOnly.length + diffView.remoteOnly.length + diffView.conflicts.length === 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
                  )}
                </div>
                <button
                  onClick={computeDiff}
                  disabled={diffLoading}
                  className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                >
                  {diffLoading ? 'Computing…' : diffView ? 'Re-check' : 'Compare'}
                </button>
              </div>
              {diffView && (() => {
                const allFiles = [
                  ...diffView.localOnly.map(f => ({ file: f, cat: 'local' as const })),
                  ...diffView.remoteOnly.map(f => ({ file: f, cat: 'remote' as const })),
                  ...diffView.conflicts.map(f => ({ file: f, cat: 'conflict' as const })),
                ];
                if (allFiles.length === 0) {
                  return (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Local and remote are in sync.
                    </div>
                  );
                }
                const pendingCount = Object.values(diffChoices).filter(c => c !== 'skip').length;
                return (
                  <>
                    <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                      {allFiles.map(({ file, cat }) => {
                        const choice = diffChoices[file] ?? 'skip';
                        const catLabel = cat === 'local' ? 'Local only' : cat === 'remote' ? 'Remote only' : 'Values differ';
                        const catColor = cat === 'local' ? 'text-[var(--color-figma-success)]' : cat === 'remote' ? 'text-[var(--color-figma-accent)]' : 'text-yellow-600';
                        return (
                          <div key={file} className="flex items-center gap-2 px-3 py-1.5">
                            <span className={`text-[9px] font-medium shrink-0 w-20 ${catColor}`}>{catLabel}</span>
                            <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={file}>{file}</span>
                            <select
                              value={choice}
                              onChange={e => setDiffChoices(prev => ({ ...prev, [file]: e.target.value as 'push' | 'pull' | 'skip' }))}
                              className="text-[9px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5"
                            >
                              <option value="push">↑ Push</option>
                              <option value="pull">↓ Pull</option>
                              <option value="skip">Skip</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                        {pendingCount > 0 ? `${pendingCount} file${pendingCount !== 1 ? 's' : ''} will be updated` : 'All skipped'}
                      </span>
                      <button
                        onClick={applyDiff}
                        disabled={applyingDiff || pendingCount === 0}
                        className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                      >
                        {applyingDiff ? 'Applying…' : `Apply ${pendingCount > 0 ? pendingCount + ' change' + (pendingCount !== 1 ? 's' : '') : ''}`}
                      </button>
                    </div>
                  </>
                );
              })()}
              {!diffLoading && !diffView && (
                <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which files differ between local and remote.
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Push / Pull — only shown when remote is configured */}
      {status?.remote && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex gap-2">
          <button
            onClick={() => doAction('pull')}
            disabled={actionLoading !== null}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            {actionLoading === 'pull' ? 'Pulling…' : '↓ Pull'}
          </button>
          <button
            onClick={() => doAction('push')}
            disabled={actionLoading !== null}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            {actionLoading === 'push' ? 'Pushing…' : '↑ Push'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── VarDiffRowItem ──────────────────────────────────────────────────────────

interface VarDiffRowItemProps {
  row: VarDiffRow;
  dir: 'push' | 'pull' | 'skip';
  onChange: (dir: 'push' | 'pull' | 'skip') => void;
}

function VarDiffRowItem({ row, dir, onChange }: VarDiffRowItemProps) {
  return (
    <div className="px-3 py-1.5 flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={row.path}>{row.path}</span>
        <select
          value={dir}
          onChange={e => onChange(e.target.value as 'push' | 'pull' | 'skip')}
          className="text-[9px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5 shrink-0"
        >
          <option value="push">↑ Push to Figma</option>
          <option value="pull">↓ Pull to local</option>
          <option value="skip">Skip</option>
        </select>
      </div>
      {row.cat === 'conflict' && (
        <div className="flex items-center gap-2 pl-0.5">
          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Local:</span>
          <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate" title={row.localValue}>{truncateValue(row.localValue ?? '')}</span>
          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 mx-0.5">vs</span>
          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Figma:</span>
          <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate" title={row.figmaValue}>{truncateValue(row.figmaValue ?? '')}</span>
        </div>
      )}
      {row.cat === 'local-only' && row.localValue !== undefined && (
        <div className="pl-0.5">
          <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.localValue)}</span>
        </div>
      )}
      {row.cat === 'figma-only' && row.figmaValue !== undefined && (
        <div className="pl-0.5">
          <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.figmaValue)}</span>
        </div>
      )}
    </div>
  );
}
