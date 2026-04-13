import type { ThemeDimension } from "@tokenmanager/core";
import { ThemeCoverageMatrix } from "../ThemeCoverageMatrix";
import type { CoverageMap, MissingOverridesMap } from "../themeManagerTypes";
import type { ThemeAutoFillAction } from "./themeAutoFillTargets";
import {
  groupThemeIssuesForReview,
  type ThemeRoleNavigationTarget,
  type ThemeIssueSummary,
} from "../../shared/themeWorkflow";
import { ThemeIssueEntryCard } from "./ThemeIssueEntryCard";

interface ThemeCoverageScreenProps {
  dimensions: ThemeDimension[];
  allDimensions: ThemeDimension[];
  coverage: CoverageMap;
  missingOverrides: MissingOverridesMap;
  setTokenValues: Record<string, Record<string, any>>;
  issueEntries: ThemeIssueSummary[];
  focusDimension: ThemeDimension | null;
  focusOptionName: string | null;
  focusIssueCount: number;
  primaryIssue: ThemeIssueSummary | null;
  showAllAxes: boolean;
  context: ThemeRoleNavigationTarget;
  autoFillAction: ThemeAutoFillAction | null;
  isAutoFillInProgress: boolean;
  onToggleShowAllAxes: () => void;
  onBack: (target?: ThemeRoleNavigationTarget | null) => void;
  onAutoFill: () => void;
  onResolveIssue: (issue: ThemeIssueSummary) => void;
  onSelectOption: (
    dimId: string,
    optionName: string,
    preferredSetName?: string | null,
  ) => void;
}

export function ThemeCoverageScreen({
  dimensions,
  allDimensions,
  coverage,
  missingOverrides,
  setTokenValues,
  issueEntries,
  focusDimension,
  focusOptionName,
  focusIssueCount,
  primaryIssue,
  showAllAxes,
  context,
  autoFillAction,
  isAutoFillInProgress,
  onToggleShowAllAxes,
  onBack,
  onAutoFill,
  onResolveIssue,
  onSelectOption,
}: ThemeCoverageScreenProps) {
  const focusedIssueLabel =
    focusIssueCount === 1 ? "1 issue" : `${focusIssueCount} issues`;
  const autoFillLabel = autoFillAction
    ? autoFillAction.fillableCount === 1
      ? "1 fillable gap"
      : `${autoFillAction.fillableCount} fillable gaps`
    : null;
  const autoFillDescription = autoFillAction
    ? autoFillAction.mode === "single-option" && autoFillAction.optionName
      ? `${autoFillLabel} in ${autoFillAction.optionName}. Auto-fill opens the same preview and strategy confirmation used in authoring.`
      : `${autoFillLabel} across ${autoFillAction.optionCount} options in ${autoFillAction.dimensionName}. Auto-fill opens the same preview and strategy confirmation used in authoring.`
    : null;
  const reviewGroups = groupThemeIssuesForReview(issueEntries);

  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              {showAllAxes || !focusDimension
                ? "Review issues"
                : `Review ${focusDimension.name}`}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              {autoFillDescription
                ? autoFillDescription
                : showAllAxes || !focusDimension
                ? "Started from the current mode context and expanded to every variant. Review the grouped issues, then jump back into the affected variant."
                : primaryIssue
                  ? `${focusedIssueLabel} in ${primaryIssue.dimensionName} -> ${primaryIssue.optionName}. ${primaryIssue.recommendedNextAction}`
                  : focusOptionName
                    ? `${focusedIssueLabel} in ${focusDimension.name} -> ${focusOptionName}. Review the grouped issues, then jump back into that variant.`
                    : `${focusedIssueLabel} in ${focusDimension.name}. Review the grouped issues, then jump back into authoring to fix the variant.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {allDimensions.length > 1 && focusDimension && (
              <button
                onClick={onToggleShowAllAxes}
                className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
              >
                {showAllAxes ? `Focus ${focusDimension.name}` : "Show all axes"}
              </button>
            )}
            {autoFillAction && (
              <button
                onClick={onAutoFill}
                disabled={isAutoFillInProgress}
                className="inline-flex items-center gap-1 rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                title={
                  autoFillAction.mode === "single-option" &&
                  autoFillAction.optionName
                    ? `Auto-fill ${autoFillAction.fillableCount} missing token${autoFillAction.fillableCount !== 1 ? "s" : ""} in ${autoFillAction.optionName}`
                    : `Auto-fill ${autoFillAction.fillableCount} missing token${autoFillAction.fillableCount !== 1 ? "s" : ""} across ${autoFillAction.optionCount} option${autoFillAction.optionCount !== 1 ? "s" : ""} in ${autoFillAction.dimensionName}`
                }
              >
                {isAutoFillInProgress
                  ? "Filling…"
                  : `Auto-fill gaps (${autoFillAction.fillableCount})`}
              </button>
            )}
            <button
              onClick={() => onBack(context)}
              className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to authoring
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {reviewGroups.length > 0 && (
          <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 px-3 py-3">
            <div className="flex flex-col gap-3">
              {reviewGroups.map((group) => (
                <section
                  key={group.kind}
                  className="overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]"
                >
                  <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                    <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                      {group.title}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                      {group.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    {group.issues.map((issue) => (
                      <ThemeIssueEntryCard
                        key={issue.key}
                        issue={issue}
                        onAction={() => onResolveIssue(issue)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        <ThemeCoverageMatrix
          dimensions={dimensions}
          coverage={coverage}
          missingOverrides={missingOverrides}
          setTokenValues={setTokenValues}
          issueEntries={issueEntries}
          onSelectOption={onSelectOption}
        />
      </div>
    </>
  );
}
