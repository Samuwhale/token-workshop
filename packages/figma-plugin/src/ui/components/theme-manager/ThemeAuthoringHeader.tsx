import type { ThemeDimension } from "@tokenmanager/core";
import { handleMenuArrowKeys } from "../../hooks/useMenuKeyboard";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";

interface ThemeAuthoringHeaderProps {
  focusedDimension: ThemeDimension | null;
  onOpenCoverageView: () => void;
  onOpenAdvancedSetup: () => void;
}

export function ThemeAuthoringHeader({
  focusedDimension,
  onOpenCoverageView,
  onOpenAdvancedSetup,
}: ThemeAuthoringHeaderProps) {
  const {
    secondaryToolsOpen,
    setSecondaryToolsOpen,
    secondaryToolsRef,
  } = useThemeAuthoringContext();

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
          {focusedDimension?.name ?? "Themes"}
        </span>
        <div className="relative" ref={secondaryToolsRef}>
          <button
            onClick={() => setSecondaryToolsOpen((value) => !value)}
            aria-expanded={secondaryToolsOpen}
            aria-haspopup="menu"
            className={`rounded p-1.5 transition-colors ${
              secondaryToolsOpen
                ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                : "text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)]"
            }`}
            title="Review, compare, and advanced tools"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>

          {secondaryToolsOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 w-[180px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
              onKeyDown={(event) => {
                const container = event.currentTarget;
                if (!handleMenuArrowKeys(event.nativeEvent, container)) {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setSecondaryToolsOpen(false);
                  }
                }
              }}
            >
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setSecondaryToolsOpen(false);
                  onOpenCoverageView();
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Review issues
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setSecondaryToolsOpen(false);
                  onOpenAdvancedSetup();
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Advanced setup
              </button>
              <div className="border-t border-[var(--color-figma-border)] px-3 py-1.5 text-[9px] leading-snug text-[var(--color-figma-text-tertiary)]">
                Compare tools and raw role controls now live in Advanced setup.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
