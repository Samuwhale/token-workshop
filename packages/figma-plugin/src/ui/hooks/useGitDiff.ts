import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { describeError, isAbortError } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';

interface UseGitDiffOptions {
  serverUrl: string;
  fetchStatus: () => Promise<void>;
  setGitError: (v: string | null) => void;
}

type DiffChoice = 'push' | 'pull' | 'skip';

export interface DiffView {
  localOnly: string[];
  remoteOnly: string[];
  conflicts: string[];
}

export interface TokenChange {
  path: string;
  collectionId: string;
  type: string;
  status: 'added' | 'modified' | 'removed';
  before?: unknown;
  after?: unknown;
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
  before?: unknown;
  after?: unknown;
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
  diffView: DiffView | null;
  diffLoading: boolean;
  diffChoices: Record<string, DiffChoice>;
  setDiffChoices: Dispatch<SetStateAction<Record<string, DiffChoice>>>;
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
  const [diffView, setDiffView] = useState<DiffView | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffChoices, setDiffChoices] = useState<Record<string, DiffChoice>>({});
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<TokenChange[] | null>(null);
  const [tokenPreviewLoading, setTokenPreviewLoading] = useState(false);
  const [pushPreview, setPushPreview] = useState<GitPreview | null>(null);
  const [pushPreviewLoading, setPushPreviewLoading] = useState(false);
  const [pullPreview, setPullPreview] = useState<GitPreview | null>(null);
  const [pullPreviewLoading, setPullPreviewLoading] = useState(false);

  const diffAbortRef = useRef<AbortController | null>(null);
  const applyAbortRef = useRef<AbortController | null>(null);
  const tokenPreviewAbortRef = useRef<AbortController | null>(null);
  const pushPreviewAbortRef = useRef<AbortController | null>(null);
  const pullPreviewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    diffAbortRef.current?.abort();
    applyAbortRef.current?.abort();
    tokenPreviewAbortRef.current?.abort();
    pushPreviewAbortRef.current?.abort();
    pullPreviewAbortRef.current?.abort();
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
    diffAbortRef.current?.abort();
    const controller = new AbortController();
    diffAbortRef.current = controller;
    const { signal } = controller;
    setDiffLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<DiffView>(
        `${serverUrl}/api/sync/diff`,
        { signal: createFetchSignal(signal, 10000) },
      );
      if (signal.aborted) return;
      setDiffView(data);
      const choices: Record<string, DiffChoice> = {};
      for (const f of data.localOnly) choices[f] = 'push';
      for (const f of data.remoteOnly) choices[f] = 'pull';
      for (const f of data.conflicts) choices[f] = 'skip';
      setDiffChoices(choices);
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      setGitError(describeError(err, 'Compute diff'));
    } finally {
      if (!signal.aborted) setDiffLoading(false);
    }
  }, [serverUrl, setGitError]);

  const applyDiff = useCallback(async () => {
    applyAbortRef.current?.abort();
    const controller = new AbortController();
    applyAbortRef.current = controller;
    const { signal } = controller;
    setApplyingDiff(true);
    setGitError(null);
    try {
      const result = await apiFetch<ApplyDiffResponse>(`${serverUrl}/api/sync/apply-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices: diffChoices }),
        signal: createFetchSignal(signal, 30000),
      });
      if (signal.aborted) return;
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
        await computeDiff();
      } else {
        setDiffView(null);
        await fetchStatus();
      }
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      setGitError(describeError(err, 'Apply diff'));
    } finally {
      if (!signal.aborted) {
        setApplyingDiff(false);
      }
    }
  }, [serverUrl, diffChoices, fetchStatus, setGitError, computeDiff]);

  const fetchTokenPreview = useCallback(async () => {
    tokenPreviewAbortRef.current?.abort();
    const controller = new AbortController();
    tokenPreviewAbortRef.current = controller;
    const { signal } = controller;
    setTokenPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<{ changes: ServerTokenChange[]; fileCount: number }>(
        `${serverUrl}/api/sync/diff/tokens`,
        { signal: createFetchSignal(signal, 10000) },
      );
      if (signal.aborted) return;
      setTokenPreview((data.changes ?? []).map(mapServerChange));
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      setGitError(describeError(err, 'Token preview'));
    } finally {
      if (!signal.aborted) setTokenPreviewLoading(false);
    }
  }, [mapServerChange, serverUrl, setGitError]);

  const clearTokenPreview = useCallback(() => {
    setTokenPreview(null);
  }, []);

  const fetchPushPreview = useCallback(async () => {
    pushPreviewAbortRef.current?.abort();
    const controller = new AbortController();
    pushPreviewAbortRef.current = controller;
    const { signal } = controller;
    setPushPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<ServerGitPreview>(
        `${serverUrl}/api/sync/push/preview`,
        { signal: createFetchSignal(signal, 10000) },
      );
      if (signal.aborted) return;
      setPushPreview({
        ...data,
        changes: (data.changes ?? []).map(mapServerChange),
      });
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      setGitError(describeError(err, 'Push preview'));
    } finally {
      if (!signal.aborted) setPushPreviewLoading(false);
    }
  }, [mapServerChange, serverUrl, setGitError]);

  const clearPushPreview = useCallback(() => {
    setPushPreview(null);
  }, []);

  const fetchPullPreview = useCallback(async () => {
    pullPreviewAbortRef.current?.abort();
    const controller = new AbortController();
    pullPreviewAbortRef.current = controller;
    const { signal } = controller;
    setPullPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<ServerGitPreview>(
        `${serverUrl}/api/sync/pull/preview`,
        { signal: createFetchSignal(signal, 10000) },
      );
      if (signal.aborted) return;
      setPullPreview({
        ...data,
        changes: (data.changes ?? []).map(mapServerChange),
      });
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      setGitError(describeError(err, 'Pull preview'));
    } finally {
      if (!signal.aborted) setPullPreviewLoading(false);
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
