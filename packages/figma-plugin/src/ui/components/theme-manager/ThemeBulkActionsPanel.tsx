import type { ThemeRoleState } from "../themeManagerTypes";
import { STATE_LABELS } from "../themeManagerTypes";

interface ThemeBulkActionsPanelProps {
  bulkActionSetName: string | null;
  bulkActionCounts: Record<ThemeRoleState, number> | null;
  optionName: string;
  optionSets: string[];
  roleStates: ThemeRoleState[];
  copySourceOptions: string[];
  onSetRoleEditorSetName: (setName: string) => void;
  onBulkSetState: (setName: string, nextState: ThemeRoleState) => void;
  onBulkSetAllInOption: (nextState: ThemeRoleState) => void;
  onCopyAssignmentsFrom: (sourceOptionName: string) => void;
  onCreateOverrideSet: (setName: string) => void;
}

export function ThemeBulkActionsPanel({
  bulkActionSetName,
  bulkActionCounts,
  optionName,
  optionSets,
  roleStates,
  copySourceOptions,
  onSetRoleEditorSetName,
  onBulkSetState,
  onBulkSetAllInOption,
  onCopyAssignmentsFrom,
  onCreateOverrideSet,
}: ThemeBulkActionsPanelProps) {
  return (
    <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 px-2.5 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">
            Bulk actions
          </div>
          <p className="mt-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
            Apply broad updates for <strong>{optionName}</strong> without
            crowding the row controls.
          </p>
        </div>
        <div className="min-w-[148px]">
          <label className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
            Focused set
          </label>
          <select
            value={bulkActionSetName ?? ""}
            onChange={(event) => onSetRoleEditorSetName(event.target.value)}
            className="mt-1 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)]"
          >
            {optionSets.map((setName) => (
              <option key={setName} value={setName}>
                {setName}
              </option>
            ))}
          </select>
        </div>
      </div>
      {bulkActionSetName && bulkActionCounts && (
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-2">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
              Apply “{bulkActionSetName}” across every option in this axis
            </span>
            <div className="flex flex-wrap gap-1">
              {roleStates.map((nextState) => (
                <button
                  key={`bulk-set-${nextState}`}
                  type="button"
                  onClick={() => onBulkSetState(bulkActionSetName, nextState)}
                  className={`min-h-6 rounded border px-2 py-1 text-[9px] font-medium ${
                    nextState === "source"
                      ? "border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/12"
                      : nextState === "enabled"
                        ? "border-[var(--color-figma-success)]/20 bg-[var(--color-figma-success)]/8 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/12"
                        : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  }`}
                >
                  {STATE_LABELS[nextState]} ({bulkActionCounts[nextState]})
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
              Set every available set in {optionName}
            </span>
            <div className="flex flex-wrap gap-1">
              {roleStates.map((nextState) => (
                <button
                  key={`bulk-option-${nextState}`}
                  type="button"
                  onClick={() => onBulkSetAllInOption(nextState)}
                  className={`min-h-6 rounded border px-2 py-1 text-[9px] font-medium ${
                    nextState === "source"
                      ? "border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/12"
                      : nextState === "enabled"
                        ? "border-[var(--color-figma-success)]/20 bg-[var(--color-figma-success)]/8 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/12"
                        : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  }`}
                >
                  {STATE_LABELS[nextState]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
              Copy role assignments from another option
            </span>
            {copySourceOptions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {copySourceOptions.map((sourceOptionName) => (
                  <button
                    key={sourceOptionName}
                    type="button"
                    onClick={() => onCopyAssignmentsFrom(sourceOptionName)}
                    className="min-h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    {sourceOptionName}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                Add another option before copying assignments.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-figma-border)] pt-2">
            <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
              Need a dedicated override set for <strong>{bulkActionSetName}</strong>?
            </p>
            <button
              type="button"
              onClick={() => onCreateOverrideSet(bulkActionSetName)}
              className="min-h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Create override set from focused set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
