import { Search, X } from "lucide-react";
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "./classes";

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "size" | "type" | "value"> {
  size?: "sm" | "md";
  value: string;
  onClear?: () => void;
  containerClassName?: string;
}

const SIZE_CLASS: Record<NonNullable<SearchFieldProps["size"]>, string> = {
  sm: "min-h-7 pl-7 pr-7 py-1",
  md: "min-h-8 pl-8 pr-8 py-1.5",
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
            "w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-body text-[color:var(--color-figma-text)] outline-none transition-colors placeholder:text-[color:var(--color-figma-text-tertiary)] hover:border-[color:var(--color-figma-text-tertiary)] hover:bg-[var(--surface-hover)] focus-visible:border-[var(--color-figma-accent)] focus-visible:bg-[var(--color-figma-bg)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] disabled:cursor-not-allowed disabled:opacity-40",
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
            className="absolute right-1 inline-flex h-7 w-7 items-center justify-center rounded text-[color:var(--color-figma-text-tertiary)] outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
      </span>
    );
  },
);
