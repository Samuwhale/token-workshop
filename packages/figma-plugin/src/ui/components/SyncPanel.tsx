import React, { useState, useEffect, useCallback } from 'react';

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
}

export function SyncPanel({ serverUrl, connected }: SyncPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);

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
