import { useMemo, useState } from "react";
import type { NotificationEntry } from "../hooks/useToastStack";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import {
  useTokenFlatMapContext,
  useTokenSetsContext,
} from "../contexts/TokenDataContext";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";

type InboxFilter = "all" | "blocker" | "attention" | "success";
type InboxSeverity = "blocker" | "attention" | "success";
type ActionTarget =
  | { kind: "token"; tokenPath: string }
  | {
      kind: "workspace";
      topTab: "define" | "apply" | "sync";
      subTab:
        | "tokens"
        | "themes"
        | "generators"
        | "inspect"
        | "dependencies"
        | "publish"
        | "export"
        | "history"
        | "health";
    }
  | { kind: "surface"; surface: "import" | "settings" };

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
  isSticky: boolean;
  action: InboxAction | null;
}

const FILTER_LABELS: Record<InboxFilter, string> = {
  all: "All",
  blocker: "Blockers",
  attention: "Attention",
  success: "Resolved",
};

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

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
      target: { kind: "surface", surface: "import" },
    };
  }
  if (lower.includes("generator")) {
    return {
      label: "Open recipes",
      target: { kind: "workspace", topTab: "define", subTab: "generators" },
    };
  }
  if (
    lower.includes("theme") ||
    lower.includes("mode") ||
    lower.includes("layer")
  ) {
    return {
      label: "Open modes",
      target: { kind: "workspace", topTab: "define", subTab: "themes" },
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
      label: "Open publish",
      target: { kind: "workspace", topTab: "sync", subTab: "publish" },
    };
  }
  if (
    lower.includes("export") ||
    lower.includes("git") ||
    lower.includes("pull")
  ) {
    return {
      label: "Open export",
      target: { kind: "workspace", topTab: "sync", subTab: "export" },
    };
  }
  if (
    lower.includes("history") ||
    lower.includes("rollback") ||
    lower.includes("redo") ||
    lower.includes("undo") ||
    lower.includes("snapshot") ||
    lower.includes("operation")
  ) {
    return {
      label: "Open history",
      target: { kind: "workspace", topTab: "sync", subTab: "history" },
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
      target: { kind: "workspace", topTab: "apply", subTab: "inspect" },
    };
  }
  if (lower.includes("dependency") || lower.includes("alias")) {
    return {
      label: "Open dependencies",
      target: { kind: "workspace", topTab: "apply", subTab: "dependencies" },
    };
  }
  return {
    label: "Open tokens",
    target: { kind: "workspace", topTab: "define", subTab: "tokens" },
  };
}

function buildInboxItem(
  entry: NotificationEntry,
  pathToSet: Record<string, string>,
): InboxItem {
  const severity = classifySeverity(entry);
  const quoted = extractQuotedStrings(entry.message);
  const explicitAliasTarget =
    entry.message.match(/alias target not found:\s*(.+)$/i)?.[1]?.trim() ??
    null;
  const quotedTokenPath = quoted.find((candidate) =>
    Boolean(pathToSet[candidate] || candidate.includes(".")),
  );
  const tokenPath =
    explicitAliasTarget &&
    (pathToSet[explicitAliasTarget] || explicitAliasTarget.includes("."))
      ? explicitAliasTarget
      : (quotedTokenPath ?? null);
  const tokenSet = tokenPath ? (pathToSet[tokenPath] ?? null) : null;
  const action = tokenPath
    ? { label: "Open token", target: { kind: "token", tokenPath } as const }
    : inferWorkspaceAction(entry.message);
  const scopeLabel = tokenPath
    ? tokenSet
      ? `Token in ${tokenSet}`
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
    isSticky: severity === "blocker",
    action,
  };
}

function severityTone(item: InboxItem): string {
  if (item.severity === "blocker")
    return "border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/[0.08]";
  if (item.severity === "attention")
    return "border-amber-500/30 bg-amber-500/[0.08]";
  return "border-green-500/25 bg-green-500/[0.08]";
}

function severityBadgeTone(item: InboxItem): string {
  if (item.severity === "blocker")
    return "text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/[0.12]";
  if (item.severity === "attention")
    return "text-amber-600 bg-amber-500/[0.12]";
  return "text-green-600 bg-green-500/[0.12]";
}

function filterMatches(filter: InboxFilter, item: InboxItem): boolean {
  return filter === "all" ? true : item.severity === filter;
}

export function NotificationsPanel({
  history,
  onClear,
}: NotificationsPanelProps) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const { navigateTo, openSecondarySurface, beginHandoff } =
    useNavigationContext();
  const { activeSet, setActiveSet } = useTokenSetsContext();
  const { pathToSet } = useTokenFlatMapContext();
  const { setHighlightedToken, setPendingHighlightForSet } = useEditorContext();

  const inbox = useMemo(() => {
    const deduped = new Map<string, InboxItem>();
    for (const entry of history) {
      const candidate = buildInboxItem(entry, pathToSet);
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
  }, [history, pathToSet]);

  const visibleItems = useMemo(
    () => inbox.filter((item) => filterMatches(filter, item)),
    [filter, inbox],
  );

  const stickyBlockers = visibleItems.filter((item) => item.isSticky);
  const remainingItems = visibleItems.filter((item) => !item.isSticky);
  const counts = useMemo(
    () => ({
      all: inbox.length,
      blocker: inbox.filter((item) => item.severity === "blocker").length,
      attention: inbox.filter((item) => item.severity === "attention").length,
      success: inbox.filter((item) => item.severity === "success").length,
    }),
    [inbox],
  );

  const openAction = (action: InboxAction | null) => {
    if (!action) return;
    const actionName = action.label.replace(/^Open\s+/i, "").toLowerCase();
    if (action.target.kind === "token") {
      const targetSet = pathToSet[action.target.tokenPath] ?? activeSet;
      beginHandoff({
        reason:
          "Inspect the token referenced by this notification, then return to Notifications.",
      });
      navigateTo("define", "tokens", { preserveHandoff: true });
      if (targetSet === activeSet) {
        setHighlightedToken(action.target.tokenPath);
      } else {
        setPendingHighlightForSet(action.target.tokenPath, targetSet);
        setActiveSet(targetSet);
      }
      return;
    }
    if (action.target.kind === "surface") {
      beginHandoff({
        reason: `Open ${actionName} from this notification, then return to Notifications.`,
      });
      openSecondarySurface(action.target.surface);
      return;
    }
    beginHandoff({
      reason: `Open ${actionName} from this notification, then return to Notifications.`,
    });
    navigateTo(action.target.topTab, action.target.subTab, {
      preserveHandoff: true,
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[11px] font-medium text-[var(--color-figma-text)]">
              Notifications inbox
            </h2>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Review recent issues and confirmations, then jump back to the
              right token or area.
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={onClear}
              className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Clear inbox
            </button>
          )}
        </div>
        {inbox.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                ["all", "blocker", "attention", "success"] as InboxFilter[]
              ).map((value) => {
                const active = filter === value;
                return (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={`rounded-full border px-2 py-1 text-[10px] font-medium transition-colors ${
                      active
                        ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/[0.12] text-[var(--color-figma-accent)]"
                        : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                    }`}
                  >
                    {FILTER_LABELS[value]}{" "}
                    {counts[value] > 0 ? `(${counts[value]})` : ""}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              <span>{pluralize(counts.blocker, "blocker")}</span>
              <span>{pluralize(counts.attention, "attention item")}</span>
              <span>{pluralize(counts.success, "resolved item")}</span>
            </div>
          </>
        )}
      </div>

      {inbox.length === 0 ? (
        <FeedbackPlaceholder
          variant="empty"
          title="No notifications yet"
          description="New issues and confirmations will show up here."
        />
      ) : visibleItems.length === 0 ? (
        <FeedbackPlaceholder
          variant="no-results"
          title={`No ${FILTER_LABELS[filter].toLowerCase()} notifications`}
          description="Switch filters to see the rest of your notifications."
          secondaryAction={{
            label: "View all",
            onClick: () => setFilter("all"),
          }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {stickyBlockers.length > 0 && (
            <div className="sticky top-0 z-10 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]/95 px-3 py-2 backdrop-blur-sm">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-error)]">
                Sticky blockers
              </div>
              <div className="space-y-2">
                {stickyBlockers.map((item) => (
                  <NotificationCard
                    key={item.dedupeKey}
                    item={item}
                    onOpen={openAction}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 px-3 py-3">
            {remainingItems.map((item) => (
              <NotificationCard
                key={item.dedupeKey}
                item={item}
                onOpen={openAction}
              />
            ))}
          </div>
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
    <div className={`rounded-lg border px-3 py-2.5 ${severityTone(item)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
              {item.title}
            </div>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${severityBadgeTone(item)}`}
            >
              {item.statusLabel}
            </span>
            <span className="rounded-full bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
              {item.scopeLabel}
            </span>
            {item.occurrences > 1 && (
              <span className="rounded-full bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                {item.occurrences}x
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed break-words text-[var(--color-figma-text)]">
            {item.summary}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span title={formatTime(item.latestTimestamp)}>
              Latest {timeAgo(item.latestTimestamp)}
            </span>
            <span title={formatTime(item.firstTimestamp)}>
              First seen {timeAgo(item.firstTimestamp)}
            </span>
          </div>
        </div>
        {item.action && (
          <button
            onClick={() => onOpen(item.action)}
            className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            {item.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
