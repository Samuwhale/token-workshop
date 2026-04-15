import type { ThemeRoleState } from "../themeManagerTypes";
import { STATE_LABELS, STATE_DESCRIPTIONS } from "../themeManagerTypes";

interface ThemeSetRoleRowProps {
  setName: string;
  status: ThemeRoleState;
  isSaving: boolean;
  tokenCount: number | null;
  roleStates: ThemeRoleState[];
  onChangeState: (nextState: ThemeRoleState) => void;
}

export function ThemeSetRoleRow({
  setName,
  status,
  isSaving,
  tokenCount,
  roleStates,
  onChangeState,
}: ThemeSetRoleRowProps) {
  const isEmptyOverride = status === "enabled" && tokenCount === 0;
  const isAssigned = status === "source" || status === "enabled";

  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-1.5 ${
        isSaving ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-[10px] font-medium ${
              isEmptyOverride
                ? "text-[var(--color-figma-warning)]"
                : "text-[var(--color-figma-text)]"
            }`}
            title={setName}
          >
            {setName}
          </span>
          {isEmptyOverride ? (
            <span className="shrink-0 text-[9px] text-[var(--color-figma-warning)]">
              empty override
            </span>
          ) : isAssigned && tokenCount !== null && tokenCount > 0 ? (
            <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
              {tokenCount}
            </span>
          ) : null}
        </div>
      </div>

      <div className="inline-flex shrink-0 overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {roleStates.map((nextState) => {
          const isActive = status === nextState;
          return (
            <button
              key={nextState}
              type="button"
              onClick={() => {
                if (!isActive) onChangeState(nextState);
              }}
              title={STATE_DESCRIPTIONS[nextState]}
              className={`min-w-[44px] px-2.5 py-1 text-[10px] font-medium transition-colors ${
                isActive
                  ? nextState === "source"
                    ? "bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)]"
                    : nextState === "enabled"
                      ? "bg-[var(--color-figma-success)]/12 text-[var(--color-figma-success)]"
                      : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                  : "text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)]"
              }`}
              aria-label={`${STATE_LABELS[nextState]} ${setName}: ${STATE_DESCRIPTIONS[nextState]}`}
              aria-pressed={isActive}
            >
              {STATE_LABELS[nextState]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
