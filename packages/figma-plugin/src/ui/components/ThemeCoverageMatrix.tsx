import React, { useMemo, useState } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import type { CoverageMap, MissingOverridesMap } from './themeManagerTypes';

interface ThemeCoverageMatrixProps {
  dimensions: ThemeDimension[];
  coverage: CoverageMap;
  missingOverrides: MissingOverridesMap;
  setTokenValues: Record<string, Record<string, any>>;
  /** Called when a cell is clicked — navigates to that dimension+option in the list view */
  onSelectOption: (dimId: string, optionName: string) => void;
}

/** Extract the top-level group name from a token path (before first "." or "/") */
function firstSegment(path: string): string {
  let end = path.length;
  const slash = path.indexOf('/');
  const dot = path.indexOf('.');
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
  /** groups[i] × dim.options[j] → CellData */
  cells: CellData[][];
  /** True if this dimension has any gaps at all */
  hasGaps: boolean;
}

export function ThemeCoverageMatrix({
  dimensions,
  coverage,
  missingOverrides,
  setTokenValues,
  onSelectOption,
}: ThemeCoverageMatrixProps) {
  const [showAllGroups, setShowAllGroups] = useState(false);

  const matrixData: DimMatrixData[] = useMemo(() => {
    return dimensions.map(dim => {
      // Collect all token paths across all sets used by any option in this dimension
      const allGroupsSet = new Set<string>();

      for (const opt of dim.options) {
        for (const [setName, status] of Object.entries(opt.sets)) {
          if (status === 'disabled') continue;
          const tokens = setTokenValues[setName];
          if (!tokens) continue;
          for (const path of Object.keys(tokens)) {
            allGroupsSet.add(firstSegment(path));
          }
        }
      }

      // Also include groups that appear in coverage / missingOverrides even if not in setTokenValues
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

      // For each option, compute per-group active token paths
      const cells: CellData[][] = groups.map(group => {
        return dim.options.map(opt => {
          // Count active tokens in this group for this option
          let totalPaths = 0;
          for (const [setName, status] of Object.entries(opt.sets)) {
            if (status === 'disabled') continue;
            const tokens = setTokenValues[setName];
            if (!tokens) continue;
            for (const path of Object.keys(tokens)) {
              if (firstSegment(path) === group) totalPaths++;
            }
          }

          // Count uncovered tokens in this group
          const uncovered = dimCov[opt.name]?.uncovered ?? [];
          const uncoveredCount = uncovered.filter(i => firstSegment(i.path) === group).length;

          // Count missing overrides in this group
          const missing = dimMissing[opt.name]?.missing ?? [];
          const missingOverrideCount = missing.filter(i => firstSegment(i.path) === group).length;

          return { totalPaths, uncoveredCount, missingOverrideCount };
        });
      });

      const hasGaps = dim.options.some((_, oi) => {
        return groups.some((_, gi) => {
          const c = cells[gi][oi];
          return c.uncoveredCount > 0 || c.missingOverrideCount > 0;
        });
      });

      return { dim, groups, cells, hasGaps };
    });
  }, [dimensions, coverage, missingOverrides, setTokenValues]);

  if (dimensions.length === 0) {
    return (
      <div className="py-8 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
        No dimensions defined yet
      </div>
    );
  }

  const anyGaps = matrixData.some(d => d.hasGaps);

  return (
    <div className="flex flex-col gap-3 px-3 py-2">
      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[9px] text-[var(--color-figma-text-tertiary)]">
        <span className="flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          Complete
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] text-[8px] font-bold">N</span>
          Unresolved aliases
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-violet-500/15 text-violet-500 text-[8px] font-bold">N</span>
          No override
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-[var(--color-figma-border)]/60 text-[var(--color-figma-text-tertiary)]">–</span>
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

      {/* Per-dimension matrices */}
      {matrixData.map(({ dim, groups, cells, hasGaps }) => {
        if (!hasGaps && !showAllGroups) return null;

        // Filter rows: when showAllGroups=false, only show groups with at least one gap
        const visibleGroupIndices = groups
          .map((_, gi) => gi)
          .filter(gi => {
            if (showAllGroups) return true;
            return dim.options.some((_, oi) => {
              const c = cells[gi][oi];
              return c.uncoveredCount > 0 || c.missingOverrideCount > 0;
            });
          });

        if (visibleGroupIndices.length === 0 && !showAllGroups) return null;

        const totalGaps = dim.options.reduce((acc, _, oi) => {
          return acc + groups.reduce((sum, _, gi) => {
            const c = cells[gi][oi];
            return sum + c.uncoveredCount + c.missingOverrideCount;
          }, 0);
        }, 0);

        return (
          <div key={dim.id} className="border border-[var(--color-figma-border)] rounded overflow-hidden">
            {/* Dimension header */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
              <span className="text-[11px] font-semibold text-[var(--color-figma-text)] flex-1 truncate">{dim.name}</span>
              {totalGaps > 0 ? (
                <span className="inline-flex items-center justify-center min-w-[20px] h-[16px] px-1 rounded-full text-[9px] font-bold bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)]">
                  {totalGaps}
                </span>
              ) : (
                <span className="text-[9px] text-[var(--color-figma-success)] flex items-center gap-0.5">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                  All complete
                </span>
              )}
            </div>

            {/* Matrix table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-[var(--color-figma-bg-secondary)]/50">
                    {/* Group name column header */}
                    <th className="text-left px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text-tertiary)] border-b border-[var(--color-figma-border)] w-24 min-w-[80px]">
                      Group
                    </th>
                    {dim.options.map(opt => {
                      const optGaps = groups.reduce((sum, _, gi) => {
                        const c = cells[gi][dim.options.indexOf(opt)];
                        return sum + c.uncoveredCount + c.missingOverrideCount;
                      }, 0);
                      return (
                        <th
                          key={opt.name}
                          className="px-1 py-1 text-[9px] font-medium text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] text-center whitespace-nowrap"
                        >
                          <button
                            onClick={() => onSelectOption(dim.id, opt.name)}
                            className="flex flex-col items-center gap-0.5 hover:text-[var(--color-figma-text)] transition-colors w-full"
                            title={`Go to ${dim.name} / ${opt.name}`}
                          >
                            <span className="truncate max-w-[60px]">{opt.name}</span>
                            {optGaps > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[14px] h-[12px] px-0.5 rounded-full text-[8px] font-bold bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)]">
                                {optGaps}
                              </span>
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleGroupIndices.map((gi, rowIdx) => {
                    const group = groups[gi];
                    const isEven = rowIdx % 2 === 0;
                    return (
                      <tr
                        key={group}
                        className={isEven ? 'bg-[var(--color-figma-bg)]' : 'bg-[var(--color-figma-bg-secondary)]/30'}
                      >
                        {/* Group name */}
                        <td className="px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] border-r border-[var(--color-figma-border)] font-mono truncate max-w-[96px]" title={group}>
                          {group}
                        </td>
                        {/* Per-option cells */}
                        {dim.options.map((opt, oi) => {
                          const cell = cells[gi][oi];
                          return (
                            <CoverageCell
                              key={opt.name}
                              cell={cell}
                              onClick={() => onSelectOption(dim.id, opt.name)}
                              title={`${dim.name} / ${opt.name} / ${group}`}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Show remaining gap-free groups count */}
            {!showAllGroups && (() => {
              const hiddenCount = groups.length - visibleGroupIndices.length;
              if (hiddenCount === 0) return null;
              return (
                <div className="px-2 py-1 text-[9px] text-[var(--color-figma-text-tertiary)] border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30">
                  {hiddenCount} group{hiddenCount !== 1 ? 's' : ''} fully covered (hidden)
                  <button onClick={() => setShowAllGroups(true)} className="ml-1 text-[var(--color-figma-accent)] hover:underline">Show</button>
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* All complete message */}
      {!anyGaps && !showAllGroups && (
        <div className="py-4 text-center text-[11px] text-[var(--color-figma-success)] flex flex-col items-center gap-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          All dimensions fully covered
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
  let bgClass: string;

  if (totalPaths === 0 && totalGaps === 0) {
    // No tokens in this group for this option
    content = <span className="text-[var(--color-figma-text-tertiary)] text-[9px]">–</span>;
    bgClass = '';
  } else if (totalGaps === 0) {
    // All covered
    content = (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
    bgClass = 'text-[var(--color-figma-success)]';
  } else if (uncoveredCount > 0 && missingOverrideCount > 0) {
    // Both types of gaps
    content = (
      <span className="flex items-center gap-0.5">
        <span className="text-[var(--color-figma-warning)] text-[9px] font-bold">{uncoveredCount}</span>
        <span className="text-[var(--color-figma-text-tertiary)] text-[8px]">+</span>
        <span className="text-violet-500 text-[9px] font-bold">{missingOverrideCount}</span>
      </span>
    );
    bgClass = 'bg-[var(--color-figma-warning)]/5';
  } else if (uncoveredCount > 0) {
    // Unresolved aliases
    content = (
      <span className="text-[var(--color-figma-warning)] text-[9px] font-bold">{uncoveredCount}</span>
    );
    bgClass = 'bg-[var(--color-figma-warning)]/8';
  } else {
    // Missing overrides only
    content = (
      <span className="text-violet-500 text-[9px] font-bold">{missingOverrideCount}</span>
    );
    bgClass = 'bg-violet-500/5';
  }

  return (
    <td className={`px-1 py-1 text-center border-r border-[var(--color-figma-border)] last:border-r-0 ${bgClass}`}>
      <button
        onClick={onClick}
        title={title + (totalGaps > 0 ? ` — ${totalGaps} gap${totalGaps !== 1 ? 's' : ''}` : ' — complete')}
        className="flex items-center justify-center w-full h-full min-w-[24px] min-h-[18px] hover:opacity-75 transition-opacity"
        aria-label={title}
      >
        {content}
      </button>
    </td>
  );
}
