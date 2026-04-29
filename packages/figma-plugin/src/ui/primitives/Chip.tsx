import { X } from "lucide-react";

interface ChipProps {
  label: string;
  onRemove?: () => void;
  title?: string;
  tone?: "accent" | "neutral";
}

export function Chip({ label, onRemove, title, tone = "accent" }: ChipProps) {
  const removable = Boolean(onRemove);
  const toneClass = removable
    ? tone === "accent"
      ? "bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
      : "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg)]"
    : "bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text-secondary)]";
  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={!removable}
      title={title ?? (removable ? `Remove ${label}` : label)}
      className={`inline-flex h-[22px] min-w-0 max-w-full items-center gap-1 rounded-full px-2 text-secondary transition-colors ${toneClass}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {removable ? <X size={10} strokeWidth={1.5} aria-hidden className="shrink-0" /> : null}
    </button>
  );
}
