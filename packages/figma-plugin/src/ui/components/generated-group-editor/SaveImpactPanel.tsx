import type {
  GeneratedTokenResult,
} from "../../hooks/useGenerators";
import type { GeneratorPreviewAnalysis } from "../../hooks/useGeneratedGroupPreview";
import { Spinner } from "../Spinner";
import { AUTHORING } from "../../shared/editorClasses";
import { RiskDetailSections } from "./RiskDetailSections";

export interface SaveImpactPanelProps {
  previewAnalysis: GeneratorPreviewAnalysis | null;
  previewTokens: GeneratedTokenResult[];
  targetCollection: string;
  hasReviewableImpact: boolean;
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  saveError: string;
  keepUpdated: boolean;
}

function ImpactSummaryLine({ analysis }: { analysis: GeneratorPreviewAnalysis }) {
  const safeCreates = analysis.safeCreateCount;
  const safeUpdates = (analysis.safeUpdates ?? []).length;
  const overwrites = (analysis.nonGeneratorOverwrites ?? []).length;
  const conflicts = (analysis.manualEditConflicts ?? []).length;
  const deleted = (analysis.deletedOutputs ?? []).length;
  const manualExceptions = (analysis.manualExceptions ?? []).length;

  const parts: string[] = [];
  if (safeCreates > 0) parts.push(`${safeCreates} new`);
  if (safeUpdates > 0) parts.push(`${safeUpdates} updated`);
  if (overwrites > 0)
    parts.push(`${overwrites} overwrite${overwrites !== 1 ? "s" : ""}`);
  if (conflicts > 0)
    parts.push(`${conflicts} conflict${conflicts !== 1 ? "s" : ""}`);
  if (deleted > 0) parts.push(`${deleted} removed`);
  if (manualExceptions > 0) {
    parts.push(
      `${manualExceptions} manual exception${manualExceptions !== 1 ? "s" : ""}`,
    );
  }

  if (parts.length === 0) return null;

  const hasRisk = overwrites > 0 || conflicts > 0 || deleted > 0;

  return (
    <div
      className={`px-2.5 py-2 rounded-md text-secondary ${
        hasRisk
          ? "border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/5 text-[var(--color-figma-warning)]"
          : "border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"
      }`}
    >
      {parts.join(" · ")}
    </div>
  );
}

export function SaveImpactPanel({
  previewAnalysis,
  previewTokens,
  targetCollection,
  hasReviewableImpact,
  overwritePendingPaths,
  overwriteCheckLoading,
  overwriteCheckError,
  saveError,
  keepUpdated,
}: SaveImpactPanelProps) {
  if (previewTokens.length === 0 && !saveError) {
    return null;
  }

  const keepUpdatedNote = keepUpdated
    ? "These tokens stay linked to the generator. Direct edits will be overwritten on the next run."
    : "These tokens will save as authored values; the generator will no longer update them.";

  return (
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      <div className={AUTHORING.generatorSectionCard}>
        <div className={AUTHORING.generatorTitleBlock}>
          <h4 className={AUTHORING.generatorTitle}>Save impact</h4>
          <p className={AUTHORING.generatorDescription}>{keepUpdatedNote}</p>
        </div>

        {previewAnalysis && <ImpactSummaryLine analysis={previewAnalysis} />}

        {overwriteCheckLoading && (
          <div className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
            <Spinner size="sm" />
            <span className="text-secondary">Checking&hellip;</span>
          </div>
        )}
        {!overwriteCheckLoading && overwriteCheckError && (
          <div className="mt-2 text-secondary text-[var(--color-figma-text-secondary)] px-2.5 py-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {overwriteCheckError}
          </div>
        )}

        {!overwriteCheckLoading && overwritePendingPaths.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 px-2.5 py-2 rounded-md border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10">
            <span className="text-secondary font-medium text-[var(--color-figma-warning)]">
              {overwritePendingPaths.length} manually edited token
              {overwritePendingPaths.length !== 1 ? "s" : ""} will be overwritten
            </span>
            <div className="max-h-[80px] overflow-y-auto flex flex-col gap-0.5">
              {overwritePendingPaths.map((p) => (
                <div
                  key={p}
                  className="text-secondary font-mono text-[var(--color-figma-warning)]/80 truncate"
                  title={p}
                >
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasReviewableImpact && previewAnalysis && (
        <RiskDetailSections
          previewAnalysis={previewAnalysis}
          targetCollection={targetCollection}
        />
      )}

      {saveError && (
        <div className="text-secondary text-[var(--color-figma-error)]">{saveError}</div>
      )}
    </section>
  );
}
