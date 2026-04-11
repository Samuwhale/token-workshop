import type { ThemeAuthoringStage } from '../shared/themeWorkflow';
import {
  WorkflowStageIndicators,
  type WorkflowStageIndicatorAction,
  type WorkflowStageIndicatorItem,
} from '../shared/WorkflowStageIndicators';

type ThemeStageItem = WorkflowStageIndicatorItem<ThemeAuthoringStage>;
type ThemeStageAction = WorkflowStageIndicatorAction;

interface ThemeStageModelControlsProps {
  stages: ThemeStageItem[];
  onSelectStage: (stage: ThemeAuthoringStage) => void;
  actions?: ThemeStageAction[];
}

export function ThemeStageModelControls({
  stages,
  onSelectStage,
  actions = [],
}: ThemeStageModelControlsProps) {
  return (
    <WorkflowStageIndicators
      title="Theme workflow"
      description="Build axes, options, set roles, and preview in order. Review tools stay in secondary views."
      stages={stages}
      onSelectStage={onSelectStage}
      actions={actions}
    />
  );
}
