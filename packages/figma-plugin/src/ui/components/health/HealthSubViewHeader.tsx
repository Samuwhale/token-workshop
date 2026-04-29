import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

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
            className="inline-flex min-h-6 items-center gap-1 rounded px-1.5 text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            aria-label="Back to Review"
          >
            <ArrowLeft size={12} strokeWidth={1.6} aria-hidden />
            <span>Review</span>
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
