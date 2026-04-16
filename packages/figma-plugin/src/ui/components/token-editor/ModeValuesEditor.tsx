import { useState, useCallback } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../../shared/types';
import { apiFetch } from '../../shared/apiFetch';
import { AliasAutocomplete } from '../AliasAutocomplete';
import { Collapsible } from '../Collapsible';
import { ModeValueEditor } from './ModeValueEditor';
import { summarizeModeCoverage } from './modeCoverage';

// Token types that have a compact inline editor
const RICH_EDITOR_TYPES = new Set(['color', 'dimension', 'number', 'boolean', 'duration']);

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

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
  serverUrl?: string;
  onDimensionCreated?: () => void;
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
  serverUrl,
  onDimensionCreated,
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

  const coverage = summarizeModeCoverage(dimensions, modeValues);
  const hasTokens = Object.keys(allTokensFlat).length > 0;
  const useRichEditor = RICH_EDITOR_TYPES.has(tokenType);

  const [inlineCreating, setInlineCreating] = useState(false);
  const [inlineDimName, setInlineDimName] = useState('');
  const [inlineOptions, setInlineOptions] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);

  const handleInlineCreate = useCallback(async () => {
    if (!serverUrl) return;
    const name = inlineDimName.trim();
    if (!name) { setInlineError('Name is required'); return; }
    const id = slugify(name);
    if (!id) { setInlineError('Name must contain at least one letter or number'); return; }
    const optionNames = inlineOptions
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (optionNames.length < 2) { setInlineError('Enter at least two options (comma-separated)'); return; }
    setInlineSaving(true);
    setInlineError(null);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      for (const optName of optionNames) {
        await apiFetch(
          `${serverUrl}/api/themes/dimensions/${encodeURIComponent(id)}/options`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: optName }),
          },
        );
      }
      setInlineCreating(false);
      setInlineDimName('');
      setInlineOptions('');
      onDimensionCreated?.();
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to create axis');
    } finally {
      setInlineSaving(false);
    }
  }, [serverUrl, inlineDimName, inlineOptions, onDimensionCreated]);

  if (dimensions.length === 0) {
    if (inlineCreating && serverUrl) {
      return (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-[var(--color-figma-border)] px-2.5 py-2">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Create a mode axis
          </p>
          <input
            type="text"
            value={inlineDimName}
            onChange={e => { setInlineDimName(e.target.value); setInlineError(null); }}
            placeholder="Axis name, e.g. Color mode"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]/40"
            autoFocus
          />
          <input
            type="text"
            value={inlineOptions}
            onChange={e => { setInlineOptions(e.target.value); setInlineError(null); }}
            placeholder="Options, e.g. Light, Dark"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]/40"
            onKeyDown={e => { if (e.key === 'Enter') void handleInlineCreate(); }}
          />
          {inlineError && (
            <p className="text-[10px] text-[var(--color-figma-error)]">{inlineError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setInlineCreating(false); setInlineError(null); }}
              className="rounded px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleInlineCreate()}
              disabled={inlineSaving}
              className="rounded bg-[var(--color-figma-accent)] px-3 py-1 text-[10px] font-medium text-white disabled:opacity-40"
            >
              {inlineSaving ? 'Creating\u2026' : 'Create'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/35 px-2.5 py-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Mode values
          </p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            No mode axes yet. Define axes to author token variations here.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {serverUrl && (
            <button
              type="button"
              onClick={() => setInlineCreating(true)}
              className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
            >
              Create axis
            </button>
          )}
          {onNavigateToThemes && (
            <button
              type="button"
              onClick={onNavigateToThemes}
              className="shrink-0 text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:underline"
            >
              Modes workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Mode values
          </p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Author token variations inline, one mode at a time.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
          <span>
            {coverage.filledCount}/{coverage.optionCount} filled
          </span>
          {coverage.missingCount > 0 && (
            <span>{coverage.missingCount} missing</span>
          )}
        </div>
      </div>
      {coverage.missingCount > 0 && (
        <div className="rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2 py-1 text-[10px] text-[var(--color-figma-text)]">
          {coverage.missingCount} mode value{coverage.missingCount === 1 ? "" : "s"} still need authoring.
        </div>
      )}
      {coverage.unconfiguredDimensionCount > 0 && (
        <div className="rounded border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/35 px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)]">
          {coverage.unconfiguredDimensionCount} mode axis{coverage.unconfiguredDimensionCount === 1 ? "" : "es"} still need options.
        </div>
      )}
      <div className="flex flex-col gap-2">
        {coverage.dimensions.map(dim => {
          const hasPartialCoverage = dim.filledCount > 0 && dim.missingCount > 0;
          const hasOptions = dim.optionCount > 0;
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
            return (
              <div key={dim.id} className="flex flex-col gap-1">
                {hasPartialCoverage ? (
                  <div className="rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2 py-1 text-[10px] text-[var(--color-figma-warning)]">
                    {dim.missingCount} mode value{dim.missingCount === 1 ? "" : "s"} still missing in {dim.name}.
                  </div>
                ) : null}
                {!hasOptions ? (
                  <div className="rounded border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/35 px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    {dim.name} has no mode options yet.
                  </div>
                ) : null}
                {optionsContent}
              </div>
            );
          }

          return (
            <Collapsible
              key={dim.id}
              open={isOpen}
              onToggle={() => toggleDimCollapsed(dim.id)}
              label={
                <span className="inline-flex items-center gap-1.5">
                  {dim.name}
                  {hasOptions && (
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                      {dim.filledCount}/{dim.optionCount} filled
                    </span>
                  )}
                  {hasOptions && dim.missingCount > 0 && (
                    <span className="text-[9px] text-[var(--color-figma-warning)]">
                      {dim.missingCount} missing
                    </span>
                  )}
                  {!hasOptions && (
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                      No options
                    </span>
                  )}
                </span>
              }
            >
              <div className="flex flex-col gap-1">
                {hasPartialCoverage ? (
                  <div className="rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2 py-1 text-[10px] text-[var(--color-figma-warning)]">
                    {dim.missingCount} mode value{dim.missingCount === 1 ? "" : "s"} still missing in {dim.name}.
                  </div>
                ) : null}
                {!hasOptions ? (
                  <div className="rounded border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/35 px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    {dim.name} has no mode options yet.
                  </div>
                ) : null}
                {optionsContent}
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
