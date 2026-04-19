/**
 * UnifiedSourceInput — Replaces the old split source/inline layout
 * with a single "Base value" section.
 *
 * Two equal modes via segmented control:
 * - "Pick token" — Uses TokenPickerField to browse/search tokens
 * - "Enter value" — Uses the full value editors (ColorEditor, DimensionEditor)
 *
 * No "recommended"/"fallback" language. Both modes are first-class.
 */
import { useState, useMemo } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { TokenPickerField } from './TokenPicker';
import { ColorEditor } from './ValueEditors';
import { CompactDimensionInput } from './recipes/recipeShared';
import { swatchBgColor } from '../shared/colorUtils';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceMode = 'token' | 'value';

export interface UnifiedSourceInputProps {
  /** Which category the recipe expects: 'color' | 'dimension' | null. */
  expectedType: 'color' | 'dimension' | null;
  /** Currently bound source token path (or empty string / undefined). */
  sourceTokenPath: string | undefined;
  /** Resolved value of the source token (for display). */
  sourceTokenValue: unknown;
  /** Inline value when no source token is bound. */
  inlineValue: unknown;
  /** All tokens for the picker. */
  allTokensFlat?: Record<string, TokenMapEntry>;
  /** Maps token path → set name. */
  pathToCollectionId?: Record<string, string>;
  /** Called when the user picks or changes the source token path. */
  onSourcePathChange: (path: string) => void;
  /** Called when the user enters/changes an inline value. */
  onInlineValueChange: (v: unknown) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedSourceInput({
  expectedType,
  sourceTokenPath,
  sourceTokenValue: _sourceTokenValue,
  inlineValue,
  allTokensFlat,
  pathToCollectionId,
  onSourcePathChange,
  onInlineValueChange,
}: UnifiedSourceInputProps) {
  // Determine initial mode based on current state
  const [mode, setMode] = useState<SourceMode>(() =>
    sourceTokenPath ? 'token' : 'value',
  );

  // Resolve linked token display info
  const linkedEntry = sourceTokenPath && allTokensFlat
    ? allTokensFlat[sourceTokenPath]
    : undefined;

  const resolvedDisplay = useMemo(() => {
    if (!linkedEntry || !allTokensFlat) return undefined;
    let v = linkedEntry.$value;
    if (isAlias(v)) {
      const result = resolveTokenValue(v, linkedEntry.$type, allTokensFlat);
      if (result.value != null) v = result.value;
    }
    return v;
  }, [linkedEntry, allTokensFlat]);

  const filterType = expectedType === 'color'
    ? 'color'
    : expectedType === 'dimension'
      ? 'dimension'
      : undefined;

  return (
    <div className="border border-[var(--color-figma-border)] rounded-lg p-3 bg-[var(--color-figma-bg-secondary)]">
      {/* Header with segmented control */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-medium text-[var(--color-figma-text)]">
          Base value
        </span>

        <div className="flex rounded-md border border-[var(--color-figma-border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('token')}
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              mode === 'token'
                ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border-r border-[var(--color-figma-border)]'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] border-r border-[var(--color-figma-border)]'
            }`}
          >
            Pick token
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('value');
              // Clear the source token binding so inline value drives the preview
              if (sourceTokenPath) onSourcePathChange('');
              // Seed a default value so the recipe registers a value immediately
              if (inlineValue === undefined || inlineValue === '') {
                if (expectedType === 'color') onInlineValueChange('#ffffff');
                else if (expectedType === 'dimension') onInlineValueChange({ value: 16, unit: 'px' });
              }
            }}
            className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
              mode === 'value'
                ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            Enter value
          </button>
        </div>
      </div>

      {/* Token picker mode */}
      {mode === 'token' && allTokensFlat && (
        <div className="flex flex-col gap-2">
          <TokenPickerField
            value={sourceTokenPath || undefined}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            filterType={filterType}
            placeholder={
              filterType === 'color'
                ? 'Pick a color token…'
                : filterType === 'dimension'
                  ? 'Pick a dimension token…'
                  : 'Pick a token…'
            }
            onSelect={(path) => onSourcePathChange(path)}
            onClear={() => onSourcePathChange('')}
          />
          {/* Resolved value display */}
          {sourceTokenPath && resolvedDisplay != null && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
              {linkedEntry?.$type === 'color' && typeof resolvedDisplay === 'string' && (
                <div
                  className="w-4 h-4 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                  style={{ backgroundColor: swatchBgColor(resolvedDisplay) }}
                />
              )}
              <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                {typeof resolvedDisplay === 'object'
                  ? JSON.stringify(resolvedDisplay)
                  : String(resolvedDisplay)}
              </span>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto">
                resolved
              </span>
            </div>
          )}
        </div>
      )}

      {/* Direct value mode */}
      {mode === 'value' && (
        <div className="flex flex-col gap-2">
          {expectedType === 'color' && (
            <ColorEditor
              value={typeof inlineValue === 'string' ? inlineValue : '#ffffff'}
              onChange={(hex: string) => onInlineValueChange(hex)}
            />
          )}

          {expectedType === 'dimension' && (() => {
            const dimValue =
              typeof inlineValue === 'object' &&
              inlineValue !== null &&
              'value' in (inlineValue as Record<string, unknown>)
                ? (inlineValue as { value: number; unit?: string })
                : null;
            const currentUnit = dimValue?.unit ?? 'px';
            return (
              <CompactDimensionInput
                value={dimValue?.value}
                unit={currentUnit}
                placeholder="16"
                onValueChange={num => {
                  if (num === undefined) {
                    onInlineValueChange(undefined);
                    return;
                  }
                  onInlineValueChange({ value: num, unit: currentUnit });
                }}
                onUnitChange={u =>
                  onInlineValueChange({ value: dimValue?.value ?? 0, unit: u })
                }
              />
            );
          })()}

          {expectedType === null && (
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
              This outcome does not require a base value.
            </p>
          )}

          {/* Matching token suggestions */}
          {allTokensFlat && inlineValue != null && (
            <MatchingTokenSuggestions
              expectedType={expectedType}
              inlineValue={inlineValue}
              allTokensFlat={allTokensFlat}
              onBindToken={path => {
                onSourcePathChange(path);
                setMode('token');
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MatchingTokenSuggestions — Shows tokens with the same value
// ---------------------------------------------------------------------------

function MatchingTokenSuggestions({
  expectedType,
  inlineValue,
  allTokensFlat,
  onBindToken,
}: {
  expectedType: 'color' | 'dimension' | null;
  inlineValue: unknown;
  allTokensFlat: Record<string, TokenMapEntry>;
  onBindToken: (path: string) => void;
}) {
  const matches = useMemo(() => {
    if (expectedType === 'color' && typeof inlineValue === 'string') {
      const normHex = inlineValue.toLowerCase().slice(0, 7);
      if (!/^#[0-9a-f]{6}$/.test(normHex)) return [];
      return Object.entries(allTokensFlat)
        .filter(
          ([, e]) =>
            e.$type === 'color' &&
            typeof e.$value === 'string' &&
            (e.$value as string).toLowerCase().slice(0, 7) === normHex,
        )
        .slice(0, 5)
        .map(([path, e]) => ({ path, value: e.$value as string }));
    }
    if (
      expectedType === 'dimension' &&
      typeof inlineValue === 'object' &&
      inlineValue !== null &&
      'value' in (inlineValue as Record<string, unknown>)
    ) {
      const { value: numVal, unit } = inlineValue as {
        value: number;
        unit: string;
      };
      return Object.entries(allTokensFlat)
        .filter(([, e]) => {
          if (e.$type !== 'dimension') return false;
          const v = e.$value;
          if (typeof v === 'object' && v !== null && 'value' in (v as Record<string, unknown>)) {
            const dv = v as { value: number; unit?: string };
            return dv.value === numVal && (dv.unit ?? 'px') === unit;
          }
          return false;
        })
        .slice(0, 5)
        .map(([path, e]) => ({ path, value: String(e.$value) }));
    }
    return [];
  }, [expectedType, inlineValue, allTokensFlat]);

  if (matches.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-figma-border)] pt-2">
      <span className="text-[10px] text-[var(--color-figma-text-secondary)] block mb-1">
        Existing tokens with this value:
      </span>
      <div className="flex flex-col gap-0.5">
        {matches.map(({ path, value: tv }) => (
          <button
            key={path}
            onClick={() => onBindToken(path)}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--color-figma-accent)]/10 text-left group"
          >
            {expectedType === 'color' && typeof tv === 'string' && (
              <div
                className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                style={{ backgroundColor: swatchBgColor(tv) }}
              />
            )}
            <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-text)] truncate">
              {path}
            </span>
            <span className="text-[10px] text-[var(--color-figma-accent)] opacity-0 group-hover:opacity-100 shrink-0">
              Use token
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
