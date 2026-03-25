import { useState, useEffect, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedToken {
  path: string;
  $type: string;
  $value: unknown;
}

interface ParseResult {
  tokens: ParsedToken[];
  errors: string[];
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

function flattenDTCG(obj: Record<string, unknown>, prefix = ''): ParsedToken[] {
  const results: ParsedToken[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const v = val as Record<string, unknown>;
      if ('$value' in v) {
        results.push({
          path: fullPath,
          $type: typeof v.$type === 'string' ? v.$type : 'string',
          $value: v.$value,
        });
      } else {
        results.push(...flattenDTCG(v as Record<string, unknown>, fullPath));
      }
    }
  }
  return results;
}

export function parseInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { tokens: [], errors: [] };

  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const tokens = flattenDTCG(parsed);
      if (tokens.length === 0) {
        return { tokens: [], errors: ['No tokens found in JSON. Expected DTCG format with $value fields.'] };
      }
      return { tokens, errors: [] };
    } catch (e) {
      return { tokens: [], errors: [`JSON parse error: ${e instanceof Error ? e.message : String(e)}`] };
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
  return { tokens, errors };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PasteTokenRow extends ParsedToken {
  conflict: boolean;
  overwrite: boolean;
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
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { tokens: parsedTokens, errors } = useMemo(() => parseInput(input), [input]);

  const rows: PasteTokenRow[] = useMemo(
    () =>
      parsedTokens.map(t => ({
        ...t,
        conflict: existingPaths.has(t.path),
        overwrite: false,
      })),
    [parsedTokens, existingPaths],
  );

  const [rowOverwrites, setRowOverwrites] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRowOverwrites({});
  }, [input]);

  const effectiveRows = rows.map(r => ({ ...r, overwrite: rowOverwrites[r.path] ?? false }));
  const toCreate = effectiveRows.filter(r => !r.conflict);
  const toUpdate = effectiveRows.filter(r => r.conflict && r.overwrite);
  const confirmCount = toCreate.length + toUpdate.length;

  const handleConfirm = async () => {
    if (confirmCount === 0 || busy) return;
    setBusy(true);
    setSubmitError('');
    try {
      for (const row of toCreate) {
        const pathEncoded = row.path.split('.').map(encodeURIComponent).join('/');
        await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${pathEncoded}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: row.$value, $type: row.$type }),
        });
      }
      for (const row of toUpdate) {
        const pathEncoded = row.path.split('.').map(encodeURIComponent).join('/');
        await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${pathEncoded}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: row.$value, $type: row.$type }),
        });
      }
      onConfirm();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl flex flex-col"
        style={{ width: 400, maxHeight: '85vh' }}
      >
        <div className="p-4 border-b border-[var(--color-figma-border)]">
          <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Paste Tokens</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
            Paste JSON (DTCG format) or <span className="font-mono">name: value</span> lines into <span className="font-mono text-[var(--color-figma-text)]">{activeSet}</span>
          </div>
        </div>

        <div className="p-3 flex flex-col gap-2">
          <textarea
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)] resize-none"
            rows={8}
            placeholder={'colors.red: #ff0000\ncolors.blue: #0000ff\nspacing.sm: 8px\n\n— or JSON DTCG —\n{"colors":{"red":{"$value":"#ff0000","$type":"color"}}}'}
            value={input}
            onChange={e => { setInput(e.target.value); setSubmitError(''); }}
            autoFocus
          />

          {errors.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {errors.map((err, i) => (
                <div key={i} className="text-[10px] text-[var(--color-figma-error)]">{err}</div>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        {effectiveRows.length > 0 && (
          <div className="flex-1 overflow-y-auto border-t border-[var(--color-figma-border)]">
            <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] font-medium">
              {effectiveRows.length} token{effectiveRows.length !== 1 ? 's' : ''} parsed
            </div>
            {effectiveRows.map(row => (
              <div
                key={row.path}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] ${row.conflict ? 'bg-yellow-50' : ''}`}
              >
                <div className="flex flex-col gap-0 min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{row.path}</span>
                    <span className="text-[9px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] rounded px-1 shrink-0">{row.$type}</span>
                    {row.conflict && (
                      <span className="text-[9px] text-yellow-700 bg-yellow-100 rounded px-1 shrink-0">exists</span>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate">
                    {typeof row.$value === 'string' ? row.$value : JSON.stringify(row.$value)}
                  </div>
                </div>
                {row.conflict && (
                  <label className="flex items-center gap-1 shrink-0 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rowOverwrites[row.path] ?? false}
                      onChange={e => setRowOverwrites(prev => ({ ...prev, [row.path]: e.target.checked }))}
                      className="accent-[var(--color-figma-accent)]"
                    />
                    <span className="text-[9px] text-[var(--color-figma-text-secondary)]">overwrite</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {submitError && (
          <div className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{submitError}</div>
        )}

        <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmCount === 0 || busy}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
          >
            {busy ? 'Creating…' : `Create ${confirmCount}`}
          </button>
        </div>
      </div>
    </div>
  );
}
