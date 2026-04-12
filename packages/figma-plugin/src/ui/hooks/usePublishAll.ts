import { useState, useCallback } from 'react';
import { describeError } from '../shared/utils';

export type ConfirmAction = 'publish-all' | null;

export type PublishAllStep = 'variables' | 'styles' | null;

export interface PublishAllSections {
  vars: boolean;
  styles: boolean;
}

interface SyncLike {
  checked: boolean;
  loading: boolean;
  syncCount: number;
  computeDiff: () => Promise<void>;
  applyDiff: () => Promise<void>;
}

interface UsePublishAllParams {
  varSync: SyncLike;
  styleSync: SyncLike;
  setConfirmAction: (action: ConfirmAction) => void;
  /** Called after all publish steps complete — typically marks readiness checks as stale. */
  markChecksStale: () => void;
  canProceed: boolean;
  blockedMessage: string;
}

export interface UsePublishAllReturn {
  publishAllStep: PublishAllStep;
  publishAllError: string | null;
  compareAllLoading: boolean;
  hasVarChanges: boolean;
  hasStyleChanges: boolean;
  publishAllSections: number;
  publishAllAvailable: boolean;
  publishAllBusy: boolean;
  handleOpenPublishAll: () => Promise<void>;
  runPublishAll: (sections?: PublishAllSections) => Promise<void>;
  /** Compare both Figma sync targets in parallel without opening a modal or applying changes. */
  compareAll: () => Promise<void>;
  /** One-click sync: auto-compare variables + styles then apply immediately, no preview modal. */
  quickSync: () => Promise<void>;
  quickSyncing: boolean;
}

export function usePublishAll({
  varSync,
  styleSync,
  setConfirmAction,
  markChecksStale,
  canProceed,
  blockedMessage,
}: UsePublishAllParams): UsePublishAllReturn {
  const [publishAllStep, setPublishAllStep] = useState<PublishAllStep>(null);
  const [publishAllError, setPublishAllError] = useState<string | null>(null);
  const [compareAllLoading, setCompareAllLoading] = useState(false);
  const [quickSyncing, setQuickSyncing] = useState(false);

  const hasVarChanges = varSync.checked && varSync.syncCount > 0;
  const hasStyleChanges = styleSync.checked && styleSync.syncCount > 0;
  const publishAllSections = (hasVarChanges ? 1 : 0) + (hasStyleChanges ? 1 : 0);
  // Show the Publish All banner when any single compared target has pending changes.
  // Auto-compare is enabled for variables, so this typically appears right after connecting.
  const publishAllAvailable = publishAllSections >= 1;
  const publishAllBusy = publishAllStep !== null;

  // "Review sync plan" fast path: compare the Figma destinations first, then open the
  // combined modal.
  const handleOpenPublishAll = useCallback(async () => {
    if (!canProceed) {
      setPublishAllError(blockedMessage);
      return;
    }

    const toCompare: Promise<void>[] = [];
    if (!varSync.checked && !varSync.loading) toCompare.push(varSync.computeDiff());
    if (!styleSync.checked && !styleSync.loading) toCompare.push(styleSync.computeDiff());

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
  }, [blockedMessage, canProceed, setConfirmAction, styleSync, varSync]);

  const runPublishAll = useCallback(async (sections: PublishAllSections = { vars: true, styles: true }) => {
    setPublishAllError(null);
    if (!canProceed) {
      setPublishAllError(blockedMessage);
      return;
    }

    try {
      if (sections.vars && hasVarChanges) {
        setPublishAllStep('variables');
        await varSync.applyDiff();
      }
      if (sections.styles && hasStyleChanges) {
        setPublishAllStep('styles');
        await styleSync.applyDiff();
      }
      markChecksStale();
    } catch (err) {
      setPublishAllError(describeError(err));
    } finally {
      setPublishAllStep(null);
    }
  }, [blockedMessage, canProceed, hasVarChanges, hasStyleChanges, markChecksStale, styleSync, varSync]);

  // "Compare all": force re-run the two Figma sync comparisons in parallel.
  const compareAll = useCallback(async () => {
    if (!canProceed) {
      setPublishAllError(blockedMessage);
      return;
    }

    const toCompare: Promise<void>[] = [];
    if (!varSync.loading) toCompare.push(varSync.computeDiff());
    if (!styleSync.loading) toCompare.push(styleSync.computeDiff());

    if (toCompare.length === 0) return;
    setCompareAllLoading(true);
    try {
      await Promise.all(toCompare);
    } catch {
      // Each entity surfaces its own error in its section.
    } finally {
      setCompareAllLoading(false);
    }
  }, [blockedMessage, canProceed, styleSync, varSync]);

  // One-click "Sync all changes": auto-compare variables + styles, then apply immediately.
  // Git is intentionally excluded — git operations (push/pull/commit) require deliberate review.
  // applyDiff reads from rowsRef/dirsRef which computeDiff updates synchronously,
  // so calling applyDiff right after computeDiff sees the fresh computed rows.
  const quickSync = useCallback(async () => {
    setPublishAllError(null);
    if (!canProceed) {
      setPublishAllError(blockedMessage);
      return;
    }

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
  }, [blockedMessage, canProceed, markChecksStale, styleSync, varSync]);

  return {
    publishAllStep,
    publishAllError,
    compareAllLoading,
    hasVarChanges,
    hasStyleChanges,
    publishAllSections,
    publishAllAvailable,
    publishAllBusy,
    handleOpenPublishAll,
    compareAll,
    runPublishAll,
    quickSync,
    quickSyncing,
  };
}
