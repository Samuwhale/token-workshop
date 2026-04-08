interface EmptyStateProps {
  connected: boolean;
  onOpenStartHere: () => void;
}

export function EmptyState({ connected, onOpenStartHere }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-[var(--color-figma-text)]">Build your token system</p>
          <p className="max-w-[250px] text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
            Start with one clear decision. Import an existing system, generate a foundation from templates, or build it manually.
          </p>
        </div>
      </div>

      {!connected && (
        <div className="flex w-full max-w-[270px] items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-secondary)]" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            The server is offline. Import, generator, and other server-backed flows will ask you to reconnect only when you open them.
          </p>
        </div>
      )}

      <div className="flex w-full max-w-[270px] flex-col gap-3">
        <button
          onClick={onOpenStartHere}
          className="rounded-lg bg-[var(--color-figma-accent)] px-3 py-2.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Start here
        </button>
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-left">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">What you’ll choose next</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
            Import an existing system, start from a template, or begin manually. Manual creation stays tucked behind the manual branch so the larger setup paths stay clear.
          </p>
        </div>
      </div>
    </div>
  );
}
