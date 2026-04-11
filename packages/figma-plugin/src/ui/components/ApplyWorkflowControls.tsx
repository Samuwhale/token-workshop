import type { ApplyWorkflowStage, ApplyWorkflowTone } from '../shared/applyWorkflow';
import {
  WorkflowStageIndicators,
  type WorkflowStageIndicatorItem,
} from '../shared/WorkflowStageIndicators';

type ApplyWorkflowItem = WorkflowStageIndicatorItem<ApplyWorkflowStage> & {
  tone: ApplyWorkflowTone;
};

interface ApplyWorkflowControlsProps {
  stages: ApplyWorkflowItem[];
  onSelectStage: (stage: ApplyWorkflowStage) => void;
}

export function ApplyWorkflowControls({
  stages,
  onSelectStage,
}: ApplyWorkflowControlsProps) {
  return (
    <WorkflowStageIndicators
      title="Apply workflow"
      description="Review the selection, inspect best matches, bind visible properties, then open advanced tools only when needed."
      stages={stages}
      onSelectStage={onSelectStage}
    />
  );
}
