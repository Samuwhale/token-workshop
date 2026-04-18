import type { RecipePreviewAnalysis } from '../../hooks/useAutomationPreview';
import { AUTHORING } from '../../shared/editorClasses';

export interface ImpactMetricsProps {
  previewAnalysis: RecipePreviewAnalysis;
  className?: string;
}

export function ImpactMetrics({ previewAnalysis, className }: ImpactMetricsProps) {
  const safeUpdateEntries = previewAnalysis.safeUpdates ?? [];
  const nonRecipeOverwriteEntries = previewAnalysis.nonRecipeOverwrites ?? [];
  const manualConflictEntries = previewAnalysis.manualEditConflicts ?? [];
  const deletedOutputEntries = previewAnalysis.deletedOutputs ?? [];
  const detachedOutputEntries = previewAnalysis.detachedOutputs ?? [];
  const metrics = [
    {
      label: 'Safe creates',
      count: previewAnalysis.safeCreateCount,
      tone: 'success',
      detail:
        previewAnalysis.safeCreateCount === 0
          ? 'No new output paths yet.'
          : 'New outputs with no existing collision.',
    },
    {
      label: 'Safe updates',
      count: safeUpdateEntries.length,
      tone: 'neutral',
      detail:
        safeUpdateEntries.length === 0
          ? 'No recipe-owned outputs need updating.'
          : 'Existing outputs this recipe can update cleanly.',
    },
    {
      label: 'Overwrite risks',
      count: nonRecipeOverwriteEntries.length,
      tone: nonRecipeOverwriteEntries.length > 0 ? 'warning' : 'neutral',
      detail:
        nonRecipeOverwriteEntries.length === 0
          ? 'No manual or foreign tokens are in the way.'
          : 'Manual tokens or other recipes would be overwritten.',
    },
    {
      label: 'Manual conflicts',
      count: manualConflictEntries.length,
      tone: manualConflictEntries.length > 0 ? 'error' : 'neutral',
      detail:
        manualConflictEntries.length === 0
          ? 'No drifted automation outputs detected.'
          : 'Automation-owned outputs were manually edited since the last run.',
    },
    {
      label: 'Deleted outputs',
      count: deletedOutputEntries.length,
      tone: deletedOutputEntries.length > 0 ? 'warning' : 'neutral',
      detail:
        deletedOutputEntries.length === 0
          ? 'No managed outputs will be removed.'
          : 'Current managed outputs no longer appear in this draft.',
    },
    {
      label: 'Detached outputs',
      count: detachedOutputEntries.length,
      tone: detachedOutputEntries.length > 0 ? 'warning' : 'neutral',
      detail:
        detachedOutputEntries.length === 0
          ? 'No detached outputs are affected.'
          : 'Detached outputs stay manual unless this draft recreates them.',
    },
  ] as const;

  return (
    <section className={`${AUTHORING.recipeSectionCard}${className ? ` ${className}` : ''}`}>
      <div className={AUTHORING.recipeTitleBlock}>
        <h4 className={AUTHORING.recipeTitle}>Impact summary</h4>
        <p className={AUTHORING.recipeDescription}>
          Check the counts that change whether this recipe is safe to save now.
        </p>
      </div>
      <div className={AUTHORING.recipeCardList}>
        {metrics.map((metric) => {
          const toneClassName = {
            neutral: 'text-[var(--color-figma-text)]',
            success: 'text-[var(--color-figma-success)]',
            warning: 'text-[var(--color-figma-warning)]',
            error: 'text-[var(--color-figma-error)]',
          }[metric.tone];

          return (
            <div key={metric.label} className={`${AUTHORING.recipeMetricCard} ${toneClassName}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    {metric.label}
                  </span>
                  <span className={`${AUTHORING.recipeMetricValue} ${toneClassName}`}>
                    {metric.count}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                  {metric.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
