import { useState } from 'react';
import { adaptShortcut } from '../shared/utils';

interface EmptyStateProps {
  connected: boolean;
  serverUrl?: string;
  checking?: boolean;
  onConnect?: (url: string) => Promise<boolean>;
  onCreateToken: () => void;
  onPasteJSON: () => void;
  onImportFigma?: () => void;
  onUsePreset?: () => void;
  onGenerateColorScale?: () => void;
  onGoToGraph?: () => void;
  onGenerateSemanticTokens?: () => void;
  onGenerateDarkTheme?: () => void;
  onGuidedSetup?: () => void;
}

export function EmptyState({ connected, serverUrl, checking, onConnect, onCreateToken, onPasteJSON, onImportFigma, onUsePreset: _onUsePreset, onGenerateColorScale, onGoToGraph, onGenerateSemanticTokens, onGenerateDarkTheme, onGuidedSetup }: EmptyStateProps) {
  const [showMore, setShowMore] = useState(false);
  const [urlInput, setUrlInput] = useState(serverUrl ?? 'http://localhost:9400');
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<'ok' | 'fail' | null>(null);

  const hasMoreOptions = !!(onGenerateSemanticTokens || onGenerateDarkTheme);
  const disabledProps = (label: string) => ({
    disabled: !connected,
    title: connected ? undefined : `Server offline — ${label}`,
  });

  const handleConnect = async () => {
    if (!onConnect) return;
    setConnecting(true);
    setConnectResult(null);
    const ok = await onConnect(urlInput.trim());
    setConnectResult(ok ? 'ok' : 'fail');
    setConnecting(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-5 py-8 text-center gap-5 overflow-y-auto">
      {/* Icon + heading */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-[var(--color-figma-text)]">Welcome to TokenManager</p>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
            Create, manage, and publish design tokens. Choose how you'd like to get started.
          </p>
        </div>
      </div>

      {/* Inline connection setup — shown prominently when not connected */}
      {!connected && onConnect && (
        <div className="w-full max-w-[260px] flex flex-col gap-3 p-4 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
                <path d="M7 8h4M7 11h2" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-[11px] font-semibold text-[var(--color-figma-text)]">Connect to local server</p>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-tight">
                {checking ? 'Checking connection…' : 'Server not reachable'}
              </p>
            </div>
          </div>

          {/* URL input + connect */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-[var(--color-figma-text-tertiary)] text-left font-medium uppercase tracking-wide">Server URL</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setConnectResult(null); }}
                onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
                placeholder="http://localhost:9400"
                className="flex-1 min-w-0 px-2 py-1.5 text-[11px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)] outline-none"
              />
              <button
                onClick={handleConnect}
                disabled={connecting || checking || !urlInput.trim()}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {connecting || checking ? 'Connecting…' : 'Connect'}
              </button>
            </div>

            {/* Result feedback */}
            {connectResult === 'ok' && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-success)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                Connected successfully
              </div>
            )}
            {connectResult === 'fail' && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-error)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Cannot reach server — is it running?
              </div>
            )}
          </div>

          {/* How to start */}
          <div className="text-left border-t border-[var(--color-figma-border)] pt-2.5">
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug">
              Start the server in your terminal:
            </p>
            <code className="block mt-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] font-mono text-left select-all">
              npx @tokenmanager/server
            </code>
          </div>
        </div>
      )}

      {/* Fallback: minimal offline note when onConnect not provided */}
      {!connected && !onConnect && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] w-full max-w-[260px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-secondary)]">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
            Server offline — start the local server to use these actions
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-4 w-full max-w-[260px]">

        {/* Group: From Figma */}
        {onImportFigma && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">From Figma</p>
            <button
              onClick={onImportFigma}
              {...disabledProps('start the local server')}
              className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded bg-[var(--color-figma-accent)] text-white text-left disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-accent-hover)] transition-colors"
            >
              <div className="flex items-center gap-2 w-full">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h3v3H2zM7 3h3v3H7zM2 7h3v3H2z" />
                  <path d="M7 8.5V10M7 7v0" />
                </svg>
                <span className="flex-1 text-[11px] font-medium">Import from Figma Variables</span>
              </div>
              <p className="text-[10px] text-white/70 leading-snug pl-[20px]">
                Pull your existing variables and modes into token sets
              </p>
            </button>
          </div>
        )}

        {/* Group: From file */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">From file</p>
          <button
            onClick={onPasteJSON}
            {...disabledProps('start the local server')}
            className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
                <path d="M4 1.5v1.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V1.5" />
              </svg>
              <span className="text-[11px] font-medium">Paste existing tokens</span>
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
              Migrate from Tokens Studio, Style Dictionary, or DTCG JSON
            </p>
          </button>
        </div>

        {/* Group: From scratch */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">From scratch</p>

          {onGuidedSetup && (
            <button
              onClick={onGuidedSetup}
              {...disabledProps('start the local server')}
              className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded border-2 border-dashed border-[var(--color-figma-accent)]/40 text-left disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/5 transition-colors"
            >
              <div className="flex items-center gap-2 w-full">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="flex-1 text-[11px] font-medium text-[var(--color-figma-accent)]">Guided setup</span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)] font-normal">3 steps</span>
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                Generate primitives, map semantics, set up themes
              </p>
            </button>
          )}

          {onGoToGraph && (
            <button
              onClick={onGoToGraph}
              {...disabledProps('start the local server')}
              className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="2.5" cy="6" r="1.5" />
                  <path d="M4 6h4" />
                  <circle cx="9.5" cy="6" r="1.5" />
                  <circle cx="6" cy="2.5" r="1.5" />
                </svg>
                <span className="text-[11px] font-medium">Start from template</span>
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                Material colors, Tailwind spacing, modular type scales
              </p>
            </button>
          )}

          {onGenerateColorScale && (
            <button
              onClick={onGenerateColorScale}
              {...disabledProps('start the local server')}
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

          <button
            onClick={onCreateToken}
            {...disabledProps('start the local server to create tokens')}
            className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 1v10M1 6h10" />
            </svg>
            <span className="text-[11px] font-medium">Create a token manually</span>
            <span className="ml-auto text-[var(--color-figma-text-tertiary)] text-[10px] font-normal">{adaptShortcut('⌘N')}</span>
          </button>
        </div>

        {/* More options (advanced / less-common actions) */}
        {hasMoreOptions && (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setShowMore(v => !v)}
              className="flex items-center gap-1.5 text-left text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
            >
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                className={showMore ? 'rotate-90' : ''}
                style={{ transition: 'transform 0.15s' }}
              >
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
              {showMore ? 'Fewer options' : 'More options'}
            </button>

            {showMore && (
              <div className="flex flex-col gap-1.5 pl-3 border-l border-[var(--color-figma-border)]">
                {onGenerateSemanticTokens && (
                  <button
                    onClick={onGenerateSemanticTokens}
                    {...disabledProps('start the local server')}
                    className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 10V7l4-6 4 6v3H8V8H4v2H2z" />
                    </svg>
                    <span className="flex-1 text-left">Generate Semantic Tokens</span>
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">from primitives</span>
                  </button>
                )}
                {onGenerateDarkTheme && (
                  <button
                    onClick={onGenerateDarkTheme}
                    {...disabledProps('start the local server')}
                    className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 6.5A4.5 4.5 0 0 1 4.5 1a4.5 4.5 0 1 0 5.5 5.5z" />
                    </svg>
                    <span className="flex-1 text-left">Generate Dark Theme</span>
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">from primitives</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Workflow walkthrough */}
      <div className="w-full max-w-[260px] pt-1">
        <div className="w-full border-t border-[var(--color-figma-border)] mb-3" />
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left mb-2">How it works</p>
        <div className="flex items-start gap-0 w-full">
          <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3" />
              </svg>
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Tokens</p>
            <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Define values</p>
          </div>
          <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
          <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Themes</p>
            <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Map modes</p>
          </div>
          <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
          <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Publish</p>
            <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Export & sync</p>
          </div>
        </div>
      </div>
    </div>
  );
}
