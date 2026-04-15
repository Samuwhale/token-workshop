import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useMemo } from "react";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import {
  NoticeCountBadge,
  NoticeFieldMessage,
} from "../../shared/noticeSystem";
import type { ThemeIssueSummary } from "../../shared/themeWorkflow";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";
import { ThemeOptionRail } from "./ThemeOptionRail";
import { ThemeOptionWorkspace } from "./ThemeOptionWorkspace";

interface ThemeAxisCardProps {
  dimension: ThemeDimension;
  sets: string[];
  optionSetOrders: Record<string, Record<string, string[]>>;
  setTokenValues: Record<string, Record<string, any>>;
  dimensionIndex: number;
  totalDimensions: number;
  isExpanded: boolean;
  totalDimensionGaps: number;
  totalDimensionFillable: number;
  multiOptionGaps: boolean;
}

function resolveIssueTargetSet(issue: {
  preferredSetName?: string | null;
  affectedSetNames?: string[];
}) {
  return issue.preferredSetName ?? issue.affectedSetNames?.[0] ?? null;
}

export function ThemeAxisCard({
  dimension,
  sets,
  optionSetOrders,
  setTokenValues,
  dimensionIndex,
  totalDimensions,
  isExpanded,
  totalDimensionGaps,
  totalDimensionFillable,
  multiOptionGaps,
}: ThemeAxisCardProps) {
  const ctx = useThemeAuthoringContext();
  const axisMenu = useDropdownMenu();

  const selectedOption =
    ctx.selectedOptions[dimension.id] || dimension.options[0]?.name || "";
  const option = dimension.options.find(
    (item: ThemeOption) => item.name === selectedOption,
  );
  const optionSets = option
    ? optionSetOrders[dimension.id]?.[option.name] || sets
    : sets;
  const overrideSets = optionSets.filter(
    (setName) => option?.sets[setName] === "enabled",
  );
  const foundationSets = optionSets.filter(
    (setName) => option?.sets[setName] === "source",
  );
  const disabledSets = optionSets.filter(
    (setName) =>
      !option?.sets[setName] || option?.sets[setName] === "disabled",
  );
  const copySourceOptions = ctx.getCopySourceOptions(
    dimension.id,
    selectedOption,
  );
  const optionKey = `${dimension.id}:${selectedOption}`;
  const selectedOptionIssues = ctx.optionIssues[optionKey] ?? [];

  const setTokenCounts = useMemo(
    () =>
      Object.fromEntries(
        sets.map((setName) => [
          setName,
          setTokenValues[setName]
            ? Object.keys(setTokenValues[setName]).length
            : null,
        ]),
      ),
    [sets, setTokenValues],
  );

  const showAddOption = ctx.showAddOption[dimension.id] ?? false;
  const newOptionName = ctx.newOptionNames[dimension.id] ?? "";
  const addOptionError = ctx.addOptionErrors[dimension.id] ?? "";
  const copyFromNewOption = ctx.copyFromNewOption[dimension.id] ?? "";
  const fillableCount = multiOptionGaps ? 0 : totalDimensionFillable;
  const autoFillLabel = multiOptionGaps
    ? "Auto-fill all values"
    : "Auto-fill value";

  const collapsedSummary = useMemo(() => {
    if (dimension.options.length === 0) return "No values yet";
    const names = dimension.options.map((item: ThemeOption) => item.name);
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  }, [dimension.options]);

  return (
    <div
      ref={(element) => {
        ctx.dimensionRefs.current[dimension.id] = element;
        if (element && dimension.id === ctx.newlyCreatedDim) {
          element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }}
      className="border-b border-[var(--color-figma-border)]"
    >
      <div className="group flex items-start gap-2 bg-[var(--color-figma-bg-secondary)] px-3 py-2">
        <button
          type="button"
          onClick={() => ctx.onSelectDimension(dimension.id)}
          className="shrink-0 pt-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${dimension.name}`}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 8 8"
            fill="currentColor"
            className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
        </button>

        {ctx.renameDim === dimension.id ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={ctx.renameValue}
                onChange={(event) => ctx.setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") ctx.executeRenameDim();
                  else if (event.key === "Escape") ctx.cancelRenameDim();
                }}
                className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                  ctx.renameError
                    ? "border-[var(--color-figma-error)]"
                    : "border-[var(--color-figma-border)]"
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={ctx.executeRenameDim}
                disabled={!ctx.renameValue.trim()}
                className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={ctx.cancelRenameDim}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
            {ctx.renameError && (
              <NoticeFieldMessage severity="error">
                {ctx.renameError}
              </NoticeFieldMessage>
            )}
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="truncate text-[11px] font-semibold text-[var(--color-figma-text)]"
                  title={dimension.name}
                >
                  {dimension.name}
                </span>
                {totalDimensionGaps > 0 && (
                  <NoticeCountBadge
                    severity="warning"
                    count={totalDimensionGaps}
                    className="min-w-[16px] shrink-0 px-1"
                    title={`${totalDimensionGaps} issue${totalDimensionGaps === 1 ? "" : "s"}`}
                  />
                )}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-tertiary)]">
                {collapsedSummary}
              </div>
            </div>
            <div className="relative shrink-0">
              <button
                ref={axisMenu.triggerRef}
                type="button"
                onClick={axisMenu.toggle}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                title="Manage this mode"
                aria-label="Manage this mode"
                aria-expanded={axisMenu.open}
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
              {axisMenu.open && (
                <div
                  ref={axisMenu.menuRef}
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-[180px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      axisMenu.close();
                      ctx.startRenameDim(dimension.id, dimension.name);
                    }}
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    Rename mode
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      axisMenu.close();
                      ctx.handleMoveDimension(dimension.id, "up");
                    }}
                    disabled={dimensionIndex === 0}
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-35"
                  >
                    Move mode up
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      axisMenu.close();
                      ctx.handleMoveDimension(dimension.id, "down");
                    }}
                    disabled={dimensionIndex === totalDimensions - 1}
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-35"
                  >
                    Move mode down
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      axisMenu.close();
                      ctx.handleDuplicateDimension(dimension.id);
                    }}
                    disabled={ctx.isDuplicatingDim}
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-35"
                  >
                    Duplicate mode
                  </button>
                  <div className="my-1 border-t border-[var(--color-figma-border)]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      axisMenu.close();
                      ctx.openDeleteConfirm(dimension.id);
                    }}
                    className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
                  >
                    Delete mode
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isExpanded && (
        <>
          <ThemeOptionRail
            dimension={dimension}
            selectedOption={selectedOption}
            optionRoleSummaries={ctx.optionRoleSummaries}
            onSelectOption={(dimId, optionName) =>
              ctx.onSelectOption(dimId, optionName)
            }
            showAddOption={showAddOption}
            onStartRenameOption={() =>
              ctx.startRenameOption(dimension.id, selectedOption)
            }
            onDuplicateOption={() =>
              ctx.handleDuplicateOption(dimension.id, selectedOption)
            }
            onDeleteOption={() =>
              ctx.setOptionDeleteConfirm({
                dimId: dimension.id,
                optionName: selectedOption,
              })
            }
            copySourceOptions={copySourceOptions}
            onHandleCopyAssignmentsFrom={(sourceOptionName) =>
              ctx.handleCopyAssignmentsFrom(
                dimension.id,
                selectedOption,
                sourceOptionName,
              )
            }
          />

          {(showAddOption || dimension.options.length === 0) && (
            <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
              <div className="flex items-center gap-1.5">
                <input
                  ref={(element) => {
                    ctx.addOptionInputRefs.current[dimension.id] = element;
                  }}
                  type="text"
                  value={newOptionName}
                  onChange={(event) => {
                    ctx.setNewOptionNames((current) => ({
                      ...current,
                      [dimension.id]: event.target.value,
                    }));
                    ctx.setAddOptionErrors((current) => ({
                      ...current,
                      [dimension.id]: "",
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") ctx.handleAddOption(dimension.id);
                    if (event.key === "Escape") {
                      ctx.setShowAddOption((current) => ({
                        ...current,
                        [dimension.id]: false,
                      }));
                      ctx.setNewOptionNames((current) => ({
                        ...current,
                        [dimension.id]: "",
                      }));
                      ctx.setCopyFromNewOption((current) => ({
                        ...current,
                        [dimension.id]: "",
                      }));
                    }
                  }}
                  placeholder={dimension.options.length === 0 ? "e.g. Light, Dark" : "Value name"}
                  className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                    addOptionError
                      ? "border-[var(--color-figma-error)]"
                      : "border-[var(--color-figma-border)]"
                  }`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => ctx.handleAddOption(dimension.id)}
                  disabled={!newOptionName.trim()}
                  className="rounded bg-[var(--color-figma-accent)] px-2 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  Add value
                </button>
                {dimension.options.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      ctx.setShowAddOption((current) => ({
                        ...current,
                        [dimension.id]: false,
                      }));
                      ctx.setNewOptionNames((current) => ({
                        ...current,
                        [dimension.id]: "",
                      }));
                      ctx.setCopyFromNewOption((current) => ({
                        ...current,
                        [dimension.id]: "",
                      }));
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {dimension.options.length > 0 && (
                <div className="mt-1 flex items-center gap-1">
                  <select
                    value={copyFromNewOption}
                    onChange={(event) =>
                      ctx.setCopyFromNewOption((current) => ({
                        ...current,
                        [dimension.id]: event.target.value,
                      }))
                    }
                    aria-label="Copy assignments from"
                    className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-[9px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                  >
                    <option value="">No assignments</option>
                    {dimension.options.map((item: ThemeOption) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {addOptionError && (
                <NoticeFieldMessage severity="error" className="mt-1">
                  {addOptionError}
                </NoticeFieldMessage>
              )}
            </div>
          )}

          {option && (
            <ThemeOptionWorkspace
              dimension={dimension}
              option={option}
              sets={sets}
              selectedOptionIssues={selectedOptionIssues}
              overrideSets={overrideSets}
              foundationSets={foundationSets}
              disabledSets={disabledSets}
              renameOption={ctx.renameOption}
              renameOptionValue={ctx.renameOptionValue}
              renameOptionError={ctx.renameOptionError}
              setTokenCounts={setTokenCounts}
              fillableCount={fillableCount}
              autoFillLabel={autoFillLabel}
              onAutoFill={
                multiOptionGaps
                  ? () => ctx.handleAutoFillAllOptions(dimension.id)
                  : () => ctx.handleAutoFillAll(dimension.id, selectedOption)
              }
              onRenameOptionValueChange={(value) => {
                ctx.setRenameOptionValue(value);
                ctx.setRenameOptionError(null);
              }}
              onExecuteRenameOption={ctx.executeRenameOption}
              onCancelRenameOption={ctx.cancelRenameOption}
              onResolveIssue={(issue: ThemeIssueSummary) => {
                if (issue.kind === "coverage-gap" && ctx.onGenerateForDimension) {
                  const targetSet = resolveIssueTargetSet(issue);
                  if (targetSet) {
                    ctx.onGenerateForDimension({
                      dimensionName: issue.dimensionName,
                      targetSet,
                    });
                    return;
                  }
                }
                const targetSet = resolveIssueTargetSet(issue);
                if (targetSet && ctx.onNavigateToTokenSet) {
                  ctx.onNavigateToTokenSet(targetSet);
                }
              }}
              onViewTokens={
                ctx.onNavigateToTokenSet
                  ? (issue: ThemeIssueSummary) => {
                      const targetSet = resolveIssueTargetSet(issue);
                      if (targetSet) ctx.onNavigateToTokenSet!(targetSet);
                    }
                  : undefined
              }
              onHandleSetState={(setName, nextState) =>
                ctx.handleSetState(dimension.id, selectedOption, setName, nextState)
              }
            />
          )}
        </>
      )}
    </div>
  );
}
