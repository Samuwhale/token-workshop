type EdgeStroke = "solid" | "dashed" | "dotted";

interface LegendItem {
  label: string;
  color: string;
  stroke: EdgeStroke;
}

const ITEMS: LegendItem[] = [
  { label: "Alias", color: "var(--color-figma-text-tertiary)", stroke: "solid" },
  { label: "Generator", color: "var(--color-figma-generator)", stroke: "dotted" },
  { label: "Broken", color: "var(--color-figma-error)", stroke: "dashed" },
  { label: "Cycle", color: "var(--color-figma-warning)", stroke: "solid" },
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
          <span
            className="inline-block h-px w-4"
            style={{
              background: item.stroke === "solid" ? item.color : "transparent",
              borderTop:
                item.stroke === "dashed"
                  ? `1px dashed ${item.color}`
                  : item.stroke === "dotted"
                    ? `1px dotted ${item.color}`
                    : undefined,
            }}
            aria-hidden
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
