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
  actions?: FeedbackPlaceholderAction[];
  primaryAction?: FeedbackPlaceholderAction;
  secondaryAction?: FeedbackPlaceholderAction;
  children?: ReactNode;
  className?: string;
}

const SIZE_STYLES: Record<FeedbackPlaceholderSize, {
  container: string;
  content: string;
  title: string;
  description: string;
}> = {
  full: {
    container: 'flex h-full w-full flex-1 flex-col items-center justify-center px-3 py-3 text-center',
    content: 'flex w-full max-w-[360px] min-w-0 flex-col items-center gap-2',
    title: 'text-body font-medium',
    description: 'text-body leading-[var(--leading-body)]',
  },
  section: {
    container: 'flex w-full flex-col items-center justify-center px-3 py-2 text-center',
    content: 'flex w-full max-w-[340px] min-w-0 flex-col items-center gap-1.5',
    title: 'text-secondary font-medium',
    description: 'text-body leading-[var(--leading-body)]',
  },
};

const VARIANT_ICON_COLOR: Record<FeedbackPlaceholderVariant, string> = {
  empty: 'text-[color:var(--color-figma-text-secondary)]',
  'no-results': 'text-[color:var(--color-figma-text-secondary)]',
  error: 'text-[color:var(--color-figma-text-error)]',
  disconnected: 'text-[color:var(--color-figma-text-secondary)]',
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
    return 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40';
  }
  return 'border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] disabled:opacity-40';
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
        'min-h-7 rounded-md px-2.5 py-1 text-secondary font-medium transition-colors',
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
  actions,
  primaryAction,
  secondaryAction,
  children,
  className,
}: FeedbackPlaceholderProps) {
  const sizeStyles = SIZE_STYLES[size];
  const iconColor = VARIANT_ICON_COLOR[variant];
  const iconNode = icon === undefined ? defaultIcon(variant) : icon;
  const resolvedActions = actions ?? [
    secondaryAction,
    primaryAction,
  ].filter((action): action is FeedbackPlaceholderAction => action !== undefined);

  return (
    <div className={joinClasses(sizeStyles.container, className)}>
      <div className={sizeStyles.content}>
        {iconNode !== null ? (
          <div className={iconColor}>
            {iconNode}
          </div>
        ) : null}
        <div className="min-w-0 break-words">
          <h3 className={joinClasses(sizeStyles.title, 'text-[color:var(--color-figma-text)]')}>{title}</h3>
          {description ? (
            <div className={joinClasses('mt-0.5', sizeStyles.description, 'text-[color:var(--color-figma-text-secondary)]')}>
              {description}
            </div>
          ) : null}
        </div>
        {children}
        {resolvedActions.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {resolvedActions.map((action, index) => (
              <FeedbackActionButton
                key={`${action.label}-${index}`}
                action={action}
                defaultTone={action.tone ?? (index === resolvedActions.length - 1 ? 'primary' : 'secondary')}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
