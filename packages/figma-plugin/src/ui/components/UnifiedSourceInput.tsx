import { useState, useMemo, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { TokenPickerField } from './TokenPicker';
import { ColorEditor } from './ValueEditors';
import { CompactDimensionInput } from './generators/generatorShared';
import { swatchBgColor } from '../shared/colorUtils';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { SegmentedControl } from './SegmentedControl';

export type SourceMode = 'token' | 'value';

export interface UnifiedSourceInputProps {
  expectedType: 'color' | 'dimension' | null;
  sourceTokenPath: string | undefined;
  sourceTokenValue: unknown;
  inlineValue: unknown;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  onSourcePathChange: (path: string) => void;
  onInlineValueChange: (v: unknown) => void;
}

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
  const [mode, setMode] = useState<SourceMode>(() =>
    sourceTokenPath ? 'token' : 'value',
  );

  const stashedTokenPathRef = useRef<string>('');

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
    <div className="flex flex-col gap-2.5">
      <SegmentedControl
        options={[
          { value: 'token' as SourceMode, label: 'Pick token' },
          { value: 'value' as SourceMode, label: 'Enter value' },
        ]}
        value={mode}
        onChange={(newMode) => {
          if (newMode === 'token' && mode !== 'token') {
            if (stashedTokenPathRef.current) {
              onSourcePathChange(stashedTokenPathRef.current);
              stashedTokenPathRef.current = '';
            }
          } else if (newMode === 'value' && mode !== 'value') {
            if (sourceTokenPath) {
              stashedTokenPathRef.current = sourceTokenPath;
              onSourcePathChange('');
            }
            if (inlineValue === undefined || inlineValue === '') {
              if (expectedType === 'color') onInlineValueChange('#ffffff');
              else if (expectedType === 'dimension') onInlineValueChange({ value: 16, unit: 'px' });
            }
          }
          setMode(newMode);
        }}
      />

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
          {sourceTokenPath && resolvedDisplay != null && (
            <div className="flex items-center gap-1.5">
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
            </div>
          )}
        </div>
      )}

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
