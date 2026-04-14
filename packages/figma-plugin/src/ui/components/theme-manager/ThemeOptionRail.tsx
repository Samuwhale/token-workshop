import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import { NoticeCountBadge } from "../../shared/noticeSystem";
import type { ThemeOptionRoleSummary } from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";

interface ThemeOptionRailProps {
  dimension: ThemeDimension;
  selectedOption: string;
  optionRoleSummaries: Record<string, ThemeOptionRoleSummary>;
  onSelectOption: (dimId: string, optionName: string) => void;
  showAddOption: boolean;
  onStartRenameOption?: () => void;
  onDuplicateOption?: () => void;
  onDeleteOption?: () => void;
  copySourceOptions?: string[];
  onHandleCopyAssignmentsFrom?: (sourceOptionName: string) => void;
}

export function ThemeOptionRail({
  dimension,
  selectedOption,
  optionRoleSummaries,
  onSelectOption,
  showAddOption,
  onStartRenameOption,
  onDuplicateOption,
  onDeleteOption,
  copySourceOptions,
  onHandleCopyAssignmentsFrom,
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

  const valueMenu = useDropdownMenu();

  if (dimension.options.length === 0) return null;

  return (
    <div className="flex items-stretch gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
      <div className="relative min-w-0 flex-1">
        {tabScrollState[dimension.id]?.left && (
          <button
            type="button"
            onClick={() => scrollOptionRail(dimension.id, "left")}
            className="absolute bottom-0 left-0 top-0 z-10 flex items-center bg-gradient-to-r from-[var(--color-figma-bg)] to-transparent px-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
            aria-label="Scroll values left"
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
          className="flex items-center gap-0 overflow-x-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {dimension.options.map((item: ThemeOption) => {
            const optionMatches =
              dimSearch.trim() !== "" &&
              item.name.toLowerCase().includes(dimSearch.trim().toLowerCase());
            const summary = optionRoleSummaries[`${dimension.id}:${item.name}`];
            const issueCount = summary?.totalIssueCount ?? 0;
            const isSelected = selectedOption === item.name;
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
                type="button"
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
                className={`relative flex shrink-0 items-center gap-1.5 rounded-t-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isSelected
                    ? "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-accent)]"
                    : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                }${optionMatches ? " ring-1 ring-[var(--color-figma-accent)]/40" : ""}${isBeingDragged ? " opacity-40" : ""}${isDragTarget ? " ring-2 ring-[var(--color-figma-accent)]/60" : ""}${dimension.options.length > 1 ? " cursor-grab active:cursor-grabbing" : ""}`}
              >
                <span className="max-w-[120px] truncate">{item.name}</span>
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
        </div>
        {tabScrollState[dimension.id]?.right && (
          <button
            type="button"
            onClick={() => scrollOptionRail(dimension.id, "right")}
            className="absolute bottom-0 right-0 top-0 z-10 flex items-center bg-gradient-to-l from-[var(--color-figma-bg)] to-transparent px-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
            aria-label="Scroll values right"
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

      <div className="flex shrink-0 items-center gap-1">
        {!showAddOption && (
          <button
            type="button"
            onClick={() =>
              setShowAddOption((current) => ({
                ...current,
                [dimension.id]: true,
              }))
            }
            className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)]/30 hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/5"
            title="Add a new value"
          >
            Add value
          </button>
        )}
        {selectedOption && onStartRenameOption && (
          <div className="relative shrink-0">
            <button
              ref={valueMenu.triggerRef}
              type="button"
              onClick={valueMenu.toggle}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)]"
              title="Manage value"
              aria-label="Manage value"
              aria-expanded={valueMenu.open}
              aria-haspopup="menu"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>
            {valueMenu.open && (
              <div
                ref={valueMenu.menuRef}
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-[190px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    valueMenu.close();
                    onStartRenameOption();
                  }}
                  className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Rename
                </button>
                {onDuplicateOption && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      valueMenu.close();
                      onDuplicateOption();
                    }}
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    Duplicate
                  </button>
                )}
                {copySourceOptions &&
                  copySourceOptions.length > 0 &&
                  onHandleCopyAssignmentsFrom && (
                    <>
                      <div className="my-1 border-t border-[var(--color-figma-border)]" />
                      {copySourceOptions.map((src) => (
                        <button
                          key={src}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            valueMenu.close();
                            onHandleCopyAssignmentsFrom(src);
                          }}
                          className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          Copy assignments from {src}
                        </button>
                      ))}
                    </>
                  )}
                {onDeleteOption && (
                  <>
                    <div className="my-1 border-t border-[var(--color-figma-border)]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        valueMenu.close();
                        onDeleteOption();
                      }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
