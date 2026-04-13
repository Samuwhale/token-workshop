import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [pendingSharedSet, setPendingSharedSet] = useState("");
  const [pendingVariantSet, setPendingVariantSet] = useState("");
  const optionMenuRef = useRef<HTMLDivElement | null>(null);
  const advancedSectionRef = useRef<HTMLDivElement | null>(null);

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
  const unusedSetCount = disabledSets.length;
  const sharedCandidates = sets.filter((setName) => !foundationSets.includes(setName));
  const variantCandidates = sets.filter((setName) => !overrideSets.includes(setName));

  useEffect(() => {
    if (!pendingSharedSet || sharedCandidates.includes(pendingSharedSet)) return;
    setPendingSharedSet(sharedCandidates[0] ?? "");
  }, [pendingSharedSet, sharedCandidates]);

  useEffect(() => {
    if (!pendingVariantSet || variantCandidates.includes(pendingVariantSet)) return;
    setPendingVariantSet(variantCandidates[0] ?? "");
  }, [pendingVariantSet, variantCandidates]);

  useEffect(() => {
    if (!showAdvancedSetup) return;
    requestAnimationFrame(() => {
      advancedSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [showAdvancedSetup]);

  const openAdvancedSetup = () => {
    setShowAdvancedSetup(true);
  };

  const renderIssueAction = (issue: ThemeIssueSummary) => {
    const actionLabel =
      issue.kind === "stale-set" || issue.kind === "empty-override"
        ? "Edit advanced setup"
        : "Review issues";
    const handleAction = () => {
      const target = {
        dimId: issue.dimensionId,
        optionName: issue.optionName,
        preferredSetName: issue.preferredSetName,
      };
      if (issue.kind === "stale-set" || issue.kind === "empty-override") {
        openAdvancedSetup();
        onFocusRoleTarget(target, false);
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
    icon: ReactNode,
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

  const renderAssignmentSection = ({
    title,
    description,
    setNames,
    addValue,
    addOptions,
    addLabel,
    onAddValueChange,
    onAdd,
    onRemove,
    emptyLabel,
  }: {
    title: string;
    description: string;
    setNames: string[];
    addValue: string;
    addOptions: string[];
    addLabel: string;
    onAddValueChange: (value: string) => void;
    onAdd: () => void;
    onRemove: (setName: string) => void;
    emptyLabel: string;
  }) => (
    <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
          {title}
        </div>
        <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
          {description}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {setNames.length > 0 ? (
          setNames.map((setName) => (
            <div
              key={setName}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1"
            >
              <span
                className="truncate text-[10px] font-medium text-[var(--color-figma-text)]"
                title={setName}
              >
                {setName}
              </span>
              <span className="rounded-full bg-[var(--color-figma-bg)] px-1 py-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                {setTokenCounts[setName] === null
                  ? "…"
                  : `${setTokenCounts[setName] ?? 0}`}
              </span>
              <button
                type="button"
                onClick={() => onRemove(setName)}
                className="rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)]"
                aria-label={`Remove ${setName}`}
                title={`Remove ${setName}`}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        ) : (
          <div className="rounded border border-dashed border-[var(--color-figma-border)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
            {emptyLabel}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={addValue}
          onChange={(event) => onAddValueChange(event.target.value)}
          className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text)]"
        >
          <option value="">Choose a set…</option>
          {addOptions.map((setName) => (
            <option key={setName} value={setName}>
              {setName}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAdd}
          disabled={!addValue}
          className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {addLabel}
        </button>
      </div>
    </section>
  );

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
                <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                  Variant
                </div>
                <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                  {option.name}
                </span>
              </div>
              <div className="relative" ref={optionMenuRef}>
                <button
                  onClick={() => setOptionMenuOpen((v) => !v)}
                  className="rounded p-1.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  title="Variant actions"
                  aria-label="Variant actions"
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
                            Copy setup from {sourceOptionName}
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

        <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
          <div className="mb-3 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2">
            <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              Variant setup
            </div>
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Choose which token sets are shared across the family and which ones are unique to{" "}
              <strong>{option.name}</strong>.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {renderAssignmentSection({
              title: "Shared tokens",
              description:
                "These sets provide the baseline tokens reused across every variant in this family.",
              setNames: foundationSets,
              addValue: pendingSharedSet,
              addOptions: sharedCandidates,
              addLabel: "Add shared set",
              onAddValueChange: setPendingSharedSet,
              onAdd: () => {
                if (!pendingSharedSet) return;
                onHandleSetState(pendingSharedSet, "source");
                setPendingSharedSet("");
              },
              onRemove: (setName) => onHandleSetState(setName, "disabled"),
              emptyLabel: "No shared token sets selected yet.",
            })}

            {renderAssignmentSection({
              title: "Variant-specific tokens",
              description:
                "Optional sets here only affect this variant and override the shared tokens when both define the same path.",
              setNames: overrideSets,
              addValue: pendingVariantSet,
              addOptions: variantCandidates,
              addLabel: "Add variant set",
              onAddValueChange: setPendingVariantSet,
              onAdd: () => {
                if (!pendingVariantSet) return;
                onHandleSetState(pendingVariantSet, "enabled");
                setPendingVariantSet("");
              },
              onRemove: (setName) => onHandleSetState(setName, "disabled"),
              emptyLabel: "No variant-specific token sets assigned.",
            })}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2.5">
              <div>
                <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                  Need direct role controls?
                </div>
                <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                  Use advanced setup to review every assigned and unused set for this variant.
                </p>
              </div>
              <button
                type="button"
                onClick={openAdvancedSetup}
                className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                {showAdvancedSetup
                  ? "Advanced setup open"
                  : `Edit advanced setup${unusedSetCount > 0 ? ` (${unusedSetCount} unused)` : ""}`}
              </button>
            </div>
          </div>
        </div>

        {showAdvancedSetup && (
          <div
            ref={advancedSectionRef}
            className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                  Advanced setup
                </div>
                <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                  Raw set-role controls for power users. Changes here still save back to this variant.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedSetup(false)}
                className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Hide
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--color-figma-border)]">
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
        )}
      </div>
    </div>
  );
}
