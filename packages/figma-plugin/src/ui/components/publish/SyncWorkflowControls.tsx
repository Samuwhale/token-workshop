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
      stages={stages}
      onSelectStage={onSelectStage}
    />
  );
}
