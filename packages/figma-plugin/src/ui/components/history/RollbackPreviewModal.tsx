import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { summarizeChanges, ChangeSummaryBadges } from '../../shared/changeHelpers';
import { ChangesBySetList } from './ChangesBySetList';
import { Spinner } from '../Spinner';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { isAbortError } from '../../shared/utils';
import type { SnapshotDiff, TokenChange } from './types';
import { snapshotDiffToChange } from './types';

interface RollbackPreviewModalProps {
  serverUrl: string;
  opId: string;
  opDescription: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

interface MetadataDiff {
  field: 'description' | 'collectionName' | 'modeName';
  label: 'Description' | 'Collection' | 'Mode';
  before?: string;
  after?: string;
}

function formatMetadataValue(value?: string) {
  return value && value.length > 0 ? value : 'cleared';
}

/**
 * Shows a diff of what tokens will change if the operation is rolled back,
 * then asks for explicit confirmation before executing.
 */
export function RollbackPreviewModal({
  serverUrl,
  opId,
  opDescription,
  onConfirm,
  onCancel,
}: RollbackPreviewModalProps) {
  const [changes, setChanges] = useState<TokenChange[] | null>(null);
  const [metadataChanges, setMetadataChanges] = useState<MetadataDiff[]>([]);
  const [diffLoading, setDiffLoading] = useState(true);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  useFocusTrap(dialogRef);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ diffs: SnapshotDiff[]; metadataChanges?: MetadataDiff[] }>(
      `${serverUrl}/api/operations/${opId}/diff`,
      { signal: controller.signal },
    )
      .then(data => {
        if (controller.signal.aborted) return;
        const unified = (data.diffs ?? []).map(snapshotDiffToChange);
        setChanges(unified);
        setMetadataChanges(data.metadataChanges ?? []);
        const sections: Record<string, boolean> = {};
        for (const c of unified) sections[c.set] = true;
        setOpenSections(sections);
      })
      .catch(err => {
        if (isAbortError(err)) return;
        console.warn('[RollbackPreviewModal] failed to load diff:', err);
        setDiffError('Could not load change preview');
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiffLoading(false);
      });
    return () => controller.abort();
  }, [serverUrl, opId]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleConfirm = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      await onConfirm();
    } catch (err) {
      if (mountedRef.current) {
        setConfirmError((err as Error).message || 'Rollback failed');
        setConfirming(false);
      }
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const summary = changes ? summarizeChanges(changes) : null;
  const noChanges = changes?.length === 0 && metadataChanges.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        className="w-[340px] max-h-[80vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rollback-preview-title"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 shrink-0 border-b border-[var(--color-figma-border)]">
          <h3 id="rollback-preview-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            Preview rollback
          </h3>
          <p className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed truncate" title={opDescription}>
            {opDescription}
          </p>
        </div>

        {/* Summary bar */}
        {!diffLoading && summary && !noChanges && (
          <div className="px-4 py-2 shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center gap-2">
            <ChangeSummaryBadges {...summary} />
            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
              {metadataChanges.length > 0
                ? `and ${metadataChanges.length} metadata field${metadataChanges.length !== 1 ? 's' : ''} will change`
                : 'will change'}
            </span>
          </div>
        )}
        {!diffLoading && !summary && metadataChanges.length > 0 && (
          <div className="px-4 py-2 shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
              {metadataChanges.length} metadata field{metadataChanges.length !== 1 ? 's' : ''} will change
            </span>
          </div>
        )}

        {/* Diff content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">
          {diffLoading && (
            <div className="flex items-center justify-center h-20 gap-2">
              <Spinner size="sm" />
              <span className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading preview…</span>
            </div>
          )}

          {!diffLoading && diffError && (
            <div className="flex flex-col items-center justify-center h-20 gap-1 px-3 text-center">
              <p className="text-[11px] text-[var(--color-figma-error)]">{diffError}</p>
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">You can still roll back — the operation will restore tokens to their prior state.</p>
            </div>
          )}

          {!diffLoading && noChanges && (
            <div className="flex flex-col items-center justify-center h-20 gap-2 px-3 text-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)]" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No token changes detected.</p>
            </div>
          )}

          {!diffLoading && metadataChanges.length > 0 && (
            <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <div className="px-3 py-2 border-b border-[var(--color-figma-border)]">
                <p className="text-[10px] font-medium text-[var(--color-figma-text)]">Metadata changes</p>
              </div>
              <div className="p-2 space-y-1">
                {metadataChanges.map((change) => (
                  <div
                    key={change.field}
                    className="flex flex-wrap items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]"
                  >
                    <span className="font-medium text-[var(--color-figma-text)]">{change.label}</span>
                    <span>{formatMetadataValue(change.before)}</span>
                    <span aria-hidden="true">→</span>
                    <span>{formatMetadataValue(change.after)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!diffLoading && changes && changes.length > 0 && (
            <ChangesBySetList
              changes={changes}
              openSections={openSections}
              onToggleSection={toggleSection}
            />
          )}
        </div>

        {/* Error */}
        {confirmError && (
          <p className="shrink-0 px-4 py-2 text-[10px] text-[var(--color-figma-error)] break-words">
            {confirmError}
          </p>
        )}

        {/* Actions */}
        <div className="px-4 pb-4 pt-3 shrink-0 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming || diffLoading}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-error)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {confirming && <Spinner size="sm" className="text-white" />}
            {confirming ? 'Rolling back…' : 'Roll Back'}
          </button>
        </div>
      </div>
    </div>
  );
}
