import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { describeError, isAbortError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

interface UseGitDiffOptions {
  serverUrl: string;
  fetchStatus: () => Promise<void>;
  setGitError: (v: string | null) => void;
}

export interface TokenChange {
  path: string;
  collectionId: string;
  type: string;
  status: 'added' | 'modified' | 'removed';
  before?: any;
  after?: any;
}

export interface GitPreviewCommit {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface GitPreview {
  commits: GitPreviewCommit[];
  changes: TokenChange[];
  fileCount: number;
}

interface ServerTokenChange {
  path: string;
  collectionId: string;
  type: string;
  status: "added" | "modified" | "removed";
  before?: any;
  after?: any;
}

interface ServerGitPreview {
  commits: GitPreviewCommit[];
  changes: ServerTokenChange[];
  fileCount: number;
}

interface ApplyDiffResponse {
  ok: boolean;
  applied: boolean;
  pullFailedFiles: string[];
  pullCommitFailed: boolean;
  pullCommitError?: string;
  pushCommitFailed: boolean;
  pushCommitError?: string;
  pushFailed: boolean;
  pushError?: string;
}

export interface UseGitDiffReturn {
  diffView: { localOnly: string[]; remoteOnly: string[]; conflicts: string[] } | null;
  diffLoading: boolean;
  diffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  setDiffChoices: Dispatch<SetStateAction<Record<string, 'push' | 'pull' | 'skip'>>>;
  applyingDiff: boolean;
  tokenPreview: TokenChange[] | null;
  tokenPreviewLoading: boolean;
  pushPreview: GitPreview | null;
  pushPreviewLoading: boolean;
  pullPreview: GitPreview | null;
  pullPreviewLoading: boolean;
  computeDiff: () => Promise<void>;
  applyDiff: () => Promise<void>;
  fetchTokenPreview: () => Promise<void>;
  clearTokenPreview: () => void;
  fetchPushPreview: () => Promise<void>;
  clearPushPreview: () => void;
  fetchPullPreview: () => Promise<void>;
  clearPullPreview: () => void;
}

export function useGitDiff({
  serverUrl,
  fetchStatus,
  setGitError,
}: UseGitDiffOptions): UseGitDiffReturn {
  const [diffView, setDiffView] = useState<{ localOnly: string[]; remoteOnly: string[]; conflicts: string[] } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffChoices, setDiffChoices] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<TokenChange[] | null>(null);
  const [tokenPreviewLoading, setTokenPreviewLoading] = useState(false);
  const [pushPreview, setPushPreview] = useState<GitPreview | null>(null);
  const [pushPreviewLoading, setPushPreviewLoading] = useState(false);
  const [pullPreview, setPullPreview] = useState<GitPreview | null>(null);
  const [pullPreviewLoading, setPullPreviewLoading] = useState(false);

  const unmountRef = useRef<AbortController>(new AbortController());
  // Create a fresh controller on each mount so remounts don't inherit a permanently-aborted signal.
  useEffect(() => {
    unmountRef.current = new AbortController();
    const controller = unmountRef.current;
    return () => controller.abort();
  }, []);

  const mapServerChange = useCallback(
    (change: ServerTokenChange): TokenChange => ({
      path: change.path,
      collectionId: change.collectionId,
      type: change.type,
      status: change.status,
      before: change.before,
      after: change.after,
    }),
    [],
  );

  const computeDiff = useCallback(async () => {
    setDiffLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<{ localOnly: string[]; remoteOnly: string[]; conflicts: string[] }>(`${serverUrl}/api/sync/diff`, { signal: unmountRef.current.signal });
      setDiffView(data);
      const choices: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const f of data.localOnly) choices[f] = 'push';
      for (const f of data.remoteOnly) choices[f] = 'pull';
      for (const f of data.conflicts) choices[f] = 'skip';
      setDiffChoices(choices);
    } catch (err) {
      if (isAbortError(err)) return;
      setGitError(describeError(err, 'Compute diff'));
    } finally {
      if (!unmountRef.current.signal.aborted) setDiffLoading(false);
    }
  }, [serverUrl, setGitError]);

  const applyDiff = useCallback(async () => {
    setApplyingDiff(true);
    setGitError(null);
    try {
      const result = await apiFetch<ApplyDiffResponse>(`${serverUrl}/api/sync/apply-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices: diffChoices }),
      });
      const errors: string[] = [];
      if (result.pullFailedFiles.length > 0) {
        errors.push(`Failed to pull ${result.pullFailedFiles.length} file(s): ${result.pullFailedFiles.join(', ')}`);
      }
      if (result.pullCommitFailed) {
        errors.push('Pull commit failed' + (result.pullCommitError ? `: ${result.pullCommitError}` : ''));
      }
      if (result.pushCommitFailed) {
        errors.push('Push commit failed' + (result.pushCommitError ? `: ${result.pushCommitError}` : ''));
      }
      if (result.pushFailed) {
        errors.push('Push to remote failed' + (result.pushError ? `: ${result.pushError}` : ''));
      }
      if (errors.length > 0) {
        setGitError(errors.join('; '));
        // Refresh the diff view to reflect what was actually applied vs what remains
        computeDiff();
      } else {
        setDiffView(null);
        fetchStatus();
      }
    } catch (err) {
      setGitError(describeError(err, 'Apply diff'));
    } finally {
      setApplyingDiff(false);
    }
  }, [serverUrl, diffChoices, fetchStatus, setGitError, computeDiff]);

  const fetchTokenPreview = useCallback(async () => {
    setTokenPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<{ changes: ServerTokenChange[]; fileCount: number }>(`${serverUrl}/api/sync/diff/tokens`, { signal: unmountRef.current.signal });
      setTokenPreview((data.changes ?? []).map(mapServerChange));
    } catch (err) {
      if (isAbortError(err)) return;
      setGitError(describeError(err, 'Token preview'));
    } finally {
      if (!unmountRef.current.signal.aborted) setTokenPreviewLoading(false);
    }
  }, [mapServerChange, serverUrl, setGitError]);

  const clearTokenPreview = useCallback(() => {
    setTokenPreview(null);
  }, []);

  const fetchPushPreview = useCallback(async () => {
    setPushPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<ServerGitPreview>(`${serverUrl}/api/sync/push/preview`, { signal: unmountRef.current.signal });
      setPushPreview({
        ...data,
        changes: (data.changes ?? []).map(mapServerChange),
      });
    } catch (err) {
      if (isAbortError(err)) return;
      setGitError(describeError(err, 'Push preview'));
    } finally {
      if (!unmountRef.current.signal.aborted) setPushPreviewLoading(false);
    }
  }, [mapServerChange, serverUrl, setGitError]);

  const clearPushPreview = useCallback(() => {
    setPushPreview(null);
  }, []);

  const fetchPullPreview = useCallback(async () => {
    setPullPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<ServerGitPreview>(`${serverUrl}/api/sync/pull/preview`, { signal: unmountRef.current.signal });
      setPullPreview({
        ...data,
        changes: (data.changes ?? []).map(mapServerChange),
      });
    } catch (err) {
      if (isAbortError(err)) return;
      setGitError(describeError(err, 'Pull preview'));
    } finally {
      if (!unmountRef.current.signal.aborted) setPullPreviewLoading(false);
    }
  }, [mapServerChange, serverUrl, setGitError]);

  const clearPullPreview = useCallback(() => {
    setPullPreview(null);
  }, []);

  return {
    diffView,
    diffLoading,
    diffChoices,
    setDiffChoices,
    applyingDiff,
    tokenPreview,
    tokenPreviewLoading,
    pushPreview,
    pushPreviewLoading,
    pullPreview,
    pullPreviewLoading,
    computeDiff,
    applyDiff,
    fetchTokenPreview,
    clearTokenPreview,
    fetchPushPreview,
    clearPushPreview,
    fetchPullPreview,
    clearPullPreview,
  };
}
