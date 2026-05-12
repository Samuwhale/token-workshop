import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import {
  CONTROL_INPUT_BASE_CLASSES,
  CONTROL_INPUT_DEFAULT_STATE_CLASSES,
  CONTROL_INPUT_DISABLED_CLASSES,
  CONTROL_INPUT_INVALID_STATE_CLASSES,
} from "../shared/controlClasses";

interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  invalid?: boolean;
  size?: "sm" | "md";
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    { invalid, size = "md", className = "", rows = 2, ...rest },
    ref,
  ) {
    const sizeClass =
      size === "sm"
        ? "min-h-14 px-2 py-1.5"
        : "min-h-16 px-3 py-2";
    const stateClass = invalid
      ? CONTROL_INPUT_INVALID_STATE_CLASSES
      : CONTROL_INPUT_DEFAULT_STATE_CLASSES;

    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        {...rest}
        className={`w-full resize-none ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DISABLED_CLASSES} ${sizeClass} ${stateClass} ${className}`}
      />
    );
  },
);
