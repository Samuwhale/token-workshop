import type { SyncWorkflowStage, SyncWorkflowTone } from '../../shared/syncWorkflow';

interface SyncWorkflowItem {
  id: SyncWorkflowStage;
  step: number;
  label: string;
  detail: string;
  tone: SyncWorkflowTone;
  disabled?: boolean;
}

interface SyncWorkflowControlsProps {
  stages: SyncWorkflowItem[];
  onSelectStage: (stage: SyncWorkflowStage) => void;
}

const stageToneClasses: Record<SyncWorkflowTone, string> = {
  current: 'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-text)]',
  complete: 'border-emerald-500/25 bg-emerald-500/8 text-[var(--color-figma-text)]',
  pending: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]',
  blocked: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]',
};

const badgeToneClasses: Record<SyncWorkflowTone, string> = {
  current: 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]',
  complete: 'bg-emerald-500/15 text-emerald-600',
  pending: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]',
  blocked: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]',
};

export function SyncWorkflowControls({
  stages,
  onSelectStage,
}: SyncWorkflowControlsProps) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
          Sync workflow
        </div>
        <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          Clear preflight first, then compare differences, then apply the destinations you want to keep.
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
