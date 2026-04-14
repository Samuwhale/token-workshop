import { FeedbackPlaceholder } from './FeedbackPlaceholder';

interface EmptyStateProps {
  connected: boolean;
  onOpenStartHere: () => void;
}

export function EmptyState({ connected, onOpenStartHere }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto px-3 py-3 text-center">
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
        title="No tokens yet"
        description="Start with guided setup, templates, or import."
        primaryAction={{ label: 'Get started', onClick: onOpenStartHere }}
      />

      {!connected && (
        <FeedbackPlaceholder
          variant="disconnected"
          size="section"
          className="w-full max-w-[270px]"
          title="Server offline"
          description="Use guided setup to reconnect."
        />
      )}
    </div>
  );
}
