import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useEffect, useMemo, useState } from "react";
import {
  summarizeThemeIssueHealth,
  type ThemeIssueSummary,
  type ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import type { ThemeRoleState } from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";

interface CompactAssignmentProps {
  label: string;
  setNames: string[];
  addValue: string;
  addOptions: string[];
  emptyText: string;
  onAddValueChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (setName: string) => void;
  setTokenCounts: Record<string, number | null>;
  onNavigateToTokenSet?: (setName: string) => void;
}

function CompactAssignment({
  label,
  setNames,
  addValue,
  addOptions,
  emptyText,
  onAddValueChange,
  onAdd,
  onRemove,
  setTokenCounts,
  onNavigateToTokenSet,
}: CompactAssignmentProps) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5">
      <span className="w-[86px] shrink-0 pt-0.5 text-[10px] font-semibold text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
        {setNames.length === 0 && !addValue && (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {emptyText}
          </span>
        )}
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
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-figma-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-tertiary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
            title={`Add ${label.toLowerCase()} set`}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add set
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
}

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
  onOpenAdvancedSetup: () => void;
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
  onOpenAdvancedSetup,
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
  const assignmentSummary = useMemo(() => {
    const summaryParts: string[] = [];
    if (foundationSets.length > 0) {
      summaryParts.push(
        `${foundationSets.length} shared set${foundationSets.length === 1 ? "" : "s"}`,
      );
    }
    if (overrideSets.length > 0) {
      summaryParts.push(
        `${overrideSets.length} variant-specific set${overrideSets.length === 1 ? "" : "s"}`,
      );
    }
    if (_disabledSets.length > 0) {
      summaryParts.push(
        `${_disabledSets.length} hidden in Advanced setup`,
      );
    }

    if (summaryParts.length === 0) {
      return "No token sources are connected yet. Start with one shared set used across every variant.";
    }

    return `${summaryParts.join(" · ")} active for this variant.`;
  }, [_disabledSets.length, foundationSets.length, overrideSets.length]);

  useEffect(() => {
    if (!pendingSharedSet || sharedCandidates.includes(pendingSharedSet)) return;
    setPendingSharedSet(sharedCandidates[0] ?? "");
  }, [pendingSharedSet, sharedCandidates]);

  useEffect(() => {
    if (!pendingVariantSet || variantCandidates.includes(pendingVariantSet)) return;
    setPendingVariantSet(variantCandidates[0] ?? "");
  }, [pendingVariantSet, variantCandidates]);

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

      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              {option.name}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Pick the shared token sets every variant should inherit, then add
              variant-specific sets only where {option.name} needs to differ.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {selectedOptionHealth && (
              <button
                type="button"
                onClick={() =>
                  onOpenCoverageView(
                    {
                      dimId: dimension.id,
                      optionName: option.name,
                      preferredSetName:
                        selectedOptionIssues[0]?.preferredSetName ?? null,
                    },
                    false,
                  )
                }
                className="inline-flex items-center rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
              >
                Review issues
              </button>
            )}
            <button
              type="button"
              onClick={onOpenAdvancedSetup}
              className="inline-flex items-center rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
            >
              Advanced setup
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
          {assignmentSummary}
        </p>
        {selectedOptionHealth && (
          <p className="mt-1 text-[10px] text-[var(--color-figma-warning)]">
            Needs review: {selectedOptionHealth.description}
          </p>
        )}
      </div>

      {/* Compact assignment rows */}
      <div className="border-b border-[var(--color-figma-border)] py-1">
        <CompactAssignment
          label="Shared tokens"
          setNames={foundationSets}
          addValue={pendingSharedSet}
          addOptions={sharedCandidates}
          emptyText="No shared sets yet"
          onAddValueChange={setPendingSharedSet}
          onAdd={() => {
            if (!pendingSharedSet) return;
            onHandleSetState(pendingSharedSet, "source");
            setPendingSharedSet("");
          }}
          onRemove={(setName) => onHandleSetState(setName, "disabled")}
          setTokenCounts={setTokenCounts}
          onNavigateToTokenSet={onNavigateToTokenSet}
        />
        <CompactAssignment
          label="Variant tokens"
          setNames={overrideSets}
          addValue={pendingVariantSet}
          addOptions={variantCandidates}
          emptyText="No variant-specific sets yet"
          onAddValueChange={setPendingVariantSet}
          onAdd={() => {
            if (!pendingVariantSet) return;
            onHandleSetState(pendingVariantSet, "enabled");
            setPendingVariantSet("");
          }}
          onRemove={(setName) => onHandleSetState(setName, "disabled")}
          setTokenCounts={setTokenCounts}
          onNavigateToTokenSet={onNavigateToTokenSet}
        />
      </div>
    </div>
  );
}
