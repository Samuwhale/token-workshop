import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  children: ReactNode;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--color-figma-accent)] text-[var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50",
  secondary:
    "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50",
  ghost:
    "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50",
  danger:
    "bg-[var(--color-figma-error)] text-[var(--color-figma-text-onbrand)] hover:opacity-90 disabled:opacity-50",
};

const SIZE_CLASS: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "min-h-7 px-2 py-1 text-secondary",
  md: "min-h-7 px-2.5 py-1 text-body",
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
        className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded text-center leading-tight font-medium outline-none transition-colors focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] focus-visible:outline-offset-[1px] ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      >
        {children}
      </button>
    );
  },
);
