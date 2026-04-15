import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useState, type ReactNode } from "react";
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
  autoFillLabel: string;
  onAutoFill: () => void;
  onRenameOptionValueChange: (value: string) => void;
  onExecuteRenameOption: () => void;
  onCancelRenameOption: () => void;
  onResolveIssue: (issue: ThemeIssueSummary) => void;
  onViewTokens?: (issue: ThemeIssueSummary) => void;
  onHandleSetState: (setName: string, nextState: ThemeRoleState) => void;
}

function AssignmentSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 px-3 py-1.5">
        <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
          {title}
        </div>
        {count > 0 && (
          <div className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
            {count}
          </div>
        )}
      </div>
      {children}
    </section>
  );
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
  autoFillLabel,
  onAutoFill,
  onRenameOptionValueChange,
  onExecuteRenameOption,
  onCancelRenameOption,
  onResolveIssue,
  onViewTokens,
  onHandleSetState,
}: ThemeOptionWorkspaceProps) {
  const { setRoleRefs } = useThemeAuthoringContext();
  const hasAssigned = overrideSets.length > 0 || foundationSets.length > 0;
  const [notUsedCollapsed, setNotUsedCollapsed] = useState(hasAssigned);

  return (
    <div
      ref={(element) => {
        setRoleRefs.current[`${dimension.id}:${option.name}`] = element;
      }}
      className="bg-[var(--color-figma-bg)]"
    >
      {(fillableCount > 0 || selectedOptionIssues.length > 0) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-figma-border)] px-3 py-1.5">
          {selectedOptionIssues.length > 0 ? (
            <span className="text-[10px] text-[var(--color-figma-warning)]">
              {selectedOptionIssues.length} issue
              {selectedOptionIssues.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span />
          )}
          {fillableCount > 0 && (
            <button
              type="button"
              onClick={onAutoFill}
              className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
            >
              {autoFillLabel}
            </button>
          )}
        </div>
      )}

      {renameOption?.dimId === dimension.id &&
        renameOption?.optionName === option.name && (
          <div className="flex items-center gap-1.5 border-b border-[var(--color-figma-border)] px-3 py-1.5">
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
              type="button"
              onClick={onExecuteRenameOption}
              disabled={!renameOptionValue.trim()}
              className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelRenameOption}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
            {renameOptionError && (
              <span className="text-[9px] text-[var(--color-figma-error)]">
                {renameOptionError}
              </span>
            )}
          </div>
        )}

      {selectedOptionIssues.length > 0 && (
        <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
          <div className="space-y-1.5">
            {selectedOptionIssues.map((issue) => (
              <ThemeIssueEntryCard
                key={issue.key}
                issue={issue}
                onAction={() => onResolveIssue(issue)}
                onViewTokens={onViewTokens}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 px-3 py-2">
        {!hasAssigned && sets.length > 0 && (
          <div className="rounded-lg border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 px-3 py-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
            Assign base sets, then add overrides where this value diverges.
          </div>
        )}

        <AssignmentSection title="Overrides" count={overrideSets.length}>
          {overrideSets.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
              No overrides yet
            </div>
          ) : (
            overrideSets.map((setName) => (
              <ThemeSetRoleRow
                key={setName}
                setName={setName}
                status="enabled"
                isSaving={false}
                tokenCount={setTokenCounts[setName] ?? null}
                roleStates={THEME_ROLE_STATES}
                onChangeState={(nextState) => onHandleSetState(setName, nextState)}
              />
            ))
          )}
        </AssignmentSection>

        <AssignmentSection title="Base sets" count={foundationSets.length}>
          {foundationSets.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
              No base sets assigned
            </div>
          ) : (
            foundationSets.map((setName) => (
              <ThemeSetRoleRow
                key={setName}
                setName={setName}
                status="source"
                isSaving={false}
                tokenCount={setTokenCounts[setName] ?? null}
                roleStates={THEME_ROLE_STATES}
                onChangeState={(nextState) => onHandleSetState(setName, nextState)}
              />
            ))
          )}
        </AssignmentSection>

        {disabledSets.length > 0 && (
          <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
            <button
              type="button"
              onClick={() => setNotUsedCollapsed((value) => !value)}
              aria-expanded={!notUsedCollapsed}
              aria-label={`Not included sets (${disabledSets.length})`}
              className="flex w-full items-center gap-1.5 border-b border-[var(--color-figma-border)] px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <svg
                width="7"
                height="7"
                viewBox="0 0 8 8"
                fill="currentColor"
                className={`shrink-0 text-[var(--color-figma-text-tertiary)] transition-transform ${
                  notUsedCollapsed ? "" : "rotate-90"
                }`}
                aria-hidden="true"
              >
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
              <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                Not included
              </div>
              <div className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
                {disabledSets.length}
              </div>
            </button>
            {!notUsedCollapsed &&
              disabledSets.map((setName) => (
                <ThemeSetRoleRow
                  key={setName}
                  setName={setName}
                  status="disabled"
                  isSaving={false}
                  tokenCount={setTokenCounts[setName] ?? null}
                  roleStates={THEME_ROLE_STATES}
                  onChangeState={(nextState) => onHandleSetState(setName, nextState)}
                />
              ))}
          </section>
        )}

        {sets.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 px-3 py-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
            Create token sets first in the Tokens tab.
          </div>
        )}
      </div>
    </div>
  );
}
