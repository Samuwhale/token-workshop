import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useMemo } from "react";
import type { ThemeIssueSummary } from "../../shared/themeWorkflow";
import {
  THEME_ROLE_STATES,
  type ThemeRoleState,
} from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";
import { ThemeIssueEntryCard } from "./ThemeIssueEntryCard";
import { ThemeSetRoleRow } from "./ThemeSetRoleRow";

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
  const { setRoleRefs } = useThemeAuthoringContext();

  const orderedSets = useMemo(() => {
    const order: Array<{ setName: string; role: ThemeRoleState }> = [];
    for (const setName of overrideSets) order.push({ setName, role: "enabled" });
    for (const setName of foundationSets) order.push({ setName, role: "source" });
    for (const setName of disabledSets) order.push({ setName, role: "disabled" });
    return order;
  }, [overrideSets, foundationSets, disabledSets]);

  const hasAssigned = overrideSets.length > 0 || foundationSets.length > 0;

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
        <div className="flex items-center justify-between px-2.5 py-0.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/5 text-[10px]">
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
        <div className="border-b border-[var(--color-figma-border)] px-3 py-0.5">
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
        {!hasAssigned && orderedSets.length > 0 && (
          <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
            Assign base and override sets below
          </div>
        )}
        {orderedSets.map(({ setName, role }, index) => {
          const prevRole = index > 0 ? orderedSets[index - 1].role : null;
          const showDivider = prevRole !== null && prevRole !== role;
          return (
            <div key={setName}>
              {showDivider && (
                <div className="mx-2.5 border-t border-[var(--color-figma-border)]" />
              )}
              <ThemeSetRoleRow
                setName={setName}
                status={role}
                isSaving={false}
                tokenCount={setTokenCounts[setName] ?? null}
                roleStates={THEME_ROLE_STATES}
                onChangeState={(nextState) => onHandleSetState(setName, nextState)}
              />
            </div>
          );
        })}
      </div>

      {hasAssigned && selectedOptionIssues.length === 0 && fillableCount === 0 && (
        <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)]">
          All set — use Preview to see resolved tokens
        </div>
      )}
    </div>
  );
}
