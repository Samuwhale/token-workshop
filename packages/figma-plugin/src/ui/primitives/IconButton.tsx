import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

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
      className={`inline-flex shrink-0 items-center justify-center rounded border border-transparent bg-transparent transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-[color:var(--color-figma-text-tertiary)] disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-figma-text-tertiary)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] ${SIZE_CLASS[size]} ${toneClass} ${className}`}
    >
      {children}
    </button>
  );
});
