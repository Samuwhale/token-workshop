import type { PublishPreflightCluster, PublishPreflightStage } from '../../shared/syncWorkflow';
import { NoticeBanner } from '../../shared/noticeSystem';
import { Spinner } from '../Spinner';

interface SyncPreflightStepProps {
  stage: PublishPreflightStage;
  isOutdated: boolean;
  error: string | null;
  blockingClusters: PublishPreflightCluster[];
  advisoryClusters: PublishPreflightCluster[];
  running: boolean;
  actionHandlers: Partial<Record<string, (cluster: PublishPreflightCluster) => void>>;
  actionBusyId?: string | null;
}

export function SyncPreflightStep({
  stage: _stage,
  isOutdated,
  error,
  blockingClusters,
  advisoryClusters,
  running,
  actionHandlers,
  actionBusyId = null,
}: SyncPreflightStepProps) {
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <NoticeBanner severity="error">{error}</NoticeBanner>
      )}

      {!running && isOutdated && !error && (
        <NoticeBanner severity="warning">
          Data changed — rerun.
        </NoticeBanner>
      )}

      {/* idle state: no message needed — compare button is disabled until preflight runs */}

      {running && (
        <div className="flex items-center justify-center py-3">
          <Spinner size="sm" />
        </div>
      )}

      {!running && (blockingClusters.length > 0 || advisoryClusters.length > 0) && (
        <div className="flex flex-col gap-3">
          {blockingClusters.length > 0 && (
            <ClusterGroup
              title="Must fix"
              tone="danger"
              clusters={blockingClusters}
              actionHandlers={actionHandlers}
              actionBusyId={actionBusyId}
            />
          )}
          {advisoryClusters.length > 0 && (
            <ClusterGroup
              title="Recommended"
              tone="warning"
              clusters={advisoryClusters}
              actionHandlers={actionHandlers}
              actionBusyId={actionBusyId}
            />
          )}
        </div>
      )}
    </div>
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
  actionHandlers: Partial<Record<string, (cluster: PublishPreflightCluster) => void>>;
  actionBusyId: string | null;
}) {
  const toneClasses = tone === 'danger'
    ? 'border-[var(--color-figma-error)]/20 bg-[var(--color-figma-error)]/5'
    : 'border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/8';

  return (
    <div className={`rounded-md border p-3 ${toneClasses}`}>
      <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
        {title}
      </div>

      <div className="mt-2 grid gap-2">
        {clusters.map((cluster) => {
          const action = cluster.recommendedActionId ? actionHandlers[cluster.recommendedActionId] : undefined;
          const isBusy = actionBusyId !== null && cluster.recommendedActionId === actionBusyId;

          return (
            <div key={cluster.id} className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-body font-semibold text-[var(--color-figma-text)]">{cluster.label}</span>
                    {cluster.affectedCount !== undefined && (
                      <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                        {cluster.affectedCount} affected
                      </span>
                    )}
                  </div>
                  {cluster.detail && (
                    <p className="mt-1 text-secondary leading-relaxed text-[var(--color-figma-text-secondary)]">
                      {cluster.detail}
                    </p>
                  )}
                </div>

                {action && cluster.recommendedActionLabel && (
                  <button
                    onClick={() => action(cluster)}
                    disabled={isBusy}
                    className="shrink-0 rounded-md bg-[var(--color-figma-accent)]/8 px-2 py-1 text-secondary font-medium text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isBusy ? 'Working…' : cluster.recommendedActionLabel}
                  </button>
                )}
              </div>

              {!action && cluster.recommendedActionLabel && (
                <div className="mt-2 text-secondary text-[var(--color-figma-text-secondary)]">
                  Next: <span className="font-medium text-[var(--color-figma-text)]">{cluster.recommendedActionLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
