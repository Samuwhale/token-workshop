/**
 * Confirmation screen — condensed impact review.
 * Shown after clicking "Review" on the configure step.
 */
import type {
  GeneratedTokenResult,
} from '../../hooks/useRecipes';
import type { RecipePreviewAnalysis } from '../../hooks/useAutomationPreview';
import { Spinner } from '../Spinner';
import { AUTHORING } from '../../shared/editorClasses';
import { RiskDetailSections } from './RiskDetailSections';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepSaveProps {
  name: string;
  targetGroup: string;
  targetCollection: string;
  isEditing: boolean;
  previewTokens: GeneratedTokenResult[];
  previewAnalysis: RecipePreviewAnalysis | null;
  existingOverwritePathSet: Set<string>;
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  saveError: string;
  previewReviewStale: boolean;
}

// ---------------------------------------------------------------------------
// Condensed impact line
// ---------------------------------------------------------------------------

function ImpactSummaryLine({ previewAnalysis }: { previewAnalysis: RecipePreviewAnalysis }) {
  const safeCreates = previewAnalysis.safeCreateCount;
  const safeUpdates = (previewAnalysis.safeUpdates ?? []).length;
  const overwrites = (previewAnalysis.nonRecipeOverwrites ?? []).length;
  const conflicts = (previewAnalysis.manualEditConflicts ?? []).length;
  const deleted = (previewAnalysis.deletedOutputs ?? []).length;

  const parts: string[] = [];
  if (safeCreates > 0) parts.push(`${safeCreates} new`);
  if (safeUpdates > 0) parts.push(`${safeUpdates} updated`);
  if (overwrites > 0) parts.push(`${overwrites} overwrite${overwrites !== 1 ? 's' : ''}`);
  if (conflicts > 0) parts.push(`${conflicts} conflict${conflicts !== 1 ? 's' : ''}`);
  if (deleted > 0) parts.push(`${deleted} removed`);

  if (parts.length === 0) return null;

  const hasRisk = overwrites > 0 || conflicts > 0 || deleted > 0;

  return (
    <div className={`px-2.5 py-2 rounded-md text-[10px] ${
      hasRisk
        ? 'border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/5 text-[var(--color-figma-warning)]'
        : 'border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'
    }`}>
      {parts.join(' \u00b7 ')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepSave
// ---------------------------------------------------------------------------

export function StepSave({
  name: _name,
  targetGroup: _targetGroup,
  targetCollection,
  isEditing: _isEditing,
  previewTokens: _previewTokens,
  previewAnalysis,
  existingOverwritePathSet: _existingOverwritePathSet,
  overwritePendingPaths,
  overwriteCheckLoading,
  overwriteCheckError,
  saveError,
  previewReviewStale,
}: StepSaveProps) {
  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      {previewReviewStale && (
        <div className="rounded-md border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 px-2.5 py-2 text-[10px] text-[var(--color-figma-warning)]">
          Token store changed. Refresh to confirm.
        </div>
      )}

      {/* Condensed impact line */}
      {previewAnalysis && (
        <ImpactSummaryLine previewAnalysis={previewAnalysis} />
      )}

      {overwriteCheckLoading && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
          <Spinner size="sm" />
          <span className="text-[10px]">Checking&hellip;</span>
        </div>
      )}
      {!overwriteCheckLoading && overwriteCheckError && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-2.5 py-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {overwriteCheckError}
        </div>
      )}

      {!overwriteCheckLoading && overwritePendingPaths.length > 0 && (
        <div className="flex flex-col gap-1 px-2.5 py-2 rounded-md border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10">
          <span className="text-[10px] font-medium text-[var(--color-figma-warning)]">
            {overwritePendingPaths.length} manually edited token{overwritePendingPaths.length !== 1 ? 's' : ''} will be overwritten
          </span>
          <div className="max-h-[80px] overflow-y-auto flex flex-col gap-0.5">
            {overwritePendingPaths.map((p: string) => (
              <div key={p} className="text-[10px] font-mono text-[var(--color-figma-warning)]/80 truncate" title={p}>{p}</div>
            ))}
          </div>
        </div>
      )}

      {/* Risk detail sections (expandable) */}
      {previewAnalysis && (
        <RiskDetailSections previewAnalysis={previewAnalysis} targetCollection={targetCollection} />
      )}

      {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
    </section>
  );
}
