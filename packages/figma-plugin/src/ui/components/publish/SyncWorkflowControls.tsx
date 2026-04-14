import type {
  SyncWorkflowItem,
  SyncWorkflowStage,
} from '../../shared/syncWorkflow';
import {
  WorkflowStageIndicators,
} from '../../shared/WorkflowStageIndicators';

interface SyncWorkflowControlsProps {
  stages: SyncWorkflowItem[];
  onSelectStage: (stage: SyncWorkflowStage) => void;
}

export function SyncWorkflowControls({
  stages,
  onSelectStage,
}: SyncWorkflowControlsProps) {
  return (
    <WorkflowStageIndicators
      title="Sync workflow"
      description="Preflight, compare, then apply."
      stages={stages}
      onSelectStage={onSelectStage}
    />
  );
}
