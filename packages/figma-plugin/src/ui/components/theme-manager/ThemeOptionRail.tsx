import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
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
  // Variant action callbacks (rendered as ... menu at end of rail)
  onStartRenameOption?: () => void;
  onMoveOption?: (direction: "up" | "down") => void;
  onDuplicateOption?: () => void;
  onDeleteOption?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  copySourceOptions?: string[];
  onHandleCopyAssignmentsFrom?: (sourceOptionName: string) => void;
  onOpenAdvancedSetup?: () => void;
  onOpenCoverageView?: () => void;
  disabledSetCount?: number;
}

export function ThemeOptionRail({
  dimension,
  selectedOption,
  optionDiffCounts,
  optionRoleSummaries,
  onSelectOption,
  showAddOption,
  onStartRenameOption,
  onMoveOption,
  onDuplicateOption,
  onDeleteOption,
  canMoveLeft,
  canMoveRight,
  copySourceOptions,
  onHandleCopyAssignmentsFrom,
  onOpenAdvancedSetup,
  onOpenCoverageView,
  disabledSetCount,
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

  const variantMenu = useDropdownMenu();

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
            title="Add variant"
          >
            +
          </button>
        )}
        {/* Variant actions menu */}
        {selectedOption && onStartRenameOption && (
          <div className="relative shrink-0 ml-auto">
            <button
              ref={variantMenu.triggerRef}
              onClick={variantMenu.toggle}
              className="rounded p-1 text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)]"
              title="Variant actions"
              aria-label="Variant actions"
              aria-expanded={variantMenu.open}
              aria-haspopup="menu"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>
            {variantMenu.open && (
              <div
                ref={variantMenu.menuRef}
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-[180px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
              >
                <button role="menuitem" onClick={() => { variantMenu.close(); onStartRenameOption(); }} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">
                  Rename
                </button>
                {onMoveOption && (
                  <>
                    <button role="menuitem" onClick={() => { variantMenu.close(); onMoveOption("up"); }} disabled={!canMoveLeft} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-35 disabled:pointer-events-none">
                      Move left
                    </button>
                    <button role="menuitem" onClick={() => { variantMenu.close(); onMoveOption("down"); }} disabled={!canMoveRight} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-35 disabled:pointer-events-none">
                      Move right
                    </button>
                  </>
                )}
                {onDuplicateOption && (
                  <button role="menuitem" onClick={() => { variantMenu.close(); onDuplicateOption(); }} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">
                    Duplicate
                  </button>
                )}
                {copySourceOptions && copySourceOptions.length > 0 && onHandleCopyAssignmentsFrom && (
                  <>
                    <div className="my-1 border-t border-[var(--color-figma-border)]" />
                    {copySourceOptions.map((src) => (
                      <button key={src} role="menuitem" onClick={() => { variantMenu.close(); onHandleCopyAssignmentsFrom(src); }} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">
                        Copy setup from {src}
                      </button>
                    ))}
                  </>
                )}
                <div className="my-1 border-t border-[var(--color-figma-border)]" />
                {onOpenAdvancedSetup && (
                  <button role="menuitem" onClick={() => { variantMenu.close(); onOpenAdvancedSetup(); }} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">
                    {`Advanced${disabledSetCount ? ` (${disabledSetCount} unused)` : ""}`}
                  </button>
                )}
                {onOpenCoverageView && (
                  <button role="menuitem" onClick={() => { variantMenu.close(); onOpenCoverageView(); }} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">
                    Review issues
                  </button>
                )}
                {onDeleteOption && (
                  <>
                    <div className="my-1 border-t border-[var(--color-figma-border)]" />
                    <button role="menuitem" onClick={() => { variantMenu.close(); onDeleteOption(); }} className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10">
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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
