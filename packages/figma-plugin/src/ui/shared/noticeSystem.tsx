/**
 * Shared notice severity model and UI primitives.
 *
 * Centralizes the severity names, Tailwind class mappings, and notice
 * components so workspace panels stop hand-rolling amber/red variants.
 */

// ---------------------------------------------------------------------------
// Severity model
// ---------------------------------------------------------------------------

export type NoticeSeverity = 'info' | 'success' | 'warning' | 'stale' | 'error';

/** Tailwind classes for each severity, tuned for the Figma plugin palette. */
const SEVERITY_STYLES: Record<NoticeSeverity, {
  /** Pill: translucent background + foreground text */
  pill: string;
  /** Banner: border, background, and text */
  banner: string;
  /** Inline field message text color */
  fieldText: string;
  /** Input border override (error/warning states) */
  fieldBorder: string;
  /** Icon color inside banners */
  icon: string;
}> = {
  info: {
    pill: 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]',
    banner: 'border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/5 text-[var(--color-figma-text)]',
    fieldText: 'text-[var(--color-figma-text-tertiary)]',
    fieldBorder: '',
    icon: 'text-[var(--color-figma-accent)]',
  },
  success: {
    pill: 'bg-green-500/10 text-green-600 dark:text-green-400',
    banner: 'border-green-500/20 bg-green-500/5 text-[var(--color-figma-text)]',
    fieldText: 'text-green-600 dark:text-green-400',
    fieldBorder: '',
    icon: 'text-green-500',
  },
  warning: {
    pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    banner: 'border-amber-500/20 bg-amber-500/5 text-[var(--color-figma-text)]',
    fieldText: 'text-amber-500',
    fieldBorder: 'border-amber-400 focus-visible:border-amber-400',
    icon: 'text-amber-500',
  },
  stale: {
    pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    banner: 'border-amber-400/20 bg-amber-400/5 text-[var(--color-figma-text)]',
    fieldText: 'text-amber-500',
    fieldBorder: '',
    icon: 'text-amber-400',
  },
  error: {
    pill: 'bg-red-500/10 text-red-600 dark:text-red-400',
    banner: 'border-red-500/20 bg-red-500/5 text-[var(--color-figma-text)]',
    fieldText: 'text-[var(--color-figma-error)]',
    fieldBorder: 'border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]',
    icon: 'text-red-500',
  },
};

/** Look up the full style record for a severity. */
export function severityStyles(severity: NoticeSeverity) {
  return SEVERITY_STYLES[severity];
}

// ---------------------------------------------------------------------------
// Icons (10×10 matching existing codebase convention)
// ---------------------------------------------------------------------------

function SeverityIcon({ severity, size = 10 }: { severity: NoticeSeverity; size?: number }) {
  const cls = `shrink-0 ${SEVERITY_STYLES[severity].icon}`;
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const, className: cls };

  switch (severity) {
    case 'info':
      return <svg {...shared}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
    case 'success':
      return <svg {...shared}><path d="M20 6L9 17l-5-5" /></svg>;
    case 'warning':
      return <svg {...shared}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case 'stale':
      return <svg {...shared}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
    case 'error':
      return <svg {...shared}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>;
  }
}

// ---------------------------------------------------------------------------
// NoticePill — small inline status pill
// ---------------------------------------------------------------------------

interface NoticePillProps {
  severity: NoticeSeverity;
  children: React.ReactNode;
  className?: string;
}

/** Small inline pill with severity-appropriate colors. */
export function NoticePill({ severity, children, className }: NoticePillProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${SEVERITY_STYLES[severity].pill}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// NoticeBanner — surface-level banner
// ---------------------------------------------------------------------------

interface NoticeBannerProps {
  severity: NoticeSeverity;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** Surface-level banner with severity icon and optional action button. */
export function NoticeBanner({ severity, children, action, className }: NoticeBannerProps) {
  return (
    <div
      role={severity === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`flex items-center gap-1.5 px-3 py-2 rounded border text-[10px] ${SEVERITY_STYLES[severity].banner}${className ? ` ${className}` : ''}`}
    >
      <SeverityIcon severity={severity} />
      <span className="flex-1 min-w-0">{children}</span>
      {action && (
        <button
          onClick={action.onClick}
          className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border border-current/20 hover:bg-current/5 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoticeFieldMessage — inline field-level validation message
// ---------------------------------------------------------------------------

interface NoticeFieldMessageProps {
  severity: NoticeSeverity;
  children: React.ReactNode;
}

/**
 * Inline field-level validation message. Renders a small text line below a
 * form field with severity-appropriate color.
 *
 * For error severity the element uses `role="alert"` so screen readers
 * announce it immediately.
 */
export function NoticeFieldMessage({ severity, children }: NoticeFieldMessageProps) {
  return (
    <p
      role={severity === 'error' ? 'alert' : undefined}
      className={`mt-0.5 text-[10px] leading-tight ${SEVERITY_STYLES[severity].fieldText}`}
    >
      {children}
    </p>
  );
}
