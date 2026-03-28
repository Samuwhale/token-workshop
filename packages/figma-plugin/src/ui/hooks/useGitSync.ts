import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getErrorMessage } from '../shared/utils';

function describeError(err: unknown, operation: string): string {
  return `${operation} failed: ${getErrorMessage(err, String(err))}`;
}

export interface GitStatus {
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

interface UseGitSyncOptions {
  serverUrl: string;
  connected: boolean;
}

export function useGitSync({ serverUrl, connected }: UseGitSyncOptions) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [diffView, setDiffView] = useState<{ localOnly: string[]; remoteOnly: string[]; conflicts: string[] } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffChoices, setDiffChoices] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const knownFilesRef = useRef<Set<string>>(new Set());
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;
    if (!connected) { setGitLoading(false); return; }
    try {
      const res = await fetch(`${serverUrl}/api/sync/status`, { signal });
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
        if (data.remote) setRemoteUrl(data.remote);
      } else {
        setGitStatus({ isRepo: false, branch: null, remote: null, status: null });
      }
      const branchRes = await fetch(`${serverUrl}/api/sync/branches`, { signal });
      if (branchRes.ok) {
        const branchData = await branchRes.json();
        setBranches(branchData.branches || []);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setGitError(describeError(err, 'Fetch git status'));
    } finally {
      if (!signal.aborted) setGitLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchStatus();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchStatus]);

  useEffect(() => {
    if (!lastSynced) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const doAction = async (action: string, body?: any) => {
    setActionLoading(action);
    setGitError(null);
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
      if (action === 'push' || action === 'pull') setLastSynced(new Date());
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Git ${action} completed` } }, '*');
      fetchStatus();
    } catch (err) {
      setGitError(describeError(err, `Git ${action}`));
    } finally {
      setActionLoading(null);
    }
  };

  const computeDiff = useCallback(async () => {
    setDiffLoading(true);
    setGitError(null);
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
      setGitError(describeError(err, 'Compute diff'));
    } finally {
      setDiffLoading(false);
    }
  }, [serverUrl]);

  const applyDiff = useCallback(async () => {
    setApplyingDiff(true);
    setGitError(null);
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
      setGitError(describeError(err, 'Apply diff'));
    } finally {
      setApplyingDiff(false);
    }
  }, [serverUrl, diffChoices, fetchStatus]);

  const allChanges = useMemo(() => gitStatus?.status
    ? [
        ...gitStatus.status.modified.map(f => ({ file: f, status: 'M' })),
        ...gitStatus.status.created.map(f => ({ file: f, status: 'A' })),
        ...gitStatus.status.deleted.map(f => ({ file: f, status: 'D' })),
        ...gitStatus.status.not_added.map(f => ({ file: f, status: '?' })),
      ]
    : [], [gitStatus]);

  // Keep selectedFiles in sync with allChanges
  useEffect(() => {
    const currentSet = new Set(allChanges.map(c => c.file));
    setSelectedFiles(prev => {
      const next = new Set(prev);
      for (const f of next) {
        if (!currentSet.has(f)) next.delete(f);
      }
      for (const f of currentSet) {
        if (!knownFilesRef.current.has(f)) {
          next.add(f);
          knownFilesRef.current.add(f);
        }
      }
      return next;
    });
  }, [allChanges]);

  return {
    gitStatus,
    gitLoading,
    setGitLoading,
    gitError,
    commitMsg,
    setCommitMsg,
    remoteUrl,
    setRemoteUrl,
    actionLoading,
    branches,
    diffView,
    diffLoading,
    diffChoices,
    setDiffChoices,
    applyingDiff,
    lastSynced,
    selectedFiles,
    setSelectedFiles,
    fetchStatus,
    doAction,
    computeDiff,
    applyDiff,
    allChanges,
  };
}
