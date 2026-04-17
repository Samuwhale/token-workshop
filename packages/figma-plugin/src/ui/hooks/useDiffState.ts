import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { STORAGE_KEYS } from '../shared/storage';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import { usePersistedJsonState } from './usePersistedState';

interface TokenChange {
  path: string;
  collectionId: string;
  type: string;
  status: 'added' | 'modified' | 'removed';
}

interface UseDiffStateOptions {
  serverUrl: string;
  connected: boolean;
}

export interface DiffState {
  changesOnly: boolean;
  setChangesOnly: Dispatch<SetStateAction<boolean>>;
  diffLoading: boolean;
  setDiffLoading: Dispatch<SetStateAction<boolean>>;
  diffError: string | null;
  setDiffError: Dispatch<SetStateAction<string | null>>;
  diffPaths: string[] | null;
  setDiffPaths: Dispatch<SetStateAction<string[] | null>>;
  isGitRepo: boolean | undefined;
  setIsGitRepo: Dispatch<SetStateAction<boolean | undefined>>;
  lastExportTimestamp: number | null;
  setLastExportTimestamp: Dispatch<SetStateAction<number | null>>;
  scopeOpen: boolean;
  setScopeOpen: Dispatch<SetStateAction<boolean>>;
  fetchDiff: () => Promise<void>;
  fetchDiffSince: (timestamp: number) => Promise<void>;
  handleSetBaseline: () => void;
}

export function useDiffState({ serverUrl, connected }: UseDiffStateOptions): DiffState {
  const [changesOnly, setChangesOnly] = usePersistedJsonState<boolean>(
    STORAGE_KEYS.EXPORT_CHANGES_ONLY,
    false,
  );
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  // null = not yet fetched, string[] = fetched paths (added/modified only)
  const [diffPaths, setDiffPaths] = useState<string[] | null>(null);
  // undefined = not yet checked, false = not a git repo, true = is a git repo
  const [isGitRepo, setIsGitRepo] = useState<boolean | undefined>(undefined);
  const [lastExportTimestamp, setLastExportTimestamp] = usePersistedJsonState<number | null>(
    STORAGE_KEYS.EXPORT_LAST_EXPORT_TIMESTAMP,
    null,
  );
  const [scopeOpen, setScopeOpen] = useState(() => changesOnly);

  const fetchDiffSince = useCallback(async (timestamp: number) => {
    if (!connected) return;
    setDiffLoading(true);
    setDiffError(null);
    setDiffPaths(null);
    try {
      const data = await apiFetch<{ changes: TokenChange[]; fileCount: number }>(
        `${serverUrl}/api/sync/diff/tokens/since?timestamp=${timestamp}`,
      );
      const paths = data.changes
        .filter(c => c.status === 'added' || c.status === 'modified')
        .map(c => c.path);
      setDiffPaths(paths);
    } catch (err) {
      setDiffError(getErrorMessage(err));
    } finally {
      setDiffLoading(false);
    }
  }, [connected, serverUrl]);

  const fetchDiff = useCallback(async () => {
    if (!connected) return;
    setDiffLoading(true);
    setDiffError(null);
    setDiffPaths(null);
    try {
      const data = await apiFetch<{ changes: TokenChange[]; fileCount: number }>(
        `${serverUrl}/api/sync/diff/tokens`,
      );
      const paths = data.changes
        .filter(c => c.status === 'added' || c.status === 'modified')
        .map(c => c.path);
      setDiffPaths(paths);
      setIsGitRepo(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Not a git repo — try timestamp-based fallback if a baseline is set
        setIsGitRepo(false);
        if (lastExportTimestamp !== null) {
          await fetchDiffSince(lastExportTimestamp);
        } else {
          setDiffError(null);
          setDiffPaths(null);
        }
      } else {
        setDiffError(getErrorMessage(err));
      }
    } finally {
      setDiffLoading(false);
    }
  }, [connected, fetchDiffSince, lastExportTimestamp, serverUrl]);

  const handleSetBaseline = useCallback(() => {
    const now = Date.now();
    setLastExportTimestamp(now);
    // Immediately fetch diff from the new baseline (should return 0 changed tokens)
    void fetchDiffSince(now);
  }, [fetchDiffSince, setLastExportTimestamp]);

  // Auto-fetch diff when changesOnly is enabled and connected
  useEffect(() => {
    if (changesOnly && connected && diffPaths === null && !diffLoading) {
      void fetchDiff();
    }
  }, [changesOnly, connected, diffLoading, diffPaths, fetchDiff]);

  return {
    changesOnly,
    setChangesOnly,
    diffLoading,
    setDiffLoading,
    diffError,
    setDiffError,
    diffPaths,
    setDiffPaths,
    isGitRepo,
    setIsGitRepo,
    lastExportTimestamp,
    setLastExportTimestamp,
    scopeOpen,
    setScopeOpen,
    fetchDiff,
    fetchDiffSince,
    handleSetBaseline,
  };
}
