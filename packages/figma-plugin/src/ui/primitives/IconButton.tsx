import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  tone?: "default" | "danger";
  children: ReactNode;
}

const SIZE_CLASS: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-8 w-8",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", tone = "default", className = "", children, ...rest },
  ref,
) {
  const toneClass =
    tone === "danger"
      ? "text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
      : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]";
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] ${SIZE_CLASS[size]} ${toneClass} ${className}`}
    >
      {children}
    </button>
  );
});
