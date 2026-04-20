import { useMemo, useState } from "react";
import type { NotificationEntry } from "../hooks/useToastStack";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import {
  useTokenFlatMapContext,
  useCollectionStateContext,
} from "../contexts/TokenDataContext";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { SegmentedControl } from "./SegmentedControl";

type InboxFilter = "all" | "blocker" | "attention" | "success";
type InboxSeverity = "blocker" | "attention" | "success";
type ActionTarget =
  | { kind: "token"; tokenPath: string }
  | {
      kind: "workspace";
      topTab: "library" | "canvas" | "sync" | "export";
      subTab: "library" | "inspect" | "canvas-analysis" | "sync" | "export";
    }
  | { kind: "surface"; surface: "settings" }
  | { kind: "contextual-surface"; surface: "import" | "health" | "history" };

interface NotificationsPanelProps {
  history: NotificationEntry[];
  onClear: () => void;
}

interface InboxAction {
  label: string;
  target: ActionTarget;
}

interface InboxItem {
  dedupeKey: string;
  message: string;
  title: string;
  summary: string;
  severity: InboxSeverity;
  latestTimestamp: number;
  firstTimestamp: number;
  occurrences: number;
  variant: NotificationEntry["variant"];
  scopeLabel: string;
  statusLabel: string;
  action: InboxAction | null;
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

function extractQuotedStrings(message: string): string[] {
  return [...message.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

function classifySeverity(entry: NotificationEntry): InboxSeverity {
  if (entry.variant === "success") return "success";
  if (entry.variant === "warning") return "attention";
  const message = entry.message.toLowerCase();
  const blockerPatterns = [
    /failed/,
    /cannot /,
    /can't /,
    /denied/,
    /not found/,
    /conflict/,
    /stale/,
    /review/,
    /no [^.]+ available/,
    /no [^.]+ can /,
    /check /,
    /still failed/,
    /did not/,
    /missing/,
  ];
  return blockerPatterns.some((pattern) => pattern.test(message))
    ? "blocker"
    : "attention";
}

function inferWorkspaceAction(message: string): InboxAction {
  const lower = message.toLowerCase();
  if (lower.includes("settings")) {
    return {
      label: "Open settings",
      target: { kind: "surface", surface: "settings" },
    };
  }
  if (lower.includes("import")) {
    return {
      label: "Open import",
      target: { kind: "contextual-surface", surface: "import" },
    };
  }
  if (
    lower.includes("generator") ||
    lower.includes("generated group") ||
    lower.includes("generator")
  ) {
    return {
      label: "Open library",
      target: { kind: "workspace", topTab: "library", subTab: "library" },
    };
  }
  if (
    lower.includes("collection") ||
    lower.includes("mode") ||
    lower.includes("layer")
  ) {
    return {
      label: "Open library",
      target: { kind: "workspace", topTab: "library", subTab: "library" },
    };
  }
  if (
    lower.includes("publish") ||
    lower.includes("preflight") ||
    lower.includes("variable") ||
    lower.includes("style") ||
    lower.includes("sync")
  ) {
    return {
      label: "Open Sync",
      target: { kind: "workspace", topTab: "sync", subTab: "sync" },
    };
  }
  if (
    lower.includes("export")
  ) {
    return {
      label: "Open export",
      target: { kind: "workspace", topTab: "export", subTab: "export" },
    };
  }
  if (
    lower.includes("git") ||
    lower.includes("pull") ||
    lower.includes("push") ||
    lower.includes("version") ||
    lower.includes("history") ||
    lower.includes("rollback") ||
    lower.includes("redo") ||
    lower.includes("undo") ||
    lower.includes("snapshot") ||
    lower.includes("operation")
  ) {
    return {
      label: "Open history",
      target: { kind: "contextual-surface", surface: "history" },
    };
  }
  if (
    lower.includes("selection") ||
    lower.includes("bound ") ||
    lower.includes("unbound ") ||
    lower.includes("apply")
  ) {
    return {
      label: "Open apply",
      target: { kind: "workspace", topTab: "canvas", subTab: "inspect" },
    };
  }
  if (lower.includes("dependency") || lower.includes("alias")) {
    return {
      label: "Open health",
      target: { kind: "contextual-surface", surface: "health" },
    };
  }
  return {
    label: "Open library",
    target: { kind: "workspace", topTab: "library", subTab: "library" },
  };
}

function buildInboxItem(
  entry: NotificationEntry,
  pathToCollectionId: Record<string, string>,
): InboxItem {
  const severity = classifySeverity(entry);
  const quoted = extractQuotedStrings(entry.message);
  const explicitAliasTarget =
    entry.message.match(/alias target not found:\s*(.+)$/i)?.[1]?.trim() ??
    null;
  const quotedTokenPath = quoted.find((candidate) =>
    Boolean(pathToCollectionId[candidate] || candidate.includes(".")),
  );
  const tokenPath =
    explicitAliasTarget &&
    (pathToCollectionId[explicitAliasTarget] || explicitAliasTarget.includes("."))
      ? explicitAliasTarget
      : (quotedTokenPath ?? null);
  const tokenCollection = tokenPath ? (pathToCollectionId[tokenPath] ?? null) : null;
  const action = tokenPath
    ? { label: "Open token", target: { kind: "token", tokenPath } as const }
    : inferWorkspaceAction(entry.message);
  const scopeLabel = tokenPath
    ? tokenCollection
      ? `Token in ${tokenCollection}`
      : "Token"
    : action.target.kind === "surface"
      ? action.target.surface === "settings"
        ? "Settings"
        : "Import"
      : action.label
          .replace(/^Open\s+/i, "")
          .replace(/^./, (char) => char.toUpperCase());
  const title = tokenPath
    ? tokenPath
    : action.label
        .replace(/^Open\s+/i, "")
        .replace(/^./, (char) => char.toUpperCase());
  const statusLabel =
    severity === "blocker"
      ? "Needs action"
      : severity === "attention"
        ? "Review"
        : "Resolved";
  return {
    dedupeKey: `${severity}::${normalizeMessage(entry.message)}`,
    message: entry.message,
    title,
    summary: entry.message,
    severity,
    latestTimestamp: entry.timestamp,
    firstTimestamp: entry.timestamp,
    occurrences: 1,
    variant: entry.variant,
    scopeLabel,
    statusLabel,
    action,
  };
}

function severityTint(item: InboxItem): string {
  if (item.severity === "blocker")
    return "bg-[var(--color-figma-error)]/8";
  if (item.severity === "attention")
    return "bg-[var(--color-figma-warning)]/8";
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
  const {
    currentCollectionId,
    setCurrentCollectionId,
  } = useCollectionStateContext();
  const { pathToCollectionId } = useTokenFlatMapContext();
  const { setHighlightedToken, setPendingHighlightForCollection, switchContextualSurface } = useEditorContext();

  const inbox = useMemo(() => {
    const deduped = new Map<string, InboxItem>();
    for (const entry of history) {
      const candidate = buildInboxItem(entry, pathToCollectionId);
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
        existing.title = candidate.title;
        existing.summary = candidate.summary;
        existing.variant = candidate.variant;
        existing.scopeLabel = candidate.scopeLabel;
        existing.statusLabel = candidate.statusLabel;
        existing.action = candidate.action;
      }
    }
    return [...deduped.values()].sort((a, b) => {
      const severityRank = { blocker: 0, attention: 1, success: 2 };
      return (
        severityRank[a.severity] - severityRank[b.severity] ||
        b.latestTimestamp - a.latestTimestamp
      );
    });
  }, [history, pathToCollectionId]);

  const visibleItems = useMemo(
    () => inbox.filter((item) => filterMatches(filter, item)),
    [filter, inbox],
  );

  const openAction = (action: InboxAction | null) => {
    if (!action) return;
    const actionName = action.label.replace(/^Open\s+/i, "").toLowerCase();
    const handoffOpts = {
      returnLabel: "Back to Notifications",
      returnSecondarySurfaceId: null as null,
      onReturn: openNotifications,
    };
    if (action.target.kind === "token") {
      const targetCollectionId = pathToCollectionId[action.target.tokenPath] ?? currentCollectionId;
      beginHandoff({
        reason:
          "Inspect the token referenced by this notification, then return to Notifications.",
        ...handoffOpts,
      });
      navigateTo("library", "library", { preserveHandoff: true });
      if (targetCollectionId === currentCollectionId) {
        setHighlightedToken(action.target.tokenPath);
      } else {
        setPendingHighlightForCollection(action.target.tokenPath, targetCollectionId);
        setCurrentCollectionId(targetCollectionId);
      }
      return;
    }
    if (action.target.kind === "surface") {
      beginHandoff({
        reason: `Open ${actionName} from this notification, then return to Notifications.`,
        ...handoffOpts,
      });
      openSecondarySurface(action.target.surface);
      return;
    }
    if (action.target.kind === "contextual-surface") {
      beginHandoff({
        reason: `Open ${actionName} from this notification, then return to Notifications.`,
        ...handoffOpts,
      });
      navigateTo("library", "library", { preserveHandoff: true });
      switchContextualSurface({ surface: action.target.surface });
      return;
    }
    const { topTab, subTab } = action.target;
    beginHandoff({
      reason: `Open ${actionName} from this notification, then return to Notifications.`,
      ...handoffOpts,
    });
    navigateTo(topTab, subTab, {
      preserveHandoff: true,
    });
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
        <FeedbackPlaceholder
          variant="empty"
          title="No notifications"
        />
      ) : visibleItems.length === 0 ? (
        <FeedbackPlaceholder
          variant="no-results"
          title={`No ${INBOX_FILTER_OPTIONS.find(o => o.value === filter)?.label.toLowerCase() ?? filter} notifications`}
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
              onOpen={openAction}
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
  onOpen: (action: InboxAction | null) => void;
}) {
  return (
    <div className={`border-b border-[var(--color-figma-border)] py-1.5 pl-2.5 ${severityTint(item)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-body font-medium text-[var(--color-figma-text)]">
              {item.title}
            </span>
            <span className="shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]" title={formatTime(item.latestTimestamp)}>
              {timeAgo(item.latestTimestamp)}
            </span>
          </div>
          <p className="mt-0.5 text-secondary leading-snug break-words text-[var(--color-figma-text-secondary)]">
            {item.summary}
          </p>
        </div>
        {item.action && (
          <button
            onClick={() => onOpen(item.action)}
            className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-secondary font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            {item.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
