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
    const activeMissingCount =
      syncResult?.missingTokens.length ??
      freshSyncResult?.missingTokens.length ??
      0;
    const toneClass = syncing
      ? "bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]"
      : syncError
        ? "bg-[var(--color-figma-error)]/10 text-[color:var(--color-figma-text-error)]"
        : syncResult
          ? syncResult.errors > 0
            ? "bg-[var(--color-figma-error)]/10 text-[color:var(--color-figma-text-error)]"
            : syncResult.missingTokens.length > 0
              ? "bg-[var(--color-figma-warning)]/15 text-[color:var(--color-figma-text-warning)]"
              : "bg-[var(--color-figma-success)]/10 text-[color:var(--color-figma-text-success)]"
          : freshSyncResult && freshSyncResult.missingTokens.length > 0
            ? "bg-[var(--color-figma-warning)]/15 text-[color:var(--color-figma-text-warning)]"
            : freshSyncResult && freshSyncResult.missingTokens.length === 0
            ? "bg-[var(--color-figma-success)]/10 text-[color:var(--color-figma-text-success)]"
            : "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text-secondary)]";

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
      className={`shrink-0 rounded px-1.5 py-0.5 text-secondary font-medium ${status.toneClass} ${className}`.trim()}
    >
      {status.label}
    </span>
  );
}
