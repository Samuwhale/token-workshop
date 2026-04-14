/**
 * Step 4 — Save: Consolidated impact screen with semantic aliases as
 * a collapsible advanced section.
 * Consolidates recipe impact review and save confirmation into one surface.
 */
import { useMemo, useState } from 'react';
import type {
  RecipeType,
  GeneratedTokenResult,
  InputTable,
} from '../../hooks/useRecipes';
import type { RecipePreviewAnalysis } from '../../hooks/useRecipePreview';
import type { SemanticStarter } from '../graph-templates';
import type { SemanticDraftMapping } from '../semanticPlanning';
import { swatchBgColor } from '../../shared/colorUtils';
import { Spinner } from '../Spinner';
import { TYPE_LABELS } from '../recipes/recipeUtils';
import { AUTHORING } from '../../shared/editorClasses';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import { ImpactMetrics } from './ImpactMetrics';
import { RiskDetailSections } from './RiskDetailSections';
import { StepSemanticPlanning } from './StepSemanticPlanning';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepSaveProps {
  // Recipe info
  selectedType: RecipeType;
  name: string;
  targetGroup: string;
  targetSet: string;
  isEditing: boolean;
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
  // Semantic aliases
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: SemanticDraftMapping[];
  templateStarter?: SemanticStarter;
  onSemanticEnabledChange: (value: boolean) => void;
  onSemanticPrefixChange: (value: string) => void;
  onSemanticMappingsChange: (value: SemanticDraftMapping[]) => void;
  onSemanticPatternSelect: (value: string | null) => void;
  // Preview data
  previewTokens: GeneratedTokenResult[];
  previewAnalysis: RecipePreviewAnalysis | null;
  existingOverwritePathSet: Set<string>;
  // Overwrite check
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  // Error
  saveError: string;
  previewReviewStale: boolean;
}

function SummaryField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={AUTHORING.summaryCard}>
      <div className={AUTHORING.summaryRow}>
        <span className={AUTHORING.summaryLabel}>{label}</span>
        <span className={mono ? AUTHORING.summaryMono : AUTHORING.summaryValue}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function StepSave({
  selectedType,
  name,
  targetGroup,
  targetSet,
  isEditing,
  isMultiBrand,
  inputTable,
  targetSetTemplate,
  semanticEnabled,
  semanticPrefix,
  semanticMappings,
  templateStarter,
  onSemanticEnabledChange,
  onSemanticPrefixChange,
  onSemanticMappingsChange,
  onSemanticPatternSelect,
  previewTokens,
  previewAnalysis,
  existingOverwritePathSet,
  overwritePendingPaths,
  overwriteCheckLoading,
  overwriteCheckError,
  saveError,
  previewReviewStale,
}: StepSaveProps) {
  const newTokens = previewTokens.filter(pt => !existingOverwritePathSet.has(pt.path));
  const validSemanticMappings = useMemo(
    () => semanticMappings.filter((mapping) => mapping.semantic.trim() && mapping.step),
    [semanticMappings],
  );

  // Auto-expand semantic section if template has a semantic starter
  const [semanticExpanded, setSemanticExpanded] = useState(
    () => Boolean(templateStarter?.mappings?.length) || semanticEnabled,
  );

  const semanticSummary = semanticEnabled && validSemanticMappings.length > 0
    ? `${validSemanticMappings.length} alias${validSemanticMappings.length === 1 ? '' : 'es'} under ${semanticPrefix}.*`
    : 'No semantic aliases';

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      <div className={AUTHORING.recipeTitleBlock}>
        <h3 className={AUTHORING.recipeTitle}>Review and save</h3>
        <p className={AUTHORING.recipeDescription}>
          Confirm destination and review any risks.
        </p>
      </div>

      <section className={AUTHORING.recipeSectionCard}>
        <div className={AUTHORING.recipeTitleBlock}>
          <h4 className={AUTHORING.recipeTitle}>Save target</h4>
        </div>
        <div className={AUTHORING.recipeCardList}>
          <SummaryField label="Recipe" value={name} />
          <SummaryField label="Type" value={TYPE_LABELS[selectedType]} />
          <SummaryField label="Output group" value={targetGroup} mono />
          <SummaryField
            label="Target set"
            value={isMultiBrand ? 'Multiple sets' : targetSet}
          />
        </div>
      </section>

      {previewReviewStale && (
        <div className="rounded-lg border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 px-3 py-2.5 text-[10px] text-[var(--color-figma-warning)]">
          Token store changed since review opened. Refresh to confirm.
        </div>
      )}

      {!isMultiBrand && previewAnalysis && (
        <ImpactMetrics previewAnalysis={previewAnalysis} />
      )}

      {overwriteCheckLoading && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
          <Spinner size="sm" />
          <span className="text-[10px]">Revalidating the latest preview&hellip;</span>
        </div>
      )}
      {!overwriteCheckLoading && overwriteCheckError && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2.5 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {overwriteCheckError}
        </div>
      )}

      {!overwriteCheckLoading && overwritePendingPaths.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10">
          <span className="text-[10px] font-medium text-[var(--color-figma-warning)]">
            {overwritePendingPaths.length} manually edited token{overwritePendingPaths.length !== 1 ? 's' : ''} will be overwritten
          </span>
          <div className="max-h-[100px] overflow-y-auto flex flex-col gap-0.5">
            {overwritePendingPaths.map((p: string) => (
              <div key={p} className={`${LONG_TEXT_CLASSES.mono} text-[var(--color-figma-warning)]/80`} title={p}>{p}</div>
            ))}
          </div>
        </div>
      )}

      {previewAnalysis && (
        <RiskDetailSections previewAnalysis={previewAnalysis} targetSet={targetSet} />
      )}

      {newTokens.length > 0 && (
        <div className={AUTHORING.recipeSectionCard}>
          <div className={AUTHORING.recipeTitleBlock}>
            <h4 className={AUTHORING.recipeTitle}>New tokens</h4>
          </div>
          <div className={AUTHORING.recipeCardList}>
            {newTokens.map(token => (
              <div key={token.path} className="flex flex-wrap items-start gap-2 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                {token.type === 'color' && typeof token.value === 'string' && (
                  <div
                    className="w-3.5 h-3.5 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0"
                    style={{ backgroundColor: swatchBgColor(String(token.value)) }}
                    aria-hidden="true"
                  />
                )}
                <span className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1`} title={token.path}>
                  {token.path}
                </span>
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={typeof token.value === 'object' ? JSON.stringify(token.value) : String(token.value)}>
                  {token.type === 'dimension' && typeof token.value === 'object' && token.value !== null && 'value' in (token.value as Record<string, unknown>)
                    ? `${(token.value as { value: number; unit?: string }).value}${(token.value as { value: number; unit?: string }).unit ?? 'px'}`
                    : typeof token.value === 'object' ? JSON.stringify(token.value) : String(token.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isMultiBrand && inputTable && (
        <div className={AUTHORING.recipeSectionCard}>
          <div className={AUTHORING.recipeTitleBlock}>
            <h4 className={AUTHORING.recipeTitle}>Brand destinations</h4>
          </div>
          <ul className="flex flex-col gap-1 text-[10px] text-[var(--color-figma-text)]">
            {inputTable.rows.filter(r => r.brand.trim()).map((row, i) => (
              <li key={i} className="border-t border-[var(--color-figma-border)] pt-2 first:border-t-0 first:pt-0">
                <span className="font-mono">
                  {(targetSetTemplate || 'brands/{brand}').replace('{brand}', row.brand)}
                </span>
                <span className="mx-1 text-[var(--color-figma-text-tertiary)]">→</span>
                <span className="font-mono">{targetGroup}.*</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isEditing && previewTokens.length > 0 && (
        <div className={AUTHORING.recipeSectionCard}>
          <button
            type="button"
            onClick={() => setSemanticExpanded(v => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <svg
                width="8" height="8" viewBox="0 0 10 10" fill="currentColor"
                className={`shrink-0 text-[var(--color-figma-text-secondary)] transition-transform ${semanticExpanded ? 'rotate-90' : ''}`}
              >
                <path d="M3 1.5l4 3.5-4 3.5V1.5z" />
              </svg>
              <span className={AUTHORING.recipeTitle}>Semantic aliases</span>
              <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">Optional</span>
            </div>
            <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
              {semanticSummary}
            </span>
          </button>
          {semanticExpanded && (
            <div className="mt-3">
              <StepSemanticPlanning
                selectedType={selectedType}
                targetGroup={targetGroup}
                previewTokens={previewTokens}
                templateStarter={templateStarter}
                semanticEnabled={semanticEnabled}
                semanticPrefix={semanticPrefix}
                semanticMappings={semanticMappings}
                onSemanticEnabledChange={onSemanticEnabledChange}
                onSemanticPrefixChange={onSemanticPrefixChange}
                onSemanticMappingsChange={onSemanticMappingsChange}
                onSemanticPatternSelect={onSemanticPatternSelect}
                inline
              />
            </div>
          )}
        </div>
      )}

      {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
    </section>
  );
}
