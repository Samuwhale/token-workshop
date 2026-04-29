import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
  size?: "sm" | "md";
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { invalid, size = "md", className = "", ...rest },
  ref,
) {
  const sizeClass =
    size === "sm"
      ? "min-h-7 px-2 py-1"
      : "min-h-8 px-3 py-1.5";
  const stateClass = invalid
    ? "border border-[var(--color-figma-error)] bg-[color-mix(in_srgb,var(--color-figma-error)_8%,var(--color-figma-bg))] pr-7 focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-error)]"
    : "border border-[var(--color-figma-border)] hover:border-[color:var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]";
  const input = (
    <input
      ref={ref}
      type={rest.type ?? "text"}
      aria-invalid={invalid || undefined}
      {...rest}
      className={`w-full rounded bg-[var(--color-figma-bg)] text-body text-[color:var(--color-figma-text)] outline-none placeholder:text-[color:var(--color-figma-text-tertiary)] disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass} ${stateClass} ${className}`}
    />
  );
  if (!invalid) return input;
  return (
    <span className="relative inline-flex w-full items-center">
      {input}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-[color:var(--color-figma-text-error)]"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    </span>
  );
});
