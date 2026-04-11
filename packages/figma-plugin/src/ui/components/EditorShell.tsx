import type { HTMLAttributes, ReactNode, Ref } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface EditorShellProps {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  afterHeader?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  titleClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
  bodyProps?: HTMLAttributes<HTMLDivElement>;
  onBack?: () => void;
  backAriaLabel?: string;
  backTitle?: string;
}

export function EditorShell({
  title,
  children,
  footer,
  headerActions,
  afterHeader,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
  titleClassName,
  bodyRef,
  bodyProps,
  onBack,
  backAriaLabel = "Back",
  backTitle,
}: EditorShellProps) {
  const { className: bodyPropsClassName, ...restBodyProps } = bodyProps ?? {};

  return (
    <div className={joinClasses("flex h-full min-h-0 flex-col", className)}>
      <div
        className={joinClasses(
          "flex items-center gap-2 border-b border-[var(--color-figma-border)] shrink-0",
          headerClassName,
        )}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backAriaLabel}
            title={backTitle}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className={joinClasses("min-w-0 flex-1", titleClassName)}>{title}</div>
        {headerActions && (
          <div className="flex items-center gap-1 shrink-0">{headerActions}</div>
        )}
      </div>
      {afterHeader}
      <div
        ref={bodyRef}
        className={joinClasses(
          "min-h-0 flex-1 overflow-y-auto",
          bodyClassName,
          bodyPropsClassName,
        )}
        {...restBodyProps}
      >
        {children}
      </div>
      {footer && (
        <div
          className={joinClasses(
            "shrink-0 border-t border-[var(--color-figma-border)]",
            footerClassName,
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
