import type { HTMLAttributes, ReactNode } from "react";

interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end" | "between";
  children: ReactNode;
}

const JUSTIFY_CLASS: Record<NonNullable<ToolbarProps["align"]>, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

export function Toolbar({
  align = "start",
  className = "",
  children,
  ...rest
}: ToolbarProps) {
  return (
    <div
      role="toolbar"
      {...rest}
      className={`flex min-w-0 flex-wrap items-center gap-[var(--space-2)] ${JUSTIFY_CLASS[align]} ${className}`}
    >
      {children}
    </div>
  );
}
