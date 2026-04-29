import { getErrorMessage } from '../shared/utils';
import { Spinner } from './Spinner';
import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { ReactNode } from 'react';
import { Button } from '../primitives/Button';

interface ConfirmModalProps {
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  wide?: boolean;
  confirmDisabled?: boolean;
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
  wide = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const canCancel = !busy;
  useFocusTrap(dialogRef);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleConfirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      if (mountedRef.current) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canCancel) onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canCancel, onCancel]);

  return (
    <div
      className="tm-modal-shell"
      onMouseDown={(e) => {
        if (canCancel && e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={`tm-modal-panel ${wide ? 'tm-modal-panel--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-busy={busy}
      >
        <div className="tm-modal-header">
          <h3 id="confirm-modal-title" className="text-heading font-semibold text-[color:var(--color-figma-text)]">{title}</h3>
          {description && (
            <p className="text-body leading-relaxed text-[color:var(--color-figma-text-secondary)] break-words">
              {description}
            </p>
          )}
        </div>
        <div className="tm-modal-body">
          {children}
        {error && (
            <p role="alert" className="pb-3 text-secondary text-[color:var(--color-figma-text-error)] break-words">{error}</p>
        )}
        </div>
        <div className="tm-modal-footer">
          <Button
            onClick={onCancel}
            disabled={!canCancel}
            variant="secondary"
            className="w-full bg-[var(--color-figma-bg-secondary)]"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy || confirmDisabled}
            variant={danger ? 'danger' : 'primary'}
            className="w-full"
          >
            {busy && (
              <Spinner size="sm" className="text-white" />
            )}
            {busy ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
