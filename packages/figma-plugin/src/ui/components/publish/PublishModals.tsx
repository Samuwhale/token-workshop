import { useState, useEffect, useMemo } from 'react';
import { ConfirmModal } from '../ConfirmModal';
import { isHexColor, DiffSwatch, truncateValue, SyncDiffSummary, TokenChangeRow } from './PublishShared';
import { getErrorMessage } from '../../shared/utils';
import type { PreviewRow } from './PublishShared';

export type { PreviewRow };

/* ── SyncPreviewModal ───────────────────────────────────────────────────── */

export function SyncPreviewModal({
  title,
  rows,
  dirs,
  onClose,
  onConfirm,
  confirmLabel,
}: {
  title: string;
  rows: PreviewRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const pushAdds = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'local-only');
  const pushUpdates = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'conflict');
  const pullAdds = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'figma-only');
  const pullUpdates = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'conflict');
  const deletesFromFigma = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'local-only');
  const deletesFromLocal = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'figma-only');
  const skipped = rows.filter(r => dirs[r.path] === 'skip');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const sections: { label: string; badge: string; rows: PreviewRow[]; color: string }[] = [
    { label: 'Add to Figma', badge: '+', rows: pushAdds, color: 'var(--color-figma-success)' },
    { label: 'Update in Figma', badge: '~', rows: pushUpdates, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Remove from Figma', badge: '-', rows: deletesFromLocal, color: 'var(--color-figma-error)' },
    { label: 'Add to local', badge: '+', rows: pullAdds, color: 'var(--color-figma-success)' },
    { label: 'Update in local', badge: '~', rows: pullUpdates, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Remove from local', badge: '-', rows: deletesFromFigma, color: 'var(--color-figma-error)' },
    { label: 'Skipped', badge: '·', rows: skipped, color: 'var(--color-figma-text-tertiary)' },
  ].filter(s => s.rows.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="preview-modal-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">{title}</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {onConfirm ? 'Review changes before applying.' : 'Dry run \u2014 no changes will be written.'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {sections.length === 0 ? (
            <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">Nothing to sync — all items skipped.</p>
          ) : (
            sections.map(section => (
              <div key={section.label} className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[10px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded"
                    style={{ color: section.color }}
                  >
                    {section.badge}
                  </span>
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    {section.label} ({section.rows.length})
                  </span>
                </div>
                <div className="ml-5 space-y-0">
                  {section.rows.map(r => {
                    const valStr = (v: string | undefined) => v ?? '';
                    const isColor = r.localType === 'color' || r.figmaType === 'color';
                    const isPush = section.label.includes('Figma');
                    const beforeVal = isPush ? r.figmaValue : r.localValue;
                    const afterVal = isPush ? r.localValue : r.figmaValue;
                    return (
                      <div key={r.path} className="py-1 border-b border-[var(--color-figma-border)] last:border-b-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={r.path}>{r.path}</span>
                        </div>
                        {r.cat === 'conflict' && (
                          <div className="ml-2 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                              {isColor && isHexColor(beforeVal) && <DiffSwatch hex={beforeVal} />}
                              <span className="text-[var(--color-figma-text-secondary)] truncate" title={valStr(beforeVal)}>{truncateValue(valStr(beforeVal), 40)}</span>
                            </div>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                              {isColor && isHexColor(afterVal) && <DiffSwatch hex={afterVal} />}
                              <span className="text-[var(--color-figma-text)] truncate" title={valStr(afterVal)}>{truncateValue(valStr(afterVal), 40)}</span>
                            </div>
                          </div>
                        )}
                        {r.cat === 'local-only' && r.localValue !== undefined && (
                          <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                            {isColor && isHexColor(r.localValue) && <DiffSwatch hex={r.localValue} />}
                            <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.localValue}>{truncateValue(r.localValue, 40)}</span>
                          </div>
                        )}
                        {r.cat === 'figma-only' && r.figmaValue !== undefined && (
                          <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                            {isColor && isHexColor(r.figmaValue) && <DiffSwatch hex={r.figmaValue} />}
                            <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.figmaValue}>{truncateValue(r.figmaValue, 40)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        {confirmError && (
          <p className="px-4 pb-2 text-[10px] text-[var(--color-figma-error)] break-words">{confirmError}</p>
        )}
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          {onConfirm ? (
            <>
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  setConfirmError(null);
                  try { await onConfirm(); } catch (err) { setConfirmError(getErrorMessage(err)); } finally { setBusy(false); }
                }}
                disabled={busy || sections.length === 0}
                className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {busy && <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" aria-hidden="true" />}
                {busy ? 'Applying\u2026' : (confirmLabel ?? 'Apply')}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── GitPreviewModal ────────────────────────────────────────────────────── */

export function GitPreviewModal({
  title,
  subtitle,
  confirmLabel,
  preview,
  loading,
  fetchPreview,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  confirmLabel: string;
  preview: import('../../hooks/useGitDiff').GitPreview | null;
  loading: boolean;
  fetchPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    fetchPreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Safe: mount-only fetch. `fetchPreview` is a prop that may be recreated by the parent on every
  // render; adding it to deps would re-fetch on every parent re-render instead of just once.
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const added = preview?.changes.filter(c => c.status === 'added') ?? [];
  const modified = preview?.changes.filter(c => c.status === 'modified') ?? [];
  const removed = preview?.changes.filter(c => c.status === 'removed') ?? [];

  const sections: { label: string; badge: string; items: typeof added; color: string }[] = [
    { label: 'Added', badge: '+', items: added, color: 'var(--color-figma-success)' },
    { label: 'Modified', badge: '~', items: modified, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Removed', badge: '\u2212', items: removed, color: 'var(--color-figma-error)' },
  ].filter(s => s.items.length > 0);

  const handleConfirm = async () => {
    setBusy(true);
    setConfirmError(null);
    try { await onConfirm(); } catch (err) { setConfirmError(getErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">{title}</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">{subtitle}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {loading && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-figma-text-secondary)]/30 border-t-[var(--color-figma-text-secondary)] animate-spin" />
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Fetching preview…</span>
            </div>
          )}

          {!loading && preview && (
            <>
              {preview.commits.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
                    {preview.commits.length} commit{preview.commits.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-0.5">
                    {preview.commits.map(c => (
                      <div key={c.hash} className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] shrink-0">{c.hash.slice(0, 7)}</span>
                        <span className="text-[10px] text-[var(--color-figma-text)] truncate">{c.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sections.length === 0 && preview.commits.length === 0 ? (
                <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">No changes to {confirmLabel.toLowerCase()}.</p>
              ) : sections.length === 0 ? (
                <p className="py-2 text-[10px] text-[var(--color-figma-text-secondary)]">No token-level changes (non-token files only).</p>
              ) : (
                sections.map(section => (
                  <div key={section.label} className="mb-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded" style={{ color: section.color }}>
                        {section.badge}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                        {section.label} ({section.items.length})
                      </span>
                    </div>
                    <div className="ml-5 space-y-0">
                      {section.items.map(change => {
                        const isColor = change.type === 'color';
                        const beforeStr = change.before != null ? (typeof change.before === 'string' ? change.before : JSON.stringify(change.before)) : undefined;
                        const afterStr = change.after != null ? (typeof change.after === 'string' ? change.after : JSON.stringify(change.after)) : undefined;
                        return (
                          <div key={`${change.set}.${change.path}`} className="py-1 border-b border-[var(--color-figma-border)] last:border-b-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={`${change.set} / ${change.path}`}>
                                {change.path}
                              </span>
                              <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">{change.set}</span>
                            </div>
                            {change.status === 'modified' && (
                              <div className="ml-2 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                                  {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
                                  <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeStr}>{truncateValue(beforeStr ?? '', 40)}</span>
                                </div>
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                                  {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
                                  <span className="text-[var(--color-figma-text)] truncate" title={afterStr}>{truncateValue(afterStr ?? '', 40)}</span>
                                </div>
                              </div>
                            )}
                            {change.status === 'added' && afterStr !== undefined && (
                              <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                                {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
                                <span className="text-[var(--color-figma-text-secondary)] truncate" title={afterStr}>{truncateValue(afterStr, 40)}</span>
                              </div>
                            )}
                            {change.status === 'removed' && beforeStr !== undefined && (
                              <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                                {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
                                <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeStr}>{truncateValue(beforeStr, 40)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {confirmError && (
          <p className="px-4 pb-2 text-[10px] text-[var(--color-figma-error)] break-words">{confirmError}</p>
        )}
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" aria-hidden="true" />}
            {busy ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── CommitPreviewModal ─────────────────────────────────────────────────── */

export function CommitPreviewModal({
  selectedFiles,
  allChanges,
  commitMsg,
  tokenPreview,
  tokenPreviewLoading,
  fetchTokenPreview,
  onCancel,
  onConfirm,
}: {
  selectedFiles: string[];
  allChanges: { file: string; status: string }[];
  commitMsg: string;
  tokenPreview: import('../../hooks/useGitDiff').TokenChange[] | null;
  tokenPreviewLoading: boolean;
  fetchTokenPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (tokenPreview === null && !tokenPreviewLoading) {
      fetchTokenPreview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Safe: mount-only conditional fetch. `tokenPreview`, `tokenPreviewLoading`, and
  // `fetchTokenPreview` are intentionally omitted — adding them would re-run the effect
  // every time loading state changes and create a feedback loop.
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const selectedSet = new Set(selectedFiles);
  const stagedChanges = allChanges.filter(c => selectedSet.has(c.file));
  const skippedCount = allChanges.length - stagedChanges.length;

  const relevantTokenChanges = useMemo(() => {
    if (!tokenPreview) return [];
    const selectedSetNames = new Set(selectedFiles.map(f => f.replace('.tokens.json', '')));
    return tokenPreview.filter(c => selectedSetNames.has(c.set));
  }, [tokenPreview, selectedFiles]);

  const changesByFile = useMemo(() => {
    const map = new Map<string, import('../../hooks/useGitDiff').TokenChange[]>();
    for (const tc of relevantTokenChanges) {
      const fileName = tc.set + '.tokens.json';
      const arr = map.get(fileName);
      if (arr) arr.push(tc);
      else map.set(fileName, [tc]);
    }
    return map;
  }, [relevantTokenChanges]);

  const totalAdded = relevantTokenChanges.filter(c => c.status === 'added').length;
  const totalModified = relevantTokenChanges.filter(c => c.status === 'modified').length;
  const totalRemoved = relevantTokenChanges.filter(c => c.status === 'removed').length;

  const toggleExpand = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    setConfirmError(null);
    try { await onConfirm(); } catch (err) { setConfirmError(getErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Commit changes</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review what will be committed before proceeding.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="mb-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
            <div className="text-[10px] text-[var(--color-figma-text-tertiary)] mb-0.5">Message</div>
            <div className="text-[11px] text-[var(--color-figma-text)] font-medium">{commitMsg}</div>
          </div>

          <div className="mb-2">
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1 flex items-center justify-between">
              <span>
                {stagedChanges.length} file{stagedChanges.length !== 1 ? 's' : ''} to commit
                {skippedCount > 0 && <span className="text-[var(--color-figma-text-tertiary)]"> ({skippedCount} skipped)</span>}
              </span>
              {!tokenPreviewLoading && relevantTokenChanges.length > 0 && (
                <span className="flex gap-1.5 text-[9px] font-mono">
                  {totalAdded > 0 && <span className="text-[var(--color-figma-success)]">+{totalAdded}</span>}
                  {totalModified > 0 && <span className="text-[var(--color-figma-warning)]">~{totalModified}</span>}
                  {totalRemoved > 0 && <span className="text-[var(--color-figma-error)]">&minus;{totalRemoved}</span>}
                </span>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {tokenPreviewLoading && (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-figma-text-secondary)]/30 border-t-[var(--color-figma-text-secondary)] animate-spin" />
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Loading token changes\u2026</span>
                </div>
              )}
              {stagedChanges.map((change, i) => {
                const fileTokenChanges = changesByFile.get(change.file) ?? [];
                const hasTokenChanges = fileTokenChanges.length > 0;
                const isExpanded = expandedFiles.has(change.file);
                const addedCount = fileTokenChanges.filter(c => c.status === 'added').length;
                const modifiedCount = fileTokenChanges.filter(c => c.status === 'modified').length;
                const removedCount = fileTokenChanges.filter(c => c.status === 'removed').length;

                return (
                  <div key={i}>
                    <div
                      className={`flex items-center gap-1.5 px-2 py-1 ${hasTokenChanges ? 'cursor-pointer hover:bg-[var(--color-figma-bg-hover)]' : ''}`}
                      onClick={() => hasTokenChanges && toggleExpand(change.file)}
                    >
                      <span className={`w-3 h-3 flex items-center justify-center shrink-0 ${hasTokenChanges ? '' : 'opacity-0'}`}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${isExpanded ? 'rotate-90' : ''} text-[var(--color-figma-text-tertiary)]`}>
                          <path d="M2 1l4 3-4 3V1z" />
                        </svg>
                      </span>
                      <span className={`text-[10px] font-mono font-bold w-3 shrink-0 ${
                        change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                        change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                        change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                        'text-[var(--color-figma-text-secondary)]'
                      }`}>
                        {change.status}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1 min-w-0">{change.file}</span>
                      {hasTokenChanges && (
                        <span className="flex gap-1.5 text-[9px] font-mono shrink-0">
                          {addedCount > 0 && <span className="text-[var(--color-figma-success)]">+{addedCount}</span>}
                          {modifiedCount > 0 && <span className="text-[var(--color-figma-warning)]">~{modifiedCount}</span>}
                          {removedCount > 0 && <span className="text-[var(--color-figma-error)]">&minus;{removedCount}</span>}
                        </span>
                      )}
                    </div>
                    {isExpanded && hasTokenChanges && (
                      <div className="bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                        {fileTokenChanges.map((tc, j) => (
                          <TokenChangeRow key={j} change={tc} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!tokenPreviewLoading && tokenPreview !== null && relevantTokenChanges.length === 0 && stagedChanges.some(c => c.file.endsWith('.tokens.json')) && (
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-1 flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              No token value changes detected (formatting or metadata only).
            </div>
          )}
        </div>

        {confirmError && (
          <p className="px-4 pb-2 text-[10px] text-[var(--color-figma-error)] break-words">{confirmError}</p>
        )}
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" aria-hidden="true" />}
            {busy ? 'Committing\u2026' : `Commit ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── PublishAllPreviewModal ─────────────────────────────────────────────── */

export function PublishAllPreviewModal({
  hasVarChanges,
  hasStyleChanges,
  hasGitDiffChanges,
  varRows,
  varDirs,
  varPushCount,
  varPullCount,
  styleRows,
  styleDirs,
  stylePushCount,
  stylePullCount,
  gitDiffChoices,
  mergeConflictCount,
  onCancel,
  onConfirm,
}: {
  hasVarChanges: boolean;
  hasStyleChanges: boolean;
  hasGitDiffChanges: boolean;
  varRows: PreviewRow[];
  varDirs: Record<string, 'push' | 'pull' | 'skip'>;
  varPushCount: number;
  varPullCount: number;
  styleRows: PreviewRow[];
  styleDirs: Record<string, 'push' | 'pull' | 'skip'>;
  stylePushCount: number;
  stylePullCount: number;
  gitDiffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  mergeConflictCount: number;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const gitPushCount = Object.values(gitDiffChoices).filter(c => c === 'push').length;
  const gitPullCount = Object.values(gitDiffChoices).filter(c => c === 'pull').length;

  const handleConfirm = async () => {
    setBusy(true);
    setConfirmError(null);
    try { await onConfirm(); } catch (err) { setConfirmError(getErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[400px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Publish all changes</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review all changes across variables, styles, and git before applying.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col gap-3">
          {mergeConflictCount > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5 text-[var(--color-figma-error)]">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </svg>
              <div className="text-[10px] text-[var(--color-figma-error)]">
                <span className="font-medium">{mergeConflictCount} merge conflict{mergeConflictCount !== 1 ? 's' : ''}</span> must be resolved before publishing. Open the Git tab to resolve conflicts.
              </div>
            </div>
          )}

          {hasVarChanges && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Variables</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    varPushCount > 0 ? `\u2191 ${varPushCount} to Figma` : null,
                    varPullCount > 0 ? `\u2193 ${varPullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </div>
              <SyncDiffSummary rows={varRows} dirs={varDirs} />
            </div>
          )}

          {hasStyleChanges && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Styles</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    stylePushCount > 0 ? `\u2191 ${stylePushCount} to Figma` : null,
                    stylePullCount > 0 ? `\u2193 ${stylePullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </div>
              <SyncDiffSummary rows={styleRows} dirs={styleDirs} />
            </div>
          )}

          {hasGitDiffChanges && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Git</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    gitPushCount > 0 ? `\u2191 ${gitPushCount} file${gitPushCount !== 1 ? 's' : ''} pushed` : null,
                    gitPullCount > 0 ? `\u2193 ${gitPullCount} file${gitPullCount !== 1 ? 's' : ''} pulled` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </div>
            </div>
          )}
        </div>

        {confirmError && (
          <p className="px-4 pb-2 text-[10px] text-[var(--color-figma-error)] break-words">{confirmError}</p>
        )}
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || mergeConflictCount > 0}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" aria-hidden="true" />}
            {busy ? 'Publishing\u2026' : mergeConflictCount > 0 ? 'Resolve conflicts first' : 'Publish all'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ApplyDiffConfirmModal ──────────────────────────────────────────────── */

export function ApplyDiffConfirmModal({
  diffChoices,
  onCancel,
  onConfirm,
}: {
  diffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const pushCount = Object.values(diffChoices).filter(c => c === 'push').length;
  const pullCount = Object.values(diffChoices).filter(c => c === 'pull').length;

  return (
    <ConfirmModal
      title="Apply file diff?"
      confirmLabel="Apply"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
        {[
          pushCount > 0 ? `\u2191 ${pushCount} file${pushCount !== 1 ? 's' : ''} pushed to remote` : null,
          pullCount > 0 ? `\u2193 ${pullCount} file${pullCount !== 1 ? 's' : ''} pulled to local` : null,
        ].filter(Boolean).join(', ')}
        . This will overwrite the target files.
      </p>
    </ConfirmModal>
  );
}
