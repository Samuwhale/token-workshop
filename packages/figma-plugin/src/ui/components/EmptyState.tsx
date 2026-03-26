
interface EmptyStateProps {
  connected: boolean;
  onCreateToken: () => void;
  onPasteJSON: () => void;
  onUsePreset?: () => void;
  onGenerateColorScale?: () => void;
  onGoToGraph?: () => void;
  onGenerateSemanticTokens?: () => void;
  onGenerateDarkTheme?: () => void;
}

export function EmptyState({ connected, onCreateToken, onPasteJSON, onUsePreset, onGenerateColorScale, onGoToGraph, onGenerateSemanticTokens, onGenerateDarkTheme }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-5 py-8 text-center gap-6">
      {/* Icon + heading */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-[var(--color-figma-text)]">No tokens yet</p>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[200px]">
            Start by creating your first token or importing an existing set.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 w-full max-w-[220px]">
        {/* Primary action */}
        <button
          onClick={onCreateToken}
          disabled={!connected}
          title={connected ? undefined : 'Server offline — start the local server to create tokens'}
          className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded bg-[var(--color-figma-accent)] text-white text-left disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-accent-hover)] transition-colors"
        >
          <div className="flex items-center gap-2 w-full">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
            <span className="flex-1 text-[11px] font-medium">Create first token</span>
            <span className="text-white/60 text-[10px] font-normal">⌘N</span>
          </div>
          <p className="text-[10px] text-white/70 leading-snug pl-[20px]">
            Define a color, spacing, or any design value
          </p>
        </button>

        {/* Secondary actions */}
        <div className="flex flex-col gap-1.5 pt-1">
          <p className="text-[9px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">Or start with</p>

          {onGenerateColorScale && (
            <button
              onClick={onGenerateColorScale}
              disabled={!connected}
              title={connected ? undefined : 'Server offline'}
              className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="4.5" />
                  <path d="M3.5 6a2.5 2.5 0 0 1 5 0" />
                </svg>
                <span className="text-[11px] font-medium">Generate color scale</span>
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                Build a 10-step palette from one base color
              </p>
            </button>
          )}

          {onGoToGraph && (
            <button
              onClick={onGoToGraph}
              disabled={!connected}
              title={connected ? undefined : 'Server offline'}
              className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="2.5" cy="6" r="1.5" />
                  <path d="M4 6h4" />
                  <circle cx="9.5" cy="6" r="1.5" />
                  <circle cx="6" cy="2.5" r="1.5" />
                </svg>
                <span className="text-[11px] font-medium">Use a graph template</span>
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                Apply a pre-built token pipeline (color, spacing, type)
              </p>
            </button>
          )}

          {onUsePreset && (
            <button
              onClick={onUsePreset}
              disabled={!connected}
              title={connected ? undefined : 'Server offline'}
              className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="1" y="1" width="4" height="4" rx="0.5" />
                  <rect x="7" y="1" width="4" height="4" rx="0.5" />
                  <rect x="1" y="7" width="4" height="4" rx="0.5" />
                  <rect x="7" y="7" width="4" height="4" rx="0.5" />
                </svg>
                <span className="text-[11px] font-medium">Use a preset</span>
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                Start from a professionally designed token set
              </p>
            </button>
          )}

          <button
            onClick={onPasteJSON}
            disabled={!connected}
            title={connected ? undefined : 'Server offline'}
            className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
                <path d="M4 1.5v1.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V1.5" />
              </svg>
              <span className="text-[11px] font-medium">Paste tokens from JSON</span>
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
              Import from Tokens Studio or Style Dictionary
            </p>
          </button>
        </div>

        {/* Deep actions (only shown when handlers provided) */}
        {(onGenerateSemanticTokens || onGenerateDarkTheme) && (
          <>
            <div className="w-full border-t border-[var(--color-figma-border)] my-1" />
            <p className="text-[9px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium self-start">From primitives</p>
            {onGenerateSemanticTokens && (
              <button
                onClick={onGenerateSemanticTokens}
                disabled={!connected}
                title={connected ? undefined : 'Server offline'}
                className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10V7l4-6 4 6v3H8V8H4v2H2z" />
                </svg>
                <span className="flex-1 text-left">Generate Semantic Tokens</span>
              </button>
            )}
            {onGenerateDarkTheme && (
              <button
                onClick={onGenerateDarkTheme}
                disabled={!connected}
                title={connected ? undefined : 'Server offline'}
                className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 6.5A4.5 4.5 0 0 1 4.5 1a4.5 4.5 0 1 0 5.5 5.5z" />
                </svg>
                <span className="flex-1 text-left">Generate Dark Theme</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
