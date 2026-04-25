/**
 * Shared risk detail sections — overwrite risks, manual conflicts,
 * deleted outputs, and detached outputs.
 */
import type { GeneratorPreviewAnalysis } from '../../hooks/useGeneratedGroupPreview';
import { ValueDiff } from '../ValueDiff';
import { AUTHORING } from '../../shared/editorClasses';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import type { ReactNode } from 'react';

export interface RiskDetailSectionsProps {
  previewAnalysis: GeneratorPreviewAnalysis;
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
    <section className={AUTHORING.generatorSectionCard}>
      <div className={AUTHORING.generatorTitleBlock}>
        <h4 className={`${AUTHORING.generatorTitle} ${toneClassName}`}>{title}</h4>
        <p className={AUTHORING.generatorDescription}>{description}</p>
      </div>
      <div className={AUTHORING.generatorCardList}>{children}</div>
    </section>
  );
}

export function RiskDetailSections({ previewAnalysis, targetCollection }: RiskDetailSectionsProps) {
  const nonGeneratorOverwriteEntries = previewAnalysis.nonGeneratorOverwrites ?? [];
  const manualConflictEntries = previewAnalysis.manualEditConflicts ?? [];
  const deletedOutputEntries = previewAnalysis.deletedOutputs ?? [];
  const detachedOutputEntries = previewAnalysis.detachedOutputs ?? [];
  const manualExceptionEntries = previewAnalysis.manualExceptions ?? [];
  const recreatedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'recreated');
  const preservedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'preserved');
  const createdExceptions = manualExceptionEntries.filter((entry) => entry.state === "created");
  const preservedExceptions = manualExceptionEntries.filter((entry) => entry.state === "preserved");
  const invalidatedExceptions = manualExceptionEntries.filter((entry) => entry.state === "invalidated");

  const hasAny =
    nonGeneratorOverwriteEntries.length > 0 ||
    manualConflictEntries.length > 0 ||
    deletedOutputEntries.length > 0 ||
    detachedOutputEntries.length > 0 ||
    manualExceptionEntries.length > 0;

  if (!hasAny) return null;

  return (
    <>
      {nonGeneratorOverwriteEntries.length > 0 && (
        <RiskSection
          title="Overwrite risks"
          description="These paths already exist outside this generated group and would be overwritten or claimed by this generated group."
          toneClassName="text-[var(--color-figma-warning)]"
        >
            {nonGeneratorOverwriteEntries.map(entry => (
              <div key={`${entry.collectionId}:${entry.path}`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                  {entry.collectionId !== targetCollection && <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.collectionId}</span>}
                </span>
                {entry.changesValue ? (
                  <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                ) : (
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                    Existing value matches the preview, but this path would become managed by this generated group.
                  </span>
                )}
              </div>
            ))}
        </RiskSection>
      )}

      {manualConflictEntries.length > 0 && (
        <RiskSection
          title="Existing manual changes"
          description="These generated tokens drifted from the last generated output and need deliberate review."
          toneClassName="text-[var(--color-figma-error)]"
        >
            {manualConflictEntries.map(entry => (
              <div key={`${entry.collectionId}:${entry.path}`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                </span>
                <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
              </div>
            ))}
        </RiskSection>
      )}

      {manualExceptionEntries.length > 0 && (
        <RiskSection
          title="Manual exceptions"
          description="Review manual exceptions that will be created, preserved, or invalidated by this save."
          toneClassName="text-[var(--color-figma-warning)]"
        >
            {createdExceptions.map(entry => (
              <div key={`${entry.collectionId}:${entry.path}:created`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                </span>
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                  Creates a manual exception for this generated token.
                </span>
                {entry.newValue !== undefined && (
                  <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                )}
              </div>
            ))}
            {preservedExceptions.map(entry => (
              <div key={`${entry.collectionId}:${entry.path}:preserved`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                </span>
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                  Keeps this manual exception in the group.
                </span>
                {entry.newValue !== undefined && (
                  <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                )}
              </div>
            ))}
            {invalidatedExceptions.map(entry => (
              <div key={`${entry.collectionId}:${entry.path}:invalidated`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                </span>
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                  Removes this manual exception and restores generated output.
                </span>
                {entry.newValue !== undefined ? (
                  <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                ) : (
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                    This token no longer appears in the generated output.
                  </span>
                )}
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
              <div key={`${entry.collectionId}:${entry.path}`} className="flex flex-wrap items-start gap-2 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={`${LONG_TEXT_CLASSES.monoSecondary} flex-1`} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                  {entry.collectionId !== targetCollection && <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.collectionId}</span>}
                </span>
                <span className="text-secondary text-[var(--color-figma-warning)] shrink-0">Removed on save</span>
              </div>
            ))}
        </RiskSection>
      )}

      {detachedOutputEntries.length > 0 && (
        <RiskSection
          title="Detached tokens"
          description="These tokens were detached from this generated group and stay manual unless this save recreates them."
          toneClassName="text-[var(--color-figma-warning)]"
        >
            {recreatedDetachedEntries.map(entry => (
              <div key={`${entry.collectionId}:${entry.path}`} className="flex flex-col gap-0.5 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={LONG_TEXT_CLASSES.monoSecondary} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                </span>
                <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
              </div>
            ))}
            {preservedDetachedEntries.map(entry => (
              <div key={`${entry.collectionId}:${entry.path}`} className="flex flex-wrap items-start gap-2 border-t border-[var(--color-figma-border)] py-2 first:border-t-0 first:pt-0 last:pb-0">
                <span className={`${LONG_TEXT_CLASSES.monoSecondary} flex-1`} title={`${entry.collectionId}:${entry.path}`}>
                  {entry.path}
                </span>
                <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Stays manual</span>
              </div>
            ))}
        </RiskSection>
      )}
    </>
  );
}
