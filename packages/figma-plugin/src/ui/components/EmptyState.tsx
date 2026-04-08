import { useState } from 'react';

interface EmptyStateProps {
  connected: boolean;
  serverUrl?: string;
  checking?: boolean;
  onConnect?: (url: string) => Promise<boolean>;
  onOpenStartHere: () => void;
}

export function EmptyState({ connected, serverUrl, checking, onConnect, onOpenStartHere }: EmptyStateProps) {
  const [urlInput, setUrlInput] = useState(serverUrl ?? 'http://localhost:9400');
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<'ok' | 'fail' | null>(null);

  const handleConnect = async () => {
    if (!onConnect) return;
    setConnecting(true);
    setConnectResult(null);
    const ok = await onConnect(urlInput.trim());
    setConnectResult(ok ? 'ok' : 'fail');
    setConnecting(false);
  };

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

      {!connected && onConnect && (
        <div className="flex w-full max-w-[270px] flex-col gap-3 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
                <path d="M7 8h4M7 11h2" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-[11px] font-semibold text-[var(--color-figma-text)]">Connect the local server</p>
              <p className="text-[10px] leading-tight text-[var(--color-figma-text-secondary)]">
                {checking ? 'Checking connection…' : 'Most start paths need the server'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-left text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">Server URL</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={urlInput}
                onChange={e => {
                  setUrlInput(e.target.value);
                  setConnectResult(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConnect();
                }}
                placeholder="http://localhost:9400"
                className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
              />
              <button
                onClick={handleConnect}
                disabled={connecting || checking || !urlInput.trim()}
                className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connecting || checking ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            {connectResult === 'ok' && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-success)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                Connected successfully
              </div>
            )}
            {connectResult === 'fail' && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-error)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                Cannot reach server — is it running?
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-figma-border)] pt-2.5 text-left">
            <p className="text-[10px] leading-snug text-[var(--color-figma-text-tertiary)]">
              Start the server in your terminal:
            </p>
            <code className="mt-1 block select-all rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-left font-mono text-[10px] text-[var(--color-figma-text-secondary)]">
              npx @tokenmanager/server
            </code>
          </div>
        </div>
      )}

      {!connected && !onConnect && (
        <div className="flex w-full max-w-[270px] items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-secondary)]" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            Start the local server to import, generate, or create token foundations.
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
