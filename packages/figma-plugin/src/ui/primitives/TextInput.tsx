import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import {
  CONTROL_INPUT_DISABLED_CLASSES,
  CONTROL_INPUT_BASE_CLASSES,
  CONTROL_INPUT_DEFAULT_STATE_CLASSES,
  CONTROL_INPUT_INVALID_STATE_CLASSES,
} from "../shared/controlClasses";

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
    ? `pr-7 ${CONTROL_INPUT_INVALID_STATE_CLASSES}`
    : CONTROL_INPUT_DEFAULT_STATE_CLASSES;
  const input = (
    <input
      ref={ref}
      type={rest.type ?? "text"}
      aria-invalid={invalid || undefined}
      {...rest}
      className={`w-full ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DISABLED_CLASSES} ${sizeClass} ${stateClass} ${className}`}
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
