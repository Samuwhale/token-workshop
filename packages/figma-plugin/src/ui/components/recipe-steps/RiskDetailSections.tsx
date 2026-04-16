/**
 * Shared risk detail sections — overwrite risks, manual conflicts,
 * deleted outputs, and detached outputs.
 * Used only by StepSave.
 */
import type { RecipePreviewAnalysis } from '../../hooks/useRecipePreview';
import { ValueDiff } from '../ValueDiff';
import { AUTHORING } from '../../shared/editorClasses';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import type { ReactNode } from 'react';

export interface RiskDetailSectionsProps {
  previewAnalysis: RecipePreviewAnalysis;
  targetCollection: string;
}

function RiskSection({
  title,
  description,
  toneClassName,
  children,
}: {
  title: string;
  description: string;
  toneClassName: string;
  children: ReactNode;
}) {
  return (
    <section className={AUTHORING.recipeSectionCard}>
      <div className={AUTHORING.recipeTitleBlock}>
        <h4 className={`${AUTHORING.recipeTitle} ${toneClassName}`}>{title}</h4>
        <p className={AUTHORING.recipeDescription}>{description}</p>
      </div>
      <div className={AUTHORING.recipeCardList}>{children}</div>
    </section>
  );
}

export function RiskDetailSections({ previewAnalysis, targetCollection }: RiskDetailSectionsProps) {
  const nonRecipeOverwriteEntries = previewAnalysis.nonRecipeOverwrites ?? [];
  const manualConflictEntries = previewAnalysis.manualEditConflicts ?? [];
  const deletedOutputEntries = previewAnalysis.deletedOutputs ?? [];
  const detachedOutputEntries = previewAnalysis.detachedOutputs ?? [];
  const recreatedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'recreated');
  const preservedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'preserved');

  const hasAny =
    nonRecipeOverwriteEntries.length > 0 ||
    manualConflictEntries.length > 0 ||
    deletedOutputEntries.length > 0 ||
    detachedOutputEntries.length > 0;

  if (!hasAny) return null;

  return (
    <>
      {nonRecipeOverwriteEntries.length > 0 && (
        <RiskSection
          title="Overwrite risks"
          description="These paths already exist outside this recipe and would be overwritten or claimed."
          toneClassName="text-[var(--color-figma-warning)]"
        >
            {nonRecipeOverwriteEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                  {entry.setName !== targetCollection && <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.setName}</span>}
                </span>
                {entry.changesValue ? (
                  <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                ) : (
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Existing value matches the preview, but this path would change ownership.
                  </span>
                )}
              </div>
            ))}
        </RiskSection>
      )}

      {manualConflictEntries.length > 0 && (
        <RiskSection
          title="Manual-edit conflicts"
          description="These recipe-owned paths drifted from the last generated output and need deliberate review."
          toneClassName="text-[var(--color-figma-error)]"
        >
            {manualConflictEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                </span>
                <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
              </div>
            ))}
        </RiskSection>
      )}

      {deletedOutputEntries.length > 0 && (
        <RiskSection
          title="Deleted outputs"
          description="These managed paths would be removed because the current draft no longer generates them."
          toneClassName="text-[var(--color-figma-warning)]"
        >
            {deletedOutputEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-wrap items-start gap-2 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={`${LONG_TEXT_CLASSES.monoSecondary} flex-1`} title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                  {entry.setName !== targetCollection && <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.setName}</span>}
                </span>
                <span className="text-[10px] text-[var(--color-figma-warning)] shrink-0">Removed on save</span>
              </div>
            ))}
        </RiskSection>
      )}

      {detachedOutputEntries.length > 0 && (
        <RiskSection
          title="Detached outputs"
          description="These paths were detached from recipe ownership and stay manual unless recreated."
          toneClassName="text-[var(--color-figma-warning)]"
        >
            {recreatedDetachedEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                </span>
                <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
              </div>
            ))}
            {preservedDetachedEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-wrap items-start gap-2 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={`${LONG_TEXT_CLASSES.monoSecondary} flex-1`} title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                </span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Stays manual</span>
              </div>
            ))}
        </RiskSection>
      )}
    </>
  );
}
