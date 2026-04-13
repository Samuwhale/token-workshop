import { useEffect, useMemo, useState } from "react";
import type { ThemeDimension } from "@tokenmanager/core";
import type { ResolverContentProps } from "../ResolverPanel";
import { ResolverContent } from "../ResolverPanel";
import { adaptShortcut } from "../../shared/utils";
import { SHORTCUT_KEYS } from "../../shared/shortcutRegistry";
import type { ThemeRoleState } from "../themeManagerTypes";
import { ThemeSetRoleRow } from "./ThemeSetRoleRow";
import { ThemeBulkActionsPanel } from "./ThemeBulkActionsPanel";
import { ThemeResolverContextBanner } from "./ThemeResolverContextBanner";
import type { ThemeResolverAuthoringContext } from "./themeResolverContext";

interface ThemeAdvancedSetupScreenProps {
  mode: "setup";
  dimensions: ThemeDimension[];
  focusedDimension: ThemeDimension | null;
  selectedOptionName: string | null;
  orderedSets: string[];
  canCompareThemes: boolean;
  resolverAvailable: boolean;
  roleStates: ThemeRoleState[];
  savingKeys: Set<string>;
  setTokenCounts: Record<string, number | null>;
  getCopySourceOptions: (dimId: string, optionName: string) => string[];
  getSetRoleCounts: (
    dimId: string,
    setName: string,
  ) => Record<ThemeRoleState, number>;
  onSelectDimension: (dimId: string) => void;
  onSelectOption: (dimId: string, optionName: string) => void;
  onSetState: (
    dimId: string,
    optionName: string,
    setName: string,
    nextState: ThemeRoleState,
  ) => void;
  onBulkSetState: (
    dimId: string,
    setName: string,
    nextState: ThemeRoleState,
  ) => void;
  onBulkSetAllInOption: (
    dimId: string,
    optionName: string,
    nextState: ThemeRoleState,
  ) => void;
  onCopyAssignmentsFrom: (
    dimId: string,
    optionName: string,
    sourceOptionName: string,
  ) => void;
  onCreateOverrideSet: (
    dimId: string,
    optionName: string,
    setName: string,
  ) => void;
  onOpenCompare: () => void;
  onOpenResolver: () => void;
  onBack: () => void;
}

interface ThemeResolverScreenProps {
  mode: "resolver";
  resolverState: ResolverContentProps;
  resolverAuthoringContext: ThemeResolverAuthoringContext | null;
  onBack: () => void;
  onSuccess?: (message: string) => void;
}

type ThemeAdvancedScreenProps =
  | ThemeAdvancedSetupScreenProps
  | ThemeResolverScreenProps;

function AdvancedScreenHeader({
  title,
  description,
  backLabel,
  onBack,
}: {
  title: string;
  description: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex items-start justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            {title}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {description}
          </p>
        </div>
        <button
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {backLabel}
        </button>
      </div>
    </div>
  );
}

function ThemeAdvancedSetupScreen({
  dimensions,
  focusedDimension,
  selectedOptionName,
  orderedSets,
  canCompareThemes,
  resolverAvailable,
  roleStates,
  savingKeys,
  setTokenCounts,
  getCopySourceOptions,
  getSetRoleCounts,
  onSelectDimension,
  onSelectOption,
  onSetState,
  onBulkSetState,
  onBulkSetAllInOption,
  onCopyAssignmentsFrom,
  onCreateOverrideSet,
  onOpenCompare,
  onOpenResolver,
  onBack,
}: ThemeAdvancedSetupScreenProps) {
  const [bulkActionSetName, setBulkActionSetName] = useState<string | null>(
    null,
  );

  const selectedDimension =
    focusedDimension ?? dimensions.find((dimension) => dimension.options.length > 0) ?? null;
  const selectedOption =
    selectedDimension?.options.find((option) => option.name === selectedOptionName) ??
    selectedDimension?.options[0] ??
    null;

  const optionSetNames = useMemo(() => {
    if (!selectedOption) return orderedSets;
    return Array.from(new Set([...orderedSets, ...Object.keys(selectedOption.sets)]));
  }, [orderedSets, selectedOption]);

  useEffect(() => {
    if (optionSetNames.length === 0) {
      setBulkActionSetName(null);
      return;
    }
    if (bulkActionSetName && optionSetNames.includes(bulkActionSetName)) return;
    setBulkActionSetName(optionSetNames[0]);
  }, [bulkActionSetName, optionSetNames]);

  const setNamesByState = useMemo(() => {
    const grouped: Record<ThemeRoleState, string[]> = {
      disabled: [],
      source: [],
      enabled: [],
    };

    for (const setName of optionSetNames) {
      const state = selectedOption?.sets[setName] ?? "disabled";
      grouped[state].push(setName);
    }

    return grouped;
  }, [optionSetNames, selectedOption]);

  const copySourceOptions = useMemo(() => {
    if (!selectedDimension || !selectedOption) return [];
    return getCopySourceOptions(selectedDimension.id, selectedOption.name);
  }, [getCopySourceOptions, selectedDimension, selectedOption]);

  const bulkActionCounts = useMemo(() => {
    if (!selectedDimension || !bulkActionSetName) return null;
    return getSetRoleCounts(selectedDimension.id, bulkActionSetName);
  }, [bulkActionSetName, getSetRoleCounts, selectedDimension]);

  const renderRoleSection = (
    title: string,
    subtitle: string,
    setNames: string[],
    status: ThemeRoleState,
    toneClass: string,
  ) => {
    if (!selectedDimension || !selectedOption || setNames.length === 0) return null;

    return (
      <section className="overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <div
          className={`flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-medium ${toneClass}`}
        >
          <span>{title}</span>
          <span className="text-[9px] font-normal text-[var(--color-figma-text-tertiary)]">
            {subtitle}
          </span>
        </div>
        <div className="divide-y divide-[var(--color-figma-border)]">
          {setNames.map((setName) => (
            <ThemeSetRoleRow
              key={setName}
              setName={setName}
              status={status}
              isSaving={savingKeys.has(
                `${selectedDimension.id}/${selectedOption.name}/${setName}`,
              )}
              tokenCount={setTokenCounts[setName] ?? null}
              roleStates={roleStates}
              onChangeState={(nextState) =>
                onSetState(
                  selectedDimension.id,
                  selectedOption.name,
                  setName,
                  nextState,
                )
              }
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <>
      <AdvancedScreenHeader
        title="Advanced setup"
        description="Keep normal mode authoring in the main flow. Use this route when you need raw set-role controls, comparison tools, or resolver-only publish logic."
        backLabel="Back to authoring"
        onBack={onBack}
      />

      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-2.5 py-2">
            <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Stay in simple authoring
            </p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Use the default theme workflow for base sets, variant-specific
              sets, coverage review, and preview.
            </p>
          </div>
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-2.5 py-2">
            <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Switch here for structure work
            </p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Compare variants, batch-edit role assignments, or inspect every
              included and excluded set behind a specific variant.
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-3 py-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Mode
              </span>
              <select
                value={selectedDimension?.id ?? ""}
                onChange={(event) => onSelectDimension(event.target.value)}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text)]"
              >
                {dimensions
                  .filter((dimension) => dimension.options.length > 0)
                  .map((dimension) => (
                    <option key={dimension.id} value={dimension.id}>
                      {dimension.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Variant
              </span>
              <select
                value={selectedOption?.name ?? ""}
                onChange={(event) => {
                  if (!selectedDimension) return;
                  onSelectOption(selectedDimension.id, event.target.value);
                }}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text)]"
              >
                {(selectedDimension?.options ?? []).map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!selectedDimension || !selectedOption ? (
            <div className="rounded border border-dashed border-[var(--color-figma-border)] px-3 py-4 text-[10px] text-[var(--color-figma-text-tertiary)]">
              Create at least one mode and variant before using Advanced setup.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOpenCompare}
                  disabled={!canCompareThemes}
                  className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Open compare tools
                </button>
                {resolverAvailable && (
                  <button
                    type="button"
                    onClick={onOpenResolver}
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    Resolver logic
                    <kbd className="rounded border border-[var(--color-figma-border)] px-1 font-mono text-[9px] leading-none text-[var(--color-figma-text-tertiary)]">
                      {adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER)}
                    </kbd>
                  </button>
                )}
              </div>

              <ThemeBulkActionsPanel
                bulkActionSetName={bulkActionSetName}
                bulkActionCounts={bulkActionCounts}
                optionName={selectedOption.name}
                optionSets={optionSetNames}
                roleStates={roleStates}
                copySourceOptions={copySourceOptions}
                onSetRoleEditorSetName={setBulkActionSetName}
                onBulkSetState={(setName, nextState) =>
                  onBulkSetState(selectedDimension.id, setName, nextState)
                }
                onBulkSetAllInOption={(nextState) =>
                  onBulkSetAllInOption(
                    selectedDimension.id,
                    selectedOption.name,
                    nextState,
                  )
                }
                onCopyAssignmentsFrom={(sourceOptionName) =>
                  onCopyAssignmentsFrom(
                    selectedDimension.id,
                    selectedOption.name,
                    sourceOptionName,
                  )
                }
                onCreateOverrideSet={(setName) =>
                  onCreateOverrideSet(
                    selectedDimension.id,
                    selectedOption.name,
                    setName,
                  )
                }
              />

              <div className="grid gap-3">
                {renderRoleSection(
                  "Override sets",
                  "highest priority",
                  setNamesByState.enabled,
                  "enabled",
                  "bg-[var(--color-figma-success)]/5 text-[var(--color-figma-success)]",
                )}
                {renderRoleSection(
                  "Base sets",
                  "shared defaults",
                  setNamesByState.source,
                  "source",
                  "bg-[var(--color-figma-accent)]/5 text-[var(--color-figma-accent)]",
                )}
                {renderRoleSection(
                  "Excluded sets",
                  "not part of this variant",
                  setNamesByState.disabled,
                  "disabled",
                  "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]",
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ThemeResolverScreen({
  resolverState,
  resolverAuthoringContext,
  onBack,
  onSuccess,
}: ThemeResolverScreenProps) {
  return (
    <>
      <AdvancedScreenHeader
        title="Advanced resolver setup"
        description="Keep everyday light/dark, brand, and density authoring in theme families. Move here only when publish output needs custom resolution order, modifier defaults, or contexts that do not map cleanly to those families."
        backLabel="Back to advanced setup"
        onBack={onBack}
      />
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 pb-2 text-[9px] text-[var(--color-figma-text-tertiary)]">
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
          <span className="font-medium text-[var(--color-figma-text-secondary)]">
            Shortcut
          </span>
          <kbd className="rounded border border-[var(--color-figma-border)] px-1 font-mono leading-none">
            {adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER)}
          </kbd>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          {resolverAuthoringContext && (
            <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
              <ThemeResolverContextBanner
                context={resolverAuthoringContext}
                title="Advanced review"
                description="Detailed resolver mismatch diagnostics stay in this advanced flow so the default mode authoring surface can stay focused on modes and variants."
              />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ResolverContent {...resolverState} onSuccess={onSuccess} />
          </div>
        </div>
      </div>
    </>
  );
}

export function ThemeAdvancedScreen(props: ThemeAdvancedScreenProps) {
  if (props.mode === "resolver") {
    return <ThemeResolverScreen {...props} />;
  }

  return <ThemeAdvancedSetupScreen {...props} />;
}
