import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useEffect, useRef, useState } from "react";
import {
  NoticeCountBadge,
  NoticeFieldMessage,
} from "../../shared/noticeSystem";
import type { ThemeIssueSummary } from "../../shared/themeWorkflow";
import type {
  ThemeOptionRoleSummary,
} from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";
import { ThemeOptionRail } from "./ThemeOptionRail";
import { ThemeOptionWorkspace } from "./ThemeOptionWorkspace";

interface ThemeAxisCardProps {
  dimension: ThemeDimension;
  sets: string[];
  dimensionIndex: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  totalDimensionGaps: number;
  totalDimensionFillable: number;
  multiOptionGaps: boolean;
  selectedOption: string;
  option: ThemeOption | undefined;
  selectedOptionIssues: ThemeIssueSummary[];
  overrideSets: string[];
  foundationSets: string[];
  disabledSets: string[];
  optionDiffCounts: Record<string, number>;
  optionRoleSummaries: Record<string, ThemeOptionRoleSummary>;
  renameDim: string | null;
  renameValue: string;
  renameError: string | null;
  showAddOption: boolean;
  newOptionName: string;
  addOptionError: string;
  copyFromNewOption: string;
  renameOption: { dimId: string; optionName: string } | null;
  renameOptionValue: string;
  renameOptionError: string | null;
  newlyCreatedDim: string | null;
  isDuplicatingDim: boolean;
  copySourceOptions: string[];
  setTokenCounts: Record<string, number | null>;
  onSetRenameValue: (value: string) => void;
  onStartRenameDim: () => void;
  onCancelRenameDim: () => void;
  onExecuteRenameDim: () => void;
  onDeleteDimension: () => void;
  onDuplicateDimension: () => void;
  onMoveDimension: (direction: "up" | "down") => void;
  onSelectOption: (optionName: string) => void;
  onToggleAddOption: (next: boolean) => void;
  onSetNewOptionName: (value: string) => void;
  onSetCopyFromNewOption: (value: string) => void;
  onAddOption: () => void;
  onStartRenameOption: () => void;
  onRenameOptionValueChange: (value: string) => void;
  onExecuteRenameOption: () => void;
  onCancelRenameOption: () => void;
  onMoveOption: (direction: "up" | "down") => void;
  onDuplicateOption: () => void;
  onDeleteOption: () => void;
  onOpenCoverageView: (target?: any, allAxes?: boolean) => void;
  onOpenAdvancedSetup: () => void;
  onHandleSetState: (setName: string, nextState: ThemeRoleState) => void;
  onHandleCopyAssignmentsFrom: (sourceOptionName: string) => void;
  onAutoFillOption: () => void;
  onAutoFillAllOptions: () => void;
  onGenerateForDimension?: () => void;
}

export function ThemeAxisCard({
  dimension,
  sets,
  dimensionIndex,
  isExpanded,
  onToggleExpand,
  totalDimensionGaps,
  totalDimensionFillable,
  multiOptionGaps,
  selectedOption,
  option,
  selectedOptionIssues,
  overrideSets,
  foundationSets,
  disabledSets,
  optionDiffCounts,
  optionRoleSummaries,
  renameDim,
  renameValue,
  renameError,
  showAddOption,
  newOptionName,
  addOptionError,
  copyFromNewOption,
  renameOption,
  renameOptionValue,
  renameOptionError,
  newlyCreatedDim,
  isDuplicatingDim,
  copySourceOptions,
  setTokenCounts,
  onSetRenameValue,
  onStartRenameDim,
  onCancelRenameDim,
  onExecuteRenameDim,
  onDeleteDimension,
  onDuplicateDimension,
  onMoveDimension,
  onSelectOption,
  onToggleAddOption,
  onSetNewOptionName,
  onSetCopyFromNewOption,
  onAddOption,
  onStartRenameOption,
  onRenameOptionValueChange,
  onExecuteRenameOption,
  onCancelRenameOption,
  onMoveOption,
  onDuplicateOption,
  onDeleteOption,
  onOpenCoverageView,
  onOpenAdvancedSetup,
  onHandleSetState,
  onHandleCopyAssignmentsFrom,
  onAutoFillOption,
  onAutoFillAllOptions,
  onGenerateForDimension,
}: ThemeAxisCardProps) {
  const { dimensionRefs, addOptionInputRefs } = useThemeAuthoringContext();
  const [axisMenuOpen, setAxisMenuOpen] = useState(false);
  const axisMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!axisMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!axisMenuRef.current?.contains(event.target as Node)) {
        setAxisMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAxisMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [axisMenuOpen]);

  return (
    <div
      ref={(element) => {
        dimensionRefs.current[dimension.id] = element;
        if (element && dimension.id === newlyCreatedDim) {
          element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }}
      className="border-b border-[var(--color-figma-border)]"
    >
      <div className="group flex items-center gap-2 bg-[var(--color-figma-bg-secondary)] px-3 py-1.5">
        <button
          type="button"
          onClick={onToggleExpand}
          className="shrink-0 text-[var(--color-figma-text-tertiary)]"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${dimension.name}`}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="currentColor"
            className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
        </button>

        {renameDim === dimension.id ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={renameValue}
                onChange={(event) => onSetRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onExecuteRenameDim();
                  else if (event.key === "Escape") onCancelRenameDim();
                }}
                className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                  renameError
                    ? "border-[var(--color-figma-error)]"
                    : "border-[var(--color-figma-border)]"
                }`}
                autoFocus
              />
              <button
                onClick={onExecuteRenameDim}
                disabled={!renameValue.trim()}
                className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={onCancelRenameDim}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
            {renameError && (
              <NoticeFieldMessage severity="error">{renameError}</NoticeFieldMessage>
            )}
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className="truncate text-[11px] font-medium text-[var(--color-figma-text)]"
                title={dimension.name}
              >
                {dimension.name}
              </span>
              {totalDimensionGaps > 0 && (
                <NoticeCountBadge
                  severity="warning"
                  count={totalDimensionGaps}
                  className="min-w-[16px] shrink-0 px-1"
                  title={`${totalDimensionGaps} issue${totalDimensionGaps === 1 ? "" : "s"} across this family`}
                />
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {onGenerateForDimension && (
                <button
                  onClick={onGenerateForDimension}
                  className="rounded px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
                >
                  Generate
                </button>
              )}
              <div className="relative" ref={axisMenuRef}>
                <button
                  onClick={() => setAxisMenuOpen((v) => !v)}
                  className="rounded p-0.5 text-[var(--color-figma-text-secondary)] opacity-20 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)]"
                  title="Family actions"
                  aria-label="Family actions"
                  aria-expanded={axisMenuOpen}
                  aria-haspopup="menu"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
                {axisMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 w-[160px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
                  >
                    <button
                      role="menuitem"
                      onClick={() => { setAxisMenuOpen(false); onStartRenameDim(); }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Rename
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setAxisMenuOpen(false); onMoveDimension("up"); }}
                      disabled={dimensionIndex === 0}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-35 disabled:pointer-events-none"
                    >
                      Move up
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setAxisMenuOpen(false); onMoveDimension("down"); }}
                      disabled={dimensionIndex === sets.length - 1}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-35 disabled:pointer-events-none"
                    >
                      Move down
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setAxisMenuOpen(false); onDuplicateDimension(); }}
                      disabled={isDuplicatingDim}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-35 disabled:pointer-events-none"
                    >
                      Duplicate
                    </button>
                    <div className="my-1 border-t border-[var(--color-figma-border)]" />
                    <button
                      role="menuitem"
                      onClick={() => { setAxisMenuOpen(false); onDeleteDimension(); }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {isExpanded && <>
      <ThemeOptionRail
        dimension={dimension}
        selectedOption={selectedOption}
        optionDiffCounts={optionDiffCounts}
        optionRoleSummaries={optionRoleSummaries}
        onSelectOption={(dimId, optionName) => onSelectOption(optionName)}
        showAddOption={showAddOption}
      />

      {(showAddOption || dimension.options.length === 0) && (
        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
          <div className="flex items-center gap-1">
            <input
              ref={(element) => {
                addOptionInputRefs.current[dimension.id] = element;
              }}
              type="text"
              value={newOptionName}
              onChange={(event) => onSetNewOptionName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onAddOption();
                if (event.key === "Escape") {
                  onToggleAddOption(false);
                  onSetNewOptionName("");
                  onSetCopyFromNewOption("");
                }
              }}
              placeholder={
                dimension.options.length === 0
                  ? "First variant (e.g. Light, Dark)"
                  : "Variant name"
              }
              className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                addOptionError
                  ? "border-[var(--color-figma-error)]"
                  : "border-[var(--color-figma-border)]"
              }`}
              autoFocus
            />
            <button
              onClick={onAddOption}
              disabled={!newOptionName.trim()}
              className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
            >
              Add
            </button>
            {dimension.options.length > 0 && (
              <button
                onClick={() => {
                  onToggleAddOption(false);
                  onSetNewOptionName("");
                  onSetCopyFromNewOption("");
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            )}
          </div>
          {dimension.options.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
                Copy setup from:
              </span>
              <select
                value={copyFromNewOption}
                onChange={(event) => onSetCopyFromNewOption(event.target.value)}
                className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-[9px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
              >
                <option value="">None (start empty)</option>
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
          renameOption={renameOption}
          renameOptionValue={renameOptionValue}
          renameOptionError={renameOptionError}
          copySourceOptions={copySourceOptions}
          setTokenCounts={setTokenCounts}
          fillableCount={multiOptionGaps ? 0 : totalDimensionFillable}
          onAutoFill={multiOptionGaps ? onAutoFillAllOptions : onAutoFillOption}
          onStartRenameOption={onStartRenameOption}
          onRenameOptionValueChange={onRenameOptionValueChange}
          onExecuteRenameOption={onExecuteRenameOption}
          onCancelRenameOption={onCancelRenameOption}
          onMoveOption={onMoveOption}
          onDuplicateOption={onDuplicateOption}
          onDeleteOption={onDeleteOption}
          canMoveLeft={dimension.options.indexOf(option) > 0}
          canMoveRight={
            dimension.options.indexOf(option) < dimension.options.length - 1
          }
          onOpenCoverageView={onOpenCoverageView}
          onOpenAdvancedSetup={onOpenAdvancedSetup}
          onHandleSetState={onHandleSetState}
          onHandleCopyAssignmentsFrom={onHandleCopyAssignmentsFrom}
        />
      )}
      </>}
    </div>
  );
}
