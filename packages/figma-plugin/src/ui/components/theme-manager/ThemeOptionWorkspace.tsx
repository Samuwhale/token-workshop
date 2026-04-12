import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useEffect, useRef, useState } from "react";
import { NoticeFieldMessage } from "../../shared/noticeSystem";
import type {
  ThemeIssueSummary,
  ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import type {
  ThemeRoleState,
} from "../themeManagerTypes";
import { useThemeAuthoringContext } from "./ThemeAuthoringContext";
import { ThemeIssueEntryCard } from "./ThemeIssueEntryCard";
import { ThemeSetRoleRow } from "./ThemeSetRoleRow";

interface ThemeOptionWorkspaceProps {
  dimension: ThemeDimension;
  option: ThemeOption;
  sets: string[];
  optionSets: string[];
  selectedOptionIssues: ThemeIssueSummary[];
  overrideSets: string[];
  foundationSets: string[];
  disabledSets: string[];
  renameOption: { dimId: string; optionName: string } | null;
  renameOptionValue: string;
  renameOptionError: string | null;
  copySourceOptions: string[];
  roleStates: ThemeRoleState[];
  savingKeys: Set<string>;
  setTokenCounts: Record<string, number | null>;
  fillableCount: number;
  onAutoFill: () => void;
  onStartRenameOption: () => void;
  onRenameOptionValueChange: (value: string) => void;
  onExecuteRenameOption: () => void;
  onCancelRenameOption: () => void;
  onMoveOption: (direction: "up" | "down") => void;
  onDuplicateOption: () => void;
  onDeleteOption: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onOpenCoverageView: (
    target?: ThemeRoleNavigationTarget | null,
    allAxes?: boolean,
  ) => void;
  onFocusRoleTarget: (
    target: ThemeRoleNavigationTarget | null | undefined,
    openEditor?: boolean,
  ) => void;
  onHandleSetState: (setName: string, nextState: ThemeRoleState) => void;
  onHandleCopyAssignmentsFrom: (sourceOptionName: string) => void;
}

export function ThemeOptionWorkspace({
  dimension,
  option,
  sets,
  optionSets,
  selectedOptionIssues,
  overrideSets,
  foundationSets,
  disabledSets,
  renameOption,
  renameOptionValue,
  renameOptionError,
  copySourceOptions,
  roleStates,
  savingKeys,
  setTokenCounts,
  fillableCount,
  onAutoFill,
  onStartRenameOption,
  onRenameOptionValueChange,
  onExecuteRenameOption,
  onCancelRenameOption,
  onMoveOption,
  onDuplicateOption,
  onDeleteOption,
  canMoveLeft,
  canMoveRight,
  onOpenCoverageView,
  onFocusRoleTarget,
  onHandleSetState,
  onHandleCopyAssignmentsFrom,
}: ThemeOptionWorkspaceProps) {
  const { collapsedDisabled, toggleCollapsedDisabled, setRoleRefs } =
    useThemeAuthoringContext();
  const [optionMenuOpen, setOptionMenuOpen] = useState(false);
  const optionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!optionMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!optionMenuRef.current?.contains(event.target as Node)) {
        setOptionMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOptionMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [optionMenuOpen]);

  const isDisabledCollapsed = collapsedDisabled.has(dimension.id);

  const renderIssueAction = (issue: ThemeIssueSummary) => {
    const actionLabel =
      issue.kind === "stale-set" || issue.kind === "empty-override"
        ? "Edit set roles"
        : "Review issue";
    const handleAction = () => {
      const target = {
        dimId: issue.dimensionId,
        optionName: issue.optionName,
        preferredSetName: issue.preferredSetName,
      };
      if (issue.kind === "stale-set" || issue.kind === "empty-override") {
        onFocusRoleTarget(target, true);
        return;
      }
      onOpenCoverageView(target, false);
    };

    return (
      <ThemeIssueEntryCard
        key={issue.key}
        issue={issue}
        actionLabel={actionLabel}
        onAction={handleAction}
      />
    );
  };

  const renderRoleSection = (
    title: string,
    subtitle: string,
    setNames: string[],
    status: ThemeRoleState,
    toneClass: string,
    icon: React.ReactNode,
  ) => {
    if (setNames.length === 0) return null;
    return (
      <div>
        <div className={`flex items-center gap-1 px-3 py-0.5 text-[10px] font-medium ${toneClass}`}>
          {icon}
          {title} ({setNames.length})
          <span className="ml-1 font-normal text-[var(--color-figma-text-tertiary)]">
            {subtitle}
          </span>
        </div>
        {setNames.map((setName) => (
          <ThemeSetRoleRow
            key={setName}
            setName={setName}
            status={status}
            isSaving={savingKeys.has(`${dimension.id}/${option.name}/${setName}`)}
            tokenCount={setTokenCounts[setName] ?? null}
            roleStates={roleStates}
            onChangeState={(nextState) => onHandleSetState(setName, nextState)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="bg-[var(--color-figma-bg-secondary)]">
      <div
        ref={(element) => {
          setRoleRefs.current[`${dimension.id}:${option.name}`] = element;
        }}
        className="border-t border-[var(--color-figma-border)]"
      >
        <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
          {renameOption?.dimId === dimension.id &&
          renameOption?.optionName === option.name ? (
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={renameOptionValue}
                  onChange={(event) =>
                    onRenameOptionValueChange(event.target.value)
                  }
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
              </div>
              {renameOptionError && (
                <NoticeFieldMessage severity="error">
                  {renameOptionError}
                </NoticeFieldMessage>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                  {option.name}
                </span>
              </div>
              <div className="relative" ref={optionMenuRef}>
                <button
                  onClick={() => setOptionMenuOpen((v) => !v)}
                  className="rounded p-1.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  title="Option actions"
                  aria-label="Option actions"
                  aria-expanded={optionMenuOpen}
                  aria-haspopup="menu"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
                {optionMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 w-[180px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
                  >
                    <button
                      role="menuitem"
                      onClick={() => { setOptionMenuOpen(false); onStartRenameOption(); }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Rename
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setOptionMenuOpen(false); onMoveOption("up"); }}
                      disabled={!canMoveLeft}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-35 disabled:pointer-events-none"
                    >
                      Move left
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setOptionMenuOpen(false); onMoveOption("down"); }}
                      disabled={!canMoveRight}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-35 disabled:pointer-events-none"
                    >
                      Move right
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setOptionMenuOpen(false); onDuplicateOption(); }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Duplicate
                    </button>
                    {copySourceOptions.length > 0 && (
                      <>
                        <div className="my-1 border-t border-[var(--color-figma-border)]" />
                        {copySourceOptions.map((sourceOptionName) => (
                          <button
                            key={sourceOptionName}
                            role="menuitem"
                            onClick={() => { setOptionMenuOpen(false); onHandleCopyAssignmentsFrom(sourceOptionName); }}
                            className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            Copy roles from {sourceOptionName}
                          </button>
                        ))}
                      </>
                    )}
                    <div className="my-1 border-t border-[var(--color-figma-border)]" />
                    <button
                      role="menuitem"
                      onClick={() => { setOptionMenuOpen(false); onDeleteOption(); }}
                      className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {fillableCount > 0 && (
          <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/5 px-3 py-1.5">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {fillableCount} token{fillableCount === 1 ? "" : "s"} can be auto-filled from source sets
            </span>
            <button
              onClick={onAutoFill}
              className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)]"
            >
              Auto-fill
            </button>
          </div>
        )}

        {selectedOptionIssues.length > 0 && (
          <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
            <div className="flex flex-col gap-1.5">
              {selectedOptionIssues.map((issue) => renderIssueAction(issue))}
            </div>
          </div>
        )}

        {renderRoleSection(
          "Override",
          "highest priority",
          overrideSets,
          "enabled",
          "bg-[var(--color-figma-success)]/5 text-[var(--color-figma-success)]",
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>,
        )}
        {renderRoleSection(
          "Base",
          "default values",
          foundationSets,
          "source",
          "bg-[var(--color-figma-accent)]/5 text-[var(--color-figma-accent)]",
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="3" opacity="0.3" />
          </svg>,
        )}
        {disabledSets.length > 0 && (
          <div>
            <button
              onClick={() => toggleCollapsedDisabled(dimension.id)}
              className="w-full px-3 py-0.5 text-left text-[10px] font-medium text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              <span className="flex items-center gap-1">
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="currentColor"
                  className={`transition-transform ${
                    isDisabledCollapsed ? "" : "rotate-90"
                  }`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                Excluded ({disabledSets.length})
              </span>
            </button>
            {!isDisabledCollapsed &&
              disabledSets.map((setName) => (
                <ThemeSetRoleRow
                  key={setName}
                  setName={setName}
                  status="disabled"
                  isSaving={savingKeys.has(`${dimension.id}/${option.name}/${setName}`)}
                  tokenCount={setTokenCounts[setName] ?? null}
                  roleStates={roleStates}
                  onChangeState={(nextState) => onHandleSetState(setName, nextState)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
