import type { ReactNode } from 'react';
import { Button } from '../primitives';

export type FeedbackPlaceholderVariant = 'empty' | 'no-results' | 'error' | 'disconnected';
export type FeedbackPlaceholderSize = 'full' | 'section';
export type FeedbackPlaceholderAlign = 'center' | 'start';

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
  align?: FeedbackPlaceholderAlign;
}

const SIZE_STYLES: Record<FeedbackPlaceholderSize, {
  container: string;
  content: string;
  title: string;
  description: string;
}> = {
  full: {
    container: 'tm-feedback-placeholder tm-feedback-placeholder--full flex h-full w-full flex-1 flex-col px-3 py-2',
    content: 'tm-feedback-placeholder__content flex w-full min-w-0 flex-col gap-1.5',
    title: 'text-body font-medium',
    description: 'text-body leading-[var(--leading-body)]',
  },
  section: {
    container: 'tm-feedback-placeholder tm-feedback-placeholder--section flex w-full flex-col px-2 py-1.5',
    content: 'tm-feedback-placeholder__content flex w-full min-w-0 flex-col gap-1.5',
    title: 'text-secondary font-medium',
    description: 'text-body leading-[var(--leading-body)]',
  },
};

function joinClasses(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function FeedbackActionButton({
  action,
  defaultTone,
  align,
}: {
  action: FeedbackPlaceholderAction;
  defaultTone: FeedbackPlaceholderActionTone;
  align: FeedbackPlaceholderAlign;
}) {
  const tone = action.tone ?? defaultTone;
  return (
    <Button
      type={action.type ?? 'button'}
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
      variant={tone === 'primary' ? 'primary' : 'secondary'}
      size="sm"
      className={joinClasses(
        align === 'start' ? 'justify-start' : '',
        tone === 'secondary' ? 'bg-[var(--color-figma-bg-secondary)]' : '',
      )}
    >
      {action.label}
    </Button>
  );
}

export function FeedbackPlaceholder({
  size = 'full',
  title,
  description,
  icon,
  actions,
  primaryAction,
  secondaryAction,
  children,
  className,
  align = 'center',
}: FeedbackPlaceholderProps) {
  const sizeStyles = SIZE_STYLES[size];
  const iconNode = icon ?? null;
  const resolvedActions = actions ?? [
    primaryAction,
    secondaryAction,
  ].filter((action): action is FeedbackPlaceholderAction => action !== undefined);

  return (
    <div
      className={joinClasses(
        sizeStyles.container,
        align === 'center'
          ? 'items-center justify-center text-center'
          : 'items-start justify-start text-left',
        className,
      )}
    >
      <div
        className={joinClasses(
          sizeStyles.content,
          align === 'center'
            ? 'items-center'
            : size === 'full'
              ? 'tm-feedback-placeholder__content--start items-start'
              : 'items-start',
        )}
      >
        {iconNode !== null ? (
          <div>
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
          <div
            className={joinClasses(
              'tm-feedback-placeholder__actions flex flex-wrap items-center gap-2',
              align === 'center' ? 'justify-center' : 'justify-start',
            )}
          >
            {resolvedActions.map((action, index) => (
              <FeedbackActionButton
                key={`${action.label}-${index}`}
                action={action}
                defaultTone={
                  action.tone ??
                  (index === 0 ? 'primary' : 'secondary')
                }
                align={align}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
