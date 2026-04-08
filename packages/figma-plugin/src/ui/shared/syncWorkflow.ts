export type SyncWorkflowStage = 'preflight' | 'compare' | 'apply';

export type SyncWorkflowTone = 'current' | 'complete' | 'pending' | 'blocked';

export type PublishPreflightStage = 'idle' | 'running' | 'blocked' | 'advisory' | 'ready';

export type PublishPreflightSeverity = 'blocking' | 'advisory';

export type PublishPreflightActionId =
  | 'push-missing-variables'
  | 'delete-orphan-variables'
  | 'review-variable-scopes'
  | 'add-token-descriptions';

export interface PublishPreflightCluster {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  severity: PublishPreflightSeverity;
  affectedCount?: number;
  detail?: string;
  recommendedActionLabel?: string;
  recommendedActionId?: PublishPreflightActionId;
}

export interface PublishPreflightState {
  stage: PublishPreflightStage;
  isOutdated: boolean;
  blockingCount: number;
  advisoryCount: number;
  canProceed: boolean;
}

export const DEFAULT_PUBLISH_PREFLIGHT_STATE: PublishPreflightState = {
  stage: 'idle',
  isOutdated: false,
  blockingCount: 0,
  advisoryCount: 0,
  canProceed: false,
};
