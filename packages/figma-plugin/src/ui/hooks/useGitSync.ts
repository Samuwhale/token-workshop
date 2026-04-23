import { useState, useCallback, useEffect, useRef } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { useGitStatus } from './useGitStatus';
import { useGitConflicts } from './useGitConflicts';
import { useGitDiff } from './useGitDiff';

export type { ConflictRegion, FileConflict } from './useGitConflicts';
export type { GitStatus } from './useGitStatus';

interface UseGitSyncOptions {
  serverUrl: string;
  connected: boolean;
}

function getConflictCount(result: Record<string, unknown>): number {
  const conflicts = result.conflicts;
  return Array.isArray(conflicts) ? conflicts.length : 0;
}

/** Generate a human-readable commit message from the list of changed files. */
export function generateCommitMessage(changes: Array<{ file: string; status: string }>): string {
  const collectionId = (file: string) => file.replace(/\.tokens\.json$/, '').replace(/^.*\//, '');
  const listNames = (files: string[]) => {
    const names = files.map(collectionId);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  };

  const modified = changes.filter(c => c.status === 'M').map(c => c.file);
  const added = changes.filter(c => c.status === 'A' || c.status === '?').map(c => c.file);
  const deleted = changes.filter(c => c.status === 'D').map(c => c.file);

  const parts: string[] = [];
  if (modified.length > 0) parts.push(`Update ${listNames(modified)}`);
  if (added.length > 0) parts.push(`Add ${listNames(added)}`);
  if (deleted.length > 0) parts.push(`Remove ${listNames(deleted)}`);

  return parts.join('; ') || 'Update token files';
}

export function useGitSync({ serverUrl, connected }: UseGitSyncOptions) {
  const [commitMsg, setCommitMsg] = useState('');
  const commitMsgUserEdited = useRef(false);

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

  // Auto-generate commit message when changes appear (unless user has typed their own)
  useEffect(() => {
    if (!commitMsgUserEdited.current) {
      setCommitMsg(allChanges.length > 0 ? generateCommitMessage(allChanges) : '');
    }
  }, [allChanges]);

  const handleSetCommitMsg = useCallback((msg: string) => {
    commitMsgUserEdited.current = true;
    setCommitMsg(msg);
  }, []);

  const regenerateCommitMsg = useCallback(() => {
    commitMsgUserEdited.current = false;
    setCommitMsg(generateCommitMessage(allChanges));
  }, [allChanges]);

  // Wrap doAction to handle pull-specific conflict & notification logic
  const doAction = useCallback(async (action: string, body?: unknown) => {
    try {
      const result = await doActionRaw(action, body);
      if (result === null) {
        return;
      }
      const conflictCount = getConflictCount(result);
      const versionsDestination = {
        action: undefined,
        destination: {
          kind: "workspace",
          topTab: "library",
          subTab: "history",
        },
      } as const;
      if (action === 'pull' && conflictCount > 0) {
        await fetchConflicts();
        dispatchToast(
          `Pull completed with ${conflictCount} conflict(s)`,
          'success',
          versionsDestination,
        );
      } else {
        dispatchToast(`Git ${action} completed`, 'success', versionsDestination);
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
    setCommitMsg: handleSetCommitMsg,
    regenerateCommitMsg,
    commitMsgUserEdited,
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
