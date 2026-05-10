import type { ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";

import { cx } from "./classes";
import { CONTROL_FOCUS_ACCENT } from "../shared/controlClasses";

export interface DisclosureRowProps {
  title: ReactNode;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export interface CheckboxRowProps {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  meta?: ReactNode;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

export function DisclosureRow({
  title,
  summary,
  open,
  onToggle,
  action,
  disabled,
  className,
}: DisclosureRowProps) {
  const summaryTitle = typeof summary === "string" ? summary : undefined;

  return (
    <div className={cx("flex min-w-0 items-start justify-between gap-2", className)}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        className={`flex min-w-0 flex-1 items-start gap-1.5 rounded py-1 text-left text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:text-[color:var(--color-figma-text)] disabled:opacity-50 ${CONTROL_FOCUS_ACCENT}`}
      >
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className={cx("mt-0.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        <span className="min-w-0 flex-1 pt-px font-medium whitespace-normal break-words [overflow-wrap:anywhere]">
          {title}
        </span>
        {!open && summary ? (
          <span
            className="min-w-0 flex-1 whitespace-normal break-words leading-[var(--leading-body)] text-[color:var(--color-figma-text-tertiary)] [overflow-wrap:anywhere]"
            title={summaryTitle}
          >
            {summary}
          </span>
        ) : null}
      </button>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}

export function CheckboxRow({
  title,
  description,
  checked,
  onChange,
  meta,
  disabled,
  className,
  children,
}: CheckboxRowProps) {
  return (
    <label
      className={cx(
        "group flex min-w-0 cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left outline-none transition-colors hover:bg-[var(--color-figma-bg-hover)] focus-within:outline focus-within:outline-[1.5px] focus-within:outline-[var(--color-figma-accent)] focus-within:outline-offset-[-1px]",
        checked && "bg-[var(--surface-selected)]",
        disabled && "cursor-default opacity-50 hover:bg-transparent",
        className,
      )}
    >
      <span
        className={cx(
          "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
          checked
            ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]"
            : "border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]",
        )}
      >
        {checked ? <Check size={10} strokeWidth={2.5} aria-hidden /> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 text-body font-medium leading-[var(--leading-tight)] text-[color:var(--color-figma-text)] whitespace-normal break-words [overflow-wrap:anywhere]">
          {title}
        </span>
        {description ? (
          <span className="min-w-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)] whitespace-normal break-words [overflow-wrap:anywhere]">
            {description}
          </span>
        ) : null}
        {children}
      </span>
      {meta ? (
        <span className="max-w-[42%] min-w-0 shrink-0 whitespace-normal break-words text-right text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-tertiary)] [overflow-wrap:anywhere]">
          {meta}
        </span>
      ) : null}
    </label>
  );
}
