import { useNavigationContext } from "../contexts/NavigationContext";
import type { NavigationHandoff } from "../contexts/NavigationContext";
import { Button } from "../primitives";

interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface PanelContentHeaderProps {
  title?: string;
  meta?: string;
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

export function PanelContentHeader({
  title,
  meta,
  primaryAction,
}: PanelContentHeaderProps) {
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

  if (!visibleHandoff && !title && !meta && !primaryAction) return null;

  return (
    <div className="shrink-0 px-3 py-2">
      <div className="tm-panel-bar">
        <div className="tm-panel-bar__leading">
          {visibleHandoff && returnFromHandoff && (
            <Button
              onClick={returnFromHandoff}
              aria-label={visibleHandoff.returnLabel}
              variant="ghost"
              size="sm"
              wrap
              className="min-w-0 justify-start px-1.5 text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-text-accent)]"
            >
              <span aria-hidden="true">&larr;</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {visibleHandoff.returnLabel}
              </span>
            </Button>
          )}
          {title ? (
            <span className="tm-panel-bar__title text-body font-semibold text-[color:var(--color-figma-text)]">
              {title}
            </span>
          ) : null}
          {meta ? (
            <span className="tm-panel-bar__meta text-secondary text-[color:var(--color-figma-text-tertiary)]">
              {meta}
            </span>
          ) : null}
        </div>

        {primaryAction ? (
          <div className="tm-panel-bar__actions">
            <Button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              variant="primary"
              size="md"
              wrap
              className="max-w-full"
            >
              <span className="block min-w-0 [overflow-wrap:anywhere]">
                {primaryAction.label}
              </span>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
