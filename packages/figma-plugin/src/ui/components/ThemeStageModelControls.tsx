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
      stages={stages}
      onSelectStage={onSelectStage}
      actions={actions}
    />
  );
}
