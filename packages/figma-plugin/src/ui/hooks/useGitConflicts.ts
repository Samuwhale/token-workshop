import { useState, useEffect, useCallback } from 'react';
import { describeError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import type { FileConflict } from './useGitSync';

interface UseGitConflictsOptions {
  serverUrl: string;
  fetchStatus: () => Promise<void>;
  setGitError: (v: string | null) => void;
  setActionLoading: (v: string | null) => void;
}

export interface UseGitConflictsReturn {
  mergeConflicts: FileConflict[];
  conflictChoices: Record<string, Record<number, 'ours' | 'theirs'>>;
  setConflictChoices: (v: Record<string, Record<number, 'ours' | 'theirs'>>) => void;
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
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Merge conflicts resolved' } }, '*');
      fetchStatus();
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
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Merge aborted' } }, '*');
      fetchStatus();
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
