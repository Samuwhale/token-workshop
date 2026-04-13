import type {
  ThemeAuthoringStage,
  ThemeWorkflowAction,
  ThemeWorkflowItem,
} from '../shared/themeWorkflow';
import {
  WorkflowStageIndicators,
} from '../shared/WorkflowStageIndicators';

interface ThemeStageModelControlsProps {
  stages: ThemeWorkflowItem[];
  onSelectStage: (stage: ThemeAuthoringStage) => void;
  actions?: ThemeWorkflowAction[];
}

export function ThemeStageModelControls({
  stages,
  onSelectStage,
  actions = [],
}: ThemeStageModelControlsProps) {
  return (
    <WorkflowStageIndicators
      title="Theme workflow"
      description="Create theme families, add variants, connect shared and variant-specific token sources, then preview the resolved combination."
      stages={stages}
      onSelectStage={onSelectStage}
      actions={actions}
    />
  );
}
