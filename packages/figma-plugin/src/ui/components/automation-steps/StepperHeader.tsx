/**
 * Visual step indicator bar for the recipe creation stepper.
 * Shows 3 steps: Where → What → Review, with active/completed states.
 */

export type RecipeStep = 'where' | 'what' | 'review';

const STEPS: { key: RecipeStep; label: string; number: number }[] = [
  { key: 'where', label: 'Destination', number: 1 },
  { key: 'what', label: 'Configure', number: 2 },
  { key: 'review', label: 'Review', number: 3 },
];

export function StepperHeader({
  currentStep,
  onStepClick,
  canNavigateTo,
}: {
  currentStep: RecipeStep;
  onStepClick: (step: RecipeStep) => void;
  /** Which steps the user can click to navigate back to */
  canNavigateTo: (step: RecipeStep) => boolean;
}) {
  const currentIdx = STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      {STEPS.map((step, idx) => {
        const isActive = step.key === currentStep;
        const isCompleted = idx < currentIdx;
        const isClickable = canNavigateTo(step.key) && !isActive;

        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            {idx > 0 && (
              <div className={`flex-none w-4 h-px ${isCompleted || isActive ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`} />
            )}
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step.key)}
              disabled={!isClickable}
              aria-label={`Step ${step.number}: ${step.label}`}
              className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors text-left min-w-0 ${
                isActive
                  ? 'bg-[var(--color-figma-accent)]/10'
                  : isClickable
                    ? 'hover:bg-[var(--color-figma-bg-hover)] cursor-pointer'
                    : ''
              }`}
            >
              {/* Step number circle */}
              <span className={`flex-none w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center leading-none ${
                isActive
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : isCompleted
                    ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]'
                    : 'bg-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
              }`}>
                {isCompleted ? (
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 6.5L5 9l4.5-6" />
                  </svg>
                ) : (
                  step.number
                )}
              </span>
              <span className={`text-[10px] font-medium truncate ${
                isActive
                  ? 'text-[var(--color-figma-accent)]'
                  : isCompleted
                    ? 'text-[var(--color-figma-text)]'
                    : 'text-[var(--color-figma-text-secondary)]'
              }`}>
                {step.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
