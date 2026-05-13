import { useCallback, useEffect, useMemo, useState } from "react";
import type { IconRegistryFile, IconStatus, ManagedIcon } from "@token-workshop/core";
import type {
  IconCanvasActionResultMessage,
  IconCanvasItem,
  CreateIconSlotMessage,
  IconPublishProgressMessage,
  IconUsageAuditFinding,
  IconUsageAuditResultMessage,
  IconUsageAuditScope,
  IconsPublishedMessage,
  InsertIconMessage,
  PublishIconsMessage,
  ReplaceSelectionWithIconMessage,
  ScanIconUsageMessage,
  SelectionNodeInfo,
  SetIconSwapPropertyMessage,
} from "../../../shared/types";
import {
  getPluginMessageFromEvent,
  postPluginMessage,
} from "../../../shared/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  MousePointer2,
  RefreshCw,
  Replace,
  Shapes,
  UploadCloud,
} from "lucide-react";
import { useConnectionContext } from "../../contexts/ConnectionContext";
import { useSelectionContext } from "../../contexts/InspectContext";
import { FeedbackPlaceholder } from "../FeedbackPlaceholder";
import { PanelContentHeader } from "../PanelContentHeader";
import { Button, SearchField, SegmentedControl } from "../../primitives";
import { apiFetch, createFetchSignal } from "../../shared/apiFetch";
import { dispatchToast } from "../../shared/toastBus";
import { downloadBlob, getErrorMessage, isAbortError } from "../../shared/utils";
import { IconImportDialog } from "./IconImportDialog";

type IconStatusFilter = "all" | IconStatus;
type IconHealthFilter = "all" | "publish" | "blocked" | "quality" | "frame" | "color";
type IconCanvasActionRequest =
  | Omit<InsertIconMessage, "correlationId">
  | Omit<ReplaceSelectionWithIconMessage, "correlationId">
  | Omit<SetIconSwapPropertyMessage, "correlationId">
  | Omit<CreateIconSlotMessage, "correlationId">;
type IconUsageAuditRequest = Omit<ScanIconUsageMessage, "correlationId">;

interface IconSlotAction {
  propertyName: string;
  label: string;
  targetNodeIds: string[];
}

interface IconSlotSetupAction {
  label: string;
  componentId: string;
  componentName: string;
  targetNodeIds: string[];
}

interface IconsResponse {
  registry: IconRegistryFile;
}

interface IconContentBatchItem {
  id: string;
  content?: string;
  hash?: string;
  error?: string;
}

interface IconContentCacheItem {
  content: string;
  hash: string;
}

interface IconHealthSummary {
  needsPublish: number;
  blocked: number;
  qualityReview: number;
  frameIssues: number;
  colorReview: number;
}

interface IconContentsResponse {
  contents: IconContentBatchItem[];
}

interface IconFigmaLinksResponse {
  ok: true;
  icons: ManagedIcon[];
  registry: IconRegistryFile;
}

interface IconAttributionManifest {
  generatedAt: string;
  summary: {
    publicIconCount: number;
    attributionRequiredIconCount: number;
    sourceCount: number;
    attributionRequiredSourceCount: number;
  };
  sources: Array<{
    provider: string;
    providerName: string;
    collectionId: string;
    collectionName: string;
    license: {
      name: string;
      url: string;
      attributionRequired: boolean;
    };
    iconCount: number;
  }>;
  icons: Array<{
    id: string;
    name: string;
    path: string;
    sourceUrl: string;
  }>;
}

const SVG_FRAME_EPSILON = 1e-6;

const STATUS_FILTERS: Array<{ value: IconStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "deprecated", label: "Deprecated" },
  { value: "blocked", label: "Blocked" },
];

const STATUS_CLASS: Record<IconStatus, string> = {
  draft: "bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]",
  published: "bg-[var(--color-figma-success)]/10 text-[color:var(--color-figma-text-success)]",
  deprecated: "bg-[var(--color-figma-warning)]/10 text-[color:var(--color-figma-text-warning)]",
  blocked: "bg-[var(--workspace-danger)]/10 text-[color:var(--workspace-danger)]",
};

const AUDIT_SCOPE_OPTIONS: Array<{ value: IconUsageAuditScope; label: string }> = [
  { value: "selection", label: "Selection" },
  { value: "page", label: "Page" },
];

function formatIconCount(count: number): string {
  return `${count} ${count === 1 ? "icon" : "icons"}`;
}

function formatSkippedSuffix(
  result: Pick<IconCanvasActionResultMessage, "skipped" | "skippedReason">,
): string {
  if (result.skipped === 0) {
    return "";
  }
  return result.skippedReason
    ? ` ${result.skipped} skipped: ${result.skippedReason}`
    : ` ${result.skipped} skipped.`;
}

function iconMatchesQuery(icon: ManagedIcon, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchable = [
    icon.name,
    icon.path,
    icon.componentName,
    icon.code.exportName,
    icon.source.kind === "public-library" ? icon.source.collectionName : "",
    icon.source.kind === "public-library" ? icon.source.providerName : "",
    ...(icon.tags ?? []),
  ].join(" ").toLowerCase();
  return searchable.includes(normalizedQuery);
}

function sourceLabel(icon: ManagedIcon): string {
  if (icon.source.kind === "local-svg") {
    return icon.source.path;
  }
  if (icon.source.kind === "figma-selection") {
    return "Figma selection";
  }
  if (icon.source.kind === "generated") {
    return "Generated";
  }
  if (icon.source.kind === "public-library") {
    return `${icon.source.collectionName} via ${icon.source.providerName}`;
  }
  return "Pasted SVG";
}

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 10);
}

function colorBehaviorLabel(icon: ManagedIcon): string {
  switch (icon.svg.color.behavior) {
    case "inheritable":
      return "Inherits color";
    case "hardcoded-monotone":
      return "Monotone";
    case "multicolor":
      return "Multicolor";
    case "unknown":
      return "Unknown";
  }
}

function colorBehaviorNote(icon: ManagedIcon): string | null {
  if (icon.svg.color.behavior === "hardcoded-monotone") {
    return "Publishing normalizes this icon to a single editable paint.";
  }
  if (icon.svg.color.behavior === "multicolor") {
    return "Multicolor artwork keeps its source paints when published.";
  }
  if (icon.svg.color.behavior === "unknown") {
    return "Re-import the source SVG before relying on color audits.";
  }
  return null;
}

function colorDetails(icon: ManagedIcon): string {
  const details: string[] = [];
  if (icon.svg.color.values.length > 0) {
    details.push(icon.svg.color.values.join(", "));
  }
  if (icon.svg.color.usesCurrentColor) {
    details.push("currentColor");
  }
  if (icon.svg.color.hasInlineStyles) {
    details.push("inline styles");
  }
  if (icon.svg.color.hasPaintServers) {
    details.push("paint servers");
  }
  if (icon.svg.color.hasOpacity) {
    details.push("opacity");
  }
  return details.length > 0 ? details.join(" / ") : "No explicit paint";
}

function qualityStateLabel(icon: ManagedIcon): string {
  switch (icon.quality.state) {
    case "ready":
      return "Ready";
    case "review":
      return "Needs review";
    case "blocked":
      return "Blocked";
  }
}

function iconFrameLabel(icon: ManagedIcon): string {
  const width = formatIconDimension(icon.svg.viewBoxWidth);
  const height = formatIconDimension(icon.svg.viewBoxHeight);
  return `${width}x${height}`;
}

function formatIconDimension(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function iconFrameMismatchNote(
  icon: ManagedIcon,
  defaultIconSize: number,
): string | null {
  if (
    iconFrameDimensionMatches(icon.svg.viewBoxWidth, defaultIconSize) &&
    iconFrameDimensionMatches(icon.svg.viewBoxHeight, defaultIconSize)
  ) {
    return null;
  }
  const libraryFrame = formatIconDimension(defaultIconSize);
  return [
    `The SVG viewBox is ${iconFrameLabel(icon)}; this library publishes icons`,
    `into a ${libraryFrame}x${libraryFrame} component frame.`,
    "Re-import a matching source if this is unintentional.",
  ].join(" ");
}

function iconHasFrameIssue(icon: ManagedIcon, defaultIconSize: number): boolean {
  return (
    !iconFrameDimensionMatches(icon.svg.viewBoxMinX, 0) ||
    !iconFrameDimensionMatches(icon.svg.viewBoxMinY, 0) ||
    !iconFrameDimensionMatches(icon.svg.viewBoxWidth, defaultIconSize) ||
    !iconFrameDimensionMatches(icon.svg.viewBoxHeight, defaultIconSize)
  );
}

function iconFrameDimensionMatches(left: number, right: number): boolean {
  return Math.abs(left - right) <= SVG_FRAME_EPSILON;
}

function iconNeedsPublish(icon: ManagedIcon): boolean {
  return (
    icon.status !== "deprecated" &&
    icon.status !== "blocked" &&
    icon.quality.state !== "blocked" &&
    (!icon.figma.componentId || icon.figma.lastSyncedHash !== icon.svg.hash)
  );
}

function iconNeedsColorReview(icon: ManagedIcon): boolean {
  return icon.quality.issues.some((issue) =>
    issue.kind === "unknown-color" ||
    issue.kind === "multicolor" ||
    issue.kind === "inline-style" ||
    issue.kind === "style-block" ||
    issue.kind === "paint-server" ||
    issue.kind === "opacity",
  );
}

function iconNeedsQualityReview(icon: ManagedIcon): boolean {
  return icon.quality.state === "review";
}

function iconIsBlocked(icon: ManagedIcon): boolean {
  return icon.status === "blocked" || icon.quality.state === "blocked";
}

function iconCanUseOnCanvas(icon: ManagedIcon): boolean {
  return (
    !iconIsBlocked(icon) &&
    Boolean(icon.figma.componentId || icon.figma.componentKey)
  );
}

function getIconHealthSummary(
  icons: ManagedIcon[],
  defaultIconSize: number,
): IconHealthSummary {
  return icons.reduce<IconHealthSummary>(
    (summary, icon) => ({
      needsPublish: summary.needsPublish + (iconNeedsPublish(icon) ? 1 : 0),
      blocked: summary.blocked + (iconIsBlocked(icon) ? 1 : 0),
      qualityReview:
        summary.qualityReview + (iconNeedsQualityReview(icon) ? 1 : 0),
      frameIssues:
        summary.frameIssues + (iconHasFrameIssue(icon, defaultIconSize) ? 1 : 0),
      colorReview: summary.colorReview + (iconNeedsColorReview(icon) ? 1 : 0),
    }),
    { needsPublish: 0, blocked: 0, qualityReview: 0, frameIssues: 0, colorReview: 0 },
  );
}

function formatHealthCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function iconMatchesHealthFilter(
  icon: ManagedIcon,
  filter: IconHealthFilter,
  defaultIconSize: number,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "publish":
      return iconNeedsPublish(icon);
    case "blocked":
      return iconIsBlocked(icon);
    case "quality":
      return iconNeedsQualityReview(icon);
    case "frame":
      return iconHasFrameIssue(icon, defaultIconSize);
    case "color":
      return iconNeedsColorReview(icon);
  }
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createCorrelationId(): string {
  return `icons-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function publishIconsInFigma(
  message: Omit<PublishIconsMessage, "type" | "correlationId">,
  onProgress?: (current: number, total: number) => void,
): Promise<IconsPublishedMessage> {
  const correlationId = createCorrelationId();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Figma did not finish publishing icons."));
    }, 60_000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event: MessageEvent) {
      const pluginMessage = getPluginMessageFromEvent<
        IconsPublishedMessage | IconPublishProgressMessage
      >(event);
      if (
        pluginMessage?.type === "icons-publish-progress" &&
        pluginMessage.correlationId === correlationId
      ) {
        onProgress?.(pluginMessage.current, pluginMessage.total);
        return;
      }
      if (
        pluginMessage?.type !== "icons-published" ||
        pluginMessage.correlationId !== correlationId
      ) {
        return;
      }
      cleanup();
      resolve(pluginMessage);
    }

    window.addEventListener("message", handleMessage);
    const sent = postPluginMessage({
      type: "publish-icons",
      correlationId,
      ...message,
    });
    if (!sent) {
      cleanup();
      reject(new Error("Open the plugin in Figma to publish icons."));
    }
  });
}

function iconCanvasItem(icon: ManagedIcon): IconCanvasItem {
  return {
    id: icon.id,
    path: icon.path,
    componentName: icon.componentName,
    componentId: icon.figma.componentId,
    componentKey: icon.figma.componentKey,
  };
}

function runIconCanvasAction(
  message: IconCanvasActionRequest,
): Promise<IconCanvasActionResultMessage> {
  const correlationId = createCorrelationId();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Figma did not finish the icon action."));
    }, 15_000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event: MessageEvent) {
      const pluginMessage =
        getPluginMessageFromEvent<IconCanvasActionResultMessage>(event);
      if (
        pluginMessage?.type !== "icon-canvas-action-result" ||
        pluginMessage.correlationId !== correlationId
      ) {
        return;
      }
      cleanup();
      resolve(pluginMessage);
    }

    window.addEventListener("message", handleMessage);
    const sent = postPluginMessage({ ...message, correlationId });
    if (!sent) {
      cleanup();
      reject(new Error("Open the plugin in Figma to use icons on the canvas."));
    }
  });
}

function runIconUsageAudit(
  message: IconUsageAuditRequest,
): Promise<IconUsageAuditResultMessage> {
  const correlationId = createCorrelationId();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Figma did not finish auditing icon usage."));
    }, 30_000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event: MessageEvent) {
      const pluginMessage =
        getPluginMessageFromEvent<IconUsageAuditResultMessage>(event);
      if (
        pluginMessage?.type !== "icon-usage-audit-result" ||
        pluginMessage.correlationId !== correlationId
      ) {
        return;
      }
      cleanup();
      resolve(pluginMessage);
    }

    window.addEventListener("message", handleMessage);
    const sent = postPluginMessage({ ...message, correlationId });
    if (!sent) {
      cleanup();
      reject(new Error("Open the plugin in Figma to audit icon usage."));
    }
  });
}

function iconUsageAuditInput(icon: ManagedIcon): ScanIconUsageMessage["icons"][number] {
  return {
    id: icon.id,
    name: icon.name,
    path: icon.path,
    componentName: icon.componentName,
    status: icon.status,
    qualityState: icon.quality.state,
    svgHash: icon.svg.hash,
    componentId: icon.figma.componentId,
    componentKey: icon.figma.componentKey,
    lastSyncedHash: icon.figma.lastSyncedHash,
  };
}

function getIconSlotActions(selectedNodes: SelectionNodeInfo[]): IconSlotAction[] {
  const grouped = new Map<string, IconSlotAction>();

  for (const node of selectedNodes) {
    if ((node.depth ?? 0) !== 0 || node.type !== "INSTANCE") {
      continue;
    }

    for (const property of node.iconSwapProperties ?? []) {
      const existing = grouped.get(property.propertyName);
      if (existing) {
        existing.targetNodeIds.push(node.id);
      } else {
        grouped.set(property.propertyName, {
          propertyName: property.propertyName,
          label: property.label || "Icon",
          targetNodeIds: [node.id],
        });
      }
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

function getIconSlotSetupActions(selectedNodes: SelectionNodeInfo[]): IconSlotSetupAction[] {
  const grouped = new Map<string, IconSlotSetupAction>();

  for (const node of selectedNodes) {
    if ((node.depth ?? 0) !== 0) {
      continue;
    }

    for (const candidate of node.iconSlotCandidates ?? []) {
      const key = `${candidate.componentId}:${candidate.label}`;
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.targetNodeIds.includes(candidate.nodeId)) {
          existing.targetNodeIds.push(candidate.nodeId);
        }
      } else {
        grouped.set(key, {
          label: candidate.label,
          componentId: candidate.componentId,
          componentName: candidate.componentName,
          targetNodeIds: [candidate.nodeId],
        });
      }
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    `${a.componentName} ${a.label}`.localeCompare(`${b.componentName} ${b.label}`),
  );
}

function IconPreview({
  icon,
  content,
}: {
  icon: ManagedIcon;
  content?: string;
}) {
  const previewContent = icon.svg.content ?? content;
  if (previewContent) {
    return (
      <img
        src={svgDataUrl(previewContent)}
        alt=""
        className="h-8 w-8 object-contain"
        draggable={false}
      />
    );
  }

  return (
    <Shapes
      size={26}
      strokeWidth={1.5}
      className="text-[color:var(--color-figma-text-tertiary)]"
      aria-hidden
    />
  );
}

function IconStatusPill({ status }: { status: IconStatus }) {
  return (
    <span
      className={`inline-flex min-h-5 max-w-full items-center rounded px-1.5 text-[11px] font-medium leading-none ${STATUS_CLASS[status]}`}
    >
      {status}
    </span>
  );
}

function IconQualityPill({ icon }: { icon: ManagedIcon }) {
  if (icon.quality.state === "ready" || icon.status === "blocked") {
    return null;
  }

  const blocked = icon.quality.state === "blocked";
  return (
    <span
      className={`inline-flex min-h-5 max-w-full items-center rounded px-1.5 text-[11px] font-medium leading-none ${
        blocked
          ? "bg-[var(--workspace-danger)]/10 text-[color:var(--workspace-danger)]"
          : "bg-[var(--color-figma-warning)]/10 text-[color:var(--color-figma-text-warning)]"
      }`}
    >
      {blocked ? "blocked" : "review"}
    </span>
  );
}

function IconGrid({
  icons,
  iconContent,
  selectedIconId,
  onSelectIcon,
}: {
  icons: ManagedIcon[];
  iconContent: Record<string, IconContentCacheItem>;
  selectedIconId: string | null;
  onSelectIcon: (iconId: string) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
      {icons.map((icon) => {
        const selected = icon.id === selectedIconId;
        return (
          <button
            key={icon.id}
            type="button"
            onClick={() => onSelectIcon(icon.id)}
            aria-pressed={selected}
            className={`flex min-h-[120px] min-w-0 flex-col items-start gap-2 rounded-md border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-figma-accent)] ${
              selected
                ? "border-[color:var(--color-figma-accent)] bg-[var(--surface-selected)]"
                : "border-[color:var(--color-figma-border)] bg-[var(--color-figma-bg)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <span className="flex h-11 w-full items-center justify-center rounded bg-[var(--color-figma-bg-secondary)]">
              <IconPreview icon={icon} content={iconContent[icon.id]?.content} />
            </span>
            <span className="min-w-0 max-w-full">
              <span className="block truncate text-body font-medium text-[color:var(--color-figma-text)]">
                {icon.name}
              </span>
              <span className="block truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
                {icon.path}
              </span>
            </span>
            <span className="flex max-w-full flex-wrap gap-1">
              <IconStatusPill status={icon.status} />
              <IconQualityPill icon={icon} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IconHealthStrip({
  summary,
  activeFilter,
  onFilterChange,
}: {
  summary: IconHealthSummary;
  activeFilter: IconHealthFilter;
  onFilterChange: (filter: IconHealthFilter) => void;
}) {
  const issueCount =
    summary.needsPublish +
    summary.blocked +
    summary.qualityReview +
    summary.frameIssues +
    summary.colorReview;

  if (issueCount === 0) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
        <CheckCircle2 size={13} strokeWidth={1.5} aria-hidden />
        <span className="truncate">Library health is clear.</span>
      </div>
    );
  }

  const healthItems: Array<{
    filter: IconHealthFilter;
    count: number;
    label: string;
  }> = [
    { filter: "publish", count: summary.needsPublish, label: "to publish" },
    { filter: "blocked", count: summary.blocked, label: "blocked" },
    { filter: "quality", count: summary.qualityReview, label: "to review" },
    { filter: "frame", count: summary.frameIssues, label: "frame issue" },
    { filter: "color", count: summary.colorReview, label: "color review" },
  ];
  const items = healthItems.filter((item) => item.count > 0);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-warning)]">
      <AlertTriangle size={13} strokeWidth={1.5} aria-hidden />
      {items.map((item) => {
        const selected = activeFilter === item.filter;
        return (
          <button
            key={item.filter}
            type="button"
            onClick={() => onFilterChange(selected ? "all" : item.filter)}
            aria-pressed={selected}
            className={`min-h-5 rounded px-1.5 text-left leading-none transition-colors ${
              selected
                ? "bg-[var(--color-figma-warning)]/15 text-[color:var(--color-figma-text-warning)]"
                : "text-[color:var(--color-figma-text-warning)] hover:bg-[var(--color-figma-warning)]/10"
            }`}
          >
            {formatHealthCount(item.count, item.label)}
          </button>
        );
      })}
      {activeFilter !== "all" ? (
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className="min-h-5 rounded px-1.5 leading-none text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--surface-hover)]"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function auditActionLabel(action: IconUsageAuditFinding["action"]): string {
  switch (action) {
    case "publish":
      return "Publish";
    case "sync":
      return "Sync";
    case "replace":
      return "Replace";
    case "repair":
      return "Repair";
    case "deprecate":
      return "Deprecate";
    case "review":
      return "Review";
  }
}

function auditSeverityClass(severity: IconUsageAuditFinding["severity"]): string {
  switch (severity) {
    case "error":
      return "text-[color:var(--workspace-danger)]";
    case "warning":
      return "text-[color:var(--color-figma-text-warning)]";
    case "info":
      return "text-[color:var(--color-figma-text-secondary)]";
  }
}

function IconUsageAuditPanel({
  scope,
  loading,
  result,
  onScopeChange,
  onRun,
}: {
  scope: IconUsageAuditScope;
  loading: boolean;
  result: IconUsageAuditResultMessage | null;
  onScopeChange: (scope: IconUsageAuditScope) => void;
  onRun: () => void;
}) {
  const findings = result?.findings ?? [];
  const visibleFindings = findings.slice(0, 4);

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SegmentedControl
          value={scope}
          options={AUDIT_SCOPE_OPTIONS}
          onChange={onScopeChange}
          ariaLabel="Icon audit scope"
          size="compact"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRun}
          disabled={loading}
        >
          <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
          {loading ? "Auditing" : "Audit usage"}
        </Button>
        {result ? (
          <div className="min-w-0 truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
            {findings.length === 0
              ? `No issues across ${result.scannedNodes} layers`
              : `${formatHealthCount(findings.length, "finding")} across ${result.scannedNodes} layers`}
          </div>
        ) : null}
      </div>

      {result?.error ? (
        <p className="m-0 text-secondary text-[color:var(--workspace-danger)]">
          {result.error}
        </p>
      ) : null}

      {result && !result.error && findings.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
            <span>{formatHealthCount(result.summary.managedInstances, "managed use")}</span>
            <span>{formatHealthCount(result.summary.unmanagedComponents, "unmanaged component")}</span>
            <span>{formatHealthCount(result.summary.unpromotedIconSlots, "slot to set up")}</span>
            <span>{formatHealthCount(result.summary.rawIconLayers, "raw layer")}</span>
            <span>{formatHealthCount(result.summary.blockedUsages, "blocked use")}</span>
            <span>{formatHealthCount(result.summary.staleComponents, "stale sync")}</span>
          </div>
          {visibleFindings.map((finding) => (
            <div key={finding.id} className="flex min-w-0 items-start gap-2 text-secondary">
              <span className={`shrink-0 font-medium ${auditSeverityClass(finding.severity)}`}>
                {auditActionLabel(finding.action)}
              </span>
              <span className="min-w-0 text-[color:var(--color-figma-text-secondary)]">
                {finding.message}
              </span>
            </div>
          ))}
          {findings.length > visibleFindings.length ? (
            <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
              {findings.length - visibleFindings.length} more findings.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconInspector({
  icon,
  content,
  selectionCount,
  iconSlotActions,
  iconSlotSetupActions,
  defaultIconSize,
  canvasActionBusy,
  onInsert,
  onReplaceSelection,
  onSetIconSlot,
  onCreateIconSlot,
}: {
  icon: ManagedIcon;
  content?: string;
  selectionCount: number;
  iconSlotActions: IconSlotAction[];
  iconSlotSetupActions: IconSlotSetupAction[];
  defaultIconSize: number;
  canvasActionBusy: boolean;
  onInsert: () => void;
  onReplaceSelection: () => void;
  onSetIconSlot: (action: IconSlotAction) => void;
  onCreateIconSlot: (action: IconSlotSetupAction) => void;
}) {
  const publicSource = icon.source.kind === "public-library" ? icon.source : null;
  const rows: Array<[string, string]> = [
    ["Component", icon.componentName],
    ["Export", icon.code.exportName],
    ["Source", sourceLabel(icon)],
    ...(publicSource
      ? [
          ["License", publicSource.license.name] as [string, string],
          [
            "Attribution",
            publicSource.license.attributionRequired
              ? "Required"
              : "Not required by license metadata",
          ] as [string, string],
        ]
      : []),
    ["ViewBox", icon.svg.viewBox],
    ["Frame", iconFrameLabel(icon)],
    ["Color", colorBehaviorLabel(icon)],
    ["Paint", colorDetails(icon)],
    ["Readiness", qualityStateLabel(icon)],
    ["Hash", shortHash(icon.svg.hash)],
  ];
  const colorNote = colorBehaviorNote(icon);
  const frameMismatchNote = iconFrameMismatchNote(icon, defaultIconSize);
  const canUseOnCanvas = iconCanUseOnCanvas(icon);
  const publishNote = iconIsBlocked(icon)
    ? "Resolve blocked icon quality issues before publishing or placing this icon."
    : iconNeedsPublish(icon)
      ? icon.figma.componentId
        ? "The registry source changed since this component was last published."
        : "Publish this icon before designers use it from Figma assets."
      : null;

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-3 overflow-auto border-l border-[color:var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3 min-[560px]:flex">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[var(--color-figma-bg)]">
          <IconPreview icon={icon} content={content} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-body font-medium text-[color:var(--color-figma-text)]">
            {icon.name}
          </div>
          <div className="truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
            {icon.path}
          </div>
        </div>
      </div>

      <IconStatusPill status={icon.status} />

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onInsert}
          disabled={!canUseOnCanvas || canvasActionBusy}
          title={
            canUseOnCanvas
              ? "Insert icon instance"
              : "Publish this icon before inserting it"
          }
        >
          <MousePointer2 size={13} strokeWidth={1.5} aria-hidden />
          Insert
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onReplaceSelection}
          disabled={!canUseOnCanvas || selectionCount === 0 || canvasActionBusy}
          title={
            selectionCount === 0
              ? "Select layers in Figma to replace"
              : canUseOnCanvas
                ? "Replace selected layers with this icon"
                : "Publish this icon before replacing layers"
          }
        >
          <Replace size={13} strokeWidth={1.5} aria-hidden />
          Replace
        </Button>
      </div>

      {iconSlotActions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
            Icon slots
          </div>
          {iconSlotActions.map((action) => (
            <Button
              key={action.propertyName}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onSetIconSlot(action)}
              disabled={!canUseOnCanvas || canvasActionBusy}
              title={`Set ${action.label} to ${icon.name}`}
            >
              <Replace size={13} strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 truncate">
                Set {action.label}
                {action.targetNodeIds.length > 1
                  ? ` (${action.targetNodeIds.length})`
                  : ""}
              </span>
            </Button>
          ))}
        </div>
      ) : null}

      {iconSlotSetupActions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
            Component setup
          </div>
          {iconSlotSetupActions.map((action) => (
            <Button
              key={`${action.componentId}:${action.label}`}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onCreateIconSlot(action)}
              disabled={!canUseOnCanvas || canvasActionBusy}
              title={
                canUseOnCanvas
                  ? `Create ${action.label} on ${action.componentName}`
                  : "Publish this icon before creating component slots"
              }
            >
              <Replace size={13} strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 truncate">
                Create {action.label}
                {action.targetNodeIds.length > 1
                  ? ` (${action.targetNodeIds.length})`
                  : ""}
              </span>
            </Button>
          ))}
        </div>
      ) : null}

      <dl className="flex flex-col gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
              {label}
            </dt>
            <dd className="break-words text-secondary text-[color:var(--color-figma-text)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {colorNote ? (
        <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
          {colorNote}
        </p>
      ) : null}

      {publicSource ? (
        <div className="flex min-w-0 flex-col gap-1 text-secondary">
          {publicSource.license.attributionRequired ? (
            <p className="m-0 rounded bg-[var(--color-figma-warning)]/10 px-2 py-1.5 text-[color:var(--color-figma-text-warning)]">
              This source requires attribution. Keep it visible in handoff and export review.
            </p>
          ) : null}
          <a
            href={publicSource.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="break-words text-[color:var(--color-figma-text-accent)] underline"
          >
            View source
          </a>
          <a
            href={publicSource.license.url}
            target="_blank"
            rel="noreferrer"
            className="break-words text-[color:var(--color-figma-text-accent)] underline"
          >
            View license
          </a>
        </div>
      ) : null}

      {publishNote ? (
        <p className="m-0 rounded bg-[var(--color-figma-warning)]/10 px-2 py-1.5 text-secondary text-[color:var(--color-figma-text-warning)]">
          {publishNote}
        </p>
      ) : null}

      {frameMismatchNote ? (
        <p className="m-0 rounded bg-[var(--color-figma-warning)]/10 px-2 py-1.5 text-secondary text-[color:var(--color-figma-text-warning)]">
          {frameMismatchNote}
        </p>
      ) : null}

      {icon.quality.issues.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
            Quality
          </div>
          {icon.quality.issues.slice(0, 5).map((issue) => (
            <p
              key={`${issue.kind}:${issue.message}`}
              className={`m-0 rounded px-2 py-1.5 text-secondary ${
                issue.severity === "error"
                  ? "bg-[var(--workspace-danger)]/10 text-[color:var(--workspace-danger)]"
                  : "bg-[var(--color-figma-warning)]/10 text-[color:var(--color-figma-text-warning)]"
              }`}
            >
              {issue.message}
            </p>
          ))}
          {icon.quality.issues.length > 5 ? (
            <p className="m-0 text-secondary text-[color:var(--color-figma-text-tertiary)]">
              {icon.quality.issues.length - 5} more issues.
            </p>
          ) : null}
        </div>
      ) : null}

      {icon.tags && icon.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {icon.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[11px] text-[color:var(--color-figma-text-secondary)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

export function IconPanel() {
  const { connected, serverUrl } = useConnectionContext();
  const { selectedNodes } = useSelectionContext();
  const [registry, setRegistry] = useState<IconRegistryFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IconStatusFilter>("all");
  const [healthFilter, setHealthFilter] = useState<IconHealthFilter>("all");
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [attributionExporting, setAttributionExporting] = useState(false);
  const [canvasActionBusy, setCanvasActionBusy] = useState(false);
  const [auditScope, setAuditScope] = useState<IconUsageAuditScope>("selection");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<IconUsageAuditResultMessage | null>(null);
  const [publishProgress, setPublishProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [iconContent, setIconContent] = useState<Record<string, IconContentCacheItem>>({});

  const loadIconContents = useCallback(
    async (ids: string[]) => {
      if (!connected || ids.length === 0) {
        return;
      }
      const uniqueIds = Array.from(new Set(ids));
      const data = await apiFetch<IconContentsResponse>(
        `${serverUrl}/api/icons/contents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: uniqueIds }),
        },
      );
      const nextContent = Object.fromEntries(
        data.contents
          .filter((item): item is IconContentBatchItem & IconContentCacheItem =>
            typeof item.content === "string" && typeof item.hash === "string",
          )
          .map((item) => [
            item.id,
            {
              content: item.content,
              hash: item.hash,
            },
          ]),
      );
      if (Object.keys(nextContent).length > 0) {
        setIconContent((current) => ({ ...current, ...nextContent }));
      }
    },
    [connected, serverUrl],
  );

  const loadIcons = useCallback(
    async (signal?: AbortSignal) => {
      if (!connected) {
        setRegistry(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<IconsResponse>(`${serverUrl}/api/icons`, {
          signal: createFetchSignal(signal),
        });
        if (signal?.aborted) {
          return;
        }
        setRegistry(data.registry);
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) {
          return;
        }
        setError(getErrorMessage(err, "Failed to load icons."));
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [connected, serverUrl],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadIcons(controller.signal);
    return () => controller.abort();
  }, [loadIcons]);

  const icons = useMemo(() => registry?.icons ?? [], [registry]);
  const defaultIconSize = registry?.settings.defaultSize ?? 24;
  const healthSummary = useMemo(
    () => getIconHealthSummary(icons, defaultIconSize),
    [defaultIconSize, icons],
  );
  const existingIconPaths = useMemo(
    () => new Set(icons.map((icon) => icon.path.toLowerCase())),
    [icons],
  );
  const existingLinkedIconPaths = useMemo(
    () =>
      new Set(
        icons
          .filter((icon) => icon.figma.componentId || icon.figma.componentKey)
          .map((icon) => icon.path.toLowerCase()),
      ),
    [icons],
  );
  const missingContentIds = useMemo(
    () =>
      icons
        .filter((icon) => {
          if (icon.svg.content) {
            return false;
          }
          const cached = iconContent[icon.id];
          return !cached || cached.hash !== icon.svg.hash;
        })
        .map((icon) => icon.id),
    [iconContent, icons],
  );

  useEffect(() => {
    void loadIconContents(missingContentIds);
  }, [loadIconContents, missingContentIds]);

  const filteredIcons = useMemo(
    () =>
      icons.filter(
        (icon) =>
          (statusFilter === "all" || icon.status === statusFilter) &&
          iconMatchesQuery(icon, query) &&
          iconMatchesHealthFilter(icon, healthFilter, defaultIconSize),
      ),
    [defaultIconSize, healthFilter, icons, query, statusFilter],
  );

  const selectedIcon = useMemo(
    () =>
      filteredIcons.find((icon) => icon.id === selectedIconId) ??
      filteredIcons[0] ??
      null,
    [filteredIcons, selectedIconId],
  );
  const selectedIconCanUseOnCanvas = selectedIcon
    ? iconCanUseOnCanvas(selectedIcon)
    : false;
  const iconSlotActions = useMemo(
    () => getIconSlotActions(selectedNodes),
    [selectedNodes],
  );
  const iconSlotSetupActions = useMemo(
    () => getIconSlotSetupActions(selectedNodes),
    [selectedNodes],
  );

  const iconsToPublish = useMemo(
    () => icons.filter(iconNeedsPublish),
    [icons],
  );
  const publicIconCount = useMemo(
    () => icons.filter((icon) => icon.source.kind === "public-library").length,
    [icons],
  );

  useEffect(() => {
    if (selectedIcon?.id && selectedIcon.id !== selectedIconId) {
      setSelectedIconId(selectedIcon.id);
    }
    if (!selectedIcon && selectedIconId !== null) {
      setSelectedIconId(null);
    }
  }, [selectedIcon, selectedIconId]);

  const handlePublish = useCallback(async () => {
    if (!registry || iconsToPublish.length === 0 || publishing) {
      return;
    }

    setPublishing(true);
    setPublishProgress({ current: 0, total: iconsToPublish.length });
    setError(null);
    try {
      const contentIds = iconsToPublish.map((icon) => icon.id);
      const contentBatch = await apiFetch<IconContentsResponse>(
        `${serverUrl}/api/icons/contents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: contentIds }),
        },
      );
      const contentById = new Map(
        contentBatch.contents
          .filter((item) => item.content && item.hash)
          .map((item) => [item.id, item]),
      );
      const contentErrors = contentBatch.contents.filter((item) => item.error);
      if (contentErrors.length > 0) {
        throw new Error(contentErrors[0].error ?? "Icon SVG content could not load.");
      }

      const publishItems = iconsToPublish.map((icon) => {
        const content = contentById.get(icon.id);
        if (!content?.content || !content.hash) {
          throw new Error(`Icon "${icon.name}" SVG content could not load.`);
        }
        return {
          id: icon.id,
          path: icon.path,
          componentName: icon.componentName,
          svgContent: content.content,
          svgHash: content.hash,
          colorBehavior: icon.svg.color.behavior,
          targetSize: registry.settings.defaultSize,
          componentId: icon.figma.componentId,
        };
      });

      const published = await publishIconsInFigma({
        pageName: registry.settings.pageName,
        icons: publishItems,
      }, (current, total) => setPublishProgress({ current, total }));
      const failures = published.results.filter((result) => result.error);
      const warnings = published.results.filter((result) => result.warning);
      const successes = published.results.filter(
        (result) =>
          !result.error && result.componentId && result.lastSyncedHash,
      );

      if (successes.length > 0) {
        const patched = await apiFetch<IconFigmaLinksResponse>(
          `${serverUrl}/api/icons/figma-links`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              links: successes.map((result) => ({
                id: result.id,
                componentId: result.componentId,
                componentKey: result.componentKey ?? null,
                lastSyncedHash: result.lastSyncedHash,
              })),
            }),
          },
        );
        setRegistry(patched.registry);
      }

      if (successes.length > 0) {
        dispatchToast(
          `Published ${formatIconCount(successes.length)} to Figma.`,
          "success",
        );
      }
      if (warnings.length > 0) {
        dispatchToast(
          `${formatIconCount(warnings.length)} used structural artwork replacement. Review existing instances.`,
          "warning",
        );
      }
      if (failures.length > 0) {
        dispatchToast(
          `${formatIconCount(failures.length)} could not publish.`,
          "error",
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to publish icons."));
    } finally {
      setPublishing(false);
      setPublishProgress(null);
    }
  }, [iconsToPublish, publishing, registry, serverUrl]);

  const handleExportAttribution = useCallback(async () => {
    if (attributionExporting) {
      return;
    }

    setAttributionExporting(true);
    setError(null);
    try {
      const manifest = await apiFetch<IconAttributionManifest>(
        `${serverUrl}/api/icons/attribution`,
        { signal: createFetchSignal(undefined, 10_000) },
      );
      const payload = JSON.stringify(manifest, null, 2);
      downloadBlob(
        new Blob([payload], { type: "application/json" }),
        "icon-attribution.json",
      );
      dispatchToast(
        `Exported attribution for ${formatIconCount(manifest.summary.publicIconCount)}.`,
        "success",
      );
    } catch (err) {
      const message = getErrorMessage(err, "Failed to export icon attribution.");
      setError(message);
      dispatchToast(message, "error");
    } finally {
      setAttributionExporting(false);
    }
  }, [attributionExporting, serverUrl]);

  const handleInsert = useCallback(async () => {
    if (!selectedIcon || canvasActionBusy || !iconCanUseOnCanvas(selectedIcon)) {
      return;
    }

    setCanvasActionBusy(true);
    try {
      const result = await runIconCanvasAction({
        type: "insert-icon",
        icon: iconCanvasItem(selectedIcon),
      });
      if (result.error) {
        throw new Error(result.error);
      }
      dispatchToast(`Inserted ${selectedIcon.name}.`, "success");
    } catch (err) {
      dispatchToast(getErrorMessage(err, "Failed to insert icon."), "error");
    } finally {
      setCanvasActionBusy(false);
    }
  }, [canvasActionBusy, selectedIcon]);

  const handleReplaceSelection = useCallback(async () => {
    if (
      !selectedIcon ||
      selectedNodes.length === 0 ||
      canvasActionBusy ||
      !iconCanUseOnCanvas(selectedIcon)
    ) {
      return;
    }

    setCanvasActionBusy(true);
    try {
      const result = await runIconCanvasAction({
        type: "replace-selection-with-icon",
        icon: iconCanvasItem(selectedIcon),
      });
      if (result.error) {
        throw new Error(result.error);
      }

      dispatchToast(
        `Replaced ${formatIconCount(result.count)} with ${selectedIcon.name}.${formatSkippedSuffix(result)}`,
        result.skipped > 0 ? "warning" : "success",
      );
    } catch (err) {
      dispatchToast(getErrorMessage(err, "Failed to replace selection."), "error");
    } finally {
      setCanvasActionBusy(false);
    }
  }, [canvasActionBusy, selectedIcon, selectedNodes.length]);

  const handleSetIconSlot = useCallback(async (action: IconSlotAction) => {
    if (
      !selectedIcon ||
      action.targetNodeIds.length === 0 ||
      canvasActionBusy ||
      !iconCanUseOnCanvas(selectedIcon)
    ) {
      return;
    }

    setCanvasActionBusy(true);
    try {
      const result = await runIconCanvasAction({
        type: "set-icon-swap-property",
        icon: iconCanvasItem(selectedIcon),
        propertyName: action.propertyName,
        targetNodeIds: action.targetNodeIds,
      });
      if (result.error) {
        throw new Error(result.error);
      }

      dispatchToast(
        `Set ${action.label} to ${selectedIcon.name} on ${formatIconCount(result.count)}.${formatSkippedSuffix(result)}`,
        result.skipped > 0 ? "warning" : "success",
      );
    } catch (err) {
      dispatchToast(getErrorMessage(err, "Failed to set icon slot."), "error");
    } finally {
      setCanvasActionBusy(false);
    }
  }, [canvasActionBusy, selectedIcon]);

  const handleCreateIconSlot = useCallback(async (action: IconSlotSetupAction) => {
    if (
      !selectedIcon ||
      action.targetNodeIds.length === 0 ||
      canvasActionBusy ||
      !iconCanUseOnCanvas(selectedIcon)
    ) {
      return;
    }

    setCanvasActionBusy(true);
    try {
      const result = await runIconCanvasAction({
        type: "create-icon-slot",
        icon: iconCanvasItem(selectedIcon),
        targetNodeIds: action.targetNodeIds,
      });
      if (result.error) {
        throw new Error(result.error);
      }

      dispatchToast(
        `Created ${action.label} with ${selectedIcon.name} on ${formatIconCount(result.count)}.${formatSkippedSuffix(result)}`,
        result.skipped > 0 ? "warning" : "success",
      );
    } catch (err) {
      dispatchToast(getErrorMessage(err, "Failed to create icon slot."), "error");
    } finally {
      setCanvasActionBusy(false);
    }
  }, [canvasActionBusy, selectedIcon]);

  const handleAuditUsage = useCallback(async () => {
    if (auditLoading) {
      return;
    }

    setAuditLoading(true);
    try {
      const result = await runIconUsageAudit({
        type: "scan-icon-usage",
        scope: auditScope,
        icons: icons.map(iconUsageAuditInput),
      });
      setAuditResult(result);
      if (result.error) {
        throw new Error(result.error);
      }
      dispatchToast(
        result.findings.length === 0
          ? "Icon usage audit found no issues."
          : `Icon usage audit found ${formatHealthCount(result.findings.length, "finding")}.`,
        result.findings.length === 0 ? "success" : "warning",
      );
    } catch (err) {
      const message = getErrorMessage(err, "Failed to audit icon usage.");
      setAuditResult({
        type: "icon-usage-audit-result",
        scope: auditScope,
        findings: [],
        summary: {
          managedInstances: 0,
          unmanagedComponents: 0,
          unpromotedIconSlots: 0,
          rawIconLayers: 0,
          deprecatedUsages: 0,
          blockedUsages: 0,
          staleComponents: 0,
          missingComponents: 0,
        },
        scannedNodes: 0,
        error: message,
      });
      dispatchToast(message, "error");
    } finally {
      setAuditLoading(false);
    }
  }, [auditLoading, auditScope, icons]);

  if (!connected) {
    return (
      <FeedbackPlaceholder
        variant="disconnected"
        title="Connect to the local server"
        description="Icons are stored in the workspace registry."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <PanelContentHeader
        primaryAction={{
          label: "Import",
          onClick: () => setImportOpen(true),
        }}
      />

      <div className="flex shrink-0 flex-col gap-2 border-b border-[color:var(--color-figma-border)] px-3 py-2">
        <SearchField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="Search icons"
          size="sm"
        />
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            value={statusFilter}
            options={STATUS_FILTERS}
            onChange={setStatusFilter}
            ariaLabel="Icon status"
            size="compact"
          />
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            {formatIconCount(filteredIcons.length)}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handlePublish()}
            disabled={publishing || iconsToPublish.length === 0}
          >
            <UploadCloud size={13} strokeWidth={1.5} aria-hidden />
            {publishProgress
              ? `Publishing ${publishProgress.current}/${publishProgress.total}`
              : publishing
                ? "Publishing"
                : "Publish"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleExportAttribution()}
            disabled={attributionExporting || publicIconCount === 0}
            title={
              publicIconCount > 0
                ? "Export public icon source and license metadata"
                : "Import public library icons before exporting attribution"
            }
          >
            <Download size={13} strokeWidth={1.5} aria-hidden />
            {attributionExporting ? "Exporting" : "Attribution"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadIcons()}
            disabled={loading}
          >
            <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
            {loading ? "Refreshing" : "Refresh"}
          </Button>
        </div>
        <IconHealthStrip
          summary={healthSummary}
          activeFilter={healthFilter}
          onFilterChange={setHealthFilter}
        />
        <IconUsageAuditPanel
          scope={auditScope}
          loading={auditLoading}
          result={auditResult}
          onScopeChange={(scope) => {
            setAuditScope(scope);
            setAuditResult(null);
          }}
          onRun={() => void handleAuditUsage()}
        />
        {selectedIcon ? (
          <div className="flex min-w-0 items-center gap-2 min-[560px]:hidden">
            <div className="min-w-0 flex-1 truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
              {selectedIcon.name}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleInsert()}
              disabled={canvasActionBusy || !selectedIconCanUseOnCanvas}
              title="Insert icon instance"
            >
              <MousePointer2 size={13} strokeWidth={1.5} aria-hidden />
              Insert
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleReplaceSelection()}
              disabled={
                canvasActionBusy ||
                selectedNodes.length === 0 ||
                !selectedIconCanUseOnCanvas
              }
              title="Replace selected layers with this icon"
            >
              <Replace size={13} strokeWidth={1.5} aria-hidden />
              Replace
            </Button>
            {iconSlotActions[0] ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleSetIconSlot(iconSlotActions[0])}
                disabled={canvasActionBusy || !selectedIconCanUseOnCanvas}
                title={`Set ${iconSlotActions[0].label} to this icon`}
              >
                <Replace size={13} strokeWidth={1.5} aria-hidden />
                <span className="min-w-0 truncate">
                  Set {iconSlotActions[0].label}
                </span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <FeedbackPlaceholder
          variant="error"
          title="Icons could not load"
          description={error}
          primaryAction={{
            label: "Retry",
            onClick: () => void loadIcons(),
            disabled: loading,
          }}
        />
      ) : loading && !registry ? (
        <FeedbackPlaceholder
          variant="empty"
          title="Loading icons"
          icon={<RefreshCw size={16} strokeWidth={1.5} aria-hidden />}
        />
      ) : icons.length === 0 ? (
        <FeedbackPlaceholder
          variant="empty"
          title="No icons yet"
          description="Imported SVG icons will appear here."
          primaryAction={{
            label: "Import icons",
            onClick: () => setImportOpen(true),
          }}
        />
      ) : filteredIcons.length === 0 ? (
        <FeedbackPlaceholder
          variant="no-results"
          title="No matching icons"
          description="Change the search or status filter."
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto p-3">
            <IconGrid
              icons={filteredIcons}
              iconContent={iconContent}
              selectedIconId={selectedIcon?.id ?? null}
              onSelectIcon={setSelectedIconId}
            />
          </div>
          {selectedIcon ? (
            <IconInspector
              icon={selectedIcon}
              content={iconContent[selectedIcon.id]?.content}
              selectionCount={selectedNodes.length}
              iconSlotActions={iconSlotActions}
              iconSlotSetupActions={iconSlotSetupActions}
              defaultIconSize={defaultIconSize}
              canvasActionBusy={canvasActionBusy}
              onInsert={handleInsert}
              onReplaceSelection={handleReplaceSelection}
              onSetIconSlot={handleSetIconSlot}
              onCreateIconSlot={handleCreateIconSlot}
            />
          ) : null}
        </div>
      )}
      {importOpen ? (
        <IconImportDialog
          serverUrl={serverUrl}
          existingIconPaths={existingIconPaths}
          existingLinkedIconPaths={existingLinkedIconPaths}
          defaultIconSize={defaultIconSize}
          onClose={() => setImportOpen(false)}
          onImported={(nextRegistry, importedIcons) => {
            setRegistry(nextRegistry);
            const firstIcon = importedIcons[0];
            if (firstIcon) {
              setSelectedIconId(firstIcon.id);
              setQuery("");
              setStatusFilter("all");
            }
            dispatchToast(
              `Imported ${formatIconCount(importedIcons.length)}.`,
              "success",
            );
          }}
        />
      ) : null}
    </div>
  );
}
