import type { HTMLAttributes, ReactNode, Ref } from "react";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const AUTHORING_SURFACE_CLASSES = {
  bodyStack: "tm-authoring-body-stack",
  footer: "tm-authoring-footer",
  footerActions: "tm-authoring-footer__actions",
  footerMeta: "tm-authoring-footer__meta",
  footerIcon: "tm-authoring-footer__icon",
  footerPrimary: "tm-authoring-footer__primary",
  footerSecondary: "tm-authoring-footer__secondary",
  splitLayout: "tm-authoring-split-layout",
  splitConfig: "tm-authoring-split-layout__config",
  splitPreview: "tm-authoring-split-layout__preview",
} as const;

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
  surface?: "default" | "authoring";
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
  surface = "default",
}: EditorShellProps) {
  const { className: bodyPropsClassName, ...restBodyProps } = bodyProps ?? {};
  const isAuthoringSurface = surface === "authoring";

  return (
    <div
      className={joinClasses(
        "flex h-full min-h-0 flex-col overflow-hidden",
        isAuthoringSurface && "tm-authoring-surface",
        className,
      )}
    >
      <div
        className={joinClasses(
          "flex min-w-0 flex-wrap items-start gap-2 border-b border-[var(--color-figma-border)] shrink-0",
          isAuthoringSurface && "tm-authoring-surface__header",
          headerClassName,
        )}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backAriaLabel}
            title={backTitle}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--color-figma-bg-hover)] focus-visible:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0"
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
        <div
          className={joinClasses(
            "min-w-0 flex-1",
            isAuthoringSurface && "tm-authoring-surface__title",
            titleClassName,
          )}
        >
          {title}
        </div>
        {headerActions && (
          <div className="flex min-w-0 flex-wrap items-center gap-1 shrink-0">{headerActions}</div>
        )}
      </div>
      {afterHeader}
      <div
        ref={bodyRef}
        className={joinClasses(
          "min-h-0 flex-1 overflow-y-auto",
          isAuthoringSurface && "tm-authoring-surface__body",
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
            isAuthoringSurface && "tm-authoring-surface__footer",
            footerClassName,
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
