import {
  type ImportSource,
  type ImportWorkflowItem,
  type ImportWorkflowStage,
  type ImportWorkflowTone,
  type SourceFamily,
  getFamilyDefinition,
  getSourceDefinition,
} from './importPanelTypes';

const stageToneClasses: Record<ImportWorkflowTone, string> = {
  current: 'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-text)]',
  complete: 'border-emerald-500/25 bg-emerald-500/8 text-[var(--color-figma-text)]',
  pending: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]',
  blocked: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]',
};

const badgeToneClasses: Record<ImportWorkflowTone, string> = {
  current: 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]',
  complete: 'bg-emerald-500/15 text-emerald-600',
  pending: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]',
  blocked: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]',
};

interface ImportWorkflowStepsProps {
  sourceFamily: SourceFamily | null;
  source: ImportSource | null;
  workflowStage: ImportWorkflowStage;
  destinationReady: boolean;
  destinationLabel?: string;
}

function buildSteps(
  sourceFamily: SourceFamily | null,
  source: ImportSource | null,
  workflowStage: ImportWorkflowStage,
  destinationReady: boolean,
  destinationLabel?: string,
): ImportWorkflowItem[] {
  const family = getFamilyDefinition(sourceFamily);
  const format = getSourceDefinition(source);

  const familyTone: ImportWorkflowTone = workflowStage === 'family'
    ? 'current'
    : sourceFamily
      ? 'complete'
      : 'current';
  const formatTone: ImportWorkflowTone = workflowStage === 'family'
    ? 'blocked'
    : workflowStage === 'format'
      ? 'current'
      : source
        ? 'complete'
        : 'blocked';
  const destinationTone: ImportWorkflowTone = !source
    ? 'blocked'
    : workflowStage === 'destination'
      ? 'current'
      : workflowStage === 'preview' && destinationReady
      ? 'complete'
        : 'blocked';

  return [
    {
      id: 'family',
      step: 1,
      label: 'Source family',
      detail: family?.title ?? 'Choose whether you are importing from Figma, token files, code, or another tool.',
      tone: familyTone,
    },
    {
      id: 'format',
      step: 2,
      label: 'Exact format',
      detail: format?.label ?? 'After picking a family, choose the specific format or reader.',
      tone: formatTone,
    },
    {
      id: 'destination',
      step: 3,
      label: destinationLabel ?? format?.destinationLabel ?? family?.destinationLabel ?? 'Destination rules',
      detail: destinationReady
        ? format?.destinationDescription ?? family?.destinationDescription ?? 'Destination rules are ready.'
        : 'Choose where the import should land before you apply it.',
      tone: destinationTone,
    },
  ];
}

export function ImportWorkflowSteps({
  sourceFamily,
  source,
  workflowStage,
  destinationReady,
  destinationLabel,
}: ImportWorkflowStepsProps) {
  const steps = buildSteps(sourceFamily, source, workflowStage, destinationReady, destinationLabel);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
          Import workflow
        </div>
        <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          Pick the source family first, confirm the exact reader second, then set the destination rules before importing.
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {steps.map((stage) => (
          <div
            key={stage.id}
            className={`rounded-[14px] border px-3 py-2 ${stageToneClasses[stage.tone]}`}
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
          </div>
        ))}
      </div>
    </div>
  );
}
