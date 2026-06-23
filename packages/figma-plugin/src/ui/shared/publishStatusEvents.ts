import {
  DEFAULT_PUBLISH_PREFLIGHT_STATE,
  type PublishPreflightStage,
  type PublishPreflightState,
} from './syncWorkflow';

export const PUBLISH_PENDING_COUNT_EVENT = 'publish-pending-count';
export const PUBLISH_PREFLIGHT_STATE_EVENT = 'publish-preflight-state';

const PUBLISH_PREFLIGHT_STAGES = new Set<PublishPreflightStage>([
  'idle',
  'running',
  'blocked',
  'advisory',
  'ready',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonNegativeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function readPublishPendingCountEvent(event: Event): number {
  const detail = (event as CustomEvent<unknown>).detail;
  return isRecord(detail) ? readNonNegativeCount(detail.total) : 0;
}

export function normalizePublishPreflightState(
  value: unknown,
): PublishPreflightState {
  if (!isRecord(value)) return DEFAULT_PUBLISH_PREFLIGHT_STATE;

  const stage =
    typeof value.stage === 'string' &&
    PUBLISH_PREFLIGHT_STAGES.has(value.stage as PublishPreflightStage)
      ? (value.stage as PublishPreflightStage)
      : DEFAULT_PUBLISH_PREFLIGHT_STATE.stage;

  return {
    stage,
    isOutdated: readBoolean(
      value.isOutdated,
      DEFAULT_PUBLISH_PREFLIGHT_STATE.isOutdated,
    ),
    blockingCount: readNonNegativeCount(value.blockingCount),
    advisoryCount: readNonNegativeCount(value.advisoryCount),
    canProceed: readBoolean(
      value.canProceed,
      DEFAULT_PUBLISH_PREFLIGHT_STATE.canProceed,
    ),
    targetDirty: readBoolean(
      value.targetDirty,
      DEFAULT_PUBLISH_PREFLIGHT_STATE.targetDirty,
    ),
  };
}

export function dispatchPublishPendingCount(total: number): void {
  window.dispatchEvent(
    new CustomEvent(PUBLISH_PENDING_COUNT_EVENT, {
      detail: { total: readNonNegativeCount(total) },
    }),
  );
}

export function dispatchPublishPreflightState(
  state: PublishPreflightState,
): void {
  window.dispatchEvent(
    new CustomEvent(PUBLISH_PREFLIGHT_STATE_EVENT, {
      detail: normalizePublishPreflightState(state),
    }),
  );
}
