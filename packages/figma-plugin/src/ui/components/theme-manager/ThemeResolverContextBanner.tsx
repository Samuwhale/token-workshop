import type { ThemeResolverAuthoringContext } from "./themeResolverContext";

interface ThemeResolverContextBannerProps {
  context: ThemeResolverAuthoringContext;
  actionLabel?: string;
  onAction?: () => void;
}

function formatCountLabel(count: number, label: string) {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

export function ThemeResolverContextBanner({
  context,
  actionLabel,
  onAction,
}: ThemeResolverContextBannerProps) {
  const hasIssues = context.issueCount > 0;
  const connectionLabel = hasIssues
    ? `${context.matchedAxisCount}/${context.axes.length} connected`
    : 'All connected';
  const issueLabel =
    context.issueAxisCount > 0
      ? `${formatCountLabel(context.issueAxisCount, 'axis')} need attention`
      : null;
  const modifierLabel =
    context.unmatchedModifierCount > 0
      ? `${formatCountLabel(context.unmatchedModifierCount, 'extra modifier')}`
      : null;

  return (
    <div className="flex min-w-0 items-start gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
      <span
        className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${hasIssues ? "bg-amber-500" : "bg-[var(--color-figma-success,#18a058)]"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-medium text-[var(--color-figma-text)]">
          {context.resolverName}
        </div>
        {context.resolverDescription && (
          <div className="mt-0.5 truncate text-[9px] text-[var(--color-figma-text-secondary)]">
            {context.resolverDescription}
          </div>
        )}
        <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
          {[
            context.autoSelected ? 'Auto-selected' : 'Pinned selection',
            connectionLabel,
            issueLabel,
            modifierLabel,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
