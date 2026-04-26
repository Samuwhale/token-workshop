import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

type Gap = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10;

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: "column" | "row";
  gap?: Gap;
  align?: "start" | "center" | "end" | "stretch";
  wrap?: boolean;
  children: ReactNode;
}

const GAP_CLASS: Record<Gap, string> = {
  1: "gap-[var(--space-1)]",
  2: "gap-[var(--space-2)]",
  3: "gap-[var(--space-3)]",
  4: "gap-[var(--space-4)]",
  5: "gap-[var(--space-5)]",
  6: "gap-[var(--space-6)]",
  8: "gap-[var(--space-8)]",
  10: "gap-[var(--space-10)]",
};

const ALIGN_CLASS: Record<NonNullable<StackProps["align"]>, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { direction = "column", gap = 4, align, wrap, className = "", children, ...rest },
  ref,
) {
  const dir = direction === "row" ? "flex-row" : "flex-col";
  const alignClass = align ? ALIGN_CLASS[align] : "";
  const wrapClass = wrap ? "flex-wrap" : "";
  return (
    <div
      ref={ref}
      {...rest}
      className={`flex min-w-0 ${dir} ${GAP_CLASS[gap]} ${alignClass} ${wrapClass} ${className}`}
    >
      {children}
    </div>
  );
});
