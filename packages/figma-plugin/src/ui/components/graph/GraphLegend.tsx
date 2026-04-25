import { useEffect, useRef, useState } from "react";

interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
  shape?: "line" | "dot";
}

const ITEMS: LegendItem[] = [
  { label: "Alias", color: "var(--color-figma-text-tertiary)", shape: "line" },
  { label: "Generated", color: "var(--color-figma-generator)", shape: "dot" },
  {
    label: "Broken",
    color: "var(--color-figma-error)",
    shape: "line",
    dashed: true,
  },
  { label: "Cycle", color: "var(--color-figma-warning)", shape: "line" },
];

export function LegendContent() {
  return (
    <div
      role="group"
      aria-label="Graph legend"
      className="flex flex-col gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]"
    >
      {ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-2">
          {item.shape === "dot" ? (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: item.color }}
              aria-hidden
            />
          ) : (
            <span
              className="inline-block h-px w-4"
              style={{
                background: item.dashed ? "transparent" : item.color,
                borderTop: item.dashed ? `1px dashed ${item.color}` : undefined,
              }}
              aria-hidden
            />
          )}
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export function LegendPopoverButton() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Show legend"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
      >
        <span aria-hidden className="text-[11px] font-medium">
          ?
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-44 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2 shadow-lg">
          <LegendContent />
        </div>
      ) : null}
    </div>
  );
}
