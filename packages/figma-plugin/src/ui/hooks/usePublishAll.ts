import { useState, useCallback, useMemo } from 'react';
import { describeError } from '../shared/utils';

export type ConfirmAction = 'apply-vars' | 'apply-styles' | 'preview-vars' | 'preview-styles' | 'git-push' | 'git-pull' | 'git-commit' | 'apply-diff' | 'publish-all' | null;

export type PublishAllStep = 'variables' | 'styles' | 'git' | null;

export interface PublishAllSections {
  vars: boolean;
  styles: boolean;
  git: boolean;
}

interface SyncLike {
  checked: boolean;
  loading: boolean;
  syncCount: number;
  computeDiff: () => Promise<void>;
  applyDiff: () => Promise<void>;
}

interface GitSyncLike {
  diffView: any;
  diffLoading: boolean;
  diffChoices: Record<string, string>;
  mergeConflicts: any[];
  computeDiff: () => Promise<void>;
  applyDiff: () => Promise<void>;
}

interface UsePublishAllParams {
  varSync: SyncLike;
  styleSync: SyncLike;
  git: GitSyncLike;
  setConfirmAction: (action: ConfirmAction) => void;
  /** Called after all publish steps complete — typically marks readiness checks as stale. */
  markChecksStale: () => void;
}

export interface UsePublishAllReturn {
  publishAllStep: PublishAllStep;
  publishAllError: string | null;
  publishAllGitSkipped: boolean;
  setPublishAllGitSkipped: React.Dispatch<React.SetStateAction<boolean>>;
  compareAllLoading: boolean;
  hasVarChanges: boolean;
  hasStyleChanges: boolean;
  hasGitDiffChanges: boolean;
  effectiveHasGitDiffChanges: boolean;
  hasMergeConflicts: boolean;
  publishAllSections: number;
  publishAllAvailable: boolean;
  publishAllBusy: boolean;
  gitDiffPendingCount: number;
  handleOpenPublishAll: () => Promise<void>;
  runPublishAll: (sections?: PublishAllSections) => Promise<void>;
  /** One-click sync: auto-compare variables + styles then apply immediately, no preview modal. */
  quickSync: () => Promise<void>;
  quickSyncing: boolean;
}

export function usePublishAll({
  varSync,
  styleSync,
  git,
  setConfirmAction,
  markChecksStale,
}: UsePublishAllParams): UsePublishAllReturn {
  const [publishAllStep, setPublishAllStep] = useState<PublishAllStep>(null);
  const [publishAllError, setPublishAllError] = useState<string | null>(null);
  const [publishAllGitSkipped, setPublishAllGitSkipped] = useState(false);
  const [compareAllLoading, setCompareAllLoading] = useState(false);
  const [quickSyncing, setQuickSyncing] = useState(false);

  const hasVarChanges = varSync.checked && varSync.syncCount > 0;
  const hasStyleChanges = styleSync.checked && styleSync.syncCount > 0;
  const gitDiffPendingCount = useMemo(
    () => Object.values(git.diffChoices).filter(c => c !== 'skip').length,
    [git.diffChoices],
  );
  const hasGitDiffChanges = git.diffView != null && gitDiffPendingCount > 0;
  const hasMergeConflicts = git.mergeConflicts.length > 0;
  // When merge conflicts exist, exclude git from publish-all so Variables + Styles can still proceed
  const effectiveHasGitDiffChanges = hasGitDiffChanges && !hasMergeConflicts;
  const publishAllSections = (hasVarChanges ? 1 : 0) + (hasStyleChanges ? 1 : 0) + (effectiveHasGitDiffChanges ? 1 : 0);
  // Show the Publish All banner when any single compared target has pending changes.
  // Auto-compare is enabled for variables, so this typically appears right after connecting.
  const publishAllAvailable = publishAllSections >= 1;
  const publishAllBusy = publishAllStep !== null;

  // "Publish All" fast path: auto-compare any unchecked targets, then open the combined modal.
  // This lets users click one button to compare everything and confirm in a single step.
  const handleOpenPublishAll = useCallback(async () => {
    const toCompare: Promise<void>[] = [];
    if (!varSync.checked && !varSync.loading) toCompare.push(varSync.computeDiff());
    if (!styleSync.checked && !styleSync.loading) toCompare.push(styleSync.computeDiff());
    if (git.diffView === null && !git.diffLoading) toCompare.push(git.computeDiff());

    if (toCompare.length > 0) {
      setCompareAllLoading(true);
      try {
        await Promise.all(toCompare);
      } catch {
        // Each entity surfaces its own error in its section; we still open the modal.
      } finally {
        setCompareAllLoading(false);
      }
    }
    setConfirmAction('publish-all');
  }, [varSync.checked, varSync.loading, varSync.computeDiff, styleSync.checked, styleSync.loading, styleSync.computeDiff, git.diffView, git.diffLoading, git.computeDiff, setConfirmAction]);

  const runPublishAll = useCallback(async (sections: PublishAllSections = { vars: true, styles: true, git: true }) => {
    setPublishAllError(null);
    setPublishAllGitSkipped(false);

    try {
      if (sections.vars && hasVarChanges) {
        setPublishAllStep('variables');
        await varSync.applyDiff();
      }
      if (sections.styles && hasStyleChanges) {
        setPublishAllStep('styles');
        await styleSync.applyDiff();
      }
      // Skip git when merge conflicts exist — partial publish (Variables + Styles only)
      if (sections.git && hasGitDiffChanges && !hasMergeConflicts) {
        setPublishAllStep('git');
        await git.applyDiff();
      } else if (sections.git && hasMergeConflicts && hasGitDiffChanges) {
        setPublishAllGitSkipped(true);
      }
      markChecksStale();
    } catch (err) {
      setPublishAllError(describeError(err));
    } finally {
      setPublishAllStep(null);
    }
  }, [hasVarChanges, hasStyleChanges, hasGitDiffChanges, hasMergeConflicts, varSync.applyDiff, styleSync.applyDiff, git.applyDiff, markChecksStale]);

  // One-click "Sync all changes": auto-compare variables + styles, then apply immediately.
  // Git is intentionally excluded — git operations (push/pull/commit) require deliberate review.
  // applyDiff reads from rowsRef/dirsRef which computeDiff updates synchronously,
  // so calling applyDiff right after computeDiff sees the fresh computed rows.
  const quickSync = useCallback(async () => {
    setPublishAllError(null);
    setQuickSyncing(true);
    setCompareAllLoading(true);

    try {
      const toCompare: Promise<void>[] = [];
      if (!varSync.checked && !varSync.loading) toCompare.push(varSync.computeDiff());
      if (!styleSync.checked && !styleSync.loading) toCompare.push(styleSync.computeDiff());
      if (toCompare.length > 0) {
        await Promise.all(toCompare);
      }
    } catch {
      // Each entity surfaces its own error; continue to apply what we can
    } finally {
      setCompareAllLoading(false);
    }

    try {
      setPublishAllStep('variables');
      await varSync.applyDiff();
      setPublishAllStep('styles');
      await styleSync.applyDiff();
      markChecksStale();
    } catch (err) {
      setPublishAllError(describeError(err));
    } finally {
      setPublishAllStep(null);
      setQuickSyncing(false);
    }
  }, [varSync.checked, varSync.loading, varSync.computeDiff, varSync.applyDiff, styleSync.checked, styleSync.loading, styleSync.computeDiff, styleSync.applyDiff, markChecksStale]);

  return {
    publishAllStep,
    publishAllError,
    publishAllGitSkipped,
    setPublishAllGitSkipped,
    compareAllLoading,
    hasVarChanges,
    hasStyleChanges,
    hasGitDiffChanges,
    effectiveHasGitDiffChanges,
    hasMergeConflicts,
    publishAllSections,
    publishAllAvailable,
    publishAllBusy,
    gitDiffPendingCount,
    handleOpenPublishAll,
    runPublishAll,
    quickSync,
    quickSyncing,
  };
}
