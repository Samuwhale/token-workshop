import type { ReactNode } from 'react';
import { Spinner } from './Spinner';

export type InlineBannerVariant = 'loading' | 'error' | 'warning' | 'info' | 'success';
export type InlineBannerLayout = 'inline' | 'strip';
export type InlineBannerSize = 'sm' | 'md';
export type InlineBannerDismissMode = 'icon' | 'text';

export interface InlineBannerAction {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

interface InlineBannerProps {
  variant: InlineBannerVariant;
  children: ReactNode;
  layout?: InlineBannerLayout;
  size?: InlineBannerSize;
  icon?: ReactNode | null;
  action?: InlineBannerAction;
  onDismiss?: () => void;
  dismissLabel?: string;
  dismissMode?: InlineBannerDismissMode;
  dismissClassName?: string;
  className?: string;
}

type BannerTone = {
  root: string;
  icon: string;
  action: string;
};

const LAYOUT_STYLES: Record<InlineBannerLayout, Record<InlineBannerSize, string>> = {
  inline: {
    sm: 'py-1.5 text-secondary',
    md: 'py-2 text-body',
  },
  strip: {
    sm: 'shrink-0 border-b px-3 py-1.5 text-secondary',
    md: 'shrink-0 border-b px-3 py-1.5 text-body',
  },
};

const TONE_STYLES: Record<InlineBannerVariant, BannerTone> = {
  loading: {
    root: 'border-transparent text-[color:var(--color-figma-text-secondary)]',
    icon: 'text-[color:var(--color-figma-text-accent)]',
    action: 'bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/20',
  },
  error: {
    root: 'border-transparent text-[color:var(--color-figma-text-error)]',
    icon: 'text-[color:var(--color-figma-text-error)]',
    action: 'bg-[var(--color-figma-error)]/10 text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/20',
  },
  warning: {
    root: 'border-transparent text-[color:var(--color-figma-text-secondary)]',
    icon: 'text-[color:var(--color-figma-text-warning)]',
    action: 'bg-[var(--color-figma-warning)]/15 text-[color:var(--color-figma-text-warning)] hover:bg-[var(--color-figma-warning)]/25',
  },
  info: {
    root: 'border-transparent text-[color:var(--color-figma-text-secondary)]',
    icon: 'text-[color:var(--color-figma-text-accent)]',
    action: 'bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/20',
  },
  success: {
    root: 'border-transparent text-[color:var(--color-figma-text-success)]',
    icon: 'text-[color:var(--color-figma-text-success)]',
    action: 'bg-[var(--color-figma-success)]/12 text-[color:var(--color-figma-text-success)] hover:bg-[var(--color-figma-success)]/20',
  },
};

function joinClasses(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function bannerIcon(variant: InlineBannerVariant): ReactNode {
  switch (variant) {
    case 'loading':
      return <Spinner size="sm" />;
    case 'error':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      );
    case 'warning':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'success':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 12v4" />
          <path d="M12 8h.01" />
        </svg>
      );
  }
}

function DismissIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function InlineBanner({
  variant,
  children,
  layout = 'inline',
  size = 'sm',
  icon,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
  dismissMode = layout === 'strip' ? 'text' : 'icon',
  dismissClassName,
  className,
}: InlineBannerProps) {
  const tone = TONE_STYLES[variant];
  const iconNode = icon === undefined ? bannerIcon(variant) : icon;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={joinClasses(
        'flex items-start gap-2',
        LAYOUT_STYLES[layout][size],
        tone.root,
        className,
      )}
    >
      {iconNode !== null ? (
        <div className={joinClasses('mt-px shrink-0', tone.icon)}>
          {iconNode}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.title}
          className={joinClasses(
            'shrink-0 rounded px-2 py-1 text-secondary font-medium transition-colors disabled:opacity-50',
            tone.action,
            action.className,
          )}
        >
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className={joinClasses(
            'shrink-0 rounded px-2 py-1 text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]',
            dismissClassName,
          )}
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          {dismissMode === 'text' ? dismissLabel : <DismissIcon />}
        </button>
      ) : null}
    </div>
  );
}
