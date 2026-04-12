import type { ThemeDimension } from "@tokenmanager/core";
import { ThemeCoverageMatrix } from "../ThemeCoverageMatrix";
import type { CoverageMap, MissingOverridesMap } from "../themeManagerTypes";
import type { ThemeIssueSummary } from "../../shared/themeWorkflow";
import type { ThemeRoleNavigationTarget } from "../../shared/themeWorkflow";

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
  onToggleShowAllAxes: () => void;
  onBack: (target?: ThemeRoleNavigationTarget | null) => void;
  onSelectIssue: (issue: ThemeIssueSummary) => void;
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
  onToggleShowAllAxes,
  onBack,
  onSelectIssue,
  onSelectOption,
}: ThemeCoverageScreenProps) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              {showAllAxes || !focusDimension
                ? "Coverage review"
                : `Coverage for ${focusDimension.name}`}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              {showAllAxes || !focusDimension
                ? "Started from the current theme context and expanded to every axis. Focus any issue, then jump straight back into the matching role editor."
                : primaryIssue
                  ? `${primaryIssue.dimensionName} -> ${primaryIssue.optionName}: ${primaryIssue.recommendedNextAction}`
                  : focusOptionName
                    ? `Review issue summaries for ${focusDimension.name} -> ${focusOptionName}, then jump straight back into that option's set roles.`
                    : "Review issue summaries for the current axis, then jump back into authoring to fix the mapping."}
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
              Back to set roles
            </button>
          </div>
        </div>
        {!showAllAxes && focusDimension && (
          <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
              <span className="font-medium text-[var(--color-figma-text-secondary)]">
                Axis
              </span>
              <span>{focusDimension.name}</span>
            </span>
            {focusOptionName && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                <span className="font-medium text-[var(--color-figma-text-secondary)]">
                  Option
                </span>
                <span>{focusOptionName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
              <span className="font-medium text-[var(--color-figma-text-secondary)]">
                Issues
              </span>
              <span>{focusIssueCount}</span>
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <ThemeCoverageMatrix
          dimensions={dimensions}
          coverage={coverage}
          missingOverrides={missingOverrides}
          setTokenValues={setTokenValues}
          issueEntries={issueEntries}
          onSelectIssue={onSelectIssue}
          onSelectOption={onSelectOption}
        />
      </div>
    </>
  );
}
