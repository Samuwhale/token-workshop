import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "border border-transparent bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)] aria-expanded:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50",
  secondary:
    "border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text)] hover:bg-[var(--surface-hover)] hover:border-[color:var(--color-figma-text-tertiary)] aria-pressed:bg-[var(--surface-selected)] aria-pressed:border-[color:var(--color-figma-accent)] aria-expanded:bg-[var(--surface-hover)] aria-expanded:border-[color:var(--color-figma-text-tertiary)] disabled:opacity-50",
  ghost:
    "border border-transparent text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)] aria-pressed:bg-[var(--surface-selected)] aria-pressed:text-[color:var(--color-figma-text)] aria-expanded:bg-[var(--surface-hover)] aria-expanded:text-[color:var(--color-figma-text)] disabled:opacity-50",
  danger:
    "border border-transparent bg-[var(--color-figma-error)] text-[color:var(--color-figma-text-onbrand)] hover:opacity-90 aria-expanded:opacity-90 disabled:opacity-50",
};

const SIZE_CLASS: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "min-h-7 px-2.5 py-1 text-secondary",
  md: "min-h-8 px-3 py-1.5 text-body",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "secondary", size = "md", className = "", children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        {...rest}
        className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded text-center leading-tight font-medium outline-none transition-colors disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] focus-visible:outline-offset-[1px] ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      >
        {children}
      </button>
    );
  },
);
