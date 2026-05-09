import { X } from "lucide-react";

interface ChipProps {
  label: string;
  onRemove?: () => void;
  title?: string;
  tone?: "accent" | "neutral";
}

export function Chip({ label, onRemove, title, tone = "accent" }: ChipProps) {
  const removable = Boolean(onRemove);
  const toneClass =
    tone === "accent"
      ? "bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]"
      : "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]";

  if (!removable) {
    return (
      <span
        title={title ?? label}
        className="inline-flex min-h-6 min-w-0 max-w-full items-center rounded-full bg-[var(--color-figma-bg)] px-2 text-secondary text-[color:var(--color-figma-text-secondary)]"
      >
        <span className="min-w-0 truncate">{label}</span>
      </span>
    );
  }

  return (
    <span
      title={title ?? label}
      className={`inline-flex min-h-6 min-w-0 max-w-full items-center gap-1 rounded-full pl-2 pr-1 text-secondary transition-colors ${toneClass}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        title={title ?? `Remove ${label}`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current transition-colors hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,currentColor_14%,transparent)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]"
      >
        <X size={10} strokeWidth={1.5} aria-hidden className="shrink-0" />
      </button>
    </span>
  );
}
