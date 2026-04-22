import type { HealthOverall, HealthStatus } from "../hooks/useHealthSignals";
import type { SyncCompleteMessage } from "../../shared/types";

interface DeliveryStatusStripProps {
  health: HealthOverall;
  pendingPublishCount: number;
  publishApplying: boolean;
  syncing: boolean;
  syncError: string | null;
  syncResult: SyncCompleteMessage | null;
  onOpenHealth: () => void;
  onOpenPublishCompare: () => void;
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
  neutral: "text-[var(--color-figma-text-secondary)]",
  accent: "text-[var(--color-figma-accent)]",
  warning: "text-[var(--color-figma-warning)]",
  error: "text-[var(--color-figma-error)]",
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
): Chip | null {
  if (syncing) {
    return { id: "sync", label: "Applying…", tone: "accent", onClick: onOpenSync };
  }
  if (syncError) {
    return { id: "sync", label: "Apply failed", tone: "error", onClick: onOpenSync, title: syncError };
  }
  if (syncResult && syncResult.errors > 0) {
    return {
      id: "sync",
      label: `${syncResult.errors} failed`,
      tone: "error",
      onClick: onOpenSync,
    };
  }
  if (syncResult && syncResult.missingTokens.length > 0) {
    const count = syncResult.missingTokens.length;
    return {
      id: "sync",
      label: `${count} missing`,
      tone: "warning",
      onClick: onOpenSync,
      title: `${count} missing token path${count === 1 ? "" : "s"}`,
    };
  }
  return null;
}

export function DeliveryStatusStrip({
  health,
  pendingPublishCount,
  publishApplying,
  syncing,
  syncError,
  syncResult,
  onOpenHealth,
  onOpenPublishCompare,
  onOpenSync,
}: DeliveryStatusStripProps) {
  const chips: Chip[] = [];

  if (health.actionableCount > 0) {
    chips.push({
      id: "health",
      label: `${health.actionableCount} issue${health.actionableCount === 1 ? "" : "s"}`,
      tone: healthTone(health.status),
      onClick: onOpenHealth,
      title: "Review issues in Health",
    });
  }

  if (publishApplying) {
    chips.push({
      id: "publish",
      label: "Applying to Figma…",
      tone: "accent",
      onClick: onOpenPublishCompare,
    });
  } else if (pendingPublishCount > 0) {
    chips.push({
      id: "publish",
      label: `${pendingPublishCount} ready to apply`,
      tone: "accent",
      onClick: onOpenPublishCompare,
      title: "Review and apply pending changes in Sync",
    });
  }

  const sync = syncChip(syncing, syncError, syncResult, onOpenSync);
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
