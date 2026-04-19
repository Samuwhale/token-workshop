/**
 * Confirmation screen — condensed impact review.
 * Shown after clicking "Review" on the configure step.
 */
import type {
  GeneratedTokenResult,
  GeneratorType,
} from '../../hooks/useGenerators';
import type { GeneratorPreviewAnalysis } from '../../hooks/useGeneratedGroupPreview';
import { Spinner } from '../Spinner';
import { AUTHORING } from '../../shared/editorClasses';
import { RiskDetailSections } from './RiskDetailSections';
import { formatValue } from '../generators/generatorShared';
import { AppliedPreview } from '../generators/AppliedPreview';
import { getGeneratedGroupTypeLabel } from '../../shared/generatedGroupUtils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepSaveProps {
  name: string;
  targetGroup: string;
  targetCollection: string;
  collectionModeLabel?: string | null;
  selectedType: GeneratorType;
  isEditing: boolean;
  previewTokens: GeneratedTokenResult[];
  previewAnalysis: GeneratorPreviewAnalysis | null;
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

function ImpactSummaryLine({ previewAnalysis }: { previewAnalysis: GeneratorPreviewAnalysis }) {
  const safeCreates = previewAnalysis.safeCreateCount;
  const safeUpdates = (previewAnalysis.safeUpdates ?? []).length;
  const overwrites = (previewAnalysis.nonGeneratorOverwrites ?? []).length;
  const conflicts = (previewAnalysis.manualEditConflicts ?? []).length;
  const deleted = (previewAnalysis.deletedOutputs ?? []).length;
  const manualExceptions = (previewAnalysis.manualExceptions ?? []).length;

  const parts: string[] = [];
  if (safeCreates > 0) parts.push(`${safeCreates} new`);
  if (safeUpdates > 0) parts.push(`${safeUpdates} updated`);
  if (overwrites > 0) parts.push(`${overwrites} overwrite${overwrites !== 1 ? 's' : ''}`);
  if (conflicts > 0) parts.push(`${conflicts} conflict${conflicts !== 1 ? 's' : ''}`);
  if (deleted > 0) parts.push(`${deleted} removed`);
  if (manualExceptions > 0) {
    parts.push(
      `${manualExceptions} manual exception${manualExceptions !== 1 ? 's' : ''}`,
    );
  }

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
  name,
  targetGroup,
  targetCollection,
  collectionModeLabel = null,
  selectedType,
  isEditing: _isEditing,
  previewTokens,
  previewAnalysis,
  existingOverwritePathSet: _existingOverwritePathSet,
  overwritePendingPaths,
  overwriteCheckLoading,
  overwriteCheckError,
  saveError,
  previewReviewStale,
}: StepSaveProps) {
  const createdPathSet = new Set(previewAnalysis?.diff.created.map((entry) => entry.path) ?? []);
  const updatedPathSet = new Set(previewAnalysis?.diff.updated.map((entry) => entry.path) ?? []);
  const unchangedPathSet = new Set(previewAnalysis?.diff.unchanged.map((entry) => entry.path) ?? []);
  const previewRows = previewTokens.slice(0, 12);

  return (
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      {previewReviewStale && (
        <div className="rounded-md border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 px-2.5 py-2 text-[10px] text-[var(--color-figma-warning)]">
          Token store changed. Refresh to confirm.
        </div>
      )}

      <section className={AUTHORING.generatorSectionCard}>
        <div className={AUTHORING.generatorTitleBlock}>
          <h4 className={AUTHORING.generatorTitle}>
            Review changes
          </h4>
          <p className={AUTHORING.generatorDescription}>
            Confirm the collection, preview mode, output changes, and manual exceptions before you save.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Group label
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-[var(--color-figma-text)]">
              {name}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Outcome
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-[var(--color-figma-text)]">
              {getGeneratedGroupTypeLabel(selectedType)}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Collection
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[var(--color-figma-text)]">
              {targetCollection}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Group
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[var(--color-figma-text)]">
              {targetGroup}
            </div>
          </div>
          {collectionModeLabel && (
            <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2 sm:col-span-2">
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Preview mode
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-[var(--color-figma-text)]">
                {collectionModeLabel}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Condensed impact line */}
      {previewAnalysis && (
        <ImpactSummaryLine previewAnalysis={previewAnalysis} />
      )}

      {previewTokens.length > 0 && (
        <section className={AUTHORING.generatorSectionCard}>
          <div className={AUTHORING.generatorTitleBlock}>
            <h4 className={AUTHORING.generatorTitle}>Output preview</h4>
            <p className={AUTHORING.generatorDescription}>
              Review the generated tokens that will exist in this group after save.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <AppliedPreview type={selectedType} tokens={previewTokens} />
            <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              {previewRows.map((token) => {
                const statusLabel = createdPathSet.has(token.path)
                  ? 'New'
                  : updatedPathSet.has(token.path)
                    ? 'Update'
                    : unchangedPathSet.has(token.path)
                      ? 'Unchanged'
                      : 'Generated';
                const statusClassName = createdPathSet.has(token.path)
                  ? 'bg-[var(--color-figma-success)]/12 text-[var(--color-figma-success)]'
                  : updatedPathSet.has(token.path)
                    ? 'bg-[var(--color-figma-warning)]/12 text-[var(--color-figma-warning)]'
                    : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]';

                return (
                  <div
                    key={token.path}
                    className="flex items-start gap-2 border-t border-[var(--color-figma-border)] px-2.5 py-2 first:border-t-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] text-[var(--color-figma-text)]" title={token.path}>
                        {token.path}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]" title={formatValue(token.value)}>
                        {formatValue(token.value)}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${statusClassName}`}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
              {previewTokens.length > previewRows.length && (
                <div className="border-t border-[var(--color-figma-border)] px-2.5 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                  {previewTokens.length - previewRows.length} more generated token
                  {previewTokens.length - previewRows.length === 1 ? '' : 's'} in this group.
                </div>
              )}
            </div>
          </div>
        </section>
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
