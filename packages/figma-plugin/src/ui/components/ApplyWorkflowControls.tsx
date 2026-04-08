import type { ApplyWorkflowStage, ApplyWorkflowTone } from '../shared/applyWorkflow';

interface ApplyWorkflowItem {
  id: ApplyWorkflowStage;
  step: number;
  label: string;
  detail: string;
  tone: ApplyWorkflowTone;
  disabled?: boolean;
}

interface ApplyWorkflowControlsProps {
  stages: ApplyWorkflowItem[];
  onSelectStage: (stage: ApplyWorkflowStage) => void;
}

const stageToneClasses: Record<ApplyWorkflowTone, string> = {
  current: 'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-text)]',
  complete: 'border-emerald-500/25 bg-emerald-500/8 text-[var(--color-figma-text)]',
  pending: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]',
  blocked: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]',
};

const badgeToneClasses: Record<ApplyWorkflowTone, string> = {
  current: 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]',
  complete: 'bg-emerald-500/15 text-emerald-600',
  pending: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]',
  blocked: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]',
};

export function ApplyWorkflowControls({
  stages,
  onSelectStage,
}: ApplyWorkflowControlsProps) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
          Apply workflow
        </div>
        <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          Review the selection first, check best matches second, bind visible properties third, and keep maintenance tools collapsed until you need them.
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {stages.map((stage) => (
          <button
            key={stage.id}
            onClick={() => onSelectStage(stage.id)}
            disabled={stage.disabled}
            className={`min-w-[160px] flex-1 rounded-[14px] border px-3 py-2 text-left transition-colors ${stageToneClasses[stage.tone]} ${
              stage.disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-[var(--color-figma-accent)]/35'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${badgeToneClasses[stage.tone]}`}>
                {stage.step}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
                {stage.label}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)]">
              {stage.detail}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
