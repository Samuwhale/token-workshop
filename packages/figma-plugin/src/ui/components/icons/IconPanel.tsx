import { useCallback, useEffect, useMemo, useState } from "react";
import type { IconRegistryFile, IconStatus, ManagedIcon } from "@token-workshop/core";
import type {
  IconPublishProgressMessage,
  IconsPublishedMessage,
  PublishIconsMessage,
} from "../../../shared/types";
import {
  getPluginMessageFromEvent,
  postPluginMessage,
} from "../../../shared/utils";
import { RefreshCw, Shapes, UploadCloud } from "lucide-react";
import { useConnectionContext } from "../../contexts/ConnectionContext";
import { FeedbackPlaceholder } from "../FeedbackPlaceholder";
import { PanelContentHeader } from "../PanelContentHeader";
import { Button, SearchField, SegmentedControl } from "../../primitives";
import { apiFetch, createFetchSignal } from "../../shared/apiFetch";
import { dispatchToast } from "../../shared/toastBus";
import { getErrorMessage, isAbortError } from "../../shared/utils";
import { IconImportDialog } from "./IconImportDialog";

type IconStatusFilter = "all" | IconStatus;

interface IconsResponse {
  registry: IconRegistryFile;
}

interface IconContentBatchItem {
  id: string;
  content?: string;
  hash?: string;
  error?: string;
}

interface IconContentsResponse {
  contents: IconContentBatchItem[];
}

interface IconFigmaLinksResponse {
  ok: true;
  icons: ManagedIcon[];
  registry: IconRegistryFile;
}

const STATUS_FILTERS: Array<{ value: IconStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "deprecated", label: "Deprecated" },
];

const STATUS_CLASS: Record<IconStatus, string> = {
  draft: "bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]",
  published: "bg-[var(--color-figma-success)]/10 text-[color:var(--color-figma-text-success)]",
  deprecated: "bg-[var(--color-figma-warning)]/10 text-[color:var(--color-figma-text-warning)]",
};

function formatIconCount(count: number): string {
  return `${count} ${count === 1 ? "icon" : "icons"}`;
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

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

function IconGrid({
  icons,
  iconContent,
  selectedIconId,
  onSelectIcon,
}: {
  icons: ManagedIcon[];
  iconContent: Record<string, string>;
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
              <IconPreview icon={icon} content={iconContent[icon.id]} />
            </span>
            <span className="min-w-0 max-w-full">
              <span className="block truncate text-body font-medium text-[color:var(--color-figma-text)]">
                {icon.name}
              </span>
              <span className="block truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
                {icon.path}
              </span>
            </span>
            <IconStatusPill status={icon.status} />
          </button>
        );
      })}
    </div>
  );
}

function IconInspector({
  icon,
  content,
}: {
  icon: ManagedIcon;
  content?: string;
}) {
  const rows = [
    ["Component", icon.componentName],
    ["Export", icon.code.exportName],
    ["Source", sourceLabel(icon)],
    ["ViewBox", icon.svg.viewBox],
    ["Color", colorBehaviorLabel(icon)],
    ["Paint", colorDetails(icon)],
    ["Hash", shortHash(icon.svg.hash)],
  ];
  const colorNote = colorBehaviorNote(icon);

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
  const [registry, setRegistry] = useState<IconRegistryFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<IconStatusFilter>("all");
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [iconContent, setIconContent] = useState<Record<string, string>>({});

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
          .filter((item): item is IconContentBatchItem & { content: string } =>
            typeof item.content === "string",
          )
          .map((item) => [item.id, item.content]),
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
  const missingContentIds = useMemo(
    () =>
      icons
        .filter((icon) => !icon.svg.content && !iconContent[icon.id])
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
          iconMatchesQuery(icon, query),
      ),
    [icons, query, statusFilter],
  );

  const selectedIcon = useMemo(
    () =>
      filteredIcons.find((icon) => icon.id === selectedIconId) ??
      filteredIcons[0] ??
      null,
    [filteredIcons, selectedIconId],
  );

  const iconsToPublish = useMemo(
    () =>
      icons.filter(
        (icon) =>
          icon.status !== "deprecated" &&
          (!icon.figma.componentId ||
            icon.figma.lastSyncedHash !== icon.svg.hash),
      ),
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
            variant="ghost"
            size="sm"
            onClick={() => void loadIcons()}
            disabled={loading}
          >
            <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
            {loading ? "Refreshing" : "Refresh"}
          </Button>
        </div>
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
              content={iconContent[selectedIcon.id]}
            />
          ) : null}
        </div>
      )}
      {importOpen ? (
        <IconImportDialog
          serverUrl={serverUrl}
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
