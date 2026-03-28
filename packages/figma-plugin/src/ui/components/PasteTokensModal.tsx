import { useState, useEffect, useMemo, useRef } from 'react';
import { flattenTokenGroup, type DTCGGroup } from '@tokenmanager/core';
import { adaptShortcut, getErrorMessage } from '../shared/utils';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface ParsedToken {
  path: string;
  $type: string;
  $value: unknown;
}

interface ParseResult {
  tokens: ParsedToken[];
  errors: string[];
  format: 'dtcg' | 'lines' | 'empty' | 'error';
}

function inferType(value: string): { $type: string; $value: unknown } {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return { $type: 'color', $value: trimmed }; // alias — type unknown at parse time
  }
  if (/^#([0-9a-fA-F]{3,8})$/.test(trimmed)) {
    return { $type: 'color', $value: trimmed };
  }
  const dimMatch = trimmed.match(/^(-?\d+(\.\d+)?)(px|em|rem|%|vh|vw|pt)$/);
  if (dimMatch) {
    return { $type: 'dimension', $value: { value: parseFloat(dimMatch[1]), unit: dimMatch[3] } };
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { $type: 'number', $value: parseFloat(trimmed) };
  }
  return { $type: 'string', $value: trimmed };
}

function flattenDTCG(obj: DTCGGroup): ParsedToken[] {
  const results: ParsedToken[] = [];
  for (const [path, token] of flattenTokenGroup(obj)) {
    results.push({
      path,
      $type: typeof token.$type === 'string' ? token.$type : 'string',
      $value: token.$value,
    });
  }
  return results;
}

function parseInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { tokens: [], errors: [], format: 'empty' };

  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const tokens = flattenDTCG(parsed);
      if (tokens.length === 0) {
        return { tokens: [], errors: ['No tokens found in JSON. Expected DTCG format with $value fields.'], format: 'error' };
      }
      return { tokens, errors: [], format: 'dtcg' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Check if it looks like name:value lines were mixed into the JSON
      const looksLikeMixed = /\n\s*[\w.]+\s*:/.test(trimmed);
      const hint = looksLikeMixed ? ' (did you mix JSON and name:value lines? Use one format only)' : '';
      return { tokens: [], errors: [`JSON parse error: ${msg}${hint}`], format: 'error' };
    }
  }

  // name: value lines
  const lines = trimmed.split('\n');
  const tokens: ParsedToken[] = [];
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) {
      errors.push(`Line ${i + 1}: no colon found — expected "name: value"`);
      continue;
    }
    const path = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!path) {
      errors.push(`Line ${i + 1}: empty token name`);
      continue;
    }
    if (!rawValue) {
      errors.push(`Line ${i + 1}: empty value`);
      continue;
    }
    tokens.push({ path, ...inferType(rawValue) });
  }
  return { tokens, errors, format: errors.length > 0 && tokens.length === 0 ? 'error' : 'lines' };
}

// ---------------------------------------------------------------------------
// Path validation (mirrors server-side validateTokenPath + extra checks)
// ---------------------------------------------------------------------------

function validateTokenPath(path: string): string | null {
  if (!path) return 'Empty token path';
  const segments = path.split('.');
  for (const seg of segments) {
    if (seg === '') return 'Empty segment (double dot or leading/trailing dot)';
    if (seg.startsWith('$')) return `Segment "${seg}" uses reserved "$" prefix`;
    if (seg.includes('/') || seg.includes('\\')) return `Segment "${seg}" contains a slash`;
    if (/\s/.test(seg)) return `Segment "${seg}" contains whitespace`;
  }
  return null;
}

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
};

const TYPE_COLORS: Record<string, string> = {
  color: 'text-purple-600 bg-purple-50',
  dimension: 'text-blue-600 bg-blue-50',
  number: 'text-teal-600 bg-teal-50',
  string: 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]',
};

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
  activeSet: string;
  existingPaths: Set<string>;
  onClose: () => void;
  onConfirm: () => void;
}

export function PasteTokensModal({ serverUrl, activeSet, existingPaths, onClose, onConfirm }: PasteTokensModalProps) {
  const [input, setInput] = useState('');
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [rowOverwrites, setRowOverwrites] = useState<Record<string, boolean>>({});
  const [overwriteAll, setOverwriteAll] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { tokens: parsedTokens, errors, format } = useMemo(() => parseInput(input), [input]);

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
    }).catch(() => { /* clipboard unavailable or denied — leave empty */ });
  }, []);

  useEffect(() => {
    setRowOverwrites({});
    setOverwriteAll(false);
  }, [input]);

  const handleOverwriteAll = (checked: boolean) => {
    setOverwriteAll(checked);
    const next: Record<string, boolean> = {};
    rows.forEach(r => { if (r.conflict) next[r.path] = checked; });
    setRowOverwrites(next);
  };

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

  const handleConfirm = async () => {
    if (confirmCount === 0 || busy) return;
    setBusy(true);
    setSubmitError('');
    const total = toCreate.length + toUpdate.length;
    setProgress({ current: 0, total });
    let done = 0;
    try {
      for (const row of toCreate) {
        const pathEncoded = row.path.split('.').map(encodeURIComponent).join('/');
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${pathEncoded}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: row.$value, $type: row.$type }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error || `Failed to create token "${row.path}"`);
        }
        done++;
        setProgress({ current: done, total });
      }
      for (const row of toUpdate) {
        const pathEncoded = row.path.split('.').map(encodeURIComponent).join('/');
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${pathEncoded}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: row.$value, $type: row.$type }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error || `Failed to update token "${row.path}"`);
        }
        done++;
        setProgress({ current: done, total });
      }
      onConfirm();
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setProgress(null);
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onKeyDown={handleKeyDown}>
      <div
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl flex flex-col"
        style={{ width: 420, maxHeight: '88vh' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-start justify-between gap-2">
          <div>
            <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">Paste Tokens</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
              into <span className="font-mono text-[var(--color-figma-text)]">{activeSet}</span>
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

        {/* Format hints — mutually exclusive */}
        <div className="px-4 pt-3 pb-0 flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Format:</span>
          <span className={`text-[10px] font-mono rounded px-1.5 py-0.5 transition-colors ${
            format === 'dtcg'
              ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-semibold'
              : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'
          }`}>JSON / DTCG</span>
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] select-none">or</span>
          <span className={`text-[10px] font-mono rounded px-1.5 py-0.5 transition-colors ${
            format === 'lines'
              ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-semibold'
              : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'
          }`}>name: value</span>
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] select-none">— not both</span>
        </div>

        <div className="p-3 flex flex-col gap-2">
          {/* Textarea with detected-format badge */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)] resize-none"
              rows={7}
              placeholder={'colors.red: #ff0000\ncolors.blue: #0000ff\nspacing.sm: 8px\n\n— or DTCG JSON —\n{"colors":{"red":{"$value":"#ff0000","$type":"color"}}}'}
              value={input}
              onChange={e => { setInput(e.target.value); setSubmitError(''); }}
              autoFocus
            />
            {format !== 'empty' && format !== 'error' && (
              <span className="absolute bottom-2 right-2 text-[9px] font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)]/30 rounded px-1.5 py-0.5 pointer-events-none">
                {FORMAT_LABELS[format]}
              </span>
            )}
          </div>

          {/* Group prefix */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
                Group prefix
              </label>
              <input
                type="text"
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/50"
                placeholder="e.g. brand.colors (optional)"
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
              />
            </div>
            {prefix.trim() && prefixError && (
              <div className="text-[9px] text-[var(--color-figma-error)] pl-1">{prefixError}</div>
            )}
            {prefix.trim() && !prefixError && prefixedTokens.length > 0 && (
              <div className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono truncate pl-1">
                → <span className="text-[var(--color-figma-text)]">{prefixedTokens[0].path}</span>
                {prefixedTokens.length > 1 && <span> …</span>}
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="flex flex-col gap-0.5 px-2 py-1.5 bg-[var(--color-figma-error)]/5 rounded border border-[var(--color-figma-error)]/20">
              {errors.map((err, i) => (
                <div key={i} className="text-[10px] text-[var(--color-figma-error)]">{err}</div>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        {effectiveRows.length > 0 && (
          <div className="flex-1 overflow-y-auto border-t border-[var(--color-figma-border)] min-h-0">
            {/* Summary bar */}
            <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[var(--color-figma-text)] font-medium">{effectiveRows.length} token{effectiveRows.length !== 1 ? 's' : ''}</span>
                {toCreate.length > 0 && (
                  <span className="text-green-700">+{toCreate.length} new</span>
                )}
                {invalidRows.length > 0 && (
                  <span className="text-[var(--color-figma-error)]">{invalidRows.length} invalid</span>
                )}
                {conflicts.length > 0 && (
                  <span className="text-amber-600">{conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}</span>
                )}
                {skipped.length > 0 && (
                  <span className="text-[var(--color-figma-text-secondary)]">{skipped.length} skipped</span>
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
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">overwrite all</span>
                </label>
              )}
            </div>
            {effectiveRows.map(row => (
              <div
                key={row.path}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] ${row.validationError ? 'bg-[var(--color-figma-error)]/5' : row.conflict ? 'bg-amber-50/60' : ''}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono truncate ${row.validationError ? 'text-[var(--color-figma-error)]' : 'text-[var(--color-figma-text)]'}`}>{row.path}</span>
                    <span className={`text-[9px] rounded px-1 shrink-0 ${TYPE_COLORS[row.$type] ?? TYPE_COLORS['string']}`}>{row.$type}</span>
                    {row.validationError && (
                      <span className="text-[9px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/20 rounded px-1 shrink-0">invalid</span>
                    )}
                    {!row.validationError && row.conflict && !row.overwrite && (
                      <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 shrink-0">skip</span>
                    )}
                    {!row.validationError && row.conflict && row.overwrite && (
                      <span className="text-[9px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 shrink-0">overwrite</span>
                    )}
                  </div>
                  {row.validationError ? (
                    <div className="text-[9px] text-[var(--color-figma-error)]">{row.validationError}</div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {row.$type === 'color' && <ColorSwatch value={row.$value} />}
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate">
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
                        const next = { ...rowOverwrites, [row.path]: e.target.checked };
                        setRowOverwrites(next);
                        const allChecked = rows.filter(r => r.conflict && !r.validationError).every(r => next[r.path]);
                        setOverwriteAll(allChecked);
                      }}
                      className="accent-[var(--color-figma-accent)]"
                    />
                    <span className="text-[9px] text-[var(--color-figma-text-secondary)]">overwrite</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {progress && (
          <div className="px-4 py-2 border-t border-[var(--color-figma-border)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Importing tokens…
              </span>
              <span className="text-[10px] font-mono text-[var(--color-figma-text)]">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[var(--color-figma-bg-secondary)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-figma-accent)] transition-[width] duration-100"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {submitError && (
          <div className="px-3 py-2 text-[10px] text-[var(--color-figma-error)] border-t border-[var(--color-figma-border)]">{submitError}</div>
        )}

        <div className="flex gap-2 justify-end px-4 py-3 border-t border-[var(--color-figma-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmCount === 0 || busy}
            title={confirmCount > 0 ? `${adaptShortcut('⌘')}↵ to confirm` : undefined}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
          >
            {busy && progress
              ? `Saving ${progress.current}/${progress.total}…`
              : busy
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
