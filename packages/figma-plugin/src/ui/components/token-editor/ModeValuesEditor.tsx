import { useState } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../../shared/types';
import { AliasAutocomplete } from '../AliasAutocomplete';
import { ModeValueEditor } from './ModeValueEditor';

// Token types that have a compact inline editor
const RICH_EDITOR_TYPES = new Set(['color', 'dimension', 'number', 'boolean', 'duration']);

export interface ModeValuesEditorProps {
  dimensions: ThemeDimension[];
  modeValues: Record<string, Record<string, unknown>>;
  onModeValuesChange: (modes: Record<string, Record<string, unknown>>) => void;
  tokenType: string;
  aliasMode: boolean;
  reference: string;
  value: any;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  onNavigateToThemes?: () => void;
}

function updateNestedMode(
  modeValues: Record<string, Record<string, unknown>>,
  dimId: string,
  optName: string,
  val: unknown,
): Record<string, Record<string, unknown>> {
  return { ...modeValues, [dimId]: { ...(modeValues[dimId] ?? {}), [optName]: val } };
}

function clearNestedMode(
  modeValues: Record<string, Record<string, unknown>>,
  dimId: string,
  optName: string,
): Record<string, Record<string, unknown>> {
  const dimOpts = { ...(modeValues[dimId] ?? {}) };
  delete dimOpts[optName];
  const next = { ...modeValues };
  if (Object.keys(dimOpts).length === 0) {
    delete next[dimId];
  } else {
    next[dimId] = dimOpts;
  }
  return next;
}

function isAliasValue(val: unknown): boolean {
  return typeof val === 'string' && val.startsWith('{');
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
  // Track which rows the user has toggled to alias input mode
  const [aliasInputKeys, setAliasInputKeys] = useState<Set<string>>(new Set());

  const setCount = Object.values(modeValues).reduce(
    (acc, opts) => acc + Object.values(opts).filter(v => v !== '' && v !== undefined && v !== null).length,
    0,
  );
  const hasTokens = Object.keys(allTokensFlat).length > 0;
  const useRichEditor = RICH_EDITOR_TYPES.has(tokenType);

  if (dimensions.length === 0) {
    if (!onNavigateToThemes) return null;
    return (
      <div className="rounded-lg border border-[var(--color-figma-border)] overflow-hidden">
        <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
          <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Variant values
          </span>
        </div>
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            No variant groups configured yet.
          </p>
          <button
            type="button"
            onClick={onNavigateToThemes}
            className="shrink-0 text-[10px] text-[var(--color-figma-accent)] hover:underline"
          >
            Set up variants
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-figma-border)] overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
        <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
          Variant values
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
              Edit variants
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
              const modeVal = modeValues[dim.id]?.[option.name] ?? '';
              const modeValStr = typeof modeVal === 'string' ? modeVal : '';
              const acKey = `${dim.id}:${option.name}`;
              const showingAutocomplete = autocompleteModeKey === acKey;
              const baseStr = aliasMode ? reference : String(value ?? '');
              const isOverridden = modeVal !== '' && modeValStr !== baseStr;
              const isAlias = isAliasValue(modeVal);
              const forceAliasInput = aliasInputKeys.has(acKey);
              // Use rich editor when: token type supports it, value is not an alias, and user hasn't toggled to alias mode
              const showRichEditor = useRichEditor && !isAlias && !forceAliasInput && !showingAutocomplete;

              return (
                <div key={option.name} className={`flex flex-col gap-1 mb-1.5 rounded-sm pl-1.5 ${isOverridden ? 'border-l-2 border-[var(--color-figma-accent)]' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-figma-text)] truncate" title={option.name}>{option.name}</span>
                    <span className="flex items-center gap-1">
                      {useRichEditor && hasTokens && (
                        <button
                          type="button"
                          onClick={() => {
                            setAliasInputKeys(prev => {
                              const next = new Set(prev);
                              if (next.has(acKey)) {
                                next.delete(acKey);
                              } else {
                                next.add(acKey);
                              }
                              return next;
                            });
                          }}
                          title={forceAliasInput || isAlias ? "Switch to value editor" : "Switch to alias reference"}
                          className="p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] transition-colors"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                        </button>
                      )}
                      {modeVal !== '' && (
                        <button
                          type="button"
                          onClick={() => onModeValuesChange(clearNestedMode(modeValues, dim.id, option.name))}
                          title={`Clear ${option.name} override`}
                          aria-label={`Clear ${option.name} override`}
                          className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      )}
                    </span>
                  </div>
                  {showRichEditor ? (
                    <ModeValueEditor
                      tokenType={tokenType}
                      value={modeVal === '' ? undefined : modeVal}
                      onChange={v => onModeValuesChange(updateNestedMode(modeValues, dim.id, option.name, v))}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={modeValStr}
                        onChange={e => {
                          const v = e.target.value;
                          onModeValuesChange(updateNestedMode(modeValues, dim.id, option.name, v));
                          if (hasTokens) {
                            const hasOpen = v.includes('{') && !v.endsWith('}');
                            setAutocompleteModeKey(hasOpen ? acKey : null);
                          }
                        }}
                        onFocus={() => {
                          if (hasTokens && modeValStr.includes('{') && !modeValStr.endsWith('}')) {
                            setAutocompleteModeKey(acKey);
                          }
                        }}
                        onBlur={() => setTimeout(() => setAutocompleteModeKey(k => k === acKey ? null : k), 150)}
                        onKeyDown={e => {
                          if (hasTokens && e.key === '{') setAutocompleteModeKey(acKey);
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
                            onModeValuesChange(updateNestedMode(modeValues, dim.id, option.name, `{${path}}`));
                            setAutocompleteModeKey(null);
                          }}
                          onClose={() => setAutocompleteModeKey(null)}
                        />
                      )}
                    </div>
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
