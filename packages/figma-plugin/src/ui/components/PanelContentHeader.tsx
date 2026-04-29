import { useNavigationContext } from "../contexts/NavigationContext";
import type { NavigationHandoff } from "../contexts/NavigationContext";
import { Button } from "../primitives";

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
    <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
      <div className="tm-panel-bar">
        <div className="tm-panel-bar__leading">
          {visibleHandoff && returnFromHandoff && (
            <Button
              onClick={returnFromHandoff}
              aria-label={visibleHandoff.returnLabel}
              variant="ghost"
              size="sm"
              className="min-w-0 justify-start px-1.5 text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-text-accent)]"
            >
              <span aria-hidden="true">&larr;</span>
              <span className="truncate">{visibleHandoff.returnLabel}</span>
            </Button>
          )}
        </div>

        <div className="tm-panel-bar__actions">
        {primaryAction && (
          <Button
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            variant="primary"
            size="md"
            className="max-w-full"
          >
            <span className="block truncate">{primaryAction.label}</span>
          </Button>
        )}
        </div>
      </div>
    </div>
  );
}
