/**
 * Step 2 — What: The creative workspace for configuring a generator.
 * Two-column layout: type + config (left), live preview (right).
 */
import { useMemo, useRef, useState } from 'react';
import type {
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleConfig,
  CustomScaleConfig,
  ContrastCheckConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
} from '../../hooks/useGenerators';
import type { TokenMapEntry } from '../../../shared/types';
import type { OverwrittenEntry } from '../../hooks/useGeneratorPreview';

import { ColorRampConfigEditor, ColorSwatchPreview } from '../generators/ColorRampGenerator';
import { TypeScaleConfigEditor, TypeScalePreview } from '../generators/TypeScaleGenerator';
import { SpacingScaleConfigEditor, SpacingPreview } from '../generators/SpacingScaleGenerator';
import { OpacityScaleConfigEditor, OpacityPreview } from '../generators/OpacityScaleGenerator';
import { ShadowScaleConfigEditor, ShadowPreview } from '../generators/ShadowScaleGenerator';
import { BorderRadiusConfigEditor, BorderRadiusPreview } from '../generators/BorderRadiusGenerator';
import { ZIndexConfigEditor } from '../generators/ZIndexGenerator';
import { CustomScaleConfigEditor } from '../generators/CustomScaleGenerator';
import { ContrastCheckConfigEditor, ContrastCheckPreview } from '../generators/ContrastCheckGenerator';
import { AccessiblePairConfigEditor } from '../generators/AccessiblePairGenerator';
import { DarkModeInversionConfigEditor } from '../generators/DarkModeInversionGenerator';
import { GenericPreview, CompactColorInput, CompactDimensionInput } from '../generators/generatorShared';
import { AppliedPreview } from '../generators/AppliedPreview';
import { TYPE_LABELS, TYPE_DESCRIPTIONS, PRIMARY_TYPES, ADVANCED_TYPES } from '../generators/generatorUtils';
import { TypeThumbnail } from '../generators/TypeThumbnail';
import { AliasAutocomplete } from '../AliasAutocomplete';
import { Spinner } from '../Spinner';
import { ValueDiff } from '../ValueDiff';
import { swatchBgColor } from '../../shared/colorUtils';
import { Collapsible } from '../Collapsible';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepWhatProps {
  // Generator state
  selectedType: GeneratorType;
  recommendedType: GeneratorType | undefined;
  currentConfig: GeneratorConfig;
  typeNeedsValue: boolean;
  hasSource: boolean;
  hasValue: boolean;
  isMultiBrand: boolean;
  // Source binding
  editableSourcePath: string;
  sourceTokenPath?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  inlineValue: unknown;
  // Preview
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  previewBrand: string | undefined;
  multiBrandPreviews?: Map<string, GeneratedTokenResult[]>;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  lockedCount: number;
  overwrittenEntries: OverwrittenEntry[];
  // Token data
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  // Config undo
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Handlers
  onTypeChange: (type: GeneratorType) => void;
  onConfigChange: (type: GeneratorType, cfg: GeneratorConfig) => void;
  onSourcePathChange: (v: string) => void;
  onInlineValueChange: (v: unknown) => void;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  onClearAllOverrides: () => void;
}

// ---------------------------------------------------------------------------
// Type card component (Phase 1B: intent-based visual cards)
// ---------------------------------------------------------------------------

function TypeCard({
  type,
  isSelected,
  isRecommended,
  onSelect,
}: {
  type: GeneratorType;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-2.5 rounded-lg border transition-all group relative ${
        isSelected
          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/8 ring-1 ring-[var(--color-figma-accent)]/20'
          : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-bg-hover)]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Thumbnail */}
        <div className={`flex-none w-8 h-8 rounded flex items-center justify-center ${
          isSelected ? 'bg-[var(--color-figma-accent)]/15' : 'bg-[var(--color-figma-bg-secondary)]'
        }`}>
          <TypeThumbnail type={type} size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold ${
              isSelected ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'
            }`}>
              {TYPE_LABELS[type]}
            </span>
            {isRecommended && (
              <span className="text-[7px] px-1 py-0.5 rounded-full bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-bold uppercase tracking-wider">
                Recommended
              </span>
            )}
          </div>
          <p className="text-[9px] text-[var(--color-figma-text-secondary)] leading-snug mt-0.5">
            {TYPE_DESCRIPTIONS[type]}
          </p>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// StepWhat
// ---------------------------------------------------------------------------

export function StepWhat({
  selectedType,
  recommendedType,
  currentConfig,
  typeNeedsValue,
  hasSource,
  hasValue,
  isMultiBrand,
  editableSourcePath,
  sourceTokenPath,
  sourceTokenType,
  sourceTokenValue,
  inlineValue,
  previewTokens,
  previewLoading,
  previewError,
  previewBrand,
  multiBrandPreviews,
  pendingOverrides,
  lockedCount,
  overwrittenEntries,
  allTokensFlat,
  pathToSet,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTypeChange,
  onConfigChange,
  onSourcePathChange,
  onInlineValueChange,
  onOverrideChange,
  onOverrideClear,
  onClearAllOverrides,
}: StepWhatProps) {

  const [showSourceAutocomplete, setShowSourceAutocomplete] = useState(false);
  const sourcePathInputRef = useRef<HTMLInputElement>(null);

  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map(e => e.path)),
    [overwrittenEntries],
  );

  // Effective source value for config editors
  const effectiveSourceHex = typeof sourceTokenValue === 'string' ? sourceTokenValue : typeof inlineValue === 'string' ? inlineValue : undefined;
  const effectiveSourceDim = (() => {
    if (typeof sourceTokenValue === 'object' && sourceTokenValue !== null && 'value' in sourceTokenValue) return Number(sourceTokenValue.value);
    if (typeof sourceTokenValue === 'number') return sourceTokenValue;
    if (typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)) return Number((inlineValue as { value: number }).value);
    return undefined;
  })();

  const typeExpectsColor = selectedType === 'colorRamp' || selectedType === 'accessibleColorPair' || selectedType === 'darkModeInversion';
  const typeExpectsDimension = selectedType === 'typeScale' || selectedType === 'spacingScale' || selectedType === 'borderRadiusScale';

  const sourcePreviewAvailable = Boolean(sourceTokenPath && editableSourcePath === sourceTokenPath && sourceTokenValue != null);
  const sourcePreviewIsColor = sourcePreviewAvailable && (sourceTokenType === 'color') && typeof effectiveSourceHex === 'string';
  const sourcePreviewIsDimension = sourcePreviewAvailable && (sourceTokenType === 'dimension' || sourceTokenType === 'fontSize') && effectiveSourceDim !== undefined;
  const sourceDimUnit = typeof sourceTokenValue === 'object' && sourceTokenValue !== null && 'unit' in sourceTokenValue
    ? String((sourceTokenValue as { unit: string }).unit)
    : 'px';

  // Matching tokens for inline value
  const matchingTokens = useMemo(() => {
    if (!allTokensFlat || !inlineValue) return [] as Array<{ path: string; value: string }>;
    if (typeExpectsColor && typeof inlineValue === 'string') {
      const normHex = inlineValue.toLowerCase().slice(0, 7);
      if (!/^#[0-9a-f]{6}$/.test(normHex)) return [] as Array<{ path: string; value: string }>;
      return Object.entries(allTokensFlat)
        .filter(([, e]) => e.$type === 'color' && typeof e.$value === 'string' && (e.$value as string).toLowerCase().slice(0, 7) === normHex)
        .slice(0, 5)
        .map(([path, e]) => ({ path, value: e.$value as string }));
    }
    if (typeExpectsDimension && typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)) {
      const { value: numVal, unit } = inlineValue as { value: number; unit: string };
      return Object.entries(allTokensFlat)
        .filter(([, e]) => {
          if (e.$type !== 'dimension') return false;
          const v = e.$value;
          if (typeof v === 'string') {
            const m = (v as string).match(/^([0-9.]+)(px|rem|em|%)?$/);
            if (m) return parseFloat(m[1]) === numVal && (m[2] ?? 'px') === unit;
          }
          if (typeof v === 'object' && v !== null && 'value' in (v as Record<string, unknown>)) {
            const dv = v as { value: number; unit?: string };
            return dv.value === numVal && (dv.unit ?? 'px') === unit;
          }
          return false;
        })
        .slice(0, 5)
        .map(([path, e]) => ({ path, value: String(e.$value) }));
    }
    return [] as Array<{ path: string; value: string }>;
  }, [allTokensFlat, inlineValue, typeExpectsColor, typeExpectsDimension]);

  const [showAdvancedTypes, setShowAdvancedTypes] = useState(() => ADVANCED_TYPES.includes(selectedType));

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="gen-dialog-grid gap-4">

        {/* ---- LEFT: Config column ---- */}
        <div className="gen-dialog-config">

          {/* Type selector — visual cards */}
          <div>
            <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-2">
              Generator type
              {recommendedType && selectedType !== recommendedType && (
                <button
                  type="button"
                  onClick={() => onTypeChange(recommendedType)}
                  className="ml-1.5 text-[var(--color-figma-accent)] hover:underline font-normal"
                >
                  Use recommended
                </button>
              )}
            </label>
            <div className="flex flex-col gap-1.5">
              {PRIMARY_TYPES.map(type => (
                <TypeCard
                  key={type}
                  type={type}
                  isSelected={selectedType === type}
                  isRecommended={type === recommendedType}
                  onSelect={() => onTypeChange(type)}
                />
              ))}
            </div>
            <Collapsible
              open={showAdvancedTypes}
              onToggle={() => setShowAdvancedTypes(v => !v)}
              className="mt-2"
              label="Advanced generators"
            >
              <div className="flex flex-col gap-1.5 mt-1.5">
                {ADVANCED_TYPES.map(type => (
                  <TypeCard
                    key={type}
                    type={type}
                    isSelected={selectedType === type}
                    isRecommended={type === recommendedType}
                    onSelect={() => onTypeChange(type)}
                  />
                ))}
              </div>
            </Collapsible>
          </div>

          {/* Source token binding */}
          {typeNeedsValue && (
            <div className="border border-[var(--color-figma-accent)]/40 rounded-lg p-3 bg-[var(--color-figma-bg-secondary)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Source token</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium">Recommended</span>
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={sourcePathInputRef}
                    type="text"
                    value={editableSourcePath}
                    onChange={e => {
                      onSourcePathChange(e.target.value);
                      setShowSourceAutocomplete(true);
                    }}
                    onFocus={() => setShowSourceAutocomplete(true)}
                    onBlur={() => setTimeout(() => setShowSourceAutocomplete(false), 150)}
                    placeholder={allTokensFlat ? 'Search or type a token path...' : 'e.g. colors.brand.primary'}
                    className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                  />
                  {editableSourcePath && (
                    <button
                      onClick={() => { onSourcePathChange(''); setShowSourceAutocomplete(false); }}
                      aria-label="Clear source token"
                      className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                {showSourceAutocomplete && allTokensFlat && (
                  <AliasAutocomplete
                    query={editableSourcePath}
                    allTokensFlat={allTokensFlat}
                    pathToSet={pathToSet}
                    filterType={typeExpectsColor ? 'color' : typeExpectsDimension ? 'dimension' : undefined}
                    onSelect={path => {
                      onSourcePathChange(path);
                      setShowSourceAutocomplete(false);
                    }}
                    onClose={() => setShowSourceAutocomplete(false)}
                  />
                )}
              </div>
              {/* Resolved value */}
              {editableSourcePath && sourcePreviewAvailable && (sourcePreviewIsColor || sourcePreviewIsDimension) && (
                <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
                  {sourcePreviewIsColor && effectiveSourceHex && (
                    <div
                      className="w-4 h-4 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                      style={{ backgroundColor: swatchBgColor(effectiveSourceHex) }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                    {sourcePreviewIsColor && effectiveSourceHex
                      ? effectiveSourceHex
                      : sourcePreviewIsDimension && effectiveSourceDim !== undefined
                        ? `${effectiveSourceDim}${sourceDimUnit}`
                        : null}
                  </span>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] ml-auto">resolved</span>
                </div>
              )}
              <span className="text-[9px] text-[var(--color-figma-text-secondary)] mt-1 block">
                {editableSourcePath
                  ? isMultiBrand
                    ? 'Bound — used as a preview reference. Each brand\'s value comes from the table in Step 1.'
                    : 'Bound to a token — changes to the source token automatically update the generator.'
                  : isMultiBrand
                    ? 'Optional in multi-brand mode — bind to a token for preview sampling.'
                    : 'Bind to a token so the generator stays connected to your token graph.'}
              </span>
            </div>
          )}

          {/* Inline base value — when no source token bound */}
          {!hasSource && typeNeedsValue && (
            <div className="border border-dashed border-[var(--color-figma-border)] rounded-lg p-3 bg-[var(--color-figma-bg-secondary)] opacity-90">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Manual base value</span>
                <span className="text-[9px] text-[var(--color-figma-text-secondary)]">fallback</span>
              </div>
              {typeExpectsColor && (
                <CompactColorInput
                  value={typeof inlineValue === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(inlineValue) ? inlineValue : '#808080'}
                  onChange={hex => onInlineValueChange(hex)}
                  aria-label="Base color"
                />
              )}
              {typeExpectsDimension && (() => {
                const dimValue = typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)
                  ? (inlineValue as { value: number; unit?: string })
                  : null;
                const currentUnit = dimValue?.unit ?? 'px';
                return (
                  <CompactDimensionInput
                    value={dimValue?.value}
                    unit={currentUnit}
                    placeholder={selectedType === 'typeScale' ? '16' : selectedType === 'spacingScale' ? '4' : '8'}
                    onValueChange={num => {
                      if (num === undefined) { onInlineValueChange(undefined); return; }
                      onInlineValueChange({ value: num, unit: currentUnit });
                    }}
                    onUnitChange={u => onInlineValueChange({ value: dimValue?.value ?? 0, unit: u })}
                  />
                );
              })()}
              {/* Matching token suggestions */}
              {matchingTokens.length > 0 && (
                <div className="mt-2 border-t border-[var(--color-figma-border)] pt-2">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] block mb-1">
                    Tokens with this value — bind one to connect to the token graph:
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {matchingTokens.map(({ path, value: tv }) => (
                      <button
                        key={path}
                        onClick={() => onSourcePathChange(path)}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--color-figma-accent)]/10 text-left group"
                      >
                        {typeExpectsColor && typeof tv === 'string' && (
                          <div
                            className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                            style={{ backgroundColor: swatchBgColor(tv) }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-text)] truncate">{path}</span>
                        <span className="text-[9px] text-[var(--color-figma-accent)] opacity-0 group-hover:opacity-100 shrink-0">Use token</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-[9px] text-[var(--color-figma-text-secondary)]">
                This value is stored inline and is not referenceable as a token. Binding a source token above is preferred.
              </p>
            </div>
          )}

          {/* Config editor */}
          <div className="border border-[var(--color-figma-border)] rounded-lg p-3 bg-[var(--color-figma-bg-secondary)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{TYPE_LABELS[selectedType]} settings</span>
              {(canUndo || canRedo) && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Undo config change"
                    aria-label="Undo"
                    className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-20 transition-opacity"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5h5a2.5 2.5 0 0 1 0 5H6" /><path d="M5 2.5L3 4.5 5 6.5" /></svg>
                  </button>
                  <button
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Redo config change"
                    aria-label="Redo"
                    className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-20 transition-opacity"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4.5H4a2.5 2.5 0 0 0 0 5h2" /><path d="M7 2.5l2 2-2 2" /></svg>
                  </button>
                </div>
              )}
            </div>
            {selectedType === 'colorRamp' && <ColorRampConfigEditor config={currentConfig as ColorRampConfig} onChange={cfg => onConfigChange('colorRamp', cfg)} sourceHex={effectiveSourceHex} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'typeScale' && <TypeScaleConfigEditor config={currentConfig as TypeScaleConfig} onChange={cfg => onConfigChange('typeScale', cfg)} sourceValue={effectiveSourceDim} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'spacingScale' && <SpacingScaleConfigEditor config={currentConfig as SpacingScaleConfig} onChange={cfg => onConfigChange('spacingScale', cfg)} />}
            {selectedType === 'opacityScale' && <OpacityScaleConfigEditor config={currentConfig as OpacityScaleConfig} onChange={cfg => onConfigChange('opacityScale', cfg)} />}
            {selectedType === 'shadowScale' && <ShadowScaleConfigEditor config={currentConfig as ShadowScaleConfig} onChange={cfg => onConfigChange('shadowScale', cfg)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'borderRadiusScale' && <BorderRadiusConfigEditor config={currentConfig as BorderRadiusScaleConfig} onChange={cfg => onConfigChange('borderRadiusScale', cfg)} />}
            {selectedType === 'zIndexScale' && <ZIndexConfigEditor config={currentConfig as ZIndexScaleConfig} onChange={cfg => onConfigChange('zIndexScale', cfg)} />}
            {selectedType === 'customScale' && <CustomScaleConfigEditor config={currentConfig as CustomScaleConfig} onChange={cfg => onConfigChange('customScale', cfg)} />}
            {selectedType === 'contrastCheck' && <ContrastCheckConfigEditor config={currentConfig as ContrastCheckConfig} onChange={cfg => onConfigChange('contrastCheck', cfg)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'accessibleColorPair' && <AccessiblePairConfigEditor config={currentConfig as AccessibleColorPairConfig} onChange={cfg => onConfigChange('accessibleColorPair', cfg)} />}
            {selectedType === 'darkModeInversion' && <DarkModeInversionConfigEditor config={currentConfig as DarkModeInversionConfig} onChange={cfg => onConfigChange('darkModeInversion', cfg)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
          </div>

        </div>

        {/* ---- RIGHT: Preview column (sticky at wide viewports) ---- */}
        <div className="gen-dialog-preview flex flex-col gap-4">

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Preview
                {isMultiBrand && multiBrandPreviews && multiBrandPreviews.size > 0
                  ? <span className="ml-1 text-[var(--color-figma-text)]">({multiBrandPreviews.size} brand{multiBrandPreviews.size !== 1 ? 's' : ''})</span>
                  : previewTokens.length > 0 && <span className="ml-1 text-[var(--color-figma-text)]">({previewTokens.length} tokens)</span>
                }
                {!multiBrandPreviews?.size && previewBrand && previewTokens.length > 0 && (
                  <span className="ml-1 italic">— sample from &ldquo;{previewBrand}&rdquo;</span>
                )}
              </label>
              <div className="flex items-center gap-2">
                {lockedCount > 0 && (
                  <button onClick={onClearAllOverrides} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L6 7M6 3l4 4"/><path d="M2 7h4v3H2z"/></svg>
                    Clear {lockedCount} override{lockedCount !== 1 ? 's' : ''}
                  </button>
                )}
                {previewLoading && (
                  <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
                )}
              </div>
            </div>

            {previewError && (
              <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-1.5">{previewError}</div>
            )}

            {/* Multi-brand stacked previews */}
            {!previewError && isMultiBrand && multiBrandPreviews && multiBrandPreviews.size > 0 && (
              <div className={`flex flex-col gap-2 transition-opacity duration-150 ${previewLoading ? 'opacity-40' : 'opacity-100'}`}>
                {Array.from(multiBrandPreviews.entries()).map(([brand, tokens]) => (
                  <div key={brand} className="border border-[var(--color-figma-border)] rounded-lg bg-[var(--color-figma-bg-secondary)]">
                    <div className="px-2.5 pt-2 pb-1">
                      <span className="text-[9px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wider">{brand}</span>
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)] ml-1.5">({tokens.length} tokens)</span>
                    </div>
                    <div className="px-2.5 pb-2.5">
                      {tokens.length > 0 ? (
                        <>
                          {selectedType === 'contrastCheck' && <ContrastCheckPreview tokens={tokens} config={currentConfig as ContrastCheckConfig} />}
                          {selectedType === 'colorRamp' && <ColorSwatchPreview tokens={tokens} overrides={{}} onOverrideChange={() => {}} onOverrideClear={() => {}} />}
                          {selectedType === 'typeScale' && <TypeScalePreview tokens={tokens} overrides={{}} onOverrideChange={() => {}} onOverrideClear={() => {}} />}
                          {selectedType === 'spacingScale' && <SpacingPreview tokens={tokens} overrides={{}} onOverrideChange={() => {}} onOverrideClear={() => {}} />}
                          {selectedType === 'borderRadiusScale' && <BorderRadiusPreview tokens={tokens} overrides={{}} onOverrideChange={() => {}} onOverrideClear={() => {}} />}
                          {selectedType === 'opacityScale' && <OpacityPreview tokens={tokens} overrides={{}} onOverrideChange={() => {}} onOverrideClear={() => {}} />}
                          {selectedType === 'shadowScale' && <ShadowPreview tokens={tokens} config={currentConfig as ShadowScaleConfig} overrides={{}} onOverrideChange={() => {}} onOverrideClear={() => {}} />}
                          {(selectedType === 'zIndexScale' || selectedType === 'customScale') && <GenericPreview tokens={tokens} overrides={{}} onOverrideChange={() => {}} onOverrideClear={() => {}} />}
                        </>
                      ) : (
                        <span className="text-[9px] text-[var(--color-figma-text-secondary)]">No preview tokens</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Single-brand preview (non-multi-brand, or multi-brand without multiBrandPreviews data) */}
            {!previewError && !(isMultiBrand && multiBrandPreviews && multiBrandPreviews.size > 0) && previewTokens.length > 0 && (
              <div className={`border border-[var(--color-figma-border)] rounded-lg p-2.5 bg-[var(--color-figma-bg-secondary)] transition-opacity duration-150 ${previewLoading ? 'opacity-40' : 'opacity-100'}`}>
                {selectedType === 'contrastCheck' && (
                  <ContrastCheckPreview tokens={previewTokens} config={currentConfig as ContrastCheckConfig} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'colorRamp' && (
                  <ColorSwatchPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'typeScale' && (
                  <TypeScalePreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'spacingScale' && (
                  <SpacingPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'borderRadiusScale' && (
                  <BorderRadiusPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'opacityScale' && (
                  <OpacityPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'shadowScale' && (
                  <ShadowPreview tokens={previewTokens} config={currentConfig as ShadowScaleConfig} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
                {(selectedType === 'zIndexScale' || selectedType === 'customScale') && (
                  <GenericPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
                )}
              </div>
            )}

            {selectedType === 'contrastCheck' && !previewError && !previewLoading && previewTokens.length === 0 && !(isMultiBrand && multiBrandPreviews && multiBrandPreviews.size > 0) && (
              <div className="border border-[var(--color-figma-border)] rounded-lg p-2.5 bg-[var(--color-figma-bg-secondary)]">
                <ContrastCheckPreview tokens={[]} config={currentConfig as ContrastCheckConfig} />
              </div>
            )}

            {selectedType !== 'contrastCheck' && !previewError && !previewLoading && previewTokens.length === 0 && !(isMultiBrand && multiBrandPreviews && multiBrandPreviews.size > 0) && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] rounded-lg px-2 py-2 bg-[var(--color-figma-bg-secondary)]">
                {isMultiBrand
                  ? 'Add a brand row with an input value to see a preview.'
                  : typeNeedsValue && !hasValue
                    ? `Enter a base ${typeExpectsColor ? 'color' : 'value'} above to see a preview.`
                    : 'No preview available.'}
              </div>
            )}
          </div>

          {/* Applied preview — shows tokens in context */}
          {!previewError && previewTokens.length > 0 && (
            <AppliedPreview type={selectedType} tokens={previewTokens} />
          )}

          {/* Overwrites diff */}
          {overwrittenEntries.length > 0 && (
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">
                Overwrites{' '}
                <span className="text-[var(--color-figma-warning)]">
                  {overwrittenEntries.length} existing token{overwrittenEntries.length !== 1 ? 's' : ''}
                </span>
              </label>
              <div className="flex flex-col gap-1.5">
                {overwrittenEntries.map(entry => (
                  <div key={entry.path} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={entry.path}>
                      {entry.path}
                    </span>
                    <ValueDiff type={entry.type} before={entry.oldValue} after={entry.newValue} />
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
