import { useState, useMemo, useCallback } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';

export const FIGMA_SCOPES: Record<string, { label: string; value: string; description: string }[]> = {
  color: [
    { label: 'Fill Color', value: 'FILL_COLOR', description: 'Background and shape fill colors' },
    { label: 'Stroke Color', value: 'STROKE_COLOR', description: 'Border and outline colors' },
    { label: 'Text Fill', value: 'TEXT_FILL', description: 'Text layer colors' },
    { label: 'Effect Color', value: 'EFFECT_COLOR', description: 'Shadow and blur effect colors' },
  ],
  number: [
    { label: 'Width & Height', value: 'WIDTH_HEIGHT', description: 'Frame and element dimensions' },
    { label: 'Gap / Spacing', value: 'GAP', description: 'Auto-layout gap and padding' },
    { label: 'Corner Radius', value: 'CORNER_RADIUS', description: 'Rounded corner radius' },
    { label: 'Opacity', value: 'OPACITY', description: 'Layer opacity (0–1)' },
    { label: 'Font Size', value: 'FONT_SIZE', description: 'Text font size' },
    { label: 'Line Height', value: 'LINE_HEIGHT', description: 'Text line height' },
    { label: 'Letter Spacing', value: 'LETTER_SPACING', description: 'Text letter spacing' },
    { label: 'Stroke Width', value: 'STROKE_FLOAT', description: 'Border and outline thickness' },
  ],
  dimension: [
    { label: 'Width & Height', value: 'WIDTH_HEIGHT', description: 'Frame and element dimensions' },
    { label: 'Gap / Spacing', value: 'GAP', description: 'Auto-layout gap and padding' },
    { label: 'Corner Radius', value: 'CORNER_RADIUS', description: 'Rounded corner radius' },
    { label: 'Stroke Width', value: 'STROKE_FLOAT', description: 'Border and outline thickness' },
  ],
  string: [
    { label: 'Font Family', value: 'FONT_FAMILY', description: 'Typeface family name' },
    { label: 'Font Style', value: 'FONT_STYLE', description: 'Weight and style (e.g. Bold Italic)' },
    { label: 'Text Content', value: 'TEXT_CONTENT', description: 'Text layer content strings' },
  ],
  boolean: [
    { label: 'Visibility (Show/Hide)', value: 'SHOW_HIDE', description: 'Toggle layer visibility' },
  ],
};

/* ── Structured key-value extensions editor ── */

interface ExtEntry { key: string; value: string }

function parseEntries(jsonText: string): ExtEntry[] | null {
  const trimmed = jsonText.trim();
  if (!trimmed || trimmed === '{}') return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) return null;
    return Object.entries(parsed).map(([k, v]) => ({
      key: k,
      value: typeof v === 'string' ? v : JSON.stringify(v, null, 2),
    }));
  } catch (e) {
    console.debug('[MetadataEditor] failed to parse extensions JSON:', e);
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
      } catch (e2) {
        console.debug('[MetadataEditor] value is not valid JSON, treating as string:', e2);
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
  for (const e of entries) {
    const val = e.value.trim();
    if (val && (val.startsWith('{') || val.startsWith('['))) {
      try { JSON.parse(val); } catch (e2) { console.debug('[MetadataEditor] invalid JSON value for key:', e.key, e2); return `Invalid JSON value for "${e.key}"`; }
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

const inputCls = 'flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/40';

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

  // If extensionsJsonText changed externally (e.g. token load), re-parse entries
  if (extensionsJsonText !== lastSyncedText) {
    const parsed = parseEntries(extensionsJsonText);
    if (parsed !== null) {
      setEntries(parsed);
      if (rawMode && parsed.length > 0) setRawMode(false);
      setJsonErrorInfo(null);
    } else {
      // Can't parse — switch to raw mode
      setRawMode(true);
      setJsonErrorInfo(getJsonErrorInfo(extensionsJsonText));
    }
    setLastSyncedText(extensionsJsonText);
  }

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
      const next = [...prev, { key: '', value: '' }];
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
      } catch (e) { console.debug('[MetadataEditor] failed to format JSON:', e); /* keep as-is */ }
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
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
      >
        <span className="flex items-center gap-1.5">
          Extensions
          {hasCustom && (
            <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] text-[8px] font-medium">custom</span>
          )}
          {extensionsJsonError && (
            <span className="px-1 py-0.5 rounded bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)] text-[8px] font-medium">invalid</span>
          )}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showExtensions ? 'rotate-180' : ''}`}>
          <path d="M2 3.5l3 3 3-3"/>
        </svg>
      </button>
      {showExtensions && (
        <div className="px-3 py-2 flex flex-col gap-2 border-t border-[var(--color-figma-border)]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Custom extension data. The <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">tokenmanager</code> and <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">scopes</code> sections are managed above.
            </p>
            <button
              type="button"
              onClick={rawMode ? switchToStructured : switchToRaw}
              disabled={rawMode && !canSwitchToStructured}
              title={rawMode ? 'Switch to structured editor' : 'Switch to raw JSON'}
              className="shrink-0 ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
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
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] font-mono outline-none resize-y min-h-[72px] placeholder:text-[var(--color-figma-text-secondary)]/40 ${extensionsJsonError ? 'border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]'}`}
              />
              {extensionsJsonError && (
                <div className="flex flex-col gap-0.5">
                  <p className="text-[10px] text-[var(--color-figma-error)] flex items-start gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-[1px]"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{extensionsJsonError}</span>
                  </p>
                  {jsonErrorInfo?.errorLine !== undefined && jsonErrorInfo.col !== undefined && (
                    <div className="font-mono text-[9px] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/20 rounded px-1.5 py-1 overflow-x-auto">
                      <div className="text-[var(--color-figma-text)] whitespace-pre">{jsonErrorInfo.errorLine}</div>
                      <div className="text-[var(--color-figma-error)] whitespace-pre" aria-hidden="true">{' '.repeat(Math.max(0, jsonErrorInfo.col - 1))}^</div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {entries.length === 0 && (
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] italic">No custom extensions. Click + to add one.</p>
              )}
              {entries.map((entry, idx) => {
                const isObjectValue = entry.value.trim().startsWith('{') || entry.value.trim().startsWith('[');
                return (
                  <div key={idx} className="flex gap-1.5 items-start">
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
                      className="p-1 mt-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
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
                className="self-start flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                Add extension
              </button>
              {extensionsJsonError && (
                <p className="text-[10px] text-[var(--color-figma-error)]">{extensionsJsonError}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModeValuesEditor — standalone section for per-mode token value overrides
// ---------------------------------------------------------------------------

export interface ModeValuesEditorProps {
  dimensions: ThemeDimension[];
  modeValues: Record<string, any>;
  onModeValuesChange: (modes: Record<string, any>) => void;
  tokenType: string;
  aliasMode: boolean;
  reference: string;
  value: any;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  /** Navigate to the Themes workspace to configure modes */
  onNavigateToThemes?: () => void;
}

export function ModeValuesEditor({
  dimensions,
  modeValues,
  onModeValuesChange,
  tokenType,
  aliasMode,
  reference,
  value,
  allTokensFlat = {},
  pathToSet = {},
  onNavigateToThemes,
}: ModeValuesEditorProps) {
  const [autocompleteModeKey, setAutocompleteModeKey] = useState<string | null>(null);
  const setCount = Object.values(modeValues).filter(v => v !== '' && v !== undefined && v !== null).length;
  const hasTokens = Object.keys(allTokensFlat).length > 0;

  return (
    <div className="rounded-lg border border-[var(--color-figma-border)] overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
        <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
          Values by mode
        </span>
        <span className="flex items-center gap-2">
          {setCount > 0 && (
            <span className="text-[9px] text-[var(--color-figma-text-secondary)]">{setCount} overridden</span>
          )}
          {onNavigateToThemes && (
            <button
              type="button"
              onClick={onNavigateToThemes}
              className="text-[9px] text-[var(--color-figma-accent)] hover:underline"
            >
              Configure
            </button>
          )}
        </span>
      </div>
      <div className="px-3 py-2 flex flex-col gap-2.5">
        {dimensions.map(dim => (
          <div key={dim.id}>
            {dimensions.length > 1 && (
              <div className="text-[9px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide mb-1.5">{dim.name}</div>
            )}
            {dim.options.map(option => {
              const modeVal = modeValues[option.name] ?? '';
              const modeValStr = typeof modeVal === 'string' ? modeVal : '';
              const isColorVal = tokenType === 'color' && typeof modeVal === 'string' && modeVal.startsWith('#') && !modeVal.startsWith('{');
              const showingAutocomplete = autocompleteModeKey === option.name;
              const baseStr = aliasMode ? reference : String(value ?? '');
              const isOverridden = modeValStr !== '' && modeValStr !== baseStr;
              return (
                <div key={option.name} className={`flex items-center gap-2 mb-1.5 rounded-sm pl-1.5 ${isOverridden ? 'border-l-2 border-[var(--color-figma-accent)]' : ''}`}>
                  <span className="text-[10px] text-[var(--color-figma-text)] w-16 shrink-0 truncate" title={option.name}>{option.name}</span>
                  {isColorVal && (
                    <div
                      className="w-4 h-4 rounded-sm border border-white/40 ring-1 ring-[var(--color-figma-border)] shrink-0"
                      style={{ backgroundColor: modeVal }}
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={modeVal}
                      onChange={e => {
                        const v = e.target.value;
                        onModeValuesChange({ ...modeValues, [option.name]: v });
                        if (hasTokens) {
                          const hasOpen = v.includes('{') && !v.endsWith('}');
                          setAutocompleteModeKey(hasOpen ? option.name : null);
                        }
                      }}
                      onFocus={() => {
                        if (hasTokens && modeValStr.includes('{') && !modeValStr.endsWith('}')) {
                          setAutocompleteModeKey(option.name);
                        }
                      }}
                      onBlur={() => setTimeout(() => setAutocompleteModeKey(k => k === option.name ? null : k), 150)}
                      onKeyDown={e => {
                        if (hasTokens && e.key === '{') setAutocompleteModeKey(option.name);
                      }}
                      placeholder={aliasMode ? (reference || 'value or {alias}') : String(value !== '' && value !== undefined ? value : 'value or {alias}')}
                      className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/40"
                    />
                    {showingAutocomplete && (
                      <AliasAutocomplete
                        query={modeValStr.includes('{') ? modeValStr.slice(modeValStr.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
                        allTokensFlat={allTokensFlat}
                        pathToSet={pathToSet}
                        filterType={tokenType}
                        onSelect={path => {
                          onModeValuesChange({ ...modeValues, [option.name]: `{${path}}` });
                          setAutocompleteModeKey(null);
                        }}
                        onClose={() => setAutocompleteModeKey(null)}
                      />
                    )}
                  </div>
                  {modeVal !== '' && (
                    <button
                      type="button"
                      onClick={() => { const next = { ...modeValues }; delete next[option.name]; onModeValuesChange(next); }}
                      title={`Clear ${option.name} override`}
                      aria-label={`Clear ${option.name} override`}
                      className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetadataEditor
// ---------------------------------------------------------------------------

interface MetadataEditorProps {
  description: string;
  onDescriptionChange: (desc: string) => void;
  tokenType: string;
  scopes: string[];
  onScopesChange: (scopes: string[]) => void;
  extensionsJsonText: string;
  onExtensionsJsonTextChange: (text: string) => void;
  extensionsJsonError: string | null;
  onExtensionsJsonErrorChange: (err: string | null) => void;
  isCreateMode: boolean;
}

export function MetadataEditor({
  description, onDescriptionChange,
  tokenType, scopes, onScopesChange,
  extensionsJsonText, onExtensionsJsonTextChange,
  extensionsJsonError, onExtensionsJsonErrorChange,
  isCreateMode,
}: MetadataEditorProps) {
  const [showScopes, setShowScopes] = useState(false);
  const [showExtensions, setShowExtensions] = useState(false);

  return (
    <>
      {/* Description */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder="Optional description"
          rows={2}
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] resize-none min-h-[48px] placeholder:text-[var(--color-figma-text-secondary)]/50"
        />
      </div>

      {/* Figma Variable Scopes */}
    {FIGMA_SCOPES[tokenType] && (
      <div className="border-t border-[var(--color-figma-border)]">
        <button
          type="button"
          onClick={() => setShowScopes(v => !v)}
          title="Scopes control which Figma properties this variable is offered for"
          className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
        >
          <span>Figma variable scopes {scopes.length > 0 ? `(${scopes.length} selected)` : ''}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showScopes ? 'rotate-180' : ''}`}>
            <path d="M2 3.5l3 3 3-3"/>
          </svg>
        </button>
        {showScopes && (
          <div className="px-3 py-2 flex flex-col gap-1.5">
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
              Controls where this variable appears in Figma's variable picker. Empty = All scopes.
            </p>
            {FIGMA_SCOPES[tokenType].map(scope => (
              <label key={scope.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope.value)}
                  onChange={e => onScopesChange(
                    e.target.checked ? [...scopes, scope.value] : scopes.filter(s => s !== scope.value)
                  )}
                  className="w-3 h-3 rounded mt-0.5"
                />
                <span className="flex flex-col">
                  <span className="text-[11px] text-[var(--color-figma-text)]">{scope.label}</span>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] leading-tight">{scope.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    )}

    {/* Other extensions */}
    {!isCreateMode && (
      <ExtensionsEditor
        showExtensions={showExtensions}
        onToggleExtensions={() => setShowExtensions(v => !v)}
        extensionsJsonText={extensionsJsonText}
        onExtensionsJsonTextChange={onExtensionsJsonTextChange}
        extensionsJsonError={extensionsJsonError}
        onExtensionsJsonErrorChange={onExtensionsJsonErrorChange}
      />
    )}
    </>
  );
}
