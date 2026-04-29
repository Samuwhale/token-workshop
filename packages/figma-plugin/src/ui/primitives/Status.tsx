import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./classes";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusBannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: StatusTone;
  title?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}

export interface StatusRowProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  tone?: StatusTone;
  label: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "text-[color:var(--color-figma-text-secondary)]",
  info: "text-[color:var(--color-figma-accent)]",
  success: "text-[color:var(--color-figma-success)]",
  warning: "text-[color:var(--color-figma-warning)]",
  danger: "text-[color:var(--color-figma-error)]",
};

function defaultIcon(tone: StatusTone) {
  const iconProps = { size: 14, strokeWidth: 1.75, "aria-hidden": true };
  if (tone === "success") return <CheckCircle2 {...iconProps} />;
  if (tone === "warning") return <TriangleAlert {...iconProps} />;
  if (tone === "danger") return <AlertCircle {...iconProps} />;
  return <Info {...iconProps} />;
}

export function StatusBanner({
  tone = "neutral",
  title,
  actions,
  icon,
  className,
  children,
  ...rest
}: StatusBannerProps) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      {...rest}
      className={cx(
        "flex min-w-0 items-start gap-2 py-1.5",
        className,
      )}
    >
      <span className={cx("mt-[1px] flex shrink-0 items-center", TONE_CLASS[tone])}>
        {icon ?? defaultIcon(tone)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? (
          <div className="text-body font-medium leading-[var(--leading-tight)] text-[color:var(--color-figma-text)]">
            {title}
          </div>
        ) : null}
        {children ? (
          <div className="text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
            {children}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function StatusRow({
  tone = "neutral",
  label,
  description,
  value,
  icon,
  trailing,
  disabled = false,
  onClick,
  className,
  ...rest
}: StatusRowProps) {
  const hasValue = value !== null && value !== undefined;
  const content = (
    <>
      <span className={cx("flex shrink-0 items-center", TONE_CLASS[tone])}>
        {icon ?? defaultIcon(tone)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium leading-[var(--leading-tight)] text-[color:var(--color-figma-text)] whitespace-normal break-words [overflow-wrap:anywhere]">
          {label}
        </span>
        {description ? (
          <span className="block text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)] whitespace-normal break-words [overflow-wrap:anywhere]">
            {description}
          </span>
        ) : null}
      </span>
      {hasValue ? (
        <span className={cx("min-w-0 truncate text-secondary tabular-nums", TONE_CLASS[tone])}>
          {value}
        </span>
      ) : null}
      {trailing ? <span className="ml-auto flex shrink-0 items-center">{trailing}</span> : null}
    </>
  );

  const rowClassName = cx(
    "flex min-w-0 items-start gap-2 py-1.5 text-left transition-colors",
    onClick && !disabled && "w-full rounded px-2 hover:bg-[var(--color-figma-bg-hover)]",
    onClick && disabled && "w-full cursor-default opacity-60",
    className,
  );

  if (onClick) {
    return (
      <button
        {...rest}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={rowClassName}
      >
        {content}
      </button>
    );
  }

  return (
    <div {...rest} className={rowClassName}>
      {content}
    </div>
  );
}
