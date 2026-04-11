import { FeedbackPlaceholder } from './FeedbackPlaceholder';

interface EmptyStateProps {
  connected: boolean;
  onOpenStartHere: () => void;
}

export function EmptyState({ connected, onOpenStartHere }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-8 text-center">
      <FeedbackPlaceholder
        variant="empty"
        size="section"
        className="w-full max-w-[270px]"
        icon={(
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
        )}
        title="Build your token system"
        description="Start with one clear decision. Import an existing system, generate a foundation from templates, or build it manually."
        primaryAction={{ label: 'Start here', onClick: onOpenStartHere }}
      />

      {!connected && (
        <FeedbackPlaceholder
          variant="disconnected"
          size="section"
          className="w-full max-w-[270px]"
          title="Server offline"
          description="Import, generator, and other server-backed flows will ask you to reconnect only when you open them."
        />
      )}

      <div className="w-full max-w-[270px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-left">
        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">What you’ll choose next</p>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
          Import an existing system, start from a template, or begin manually. Manual creation stays tucked behind the manual branch so the larger setup paths stay clear.
        </p>
      </div>
    </div>
  );
}
