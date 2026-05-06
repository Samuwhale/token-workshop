import { useState, useMemo, useCallback, useEffect } from 'react';
import { TOKEN_EDITOR_RESERVED_EXTENSION_KEYS } from '../shared/tokenEditorTypes';

/* ── Structured key-value extensions editor ── */

interface ExtEntry { id: string; key: string; value: string }

function newEntryId(): string {
  return Math.random().toString(36).slice(2);
}

function findReservedExtensionKey(keys: Iterable<string>): string | null {
  for (const key of keys) {
    if (TOKEN_EDITOR_RESERVED_EXTENSION_KEYS.has(key)) {
      return key;
    }
  }
  return null;
}

function parseEntries(jsonText: string): ExtEntry[] | null {
  const trimmed = jsonText.trim();
  if (!trimmed || trimmed === '{}') return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) return null;
    return Object.entries(parsed).map(([k, v]) => ({
      id: newEntryId(),
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v, null, 2),
    }));
  } catch (_error) {
    return null;
  }
}

function entriesToJson(entries: ExtEntry[]): string {
  const nonEmpty = entries.filter(e => e.key.trim());
  if (nonEmpty.length === 0) return '';
  const obj: Record<string, unknown> = {};
  for (const e of nonEmpty) {
    const val = e.value.trim();
    // Try to parse value as JSON (object/array/number/bool/null), fall back to string
    if (val) {
      try {
        obj[e.key] = JSON.parse(val);
      } catch (_error) {
        obj[e.key] = val;
      }
    } else {
      obj[e.key] = '';
    }
  }
  return JSON.stringify(obj, null, 2);
}

function validateEntries(entries: ExtEntry[]): string | null {
  const keys = entries.map(e => e.key.trim()).filter(Boolean);
  const dups = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dups.length > 0) return `Duplicate key: ${dups[0]}`;
  const reservedKey = findReservedExtensionKey(keys);
  if (reservedKey) return `"${reservedKey}" is managed elsewhere in the editor`;
  for (const e of entries) {
    const val = e.value.trim();
    if (val && (val.startsWith('{') || val.startsWith('['))) {
      try {
        JSON.parse(val);
      } catch (_error) {
        return `Invalid JSON value for "${e.key}"`;
      }
    }
  }
  return null;
}

function syncFromEntries(
  entries: ExtEntry[],
  onText: (t: string) => void,
  onError: (e: string | null) => void,
) {
  const err = validateEntries(entries);
  if (err) {
    onError(err);
    // Still sync text so dirty detection works, but mark as invalid
    onText(entriesToJson(entries));
  } else {
    const json = entriesToJson(entries);
    onText(json);
    onError(null);
  }
}

const inputCls = 'flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-secondary font-mono focus-visible:border-[var(--color-figma-accent)] placeholder:text-[color:var(--color-figma-text-secondary)]/40';

interface JsonErrorInfo {
  message: string;
  line?: number;
  col?: number;
  errorLine?: string;
}

function getJsonErrorInfo(text: string): JsonErrorInfo | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '{}') return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return { message: 'Must be a JSON object' };
    const reservedKey = findReservedExtensionKey(Object.keys(parsed as Record<string, unknown>));
    if (reservedKey) return { message: `"${reservedKey}" is managed elsewhere in the editor` };
    return null;
  } catch (e) {
    if (!(e instanceof SyntaxError)) return { message: 'Invalid JSON' };
    const msg = e.message;
    // V8: "Unexpected token '}', "..text.." is not valid JSON"
    // V8 newer: "Expected ',' or '}' after property value in JSON at position 45"
    const posMatch = msg.match(/at position (\d+)/i);
    // Clean verbose V8-style suffix
    let cleanMsg = msg
      .replace(/, ".{0,300}" is not valid JSON$/, '')
      .replace(/ at position \d+$/i, '')
      .trim();
    if (!cleanMsg) cleanMsg = 'Invalid JSON';

    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const textBefore = trimmed.slice(0, pos);
      const linesBefore = textBefore.split('\n');
      const line = linesBefore.length;
      const col = linesBefore[linesBefore.length - 1].length + 1;
      const errorLine = trimmed.split('\n')[line - 1] ?? '';
      return { message: `Line ${line}, col ${col}: ${cleanMsg}`, line, col, errorLine };
    }
    return { message: cleanMsg };
  }
}

function ExtensionsEditor({
  showExtensions, onToggleExtensions,
  extensionsJsonText, onExtensionsJsonTextChange,
  extensionsJsonError, onExtensionsJsonErrorChange,
}: {
  showExtensions: boolean;
  onToggleExtensions: () => void;
  extensionsJsonText: string;
  onExtensionsJsonTextChange: (text: string) => void;
  extensionsJsonError: string | null;
  onExtensionsJsonErrorChange: (err: string | null) => void;
}) {
  const [jsonErrorInfo, setJsonErrorInfo] = useState<JsonErrorInfo | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [entries, setEntries] = useState<ExtEntry[]>(() => parseEntries(extensionsJsonText) ?? []);
  // Track the last jsonText we synced from, to detect external changes
  const [lastSyncedText, setLastSyncedText] = useState(extensionsJsonText);

  useEffect(() => {
    if (extensionsJsonText === lastSyncedText) {
      return;
    }

    const parsed = parseEntries(extensionsJsonText);
    if (parsed !== null) {
      setEntries(parsed);
      if (rawMode && parsed.length > 0) {
        setRawMode(false);
      }
      setJsonErrorInfo(null);
      onExtensionsJsonErrorChange(null);
    } else {
      const errorInfo = getJsonErrorInfo(extensionsJsonText);
      setRawMode(true);
      setJsonErrorInfo(errorInfo);
      onExtensionsJsonErrorChange(errorInfo ? errorInfo.message : null);
    }

    setLastSyncedText(extensionsJsonText);
  }, [
    extensionsJsonText,
    lastSyncedText,
    onExtensionsJsonErrorChange,
    rawMode,
  ]);

  const updateEntry = useCallback((idx: number, field: 'key' | 'value', val: string) => {
    setEntries(prev => {
      const next = prev.map((e, i) => i === idx ? { ...e, [field]: val } : e);
      syncFromEntries(next, (t) => { onExtensionsJsonTextChange(t); setLastSyncedText(t); }, onExtensionsJsonErrorChange);
      return next;
    });
  }, [onExtensionsJsonTextChange, onExtensionsJsonErrorChange]);

  const removeEntry = useCallback((idx: number) => {
    setEntries(prev => {
      const next = prev.filter((_, i) => i !== idx);
      syncFromEntries(next, (t) => { onExtensionsJsonTextChange(t); setLastSyncedText(t); }, onExtensionsJsonErrorChange);
      return next;
    });
  }, [onExtensionsJsonTextChange, onExtensionsJsonErrorChange]);

  const addEntry = useCallback(() => {
    setEntries(prev => {
      const next = [...prev, { id: newEntryId(), key: '', value: '' }];
      // Don't sync yet — empty key won't produce JSON
      return next;
    });
  }, []);

  const switchToRaw = useCallback(() => {
    // Format existing text nicely when switching to raw
    const trimmed = extensionsJsonText.trim();
    if (trimmed) {
      try {
        const formatted = JSON.stringify(JSON.parse(trimmed), null, 2);
        onExtensionsJsonTextChange(formatted);
        setLastSyncedText(formatted);
      } catch (_error) {
        // Keep the current text as-is if it is not parseable.
      }
    }
    setRawMode(true);
  }, [extensionsJsonText, onExtensionsJsonTextChange]);

  const switchToStructured = useCallback(() => {
    const parsed = parseEntries(extensionsJsonText);
    if (parsed !== null) {
      setEntries(parsed);
      setRawMode(false);
    }
    // If can't parse, button is disabled so this won't fire
  }, [extensionsJsonText]);

  const canSwitchToStructured = useMemo(() => parseEntries(extensionsJsonText) !== null, [extensionsJsonText]);

  const hasCustom = extensionsJsonText.trim() && extensionsJsonText.trim() !== '{}';

  return (
    <div className="border-t border-[var(--color-figma-border)]">
      <button
        type="button"
        onClick={onToggleExtensions}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-secondary text-[color:var(--color-figma-text-secondary)] font-medium"
      >
        <span className="flex items-center gap-1.5">
          Extensions
          {hasCustom && (
            <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[color:var(--color-figma-text-accent)] text-[var(--font-size-xs)] font-medium">custom</span>
          )}
          {extensionsJsonError && (
            <span className="px-1 py-0.5 rounded bg-[var(--color-figma-error)]/15 text-[color:var(--color-figma-text-error)] text-[var(--font-size-xs)] font-medium">invalid</span>
          )}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showExtensions ? 'rotate-180' : ''}`}>
          <path d="M2 3.5l3 3 3-3"/>
        </svg>
      </button>
      {showExtensions && (
        <div className="px-3 py-2 flex flex-col gap-2 border-t border-[var(--color-figma-border)]">
          <div className="flex items-center justify-between">
            <p className="text-body leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
              Additional token fields. Token Workshop and Figma scope fields are managed above.
            </p>
            <button
              type="button"
              onClick={rawMode ? switchToStructured : switchToRaw}
              disabled={rawMode && !canSwitchToStructured}
              title={rawMode ? 'Switch to structured editor' : 'Edit as JSON'}
              className="ml-2 flex min-h-7 shrink-0 items-center rounded px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
            >
              {rawMode ? (
                <span className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                  Structured
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16"/></svg>
                  JSON
                </span>
              )}
            </button>
          </div>

          {rawMode ? (
            <>
              <textarea
                value={extensionsJsonText}
                onChange={e => {
                  const text = e.target.value;
                  onExtensionsJsonTextChange(text);
                  setLastSyncedText(text);
                  const errInfo = getJsonErrorInfo(text);
                  setJsonErrorInfo(errInfo);
                  onExtensionsJsonErrorChange(errInfo ? errInfo.message : null);
                }}
                placeholder={'{\n  "my.tool": { "category": "brand" }\n}'}
                rows={5}
                spellCheck={false}
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[color:var(--color-figma-text)] text-secondary font-mono outline-none resize-y min-h-[72px] placeholder:text-[color:var(--color-figma-text-secondary)]/40 ${extensionsJsonError ? 'border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]'}`}
              />
              {extensionsJsonError && (
                <div className="flex flex-col gap-0.5">
                  <p className="text-secondary text-[color:var(--color-figma-text-error)] flex items-start gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-[1px]"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{extensionsJsonError}</span>
                  </p>
                  {jsonErrorInfo?.errorLine !== undefined && jsonErrorInfo.col !== undefined && (
                    <div className="font-mono text-secondary bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/20 rounded px-1.5 py-1 overflow-x-auto">
                      <div className="text-[color:var(--color-figma-text)] whitespace-pre">{jsonErrorInfo.errorLine}</div>
                      <div className="text-[color:var(--color-figma-text-error)] whitespace-pre" aria-hidden="true">{' '.repeat(Math.max(0, jsonErrorInfo.col - 1))}^</div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {entries.length === 0 && (
                <p className="text-secondary text-[color:var(--color-figma-text-secondary)] italic">No custom extensions. Click + to add one.</p>
              )}
              {entries.map((entry, idx) => {
                const isObjectValue = entry.value.trim().startsWith('{') || entry.value.trim().startsWith('[');
                return (
                  <div key={entry.id} className="flex gap-1.5 items-start">
                    <input
                      type="text"
                      value={entry.key}
                      onChange={e => updateEntry(idx, 'key', e.target.value)}
                      placeholder="com.example"
                      className={`${inputCls} w-[110px] shrink-0 flex-none`}
                    />
                    {isObjectValue ? (
                      <textarea
                        value={entry.value}
                        onChange={e => updateEntry(idx, 'value', e.target.value)}
                        placeholder='{ "key": "value" }'
                        spellCheck={false}
                        rows={Math.min(entry.value.split('\n').length, 6)}
                        className={`${inputCls} flex-1 resize-y min-h-[28px]`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={entry.value}
                        onChange={e => updateEntry(idx, 'value', e.target.value)}
                        placeholder="value"
                        className={`${inputCls} flex-1`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeEntry(idx)}
                      title="Remove entry"
                      aria-label="Remove entry"
                      className="p-1 mt-0.5 rounded text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addEntry}
                className="self-start flex items-center gap-1 px-2 py-1 rounded text-secondary text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                Add extension
              </button>
              {extensionsJsonError && (
                <p className="text-secondary text-[color:var(--color-figma-text-error)]">{extensionsJsonError}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface MetadataEditorProps {
  extensionsJsonText: string;
  onExtensionsJsonTextChange: (text: string) => void;
  extensionsJsonError: string | null;
  onExtensionsJsonErrorChange: (err: string | null) => void;
}

export function MetadataEditor({
  extensionsJsonText, onExtensionsJsonTextChange,
  extensionsJsonError, onExtensionsJsonErrorChange,
}: MetadataEditorProps) {
  const [showExtensions, setShowExtensions] = useState(false);

  return (
    <ExtensionsEditor
      showExtensions={showExtensions}
      onToggleExtensions={() => setShowExtensions(v => !v)}
      extensionsJsonText={extensionsJsonText}
      onExtensionsJsonTextChange={onExtensionsJsonTextChange}
      extensionsJsonError={extensionsJsonError}
      onExtensionsJsonErrorChange={onExtensionsJsonErrorChange}
    />
  );
}
