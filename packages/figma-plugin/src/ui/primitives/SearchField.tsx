import { Search, X } from "lucide-react";
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "./classes";
import {
  CONTROL_DISABLED_CLASSES,
  CONTROL_FOCUS_ACCENT,
  CONTROL_INPUT_BASE_CLASSES,
  CONTROL_INPUT_DEFAULT_STATE_CLASSES,
} from "../shared/controlClasses";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "size" | "type" | "value"> {
  size?: "sm" | "md";
  value: string;
  onClear?: () => void;
  containerClassName?: string;
}

const SIZE_CLASS: Record<NonNullable<SearchFieldProps["size"]>, string> = {
  sm: "min-h-7 pl-7 pr-8 py-1",
  md: "min-h-8 pl-8 pr-9 py-1.5",
};

const ICON_SIZE_CLASS: Record<NonNullable<SearchFieldProps["size"]>, string> = {
  sm: "h-3 w-3 left-2",
  md: "h-3.5 w-3.5 left-3",
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField(
    {
      size = "md",
      value,
      onChange,
      onClear,
      className,
      containerClassName,
      disabled,
      ...rest
    },
    ref,
  ) {
    const hasValue = value.length > 0;

    return (
      <span
        className={cx(
          "relative inline-flex w-full min-w-0 items-center",
          containerClassName,
        )}
      >
        <Search
          aria-hidden="true"
          strokeWidth={1.5}
          className={cx(
            "pointer-events-none absolute text-[color:var(--color-figma-text-tertiary)]",
            ICON_SIZE_CLASS[size],
          )}
        />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...rest}
          className={cx(
            `w-full ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES} hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--color-figma-bg)] ${CONTROL_DISABLED_CLASSES}`,
            SIZE_CLASS[size],
            className,
          )}
        />
        {onClear && hasValue ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            disabled={disabled}
            className={`absolute right-1 inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[color:var(--color-figma-text-tertiary)] outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)] ${CONTROL_FOCUS_ACCENT} disabled:cursor-not-allowed disabled:text-[color:var(--color-figma-text-tertiary)] disabled:hover:bg-transparent disabled:hover:text-[color:var(--color-figma-text-tertiary)]`}
          >
            <X size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
      </span>
    );
  },
);
