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

export function GraphLegend() {
  return (
    <div
      role="group"
      aria-label="Graph legend"
      className="pointer-events-auto flex items-center gap-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]/85 px-2.5 py-1 text-[10px] text-[var(--color-figma-text-secondary)] backdrop-blur"
    >
      {ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
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
