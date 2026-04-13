/**
 * Step 2 — Source: "From what source?" + config + live preview.
 * Two-column layout: source binding & config (left), live preview (right).
 */
import { useMemo } from 'react';
import type {
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  InputTable,
  InputTableRow,
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
import { GenericPreview } from '../generators/generatorShared';
import { AppliedPreview } from '../generators/AppliedPreview';
import { TYPE_LABELS } from '../generators/generatorUtils';
import { UnifiedSourceInput } from '../UnifiedSourceInput';
import { Spinner } from '../Spinner';
import { AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import { AUTHORING } from '../../shared/editorClasses';
import {
  cloneStarterConfigForGeneratorType,
  getStarterTemplateForGeneratorType,
} from '../graph-templates';

// ---------------------------------------------------------------------------
// InputTableEditor (moved from StepWhere — it's source configuration)
// ---------------------------------------------------------------------------

function InputTableEditor({ table, onChange }: { table: InputTable; onChange: (t: InputTable) => void }) {
  const updateInputKey = (key: string) => onChange({ ...table, inputKey: key });

  const updateRow = (idx: number, patch: Partial<InputTableRow>) =>
    onChange({ ...table, rows: table.rows.map((r, i) => i === idx ? { ...r, ...patch } : r) });

  const updateRowInput = (rowIdx: number, value: string) => {
    const row = table.rows[rowIdx];
    updateRow(rowIdx, { inputs: { ...row.inputs, [table.inputKey]: value } });
  };

  const addRow = () =>
    onChange({ ...table, rows: [...table.rows, { brand: '', inputs: { [table.inputKey]: '' } }] });

  const removeRow = (idx: number) =>
    onChange({ ...table, rows: table.rows.filter((_, i) => i !== idx) });

  return (
    <div className={AUTHORING.generatorSection}>
      <div className={AUTHORING.generatorFieldStack}>
        <label htmlFor="step-source-input-column" className={AUTHORING.generatorSummaryLabel}>Input column name</label>
        <input
          id="step-source-input-column"
          value={table.inputKey}
          onChange={e => updateInputKey(e.target.value)}
          placeholder="brandColor"
          className={AUTHORING.generatorControlMono}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] gap-2 px-0.5">
          <span className={AUTHORING.generatorSummaryLabel}>Brand</span>
          <span className={AUTHORING.generatorSummaryLabel}>{table.inputKey || 'value'}</span>
          <span className="w-5" />
        </div>
        {table.rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] items-start gap-2">
            <input
              value={row.brand}
              onChange={e => updateRow(i, { brand: e.target.value })}
              placeholder="berry"
              className={AUTHORING.generatorControlMono}
            />
            <input
              value={String(row.inputs[table.inputKey] ?? '')}
              onChange={e => updateRowInput(i, e.target.value)}
              placeholder="#8B5CF6"
              className={AUTHORING.generatorControlMono}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Remove row"
              className="mt-2 w-5 text-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[12px] shrink-0 leading-none"
            >&times;</button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
        >+ Add brand</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepSourceProps {
  // Generator state
  isEditing: boolean;
  selectedType: GeneratorType;
  currentConfig: GeneratorConfig;
  typeNeedsValue: boolean;
  hasValue: boolean;
  // Source binding
  sourceTokenPath?: string;
  sourceTokenValue?: any;
  inlineValue: unknown;
  // Multi-brand (moved from StepWhere)
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  onToggleMultiBrand: () => void;
  onInputTableChange: (t: InputTable) => void;
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
  onConfigInteractionStart: () => void;
  // Handlers
  onConfigChange: (type: GeneratorType, cfg: GeneratorConfig) => void;
  onSourcePathChange: (v: string) => void;
  onInlineValueChange: (v: unknown) => void;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  onClearAllOverrides: () => void;
}

// ---------------------------------------------------------------------------
// StepSource
// ---------------------------------------------------------------------------

export function StepSource({
  isEditing: _isEditing,
  selectedType,
  currentConfig,
  typeNeedsValue,
  hasValue,
  sourceTokenPath,
  sourceTokenValue,
  inlineValue,
  isMultiBrand,
  inputTable,
  onToggleMultiBrand,
  onInputTableChange,
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
  onConfigInteractionStart,
  onConfigChange,
  onSourcePathChange,
  onInlineValueChange,
  onOverrideChange,
  onOverrideClear,
  onClearAllOverrides,
}: StepSourceProps) {
  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map(e => e.path)),
    [overwrittenEntries],
  );

  const effectiveSourceHex = typeof sourceTokenValue === 'string' ? sourceTokenValue : typeof inlineValue === 'string' ? inlineValue : undefined;
  const effectiveSourceDim = (() => {
    if (typeof sourceTokenValue === 'object' && sourceTokenValue !== null && 'value' in sourceTokenValue) return Number(sourceTokenValue.value);
    if (typeof sourceTokenValue === 'number') return sourceTokenValue;
    if (typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)) return Number((inlineValue as { value: number }).value);
    return undefined;
  })();

  const typeExpectsColor = selectedType === 'colorRamp' || selectedType === 'accessibleColorPair' || selectedType === 'darkModeInversion';
  const typeExpectsDimension = selectedType === 'typeScale' || selectedType === 'spacingScale' || selectedType === 'borderRadiusScale';
  const starterTemplate = getStarterTemplateForGeneratorType(selectedType);

  return (
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      <div className={AUTHORING.generatorTitleBlock}>
        <h3 className={AUTHORING.generatorTitle}>Configure</h3>
        <p className={AUTHORING.generatorDescription}>
          Provide a source value, tune the settings, and review the live preview.
        </p>
      </div>

      <div className={AUTHORING_SURFACE_CLASSES.splitLayout}>
        {/* ---- LEFT: Config column ---- */}
        <div className={AUTHORING_SURFACE_CLASSES.splitConfig}>
          {/* Base value — unified source token / inline value input */}
          {typeNeedsValue && (
            <div className={AUTHORING.generatorSectionCard}>
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

          {/* Multi-brand toggle + input table */}
          <div className={AUTHORING.generatorSectionCard}>
            <div className={AUTHORING.generatorFieldStack}>
              <span className={AUTHORING.generatorSummaryLabel}>Publishing mode</span>
              <button
                type="button"
                onClick={onToggleMultiBrand}
                className={`min-h-[36px] rounded-lg border px-3 text-left text-[11px] transition-colors ${
                  isMultiBrand
                    ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {isMultiBrand ? 'Multi-brand enabled' : 'Single set'}
              </button>
              <p className={AUTHORING.generatorDescription}>
                {isMultiBrand
                  ? 'Create the same scale into multiple brand-specific token sets.'
                  : 'Switch to multi-brand when this recipe should publish one scale across several sets.'}
              </p>
            </div>
            {isMultiBrand && inputTable && (
              <InputTableEditor table={inputTable} onChange={onInputTableChange} />
            )}
          </div>

          {/* Starter preset card */}
          {starterTemplate && (
            <div className={AUTHORING.generatorSectionCard}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={AUTHORING.generatorSummaryLabel}>Starter preset</div>
                  <div className="mt-1 text-[12px] font-semibold text-[var(--color-figma-text)]">
                    {starterTemplate.starterPresetName}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    {starterTemplate.whenToUse}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const starterConfig = cloneStarterConfigForGeneratorType(selectedType);
                    if (!starterConfig) return;
                    onConfigInteractionStart();
                    onConfigChange(selectedType, starterConfig);
                  }}
                  className="shrink-0 px-2.5 py-1.5 rounded-md border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                >
                  Restore preset
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                    Starts with
                  </div>
                  <div className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text)]">
                    {starterTemplate.starterPreset}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                    Source guidance
                  </div>
                  <div className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text)]">
                    {starterTemplate.sourceRequirement}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Config editor */}
          <div className={AUTHORING.generatorSectionCard}>
            <div className="flex items-center justify-between mb-3">
              <span className={AUTHORING.generatorTitle}>{TYPE_LABELS[selectedType]} settings</span>
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

        {/* ---- RIGHT: Preview column ---- */}
        <div className={AUTHORING_SURFACE_CLASSES.splitPreview}>
          <div className={AUTHORING.generatorSectionCard}>
            <div className="flex items-center justify-between mb-1.5">
              <label className={AUTHORING.generatorSummaryLabel}>
                Preview
                {isMultiBrand && multiBrandPreviews && multiBrandPreviews.size > 0
                  ? <span className="ml-1 text-[var(--color-figma-text)]">({multiBrandPreviews.size} brand{multiBrandPreviews.size !== 1 ? 's' : ''})</span>
                  : previewTokens.length > 0 && <span className="ml-1 text-[var(--color-figma-text)]">({previewTokens.length} tokens)</span>
                }
                {!multiBrandPreviews?.size && previewBrand && previewTokens.length > 0 && (
                  <span className="ml-1 italic">&mdash; sample from &ldquo;{previewBrand}&rdquo;</span>
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

            {/* Multi-brand stacked previews — BUG FIX: pass real override handlers */}
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
                          {selectedType === 'colorRamp' && <ColorSwatchPreview tokens={tokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />}
                          {selectedType === 'typeScale' && <TypeScalePreview tokens={tokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />}
                          {selectedType === 'spacingScale' && <SpacingPreview tokens={tokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />}
                          {selectedType === 'borderRadiusScale' && <BorderRadiusPreview tokens={tokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />}
                          {selectedType === 'opacityScale' && <OpacityPreview tokens={tokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />}
                          {selectedType === 'shadowScale' && <ShadowPreview tokens={tokens} config={currentConfig as ShadowScaleConfig} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />}
                          {(selectedType === 'zIndexScale' || selectedType === 'customScale') && <GenericPreview tokens={tokens} overrides={pendingOverrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />}
                        </>
                      ) : (
                        <span className="text-[9px] text-[var(--color-figma-text-secondary)]">No preview tokens</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Single-brand preview */}
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
                    ? `Pick or enter a base ${typeExpectsColor ? 'color' : 'value'} to see the token preview.`
                    : 'Configure settings to see a preview.'}
              </div>
            )}
          </div>

          {/* Applied preview — shows tokens in context */}
          {!previewError && previewTokens.length > 0 && (
            <div className={AUTHORING.generatorSectionCard}>
              <div className={AUTHORING.generatorTitle}>Applied preview</div>
              <AppliedPreview type={selectedType} tokens={previewTokens} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
