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
    <div className="flex shrink-0 items-center gap-3 px-3 py-2">
      <button
        type="button"
        onClick={onBack}
        className="text-secondary text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text)]"
      >
        ← Review
      </button>
      <span className="text-body font-semibold text-[var(--color-figma-text)]">
        {title}
      </span>
      {count != null ? (
        <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
          {count}
        </span>
      ) : null}
      {trailing ? <div className="ml-auto flex items-center gap-1.5">{trailing}</div> : null}
    </div>
  );
}
