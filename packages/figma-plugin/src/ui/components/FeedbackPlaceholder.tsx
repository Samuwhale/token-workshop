import type { ReactNode } from 'react';

export type FeedbackPlaceholderVariant = 'empty' | 'no-results' | 'error' | 'disconnected';
export type FeedbackPlaceholderSize = 'full' | 'section';

type FeedbackPlaceholderActionTone = 'primary' | 'secondary';

export interface FeedbackPlaceholderAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: FeedbackPlaceholderActionTone;
  type?: 'button' | 'submit';
}

interface FeedbackPlaceholderProps {
  variant: FeedbackPlaceholderVariant;
  size?: FeedbackPlaceholderSize;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  primaryAction?: FeedbackPlaceholderAction;
  secondaryAction?: FeedbackPlaceholderAction;
  children?: ReactNode;
  className?: string;
}

const SIZE_STYLES: Record<FeedbackPlaceholderSize, {
  container: string;
  content: string;
  iconWrap: string;
  title: string;
  description: string;
}> = {
  full: {
    container: 'flex h-full min-h-[220px] w-full flex-1 flex-col items-center justify-center px-6 py-8 text-center',
    content: 'w-full max-w-[320px] space-y-4',
    iconWrap: 'h-10 w-10 rounded-xl',
    title: 'text-[12px] font-semibold',
    description: 'text-[11px] leading-relaxed',
  },
  section: {
    container: 'flex w-full flex-col items-center justify-center px-4 py-5 text-center',
    content: 'w-full max-w-[280px] space-y-3',
    iconWrap: 'h-8 w-8 rounded-lg',
    title: 'text-[10px] font-medium',
    description: 'text-[10px] leading-relaxed',
  },
};

const VARIANT_STYLES: Record<FeedbackPlaceholderVariant, { iconWrap: string }> = {
  empty: {
    iconWrap: 'border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]',
  },
  'no-results': {
    iconWrap: 'border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]',
  },
  error: {
    iconWrap: 'border border-[var(--color-figma-error)]/20 bg-[var(--color-figma-error)]/[0.08] text-[var(--color-figma-error)]',
  },
  disconnected: {
    iconWrap: 'border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]',
  },
};

function joinClasses(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function defaultIcon(variant: FeedbackPlaceholderVariant): ReactNode {
  switch (variant) {
    case 'no-results':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case 'error':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      );
    case 'disconnected':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8.5 8.5a5 5 0 0 1 7 0" />
          <path d="M5.2 5.2a9.5 9.5 0 0 1 13.4 0" />
          <path d="M2 12.2a14 14 0 0 1 5.4-4.3" />
          <path d="M22 12.2a14 14 0 0 0-5.4-4.3" />
          <path d="M12 18h.01" />
          <path d="M3 3l18 18" />
        </svg>
      );
    case 'empty':
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
      );
  }
}

function actionButtonClass(tone: FeedbackPlaceholderActionTone): string {
  if (tone === 'primary') {
    return 'bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed';
  }
  return 'border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed';
}

function FeedbackActionButton({
  action,
  defaultTone,
}: {
  action: FeedbackPlaceholderAction;
  defaultTone: FeedbackPlaceholderActionTone;
}) {
  const tone = action.tone ?? defaultTone;
  return (
    <button
      type={action.type ?? 'button'}
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
      className={joinClasses(
        'rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors',
        actionButtonClass(tone),
      )}
    >
      {action.label}
    </button>
  );
}

export function FeedbackPlaceholder({
  variant,
  size = 'full',
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  children,
  className,
}: FeedbackPlaceholderProps) {
  const sizeStyles = SIZE_STYLES[size];
  const variantStyles = VARIANT_STYLES[variant];
  const iconNode = icon === undefined ? defaultIcon(variant) : icon;

  return (
    <div className={joinClasses(sizeStyles.container, className)}>
      <div className={sizeStyles.content}>
        <div className="flex flex-col items-center gap-3">
          {iconNode !== null ? (
            <div className={joinClasses('mx-auto flex items-center justify-center', sizeStyles.iconWrap, variantStyles.iconWrap)}>
              {iconNode}
            </div>
          ) : null}
          <div className="space-y-1">
            <div className={joinClasses(sizeStyles.title, 'text-[var(--color-figma-text)]')}>{title}</div>
            {description ? (
              <div className={joinClasses(sizeStyles.description, 'text-[var(--color-figma-text-secondary)]')}>
                {description}
              </div>
            ) : null}
          </div>
        </div>

        {children ? <div>{children}</div> : null}

        {(primaryAction || secondaryAction) ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {secondaryAction ? <FeedbackActionButton action={secondaryAction} defaultTone="secondary" /> : null}
            {primaryAction ? <FeedbackActionButton action={primaryAction} defaultTone="primary" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
