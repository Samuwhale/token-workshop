import { useNavigationContext } from "../contexts/NavigationContext";
import type { NavigationHandoff } from "../contexts/NavigationContext";

interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface PanelContentHeaderProps {
  primaryAction?: PrimaryAction | null;
}

function computeVisibleHandoff(
  activeHandoff: NavigationHandoff | null,
  activeSecondarySurface: string | null,
  activeTopTab: string,
  activeSubTab: string,
): NavigationHandoff | null {
  if (!activeHandoff) return null;

  if (
    activeHandoff.returnTarget.secondarySurfaceId !== null &&
    activeSecondarySurface === activeHandoff.returnTarget.secondarySurfaceId
  ) {
    return null;
  }

  if (
    activeHandoff.returnTarget.secondarySurfaceId === null &&
    activeSecondarySurface === null &&
    activeTopTab === activeHandoff.returnTarget.topTab &&
    activeSubTab === activeHandoff.returnTarget.subTab
  ) {
    return null;
  }

  return activeHandoff;
}

export function PanelContentHeader({ primaryAction }: PanelContentHeaderProps) {
  const {
    activeHandoff,
    returnFromHandoff,
    activeSecondarySurface,
    activeTopTab,
    activeSubTab,
  } = useNavigationContext();

  const visibleHandoff = computeVisibleHandoff(
    activeHandoff,
    activeSecondarySurface,
    activeTopTab,
    activeSubTab,
  );

  if (!visibleHandoff && !primaryAction) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
      {visibleHandoff && returnFromHandoff && (
        <button
          onClick={returnFromHandoff}
          aria-label={visibleHandoff.returnLabel}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          &larr; {visibleHandoff.returnLabel}
        </button>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            className="shrink-0 rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1 text-secondary font-medium text-white transition-colors outline-none hover:bg-[var(--color-figma-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/35 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
