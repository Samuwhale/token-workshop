import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { describeError, isAbortError } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';

type GitActionResponse = Record<string, unknown>;
type GitActionResult = GitActionResponse | null;

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
    ahead: number;
    behind: number;
  } | null;
}

interface UseGitStatusOptions {
  serverUrl: string;
  connected: boolean;
}

export interface UseGitStatusReturn {
  gitStatus: GitStatus | null;
  gitLoading: boolean;
  setGitLoading: (v: boolean) => void;
  gitError: string | null;
  setGitError: (v: string | null) => void;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  branches: string[];
  actionLoading: string | null;
  setActionLoading: (v: string | null) => void;
  lastSynced: Date | null;
  setLastSynced: (v: Date | null) => void;
  selectedFiles: Set<string>;
  setSelectedFiles: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  allChanges: Array<{ file: string; status: string }>;
  fetchStatus: () => Promise<void>;
  doAction: (action: string, body?: unknown) => Promise<GitActionResult>;
}

export function useGitStatus({ serverUrl, connected }: UseGitStatusOptions): UseGitStatusReturn {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const knownFilesRef = useRef<Set<string>>(new Set());
  const fetchAbortRef = useRef<AbortController | null>(null);
  const actionAbortRef = useRef<AbortController | null>(null);

  const resetGitState = useCallback(() => {
    setGitStatus(null);
    setGitError(null);
    setRemoteUrl('');
    setBranches([]);
    setActionLoading(null);
    setSelectedFiles(new Set());
    knownFilesRef.current = new Set();
  }, []);

  const fetchStatus = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;
    if (!connected) {
      resetGitState();
      setGitLoading(false);
      return;
    }

    setGitLoading(true);
    setGitError(null);
    try {
      try {
        const data = await apiFetch<GitStatus>(`${serverUrl}/api/sync/status`, { signal: createFetchSignal(signal) });
        if (signal.aborted) return;
        setGitStatus(data);
        if (data.remote) setRemoteUrl(data.remote);
        else setRemoteUrl('');
      } catch (err) {
        if (isAbortError(err)) throw err;
        if (signal.aborted) return;
        setGitError(describeError(err, 'Fetch git status'));
        setGitStatus({ isRepo: false, branch: null, remote: null, status: null });
        setRemoteUrl('');
        setBranches([]);
      }
      try {
        const branchData = await apiFetch<{ branches: string[] }>(`${serverUrl}/api/sync/branches`, { signal: createFetchSignal(signal) });
        if (signal.aborted) return;
        setBranches(branchData.branches || []);
      } catch (err) {
        if (isAbortError(err)) throw err;
        if (signal.aborted) return;
        console.warn('[useGitStatus] branch fetch failed (non-fatal):', err);
      }
    } catch (err) {
      if (isAbortError(err)) return;
      if (signal.aborted) return;
      setGitError(describeError(err, 'Fetch git status'));
    } finally {
      if (!signal.aborted) {
        setGitLoading(false);
      }
    }
  }, [connected, resetGitState, serverUrl]);

  useEffect(() => {
    fetchStatus();
    return () => {
      fetchAbortRef.current?.abort();
      actionAbortRef.current?.abort();
    };
  }, [fetchStatus]);

  // Relative time ticker for lastSynced display
  useEffect(() => {
    if (!lastSynced) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const doAction = useCallback(async (action: string, body?: unknown): Promise<GitActionResult> => {
    actionAbortRef.current?.abort();
    const controller = new AbortController();
    actionAbortRef.current = controller;
    const { signal } = controller;
    setActionLoading(action);
    setGitError(null);
    try {
      const result = await apiFetch<GitActionResponse>(`${serverUrl}/api/sync/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      }) ?? {};
      if (signal.aborted) {
        return null;
      }
      if (action === 'push' || action === 'pull') setLastSynced(new Date());
      await fetchStatus();
      return result;
    } catch (err) {
      if (isAbortError(err) || signal.aborted) {
        return null;
      }
      setGitError(describeError(err, `Git ${action}`));
      throw err;
    } finally {
      if (!signal.aborted) {
        setActionLoading(null);
      }
    }
  }, [serverUrl, fetchStatus]);

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
    const newFiles = new Set<string>();
    for (const f of currentSet) {
      if (!knownFilesRef.current.has(f)) {
        newFiles.add(f);
      }
    }
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
    setGitError,
    remoteUrl,
    setRemoteUrl,
    branches,
    actionLoading,
    setActionLoading,
    lastSynced,
    setLastSynced,
    selectedFiles,
    setSelectedFiles,
    allChanges,
    fetchStatus,
    doAction,
  };
}
