import { NoticeCountBadge, type NoticeSeverity } from './noticeSystem';

export type WorkflowStageTone = 'current' | 'complete' | 'pending' | 'blocked';

export interface WorkflowStageIndicatorBadge {
  count: number;
  severity: NoticeSeverity;
}

export interface WorkflowStageIndicatorItem<StageId extends string> {
  id: StageId;
  step: number;
  label: string;
  detail: string;
  tone: WorkflowStageTone;
  disabled?: boolean;
  badge?: WorkflowStageIndicatorBadge;
}

export interface WorkflowStageIndicatorAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

interface WorkflowStageIndicatorsProps<StageId extends string> {
  stages: WorkflowStageIndicatorItem<StageId>[];
  onSelectStage: (stage: StageId) => void;
  actions?: WorkflowStageIndicatorAction[];
}

const toneDot: Record<WorkflowStageTone, string> = {
  current: 'bg-[var(--color-figma-accent)]',
  complete: 'bg-[var(--color-figma-success)]',
  pending: 'bg-[var(--color-figma-border)]',
  blocked: 'bg-[var(--color-figma-border)]',
};

const toneText: Record<WorkflowStageTone, string> = {
  current: 'text-[var(--color-figma-accent)] font-semibold',
  complete: 'text-[var(--color-figma-text)]',
  pending: 'text-[var(--color-figma-text-secondary)]',
  blocked: 'text-[var(--color-figma-text-tertiary)]',
};

export function WorkflowStageIndicators<StageId extends string>({
  stages,
  onSelectStage,
  actions = [],
}: WorkflowStageIndicatorsProps<StageId>) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center gap-0.5">
            {index > 0 && (
              <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-border)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mx-0.5 shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
            <button
              type="button"
              onClick={() => onSelectStage(stage.id)}
              disabled={stage.disabled}
              aria-current={stage.tone === 'current' ? 'step' : undefined}
              title={stage.detail ? `${stage.label}: ${stage.detail}` : stage.label}
              className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-secondary transition-colors ${toneText[stage.tone]} ${stage.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[stage.tone]}`} />
              {stage.label}
              {stage.badge && stage.badge.count > 0 && (
                <NoticeCountBadge
                  severity={stage.badge.severity}
                  count={stage.badge.count}
                  title={`${stage.badge.count} issue${stage.badge.count === 1 ? '' : 's'}`}
                />
              )}
            </button>
          </div>
        ))}
      </div>
      {actions.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className={`rounded border px-2 py-0.5 text-secondary font-medium transition-colors ${
                action.active
                  ? 'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
              } disabled:opacity-50`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
