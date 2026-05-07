import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  CONTROL_DISABLED_CLASSES,
  CONTROL_FOCUS_ACCENT,
} from "../shared/controlClasses";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  tone?: "default" | "danger";
  children: ReactNode;
}

const SIZE_CLASS: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-9 w-9",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", tone = "default", className = "", children, ...rest },
  ref,
) {
  const toneClass =
    tone === "danger"
      ? "text-[color:var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[color:var(--color-figma-text-error)] aria-pressed:bg-[var(--color-figma-error)]/10 aria-pressed:text-[color:var(--color-figma-text-error)] aria-expanded:bg-[var(--color-figma-error)]/10 aria-expanded:text-[color:var(--color-figma-text-error)]"
      : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)] aria-pressed:bg-[var(--surface-selected)] aria-pressed:text-[color:var(--color-figma-text)] aria-expanded:bg-[var(--surface-hover)] aria-expanded:text-[color:var(--color-figma-text)]";
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-transparent bg-transparent transition-colors ${CONTROL_DISABLED_CLASSES} ${CONTROL_FOCUS_ACCENT} ${SIZE_CLASS[size]} ${toneClass} ${className}`}
    >
      {children}
    </button>
  );
});
