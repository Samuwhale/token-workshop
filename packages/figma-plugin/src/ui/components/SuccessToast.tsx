import { useEffect } from 'react';

interface SuccessToastProps {
  message: string;
  onDismiss: () => void;
}

export function SuccessToast({ message, onDismiss }: SuccessToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="fixed bottom-4 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-figma-text)] text-[var(--color-figma-bg)] text-[11px] shadow-lg z-50">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-green-400">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span className="flex-1 truncate min-w-0">{message}</span>
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
