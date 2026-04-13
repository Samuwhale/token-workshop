import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useEffect, useMemo, useState } from "react";
import {
  summarizeThemeIssueHealth,
  type ThemeIssueSummary,
  type ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import type { ThemeRoleState } from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";

interface ThemeOptionWorkspaceProps {
  dimension: ThemeDimension;
  option: ThemeOption;
  sets: string[];
  selectedOptionIssues: ThemeIssueSummary[];
  overrideSets: string[];
  foundationSets: string[];
  disabledSets: string[];
  renameOption: { dimId: string; optionName: string } | null;
  renameOptionValue: string;
  renameOptionError: string | null;
  setTokenCounts: Record<string, number | null>;
  fillableCount: number;
  onAutoFill: () => void;
  onRenameOptionValueChange: (value: string) => void;
  onExecuteRenameOption: () => void;
  onCancelRenameOption: () => void;
  onOpenCoverageView: (
    target?: ThemeRoleNavigationTarget | null,
    allAxes?: boolean,
  ) => void;
  onHandleSetState: (setName: string, nextState: ThemeRoleState) => void;
}

export function ThemeOptionWorkspace({
  dimension,
  option,
  sets,
  selectedOptionIssues,
  overrideSets,
  foundationSets,
  disabledSets: _disabledSets,
  renameOption,
  renameOptionValue,
  renameOptionError,
  setTokenCounts,
  fillableCount,
  onAutoFill,
  onRenameOptionValueChange,
  onExecuteRenameOption,
  onCancelRenameOption,
  onOpenCoverageView,
  onHandleSetState,
}: ThemeOptionWorkspaceProps) {
  const { setRoleRefs, onNavigateToTokenSet } = useThemeAuthoringContext();
  const [pendingSharedSet, setPendingSharedSet] = useState("");
  const [pendingVariantSet, setPendingVariantSet] = useState("");
  const sharedCandidates = sets.filter((setName) => !foundationSets.includes(setName));
  const variantCandidates = sets.filter((setName) => !overrideSets.includes(setName));
  const selectedOptionHealth = useMemo(
    () => summarizeThemeIssueHealth(selectedOptionIssues),
    [selectedOptionIssues],
  );

  useEffect(() => {
    if (!pendingSharedSet || sharedCandidates.includes(pendingSharedSet)) return;
    setPendingSharedSet(sharedCandidates[0] ?? "");
  }, [pendingSharedSet, sharedCandidates]);

  useEffect(() => {
    if (!pendingVariantSet || variantCandidates.includes(pendingVariantSet)) return;
    setPendingVariantSet(variantCandidates[0] ?? "");
  }, [pendingVariantSet, variantCandidates]);


  const renderCompactAssignment = (
    label: string,
    setNames: string[],
    addValue: string,
    addOptions: string[],
    onAddValueChange: (value: string) => void,
    onAdd: () => void,
    onRemove: (setName: string) => void,
  ) => {
    return (
      <div className="flex items-start gap-2 px-3 py-1.5">
        <span className="shrink-0 pt-0.5 text-[10px] font-semibold text-[var(--color-figma-text-secondary)] w-[70px]">
          {label}
        </span>
        <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
          {setNames.map((setName) => (
            <span
              key={setName}
              className="inline-flex items-center gap-0.5 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)]"
              title={setTokenCounts[setName] != null ? `${setTokenCounts[setName]} tokens` : setName}
            >
              {onNavigateToTokenSet ? (
                <button
                  type="button"
                  onClick={() => onNavigateToTokenSet(setName)}
                  className="truncate max-w-[100px] hover:text-[var(--color-figma-accent)] hover:underline"
                  title={`View tokens in "${setName}"`}
                >
                  {setName}
                </button>
              ) : (
                <span className="truncate max-w-[100px]">{setName}</span>
              )}
              <button
                type="button"
                onClick={() => onRemove(setName)}
                className="rounded-full p-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                aria-label={`Remove ${setName}`}
              >
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {!addValue && addOptions.length > 0 && (
            <button
              type="button"
              onClick={() => onAddValueChange(addOptions[0] ?? "")}
              className="inline-flex items-center justify-center rounded-full border border-dashed border-[var(--color-figma-border)] p-0.5 text-[var(--color-figma-text-tertiary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
              title={`Add ${label.toLowerCase()} set`}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
          {addValue && (
            <div className="flex items-center gap-1">
              <select
                value={addValue}
                onChange={(event) => onAddValueChange(event.target.value)}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-[9px] text-[var(--color-figma-text)]"
              >
                {addOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { onAdd(); }}
                className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)]"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => onAddValueChange("")}
                className="rounded px-1 py-0.5 text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={(element) => {
        setRoleRefs.current[`${dimension.id}:${option.name}`] = element;
      }}
      className="bg-[var(--color-figma-bg)]"
    >
      {/* Rename inline input — only shown during rename */}
      {renameOption?.dimId === dimension.id &&
      renameOption?.optionName === option.name && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--color-figma-border)]">
          <input
            type="text"
            value={renameOptionValue}
            onChange={(event) => onRenameOptionValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onExecuteRenameOption();
              else if (event.key === "Escape") onCancelRenameOption();
            }}
            className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
              renameOptionError
                ? "border-[var(--color-figma-error)]"
                : "border-[var(--color-figma-border)]"
            }`}
            autoFocus
          />
          <button
            onClick={onExecuteRenameOption}
            disabled={!renameOptionValue.trim()}
            className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={onCancelRenameOption}
            className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          {renameOptionError && (
            <span className="text-[9px] text-[var(--color-figma-error)]">{renameOptionError}</span>
          )}
        </div>
      )}

      {/* Auto-fill banner */}
      {fillableCount > 0 && (
        <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/5 text-[10px]">
          <span className="text-[var(--color-figma-text-secondary)]">
            {fillableCount} token{fillableCount === 1 ? "" : "s"} can be auto-filled
          </span>
          <button
            onClick={onAutoFill}
            className="shrink-0 rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)]"
          >
            Auto-fill
          </button>
        </div>
      )}

      {/* Health warning — compact single line */}
      {selectedOptionHealth && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-warning)]/5 text-[10px]">
          <span className="inline-flex items-center justify-center rounded-full bg-[var(--color-figma-warning)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-figma-warning)]">
            {selectedOptionHealth.totalCount}
          </span>
          <span className="flex-1 truncate text-[var(--color-figma-text-secondary)]">
            {selectedOptionHealth.description}
          </span>
          <button
            type="button"
            onClick={() =>
              onOpenCoverageView(
                {
                  dimId: dimension.id,
                  optionName: option.name,
                  preferredSetName: selectedOptionIssues[0]?.preferredSetName ?? null,
                },
                false,
              )
            }
            className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
          >
            Review
          </button>
        </div>
      )}

      {/* Compact assignment rows */}
      <div className="border-b border-[var(--color-figma-border)] py-1">
        {renderCompactAssignment(
          "Shared",
          foundationSets,
          pendingSharedSet,
          sharedCandidates,
          setPendingSharedSet,
          () => {
            if (!pendingSharedSet) return;
            onHandleSetState(pendingSharedSet, "source");
            setPendingSharedSet("");
          },
          (setName) => onHandleSetState(setName, "disabled"),
        )}
        {renderCompactAssignment(
          "Overrides",
          overrideSets,
          pendingVariantSet,
          variantCandidates,
          setPendingVariantSet,
          () => {
            if (!pendingVariantSet) return;
            onHandleSetState(pendingVariantSet, "enabled");
            setPendingVariantSet("");
          },
          (setName) => onHandleSetState(setName, "disabled"),
        )}
      </div>
    </div>
  );
}
