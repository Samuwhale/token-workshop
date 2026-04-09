import React, { useMemo, useState } from "react";
import type { ThemeDimension } from "@tokenmanager/core";
import type { CoverageMap, MissingOverridesMap } from "./themeManagerTypes";
import type { ThemeIssueSummary } from "../shared/themeWorkflow";

interface ThemeCoverageMatrixProps {
  dimensions: ThemeDimension[];
  coverage: CoverageMap;
  missingOverrides: MissingOverridesMap;
  setTokenValues: Record<string, Record<string, any>>;
  issueEntries: ThemeIssueSummary[];
  onSelectIssue: (issue: ThemeIssueSummary) => void;
  onSelectOption: (
    dimId: string,
    optionName: string,
    preferredSetName?: string | null,
  ) => void;
}

function firstSegment(path: string): string {
  let end = path.length;
  const slash = path.indexOf("/");
  const dot = path.indexOf(".");
  if (slash !== -1) end = Math.min(end, slash);
  if (dot !== -1) end = Math.min(end, dot);
  return path.slice(0, end) || path;
}

interface CellData {
  totalPaths: number;
  uncoveredCount: number;
  missingOverrideCount: number;
}

interface DimMatrixData {
  dim: ThemeDimension;
  groups: string[];
  cells: CellData[][];
  hasGaps: boolean;
}

const issueToneClassByKind: Record<ThemeIssueSummary["kind"], string> = {
  "stale-set":
    "border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10",
  "empty-override":
    "border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/8",
  "missing-override": "border-violet-500/25 bg-violet-500/8",
  "coverage-gap":
    "border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/8",
};

const issueCountToneClassByKind: Record<ThemeIssueSummary["kind"], string> = {
  "stale-set":
    "bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)]",
  "empty-override":
    "bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]",
  "missing-override": "bg-violet-500/15 text-violet-600",
  "coverage-gap":
    "bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]",
};

export function ThemeCoverageMatrix({
  dimensions,
  coverage,
  missingOverrides,
  setTokenValues,
  issueEntries,
  onSelectIssue,
  onSelectOption,
}: ThemeCoverageMatrixProps) {
  const [showAllGroups, setShowAllGroups] = useState(false);

  const matrixData: DimMatrixData[] = useMemo(() => {
    return dimensions.map((dim) => {
      const allGroupsSet = new Set<string>();

      for (const opt of dim.options) {
        for (const [setName, status] of Object.entries(opt.sets)) {
          if (status === "disabled") continue;
          const tokens = setTokenValues[setName];
          if (!tokens) continue;
          for (const path of Object.keys(tokens)) {
            allGroupsSet.add(firstSegment(path));
          }
        }
      }

      const dimCov = coverage[dim.id] ?? {};
      const dimMissing = missingOverrides[dim.id] ?? {};
      for (const optCov of Object.values(dimCov)) {
        for (const item of optCov.uncovered) {
          allGroupsSet.add(firstSegment(item.path));
        }
      }
      for (const optMissing of Object.values(dimMissing)) {
        for (const item of optMissing.missing) {
          allGroupsSet.add(firstSegment(item.path));
        }
      }

      const groups = Array.from(allGroupsSet).sort();
      const cells: CellData[][] = groups.map((group: string) => {
        return dim.options.map((opt: ThemeDimension["options"][number]) => {
          let totalPaths = 0;
          for (const [setName, status] of Object.entries(opt.sets)) {
            if (status === "disabled") continue;
            const tokens = setTokenValues[setName];
            if (!tokens) continue;
            for (const path of Object.keys(tokens)) {
              if (firstSegment(path) === group) totalPaths += 1;
            }
          }

          const uncovered = dimCov[opt.name]?.uncovered ?? [];
          const uncoveredCount = uncovered.filter(
            (item) => firstSegment(item.path) === group,
          ).length;
          const missing = dimMissing[opt.name]?.missing ?? [];
          const missingOverrideCount = missing.filter(
            (item) => firstSegment(item.path) === group,
          ).length;

          return { totalPaths, uncoveredCount, missingOverrideCount };
        });
      });

      const hasGaps = dim.options.some(
        (_: ThemeDimension["options"][number], optionIndex: number) => {
          return groups.some((__: string, groupIndex: number) => {
            const cell = cells[groupIndex][optionIndex];
            return cell.uncoveredCount > 0 || cell.missingOverrideCount > 0;
          });
        },
      );

      return { dim, groups, cells, hasGaps };
    });
  }, [coverage, dimensions, missingOverrides, setTokenValues]);

  if (dimensions.length === 0) {
    return (
      <div className="py-8 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
        No dimensions defined yet
      </div>
    );
  }

  const anyGaps = matrixData.some((data) => data.hasGaps);

  return (
    <div className="flex flex-col gap-3 px-3 py-2">
      {issueEntries.length > 0 && (
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30">
          <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
            <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              Issue handoff
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Review each issue, then jump straight back into the matching
              option role editor.
            </div>
          </div>
          <div className="flex flex-col gap-2 p-2">
            {issueEntries.map((issue) => (
              <div
                key={issue.key}
                className={`rounded-lg border px-2.5 py-2 ${issueToneClassByKind[issue.kind]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                        {issue.title}
                      </span>
                      <span
                        className={`inline-flex items-center justify-center min-w-[18px] rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${issueCountToneClassByKind[issue.kind]}`}
                      >
                        {issue.count}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                      {issue.dimensionName} / {issue.optionName}
                    </div>
                    <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                      {issue.summary}
                    </div>
                    <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                      Next: {issue.recommendedNextAction}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() =>
                        onSelectOption(
                          issue.dimensionId,
                          issue.optionName,
                          issue.preferredSetName,
                        )
                      }
                      className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/35 hover:text-[var(--color-figma-text)]"
                    >
                      Edit set roles
                    </button>
                    <button
                      onClick={() => onSelectIssue(issue)}
                      className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/35 hover:text-[var(--color-figma-text)]"
                    >
                      Focus issue
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[9px] text-[var(--color-figma-text-tertiary)]">
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]">
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          Complete
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] text-[8px] font-bold">
            N
          </span>
          Unresolved aliases
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-violet-500/15 text-violet-500 text-[8px] font-bold">
            N
          </span>
          Missing overrides
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[var(--color-figma-border)]/60 text-[var(--color-figma-text-tertiary)]">
            -
          </span>
          No tokens
        </span>
        {!showAllGroups && anyGaps && (
          <button
            onClick={() => setShowAllGroups(true)}
            className="ml-auto text-[9px] text-[var(--color-figma-accent)] hover:underline"
          >
            Show all groups
          </button>
        )}
        {showAllGroups && (
          <button
            onClick={() => setShowAllGroups(false)}
            className="ml-auto text-[9px] text-[var(--color-figma-accent)] hover:underline"
          >
            Show gaps only
          </button>
        )}
      </div>

      {matrixData.map(({ dim, groups, cells, hasGaps }) => {
        if (!hasGaps && !showAllGroups) return null;

        const visibleGroupIndices = groups
          .map((_, groupIndex) => groupIndex)
          .filter((groupIndex) => {
            if (showAllGroups) return true;
            return dim.options.some(
              (__: ThemeDimension["options"][number], optionIndex: number) => {
                const cell = cells[groupIndex][optionIndex];
                return cell.uncoveredCount > 0 || cell.missingOverrideCount > 0;
              },
            );
          });

        if (visibleGroupIndices.length === 0 && !showAllGroups) return null;

        const totalIssues = dim.options.reduce(
          (sum: number, option: ThemeDimension["options"][number]) => {
            return (
              sum +
              issueEntries
                .filter(
                  (issue) =>
                    issue.dimensionId === dim.id &&
                    issue.optionName === option.name,
                )
                .reduce(
                  (issueSum: number, issue: ThemeIssueSummary) =>
                    issueSum + issue.count,
                  0,
                )
            );
          },
          0,
        );

        return (
          <div
            key={dim.id}
            className="overflow-hidden rounded border border-[var(--color-figma-border)]"
          >
            <div className="flex items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
              <span className="flex-1 truncate text-[11px] font-semibold text-[var(--color-figma-text)]">
                {dim.name}
              </span>
              {totalIssues > 0 ? (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--color-figma-warning)]/20 px-1 py-0.5 text-[9px] font-bold text-[var(--color-figma-warning)]">
                  {totalIssues}
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-figma-success)]">
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  All complete
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-[var(--color-figma-bg-secondary)]/50">
                    <th className="w-24 min-w-[80px] border-b border-[var(--color-figma-border)] px-2 py-1 text-left text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                      Group
                    </th>
                    {dim.options.map(
                      (
                        option: ThemeDimension["options"][number],
                        optionIndex: number,
                      ) => {
                        const optionIssues = issueEntries.filter(
                          (issue) =>
                            issue.dimensionId === dim.id &&
                            issue.optionName === option.name,
                        );
                        const optionIssueCount = optionIssues.reduce(
                          (sum, issue) => sum + issue.count,
                          0,
                        );
                        const preferredSetName =
                          optionIssues[0]?.preferredSetName ?? null;

                        return (
                          <th
                            key={option.name}
                            className="border-b border-[var(--color-figma-border)] px-1 py-1 text-center text-[9px] font-medium text-[var(--color-figma-text-secondary)] whitespace-nowrap"
                          >
                            <button
                              onClick={() =>
                                onSelectOption(
                                  dim.id,
                                  option.name,
                                  preferredSetName,
                                )
                              }
                              className="flex w-full flex-col items-center gap-0.5 transition-colors hover:text-[var(--color-figma-text)]"
                              title={`Edit ${dim.name} / ${option.name}`}
                            >
                              <span className="max-w-[60px] truncate">
                                {option.name}
                              </span>
                              {optionIssueCount > 0 && (
                                <span className="inline-flex min-w-[14px] items-center justify-center rounded-full bg-[var(--color-figma-warning)]/20 px-0.5 py-0.5 text-[8px] font-bold text-[var(--color-figma-warning)]">
                                  {optionIssueCount}
                                </span>
                              )}
                            </button>
                          </th>
                        );
                      },
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleGroupIndices.map(
                    (groupIndex: number, rowIndex: number) => {
                      const group = groups[groupIndex];
                      const isEven = rowIndex % 2 === 0;

                      return (
                        <tr
                          key={group}
                          className={
                            isEven
                              ? "bg-[var(--color-figma-bg)]"
                              : "bg-[var(--color-figma-bg-secondary)]/30"
                          }
                        >
                          <td
                            className="max-w-[96px] truncate border-r border-[var(--color-figma-border)] px-2 py-1 font-mono text-[9px] text-[var(--color-figma-text-secondary)]"
                            title={group}
                          >
                            {group}
                          </td>
                          {dim.options.map(
                            (
                              option: ThemeDimension["options"][number],
                              optionIndex: number,
                            ) => {
                              const optionIssues = issueEntries.filter(
                                (issue) =>
                                  issue.dimensionId === dim.id &&
                                  issue.optionName === option.name,
                              );
                              const preferredSetName =
                                optionIssues[0]?.preferredSetName ?? null;
                              return (
                                <CoverageCell
                                  key={option.name}
                                  cell={cells[groupIndex][optionIndex]}
                                  onClick={() =>
                                    onSelectOption(
                                      dim.id,
                                      option.name,
                                      preferredSetName,
                                    )
                                  }
                                  title={`${dim.name} / ${option.name} / ${group}`}
                                />
                              );
                            },
                          )}
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>

            {!showAllGroups &&
              (() => {
                const hiddenCount = groups.length - visibleGroupIndices.length;
                if (hiddenCount === 0) return null;

                return (
                  <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 px-2 py-1 text-[9px] text-[var(--color-figma-text-tertiary)]">
                    {hiddenCount} group{hiddenCount === 1 ? "" : "s"} fully
                    covered (hidden)
                    <button
                      onClick={() => setShowAllGroups(true)}
                      className="ml-1 text-[var(--color-figma-accent)] hover:underline"
                    >
                      Show
                    </button>
                  </div>
                );
              })()}
          </div>
        );
      })}

      {!anyGaps && !showAllGroups && (
        <div className="flex flex-col items-center gap-1 py-4 text-center text-[11px] text-[var(--color-figma-success)]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          All visible coverage groups are complete
        </div>
      )}
    </div>
  );
}

interface CoverageCellProps {
  cell: CellData;
  onClick: () => void;
  title: string;
}

function CoverageCell({ cell, onClick, title }: CoverageCellProps) {
  const { totalPaths, uncoveredCount, missingOverrideCount } = cell;
  const totalGaps = uncoveredCount + missingOverrideCount;

  let content: React.ReactNode;
  let bgClass = "";

  if (totalPaths === 0 && totalGaps === 0) {
    content = (
      <span className="text-[var(--color-figma-text-tertiary)] text-[9px]">
        -
      </span>
    );
  } else if (totalGaps === 0) {
    content = (
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
    bgClass = "text-[var(--color-figma-success)]";
  } else if (uncoveredCount > 0 && missingOverrideCount > 0) {
    content = (
      <span className="flex items-center gap-0.5">
        <span className="text-[var(--color-figma-warning)] text-[9px] font-bold">
          {uncoveredCount}
        </span>
        <span className="text-[var(--color-figma-text-tertiary)] text-[8px]">
          +
        </span>
        <span className="text-violet-500 text-[9px] font-bold">
          {missingOverrideCount}
        </span>
      </span>
    );
    bgClass = "bg-[var(--color-figma-warning)]/5";
  } else if (uncoveredCount > 0) {
    content = (
      <span className="text-[var(--color-figma-warning)] text-[9px] font-bold">
        {uncoveredCount}
      </span>
    );
    bgClass = "bg-[var(--color-figma-warning)]/8";
  } else {
    content = (
      <span className="text-violet-500 text-[9px] font-bold">
        {missingOverrideCount}
      </span>
    );
    bgClass = "bg-violet-500/5";
  }

  return (
    <td
      className={`border-r border-[var(--color-figma-border)] px-1 py-1 text-center last:border-r-0 ${bgClass}`}
    >
      <button
        onClick={onClick}
        title={
          title +
          (totalGaps > 0
            ? ` - ${totalGaps} issue${totalGaps === 1 ? "" : "s"}`
            : " - complete")
        }
        className="flex h-full min-h-[18px] w-full min-w-[24px] items-center justify-center transition-opacity hover:opacity-75"
        aria-label={title}
      >
        {content}
      </button>
    </td>
  );
}
