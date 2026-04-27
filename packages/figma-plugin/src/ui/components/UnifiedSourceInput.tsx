import { useEffect, useState, useMemo, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { TokenPickerField } from './TokenPicker';
import type { ScopedTokenCandidate } from '../shared/scopedTokenCandidates';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { buildScopedTokenCandidates } from '../shared/scopedTokenCandidates';
import { ColorEditor } from './ValueEditors';
import { CompactDimensionInput } from './generators/generatorShared';
import { swatchBgColor } from '../shared/colorUtils';
import { useTokenFlatMapContext } from '../contexts/TokenDataContext';
import { resolveGeneratedGroupSourceContext } from '../shared/generatedGroupUtils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import {
  normalizeDimensionTokenValue,
  parseDimensionTokenValue,
} from '../shared/tokenValueParsing';

export type SourceMode = 'token' | 'value';

export interface UnifiedSourceInputProps {
  expectedType: 'color' | 'dimension' | null;
  sourceTokenPath: string | undefined;
  sourceCollectionId?: string;
  sourceTokenValue: unknown;
  inlineValue: unknown;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  onSourcePathChange: (
    path: string,
    options?: { collectionId?: string },
  ) => void;
  onInlineValueChange: (v: unknown) => void;
}

function formatValuePreview(value: unknown, type?: string): string {
  return formatTokenValueForDisplay(type, value, { emptyPlaceholder: '' });
}

function tryNormalizeDimensionValue(
  value: unknown,
): { value: number; unit: string } | null {
  if (typeof value === 'string') {
    return parseDimensionTokenValue(value);
  }

  if (typeof value === 'number') {
    return { value, unit: 'px' };
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in (value as Record<string, unknown>)
  ) {
    return normalizeDimensionTokenValue(value);
  }

  return null;
}

export function UnifiedSourceInput({
  expectedType,
  sourceTokenPath,
  sourceCollectionId,
  sourceTokenValue: _sourceTokenValue,
  inlineValue,
  allTokensFlat,
  pathToCollectionId,
  collectionIdsByPath,
  onSourcePathChange,
  onInlineValueChange,
}: UnifiedSourceInputProps) {
  const { perCollectionFlat, collectionIdsByPath: contextCollectionIdsByPath } =
    useTokenFlatMapContext();
  const effectiveCollectionIdsByPath =
    collectionIdsByPath ?? contextCollectionIdsByPath;
  const [mode, setMode] = useState<SourceMode>(() =>
    sourceTokenPath ? 'token' : 'value',
  );

  const stashedSelectionRef = useRef<{
    path: string;
    collectionId?: string;
  } | null>(null);

  const linkedSource = useMemo(
    () =>
      resolveGeneratedGroupSourceContext({
        sourceTokenPath,
        sourceCollectionId,
        allTokensFlat,
        perCollectionFlat,
        pathToCollectionId,
        collectionIdsByPath: effectiveCollectionIdsByPath,
        fallbackValue: _sourceTokenValue,
      }),
    [
      _sourceTokenValue,
      allTokensFlat,
      effectiveCollectionIdsByPath,
      pathToCollectionId,
      perCollectionFlat,
      sourceCollectionId,
      sourceTokenPath,
    ],
  );
  const linkedEntry = linkedSource.entry;
  const resolvedDisplay = linkedEntry ? linkedSource.value : undefined;

  useEffect(() => {
    setMode(sourceTokenPath ? 'token' : 'value');
  }, [sourceTokenPath]);

  const filterType = expectedType === 'color'
    ? 'color'
    : expectedType === 'dimension'
      ? 'dimension'
      : undefined;

  const matchingSuggestions = useMemo(() => {
    if (!allTokensFlat) {
      return [];
    }

    const candidates = buildScopedTokenCandidates({
      allTokensFlat,
      pathToCollectionId,
      collectionIdsByPath: effectiveCollectionIdsByPath,
      perCollectionFlat,
    });

    if (expectedType === 'color' && typeof inlineValue === 'string') {
      const normalizedHex = inlineValue.toLowerCase().slice(0, 7);
      if (!/^#[0-9a-f]{6}$/.test(normalizedHex)) return [];
      return candidates
        .filter(
          (candidate) =>
            candidate.entry.$type === 'color' &&
            typeof candidate.resolvedEntry.$value === 'string' &&
            candidate.resolvedEntry.$value.toLowerCase().slice(0, 7) ===
              normalizedHex,
        )
        .slice(0, 5)
        .map((candidate) => ({
          key: candidate.key,
          path: candidate.path,
          collectionId: candidate.collectionId,
          value: candidate.resolvedEntry.$value as string,
          isAmbiguousPath: candidate.isAmbiguousPath,
        }));
    }

    if (expectedType === 'dimension') {
      const inlineDimension = tryNormalizeDimensionValue(inlineValue);
      if (!inlineDimension) {
        return [];
      }

      return candidates
        .filter((candidate) => {
          if (candidate.entry.$type !== 'dimension') return false;
          const dimensionValue = tryNormalizeDimensionValue(
            candidate.resolvedEntry.$value,
          );
          if (!dimensionValue) return false;
          return (
            dimensionValue.value === inlineDimension.value &&
            dimensionValue.unit === inlineDimension.unit
          );
        })
        .slice(0, 5)
        .map((candidate) => ({
          key: candidate.key,
          path: candidate.path,
          collectionId: candidate.collectionId,
          value: formatValuePreview(candidate.resolvedEntry.$value, 'dimension'),
          isAmbiguousPath: candidate.isAmbiguousPath,
        }));
    }

    return [];
  }, [allTokensFlat, expectedType, inlineValue, pathToCollectionId, effectiveCollectionIdsByPath, perCollectionFlat]);

  return (
    <div className="flex flex-col gap-2.5">
      <SegmentedControl
        options={[
          { value: 'token' as SourceMode, label: 'Pick token' },
          { value: 'value' as SourceMode, label: 'Enter value' },
        ]}
        value={mode}
        ariaLabel="Source input mode"
        onChange={(newMode) => {
          if (newMode === 'token' && mode !== 'token') {
            if (stashedSelectionRef.current) {
              onSourcePathChange(stashedSelectionRef.current.path, {
                collectionId: stashedSelectionRef.current.collectionId,
              });
              stashedSelectionRef.current = null;
            }
          } else if (newMode === 'value' && mode !== 'value') {
            if (sourceTokenPath) {
              stashedSelectionRef.current = {
                path: sourceTokenPath,
                collectionId: sourceCollectionId,
              };
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
            selectedCollectionId={sourceCollectionId}
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
            onSelect={(
              path,
              _resolvedValue,
              _entry,
              selection?: ScopedTokenCandidate,
            ) =>
              onSourcePathChange(path, {
                collectionId: selection?.collectionId,
              })}
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
              <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)]">
                {formatValuePreview(resolvedDisplay, linkedEntry?.$type)}
              </span>
            </div>
          )}
          {sourceTokenPath && linkedSource.isAmbiguous && (
            <p className="text-body text-[var(--color-figma-warning)]">
              This source path exists in multiple collections. Pick the source token again to bind it to one collection explicitly.
            </p>
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
            const dimValue = tryNormalizeDimensionValue(inlineValue);
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
            <p className="text-body text-[var(--color-figma-text-secondary)]">
              This outcome does not require a source value.
            </p>
          )}

          {allTokensFlat && inlineValue != null && (
            <MatchingTokenSuggestions
              expectedType={expectedType}
              matches={matchingSuggestions}
              onBindToken={(selection) => {
                onSourcePathChange(selection.path, {
                  collectionId: selection.collectionId,
                });
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
  matches,
  onBindToken,
}: {
  expectedType: 'color' | 'dimension' | null;
  matches: Array<{
    key: string;
    path: string;
    collectionId?: string;
    value: string;
    isAmbiguousPath: boolean;
  }>;
  onBindToken: (selection: { path: string; collectionId?: string }) => void;
}) {
  if (matches.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-figma-border)] pt-2">
      <span className="text-secondary text-[var(--color-figma-text-secondary)] block mb-1">
        Existing tokens with this value:
      </span>
      <div className="flex flex-col gap-0.5">
        {matches.map(({ key, path, collectionId, value: tv, isAmbiguousPath }) => (
          <button
            key={key}
            onClick={() => onBindToken({ path, collectionId })}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--color-figma-accent)]/10 text-left group"
          >
            {expectedType === 'color' && typeof tv === 'string' && (
              <div
                className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                style={{ backgroundColor: swatchBgColor(tv) }}
              />
            )}
            <span className="flex-1 text-secondary font-mono text-[var(--color-figma-text)] truncate">
              {path}
            </span>
            {isAmbiguousPath && collectionId && (
              <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">
                {collectionId}
              </span>
            )}
            <span className="text-secondary text-[var(--color-figma-accent)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0">
              Use token
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
