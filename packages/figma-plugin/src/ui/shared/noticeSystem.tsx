import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Severity                                                          */
/* ------------------------------------------------------------------ */

export type NoticeSeverity =
  | 'error'
  | 'warning'
  | 'stale'
  | 'info'
  | 'success';

/* ------------------------------------------------------------------ */
/*  Tone class helpers                                                */
/* ------------------------------------------------------------------ */

const BANNER_TONE: Record<NoticeSeverity, string> = {
  error:   'text-[color:var(--color-figma-text-error)]',
  warning: 'text-[color:var(--color-figma-text-warning)]',
  stale:   'text-[color:var(--color-figma-text-warning)]',
  info:    'text-[color:var(--color-figma-text-secondary)]',
  success: 'text-[color:var(--color-figma-text-success)]',
};

const PILL_TONE: Record<NoticeSeverity, string> = {
  error:   'text-[color:var(--color-figma-text-error)]',
  warning: 'text-[color:var(--color-figma-text-warning)]',
  stale:   'text-[color:var(--color-figma-text-warning)]',
  info:    'text-[color:var(--color-figma-text-secondary)]',
  success: 'text-[color:var(--color-figma-text-success)]',
};

const FIELD_TONE: Record<NoticeSeverity, string> = {
  error:   'text-[color:var(--color-figma-text-error)]',
  warning: 'text-[color:var(--color-figma-text-warning)]',
  stale:   'text-[color:var(--color-figma-text-warning)]',
  info:    'text-[color:var(--color-figma-text-tertiary)]',
  success: 'text-[color:var(--color-figma-text-success)]',
};

const FIELD_BORDER_TONE: Record<NoticeSeverity, string> = {
  error: 'border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]',
  warning: 'border-[var(--color-figma-warning)] focus-visible:border-[var(--color-figma-warning)]',
  stale: 'border-[var(--color-figma-warning)] focus-visible:border-[var(--color-figma-warning)]',
  info: 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]',
  success: 'border-[var(--color-figma-success)] focus-visible:border-[var(--color-figma-success)]',
};

const ICON_TONE: Record<NoticeSeverity, string> = {
  error: 'text-[color:var(--color-figma-text-error)]',
  warning: 'text-[color:var(--color-figma-text-warning)]',
  stale: 'text-[color:var(--color-figma-text-warning)]',
  info: 'text-[color:var(--color-figma-text-secondary)]',
  success: 'text-[color:var(--color-figma-text-success)]',
};

export function severityStyles(severity: NoticeSeverity) {
  return {
    banner: BANNER_TONE[severity],
    pill: PILL_TONE[severity],
    field: FIELD_TONE[severity],
    fieldBorder: FIELD_BORDER_TONE[severity],
    icon: ICON_TONE[severity],
  };
}

/* ------------------------------------------------------------------ */
/*  Shared warning icon                                               */
/* ------------------------------------------------------------------ */

function WarningIcon({ size = 10, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'shrink-0'}
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ErrorIcon({ size = 10, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'shrink-0 mt-px'}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function DismissIcon({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function severityIcon(severity: NoticeSeverity, size?: number) {
  if (severity === 'error') return <ErrorIcon size={size} />;
  if (severity === 'warning' || severity === 'stale') {
    return <WarningIcon size={size} />;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  NoticeBanner — panel-level strip with optional actions & dismiss   */
/* ------------------------------------------------------------------ */

export interface NoticeBannerProps {
  severity: NoticeSeverity;
  children: ReactNode;
  /** Optional action buttons rendered after the message */
  actions?: ReactNode;
  /** When provided, a dismiss button is rendered */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Additional CSS classes on the root element */
  className?: string;
}

export function NoticeBanner({
  severity,
  children,
  actions,
  onDismiss,
  dismissLabel = 'Dismiss',
  className,
}: NoticeBannerProps) {
  return (
    <div
      role={severity === 'error' ? 'alert' : 'status'}
      aria-live={severity === 'error' ? undefined : 'polite'}
      className={`flex items-center gap-2 py-1.5 text-body shrink-0 ${BANNER_TONE[severity]}${className ? ` ${className}` : ''}`}
    >
      {severityIcon(severity)}
      <span className="flex-1 min-w-0 break-words">{children}</span>
      {actions}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 px-2 py-1 rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] transition-colors"
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          {dismissLabel}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NoticePill — small inline indicator                               */
/* ------------------------------------------------------------------ */

export interface NoticePillProps {
  severity: NoticeSeverity;
  children: ReactNode;
  title?: string;
  icon?: ReactNode;
  className?: string;
}

export function NoticePill({ severity, children, title, icon, className }: NoticePillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-secondary font-medium ${PILL_TONE[severity]}${className ? ` ${className}` : ''}`}
      title={title}
    >
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  NoticeCountBadge — minimal round count indicator                  */
/* ------------------------------------------------------------------ */

export interface NoticeCountBadgeProps {
  severity: NoticeSeverity;
  count: number;
  title?: string;
  className?: string;
}

export function NoticeCountBadge({ severity, count, title, className }: NoticeCountBadgeProps) {
  const tone = severity === 'error'
    ? 'bg-[var(--color-figma-error)]/15 text-[color:var(--color-figma-text-error)]'
    : severity === 'warning'
    ? 'bg-[var(--color-figma-warning)]/20 text-[color:var(--color-figma-text-warning)]'
    : severity === 'stale'
    ? 'bg-[var(--color-figma-warning)]/15 text-[color:var(--color-figma-text-warning)]'
    : severity === 'info'
    ? 'bg-[var(--color-figma-text-tertiary)]/20 text-[color:var(--color-figma-text-tertiary)]'
    : 'bg-[var(--color-figma-success)]/20 text-[color:var(--color-figma-text-success)]';

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-secondary font-bold leading-none ${tone}${className ? ` ${className}` : ''}`}
      title={title}
    >
      {count}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  NoticeFieldMessage — field-level validation text                   */
/* ------------------------------------------------------------------ */

export interface NoticeFieldMessageProps {
  severity: NoticeSeverity;
  children: ReactNode;
  className?: string;
}

export function NoticeFieldMessage({ severity, children, className }: NoticeFieldMessageProps) {
  return (
    <p
      role={severity === 'error' ? 'alert' : undefined}
      className={`mt-0.5 text-secondary leading-tight ${FIELD_TONE[severity]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  NoticeInlineAlert — dismissible inline alert box                  */
/* ------------------------------------------------------------------ */

export interface NoticeInlineAlertProps {
  severity: NoticeSeverity;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function NoticeInlineAlert({ severity, children, onDismiss, className }: NoticeInlineAlertProps) {
  const tone = severity === 'error'
    ? 'border-transparent'
    : severity === 'warning'
    ? 'border-transparent'
    : 'border-transparent';

  const textTone = severity === 'error'
    ? 'text-[color:var(--color-figma-text-error)]'
    : severity === 'warning'
    ? 'text-[color:var(--color-figma-text-warning)]'
    : 'text-[color:var(--color-figma-text-secondary)]';

  return (
    <div
      role={severity === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-1.5 py-1.5 ${tone}${className ? ` ${className}` : ''}`}
    >
      {severityIcon(severity)}
      <span className={`text-secondary flex-1 leading-snug ${textTone}`}>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`p-0.5 rounded ${textTone} hover:bg-${severity === 'error' ? '[var(--color-figma-error)]' : '[var(--color-figma-warning)]'}/20 transition-colors shrink-0`}
          title="Dismiss"
          aria-label="Dismiss error"
        >
          <DismissIcon />
        </button>
      )}
    </div>
  );
}
