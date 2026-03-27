import { useEffect } from 'react';

interface SuccessToastProps {
  message: string;
  onDismiss: () => void;
  variant?: 'success' | 'error';
  /** Override the auto-dismiss timeout in ms. Defaults to 3000. Pass 0 to disable. */
  timeout?: number;
}

export function SuccessToast({ message, onDismiss, variant = 'success', timeout = 3000 }: SuccessToastProps) {
  useEffect(() => {
    if (timeout === 0) return;
    const timer = setTimeout(onDismiss, timeout);
    return () => clearTimeout(timer);
  }, [message, onDismiss, timeout]);

  const iconEl = variant === 'error' ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-red-400">
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-green-400">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-figma-text)] text-[var(--color-figma-bg)] text-[11px] shadow-lg z-50">
      {iconEl}
      <span className="flex-1 min-w-0 break-words line-clamp-3">{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 1l6 6M7 1L1 7" />
        </svg>
      </button>
    </div>
  );
}
