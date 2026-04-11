import type { SyncWorkflowStage, SyncWorkflowTone } from '../../shared/syncWorkflow';
import {
  WorkflowStageIndicators,
  type WorkflowStageIndicatorItem,
} from '../../shared/WorkflowStageIndicators';

type SyncWorkflowItem = WorkflowStageIndicatorItem<SyncWorkflowStage> & {
  tone: SyncWorkflowTone;
};

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
