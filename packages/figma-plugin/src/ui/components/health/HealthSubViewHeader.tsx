import type { ReactNode } from "react";

interface HealthSubViewHeaderProps {
  title: string;
  count?: ReactNode;
  onBack: () => void;
  trailing?: ReactNode;
}

export function HealthSubViewHeader({
  title,
  count,
  onBack,
  trailing,
}: HealthSubViewHeaderProps) {
  return (
    <div className="shrink-0 px-3 py-2">
      <div className="tm-panel-bar">
        <div className="tm-panel-bar__leading">
          <button
            type="button"
            onClick={onBack}
            className="text-secondary text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text)]"
          >
            ← Review
          </button>
          <span className="tm-panel-bar__title text-body font-semibold text-[var(--color-figma-text)]">
            {title}
          </span>
          {count != null ? (
            <span className="tm-panel-bar__meta text-secondary text-[var(--color-figma-text-tertiary)]">
              {count}
            </span>
          ) : null}
        </div>
        {trailing ? <div className="tm-panel-bar__actions">{trailing}</div> : null}
      </div>
    </div>
  );
}
