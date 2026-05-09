import { ChevronLeft } from "lucide-react";

interface SecondaryTakeoverHeaderProps {
  title: string;
  onClose: () => void;
  closeLabel?: string;
}

export function SecondaryTakeoverHeader({
  title,
  onClose,
  closeLabel = "Back",
}: SecondaryTakeoverHeaderProps) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-figma-border)] bg-[var(--surface-panel-header)] px-2 py-1.5">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-7 min-w-0 items-center gap-1 rounded-[var(--radius-md)] px-1.5 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)]"
        aria-label={closeLabel}
        title={closeLabel}
      >
        <ChevronLeft size={12} strokeWidth={1.7} aria-hidden />
        <span>{closeLabel}</span>
      </button>
      <h2 className="min-w-0 text-body font-medium text-[color:var(--color-figma-text)]">
        {title}
      </h2>
    </div>
  );
}
