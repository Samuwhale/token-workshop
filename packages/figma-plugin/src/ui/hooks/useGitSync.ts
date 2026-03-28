import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { describeError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

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
  const [tokenPreview, setTokenPreview] = useState<Array<{
    path: string;
    set: string;
    type: string;
    status: 'added' | 'modified' | 'removed';
    before?: any;
    after?: any;
  }> | null>(null);
  const [tokenPreviewLoading, setTokenPreviewLoading] = useState(false);
  const knownFilesRef = useRef<Set<string>>(new Set());
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;
    if (!connected) { setGitLoading(false); return; }
    try {
      try {
        const data = await apiFetch<GitStatus>(`${serverUrl}/api/sync/status`, { signal });
        setGitStatus(data);
        if (data.remote) setRemoteUrl(data.remote);
      } catch {
        setGitStatus({ isRepo: false, branch: null, remote: null, status: null });
      }
      try {
        const branchData = await apiFetch<{ branches: string[] }>(`${serverUrl}/api/sync/branches`, { signal });
        setBranches(branchData.branches || []);
      } catch {
        // Branch fetch failure is non-fatal
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setGitError(describeError(err, 'Fetch git status'));
    } finally {
      if (!signal.aborted) setGitLoading(false);
    }
  }, [serverUrl, connected]);

  const fetchConflicts = useCallback(async () => {
    try {
      const data = await apiFetch<{ conflicts: FileConflict[] }>(`${serverUrl}/api/sync/conflicts`);
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
    } catch {
      // Conflict fetch failure is non-fatal
    }
  }, [serverUrl]);

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

  const resolveConflicts = useCallback(async () => {
    setResolvingConflicts(true);
    setGitError(null);
    try {
      const resolutions = mergeConflicts.map(c => ({
        file: c.file,
        choices: conflictChoices[c.file] || {},
      }));
      await apiFetch(`${serverUrl}/api/sync/conflicts/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutions }),
      });
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
      await apiFetch(`${serverUrl}/api/sync/conflicts/abort`, { method: 'POST' });
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
      const result = await apiFetch<Record<string, any>>(`${serverUrl}/api/sync/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }) ?? {};
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
      const data = await apiFetch<{ localOnly: string[]; remoteOnly: string[]; conflicts: string[] }>(`${serverUrl}/api/sync/diff`);
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
      await apiFetch(`${serverUrl}/api/sync/apply-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices: diffChoices }),
      });
      setDiffView(null);
      fetchStatus();
    } catch (err) {
      setGitError(describeError(err, 'Apply diff'));
    } finally {
      setApplyingDiff(false);
    }
  }, [serverUrl, diffChoices, fetchStatus]);

  const fetchTokenPreview = useCallback(async () => {
    setTokenPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<{ changes: typeof tokenPreview; fileCount: number }>(`${serverUrl}/api/sync/diff/tokens`);
      setTokenPreview(data.changes ?? []);
    } catch (err) {
      setGitError(describeError(err, 'Token preview'));
    } finally {
      setTokenPreviewLoading(false);
    }
  }, [serverUrl]);

  const clearTokenPreview = useCallback(() => {
    setTokenPreview(null);
  }, []);

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
    // Determine newly seen files before the state update (ref mutation must stay outside the updater)
    const newFiles = new Set<string>();
    for (const f of currentSet) {
      if (!knownFilesRef.current.has(f)) {
        newFiles.add(f);
      }
    }
    // Mark new files as known outside the updater so StrictMode replays are safe
    for (const f of newFiles) {
      knownFilesRef.current.add(f);
    }
    setSelectedFiles(prev => {
      const next = new Set(prev);
      for (const f of next) {
        if (!currentSet.has(f)) next.delete(f);
      }
      for (const f of newFiles) {
        next.add(f);
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
    tokenPreview,
    tokenPreviewLoading,
    fetchTokenPreview,
    clearTokenPreview,
  };
}
