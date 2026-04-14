import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useEffect, useMemo, useState } from "react";
import type {
  ThemeIssueSummary,
  ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import {
  STATE_LABELS,
  THEME_ROLE_STATES,
  type ThemeRoleState,
} from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";
import { ThemeIssueEntryCard } from "./ThemeIssueEntryCard";
import { ThemeSetRoleRow } from "./ThemeSetRoleRow";

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
  onResolveIssue: (issue: ThemeIssueSummary) => void;
  onViewTokens?: (issue: ThemeIssueSummary) => void;
  onHandleSetState: (setName: string, nextState: ThemeRoleState) => void;
}

export function ThemeOptionWorkspace({
  dimension,
  option,
  sets,
  selectedOptionIssues,
  overrideSets,
  foundationSets,
  disabledSets,
  renameOption,
  renameOptionValue,
  renameOptionError,
  setTokenCounts,
  fillableCount,
  onAutoFill,
  onRenameOptionValueChange,
  onExecuteRenameOption,
  onCancelRenameOption,
  onResolveIssue,
  onViewTokens,
  onHandleSetState,
}: ThemeOptionWorkspaceProps) {
  const { setRoleRefs, onNavigateToTokenSet } = useThemeAuthoringContext();
  const [pendingSharedSet, setPendingSharedSet] = useState("");
  const [pendingVariantSet, setPendingVariantSet] = useState("");
  const [showAllSets, setShowAllSets] = useState(false);
  const sharedCandidates = sets.filter((setName) => !foundationSets.includes(setName));
  const variantCandidates = sets.filter((setName) => !overrideSets.includes(setName));

  const allSetsByRole = useMemo(() => {
    const groups: Record<ThemeRoleState, string[]> = {
      enabled: overrideSets,
      source: foundationSets,
      disabled: disabledSets,
    };
    return groups;
  }, [overrideSets, foundationSets, disabledSets]);

  const allSetsCount = overrideSets.length + foundationSets.length + disabledSets.length;

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

      {selectedOptionIssues.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-warning)]/5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-[10px] text-[var(--color-figma-warning)]">
            {selectedOptionIssues.length} issue{selectedOptionIssues.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

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

      {selectedOptionIssues.length > 0 && (
        <div className="border-b border-[var(--color-figma-border)] px-3 py-1">
          {selectedOptionIssues.map((issue) => (
            <ThemeIssueEntryCard
              key={issue.key}
              issue={issue}
              onAction={() => onResolveIssue(issue)}
              onViewTokens={onViewTokens}
            />
          ))}
        </div>
      )}

      <div className="border-b border-[var(--color-figma-border)]">
        <button
          type="button"
          onClick={() => setShowAllSets((prev) => !prev)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={`shrink-0 transition-transform ${showAllSets ? "rotate-90" : ""}`}
          >
            <path d="M8 5l10 7-10 7z" />
          </svg>
          All sets ({allSetsCount})
        </button>
        {showAllSets && (
          <div className="pb-1">
            {(["enabled", "source", "disabled"] as const).map((role) => {
              const roleSets = allSetsByRole[role];
              if (roleSets.length === 0) return null;
              return (
                <div key={role}>
                  <div className="px-3 pt-1.5 pb-0.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-tertiary)]">
                      {STATE_LABELS[role]} ({roleSets.length})
                    </span>
                  </div>
                  {roleSets.map((setName) => (
                    <ThemeSetRoleRow
                      key={setName}
                      setName={setName}
                      status={role}
                      isSaving={false}
                      tokenCount={setTokenCounts[setName] ?? null}
                      roleStates={THEME_ROLE_STATES}
                      onChangeState={(nextState) => onHandleSetState(setName, nextState)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
