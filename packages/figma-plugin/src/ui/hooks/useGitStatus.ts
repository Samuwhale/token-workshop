import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { describeError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

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
  doAction: (action: string, body?: any) => Promise<Record<string, any>>;
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
      } catch (err) {
        console.warn('[useGitStatus] status fetch failed:', err);
        setGitStatus({ isRepo: false, branch: null, remote: null, status: null });
      }
      try {
        const branchData = await apiFetch<{ branches: string[] }>(`${serverUrl}/api/sync/branches`, { signal });
        setBranches(branchData.branches || []);
      } catch (err) {
        console.warn('[useGitStatus] branch fetch failed (non-fatal):', err);
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

  // Relative time ticker for lastSynced display
  useEffect(() => {
    if (!lastSynced) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const doAction = useCallback(async (action: string, body?: any): Promise<Record<string, any>> => {
    setActionLoading(action);
    setGitError(null);
    try {
      const result = await apiFetch<Record<string, any>>(`${serverUrl}/api/sync/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }) ?? {};
      if (action === 'push' || action === 'pull') setLastSynced(new Date());
      fetchStatus();
      return result;
    } catch (err) {
      setGitError(describeError(err, `Git ${action}`));
      throw err;
    } finally {
      setActionLoading(null);
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
