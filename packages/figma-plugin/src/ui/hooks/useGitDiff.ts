import { useState, useCallback } from 'react';
import { describeError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

interface UseGitDiffOptions {
  serverUrl: string;
  fetchStatus: () => Promise<void>;
  setGitError: (v: string | null) => void;
}

export interface UseGitDiffReturn {
  diffView: { localOnly: string[]; remoteOnly: string[]; conflicts: string[] } | null;
  diffLoading: boolean;
  diffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  setDiffChoices: (v: Record<string, 'push' | 'pull' | 'skip'>) => void;
  applyingDiff: boolean;
  tokenPreview: Array<{
    path: string;
    set: string;
    type: string;
    status: 'added' | 'modified' | 'removed';
    before?: any;
    after?: any;
  }> | null;
  tokenPreviewLoading: boolean;
  computeDiff: () => Promise<void>;
  applyDiff: () => Promise<void>;
  fetchTokenPreview: () => Promise<void>;
  clearTokenPreview: () => void;
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
  const [tokenPreview, setTokenPreview] = useState<Array<{
    path: string;
    set: string;
    type: string;
    status: 'added' | 'modified' | 'removed';
    before?: any;
    after?: any;
  }> | null>(null);
  const [tokenPreviewLoading, setTokenPreviewLoading] = useState(false);

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
      const data = await apiFetch<{ changes: typeof tokenPreview; fileCount: number }>(`${serverUrl}/api/sync/diff/tokens`);
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

  return {
    diffView,
    diffLoading,
    diffChoices,
    setDiffChoices,
    applyingDiff,
    tokenPreview,
    tokenPreviewLoading,
    computeDiff,
    applyDiff,
    fetchTokenPreview,
    clearTokenPreview,
  };
}
