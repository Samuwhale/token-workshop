import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { NoticeCountBadge } from "../../shared/noticeSystem";
import type { ThemeOptionRoleSummary } from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";

interface ThemeOptionRailProps {
  dimension: ThemeDimension;
  selectedOption: string;
  optionDiffCounts: Record<string, number>;
  optionRoleSummaries: Record<string, ThemeOptionRoleSummary>;
  onSelectOption: (dimId: string, optionName: string) => void;
  showAddOption: boolean;
}

export function ThemeOptionRail({
  dimension,
  selectedOption,
  optionDiffCounts,
  optionRoleSummaries,
  onSelectOption,
  showAddOption,
}: ThemeOptionRailProps) {
  const {
    dimSearch,
    tabScrollRefs,
    tabScrollState,
    scrollOptionRail,
    setShowAddOption,
    handleOptDragStart,
    handleOptDragOver,
    handleOptDrop,
    handleOptDragEnd,
    draggingOpt,
    dragOverOpt,
  } = useThemeAuthoringContext();

  if (dimension.options.length === 0) return null;

  return (
    <div className="relative flex items-stretch border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      {tabScrollState[dimension.id]?.left && (
        <button
          onClick={() => scrollOptionRail(dimension.id, "left")}
          className="absolute bottom-0 left-0 top-0 z-10 flex items-center bg-gradient-to-r from-[var(--color-figma-bg)] to-transparent px-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
          aria-label="Scroll options left"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6 1L2 4l4 3V1z" />
          </svg>
        </button>
      )}
      <div
        ref={(element) => {
          tabScrollRefs.current[dimension.id] = element;
        }}
        className="flex items-center gap-0 overflow-x-auto px-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {dimension.options.map((item: ThemeOption) => {
          const optionMatches =
            dimSearch.trim() !== "" &&
            item.name.toLowerCase().includes(dimSearch.trim().toLowerCase());
          const summary = optionRoleSummaries[`${dimension.id}:${item.name}`];
          const issueCount = summary?.totalIssueCount ?? 0;
          const isSelected = selectedOption === item.name;
          const diffCount = isSelected
            ? 0
            : (optionDiffCounts[`${dimension.id}/${item.name}`] ?? 0);
          const isBeingDragged =
            draggingOpt?.dimId === dimension.id &&
            draggingOpt?.optionName === item.name;
          const isDragTarget =
            dragOverOpt?.dimId === dimension.id &&
            dragOverOpt?.optionName === item.name &&
            draggingOpt?.optionName !== item.name;

          return (
            <button
              key={item.name}
              draggable={dimension.options.length > 1}
              onDragStart={(event) =>
                handleOptDragStart(event, dimension.id, item.name)
              }
              onDragOver={(event) =>
                handleOptDragOver(event, dimension.id, item.name)
              }
              onDrop={(event) => handleOptDrop(event, dimension.id, item.name)}
              onDragEnd={handleOptDragEnd}
              onClick={() => onSelectOption(dimension.id, item.name)}
              className={`relative flex shrink-0 items-center gap-1 rounded-t px-2.5 py-1 text-[10px] font-medium transition-colors ${
                isSelected
                  ? "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-accent)]"
                  : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              }${optionMatches ? " ring-1 ring-[var(--color-figma-accent)]/40" : ""}${isBeingDragged ? " opacity-40" : ""}${isDragTarget ? " ring-2 ring-[var(--color-figma-accent)]/60" : ""}${dimension.options.length > 1 ? " cursor-grab active:cursor-grabbing" : ""}`}
            >
              {item.name}
              {!isSelected && diffCount > 0 && (
                <span
                  className="inline-flex min-w-[14px] items-center justify-center rounded-full bg-[var(--color-figma-text-tertiary)]/20 px-0.5 text-[9px] font-bold leading-none text-[var(--color-figma-text-tertiary)]"
                  title={`${diffCount} token${diffCount !== 1 ? "s" : ""} differ from ${selectedOption}`}
                >
                  {diffCount}
                </span>
              )}
              {issueCount > 0 && (
                <NoticeCountBadge
                  severity={summary?.hasAssignmentIssues ? "warning" : "info"}
                  count={issueCount}
                  title={`${issueCount} issue${issueCount === 1 ? "" : "s"}`}
                />
              )}
              {isSelected && (
                <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-[var(--color-figma-accent)]" />
              )}
            </button>
          );
        })}
        {!showAddOption && (
          <button
            onClick={() =>
              setShowAddOption((current) => ({
                ...current,
                [dimension.id]: true,
              }))
            }
            className="shrink-0 px-1.5 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
            title="Add option"
          >
            +
          </button>
        )}
      </div>
      {tabScrollState[dimension.id]?.right && (
        <button
          onClick={() => scrollOptionRail(dimension.id, "right")}
          className="absolute bottom-0 right-0 top-0 z-10 flex items-center bg-gradient-to-l from-[var(--color-figma-bg)] to-transparent px-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
          aria-label="Scroll options right"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
        </button>
      )}
    </div>
  );
}
