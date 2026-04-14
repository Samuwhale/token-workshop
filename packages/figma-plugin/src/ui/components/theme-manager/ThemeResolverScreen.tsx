import type { ResolverContentProps } from "../ResolverPanel";
import { ResolverContent } from "../ResolverPanel";
import { ThemeResolverContextBanner } from "./ThemeResolverContextBanner";
import type { ThemeResolverAuthoringContext } from "./themeResolverContext";

interface ThemeResolverScreenProps {
  resolverState: ResolverContentProps;
  resolverAuthoringContext: ThemeResolverAuthoringContext | null;
  onBack: () => void;
  onSuccess?: (message: string) => void;
}

export function ThemeResolverScreen({
  resolverState,
  resolverAuthoringContext,
  onBack,
  onSuccess,
}: ThemeResolverScreenProps) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-start justify-between gap-3 px-3 py-2">
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
            Back to modes
          </button>
          {resolverAuthoringContext && (
            <ThemeResolverContextBanner context={resolverAuthoringContext} />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ResolverContent {...resolverState} onSuccess={onSuccess} />
      </div>
    </>
  );
}
