import { useMemo, useState } from "react";
import type { NotificationEntry } from "../hooks/useToastStack";
import type { NotificationDestination } from "../shared/toastBus";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import { useCollectionStateContext } from "../contexts/TokenDataContext";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { SegmentedControl } from "./SegmentedControl";

type InboxFilter = "all" | "blocker" | "attention" | "success";
type InboxSeverity = "blocker" | "attention" | "success";

interface NotificationsPanelProps {
  history: NotificationEntry[];
  onClear: () => void;
}

interface InboxItem {
  dedupeKey: string;
  message: string;
  severity: InboxSeverity;
  latestTimestamp: number;
  firstTimestamp: number;
  occurrences: number;
  variant: NotificationEntry["variant"];
  statusLabel: string;
  destination: NotificationDestination | null;
  actionLabel: string | null;
}

const INBOX_FILTER_OPTIONS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "blocker", label: "Blockers" },
  { value: "attention", label: "Attention" },
  { value: "success", label: "Resolved" },
];

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return formatTime(ts);
}

function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ").toLowerCase();
}

function classifySeverity(entry: NotificationEntry): InboxSeverity {
  if (entry.variant === "success") return "success";
  if (entry.variant === "warning") return "attention";
  return "blocker";
}

function destinationActionLabel(
  destination: NotificationDestination | undefined,
): string | null {
  if (!destination) return null;
  switch (destination.kind) {
    case "token":
      return "Open token";
    case "workspace":
      return `Open ${workspaceActionName(destination.topTab, destination.subTab)}`;
    case "surface":
      return destination.surface === "settings"
        ? "Open settings"
        : "Open shortcuts";
    case "contextual-surface":
      return `Open ${contextualSurfaceName(destination.surface)}`;
  }
}

function workspaceActionName(
  topTab: Extract<NotificationDestination, { kind: "workspace" }>["topTab"],
  subTab: Extract<NotificationDestination, { kind: "workspace" }>["subTab"],
): string {
  if (topTab === "sync") {
    if (subTab === "export") return "Export";
    if (subTab === "versions") return "Versions";
    return "Figma Sync";
  }
  if (topTab === "canvas") return "Canvas";
  return "Library";
}

function contextualSurfaceName(
  surface: Extract<
    NotificationDestination,
    { kind: "contextual-surface" }
  >["surface"],
): string {
  switch (surface) {
    case "health":
      return "Health";
    case "history":
      return "History";
    case "import":
      return "Import";
    case "color-analysis":
      return "Color analysis";
  }
}

function buildInboxItem(entry: NotificationEntry): InboxItem {
  const severity = classifySeverity(entry);
  const statusLabel =
    severity === "blocker"
      ? "Needs action"
      : severity === "attention"
        ? "Review"
        : "Resolved";
  return {
    dedupeKey: `${severity}::${normalizeMessage(entry.message)}`,
    message: entry.message,
    severity,
    latestTimestamp: entry.timestamp,
    firstTimestamp: entry.timestamp,
    occurrences: 1,
    variant: entry.variant,
    statusLabel,
    destination: entry.destination ?? null,
    actionLabel: destinationActionLabel(entry.destination),
  };
}

function severityTint(item: InboxItem): string {
  if (item.severity === "blocker") return "bg-[var(--color-figma-error)]/8";
  if (item.severity === "attention") return "bg-[var(--color-figma-warning)]/8";
  return "bg-[var(--color-figma-success)]/8";
}

function filterMatches(filter: InboxFilter, item: InboxItem): boolean {
  return filter === "all" ? true : item.severity === filter;
}

export function NotificationsPanel({
  history,
  onClear,
}: NotificationsPanelProps) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const { navigateTo, openSecondarySurface, beginHandoff, openNotifications } =
    useNavigationContext();
  const { currentCollectionId, setCurrentCollectionId } =
    useCollectionStateContext();
  const {
    setHighlightedToken,
    setPendingHighlightForCollection,
    switchContextualSurface,
  } = useEditorContext();

  const inbox = useMemo(() => {
    const deduped = new Map<string, InboxItem>();
    for (const entry of history) {
      const candidate = buildInboxItem(entry);
      const existing = deduped.get(candidate.dedupeKey);
      if (!existing) {
        deduped.set(candidate.dedupeKey, candidate);
        continue;
      }
      existing.occurrences += 1;
      existing.firstTimestamp = Math.min(
        existing.firstTimestamp,
        entry.timestamp,
      );
      if (entry.timestamp > existing.latestTimestamp) {
        existing.latestTimestamp = entry.timestamp;
        existing.message = candidate.message;
        existing.variant = candidate.variant;
        existing.statusLabel = candidate.statusLabel;
        existing.destination = candidate.destination;
        existing.actionLabel = candidate.actionLabel;
      }
    }
    return [...deduped.values()].sort((a, b) => {
      const severityRank = { blocker: 0, attention: 1, success: 2 };
      return (
        severityRank[a.severity] - severityRank[b.severity] ||
        b.latestTimestamp - a.latestTimestamp
      );
    });
  }, [history]);

  const visibleItems = useMemo(
    () => inbox.filter((item) => filterMatches(filter, item)),
    [filter, inbox],
  );

  const openDestination = (destination: NotificationDestination | null) => {
    if (!destination) return;
    const handoffOpts = {
      returnLabel: "Back to Notifications",
      returnSecondarySurfaceId: null as null,
      onReturn: openNotifications,
    };
    const handoffReason =
      "Open the notification target, then return to Notifications.";

    if (destination.kind === "token") {
      const targetCollectionId =
        destination.collectionId ?? currentCollectionId;
      beginHandoff({ reason: handoffReason, ...handoffOpts });
      navigateTo("library", "library", { preserveHandoff: true });
      if (targetCollectionId === currentCollectionId) {
        setHighlightedToken(destination.tokenPath);
      } else {
        setPendingHighlightForCollection(
          destination.tokenPath,
          targetCollectionId,
        );
        setCurrentCollectionId(targetCollectionId);
      }
      return;
    }
    if (destination.kind === "surface") {
      beginHandoff({ reason: handoffReason, ...handoffOpts });
      openSecondarySurface(destination.surface);
      return;
    }
    if (destination.kind === "contextual-surface") {
      beginHandoff({ reason: handoffReason, ...handoffOpts });
      navigateTo("library", "library", { preserveHandoff: true });
      switchContextualSurface({ surface: destination.surface });
      return;
    }
    beginHandoff({ reason: handoffReason, ...handoffOpts });
    navigateTo(
      destination.topTab,
      destination.subTab,
      { preserveHandoff: true },
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-body font-medium text-[var(--color-figma-text)]">
            Notifications
          </h2>
          {history.length > 0 && (
            <button
              onClick={onClear}
              className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-secondary font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Clear inbox
            </button>
          )}
        </div>
        {inbox.length > 0 && (
          <div className="mt-2">
            <SegmentedControl
              options={INBOX_FILTER_OPTIONS}
              value={filter}
              onChange={setFilter}
              label="Filter notifications"
            />
          </div>
        )}
      </div>

      {inbox.length === 0 ? (
        <FeedbackPlaceholder variant="empty" title="No notifications" />
      ) : visibleItems.length === 0 ? (
        <FeedbackPlaceholder
          variant="no-results"
          title={`No ${INBOX_FILTER_OPTIONS.find((o) => o.value === filter)?.label.toLowerCase() ?? filter} notifications`}
          description="Try a different filter."
          secondaryAction={{
            label: "View all",
            onClick: () => setFilter("all"),
          }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-3">
          {visibleItems.map((item) => (
            <NotificationCard
              key={item.dedupeKey}
              item={item}
              onOpen={openDestination}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  item,
  onOpen,
}: {
  item: InboxItem;
  onOpen: (destination: NotificationDestination | null) => void;
}) {
  return (
    <div
      className={`border-b border-[var(--color-figma-border)] py-1.5 pl-2.5 ${severityTint(item)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-body leading-snug text-[var(--color-figma-text)] break-words">
            {item.message}
          </p>
          <span
            className="mt-0.5 block text-secondary text-[var(--color-figma-text-tertiary)]"
            title={formatTime(item.latestTimestamp)}
          >
            {timeAgo(item.latestTimestamp)}
          </span>
        </div>
        {item.destination && item.actionLabel && (
          <button
            onClick={() => onOpen(item.destination)}
            className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-secondary font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            {item.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
