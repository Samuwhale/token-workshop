import type { ResolverContentProps } from "../ResolverPanel";
import { ResolverContent } from "../ResolverPanel";

interface ThemeResolverScreenProps {
  resolverState: ResolverContentProps;
  onBack: () => void;
  onSuccess?: (message: string) => void;
}

export function ThemeResolverScreen({
  resolverState,
  onBack,
  onSuccess,
}: ThemeResolverScreenProps) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2.5">
          <button
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to theme setup
          </button>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Theme setup / Output setup
              </div>
              <div className="mt-0.5 text-[12px] font-semibold text-[var(--color-figma-text)]">
                Match theme modes to an output
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                Choose the output file that should represent this theme, confirm each mode maps to the right switch, then review the resolved token result.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ResolverContent {...resolverState} onSuccess={onSuccess} />
      </div>
    </>
  );
}
