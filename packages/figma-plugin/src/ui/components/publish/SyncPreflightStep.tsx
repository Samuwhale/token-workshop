import type { PublishPreflightCluster, PublishPreflightStage } from '../../shared/syncWorkflow';
import { NoticeBanner, NoticePill } from '../../shared/noticeSystem';
import type { NoticeSeverity } from '../../shared/noticeSystem';
import { Spinner } from '../Spinner';

interface SyncPreflightStepProps {
  stage: PublishPreflightStage;
  isOutdated: boolean;
  error: string | null;
  blockingClusters: PublishPreflightCluster[];
  advisoryClusters: PublishPreflightCluster[];
  onRunChecks: () => void;
  running: boolean;
  actionHandlers: Partial<Record<string, () => void>>;
  actionBusyId?: string | null;
}

export function SyncPreflightStep({
  stage,
  isOutdated,
  error,
  blockingClusters,
  advisoryClusters,
  onRunChecks,
  running,
  actionHandlers,
  actionBusyId = null,
}: SyncPreflightStepProps) {
  const statusSeverity: NoticeSeverity =
    running ? 'info'
      : isOutdated ? 'stale'
        : stage === 'blocked' ? 'error'
          : stage === 'advisory' ? 'warning'
            : stage === 'ready' ? 'success'
              : 'info';

  const statusLabel =
    running ? 'Running preflight'
      : isOutdated ? 'Outdated'
        : stage === 'blocked' ? 'Blocking issues found'
          : stage === 'advisory' ? 'Advisory recommendations'
            : stage === 'ready' ? 'Ready for compare'
              : 'Preflight not run';

  const summary =
    running
      ? 'Checking the current token set against Figma variables before compare/apply is unlocked.'
      : isOutdated
        ? 'Token data changed since the last check. Run preflight again before comparing differences.'
        : stage === 'blocked'
          ? 'Resolve the blocking clusters below before compare and apply become available.'
          : stage === 'advisory'
            ? 'Nothing blocks sync right now. You can compare next, or clear the advisory clusters first.'
            : stage === 'ready'
              ? 'Preflight is clear. Move to compare once you are ready to inspect differences.'
              : 'Start here. Preflight checks missing variables, orphaned variables, scopes, and descriptions before any compare/apply work.';

  return (
    <section className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]" aria-labelledby="sync-preflight-heading">
      <div className="px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Step 1
              </span>
              <h2 id="sync-preflight-heading" className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                Sync preflight
              </h2>
              <NoticePill severity={statusSeverity}>{statusLabel}</NoticePill>
            </div>
            <p className="mt-1.5 max-w-[560px] text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              {summary}
            </p>
          </div>

          <button
            onClick={onRunChecks}
            disabled={running}
            className="shrink-0 rounded-full bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? 'Running…' : isOutdated || stage === 'idle' ? 'Run preflight' : 'Re-run preflight'}
          </button>
        </div>

        {error && (
          <NoticeBanner severity="error" className="mt-2">{error}</NoticeBanner>
        )}

        {!running && isOutdated && !error && (
          <NoticeBanner
            severity="stale"
            className="mt-2"
            action={{ label: 'Re-run preflight', onClick: onRunChecks }}
          >
            Token data changed since the last check. Run preflight again before comparing differences.
          </NoticeBanner>
        )}

        {!running && blockingClusters.length === 0 && advisoryClusters.length === 0 && stage === 'idle' && !error && (
          <div className="mt-2 rounded-lg border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
            Compare and apply stay locked until preflight has run at least once for the current token state.
          </div>
        )}

        {running && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
            <Spinner size="sm" />
            Checking the current Figma file for publish blockers and advisory cleanup.
          </div>
        )}

        {!running && (blockingClusters.length > 0 || advisoryClusters.length > 0) && (
          <div className="mt-3 flex flex-col gap-3">
            {blockingClusters.length > 0 && (
              <ClusterGroup
                title="Blocking clusters"
                tone="danger"
                clusters={blockingClusters}
                actionHandlers={actionHandlers}
                actionBusyId={actionBusyId}
              />
            )}
            {advisoryClusters.length > 0 && (
              <ClusterGroup
                title="Advisory clusters"
                tone="warning"
                clusters={advisoryClusters}
                actionHandlers={actionHandlers}
                actionBusyId={actionBusyId}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ClusterGroup({
  title,
  tone,
  clusters,
  actionHandlers,
  actionBusyId,
}: {
  title: string;
  tone: 'danger' | 'warning';
  clusters: PublishPreflightCluster[];
  actionHandlers: Partial<Record<string, () => void>>;
  actionBusyId: string | null;
}) {
  const clusterSeverity: NoticeSeverity = tone === 'danger' ? 'error' : 'warning';
  const toneClasses = tone === 'danger'
    ? 'border-[var(--color-figma-error)]/20 bg-[var(--color-figma-error)]/5'
    : 'border-amber-400/25 bg-amber-400/8';

  return (
    <div className={`rounded-[16px] border p-3 ${toneClasses}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
          {title}
        </div>
        <NoticePill severity={clusterSeverity}>
          {clusters.length} cluster{clusters.length === 1 ? '' : 's'}
        </NoticePill>
      </div>

      <div className="mt-2 grid gap-2">
        {clusters.map((cluster) => {
          const action = cluster.recommendedActionId ? actionHandlers[cluster.recommendedActionId] : undefined;
          const isBusy = actionBusyId !== null && cluster.recommendedActionId === actionBusyId;

          return (
            <div key={cluster.id} className="rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">{cluster.label}</span>
                    {cluster.affectedCount !== undefined && (
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        {cluster.affectedCount} affected
                      </span>
                    )}
                  </div>
                  {cluster.detail && (
                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                      {cluster.detail}
                    </p>
                  )}
                </div>

                {action && cluster.recommendedActionLabel && (
                  <button
                    onClick={action}
                    disabled={isBusy}
                    className="shrink-0 rounded-full border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/8 px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/12 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isBusy ? 'Working…' : cluster.recommendedActionLabel}
                  </button>
                )}
              </div>

              {!action && cluster.recommendedActionLabel && (
                <div className="mt-2 rounded-[10px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Recommended next action: <span className="font-medium text-[var(--color-figma-text)]">{cluster.recommendedActionLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
