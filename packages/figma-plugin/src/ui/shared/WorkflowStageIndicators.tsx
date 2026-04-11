export type WorkflowStageTone = 'current' | 'complete' | 'pending' | 'blocked';

export interface WorkflowStageIndicatorItem<StageId extends string> {
  id: StageId;
  step: number;
  label: string;
  detail: string;
  tone: WorkflowStageTone;
  disabled?: boolean;
}

export interface WorkflowStageIndicatorAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

interface WorkflowStageIndicatorsProps<StageId extends string> {
  title: string;
  description: string;
  stages: WorkflowStageIndicatorItem<StageId>[];
  onSelectStage: (stage: StageId) => void;
  actions?: WorkflowStageIndicatorAction[];
}

const stageToneClasses: Record<WorkflowStageTone, string> = {
  current:
    'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-text)]',
  complete:
    'border-emerald-500/25 bg-emerald-500/8 text-[var(--color-figma-text)]',
  pending:
    'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]',
  blocked:
    'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]',
};

const badgeToneClasses: Record<WorkflowStageTone, string> = {
  current: 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]',
  complete: 'bg-emerald-500/15 text-emerald-600',
  pending:
    'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]',
  blocked:
    'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]',
};

const detailToneClasses: Record<WorkflowStageTone, string> = {
  current: 'text-[var(--color-figma-accent)]',
  complete: 'text-emerald-600',
  pending: 'text-[var(--color-figma-text-secondary)]',
  blocked: 'text-[var(--color-figma-text-tertiary)]',
};

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function WorkflowStageIndicators<StageId extends string>({
  title,
  description,
  stages,
  onSelectStage,
  actions = [],
}: WorkflowStageIndicatorsProps<StageId>) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
              {title}
            </span>
            <span className="min-w-0 text-[10px] text-[var(--color-figma-text-secondary)]">
              {description}
            </span>
          </div>
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className={joinClasses(
                  'rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
                  action.active
                    ? 'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/35 hover:text-[var(--color-figma-text)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stages.map((stage) => {
          const detailLabel = stage.disabled ? 'Locked' : stage.detail;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelectStage(stage.id)}
              disabled={stage.disabled}
              aria-current={stage.tone === 'current' ? 'step' : undefined}
              title={`${stage.label}: ${detailLabel}`}
              className={joinClasses(
                'flex min-w-[148px] shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-left transition-[border-color,background-color,color,opacity] duration-150 ease-out',
                stageToneClasses[stage.tone],
                stage.disabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:border-[var(--color-figma-accent)]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/20',
              )}
            >
              <span
                className={joinClasses(
                  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                  badgeToneClasses[stage.tone],
                )}
              >
                {stage.step}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]">
                  {stage.label}
                </span>
                <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-figma-border)]" />
                <span
                  className={joinClasses(
                    'min-w-0 truncate text-[10px]',
                    detailToneClasses[stage.tone],
                    stage.disabled &&
                      'rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]',
                  )}
                >
                  {detailLabel}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
