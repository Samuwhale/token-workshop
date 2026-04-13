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
      description="Clear preflight first, then compare differences, then apply the destinations you want to keep."
      stages={stages}
      onSelectStage={onSelectStage}
    />
  );
}
