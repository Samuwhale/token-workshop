export const QUICK_CREATE_SURFACE_CLASSES = {
  section: "flex flex-col gap-2",
  titleBlock: "flex flex-col gap-1",
  title: "text-[11px] font-medium text-[var(--color-figma-text)]",
  description:
    "text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]",
  summaryCard:
    "flex flex-col gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5",
  summaryRow:
    "flex flex-wrap items-start gap-x-2 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]",
  summaryLabel:
    "shrink-0 font-medium uppercase tracking-[0.02em] text-[var(--color-figma-text-tertiary)]",
  summaryValue: "min-w-0 break-words text-[var(--color-figma-text)]",
  summaryMono: "min-w-0 break-all font-mono text-[var(--color-figma-text)]",
  fieldStack: "flex flex-col gap-1",
  fieldLabel: "text-[10px] font-medium text-[var(--color-figma-text-secondary)]",
} as const;
