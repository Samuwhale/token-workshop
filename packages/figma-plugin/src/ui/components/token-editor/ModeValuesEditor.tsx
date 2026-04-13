import { useState, useCallback } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../../shared/types';
import { AliasAutocomplete } from '../AliasAutocomplete';
import { Collapsible } from '../Collapsible';
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
  activeThemes?: Record<string, string>;
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
  activeThemes = {},
}: ModeValuesEditorProps) {
  const [autocompleteModeKey, setAutocompleteModeKey] = useState<string | null>(null);
  // Track which rows the user has toggled to alias input mode
  const [aliasInputKeys, setAliasInputKeys] = useState<Set<string>>(new Set());
  // Track which dimensions are collapsed (only used when 2+ dimensions)
  const [collapsedDims, setCollapsedDims] = useState<Set<string>>(new Set());
  const toggleDimCollapsed = useCallback((dimId: string) => {
    setCollapsedDims(prev => {
      const next = new Set(prev);
      if (next.has(dimId)) next.delete(dimId);
      else next.add(dimId);
      return next;
    });
  }, []);

  const setCount = Object.values(modeValues).reduce(
    (acc, opts) => acc + Object.values(opts).filter(v => v !== '' && v !== undefined && v !== null).length,
    0,
  );
  const hasTokens = Object.keys(allTokensFlat).length > 0;
  const useRichEditor = RICH_EDITOR_TYPES.has(tokenType);

  if (dimensions.length === 0) {
    if (!onNavigateToThemes) return null;
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/35 px-2.5 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Theme overrides
          </p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            No theme families configured yet.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToThemes}
          className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
        >
          Set up themes
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Theme overrides
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {setCount > 0 && (
            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
              {setCount} override{setCount === 1 ? "" : "s"}
            </span>
          )}
          {onNavigateToThemes && (
            <button
              type="button"
              onClick={onNavigateToThemes}
              className="text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
            >
              Manage themes
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {dimensions.map(dim => {
          const dimOverrideCount = Object.values(modeValues[dim.id] ?? {}).filter(
            v => v !== '' && v !== undefined && v !== null,
          ).length;
          const isCollapsible = dimensions.length > 1;
          const isOpen = !collapsedDims.has(dim.id);

          const optionsContent = (
            <div className={`divide-y divide-[var(--color-figma-border)]/50 rounded-md border border-[var(--color-figma-border)]/65 overflow-hidden ${isCollapsible ? 'mt-1' : ''}`}>
              {dim.options.map(option => {
                const modeVal = modeValues[dim.id]?.[option.name] ?? '';
                const modeValStr = typeof modeVal === 'string' ? modeVal : '';
                const acKey = `${dim.id}:${option.name}`;
                const showingAutocomplete = autocompleteModeKey === acKey;
                const baseStr = aliasMode ? reference : String(value ?? '');
                const isOverridden = modeVal !== '' && modeValStr !== baseStr;
                const isAlias = isAliasValue(modeVal);
                const forceAliasInput = aliasInputKeys.has(acKey);
                const showRichEditor =
                  useRichEditor && !isAlias && !forceAliasInput && !showingAutocomplete;
                const isActiveTheme = activeThemes[dim.id] === option.name;

                return (
                  <div
                    key={option.name}
                    className={`group flex items-center gap-2 py-1.5 px-2.5 ${
                      isOverridden
                        ? 'border-l-2 border-l-[var(--color-figma-accent)]'
                        : 'border-l-2 border-l-transparent'
                    } ${isActiveTheme ? 'bg-[var(--color-figma-accent)]/5' : ''}`}
                  >
                    <span
                      className="w-[72px] shrink-0 truncate text-[10px] font-medium text-[var(--color-figma-text)]"
                      title={option.name}
                    >
                      {option.name}
                    </span>
                    <div className="flex flex-1 items-center gap-1 min-w-0">
                      {showRichEditor ? (
                        <div className="flex-1 min-w-0">
                          <ModeValueEditor
                            tokenType={tokenType}
                            value={modeVal === '' ? undefined : modeVal}
                            onChange={v => onModeValuesChange(updateNestedMode(modeValues, dim.id, option.name, v))}
                            allTokensFlat={allTokensFlat}
                            pathToSet={pathToSet}
                          />
                        </div>
                      ) : (
                        <div className="relative flex-1 min-w-0">
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
                            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/40"
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
                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
                            className="rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] transition-colors"
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
                            className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );

          if (!isCollapsible) {
            return <div key={dim.id} className="flex flex-col">{optionsContent}</div>;
          }

          return (
            <Collapsible
              key={dim.id}
              open={isOpen}
              onToggle={() => toggleDimCollapsed(dim.id)}
              label={
                <span className="inline-flex items-center gap-1.5">
                  {dim.name}
                  {dimOverrideCount > 0 && (
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                      {dimOverrideCount}
                    </span>
                  )}
                </span>
              }
            >
              {optionsContent}
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
