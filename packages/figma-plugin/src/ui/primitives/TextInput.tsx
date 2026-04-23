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
  const sizeClass = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";
  const outlineClass = invalid
    ? "focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-error)]"
    : "focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]";
  return (
    <input
      ref={ref}
      type={rest.type ?? "text"}
      {...rest}
      className={`w-full rounded bg-[var(--color-figma-bg)] text-body text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${sizeClass} ${outlineClass} ${className}`}
    />
  );
});
