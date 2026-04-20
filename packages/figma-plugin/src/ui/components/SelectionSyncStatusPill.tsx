import { useMemo } from "react";
import type { SyncCompleteMessage } from "../../shared/types";

type SelectionSyncStatusVisibility = "always" | "active";

interface SelectionSyncStatusPillProps {
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  syncError?: string | null;
  freshSyncResult: SyncCompleteMessage | null;
  connected: boolean;
  totalBindings: number;
  visibility?: SelectionSyncStatusVisibility;
  className?: string;
  onRemapClick?: () => void;
}

interface SelectionSyncStatusState {
  label: string;
  toneClass: string;
  visible: boolean;
  remapCount: number;
}

export function useSelectionSyncStatus({
  syncing,
  syncProgress,
  syncResult,
  syncError,
  freshSyncResult,
  connected,
  totalBindings,
  visibility = "always",
}: Omit<SelectionSyncStatusPillProps, "className">): SelectionSyncStatusState {
  return useMemo(() => {
    const activeMissingCount =
      syncResult?.missingTokens.length ??
      freshSyncResult?.missingTokens.length ??
      0;
    const toneClass = syncing
      ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
      : syncError
        ? "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]"
        : syncResult
          ? syncResult.errors > 0
            ? "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]"
            : syncResult.missingTokens.length > 0
              ? "bg-[var(--color-figma-warning,#f5a623)]/15 text-[var(--color-figma-warning,#f5a623)]"
              : "bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]"
          : freshSyncResult && freshSyncResult.missingTokens.length > 0
            ? "bg-[var(--color-figma-warning,#f5a623)]/15 text-[var(--color-figma-warning,#f5a623)]"
            : freshSyncResult && freshSyncResult.missingTokens.length === 0
            ? "bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]"
            : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]";

    const label =
      syncing && syncProgress
        ? `Applying ${syncProgress.processed}/${syncProgress.total}`
        : syncError
          ? "Apply failed"
          : syncResult
            ? syncResult.errors > 0
              ? `${syncResult.errors} failed`
              : activeMissingCount > 0
                ? `${activeMissingCount} missing`
              : syncResult.updated === 0 &&
                  syncResult.missingTokens.length === 0
                ? "Up to date"
                : `Updated ${syncResult.updated}`
            : activeMissingCount > 0
              ? `${activeMissingCount} missing`
            : freshSyncResult && freshSyncResult.missingTokens.length === 0
              ? "Up to date"
              : totalBindings > 0 && connected
                ? "Ready to apply"
                : connected
                  ? "No changes"
                  : "Disconnected";

    const visible =
      visibility === "always"
        ? true
        : syncing ||
          Boolean(syncError) ||
          Boolean(syncResult) ||
          Boolean(freshSyncResult) ||
          (connected && totalBindings > 0);

    return { label, toneClass, visible, remapCount: activeMissingCount };
  }, [
    connected,
    freshSyncResult,
    syncError,
    syncProgress,
    syncResult,
    syncing,
    totalBindings,
    visibility,
  ]);
}

export function SelectionSyncStatusPill({
  className = "",
  onRemapClick,
  ...statusProps
}: SelectionSyncStatusPillProps) {
  const status = useSelectionSyncStatus(statusProps);
  if (!status.visible) return null;

  return (
    <div className={`shrink-0 flex items-center gap-1 ${className}`.trim()}>
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${status.toneClass}`.trim()}
      >
        {status.label}
      </span>
      {status.remapCount > 0 && onRemapClick ? (
        <button
          type="button"
          onClick={onRemapClick}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-figma-warning,#b45309)] transition-colors hover:bg-[var(--color-figma-warning,#f5a623)]/15"
          title={`Open Remap with ${status.remapCount} missing token path${status.remapCount !== 1 ? "s" : ""}`}
        >
          Remap
        </button>
      ) : null}
    </div>
  );
}
