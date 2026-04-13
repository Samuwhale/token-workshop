import type { ResolverContentProps } from "../ResolverPanel";
import { ResolverContent } from "../ResolverPanel";
import { adaptShortcut } from "../../shared/utils";
import { SHORTCUT_KEYS } from "../../shared/shortcutRegistry";
import { ThemeResolverContextBanner } from "./ThemeResolverContextBanner";
import type { ThemeResolverAuthoringContext } from "./themeResolverContext";

interface ThemeAdvancedScreenProps {
  resolverState: ResolverContentProps;
  resolverAuthoringContext: ThemeResolverAuthoringContext | null;
  onBack: () => void;
  onSuccess?: (message: string) => void;
}

export function ThemeAdvancedScreen({
  resolverState,
  resolverAuthoringContext,
  onBack,
  onSuccess,
}: ThemeAdvancedScreenProps) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              Advanced resolver setup
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Keep everyday light/dark, brand, and density authoring in theme
              families. Move here only when publish output needs custom
              resolution order, modifier defaults, or contexts that do not map
              cleanly to those families.
            </p>
          </div>
          <button
            onClick={onBack}
            className="shrink-0 inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
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
            Back to authoring
          </button>
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 text-[9px] text-[var(--color-figma-text-tertiary)]">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
            <span className="font-medium text-[var(--color-figma-text-secondary)]">
              Shortcut
            </span>
            <kbd className="rounded border border-[var(--color-figma-border)] px-1 font-mono leading-none">
              {adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER)}
            </kbd>
          </span>
        </div>
        <div className="grid gap-2 px-3 pb-2 md:grid-cols-2">
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2">
            <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Stay in theme families
            </p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Use the default authoring flow for designer-facing variants like
              light/dark, brand tiers, and density options.
            </p>
          </div>
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2">
            <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Use resolvers here
            </p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Open this screen when the output depends on explicit merge order,
              modifier defaults, or publish-time logic that spans multiple
              families.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          {resolverAuthoringContext && (
            <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
              <ThemeResolverContextBanner
                context={resolverAuthoringContext}
                title="Advanced review"
                description="Detailed resolver mismatch diagnostics stay in this advanced flow so the default family authoring surface can stay focused on dimensions and variants."
              />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ResolverContent {...resolverState} onSuccess={onSuccess} />
          </div>
        </div>
      </div>
    </>
  );
}
