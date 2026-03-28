import { useState, useCallback } from 'react';
import { describeError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

interface UseGitDiffOptions {
  serverUrl: string;
  fetchStatus: () => Promise<void>;
  setGitError: (v: string | null) => void;
}

export interface TokenChange {
  path: string;
  set: string;
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

export interface UseGitDiffReturn {
  diffView: { localOnly: string[]; remoteOnly: string[]; conflicts: string[] } | null;
  diffLoading: boolean;
  diffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  setDiffChoices: (v: Record<string, 'push' | 'pull' | 'skip'>) => void;
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
  }, [serverUrl, setGitError]);

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
  }, [serverUrl, diffChoices, fetchStatus, setGitError]);

  const fetchTokenPreview = useCallback(async () => {
    setTokenPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<{ changes: TokenChange[]; fileCount: number }>(`${serverUrl}/api/sync/diff/tokens`);
      setTokenPreview(data.changes ?? []);
    } catch (err) {
      setGitError(describeError(err, 'Token preview'));
    } finally {
      setTokenPreviewLoading(false);
    }
  }, [serverUrl, setGitError]);

  const clearTokenPreview = useCallback(() => {
    setTokenPreview(null);
  }, []);

  const fetchPushPreview = useCallback(async () => {
    setPushPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<GitPreview>(`${serverUrl}/api/sync/push/preview`);
      setPushPreview(data);
    } catch (err) {
      setGitError(describeError(err, 'Push preview'));
    } finally {
      setPushPreviewLoading(false);
    }
  }, [serverUrl, setGitError]);

  const clearPushPreview = useCallback(() => {
    setPushPreview(null);
  }, []);

  const fetchPullPreview = useCallback(async () => {
    setPullPreviewLoading(true);
    setGitError(null);
    try {
      const data = await apiFetch<GitPreview>(`${serverUrl}/api/sync/pull/preview`);
      setPullPreview(data);
    } catch (err) {
      setGitError(describeError(err, 'Pull preview'));
    } finally {
      setPullPreviewLoading(false);
    }
  }, [serverUrl, setGitError]);

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
