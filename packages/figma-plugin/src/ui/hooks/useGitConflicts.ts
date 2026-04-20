import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { describeError, isAbortError } from '../shared/utils';
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

interface UseGitConflictsOptions {
  serverUrl: string;
  fetchStatus: () => Promise<void>;
  setGitError: (v: string | null) => void;
  setActionLoading: (v: string | null) => void;
}

export interface UseGitConflictsReturn {
  mergeConflicts: FileConflict[];
  conflictChoices: Record<string, Record<number, 'ours' | 'theirs'>>;
  setConflictChoices: Dispatch<SetStateAction<Record<string, Record<number, 'ours' | 'theirs'>>>>;
  resolvingConflicts: boolean;
  fetchConflicts: () => Promise<void>;
  resolveConflicts: () => Promise<void>;
  abortMerge: () => Promise<void>;
}

export function useGitConflicts({
  serverUrl,
  fetchStatus,
  setGitError,
  setActionLoading,
}: UseGitConflictsOptions): UseGitConflictsReturn {
  const [mergeConflicts, setMergeConflicts] = useState<FileConflict[]>([]);
  const [conflictChoices, setConflictChoices] = useState<Record<string, Record<number, 'ours' | 'theirs'>>>({});
  const [resolvingConflicts, setResolvingConflicts] = useState(false);

  const fetchAbortRef = useRef<AbortController | null>(null);
  // Abort any in-flight conflict fetch on unmount
  useEffect(() => () => { fetchAbortRef.current?.abort(); }, []);

  const fetchConflicts = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const data = await apiFetch<{ conflicts: FileConflict[] }>(`${serverUrl}/api/sync/conflicts`, { signal: controller.signal });
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
    } catch (err) {
      if (isAbortError(err)) return;
      console.warn('[useGitConflicts] fetch failed:', err);
    }
  }, [serverUrl]);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

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
      dispatchToast('Merge conflicts resolved', 'success');
      await fetchStatus();
    } catch (err) {
      setGitError(describeError(err, 'Resolve conflicts'));
    } finally {
      setResolvingConflicts(false);
    }
  }, [serverUrl, mergeConflicts, conflictChoices, fetchStatus, setGitError]);

  const abortMerge = useCallback(async () => {
    setActionLoading('abort');
    setGitError(null);
    try {
      await apiFetch(`${serverUrl}/api/sync/conflicts/abort`, { method: 'POST' });
      setMergeConflicts([]);
      setConflictChoices({});
      dispatchToast('Merge aborted', 'success');
      await fetchStatus();
    } catch (err) {
      setGitError(describeError(err, 'Abort merge'));
    } finally {
      setActionLoading(null);
    }
  }, [serverUrl, fetchStatus, setGitError, setActionLoading]);

  return {
    mergeConflicts,
    conflictChoices,
    setConflictChoices,
    resolvingConflicts,
    fetchConflicts,
    resolveConflicts,
    abortMerge,
  };
}
