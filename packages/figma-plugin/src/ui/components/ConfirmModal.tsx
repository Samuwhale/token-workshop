import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ConfirmModalProps {
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div className="px-4 pt-4 pb-3">
          <h3 id="confirm-modal-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">{title}</h3>
          {description && (
            <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              {description}
            </p>
          )}
          {children}
        </div>
        {error && (
          <p className="px-4 pb-2 text-[10px] text-[var(--color-figma-error)]">{error}</p>
        )}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={`flex-1 px-3 py-1.5 rounded text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              danger
                ? 'bg-[var(--color-figma-error)] text-white hover:opacity-90'
                : 'bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)]'
            }`}
          >
            {busy && (
              <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" aria-hidden="true" />
            )}
            {busy ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
