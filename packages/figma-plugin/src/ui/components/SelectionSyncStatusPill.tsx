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
}

interface SelectionSyncStatusState {
  label: string;
  toneClass: string;
  visible: boolean;
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
          : freshSyncResult && freshSyncResult.missingTokens.length === 0
            ? "bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]"
            : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]";

    const label =
      syncing && syncProgress
        ? `Syncing ${syncProgress.processed}/${syncProgress.total}`
        : syncError
          ? "Sync failed"
          : syncResult
            ? syncResult.errors > 0
              ? `${syncResult.errors} failed`
              : syncResult.updated === 0 &&
                  syncResult.missingTokens.length === 0
                ? "Up to date"
                : `Updated ${syncResult.updated}`
            : freshSyncResult && freshSyncResult.missingTokens.length === 0
              ? "Selection in sync"
              : totalBindings > 0 && connected
                ? "Ready to sync"
                : connected
                  ? "No sync pending"
                  : "Disconnected";

    const visible =
      visibility === "always"
        ? true
        : syncing ||
          Boolean(syncError) ||
          Boolean(syncResult) ||
          Boolean(freshSyncResult) ||
          (connected && totalBindings > 0);

    return { label, toneClass, visible };
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
  ...statusProps
}: SelectionSyncStatusPillProps) {
  const status = useSelectionSyncStatus(statusProps);
  if (!status.visible) return null;

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-medium ${status.toneClass} ${className}`.trim()}
    >
      {status.label}
    </span>
  );
}
