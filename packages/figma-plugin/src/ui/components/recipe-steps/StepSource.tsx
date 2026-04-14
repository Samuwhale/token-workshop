/**
 * Step 2 — Configure: source value + config editor + live preview.
 * Single-column stack optimized for narrow plugin windows.
 */
import { useMemo, useState } from 'react';
import type {
  RecipeType,
  RecipeConfig,
  GeneratedTokenResult,
  InputTable,
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
} from '../../hooks/useRecipes';
import type { TokenMapEntry } from '../../../shared/types';
import type { OverwrittenEntry } from '../../hooks/useRecipePreview';

import { ColorRampConfigEditor, ColorSwatchPreview } from '../recipes/ColorRampRecipe';
import { TypeScaleConfigEditor, TypeScalePreview } from '../recipes/TypeScaleRecipe';
import { SpacingScaleConfigEditor, SpacingPreview } from '../recipes/SpacingScaleRecipe';
import { OpacityScaleConfigEditor, OpacityPreview } from '../recipes/OpacityScaleRecipe';
import { ShadowScaleConfigEditor, ShadowPreview } from '../recipes/ShadowScaleRecipe';
import { BorderRadiusConfigEditor, BorderRadiusPreview } from '../recipes/BorderRadiusRecipe';
import { ZIndexConfigEditor } from '../recipes/ZIndexRecipe';
import { CustomScaleConfigEditor } from '../recipes/CustomScaleRecipe';
import { ContrastCheckConfigEditor, ContrastCheckPreview } from '../recipes/ContrastCheckRecipe';
import { AccessiblePairConfigEditor } from '../recipes/AccessiblePairRecipe';
import { DarkModeInversionConfigEditor } from '../recipes/DarkModeInversionRecipe';
import { GenericPreview } from '../recipes/recipeShared';
import { TYPE_LABELS } from '../recipes/recipeUtils';
import { UnifiedSourceInput } from '../UnifiedSourceInput';
import { Spinner } from '../Spinner';
import { AUTHORING } from '../../shared/editorClasses';
import {
  cloneStarterConfigForRecipeType,
} from '../graph-templates';
import { GRAPH_TEMPLATES, type GraphTemplate } from '../graph-templates';

// ---------------------------------------------------------------------------
// Template suggestion banner
// ---------------------------------------------------------------------------

function TemplateSuggestion({
  template,
  onApply,
  onDismiss,
}: {
  template: GraphTemplate;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/5 text-[10px]">
      <span className="flex-1 min-w-0 truncate text-[var(--color-figma-text)]">
        Start from <span className="font-medium">{template.label}</span>?
      </span>
      <button
        type="button"
        onClick={onApply}
        className="shrink-0 font-medium text-[var(--color-figma-accent)] hover:underline"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
      >
        &times;
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepSourceProps {
  isEditing: boolean;
  selectedType: RecipeType;
  currentConfig: RecipeConfig;
  typeNeedsValue: boolean;
  hasValue: boolean;
  sourceTokenPath?: string;
  sourceTokenValue?: any;
  inlineValue: unknown;
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  onToggleMultiBrand: () => void;
  onInputTableChange: (t: InputTable) => void;
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  previewBrand: string | undefined;
  multiBrandPreviews?: Map<string, GeneratedTokenResult[]>;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  lockedCount: number;
  overwrittenEntries: OverwrittenEntry[];
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onConfigInteractionStart: () => void;
  onConfigChange: (type: RecipeType, cfg: RecipeConfig) => void;
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
  isEditing,
  selectedType,
  currentConfig,
  typeNeedsValue,
  hasValue,
  sourceTokenPath,
  sourceTokenValue,
  inlineValue,
  isMultiBrand,
  inputTable: _inputTable,
  onToggleMultiBrand: _onToggleMultiBrand,
  onInputTableChange: _onInputTableChange,
  previewTokens,
  previewLoading,
  previewError,
  previewBrand: _previewBrand,
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
  const [templateDismissed, setTemplateDismissed] = useState(false);

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

  // Template suggestion for this type (only in create mode, before dismissal)
  const matchingTemplate = !isEditing && !templateDismissed
    ? GRAPH_TEMPLATES.find(t => t.recipeType === selectedType)
    : undefined;

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      {/* Template suggestion */}
      {matchingTemplate && (
        <TemplateSuggestion
          template={matchingTemplate}
          onApply={() => {
            const starterConfig = cloneStarterConfigForRecipeType(selectedType);
            if (starterConfig) {
              onConfigInteractionStart();
              onConfigChange(selectedType, starterConfig);
            }
            setTemplateDismissed(true);
          }}
          onDismiss={() => setTemplateDismissed(true)}
        />
      )}

      {/* Source value input */}
      {typeNeedsValue && (
        <div className={AUTHORING.recipeSectionCard}>
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
      <div className={AUTHORING.recipeSectionCard}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            {TYPE_LABELS[selectedType]}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                const starterConfig = cloneStarterConfigForRecipeType(selectedType);
                if (starterConfig) {
                  onConfigInteractionStart();
                  onConfigChange(selectedType, starterConfig);
                }
              }}
              className="px-1.5 py-0.5 rounded text-[9px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
              title="Reset to defaults"
            >
              Reset
            </button>
            {(canUndo || canRedo) && (
              <>
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo"
                  aria-label="Undo"
                  className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-20 transition-opacity"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5h5a2.5 2.5 0 0 1 0 5H6" /><path d="M5 2.5L3 4.5 5 6.5" /></svg>
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo"
                  aria-label="Redo"
                  className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-20 transition-opacity"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4.5H4a2.5 2.5 0 0 0 0 5h2" /><path d="M7 2.5l2 2-2 2" /></svg>
                </button>
              </>
            )}
          </div>
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

      {/* Live preview */}
      <div className={AUTHORING.recipeSectionCard}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Preview</span>
          {previewLoading && (
            <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
          )}
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
                    <span className="text-[9px] text-[var(--color-figma-text-secondary)]">No preview</span>
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
              ? 'Add a brand row to see a preview.'
              : typeNeedsValue && !hasValue
                ? `Enter a base ${typeExpectsColor ? 'color' : 'value'} to preview.`
                : 'Adjust settings to preview.'}
          </div>
        )}

        {/* Override clear link */}
        {lockedCount > 0 && (
          <button
            onClick={onClearAllOverrides}
            className="mt-1.5 text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] transition-colors"
          >
            Clear {lockedCount} override{lockedCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </section>
  );
}
