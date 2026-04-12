import { NoticePill } from "../../shared/noticeSystem";
import type { ThemeRoleState } from "../themeManagerTypes";
import { STATE_DESCRIPTIONS, STATE_LABELS } from "../themeManagerTypes";

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
  const isEmptyOverride =
    status === "enabled" && tokenCount !== null && tokenCount === 0;

  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-1 ${
        isSaving ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className="truncate text-[10px] font-medium text-[var(--color-figma-text)]"
          title={setName}
        >
          {setName}
        </span>
        {isEmptyOverride && (
          <NoticePill
            severity="warning"
            title="This override set has no tokens"
          >
            empty
          </NoticePill>
        )}
      </div>
      <div className="flex shrink-0 items-center rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {roleStates.map((nextState) => (
          <button
            key={nextState}
            type="button"
            onClick={() => {
              if (status !== nextState) onChangeState(nextState);
            }}
            className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors first:rounded-l last:rounded-r ${
              status === nextState
                ? nextState === "source"
                  ? "bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)]"
                  : nextState === "enabled"
                    ? "bg-[var(--color-figma-success)]/12 text-[var(--color-figma-success)]"
                    : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                : "text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            }`}
            aria-label={`${STATE_LABELS[nextState]} "${setName}": ${STATE_DESCRIPTIONS[nextState]}`}
            aria-pressed={status === nextState}
          >
            {STATE_LABELS[nextState]}
          </button>
        ))}
      </div>
    </div>
  );
}
