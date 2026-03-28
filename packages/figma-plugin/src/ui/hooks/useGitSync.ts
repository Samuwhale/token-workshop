import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { describeError } from '../shared/utils';

export interface ConflictRegion {
  index: number;
  ours: string;
  theirs: string;
}

export interface FileConflict {
  file: string;
  regions: ConflictRegion[];
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
  const [mergeConflicts, setMergeConflicts] = useState<FileConflict[]>([]);
  const [conflictChoices, setConflictChoices] = useState<Record<string, Record<number, 'ours' | 'theirs'>>>({});
  const [resolvingConflicts, setResolvingConflicts] = useState(false);
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
    fetchConflicts();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchStatus, fetchConflicts]);

  useEffect(() => {
    if (!lastSynced) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const fetchConflicts = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrl}/api/sync/conflicts`);
      if (res.ok) {
        const data = await res.json();
        const conflicts: FileConflict[] = data.conflicts || [];
        setMergeConflicts(conflicts);
        // Initialize choices: default all regions to 'theirs' (accept incoming)
        const choices: Record<string, Record<number, 'ours' | 'theirs'>> = {};
        for (const c of conflicts) {
          choices[c.file] = {};
          for (const r of c.regions) {
            choices[c.file][r.index] = 'theirs';
          }
        }
        setConflictChoices(choices);
      }
    } catch {
      // Conflict fetch failure is non-fatal
    }
  }, [serverUrl]);

  const resolveConflicts = useCallback(async () => {
    setResolvingConflicts(true);
    setGitError(null);
    try {
      const resolutions = mergeConflicts.map(c => ({
        file: c.file,
        choices: conflictChoices[c.file] || {},
      }));
      const res = await fetch(`${serverUrl}/api/sync/conflicts/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutions }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to resolve conflicts');
      }
      setMergeConflicts([]);
      setConflictChoices({});
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Merge conflicts resolved' } }, '*');
      fetchStatus();
    } catch (err) {
      setGitError(describeError(err, 'Resolve conflicts'));
    } finally {
      setResolvingConflicts(false);
    }
  }, [serverUrl, mergeConflicts, conflictChoices, fetchStatus]);

  const abortMerge = useCallback(async () => {
    setActionLoading('abort');
    setGitError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/conflicts/abort`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to abort merge');
      setMergeConflicts([]);
      setConflictChoices({});
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Merge aborted' } }, '*');
      fetchStatus();
    } catch (err) {
      setGitError(describeError(err, 'Abort merge'));
    } finally {
      setActionLoading(null);
    }
  }, [serverUrl, fetchStatus]);

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
      const result = await res.json().catch(() => ({}));
      if (action === 'push' || action === 'pull') setLastSynced(new Date());
      // Check for merge conflicts after pull
      if (action === 'pull' && result.conflicts && result.conflicts.length > 0) {
        await fetchConflicts();
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Pull completed with ${result.conflicts.length} conflict(s)` } }, '*');
      } else {
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Git ${action} completed` } }, '*');
      }
      fetchStatus();
    } catch (err) {
      // If pull fails, still check for conflicts (merge in progress)
      if (action === 'pull') {
        await fetchConflicts();
      }
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
    mergeConflicts,
    conflictChoices,
    setConflictChoices,
    resolvingConflicts,
    fetchStatus,
    doAction,
    computeDiff,
    applyDiff,
    fetchConflicts,
    resolveConflicts,
    abortMerge,
    allChanges,
  };
}
