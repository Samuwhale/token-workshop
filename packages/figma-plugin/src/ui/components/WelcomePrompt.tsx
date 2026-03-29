interface WelcomePromptProps {
  connected: boolean;
  onStartSetup: () => void;
  onDismiss: () => void;
}

export function WelcomePrompt({ connected, onStartSetup, onDismiss }: WelcomePromptProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded-lg shadow-lg w-[280px] p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[13px] font-semibold text-[var(--color-figma-text)]">
            Welcome to Token Manager
          </h2>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
            Get started quickly with a guided setup that walks you through
            creating primitives, mapping semantics, and setting up themes.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onStartSetup}
            disabled={!connected}
            title={connected ? undefined : 'Server offline — start the local server first'}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start guided setup
          </button>
          <button
            onClick={onDismiss}
            className="w-full px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            I'll explore on my own
          </button>
        </div>

        {!connected && (
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug">
            Guided setup requires a running server. You can start it later from the command palette.
          </p>
        )}
      </div>
    </div>
  );
}
