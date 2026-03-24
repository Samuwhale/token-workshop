import React from 'react';

interface EmptyStateProps {
  connected: boolean;
  onCreateToken: () => void;
  onPasteJSON: () => void;
}

export function EmptyState({ connected, onCreateToken, onPasteJSON }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 text-center gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-medium text-[var(--color-figma-text)]">No tokens yet</p>
        <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[220px]">
          A token set is a named collection of design tokens — colors, spacing, typography values, and more — stored as JSON.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <button
          onClick={onCreateToken}
          disabled={!connected}
          title={connected ? undefined : 'Server offline'}
          className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 1v10M1 6h10" />
          </svg>
          <span className="flex-1 text-left">Create first token</span>
          <span className="text-white/60 text-[10px] font-normal">⌘N</span>
        </button>

        <button
          disabled
          title="Coming soon"
          className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] opacity-40 cursor-not-allowed"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M3.5 6a2.5 2.5 0 0 1 5 0" />
          </svg>
          <span className="flex-1 text-left">Generate color scale</span>
        </button>

        <button
          onClick={onPasteJSON}
          disabled={!connected}
          title={connected ? undefined : 'Server offline'}
          className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
            <path d="M4 1.5v1.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V1.5" />
          </svg>
          <span className="flex-1 text-left">Paste tokens from JSON</span>
        </button>
      </div>
    </div>
  );
}
