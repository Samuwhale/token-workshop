import type { HealthStatus } from "../hooks/useHealthSignals";
import type { SyncCompleteMessage } from "../../shared/types";

interface DeliveryStatusStripProps {
  reviewStatus: HealthStatus;
  reviewItemCount: number;
  pendingPublishCount: number;
  publishApplying: boolean;
  syncing: boolean;
  syncError: string | null;
  syncResult: SyncCompleteMessage | null;
  onOpenHealth: () => void;
  onOpenPublishCompare: () => void;
  onOpenRepair?: () => void;
  onOpenSync: () => void;
}

type Tone = "neutral" | "accent" | "warning" | "error";

interface Chip {
  id: string;
  label: string;
  tone: Tone;
  onClick: () => void;
  title?: string;
}

const DOT_TONE: Record<Tone, string> = {
  neutral: "bg-[var(--color-figma-text-tertiary)]",
  accent: "bg-[var(--color-figma-accent)]",
  warning: "bg-[var(--color-figma-warning)]",
  error: "bg-[var(--color-figma-error)]",
};

const LABEL_TONE: Record<Tone, string> = {
  neutral: "text-[color:var(--color-figma-text-secondary)]",
  accent: "text-[color:var(--color-figma-text-accent)]",
  warning: "text-[color:var(--color-figma-text-warning)]",
  error: "text-[color:var(--color-figma-text-error)]",
};

function healthTone(status: HealthStatus): Tone {
  if (status === "critical") return "error";
  if (status === "warning") return "warning";
  return "neutral";
}

function syncChip(
  syncing: boolean,
  syncError: string | null,
  syncResult: SyncCompleteMessage | null,
  onOpenSync: () => void,
  onOpenRepair?: () => void,
): Chip | null {
  if (syncing) {
    return {
      id: "sync",
      label: "Applying to canvas...",
      tone: "accent",
      onClick: onOpenSync,
      title: "Open Canvas selection sync",
    };
  }
  if (syncError) {
    return {
      id: "sync",
      label: "Review canvas failure",
      tone: "error",
      onClick: onOpenSync,
      title: syncError,
    };
  }
  if (syncResult && syncResult.errors > 0) {
    return {
      id: "sync",
      label: `Review canvas failures (${syncResult.errors})`,
      tone: "error",
      onClick: onOpenSync,
      title: "Open Canvas selection sync to review failed bindings",
    };
  }
  if (syncResult && syncResult.missingTokens.length > 0) {
    const count = syncResult.missingTokens.length;
    return {
      id: "sync",
      label: `Repair canvas bindings (${count})`,
      tone: "warning",
      onClick: onOpenRepair ?? onOpenSync,
      title: `Open Canvas repair for ${count} missing token path${count === 1 ? "" : "s"}`,
    };
  }
  return null;
}

export function DeliveryStatusStrip({
  reviewStatus,
  reviewItemCount,
  pendingPublishCount,
  publishApplying,
  syncing,
  syncError,
  syncResult,
  onOpenHealth,
  onOpenPublishCompare,
  onOpenRepair,
  onOpenSync,
}: DeliveryStatusStripProps) {
  const chips: Chip[] = [];

  if (reviewItemCount > 0) {
    chips.push({
      id: "health",
      label: `Fix library (${reviewItemCount})`,
      tone: healthTone(reviewStatus),
      onClick: onOpenHealth,
      title: "Open Library Review",
    });
  }

  if (publishApplying) {
    chips.push({
      id: "publish",
      label: "Publishing to Figma...",
      tone: "accent",
      onClick: onOpenPublishCompare,
      title: "Open Publish to Figma",
    });
  } else if (pendingPublishCount > 0) {
    chips.push({
      id: "publish",
      label: `Review Figma changes (${pendingPublishCount})`,
      tone: "accent",
      onClick: onOpenPublishCompare,
      title: "Open Publish to review Figma changes",
    });
  }

  const sync = syncChip(syncing, syncError, syncResult, onOpenSync, onOpenRepair);
  if (sync) chips.push(sync);

  if (chips.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--color-figma-border)] px-3 py-1">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={chip.onClick}
          title={chip.title}
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-secondary outline-none transition-colors hover:bg-[var(--color-figma-bg-hover)] focus-visible:bg-[var(--color-figma-bg-hover)]"
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[chip.tone]}`} />
          <span className={`font-medium ${LABEL_TONE[chip.tone]}`}>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
