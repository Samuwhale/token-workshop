import { useState, useEffect, useMemo, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { dispatchToast } from '../shared/toastBus';
import { adaptShortcut, getErrorMessage, tokenPathToUrlSegment } from '../shared/utils';
import { parseInput, validateTokenPath, type ParsedToken } from '../shared/tokenParsers';
import { apiFetch } from '../shared/apiFetch';
import type { UndoSlot } from '../hooks/useUndo';
import type { TokenMapEntry } from '../../shared/types';
import { cloneValue } from '../../shared/clone';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidHex(v: unknown): v is string {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3,8})$/.test(v);
}

function ColorSwatch({ value }: { value: unknown }) {
  if (!isValidHex(value)) return null;
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
      style={{ background: value.slice(0, 7) }}
    />
  );
}

const FORMAT_LABELS: Record<string, string> = {
  dtcg: 'JSON / DTCG',
  lines: 'name: value',
  css: 'CSS custom properties',
  csv: 'CSV / TSV',
  tailwind: 'JS object',
};

const TYPE_COLORS: Record<string, string> = {
  color: 'bg-[var(--token-badge-color-bg)] text-[var(--token-badge-color-text)]',
  dimension: 'bg-[var(--token-badge-size-bg)] text-[var(--token-badge-size-text)]',
  size: 'bg-[var(--token-badge-size-bg)] text-[var(--token-badge-size-text)]',
  number: 'bg-[var(--token-badge-size-bg)] text-[var(--token-badge-size-text)]',
  typography: 'bg-[var(--token-badge-type-bg)] text-[var(--token-badge-type-text)]',
  fontFamily: 'bg-[var(--token-badge-type-bg)] text-[var(--token-badge-type-text)]',
  fontWeight: 'bg-[var(--token-badge-type-bg)] text-[var(--token-badge-type-text)]',
  fontSize: 'bg-[var(--token-badge-type-bg)] text-[var(--token-badge-type-text)]',
  lineHeight: 'bg-[var(--token-badge-type-bg)] text-[var(--token-badge-type-text)]',
  letterSpacing: 'bg-[var(--token-badge-type-bg)] text-[var(--token-badge-type-text)]',
  shadow: 'bg-[var(--token-badge-effect-bg)] text-[var(--token-badge-effect-text)]',
  opacity: 'bg-[var(--token-badge-effect-bg)] text-[var(--token-badge-effect-text)]',
  border: 'bg-[var(--token-badge-effect-bg)] text-[var(--token-badge-effect-text)]',
  duration: 'bg-[var(--token-badge-motion-bg)] text-[var(--token-badge-motion-text)]',
  cubicBezier: 'bg-[var(--token-badge-motion-bg)] text-[var(--token-badge-motion-text)]',
  transition: 'bg-[var(--token-badge-motion-bg)] text-[var(--token-badge-motion-text)]',
  string: 'bg-[var(--token-badge-other-bg)] text-[var(--token-badge-other-text)]',
};

interface RestorableTokenSnapshot {
  path: string;
  data: {
    $type: string;
    $value: unknown;
  };
}

function buildPasteSuccessMessage({
  currentCollectionId,
  importedCount,
  createdCount,
  updatedCount,
  skippedConflictCount,
  invalidCount,
  unsupportedCount,
}: {
  currentCollectionId: string;
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedConflictCount: number;
  invalidCount: number;
  unsupportedCount: number;
}): string {
  const actionParts: string[] = [];
  if (createdCount > 0) actionParts.push(`${createdCount} created`);
  if (updatedCount > 0) actionParts.push(`${updatedCount} overwritten`);

  const skippedParts: string[] = [];
  if (skippedConflictCount > 0) {
    skippedParts.push(`${skippedConflictCount} conflict${skippedConflictCount === 1 ? '' : 's'} left unchanged`);
  }
  if (invalidCount > 0) {
    skippedParts.push(`${invalidCount} invalid row${invalidCount === 1 ? '' : 's'} skipped`);
  }
  if (unsupportedCount > 0) {
    skippedParts.push(`${unsupportedCount} unsupported value${unsupportedCount === 1 ? '' : 's'} skipped`);
  }

  const importedLabel = `Pasted ${importedCount} token${importedCount === 1 ? '' : 's'} into "${currentCollectionId}"`;
  const actionLabel = actionParts.length > 0 ? ` — ${actionParts.join(', ')}` : '';
  const skippedLabel = skippedParts.length > 0 ? ` · ${skippedParts.join(', ')}` : '';
  return `${importedLabel}${actionLabel}${skippedLabel}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PasteTokenRow extends ParsedToken {
  conflict: boolean;
  overwrite: boolean;
  validationError: string | null;
}

interface PasteTokensModalProps {
  serverUrl: string;
  currentCollectionId: string;
  existingPaths: Set<string>;
  existingTokens: Record<string, TokenMapEntry>;
  onClose: () => void;
  onConfirm: () => void;
  pushUndo?: (slot: UndoSlot) => void;
}

export function PasteTokensModal({
  serverUrl,
  currentCollectionId,
  existingPaths,
  existingTokens,
  onClose,
  onConfirm,
  pushUndo,
}: PasteTokensModalProps) {
  const [input, setInput] = useState('');
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [rowOverwrites, setRowOverwrites] = useState<Record<string, boolean>>({});
  const [parsedSkippedExpanded, setParsedSkippedExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { initialFocusRef: textareaRef });

  const { tokens: parsedTokens, errors, format, skipped: parsedSkipped } = useMemo(() => parseInput(input), [input]);

  // Apply group prefix to paths
  const prefixedTokens = useMemo(() =>
    parsedTokens.map(t => ({
      ...t,
      path: prefix.trim() ? `${prefix.trim()}.${t.path}` : t.path,
    })),
    [parsedTokens, prefix]
  );

  const prefixError = useMemo(() => {
    const p = prefix.trim();
    if (!p) return null;
    return validateTokenPath(p);
  }, [prefix]);

  const rows: PasteTokenRow[] = useMemo(
    () =>
      prefixedTokens.map(t => ({
        ...t,
        conflict: existingPaths.has(t.path),
        overwrite: false,
        validationError: prefixError ?? validateTokenPath(t.path),
      })),
    [prefixedTokens, existingPaths, prefixError],
  );

  // Pre-populate from clipboard on mount so Cmd+C → Cmd+Shift+V works end-to-end
  useEffect(() => {
    navigator.clipboard.readText().then(text => {
      if (text.trim()) setInput(text.trim());
    }).catch((err) => { console.warn('[PasteTokensModal] clipboard read failed:', err); });
  }, []);

  useEffect(() => {
    setParsedSkippedExpanded(false);
  }, [input]);

  useEffect(() => {
    setRowOverwrites(prev => {
      const next: Record<string, boolean> = {};
      for (const row of rows) {
        if (row.conflict && !row.validationError && prev[row.path]) {
          next[row.path] = true;
        }
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      const changed =
        prevKeys.length !== nextKeys.length ||
        prevKeys.some(path => prev[path] !== next[path]);

      return changed ? next : prev;
    });
  }, [rows]);

  const effectiveRows = rows.map(r => ({
    ...r,
    overwrite: r.conflict ? (rowOverwrites[r.path] ?? false) : false,
  }));

  const validRows = effectiveRows.filter(r => !r.validationError);
  const invalidRows = effectiveRows.filter(r => r.validationError);
  const toCreate = validRows.filter(r => !r.conflict);
  const conflicts = validRows.filter(r => r.conflict);
  const toUpdate = conflicts.filter(r => r.overwrite);
  const skipped = conflicts.filter(r => !r.overwrite);
  const confirmCount = toCreate.length + toUpdate.length;
  const overwriteAll = conflicts.length > 0 && conflicts.every(row => rowOverwrites[row.path]);

  const handleOverwriteAll = (checked: boolean) => {
    setRowOverwrites(prev => {
      const next = { ...prev };
      for (const row of conflicts) {
        if (checked) next[row.path] = true;
        else delete next[row.path];
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (confirmCount === 0 || busy) return;
    setBusy(true);
    setSubmitError('');
    try {
      const tokenRows = [...toCreate, ...toUpdate];
      const overwrittenSnapshots: RestorableTokenSnapshot[] = toUpdate.flatMap(row => {
        const existingToken = existingTokens[row.path];
        if (!existingToken) return [];
        return [{
          path: row.path,
          data: {
            $type: existingToken.$type,
            $value: cloneValue(existingToken.$value),
          },
        }];
      });
      const createdPaths = toCreate.map(row => row.path);
      const tokens = tokenRows.map(row => ({
        path: row.path,
        $type: row.$type,
        $value: row.$value,
      }));
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, strategy: 'overwrite' }),
      });
      if (pushUndo && tokenRows.length > 0) {
        const capturedCollectionId = currentCollectionId;
        const capturedUrl = serverUrl;
        const capturedTokenRows = tokens.map(token => ({
          path: token.path,
          $type: token.$type,
          $value: cloneValue(token.$value),
        }));
        const capturedSnapshots = overwrittenSnapshots.map(snapshot => ({
          path: snapshot.path,
          data: {
            $type: snapshot.data.$type,
            $value: cloneValue(snapshot.data.$value),
          },
        }));
        const capturedCreatedPaths = [...createdPaths];
        const finalize = () => {
          onConfirm();
        };
        pushUndo({
          description: `Paste ${tokenRows.length} token${tokenRows.length !== 1 ? 's' : ''} to "${capturedCollectionId}"`,
          restore: async () => {
            await Promise.all(
              capturedSnapshots.map(({ path, data }) =>
                apiFetch(
                  `${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/${tokenPathToUrlSegment(path)}`,
                  {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                  },
                ),
              ),
            );
            if (capturedCreatedPaths.length > 0) {
              await apiFetch(
                `${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/batch-delete`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ paths: capturedCreatedPaths }),
                },
              );
            }
            finalize();
          },
          redo: async () => {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tokens: capturedTokenRows, strategy: 'overwrite' }),
            });
            finalize();
          },
        });
      }
      dispatchToast(buildPasteSuccessMessage({
        currentCollectionId,
        importedCount: confirmCount,
        createdCount: toCreate.length,
        updatedCount: toUpdate.length,
        skippedConflictCount: skipped.length,
        invalidCount: invalidRows.length,
        unsupportedCount: parsedSkipped.length,
      }), 'success');
      onConfirm();
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50" onKeyDown={handleKeyDown} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl flex flex-col"
        style={{ width: 420, maxHeight: '88vh' }}
        role="dialog"
        aria-modal="true"
        aria-label="Paste tokens"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-start justify-between gap-2">
          <div>
            <div className="text-heading font-semibold text-[var(--color-figma-text)]">Paste Tokens</div>
            <div className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5">
              into <span className="font-mono text-[var(--color-figma-text)]">{currentCollectionId}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Format hint — shows detected format */}
        <div className="px-4 pt-3 pb-0 flex items-center gap-1.5 flex-wrap">
          <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Format:</span>
          {(['dtcg', 'lines', 'css', 'csv', 'tailwind'] as const).map(f => (
            <span key={f} className={`text-secondary font-mono rounded px-1.5 py-0.5 transition-colors ${
              format === f
                ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-semibold'
                : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'
            }`}>{FORMAT_LABELS[f]}</span>
          ))}
        </div>

        <div className="p-3 flex flex-col gap-2">
          {/* Textarea with detected-format badge */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body font-mono focus-visible:border-[var(--color-figma-accent)] resize-none"
              rows={7}
              placeholder={'name: value   |  CSV / TSV   |  CSS vars\ncolors.red: #ff0000  name,type,value  --color-red: #f00\nspacing.sm: 8px      sm,dimension,8px  --spacing-sm: 8px\n\n— or DTCG JSON / Tailwind config objects —\n{ colors: { red: \'#ff0000\', blue: \'#0000ff\' } }'}
              value={input}
              onChange={e => { setInput(e.target.value); setSubmitError(''); }}
            />
            {format !== 'empty' && format !== 'error' && (
              <span className="absolute bottom-2 right-2 text-secondary font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)]/30 rounded px-1.5 py-0.5 pointer-events-none">
                {FORMAT_LABELS[format]}
              </span>
            )}
          </div>

          {/* Group prefix */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <label className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">
                Group prefix
              </label>
              <input
                type="text"
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary font-mono focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/50"
                placeholder="e.g. brand.colors (optional)"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
              />
            </div>
            {prefix.trim() && prefixError && (
              <div className="text-secondary text-[var(--color-figma-error)] pl-1">{prefixError}</div>
            )}
            {prefix.trim() && !prefixError && prefixedTokens.length > 0 && (
              <div className="text-secondary text-[var(--color-figma-text-secondary)] font-mono truncate pl-1">
                → <span className="text-[var(--color-figma-text)]">{prefixedTokens[0].path}</span>
                {prefixedTokens.length > 1 && <span> …</span>}
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="flex flex-col gap-0.5 px-2 py-1.5 bg-[var(--color-figma-error)]/5 rounded border border-[var(--color-figma-error)]/20">
              {errors.map((err, i) => (
                <div key={i} className="text-secondary text-[var(--color-figma-error)]">{err}</div>
              ))}
            </div>
          )}

          {/* Parse-skipped entries (dynamic CSS expressions, unsupported Tailwind values) */}
          {parsedSkipped.length > 0 && (
            <div className="rounded border border-[var(--color-figma-border)] text-secondary overflow-hidden">
              <button
                onClick={() => setParsedSkippedExpanded(p => !p)}
                className="w-full flex items-center justify-between px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg)] transition-colors text-left"
                aria-expanded={parsedSkippedExpanded}
              >
                <span className="text-[var(--color-figma-text-secondary)]">
                  <span className="text-[var(--color-figma-warning)] font-medium">{parsedSkipped.length}</span>
                  {' '}value{parsedSkipped.length !== 1 ? 's' : ''} skipped (unsupported)
                </span>
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className={`text-[var(--color-figma-text-secondary)] transition-transform ${parsedSkippedExpanded ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
              </button>
              {parsedSkippedExpanded && (
                <div className="max-h-28 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                  {parsedSkipped.map((entry, i) => (
                    <div key={i} className="px-2 py-1.5 flex flex-col gap-0.5">
                      <span className="font-mono text-[var(--color-figma-text)] text-secondary">{entry.path}</span>
                      <span className="text-[var(--color-figma-text-secondary)] text-secondary">
                        {entry.reason}
                        {entry.originalExpression && (
                          <> — <code className="font-mono text-[var(--color-figma-text)]">{entry.originalExpression.length > 48 ? entry.originalExpression.slice(0, 48) + '…' : entry.originalExpression}</code></>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        {effectiveRows.length > 0 && (
          <div className="flex-1 overflow-y-auto border-t border-[var(--color-figma-border)] min-h-0">
            {/* Summary bar */}
            <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-secondary">
                <span className="text-[var(--color-figma-text)] font-medium">{effectiveRows.length} token{effectiveRows.length !== 1 ? 's' : ''}</span>
                {toCreate.length > 0 && (
                  <span className="text-[var(--color-figma-success)]">+{toCreate.length} new</span>
                )}
                {invalidRows.length > 0 && (
                  <span className="text-[var(--color-figma-error)]">{invalidRows.length} invalid</span>
                )}
                {conflicts.length > 0 && (
                  <span className="text-[var(--color-figma-warning)]">{conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}</span>
                )}
                {skipped.length > 0 && (
                  <span className="text-[var(--color-figma-text-secondary)]">{skipped.length} skipped</span>
                )}
                {parsedSkipped.length > 0 && (
                  <span className="text-[var(--color-figma-warning)]">{parsedSkipped.length} unsupported</span>
                )}
              </div>
              {conflicts.length > 0 && (
                <label className="flex items-center gap-1 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={overwriteAll}
                    onChange={e => handleOverwriteAll(e.target.checked)}
                    className="accent-[var(--color-figma-accent)]"
                  />
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">overwrite all</span>
                </label>
              )}
            </div>
            {effectiveRows.map(row => (
              <div
                key={row.path}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] ${row.validationError ? 'bg-[var(--color-figma-error)]/5' : row.conflict ? 'bg-[var(--color-figma-warning)]/10' : ''}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-secondary font-mono truncate ${row.validationError ? 'text-[var(--color-figma-error)]' : 'text-[var(--color-figma-text)]'}`}>{row.path}</span>
                    <span className={`text-secondary rounded px-1 shrink-0 ${TYPE_COLORS[row.$type] ?? TYPE_COLORS['string']}`}>{row.$type}</span>
                    {row.validationError && (
                      <span className="text-secondary text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/20 rounded px-1 shrink-0">invalid</span>
                    )}
                    {!row.validationError && row.conflict && !row.overwrite && (
                      <span className="text-secondary text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10 border border-[var(--color-figma-warning)]/30 rounded px-1 shrink-0">skip</span>
                    )}
                    {!row.validationError && row.conflict && row.overwrite && (
                      <span className="text-secondary text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 border border-[var(--color-figma-accent)]/30 rounded px-1 shrink-0">overwrite</span>
                    )}
                  </div>
                  {row.validationError ? (
                    <div className="text-secondary text-[var(--color-figma-error)]">{row.validationError}</div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {row.$type === 'color' && <ColorSwatch value={row.$value} />}
                      <span className="text-secondary text-[var(--color-figma-text-secondary)] font-mono truncate">
                        {typeof row.$value === 'string' ? row.$value : JSON.stringify(row.$value)}
                      </span>
                    </div>
                  )}
                </div>
                {!row.validationError && row.conflict && (
                  <label className="flex items-center gap-1 shrink-0 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rowOverwrites[row.path] ?? false}
                      onChange={e => {
                        setRowOverwrites(prev => {
                          const next = { ...prev };
                          if (e.target.checked) next[row.path] = true;
                          else delete next[row.path];
                          return next;
                        });
                      }}
                      className="accent-[var(--color-figma-accent)]"
                    />
                    <span className="text-secondary text-[var(--color-figma-text-secondary)]">overwrite</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {submitError && (
          <div className="px-3 py-2 text-secondary text-[var(--color-figma-error)] border-t border-[var(--color-figma-border)]">{submitError}</div>
        )}

        <div className="flex gap-2 justify-end px-4 py-3 border-t border-[var(--color-figma-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmCount === 0 || busy}
            title={confirmCount > 0 ? `${adaptShortcut('⌘')}↵ to confirm` : undefined}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
          >
            {busy
              ? 'Saving…'
              : confirmCount === 0 && conflicts.length > 0
              ? 'All conflicts skipped'
              : confirmCount === 0
              ? 'Nothing to import'
              : toUpdate.length > 0
              ? `Create ${toCreate.length} · Update ${toUpdate.length}`
              : `Create ${toCreate.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
