import { useState, useCallback } from 'react';
import { useGitStatus } from './useGitStatus';
import { useGitConflicts } from './useGitConflicts';
import { useGitDiff } from './useGitDiff';

export type { ConflictRegion, FileConflict } from './useGitConflicts';
export type { GitStatus } from './useGitStatus';

interface UseGitSyncOptions {
  serverUrl: string;
  connected: boolean;
}

export function useGitSync({ serverUrl, connected }: UseGitSyncOptions) {
  const [commitMsg, setCommitMsg] = useState('');

  const {
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
    selectedFiles,
    setSelectedFiles,
    allChanges,
    fetchStatus,
    doAction: doActionRaw,
  } = useGitStatus({ serverUrl, connected });

  const {
    mergeConflicts,
    conflictChoices,
    setConflictChoices,
    resolvingConflicts,
    fetchConflicts,
    resolveConflicts,
    abortMerge,
  } = useGitConflicts({ serverUrl, fetchStatus, setGitError, setActionLoading });

  const {
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
  } = useGitDiff({ serverUrl, fetchStatus, setGitError });

  // Wrap doAction to handle pull-specific conflict & notification logic
  const doAction = useCallback(async (action: string, body?: any) => {
    try {
      const result = await doActionRaw(action, body);
      if (action === 'pull' && result.conflicts && result.conflicts.length > 0) {
        await fetchConflicts();
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Pull completed with ${result.conflicts.length} conflict(s)` } }, '*');
      } else {
        parent.postMessage({ pluginMessage: { type: 'notify', message: `Git ${action} completed` } }, '*');
      }
    } catch (err) {
      console.warn('[useGitSync] git action failed:', err);
      // If pull fails, still check for conflicts (merge in progress)
      if (action === 'pull') {
        await fetchConflicts();
      }
    }
  }, [doActionRaw, fetchConflicts]);

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
    pushPreview,
    pushPreviewLoading,
    pullPreview,
    pullPreviewLoading,
    fetchPushPreview,
    clearPushPreview,
    fetchPullPreview,
    clearPullPreview,
  };
}
