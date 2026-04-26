import type { HTMLAttributes, ReactNode } from "react";

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "muted" | "warning" | "error";
  padding?: "none" | "sm" | "md";
  children: ReactNode;
}

const VARIANT_CLASS: Record<NonNullable<SurfaceProps["variant"]>, string> = {
  default: "bg-[var(--surface-2)]",
  muted: "bg-[var(--surface-muted)]",
  warning:
    "bg-[color-mix(in_srgb,var(--color-figma-warning)_12%,transparent)]",
  error:
    "bg-[color-mix(in_srgb,var(--color-figma-error)_12%,transparent)]",
};

const PADDING_CLASS: Record<NonNullable<SurfaceProps["padding"]>, string> = {
  none: "",
  sm: "px-2 py-1.5",
  md: "px-3 py-2.5",
};

export function Surface({
  variant = "muted",
  padding = "md",
  className = "",
  children,
  ...rest
}: SurfaceProps) {
  return (
    <div
      {...rest}
      className={`rounded-[var(--radius-md)] ${VARIANT_CLASS[variant]} ${PADDING_CLASS[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
