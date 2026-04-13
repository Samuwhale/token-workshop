/**
 * Step 2 — What: The creative workspace for configuring a generator.
 * Two-column layout: type + config (left), live preview (right).
 */
import { useMemo, useState, useRef, useEffect } from 'react';
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
import type { GeneratorPreviewAnalysis, OverwrittenEntry } from '../../hooks/useGeneratorPreview';

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
import { GenericPreview } from '../generators/generatorShared';
import { AppliedPreview } from '../generators/AppliedPreview';
import { TYPE_LABELS, TYPE_DESCRIPTIONS, PRIMARY_TYPES, ADVANCED_TYPES } from '../generators/generatorUtils';
import { TypeThumbnail } from '../generators/TypeThumbnail';
import { UnifiedSourceInput } from '../UnifiedSourceInput';
import { Spinner } from '../Spinner';
import { ValueDiff } from '../ValueDiff';
import { AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import { GENERATOR_AUTHORING_CLASSES } from '../generatorAuthoringSurface';


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
  sourceTokenPath?: string;
  sourceTokenValue?: any;
  inlineValue: unknown;
  // Preview
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  previewBrand: string | undefined;
  multiBrandPreviews?: Map<string, GeneratedTokenResult[]>;
  previewAnalysis: GeneratorPreviewAnalysis | null;
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
  /** Flush the pending undo snapshot when a new discrete interaction begins. */
  onConfigInteractionStart: () => void;
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
// Compact type selector — shows selected type with a dropdown to change
// ---------------------------------------------------------------------------

function TypeDropdownItem({
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
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={`w-full text-left px-2.5 py-2 flex items-center gap-2.5 transition-colors ${
        isSelected
          ? 'bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)]'
          : 'hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]'
      }`}
    >
      <div className="flex-none w-5 h-5 flex items-center justify-center">
        <TypeThumbnail type={type} size={14} />
      </div>
      <span className="text-[10px] font-medium flex-1 min-w-0 truncate">
        {TYPE_LABELS[type]}
      </span>
      {isRecommended && !isSelected && (
        <span className="text-[9px] text-[var(--color-figma-accent)] shrink-0">rec.</span>
      )}
      {isSelected && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0"><path d="M2.5 6.5L5 9l4.5-6" /></svg>
      )}
    </button>
  );
}

function TypeSelector({
  selectedType,
  recommendedType,
  onTypeChange,
}: {
  selectedType: GeneratorType;
  recommendedType: GeneratorType | undefined;
  onTypeChange: (type: GeneratorType) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`min-h-[36px] w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
          open
            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
            : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/40'
        }`}
      >
        <div className="flex-none w-6 h-6 rounded flex items-center justify-center bg-[var(--color-figma-accent)]/10">
          <TypeThumbnail type={selectedType} size={14} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            {TYPE_LABELS[selectedType]}
          </span>
          <p className="text-[9px] text-[var(--color-figma-text-secondary)] leading-snug truncate">
            {TYPE_DESCRIPTIONS[selectedType]}
          </p>
        </div>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
          className={`shrink-0 text-[var(--color-figma-text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5l3 4 3-4H2z" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-1 max-h-[280px] overflow-y-auto"
        >
          {PRIMARY_TYPES.map(type => (
            <TypeDropdownItem
              key={type}
              type={type}
              isSelected={selectedType === type}
              isRecommended={type === recommendedType}
              onSelect={() => { onTypeChange(type); setOpen(false); }}
            />
          ))}
          <div className="border-t border-[var(--color-figma-border)] my-1" />
          <div className="px-2.5 py-1">
            <span className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wider font-medium">Advanced</span>
          </div>
          {ADVANCED_TYPES.map(type => (
            <TypeDropdownItem
              key={type}
              type={type}
              isSelected={selectedType === type}
              isRecommended={type === recommendedType}
              onSelect={() => { onTypeChange(type); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewImpactCard({
  label,
  count,
  tone,
  detail,
}: {
  label: string;
  count: number;
  tone: 'neutral' | 'success' | 'warning' | 'error';
  detail: string;
}) {
  const toneClassName = {
    neutral: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)]',
    success: 'border-[var(--color-figma-success)]/30 bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]',
    warning: 'border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]',
    error: 'border-[var(--color-figma-error)]/35 bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]',
  }[tone];

  return (
    <div className={`${GENERATOR_AUTHORING_CLASSES.metricCard} ${toneClassName}`}>
      <div className="text-[9px] uppercase tracking-wide opacity-80">{label}</div>
      <div className={GENERATOR_AUTHORING_CLASSES.metricValue}>{count}</div>
      <div className="text-[9.5px] leading-snug opacity-85">{detail}</div>
    </div>
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
  hasSource: _hasSource,
  hasValue,
  isMultiBrand,
  sourceTokenPath,
  sourceTokenValue,
  inlineValue,
  previewTokens,
  previewLoading,
  previewError,
  previewBrand,
  multiBrandPreviews,
  previewAnalysis,
  pendingOverrides,
  lockedCount,
  overwrittenEntries,
  allTokensFlat,
  pathToSet,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onConfigInteractionStart,
  onTypeChange,
  onConfigChange,
  onSourcePathChange,
  onInlineValueChange,
  onOverrideChange,
  onOverrideClear,
  onClearAllOverrides,
}: StepWhatProps) {

  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map(e => e.path)),
    [overwrittenEntries],
  );
  const safeUpdateEntries = previewAnalysis?.safeUpdates ?? [];
  const nonGeneratorOverwriteEntries = previewAnalysis?.nonGeneratorOverwrites ?? [];
  const manualConflictEntries = previewAnalysis?.manualEditConflicts ?? [];
  const deletedOutputEntries = previewAnalysis?.deletedOutputs ?? [];
  const detachedOutputEntries = previewAnalysis?.detachedOutputs ?? [];
  const recreatedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'recreated');
  const preservedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'preserved');
  const safeCreateCount = previewAnalysis?.safeCreateCount ?? 0;

  // Effective source value for config editors (still needed by ColorRamp, TypeScale, etc.)
  const effectiveSourceHex = typeof sourceTokenValue === 'string' ? sourceTokenValue : typeof inlineValue === 'string' ? inlineValue : undefined;
  const effectiveSourceDim = (() => {
    if (typeof sourceTokenValue === 'object' && sourceTokenValue !== null && 'value' in sourceTokenValue) return Number(sourceTokenValue.value);
    if (typeof sourceTokenValue === 'number') return sourceTokenValue;
    if (typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)) return Number((inlineValue as { value: number }).value);
    return undefined;
  })();

  const typeExpectsColor = selectedType === 'colorRamp' || selectedType === 'accessibleColorPair' || selectedType === 'darkModeInversion';
  const typeExpectsDimension = selectedType === 'typeScale' || selectedType === 'spacingScale' || selectedType === 'borderRadiusScale';

  return (
    <section className={`${GENERATOR_AUTHORING_CLASSES.root} ${GENERATOR_AUTHORING_CLASSES.section}`}>
      <div className={GENERATOR_AUTHORING_CLASSES.titleBlock}>
        <h3 className={GENERATOR_AUTHORING_CLASSES.title}>Generator setup</h3>
        <p className={GENERATOR_AUTHORING_CLASSES.description}>
          Choose the generator type, provide a source value when needed, and review the live output preview.
        </p>
      </div>

      <div className={AUTHORING_SURFACE_CLASSES.splitLayout}>
        {/* ---- LEFT: Config column ---- */}
        <div className={AUTHORING_SURFACE_CLASSES.splitConfig}>
          <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
            <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
              <label className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Generator type</label>
              <TypeSelector
                selectedType={selectedType}
                recommendedType={recommendedType}
                onTypeChange={onTypeChange}
              />
            </div>
          </div>

          {/* Base value — unified source token / inline value input */}
          {typeNeedsValue && (
            <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
              <UnifiedSourceInput
                expectedType={typeExpectsColor ? 'color' : typeExpectsDimension ? 'dimension' : null}
                sourceTokenPath={sourceTokenPath}
                sourceTokenValue={sourceTokenValue}
                inlineValue={inlineValue}
                isMultiBrand={isMultiBrand}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                onSourcePathChange={onSourcePathChange}
                onInlineValueChange={onInlineValueChange}
              />
            </div>
          )}

          {/* Config editor */}
          <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
            <div className="flex items-center justify-between mb-3">
              <span className={GENERATOR_AUTHORING_CLASSES.title}>{TYPE_LABELS[selectedType]} settings</span>
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
            {selectedType === 'colorRamp' && <ColorRampConfigEditor config={currentConfig as ColorRampConfig} onChange={cfg => onConfigChange('colorRamp', cfg)} onInteractionStart={onConfigInteractionStart} sourceHex={effectiveSourceHex} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'typeScale' && <TypeScaleConfigEditor config={currentConfig as TypeScaleConfig} onChange={cfg => onConfigChange('typeScale', cfg)} onInteractionStart={onConfigInteractionStart} sourceValue={effectiveSourceDim} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'spacingScale' && <SpacingScaleConfigEditor config={currentConfig as SpacingScaleConfig} onChange={cfg => onConfigChange('spacingScale', cfg)} onInteractionStart={onConfigInteractionStart} />}
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
        <div className={AUTHORING_SURFACE_CLASSES.splitPreview}>

          {/* Preview */}
          <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
            <div className="flex items-center justify-between mb-1.5">
              <label className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>
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
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] border border-dashed border-[var(--color-figma-border)] rounded-lg px-3 py-4 bg-[var(--color-figma-bg-secondary)] text-center">
                {isMultiBrand
                  ? 'Add a brand row with an input value to see a preview.'
                  : typeNeedsValue && !hasValue
                    ? `Pick or enter a base ${typeExpectsColor ? 'color' : 'value'} to see generated tokens.`
                    : 'Configure settings to generate a preview.'}
              </div>
            )}

            {!previewError && !isMultiBrand && previewAnalysis && (
              <div className={`${GENERATOR_AUTHORING_CLASSES.metricGrid} mt-3`}>
                <PreviewImpactCard
                  label="Safe creates"
                  count={safeCreateCount}
                  tone="success"
                  detail={safeCreateCount === 0 ? 'No new output paths yet.' : 'New outputs with no existing collision.'}
                />
                <PreviewImpactCard
                  label="Safe updates"
                  count={safeUpdateEntries.length}
                  tone="neutral"
                  detail={safeUpdateEntries.length === 0 ? 'No generator-owned outputs need updating.' : 'Existing outputs this generator can update cleanly.'}
                />
                <PreviewImpactCard
                  label="Overwrite risks"
                  count={nonGeneratorOverwriteEntries.length}
                  tone={nonGeneratorOverwriteEntries.length > 0 ? 'warning' : 'neutral'}
                  detail={nonGeneratorOverwriteEntries.length === 0 ? 'No manual or foreign tokens are in the way.' : 'Manual tokens or other generators would be overwritten.'}
                />
                <PreviewImpactCard
                  label="Manual conflicts"
                  count={manualConflictEntries.length}
                  tone={manualConflictEntries.length > 0 ? 'error' : 'neutral'}
                  detail={manualConflictEntries.length === 0 ? 'No drifted generator outputs detected.' : 'Generator-owned outputs were manually edited since the last run.'}
                />
                <PreviewImpactCard
                  label="Deleted outputs"
                  count={deletedOutputEntries.length}
                  tone={deletedOutputEntries.length > 0 ? 'warning' : 'neutral'}
                  detail={deletedOutputEntries.length === 0 ? 'No managed outputs will be removed.' : 'Current managed outputs no longer appear in this draft.'}
                />
                <PreviewImpactCard
                  label="Detached outputs"
                  count={detachedOutputEntries.length}
                  tone={detachedOutputEntries.length > 0 ? 'warning' : 'neutral'}
                  detail={detachedOutputEntries.length === 0 ? 'No detached outputs are affected.' : 'Detached outputs stay manual unless this draft recreates them.'}
                />
              </div>
            )}
          </div>

          {/* Applied preview — shows tokens in context */}
          {!previewError && previewTokens.length > 0 && (
            <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
              <div className={GENERATOR_AUTHORING_CLASSES.title}>Applied preview</div>
              <AppliedPreview type={selectedType} tokens={previewTokens} />
            </div>
          )}

          {nonGeneratorOverwriteEntries.length > 0 && (
            <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">
                Overwrite risks{' '}
                <span className="text-[var(--color-figma-warning)]">
                  {nonGeneratorOverwriteEntries.length} token{nonGeneratorOverwriteEntries.length !== 1 ? 's' : ''}
                </span>
              </label>
              <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
                {nonGeneratorOverwriteEntries.map(entry => (
                  <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                      {entry.path}
                      <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.setName}</span>
                    </span>
                    {entry.changesValue ? (
                      <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                    ) : (
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        Existing value matches the preview, but this path would switch ownership.
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {manualConflictEntries.length > 0 && (
            <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">
                Manual-edit conflicts{' '}
                <span className="text-[var(--color-figma-error)]">
                  {manualConflictEntries.length} token{manualConflictEntries.length !== 1 ? 's' : ''}
                </span>
              </label>
              <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
                {manualConflictEntries.map(entry => (
                  <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                      {entry.path}
                    </span>
                    <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {deletedOutputEntries.length > 0 && (
            <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">
                Deleted outputs{' '}
                <span className="text-[var(--color-figma-warning)]">
                  {deletedOutputEntries.length} token{deletedOutputEntries.length !== 1 ? 's' : ''}
                </span>
              </label>
              <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
                {deletedOutputEntries.map(entry => (
                  <div key={`${entry.setName}:${entry.path}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                      {entry.path}
                      <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.setName}</span>
                    </span>
                    <span className="text-[10px] text-[var(--color-figma-warning)] shrink-0">Removed on save</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detachedOutputEntries.length > 0 && (
            <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">
                Detached outputs{' '}
                <span className="text-[var(--color-figma-warning)]">
                  {detachedOutputEntries.length} token{detachedOutputEntries.length !== 1 ? 's' : ''}
                </span>
              </label>
              <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
                {recreatedDetachedEntries.map(entry => (
                  <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                      {entry.path}
                    </span>
                    <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                    <span className="text-[10px] text-[var(--color-figma-warning)]">
                      Saving will recreate this detached output and return it to generator ownership.
                    </span>
                  </div>
                ))}
                {preservedDetachedEntries.map(entry => (
                  <div key={`${entry.setName}:${entry.path}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                      {entry.path}
                    </span>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Stays manual</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
