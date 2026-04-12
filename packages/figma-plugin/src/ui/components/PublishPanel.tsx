import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { describeError } from '../shared/utils';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { useSyncEntity, type SyncMessages } from '../hooks/useSyncEntity';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { swatchBgColor } from '../shared/colorUtils';
import { SyncSubPanel } from './publish/SyncSubPanel';
import { SyncPreflightStep } from './publish/SyncPreflightStep';
import { NoticeBanner } from '../shared/noticeSystem';
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from './PanelHelpHint';
import { useOrphanCleanup } from '../hooks/useOrphanCleanup';
import { useReadinessChecks } from '../hooks/useReadinessChecks';
import type { ValidationSnapshot } from '../hooks/useValidationCache';
import { usePublishAll, type ConfirmAction, type PublishAllSections } from '../hooks/usePublishAll';
import { useNavigationContext } from '../contexts/NavigationContext';
import type { VarSnapshot, StyleSnapshot, VariablesAppliedMessage, StylesAppliedMessage, VariablesReadMessage, StylesReadMessage } from '../../shared/types';
import { FIGMA_SCOPES } from './MetadataEditor';
import {
  buildVariablePublishFigmaMap,
  buildPublishPullPayload,
  stylePublishDiffConfig,
  variablePublishDiffConfig,
  type PublishDiffRow as DiffRow,
  type PublishPreflightActionId,
  type SyncWorkflowStage,
  type SyncWorkflowTone,
} from '../shared/syncWorkflow';
import { SyncWorkflowControls } from './publish/SyncWorkflowControls';

// ── Static message configs (stable module-level refs required by useFigmaMessage) ──

const VAR_MESSAGES: SyncMessages<VarSnapshot> = {
  readSendType: 'read-variables', readResponseType: 'variables-read', readTimeout: 10000,
  extractReadResponse: (msg: VariablesReadMessage) => msg.collections ?? [],
  applySendType: 'apply-variables', applyResponseType: 'variables-applied', applyErrorType: 'apply-variables-error', applyTimeout: 30000,
  extractApplySnapshot: (msg: VariablesAppliedMessage) => msg.varSnapshot ?? undefined,
  revertSendType: 'revert-variables', revertResponseType: 'variables-reverted', revertTimeout: 30000,
};

const STYLE_MESSAGES: SyncMessages<StyleSnapshot> = {
  readSendType: 'read-styles', readResponseType: 'styles-read', readErrorType: 'styles-read-error', readTimeout: 10000,
  extractReadResponse: (msg: StylesReadMessage) => msg.tokens ?? [],
  applySendType: 'apply-styles', applyResponseType: 'styles-applied', applyErrorType: 'styles-apply-error', applyTimeout: 15000,
  extractApplySnapshot: (msg: StylesAppliedMessage) => msg.styleSnapshot ?? undefined,
  revertSendType: 'revert-styles', revertResponseType: 'styles-reverted', revertTimeout: 30000,
};


/* ── Types ───────────────────────────────────────────────────────────────── */

interface PublishPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
  refreshValidation: () => Promise<ValidationSnapshot | null>;
  /** Increments whenever tokens are edited — used to detect stale readiness results */
  tokenChangeKey?: number;
  publishPanelHandle?: React.MutableRefObject<PublishPanelHandle | null>;
}

export interface PublishPanelHandle {
  runReadinessChecks: () => void;
  runCompareAll: () => Promise<void>;
  focusStage: (stage: SyncWorkflowStage) => void;
}

/* ── PublishPanel ─────────────────────────────────────────────────────────── */

export function PublishPanel({
  serverUrl,
  connected,
  activeSet,
  collectionMap = {},
  modeMap = {},
  refreshValidation,
  tokenChangeKey,
  publishPanelHandle,
}: PublishPanelProps) {
  const help = usePanelHelp('publish');
  const { navigateTo, setReturnBreadcrumb } = useNavigationContext();

  // ── Rename history for variable name propagation ──
  // Eagerly fetched from the server so applyVariables can rename existing Figma
  // variables instead of creating orphans when tokens are renamed between syncs.
  const renamesRef = useRef<Array<{ oldPath: string; newPath: string }>>([]);
  useEffect(() => {
    if (!connected || !serverUrl) { renamesRef.current = []; return; }
    fetch(`${serverUrl}/api/operations/path-renames`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { renames?: Array<{ oldPath: string; newPath: string }> } | null) => {
        renamesRef.current = data?.renames ?? [];
      })
      .catch(() => { renamesRef.current = []; });
  }, [connected, serverUrl, tokenChangeKey]);

  // ── Section accordion state (persisted across sessions) ──
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('tm_publish_sections');
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
    return new Set(['figma-variables', 'figma-styles']);
  });
  const toggleSection = (id: string) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem('tm_publish_sections', JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });

  // ── Scope overrides: user-edited scopes for variable push rows ──
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, string[]>>({});
  const [preflightActionBusyId, setPreflightActionBusyId] = useState<PublishPreflightActionId | null>(null);
  const preflightRef = useRef<HTMLDivElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const applyRef = useRef<HTMLDivElement | null>(null);

  // ── Extracted hooks ──
  const varSync = useSyncEntity<DiffRow, VarSnapshot>(serverUrl, activeSet, connected, VAR_MESSAGES, {
    progressEventType: 'variable-sync-progress',
    ...variablePublishDiffConfig,
    buildFigmaMap: (collections) => buildVariablePublishFigmaMap(collections, activeSet, collectionMap, modeMap),
    buildPullPayload: buildPublishPullPayload,
    buildApplyPayload: (rows) => ({
      tokens: rows.map(r => {
        const scopes = scopeOverrides[r.path] ?? r.localScopes;
        const extensions = scopes?.length ? { 'com.figma.scopes': scopes } : {};
        return {
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localRaw ?? '',
          $extensions: extensions,
          setName: activeSet,
        };
      }),
      collectionMap, modeMap,
      renames: renamesRef.current.length > 0 ? renamesRef.current : undefined,
    }),
    buildRevertPayload: (snapshot) => ({ varSnapshot: snapshot }),
    onApplySuccess: (result) => {
      if ((result.overwritten ?? 0) > 0) {
        const skippedCount = result.skipped?.length ?? 0;
        const skippedNote = skippedCount > 0 ? ` · ${skippedCount} skipped (unsupported type)` : '';
        dispatchToast(`Variables synced — ${result.created ?? 0} created, ${result.overwritten} updated${skippedNote}`, 'success');
      }
    },
    successMessage: 'Variable sync applied', compareErrorLabel: 'Compare variables', applyErrorLabel: 'Apply variable sync',
    revertSuccessMessage: 'Variable sync reverted', revertErrorMessage: 'Failed to revert variable sync',
  });

  const styleSync = useSyncEntity<DiffRow, StyleSnapshot>(serverUrl, activeSet, connected, STYLE_MESSAGES, {
    progressEventType: 'style-sync-progress',
    ...stylePublishDiffConfig,
    buildPullPayload: buildPublishPullPayload,
    buildApplyPayload: (rows) => ({ tokens: rows.map(r => ({ path: r.path, $type: r.localType ?? 'string', $value: r.localRaw })) }),
    buildRevertPayload: (snapshot) => ({ styleSnapshot: snapshot }),
    successMessage: 'Style sync applied', compareErrorLabel: 'Compare styles', applyErrorLabel: 'Apply style sync',
    revertSuccessMessage: 'Style sync reverted', revertErrorMessage: 'Failed to revert style sync',
  });

  // ── Shared diff filter ──
  const [diffFilter] = useState('');

  // ── Confirmation modal state ──
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // ── Late-bound trampoline refs (breaks circular hook dependency) ──
  const onOrphanDeletionCompleteRef = useRef<() => void>(() => {});
  const stableOnOrphanDeletionComplete = useCallback(() => onOrphanDeletionCompleteRef.current(), []);
  const setReadinessErrorRef = useRef<(msg: string | null) => void>(() => {});
  const stableSetReadinessError = useCallback((msg: string | null) => setReadinessErrorRef.current(msg), []);
  const markChecksStaleRef = useRef<() => void>(() => {});
  const stableMarkChecksStale = useCallback(() => markChecksStaleRef.current(), []);

  const orphanCleanup = useOrphanCleanup({
    collectionMap,
    onDeletionComplete: stableOnOrphanDeletionComplete,
    setReadinessError: stableSetReadinessError,
  });

  const readiness = useReadinessChecks({
    serverUrl, activeSet, connected,
    collectionMap, modeMap, tokenChangeKey,
    readFigmaTokens: varSync.readFigmaTokens,
    setOrphanConfirm: orphanCleanup.setOrphanConfirm,
    refreshValidation,
  });

  const {
    readinessChecks,
    blockingReadinessChecks,
    advisoryReadinessChecks,
    preflightStage,
    readinessLoading,
    readinessError,
    setChecksStale,
    runReadinessChecks,
    triggerReadinessAction,
    readinessBlockingFails,
    isReadinessOutdated,
  } = readiness;

  const canProceedToCompare = !readinessLoading && !isReadinessOutdated && (preflightStage === 'advisory' || preflightStage === 'ready');
  const compareLockedMessage = !readinessChecks.length
    ? 'Run preflight once for the current token state before comparing Figma variables or styles.'
    : isReadinessOutdated
      ? 'Preflight results are outdated. Re-run preflight before comparing differences.'
      : readinessBlockingFails > 0
        ? 'Resolve the blocking preflight clusters before comparing or applying Figma changes.'
        : 'Preflight must finish before compare is available.';

  const publishAll = usePublishAll({
    varSync,
    styleSync,
    setConfirmAction,
    markChecksStale: stableMarkChecksStale,
    canProceed: canProceedToCompare,
    blockedMessage: compareLockedMessage,
  });

  // Wire trampolines to real implementations (runs every render — that's intentional)
  onOrphanDeletionCompleteRef.current = readiness.runReadinessChecks;
  setReadinessErrorRef.current = readiness.setReadinessError;
  markChecksStaleRef.current = () => readiness.setChecksStale(true);

  const { orphansDeleting, orphanConfirm, setOrphanConfirm, executeOrphanDeletion } = orphanCleanup;
  const {
    publishAllStep,
    publishAllError,
    compareAllLoading,
    hasVarChanges,
    hasStyleChanges,
    publishAllAvailable,
    publishAllBusy,
    handleOpenPublishAll,
    compareAll,
    runPublishAll,
    quickSync,
    quickSyncing,
  } = publishAll;
  const hasFigmaSyncChanges = hasVarChanges || hasStyleChanges;
  const hasComparedAnything = varSync.checked || styleSync.checked;
  const publishPreflightState = useMemo(() => ({
    stage: preflightStage,
    isOutdated: isReadinessOutdated,
    blockingCount: blockingReadinessChecks.length,
    advisoryCount: advisoryReadinessChecks.length,
    canProceed: canProceedToCompare,
  }), [
    advisoryReadinessChecks.length,
    blockingReadinessChecks.length,
    canProceedToCompare,
    isReadinessOutdated,
    preflightStage,
  ]);

  const workflowStages = useMemo(() => {
    const preflightTone: SyncWorkflowTone =
      preflightStage === 'blocked' ? 'blocked' :
      (preflightStage === 'advisory' || preflightStage === 'ready') ? 'complete' :
      'current';

    const compareTone: SyncWorkflowTone =
      !canProceedToCompare
        ? (preflightStage === 'blocked' ? 'blocked' : 'pending')
        : hasComparedAnything ? 'complete' : 'current';

    const applyTone: SyncWorkflowTone =
      !canProceedToCompare ? 'pending' :
      !hasComparedAnything ? 'pending' :
      (publishAllAvailable || publishAllBusy || quickSyncing) ? 'current' :
      'complete';

    const preflightDetail =
      readinessLoading ? 'Running checks\u2026' :
      preflightStage === 'blocked'
        ? `${blockingReadinessChecks.length} blocking issue${blockingReadinessChecks.length !== 1 ? 's' : ''} \u2014 resolve to continue` :
      preflightStage === 'advisory'
        ? `${advisoryReadinessChecks.length} advisory item${advisoryReadinessChecks.length !== 1 ? 's' : ''} \u2014 can proceed` :
      preflightStage === 'ready' ? 'All checks passed' :
      'Run to unlock compare and apply';

    const diffCount = varSync.rows.length + styleSync.rows.length;
    const compareDetail =
      !canProceedToCompare ? 'Locked until preflight passes' :
      (varSync.loading || styleSync.loading) ? 'Comparing\u2026' :
      hasComparedAnything
        ? (diffCount > 0 ? `${diffCount} difference${diffCount !== 1 ? 's' : ''} found` : 'All targets in sync')
        : 'Compare variables and styles';

    const pendingCount = (hasVarChanges ? varSync.syncCount : 0) + (hasStyleChanges ? styleSync.syncCount : 0);
    const applyDetail =
      !canProceedToCompare ? 'Locked until preflight passes' :
      !hasComparedAnything ? 'Compare first to see changes' :
      (publishAllBusy || quickSyncing) ? 'Applying changes\u2026' :
      publishAllAvailable
        ? `${pendingCount} change${pendingCount !== 1 ? 's' : ''} to apply`
        : 'Nothing to apply';

    return [
      { id: 'preflight' as SyncWorkflowStage, step: 1, label: 'Preflight', detail: preflightDetail, tone: preflightTone },
      { id: 'compare' as SyncWorkflowStage, step: 2, label: 'Compare', detail: compareDetail, tone: compareTone, disabled: !canProceedToCompare },
      { id: 'apply' as SyncWorkflowStage, step: 3, label: 'Apply', detail: applyDetail, tone: applyTone, disabled: !canProceedToCompare },
    ];
  }, [
    preflightStage, canProceedToCompare, hasComparedAnything, publishAllAvailable, publishAllBusy, quickSyncing,
    readinessLoading, blockingReadinessChecks.length, advisoryReadinessChecks.length,
    varSync.loading, varSync.rows.length, varSync.syncCount,
    styleSync.loading, styleSync.rows.length, styleSync.syncCount,
    hasVarChanges, hasStyleChanges,
  ]);

  const focusStage = useCallback((stage: SyncWorkflowStage) => {
    const target =
      stage === 'preflight' ? preflightRef.current :
      stage === 'compare' ? compareRef.current :
      applyRef.current;
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const handlePreflightAction = useCallback(async (actionId: PublishPreflightActionId) => {
    setPreflightActionBusyId(actionId);
    try {
      if (actionId === 'review-draft-tokens') {
        setReturnBreadcrumb({ label: 'Back to Sync', topTab: 'ship', subTab: 'publish' });
        navigateTo('define', 'tokens');
        return;
      }

      if (actionId === 'review-audit-findings') {
        setReturnBreadcrumb({ label: 'Back to Sync', topTab: 'ship', subTab: 'publish' });
        navigateTo('ship', 'health');
        return;
      }

      if (actionId === 'review-variable-scopes') {
        setOpenSections(() => {
          const s = new Set<string>(['figma-variables', 'figma-styles']);
          try { localStorage.setItem('tm_publish_sections', JSON.stringify([...s])); } catch { /* ignore */ }
          return s;
        });
        await varSync.computeDiff();
        focusStage('compare');
        return;
      }

      if (actionId === 'add-token-descriptions') {
        dispatchToast('Descriptions are edited in the Tokens workspace. Add them there, then return to re-run preflight.', 'success');
        setReturnBreadcrumb({ label: 'Back to Sync', topTab: 'ship', subTab: 'publish' });
        navigateTo('define', 'tokens');
        return;
      }

      await triggerReadinessAction(actionId);
      focusStage('preflight');
    } finally {
      setPreflightActionBusyId(null);
    }
  }, [focusStage, navigateTo, setReturnBreadcrumb, triggerReadinessAction, varSync]);

  const preflightActionHandlers = useMemo(() => ({
    'push-missing-variables': () => void handlePreflightAction('push-missing-variables'),
    'delete-orphan-variables': () => void handlePreflightAction('delete-orphan-variables'),
    'review-variable-scopes': () => void handlePreflightAction('review-variable-scopes'),
    'add-token-descriptions': () => void handlePreflightAction('add-token-descriptions'),
    'review-draft-tokens': () => void handlePreflightAction('review-draft-tokens'),
    'review-audit-findings': () => void handlePreflightAction('review-audit-findings'),
  }), [handlePreflightAction]);

  useEffect(() => {
    if (!publishPanelHandle) return;
    publishPanelHandle.current = {
      runReadinessChecks,
      runCompareAll: compareAll,
      focusStage,
    };
    return () => {
      publishPanelHandle.current = null;
    };
  }, [compareAll, focusStage, publishPanelHandle, runReadinessChecks]);

  // ── Broadcast pending count to Ship tab badge ────────────────────────────
  // Fires whenever either check completes (or resets). Clears on unmount.
  useEffect(() => {
    const varCount = canProceedToCompare && varSync.checked ? varSync.syncCount : 0;
    const styleCount = canProceedToCompare && styleSync.checked ? styleSync.syncCount : 0;
    window.dispatchEvent(new CustomEvent('publish-pending-count', { detail: { total: varCount + styleCount } }));
    return () => {
      window.dispatchEvent(new CustomEvent('publish-pending-count', { detail: { total: 0 } }));
    };
  }, [canProceedToCompare, varSync.checked, varSync.syncCount, styleSync.checked, styleSync.syncCount]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('publish-preflight-state', { detail: publishPreflightState }));
    return () => {
      window.dispatchEvent(new CustomEvent('publish-preflight-state', {
        detail: { stage: 'idle', isOutdated: false, blockingCount: 0, advisoryCount: 0, canProceed: false },
      }));
    };
  }, [publishPreflightState]);

  /* ── Not connected ─────────────────────────────────────────────────────── */

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to sync tokens with Figma
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <>
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-1.5">
        <PanelHelpIcon panelKey="publish" title="Figma Sync" expanded={help.expanded} onToggle={help.toggle} />
      </div>

      {help.expanded && (
        <PanelHelpBanner
          title="Figma Sync"
          description="Run preflight first, then compare local tokens against Figma variables and styles, then apply the destinations you choose. Repository and handoff work now lives in the separate Repo / Handoff flow."
          onDismiss={help.dismiss}
        />
      )}

      <SyncWorkflowControls stages={workflowStages} onSelectStage={focusStage} />

      <div ref={preflightRef}>
        <SyncPreflightStep
          stage={preflightStage}
          isOutdated={isReadinessOutdated}
          error={readinessError}
          blockingClusters={blockingReadinessChecks}
          advisoryClusters={advisoryReadinessChecks}
          onRunChecks={() => void runReadinessChecks()}
          running={readinessLoading}
          actionHandlers={preflightActionHandlers}
          actionBusyId={orphansDeleting ? 'delete-orphan-variables' : preflightActionBusyId}
        />
      </div>

      <div ref={compareRef} className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-figma-bg-secondary)] text-[10px] font-semibold text-[var(--color-figma-text-secondary)]">
                2
              </span>
              <h2 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Compare and review</h2>
              {canProceedToCompare && (
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  Unlocked
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-[560px] text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Compare variables and styles only after preflight is clear. Choose whether each difference should push to Figma, pull back locally, or be skipped.
            </p>
            {!canProceedToCompare && (
              <div className="mt-2 rounded-[12px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                {compareLockedMessage}
              </div>
            )}
          </div>

          <button
            onClick={async () => {
              setOpenSections(() => {
                const s = new Set<string>(['figma-variables', 'figma-styles']);
                try { localStorage.setItem('tm_publish_sections', JSON.stringify([...s])); } catch { /* ignore */ }
                return s;
              });
              await compareAll();
            }}
            disabled={!canProceedToCompare || compareAllLoading || varSync.loading || styleSync.loading}
            title="Compare variables and styles in parallel"
            className="shrink-0 rounded-full border border-[var(--color-figma-border)] px-3 py-1.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)]/35 hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {compareAllLoading ? 'Comparing…' : 'Compare Figma targets'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Aggregate summary bar ── */}
        {(varSync.checked || styleSync.checked) && (() => {
          const totalChanges = varSync.rows.length + styleSync.rows.length;
          const varConflicts = varSync.rows.filter(r => r.cat === 'conflict').length;
          const styleConflicts = styleSync.rows.filter(r => r.cat === 'conflict').length;
          const totalConflicts = varConflicts + styleConflicts;
          if (totalChanges === 0) return null;
          const parts: string[] = [];
          if (varSync.checked && varSync.rows.length > 0) parts.push(`${varSync.rows.length} variable${varSync.rows.length !== 1 ? 's' : ''}`);
          if (styleSync.checked && styleSync.rows.length > 0) parts.push(`${styleSync.rows.length} style${styleSync.rows.length !== 1 ? 's' : ''}`);
          return (
            <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
              <span className="text-[10px] text-[var(--color-figma-text)]">
                <span className="font-medium">{totalChanges} total change{totalChanges !== 1 ? 's' : ''}</span>
                {parts.length > 0 && <> &mdash; {parts.join(', ')}</>}
                {totalConflicts > 0 && (
                  <span className="text-yellow-600"> &mdash; {totalConflicts} conflict{totalConflicts !== 1 ? 's' : ''} need review</span>
                )}
              </span>
            </div>
          );
        })()}

        <Section
          title="Figma Variables"
          open={openSections.has('figma-variables')}
          onToggle={() => toggleSection('figma-variables')}
          badge={
            !canProceedToCompare ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] font-medium">Locked</span>
            ) : varSync.loading ? null : (
              varSync.checked && varSync.rows.length === 0
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
                : varSync.rows.length > 0
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{varSync.rows.length} differ</span>
                  : null
            )
          }
        >
          <SyncSubPanel
            sync={varSync}
            activeSet={activeSet}
            diffFilter={diffFilter}
            onRequestConfirm={(action) => setConfirmAction(action as ConfirmAction)}
            onRevert={varSync.revert}
            description="Keep local tokens and Figma variables in sync. Push local changes to Figma, or pull Figma changes back."
            sectionLabel="Token differences"
            previewAction="preview-vars"
            applyAction="apply-vars"
            inSyncMessage="Local tokens match Figma variables."
            notCheckedMessage={<>Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which tokens differ between local files and Figma.</>}
            revertDescription="Restore Figma variables to their pre-sync state"
            locked={!canProceedToCompare}
            lockedMessage={compareLockedMessage}
            scopeOverrides={scopeOverrides}
            onScopesChange={(path, scopes) => setScopeOverrides(prev => ({ ...prev, [path]: scopes }))}
            getScopeOptions={(type) => FIGMA_SCOPES[type ?? ''] ?? []}
          />
        </Section>

        <Section
          title="Figma Styles"
          open={openSections.has('figma-styles')}
          onToggle={() => toggleSection('figma-styles')}
          badge={
            !canProceedToCompare ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] font-medium">Locked</span>
            ) : (
              styleSync.checked && styleSync.rows.length === 0
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
                : styleSync.rows.length > 0
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{styleSync.rows.length} differ</span>
                  : null
            )
          }
        >
          <SyncSubPanel
            sync={styleSync}
            activeSet={activeSet}
            diffFilter={diffFilter}
            onRequestConfirm={(action) => setConfirmAction(action as ConfirmAction)}
            onRevert={styleSync.revert}
            description="Sync color, text, and effect styles between local tokens and Figma styles."
            sectionLabel="Style differences"
            previewAction="preview-styles"
            applyAction="apply-styles"
            inSyncMessage="Local tokens match Figma styles."
            notCheckedMessage={<>Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which color, text, and effect styles differ.</>}
            revertDescription="Restore Figma styles to their pre-sync state"
            locked={!canProceedToCompare}
            lockedMessage={compareLockedMessage}
          />
        </Section>
      </div>

      <div ref={applyRef} className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-figma-bg)] text-[10px] font-semibold text-[var(--color-figma-text-secondary)]">
              3
            </span>
            <h2 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Apply to Figma</h2>
          </div>

          {!canProceedToCompare ? (
            <div className="rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Finish Step 1 before any apply actions unlock.
            </div>
          ) : (publishAllAvailable || publishAllBusy || quickSyncing || compareAllLoading) ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 p-2.5">
              {(publishAllBusy || quickSyncing || compareAllLoading) ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" className="text-[var(--color-figma-accent)]" />
                  <span className="text-[10px] text-[var(--color-figma-text)] font-medium">
                    {compareAllLoading && 'Comparing…'}
                    {!compareAllLoading && publishAllStep === 'variables' && (quickSyncing ? 'Syncing variables to Figma…' : 'Applying variable sync changes…')}
                    {!compareAllLoading && publishAllStep === 'styles' && (quickSyncing ? 'Syncing styles to Figma…' : 'Applying style sync changes…')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Apply the reviewed sync plan</span>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      {[
                        hasVarChanges ? `${varSync.syncCount} variable change${varSync.syncCount !== 1 ? 's' : ''}` : null,
                        hasStyleChanges ? `${styleSync.syncCount} style change${styleSync.syncCount !== 1 ? 's' : ''}` : null,
                      ].filter(Boolean).join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hasFigmaSyncChanges && (
                      <button
                        onClick={quickSync}
                        title="Compare and apply all variable and style changes to Figma immediately, without preview"
                        className="text-[10px] px-2.5 py-1 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] font-medium hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                      >
                        Sync Figma now
                      </button>
                    )}
                    <button
                      onClick={handleOpenPublishAll}
                      className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)]"
                    >
                      Review Figma sync
                    </button>
                  </div>
                </div>
              )}
              {publishAllError && (
                <NoticeBanner severity="error">Sync failed: {publishAllError}</NoticeBanner>
              )}
            </div>
          ) : hasComparedAnything ? (
            <div className="rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              No combined Figma changes are pending after compare. Adjust row directions if you want to apply something, or re-run compare against the current file.
            </div>
          ) : (
            <div className="rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Compare variables or styles first. Step 3 becomes available after at least one sync target has a reviewed diff.
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Confirmation modals ── */}
    {confirmAction === 'preview-vars' && (
      <SyncPreviewModal
        title="Variable sync preview"
        rows={varSync.rows}
        dirs={varSync.dirs}
        onClose={() => setConfirmAction(null)}
      />
    )}

    {confirmAction === 'preview-styles' && (
      <SyncPreviewModal
        title="Style sync preview"
        rows={styleSync.rows}
        dirs={styleSync.dirs}
        onClose={() => setConfirmAction(null)}
      />
    )}

    {confirmAction === 'apply-vars' && (
      <SyncPreviewModal
        title="Apply variable sync"
        rows={varSync.rows}
        dirs={varSync.dirs}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await varSync.applyDiff();
          setChecksStale(true);
        }}
        confirmLabel={`Apply ${varSync.syncCount} change${varSync.syncCount !== 1 ? 's' : ''}`}
      />
    )}

    {confirmAction === 'apply-styles' && (
      <SyncPreviewModal
        title="Apply style sync"
        rows={styleSync.rows}
        dirs={styleSync.dirs}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await styleSync.applyDiff();
          setChecksStale(true);
        }}
        confirmLabel={`Apply ${styleSync.syncCount} change${styleSync.syncCount !== 1 ? 's' : ''}`}
      />
    )}

    {confirmAction === 'publish-all' && (
      <PublishAllPreviewModal
        hasVarChanges={hasVarChanges}
        hasStyleChanges={hasStyleChanges}
        varRows={varSync.rows}
        varDirs={varSync.dirs}
        varPushCount={varSync.pushCount}
        varPullCount={varSync.pullCount}
        styleRows={styleSync.rows}
        styleDirs={styleSync.dirs}
        stylePushCount={styleSync.pushCount}
        stylePullCount={styleSync.pullCount}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async (sections) => {
          setConfirmAction(null);
          await runPublishAll(sections);
        }}
      />
    )}
    {orphanConfirm && (
      <ConfirmModal
        title={`Delete ${orphanConfirm.orphanPaths.length} orphan variable${orphanConfirm.orphanPaths.length !== 1 ? 's' : ''}?`}
        description="These Figma variables have no matching token in the local token set. Deletion is permanent and may break references in other design files."
        confirmLabel="Delete"
        danger
        wide
        onCancel={() => setOrphanConfirm(null)}
        onConfirm={executeOrphanDeletion}
      >
        <div className="mt-2 max-h-[160px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {orphanConfirm.orphanPaths.map(p => (
            <div key={p} className="px-3 py-1 text-[10px] font-mono text-[var(--color-figma-text)] border-b border-[var(--color-figma-border)] last:border-b-0 truncate" title={p}>
              {p}
            </div>
          ))}
        </div>
      </ConfirmModal>
    )}
    </>
  );
}

/* ── Shared types ───────────────────────────────────────────────────────── */

interface PreviewRow {
  path: string;
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
}

/* ── SyncDiffSummary (used inside apply confirm modals) ──────────────── */

function SyncDiffSummary({ rows, dirs }: {
  rows: PreviewRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
}) {
  const pushRows = rows.filter(r => dirs[r.path] === 'push');
  const pullRows = rows.filter(r => dirs[r.path] === 'pull');
  const skipCount = rows.filter(r => dirs[r.path] === 'skip').length;

  const sections: { label: string; arrow: string; items: PreviewRow[]; direction: 'push' | 'pull' }[] = [];
  if (pushRows.length > 0) sections.push({ label: 'Push to Figma', arrow: '\u2191', items: pushRows, direction: 'push' });
  if (pullRows.length > 0) sections.push({ label: 'Pull to local', arrow: '\u2193', items: pullRows, direction: 'pull' });

  if (sections.length === 0) {
    return <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)]">No changes to apply (all skipped).</p>;
  }

  return (
    <div className="mt-2">
      {sections.map(section => (
        <div key={section.label} className="mb-2">
          <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
            {section.arrow} {section.label} ({section.items.length})
          </div>
          <div className="max-h-36 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
            {section.items.map(r => {
              const isColor = r.localType === 'color' || r.figmaType === 'color';
              const beforeVal = section.direction === 'push' ? r.figmaValue : r.localValue;
              const afterVal = section.direction === 'push' ? r.localValue : r.figmaValue;
              return (
                <div key={r.path} className="px-2 py-1">
                  <div className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={r.path}>{r.path}</div>
                  {r.cat === 'conflict' && (
                    <div className="flex flex-col gap-0.5 mt-0.5 ml-1 text-[10px] font-mono">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                        {isColor && isHexColor(beforeVal) && <DiffSwatch hex={beforeVal} />}
                        <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeVal ?? ''}>{truncateValue(beforeVal ?? '', 36)}</span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                        {isColor && isHexColor(afterVal) && <DiffSwatch hex={afterVal} />}
                        <span className="text-[var(--color-figma-text)] truncate" title={afterVal ?? ''}>{truncateValue(afterVal ?? '', 36)}</span>
                      </div>
                    </div>
                  )}
                  {r.cat !== 'conflict' && (r.localValue ?? r.figmaValue) !== undefined && (
                    <div className="flex items-center gap-1 mt-0.5 ml-1 text-[10px] font-mono min-w-0">
                      {isColor && isHexColor(r.localValue ?? r.figmaValue) && <DiffSwatch hex={(r.localValue ?? r.figmaValue)!} />}
                      <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.localValue ?? r.figmaValue}>{truncateValue((r.localValue ?? r.figmaValue) ?? '', 36)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {skipCount > 0 && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">{skipCount} item{skipCount !== 1 ? 's' : ''} skipped.</p>
      )}
    </div>
  );
}

/* ── SyncPreviewModal ───────────────────────────────────────────────────── */

function SyncPreviewModal({
  title,
  rows,
  dirs,
  onClose,
  onConfirm,
  confirmLabel,
}: {
  title: string;
  rows: PreviewRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const pushAdds = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'local-only');
  const pushUpdates = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'conflict');
  const pullAdds = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'figma-only');
  const pullUpdates = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'conflict');
  const deletesFromFigma = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'local-only');
  const deletesFromLocal = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'figma-only');
  const skipped = rows.filter(r => dirs[r.path] === 'skip');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const sections: { label: string; badge: string; rows: PreviewRow[]; color: string }[] = [
    { label: 'Add to Figma', badge: '+', rows: pushAdds, color: 'var(--color-figma-success)' },
    { label: 'Update in Figma', badge: '~', rows: pushUpdates, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Remove from Figma', badge: '-', rows: deletesFromLocal, color: 'var(--color-figma-error)' },
    { label: 'Add to local', badge: '+', rows: pullAdds, color: 'var(--color-figma-success)' },
    { label: 'Update in local', badge: '~', rows: pullUpdates, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Remove from local', badge: '-', rows: deletesFromFigma, color: 'var(--color-figma-error)' },
    { label: 'Skipped', badge: '·', rows: skipped, color: 'var(--color-figma-text-tertiary)' },
  ].filter(s => s.rows.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="preview-modal-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">{title}</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {onConfirm ? 'Review changes before applying.' : 'Dry run \u2014 no changes will be written.'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {sections.length === 0 ? (
            <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">Nothing to sync — all items skipped.</p>
          ) : (
            sections.map(section => (
              <div key={section.label} className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[10px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded"
                    style={{ color: section.color }}
                  >
                    {section.badge}
                  </span>
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    {section.label} ({section.rows.length})
                  </span>
                </div>
                <div className="ml-5 space-y-0">
                  {section.rows.map(r => {
                    const valStr = (v: string | undefined) => v ?? '';
                    const isColor = r.localType === 'color' || r.figmaType === 'color';
                    // Determine before/after based on section direction
                    const isPush = section.label.includes('Figma');
                    const beforeVal = isPush ? r.figmaValue : r.localValue;
                    const afterVal = isPush ? r.localValue : r.figmaValue;
                    return (
                      <div key={r.path} className="py-1 border-b border-[var(--color-figma-border)] last:border-b-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={r.path}>{r.path}</span>
                        </div>
                        {r.cat === 'conflict' && (
                          <div className="ml-2 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                              {isColor && isHexColor(beforeVal) && <DiffSwatch hex={beforeVal} />}
                              <span className="text-[var(--color-figma-text-secondary)] truncate" title={valStr(beforeVal)}>{truncateValue(valStr(beforeVal), 40)}</span>
                            </div>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                              {isColor && isHexColor(afterVal) && <DiffSwatch hex={afterVal} />}
                              <span className="text-[var(--color-figma-text)] truncate" title={valStr(afterVal)}>{truncateValue(valStr(afterVal), 40)}</span>
                            </div>
                          </div>
                        )}
                        {r.cat === 'local-only' && r.localValue !== undefined && (
                          <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                            {isColor && isHexColor(r.localValue) && <DiffSwatch hex={r.localValue} />}
                            <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.localValue}>{truncateValue(r.localValue, 40)}</span>
                          </div>
                        )}
                        {r.cat === 'figma-only' && r.figmaValue !== undefined && (
                          <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                            {isColor && isHexColor(r.figmaValue) && <DiffSwatch hex={r.figmaValue} />}
                            <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.figmaValue}>{truncateValue(r.figmaValue, 40)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          {onConfirm ? (
            <>
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  try { await onConfirm(); } finally { setBusy(false); }
                }}
                disabled={busy || sections.length === 0}
                className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {busy && <Spinner size="sm" className="text-white" />}
                {busy ? 'Applying\u2026' : (confirmLabel ?? 'Apply')}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── PublishAllPreviewModal ─────────────────────────────────────────────── */

function PublishAllPreviewModal({
  hasVarChanges,
  hasStyleChanges,
  varRows,
  varDirs,
  varPushCount,
  varPullCount,
  styleRows,
  styleDirs,
  stylePushCount,
  stylePullCount,
  onCancel,
  onConfirm,
}: {
  hasVarChanges: boolean;
  hasStyleChanges: boolean;
  varRows: PreviewRow[];
  varDirs: Record<string, 'push' | 'pull' | 'skip'>;
  varPushCount: number;
  varPullCount: number;
  styleRows: PreviewRow[];
  styleDirs: Record<string, 'push' | 'pull' | 'skip'>;
  stylePushCount: number;
  stylePullCount: number;
  onCancel: () => void;
  onConfirm: (sections: PublishAllSections) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [includeVars, setIncludeVars] = useState(hasVarChanges);
  const [includeStyles, setIncludeStyles] = useState(hasStyleChanges);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const hasAnyChanges = hasVarChanges || hasStyleChanges;
  const anySelected = (includeVars && hasVarChanges) || (includeStyles && hasStyleChanges);

  const handleConfirm = async () => {
    setBusy(true);
    setConfirmError(null);
    try {
      await onConfirm({ vars: includeVars, styles: includeStyles });
    } catch (err) {
      setConfirmError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
        <div ref={dialogRef} className="w-[400px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="publish-all-modal-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="publish-all-modal-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            Review Figma sync
          </h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review each Figma target before you sync it.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col gap-3">
          {/* All in sync — shown when auto-compare found no pending changes */}
          {!hasAnyChanges && (
            <div className="py-3 text-[10px] text-[var(--color-figma-text-secondary)] text-center">
              Everything is already in sync — nothing to apply.
            </div>
          )}

          {/* Variables section */}
          {hasVarChanges && (
            <div className={includeVars ? '' : 'opacity-50'}>
              <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVars}
                  onChange={e => setIncludeVars(e.target.checked)}
                  className="w-3 h-3 accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Variables</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    varPushCount > 0 ? `\u2191 ${varPushCount} to Figma` : null,
                    varPullCount > 0 ? `\u2193 ${varPullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </label>
              <SyncDiffSummary rows={varRows} dirs={varDirs} />
            </div>
          )}

          {/* Styles section */}
          {hasStyleChanges && (
            <div className={includeStyles ? '' : 'opacity-50'}>
              <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStyles}
                  onChange={e => setIncludeStyles(e.target.checked)}
                  className="w-3 h-3 accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Styles</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    stylePushCount > 0 ? `\u2191 ${stylePushCount} to Figma` : null,
                    stylePullCount > 0 ? `\u2193 ${stylePullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </label>
              <SyncDiffSummary rows={styleRows} dirs={styleDirs} />
            </div>
          )}
        </div>

        {confirmError && (
          <p className="px-4 pb-2 text-[10px] text-[var(--color-figma-error)] break-words" role="alert">{confirmError}</p>
        )}
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          {hasAnyChanges ? (
            <button
              onClick={handleConfirm}
              disabled={busy || !anySelected}
              title={!anySelected ? 'Select at least one destination to sync' : undefined}
              className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy && <Spinner size="sm" className="text-white" />}
              {busy ? 'Applying\u2026' : !anySelected ? 'Nothing selected' : 'Sync selected'}
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Section accordion ───────────────────────────────────────────────────── */

function Section({ title, open, onToggle, badge, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--color-figma-border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          {title}
        </span>
        {badge}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

/* ── Display helpers ─────────────────────────────────────────────────────── */

function truncateValue(v: string, max = 24): string {
  return v.length > max ? v.slice(0, max) + '\u2026' : v;
}

function isHexColor(v: string | undefined): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

function DiffSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 align-middle"
      style={{ backgroundColor: swatchBgColor(hex) }}
      aria-hidden="true"
    />
  );
}
