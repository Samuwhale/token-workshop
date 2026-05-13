import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import {
  normalizeIconPath,
  type IconRegistryFile,
  type ManagedIcon,
} from "@token-workshop/core";
import type {
  IconSelectionImportItem,
  ReadIconSelectionMessage,
  IconSelectionReadMessage,
} from "../../../shared/types";
import { Check, ExternalLink, FileUp, MousePointer2, Search } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button, Field, SearchField, SegmentedControl, TextInput } from "../../primitives";
import {
  CONTROL_INPUT_BASE_CLASSES,
  CONTROL_INPUT_DEFAULT_STATE_CLASSES,
  CONTROL_INPUT_DISABLED_CLASSES,
} from "../../shared/controlClasses";
import { apiFetch, createFetchSignal } from "../../shared/apiFetch";
import { getErrorMessage, isAbortError } from "../../shared/utils";
import { requestPluginMessage } from "../../shared/pluginMessaging";

type ImportMode = "library" | "files" | "selection" | "paste" | "workspace";
type PublicIconSourceId =
  | "lucide"
  | "material-symbols"
  | "tabler"
  | "heroicons"
  | "all"
  | "custom";

interface IconImportResponse {
  ok: true;
  icon: ManagedIcon;
  registry: IconRegistryFile;
  created: boolean;
}

interface IconImportBatchResponse {
  ok: true;
  icons: ManagedIcon[];
  registry: IconRegistryFile;
  created: boolean[];
}

interface PublicIconProvider {
  id: string;
  name: string;
  description: string;
}

interface PublicIconProvidersResponse {
  providers: PublicIconProvider[];
}

interface PublicIconCollection {
  id: string;
  name: string;
  total: number;
  category?: string;
  tags: string[];
  license: {
    name: string;
    url: string;
    attributionRequired: boolean;
  };
}

interface PublicIconSearchResult {
  id: string;
  provider: string;
  providerName: string;
  collection: PublicIconCollection;
  name: string;
  path: string;
  svgUrl: string;
  sourceUrl: string;
}

interface PublicIconSearchResponse {
  provider: PublicIconProvider;
  query: string;
  total: number;
  limit: number;
  start: number;
  icons: PublicIconSearchResult[];
  collections: PublicIconCollection[];
}

interface PublicIconCategory {
  name: string;
  count: number;
}

interface PublicIconCollectionListResponse {
  provider: PublicIconProvider;
  query: string;
  category?: string;
  total: number;
  limit: number;
  start: number;
  collections: PublicIconCollection[];
  categories: PublicIconCategory[];
}

interface PublicIconCollectionBrowseResponse {
  provider: PublicIconProvider;
  collection: PublicIconCollection;
  category?: string;
  total: number;
  limit: number;
  start: number;
  icons: PublicIconSearchResult[];
  categories: PublicIconCategory[];
}

type PublicIconResultsResponse =
  | PublicIconSearchResponse
  | PublicIconCollectionBrowseResponse;

interface PublicIconLicenseSummary {
  key: string;
  providerName: string;
  collectionName: string;
  licenseName: string;
  licenseUrl: string;
  attributionRequired: boolean;
  iconCount: number;
}

interface EditableSelectionIcon extends IconSelectionImportItem {
  path: string;
  displayName: string;
}

type SelectionImportIssue = {
  tone: "error" | "warning" | "info";
  message: string;
};

const SVG_FRAME_EPSILON = 1e-6;

interface IconImportDialogProps {
  serverUrl: string;
  existingIconPaths: Set<string>;
  existingLinkedIconPaths: Set<string>;
  defaultIconSize: number;
  onClose: () => void;
  onImported: (registry: IconRegistryFile, icons: ManagedIcon[]) => void;
}

const IMPORT_MODES: Array<{ value: ImportMode; label: string }> = [
  { value: "library", label: "Library" },
  { value: "files", label: "Files" },
  { value: "selection", label: "Selection" },
  { value: "paste", label: "Paste" },
  { value: "workspace", label: "Path" },
];

const PUBLIC_ICON_SOURCES: Array<{
  id: Exclude<PublicIconSourceId, "all" | "custom">;
  label: string;
  collection: string;
}> = [
  { id: "lucide", label: "Lucide", collection: "lucide" },
  {
    id: "material-symbols",
    label: "Material",
    collection: "material-symbols",
  },
  { id: "tabler", label: "Tabler", collection: "tabler" },
  {
    id: "heroicons",
    label: "Heroicons",
    collection: "heroicons",
  },
];

function trimSvgExtension(path: string): string {
  return path.replace(/\.svg$/i, "");
}

function browserFilePath(file: File): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return trimSvgExtension((relativePath || file.name).replace(/\\/g, "/"));
}

function pathFromWorkspaceFilePath(filePath: string): string {
  return trimSvgExtension(filePath.replace(/\\/g, "/").split("/").filter(Boolean).join("."));
}

function parseTags(input: string): string[] | undefined {
  const tags = input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? Array.from(new Set(tags)) : undefined;
}

function readSvgFile(file: File): Promise<string> {
  return file.text();
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function summarizePublicIconLicenses(
  icons: PublicIconSearchResult[],
): PublicIconLicenseSummary[] {
  const summaries = new Map<string, PublicIconLicenseSummary>();
  for (const icon of icons) {
    const key = [
      icon.provider,
      icon.collection.id,
      icon.collection.license.name,
      icon.collection.license.url,
      icon.collection.license.attributionRequired ? "attribution" : "no-attribution",
    ].join(":");
    const existing = summaries.get(key);
    if (existing) {
      existing.iconCount += 1;
      continue;
    }
    summaries.set(key, {
      key,
      providerName: icon.providerName,
      collectionName: icon.collection.name,
      licenseName: icon.collection.license.name,
      licenseUrl: icon.collection.license.url,
      attributionRequired: icon.collection.license.attributionRequired,
      iconCount: 1,
    });
  }
  return Array.from(summaries.values()).sort((left, right) =>
    `${left.providerName} ${left.collectionName} ${left.licenseName}`.localeCompare(
      `${right.providerName} ${right.collectionName} ${right.licenseName}`,
    ),
  );
}

function formatPublicIconSelection(count: number): string {
  return `${count} selected`;
}

function publicIconImportLabel(count: number, busy: boolean): string {
  if (busy) {
    return "Importing...";
  }
  if (count === 0) {
    return "Import";
  }
  return `Import ${count} icon${count === 1 ? "" : "s"}`;
}

function attributionSummaryLabel(required: boolean): string {
  return required ? "attribution required" : "no attribution required";
}

function formatIconDimension(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatIconFrame(width: number, height: number): string {
  return `${formatIconDimension(width)}x${formatIconDimension(height)}`;
}

function iconFrameDimensionMatches(left: number, right: number): boolean {
  return Math.abs(left - right) <= SVG_FRAME_EPSILON;
}

function iconPathKey(path: string): string {
  try {
    return normalizeIconPath(path);
  } catch {
    return "";
  }
}

function readIconSelectionFromFigma(): Promise<IconSelectionReadMessage> {
  return requestPluginMessage<ReadIconSelectionMessage, IconSelectionReadMessage>(
    {
      type: "read-icon-selection",
    },
    {
      idPrefix: "icon-import",
      responseType: "icon-selection-read",
      timeoutMs: 15_000,
      timeoutMessage: "Figma did not finish reading the selection.",
      unavailableMessage: "Open the plugin in Figma to import from selection.",
    },
  );
}

function editableSelectionIcons(
  icons: IconSelectionImportItem[],
): EditableSelectionIcon[] {
  return icons.map((icon) => ({
    ...icon,
    path: icon.suggestedPath,
    displayName: icon.suggestedName,
  }));
}

function isPublicIconCollectionBrowseResponse(
  response: PublicIconResultsResponse | null,
): response is PublicIconCollectionBrowseResponse {
  return Boolean(response && "collection" in response);
}

function publicResultSummary(response: PublicIconResultsResponse): string {
  return response.icons.length === response.total
    ? `${response.icons.length} icon${response.icons.length === 1 ? "" : "s"}`
    : `${response.icons.length} of ${response.total} icons`;
}

function mergePublicIconResults(
  current: PublicIconResultsResponse | null,
  next: PublicIconResultsResponse,
): PublicIconResultsResponse {
  if (!current) {
    return next;
  }
  if (
    isPublicIconCollectionBrowseResponse(current) !==
    isPublicIconCollectionBrowseResponse(next)
  ) {
    return next;
  }
  return {
    ...next,
    start: current.start,
    icons: [...current.icons, ...next.icons],
  };
}

function mergePublicCollectionResults(
  current: PublicIconCollectionListResponse | null,
  next: PublicIconCollectionListResponse,
): PublicIconCollectionListResponse {
  if (!current) {
    return next;
  }
  return {
    ...next,
    start: current.start,
    collections: [...current.collections, ...next.collections],
  };
}

function PublicLibraryRail({
  selectedPublicSourceId,
  disabled,
  onSelectSource,
  onOpenCatalog,
}: {
  selectedPublicSourceId: PublicIconSourceId;
  disabled: boolean;
  onSelectSource: (source: (typeof PUBLIC_ICON_SOURCES)[number]) => void;
  onOpenCatalog: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {PUBLIC_ICON_SOURCES.map((source) => (
        <Button
          key={source.id}
          type="button"
          variant="secondary"
          size="sm"
          aria-pressed={selectedPublicSourceId === source.id}
          onClick={() => onSelectSource(source)}
          disabled={disabled}
        >
          {source.label}
        </Button>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-pressed={selectedPublicSourceId === "all"}
        onClick={onOpenCatalog}
        disabled={disabled}
      >
        All libraries
      </Button>
    </div>
  );
}

function PublicCollectionCatalog({
  query,
  onQueryChange,
  onSearch,
  onLoadMore,
  canLoadMore,
  loading,
  response,
  selectedCollectionId,
  onSelectCollection,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onLoadMore: () => void;
  canLoadMore: boolean;
  loading: boolean;
  response: PublicIconCollectionListResponse | null;
  selectedCollectionId: string;
  onSelectCollection: (collection: PublicIconCollection) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] p-2">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <SearchField
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onClear={() => onQueryChange("")}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch();
            }
          }}
          placeholder="Find a library"
          size="sm"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onSearch}
          disabled={loading}
          className="bg-[var(--color-figma-bg)]"
        >
          <Search size={13} strokeWidth={1.5} aria-hidden />
          {loading ? "Loading" : "Find"}
        </Button>
      </div>
      {response ? (
        <>
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            {response.collections.length} of {response.total} libraries
          </div>
          <div className="flex max-h-36 min-w-0 flex-col gap-1 overflow-auto pr-1">
            {response.collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => onSelectCollection(collection)}
                aria-pressed={collection.id === selectedCollectionId}
                className={`flex min-w-0 items-center justify-between gap-3 rounded px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-figma-accent)] ${
                  collection.id === selectedCollectionId
                    ? "bg-[var(--surface-selected)] text-[color:var(--color-figma-text)]"
                    : "hover:bg-[var(--surface-hover)]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium">
                    {collection.name}
                  </span>
                  <span className="block truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
                    {collection.id}
                    {collection.category ? ` · ${collection.category}` : ""}
                    {" · "}
                    {collection.license.name}
                  </span>
                </span>
                <span className="shrink-0 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                  {collection.total}
                </span>
              </button>
            ))}
          </div>
          {canLoadMore ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onLoadMore}
              disabled={loading}
              className="self-start bg-[var(--color-figma-bg)]"
            >
              {loading ? "Loading" : "More libraries"}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          Browse the full Iconify catalog or open a collection by prefix.
        </div>
      )}
    </div>
  );
}

function PublicCollectionHeader({
  collection,
  resultSummary,
}: {
  collection: PublicIconCollection | null;
  resultSummary: string;
}) {
  if (!collection) return null;
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-body font-semibold text-[color:var(--color-figma-text)]">
          {collection.name}
        </div>
        <div className="truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
          {collection.id}
          {collection.category ? ` · ${collection.category}` : ""}
          {" · "}
          {collection.license.name}
          {collection.license.attributionRequired ? " · attribution" : ""}
        </div>
      </div>
      <div className="shrink-0 text-secondary text-[color:var(--color-figma-text-tertiary)]">
        {resultSummary}
      </div>
    </div>
  );
}

function PublicCategoryFilter({
  categories,
  selectedCategory,
  disabled,
  onSelectCategory,
}: {
  categories: PublicIconCategory[];
  selectedCategory: string;
  disabled: boolean;
  onSelectCategory: (category: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto pb-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={!selectedCategory}
        onClick={() => onSelectCategory("")}
        disabled={disabled}
      >
        All
      </Button>
      {categories.map((category) => (
        <Button
          key={category.name}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={selectedCategory === category.name}
          onClick={() => onSelectCategory(category.name)}
          disabled={disabled}
        >
          {category.name}
        </Button>
      ))}
    </div>
  );
}

function PublicIconGrid({
  icons,
  selectedIconIds,
  existingIconPaths,
  onToggleIcon,
}: {
  icons: PublicIconSearchResult[];
  selectedIconIds: Set<string>;
  existingIconPaths: Set<string>;
  onToggleIcon: (iconId: string) => void;
}) {
  return (
    <div className="grid max-h-80 min-w-0 grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2 overflow-auto pr-1">
      {icons.map((icon) => {
        const selected = selectedIconIds.has(icon.id);
        const updatesExisting = existingIconPaths.has(iconPathKey(icon.path));
        return (
          <button
            key={icon.id}
            type="button"
            onClick={() => onToggleIcon(icon.id)}
            aria-pressed={selected}
            aria-label={`${selected ? "Deselect" : "Select"} ${icon.name} from ${icon.collection.name}`}
            className={`relative flex min-h-[132px] min-w-0 flex-col gap-2 rounded-md border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-figma-accent)] ${
              selected
                ? "border-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-bg-selected)]"
                : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <span
              className={`absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border ${
                selected
                  ? "border-[color:var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-[color:var(--color-figma-text-onbrand)]"
                  : "border-[color:var(--color-figma-border)] bg-[var(--color-figma-bg)] text-transparent"
              }`}
              aria-hidden
            >
              <Check size={12} strokeWidth={2.5} />
            </span>
            <span className="flex h-14 w-full items-center justify-center rounded border border-[var(--color-figma-border)] bg-white">
              <img
                src={icon.svgUrl}
                alt=""
                className="h-8 w-8 object-contain"
                draggable={false}
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body font-medium text-[color:var(--color-figma-text)]">
                {icon.name}
              </span>
              <span className="block truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
                {icon.collection.name}
              </span>
            </span>
            <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
              {icon.collection.license.name}
              {icon.collection.license.attributionRequired ? " / attribution" : ""}
            </span>
            {updatesExisting ? (
              <span className="text-secondary font-medium text-[color:var(--color-figma-text-warning)]">
                Updates existing
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PublicSelectionSummary({
  selectedIconCount,
  updateCount,
  licenseSummaries,
  selectedIcons,
  onClear,
}: {
  selectedIconCount: number;
  updateCount: number;
  licenseSummaries: PublicIconLicenseSummary[];
  selectedIcons: PublicIconSearchResult[];
  onClear: () => void;
}) {
  if (selectedIconCount === 0) return null;
  return (
    <div className="flex max-h-24 min-w-0 basis-full flex-col gap-1 overflow-auto rounded-md bg-[var(--surface-selected)] px-2 py-1.5 text-secondary">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="font-medium text-[color:var(--color-figma-text)]">
          {formatPublicIconSelection(selectedIconCount)}
          {updateCount > 0
            ? ` / ${updateCount} update${updateCount === 1 ? "" : "s"}`
            : ""}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      {licenseSummaries.map((summary) => (
        <div
          key={summary.key}
          className="min-w-0 truncate text-[color:var(--color-figma-text-secondary)]"
          title={`${summary.iconCount} icon${summary.iconCount === 1 ? "" : "s"} from ${summary.collectionName}: ${summary.licenseName}, ${attributionSummaryLabel(summary.attributionRequired)}`}
        >
          <span className="font-medium text-[color:var(--color-figma-text)]">
            {summary.iconCount} icon{summary.iconCount === 1 ? "" : "s"}
          </span>
          {" · "}
          {summary.collectionName}
          {" · "}
          <a
            href={summary.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[color:var(--color-figma-text-accent)] underline"
          >
            {summary.licenseName}
          </a>
          {" · "}
          {attributionSummaryLabel(summary.attributionRequired)}
        </div>
      ))}
      <div className="flex min-w-0 gap-x-3 gap-y-1 overflow-hidden">
        {selectedIcons.slice(0, 2).map((icon) => (
          <a
            key={icon.id}
            href={icon.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 max-w-full items-center gap-1 text-[color:var(--color-figma-text-accent)] underline"
          >
            <span className="truncate">{icon.name} source</span>
            <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
          </a>
        ))}
        {selectedIcons.length > 2 ? (
          <span className="shrink-0 text-[color:var(--color-figma-text-tertiary)]">
            {selectedIcons.length - 2} more source links stored on import.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function IconImportDialog({
  serverUrl,
  existingIconPaths,
  existingLinkedIconPaths,
  defaultIconSize,
  onClose,
  onImported,
}: IconImportDialogProps) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const workspacePathRef = useRef<HTMLInputElement>(null);
  const libraryRequestVersionRef = useRef(0);
  const libraryActiveRequestIdRef = useRef(0);
  const libraryAbortControllerRef = useRef<AbortController | null>(null);
  const catalogRequestVersionRef = useRef(0);
  const catalogActiveRequestIdRef = useRef(0);
  const catalogAbortControllerRef = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<ImportMode>("library");
  const [files, setFiles] = useState<File[]>([]);
  const [selectedPublicSourceId, setSelectedPublicSourceId] =
    useState<PublicIconSourceId>("lucide");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCollection, setLibraryCollection] = useState("lucide");
  const [libraryCategory, setLibraryCategory] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResults, setCatalogResults] =
    useState<PublicIconCollectionListResponse | null>(null);
  const [publicProviders, setPublicProviders] = useState<PublicIconProvider[]>(
    [],
  );
  const [publicProviderError, setPublicProviderError] = useState("");
  const [libraryResults, setLibraryResults] =
    useState<PublicIconResultsResponse | null>(null);
  const [selectedPublicIconIds, setSelectedPublicIconIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryLoadedOnce, setLibraryLoadedOnce] = useState(false);
  const [pastedSvg, setPastedSvg] = useState("");
  const [pastedPath, setPastedPath] = useState("");
  const [workspaceFilePath, setWorkspaceFilePath] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [selectionIcons, setSelectionIcons] = useState<
    EditableSelectionIcon[]
  >([]);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [name, setName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useFocusTrap(dialogRef, {
    initialFocusRef:
      mode === "paste"
        ? pasteTextareaRef
        : mode === "workspace"
          ? workspacePathRef
          : undefined,
  });

  useEffect(() => {
    return () => {
      libraryAbortControllerRef.current?.abort();
      catalogAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (mode !== "library" || publicProviders.length > 0) {
      return;
    }

    const controller = new AbortController();
    void apiFetch<PublicIconProvidersResponse>(
      `${serverUrl}/api/icons/public/providers`,
      { signal: createFetchSignal(controller.signal, 10_000) },
    )
      .then((response) => {
        setPublicProviders(response.providers);
        setPublicProviderError("");
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setPublicProviderError(
            getErrorMessage(err, "Failed to load public icon sources."),
          );
        }
      });

    return () => controller.abort();
  }, [mode, publicProviders.length, serverUrl]);

  const selectedFileSummary = useMemo(() => {
    if (files.length === 0) {
      return "No files selected";
    }
    if (files.length === 1) {
      return files[0].name;
    }
    return `${files.length} SVG files selected`;
  }, [files]);

  const selectionPathCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const icon of selectionIcons) {
      const key = iconPathKey(icon.path);
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [selectionIcons]);

  const selectionIssues = useMemo(() => {
    const issuesByNodeId = new Map<string, SelectionImportIssue[]>();
    for (const icon of selectionIcons) {
      const issues: SelectionImportIssue[] = [];
      const pathKey = iconPathKey(icon.path);
      const updatesExistingIcon = Boolean(pathKey && existingIconPaths.has(pathKey));
      const updatesLinkedIcon = Boolean(
        pathKey && existingLinkedIconPaths.has(pathKey),
      );
      if (!pathKey) {
        issues.push({ tone: "error", message: "Enter a valid icon path." });
      } else {
        if ((selectionPathCounts.get(pathKey) ?? 0) > 1) {
          issues.push({
            tone: "error",
            message: "This path is used more than once in the selection.",
          });
        }
        if (updatesExistingIcon) {
          issues.push({
            tone: "info",
            message: "Imports as an update to the existing managed icon.",
          });
        }
      }

      const expectedSize = defaultIconSize > 0 ? defaultIconSize : 24;
      if (icon.width !== icon.height) {
        issues.push({
          tone: "warning",
          message: "The selected layer is not square.",
        });
      }
      if (
        !iconFrameDimensionMatches(icon.viewBoxWidth, expectedSize) ||
        !iconFrameDimensionMatches(icon.viewBoxHeight, expectedSize)
      ) {
        issues.push({
          tone: "warning",
          message: `The SVG viewBox is ${formatIconFrame(icon.viewBoxWidth, icon.viewBoxHeight)}; the icon frame is ${formatIconFrame(expectedSize, expectedSize)}. Reframe the source if the icon should publish on the standard grid.`,
        });
      }
      if (
        !iconFrameDimensionMatches(icon.viewBoxMinX, 0) ||
        !iconFrameDimensionMatches(icon.viewBoxMinY, 0)
      ) {
        issues.push({
          tone: "warning",
          message: `The SVG viewBox starts at ${formatIconDimension(icon.viewBoxMinX)}, ${formatIconDimension(icon.viewBoxMinY)}. Move the artwork into a zero-origin frame if swaps should align predictably.`,
        });
      }

      for (const warning of icon.warnings) {
        issues.push({ tone: "warning", message: warning });
      }

      if (icon.componentId) {
        issues.push({
          tone: "info",
          message: updatesLinkedIcon
            ? "Keeps the existing managed component link."
            : "Adopts the selected component link.",
        });
      }
      issuesByNodeId.set(icon.nodeId, issues);
    }
    return issuesByNodeId;
  }, [
    defaultIconSize,
    existingIconPaths,
    existingLinkedIconPaths,
    selectionIcons,
    selectionPathCounts,
  ]);

  const selectionHasErrors = useMemo(
    () =>
      Array.from(selectionIssues.values()).some((issues) =>
        issues.some((issue) => issue.tone === "error"),
      ),
    [selectionIssues],
  );

  const selectedPublicIcons = useMemo(
    () =>
      (libraryResults?.icons ?? []).filter((icon) =>
        selectedPublicIconIds.has(icon.id),
      ),
    [libraryResults, selectedPublicIconIds],
  );

  const selectedPublicIconUpdateCount = useMemo(
    () =>
      selectedPublicIcons.filter((icon) =>
        existingIconPaths.has(iconPathKey(icon.path)),
      ).length,
    [existingIconPaths, selectedPublicIcons],
  );

  const selectedPublicIconLicenseSummaries = useMemo(
    () => summarizePublicIconLicenses(selectedPublicIcons),
    [selectedPublicIcons],
  );

  const selectedPublicSource = useMemo(
    () =>
      PUBLIC_ICON_SOURCES.find((source) => source.id === selectedPublicSourceId) ??
      null,
    [selectedPublicSourceId],
  );

  const activePublicProvider =
    publicProviders.find((provider) => provider.id === "iconify") ??
    libraryResults?.provider ??
    catalogResults?.provider ??
    null;

  const currentPublicCollection = isPublicIconCollectionBrowseResponse(libraryResults)
    ? libraryResults.collection
    : (libraryResults?.icons[0]?.collection ?? null);

  const publicCollectionCategories = isPublicIconCollectionBrowseResponse(libraryResults)
    ? libraryResults.categories
    : [];

  const libraryResultsQuery = libraryResults
    ? isPublicIconCollectionBrowseResponse(libraryResults)
      ? ""
      : libraryResults.query
    : "";
  const publicIconsCanLoadMore = Boolean(
    libraryResults &&
      libraryResults.icons.length < libraryResults.total &&
      libraryQuery.trim() === libraryResultsQuery,
  );
  const catalogCanLoadMore = Boolean(
    catalogResults &&
      catalogResults.collections.length < catalogResults.total &&
      catalogQuery.trim() === catalogResults.query,
  );

  const confirmDisabled =
    busy ||
    (mode === "files" && files.length === 0) ||
    (mode === "library" && selectedPublicIconIds.size === 0) ||
    (mode === "selection" &&
      (selectionIcons.length === 0 ||
        selectionHasErrors)) ||
    (mode === "paste" && (!pastedSvg.trim() || !pastedPath.trim())) ||
    (mode === "workspace" && !workspaceFilePath.trim());

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).filter((file) =>
      file.name.toLowerCase().endsWith(".svg"),
    );
    setFiles(selected);
    setError("");
  };

  const importBody = async (): Promise<Array<Record<string, unknown>>> => {
    const tags = parseTags(tagInput);
    const sharedFields = {
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(tags ? { tags } : {}),
    };

    if (mode === "files") {
      return Promise.all(
        files.map(async (file) => ({
          svg: await readSvgFile(file),
          path: browserFilePath(file),
          ...(files.length === 1 ? sharedFields : { ...(tags ? { tags } : {}) }),
        })),
      );
    }

    if (mode === "paste") {
      return [
        {
          svg: pastedSvg,
          path: pastedPath,
          ...sharedFields,
        },
      ];
    }

    if (mode === "selection") {
      return selectionIcons.map((icon) => ({
        svg: icon.svg,
        path: icon.path,
        nodeId: icon.nodeId,
        fileKey: icon.fileKey ?? null,
        pageId: icon.pageId,
        pageName: icon.pageName,
        componentId: icon.componentId ?? null,
        componentKey: icon.componentKey ?? null,
        ...(icon.displayName.trim() ? { name: icon.displayName.trim() } : {}),
        ...(tags ? { tags } : {}),
      }));
    }

    return [
      {
        filePath: workspaceFilePath,
        ...(workspacePath.trim()
          ? { path: workspacePath.trim() }
          : { path: pathFromWorkspaceFilePath(workspaceFilePath) }),
        ...sharedFields,
      },
    ];
  };

  const loadPublicCollection = useCallback(async (next?: {
    query?: string;
    collection?: string;
    category?: string;
    start?: number;
    append?: boolean;
  }) => {
    const query = (next?.query ?? libraryQuery).trim();
    const collection = (next?.collection ?? libraryCollection).trim();
    const category = next?.category ?? libraryCategory;
    const start = next?.start ?? 0;
    const append = next?.append ?? false;

    if (!collection || busy || (append && libraryLoading)) {
      return;
    }
    if (!append) {
      libraryRequestVersionRef.current += 1;
    }
    const requestVersion = libraryRequestVersionRef.current;
    const requestId = libraryActiveRequestIdRef.current + 1;
    const abortController = new AbortController();
    libraryActiveRequestIdRef.current = requestId;
    libraryAbortControllerRef.current?.abort();
    libraryAbortControllerRef.current = abortController;

    setLibraryLoadedOnce(true);
    setLibraryLoading(true);
    setError("");
    if (!append) {
      setLibraryResults(null);
      setSelectedPublicIconIds(new Set());
    }
    try {
      const params = new URLSearchParams({
        provider: activePublicProvider?.id ?? "iconify",
        limit: query ? "48" : "64",
        start: String(start),
      });
      if (query) {
        params.set("query", query);
        params.set("collection", collection);
      } else {
        params.set("collection", collection);
        if (category) {
          params.set("category", category);
        }
      }
      const path = query
        ? "/api/icons/public/search"
        : "/api/icons/public/collection";
      const result = await apiFetch<PublicIconResultsResponse>(
        `${serverUrl}${path}?${params.toString()}`,
        { signal: createFetchSignal(abortController.signal, 15_000) },
      );
      if (requestVersion !== libraryRequestVersionRef.current) {
        return;
      }
      setLibraryResults((current) =>
        append ? mergePublicIconResults(current, result) : result,
      );
      if (result.icons.length === 0) {
        setError(
          query
            ? "No public icons matched this search."
            : "No public icons were found in this collection.",
        );
      }
    } catch (err) {
      if (isAbortError(err) || requestVersion !== libraryRequestVersionRef.current) {
        return;
      }
      setError(getErrorMessage(err, "Failed to load public icons."));
    } finally {
      if (requestId === libraryActiveRequestIdRef.current) {
        setLibraryLoading(false);
        if (libraryAbortControllerRef.current === abortController) {
          libraryAbortControllerRef.current = null;
        }
      }
    }
  }, [
    activePublicProvider?.id,
    busy,
    libraryCategory,
    libraryCollection,
    libraryLoading,
    libraryQuery,
    serverUrl,
  ]);

  const loadPublicCatalog = useCallback(async (next?: {
    query?: string;
    start?: number;
    append?: boolean;
  }) => {
    const query = (next?.query ?? catalogQuery).trim();
    const start = next?.start ?? 0;
    const append = next?.append ?? false;
    if (busy || (append && catalogLoading)) {
      return;
    }
    if (!append) {
      catalogRequestVersionRef.current += 1;
    }
    const requestVersion = catalogRequestVersionRef.current;
    const requestId = catalogActiveRequestIdRef.current + 1;
    const abortController = new AbortController();
    catalogActiveRequestIdRef.current = requestId;
    catalogAbortControllerRef.current?.abort();
    catalogAbortControllerRef.current = abortController;
    setCatalogLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        provider: activePublicProvider?.id ?? "iconify",
        limit: "80",
        start: String(start),
      });
      if (query) {
        params.set("query", query);
      }
      const result = await apiFetch<PublicIconCollectionListResponse>(
        `${serverUrl}/api/icons/public/collections?${params.toString()}`,
        { signal: createFetchSignal(abortController.signal, 15_000) },
      );
      if (requestVersion !== catalogRequestVersionRef.current) {
        return;
      }
      setCatalogResults((current) =>
        append ? mergePublicCollectionResults(current, result) : result,
      );
      if (result.collections.length === 0) {
        setError("No public icon libraries matched this search.");
      }
    } catch (err) {
      if (isAbortError(err) || requestVersion !== catalogRequestVersionRef.current) {
        return;
      }
      setError(getErrorMessage(err, "Failed to load public icon libraries."));
    } finally {
      if (requestId === catalogActiveRequestIdRef.current) {
        setCatalogLoading(false);
        if (catalogAbortControllerRef.current === abortController) {
          catalogAbortControllerRef.current = null;
        }
      }
    }
  }, [
    activePublicProvider?.id,
    busy,
    catalogLoading,
    catalogQuery,
    serverUrl,
  ]);

  useEffect(() => {
    if (mode !== "library" || libraryLoadedOnce || libraryLoading) {
      return;
    }
    void loadPublicCollection({ collection: "lucide", query: "", category: "" });
  }, [libraryLoadedOnce, libraryLoading, loadPublicCollection, mode]);

  const handleLibrarySearchKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    setLibraryCategory("");
    void loadPublicCollection({ query: libraryQuery, category: "" });
  };

  const handleLibraryQueryChange = (value: string) => {
    const wasSearching = Boolean(libraryQuery.trim());
    libraryRequestVersionRef.current += 1;
    libraryAbortControllerRef.current?.abort();
    setLibraryQuery(value);
    setSelectedPublicIconIds(new Set());
    setError("");
    if (wasSearching && !value.trim()) {
      void loadPublicCollection({ query: "", category: libraryCategory });
    }
  };

  const clearLibraryQuery = () => {
    libraryRequestVersionRef.current += 1;
    libraryAbortControllerRef.current?.abort();
    setLibraryQuery("");
    void loadPublicCollection({ query: "", category: libraryCategory });
  };

  const handleLibraryCollectionChange = (value: string) => {
    libraryRequestVersionRef.current += 1;
    libraryAbortControllerRef.current?.abort();
    setSelectedPublicSourceId("custom");
    setLibraryCollection(value);
    setLibraryCategory("");
    setLibraryQuery("");
    setSelectedPublicIconIds(new Set());
    setError("");
  };

  const handleCatalogQueryChange = (value: string) => {
    catalogRequestVersionRef.current += 1;
    catalogAbortControllerRef.current?.abort();
    setCatalogQuery(value);
    setError("");
  };

  const handlePublicSourceSelect = (source: (typeof PUBLIC_ICON_SOURCES)[number]) => {
    setSelectedPublicSourceId(source.id);
    setLibraryCollection(source.collection);
    setLibraryQuery("");
    setLibraryCategory("");
    setError("");
    void loadPublicCollection({
      query: "",
      collection: source.collection,
      category: "",
    });
  };

  const handleOpenPublicCatalog = () => {
    setSelectedPublicSourceId("all");
    setLibraryQuery("");
    setLibraryCategory("");
    if (!catalogResults) {
      void loadPublicCatalog({ query: "" });
    }
  };

  const handlePublicCatalogCollectionSelect = (
    collection: PublicIconCollection,
  ) => {
    setSelectedPublicSourceId("custom");
    setLibraryCollection(collection.id);
    setLibraryQuery("");
    setLibraryCategory("");
    setError("");
    void loadPublicCollection({
      query: "",
      collection: collection.id,
      category: "",
    });
  };

  const handlePublicCategorySelect = (category: string) => {
    setLibraryCategory(category);
    setLibraryQuery("");
    void loadPublicCollection({ query: "", category });
  };

  const handleCustomCollectionBrowse = () => {
    const collection = libraryCollection.trim();
    if (!collection) {
      return;
    }
    setSelectedPublicSourceId("custom");
    setLibraryCategory("");
    setLibraryQuery("");
    void loadPublicCollection({ query: "", collection, category: "" });
  };

  const handleLoadMorePublicIcons = () => {
    if (!libraryResults) {
      return;
    }
    void loadPublicCollection({
      query: libraryQuery,
      collection: libraryCollection,
      category: libraryCategory,
      start: libraryResults.start + libraryResults.icons.length,
      append: true,
    });
  };

  const handleLoadMorePublicCatalog = () => {
    if (!catalogResults) {
      return;
    }
    void loadPublicCatalog({
      query: catalogQuery,
      start: catalogResults.start + catalogResults.collections.length,
      append: true,
    });
  };

  const clearPublicIconSelection = () => {
    setSelectedPublicIconIds(new Set());
  };

  const togglePublicIcon = (iconId: string) => {
    setSelectedPublicIconIds((current) => {
      const next = new Set(current);
      if (next.has(iconId)) {
        next.delete(iconId);
      } else {
        next.add(iconId);
      }
      return next;
    });
  };

  const handleReadSelection = async () => {
    if (selectionLoading || busy) {
      return;
    }

    setSelectionLoading(true);
    setError("");
    try {
      const result = await readIconSelectionFromFigma();
      if (result.error) {
        throw new Error(result.error);
      }
      setSelectionIcons(editableSelectionIcons(result.icons));
      if (result.icons.length === 0) {
        setError("Select one or more Figma layers to import as icons.");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to read selected icons."));
    } finally {
      setSelectionLoading(false);
    }
  };

  const updateSelectionIcon = (
    nodeId: string,
    patch: Partial<Pick<EditableSelectionIcon, "path" | "displayName">>,
  ) => {
    setSelectionIcons((current) =>
      current.map((icon) =>
        icon.nodeId === nodeId ? { ...icon, ...patch } : icon,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmDisabled) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (mode === "library") {
        const tags = parseTags(tagInput);
        const result = await apiFetch<IconImportBatchResponse>(
          `${serverUrl}/api/icons/import/public`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: createFetchSignal(undefined, 90_000),
            body: JSON.stringify({
              icons: selectedPublicIcons.map((icon) => ({
                id: icon.id,
                path: icon.path,
                name: icon.name,
              })),
              ...(tags ? { tags } : {}),
            }),
          },
        );
        onImported(result.registry, result.icons);
      } else {
        const bodies = await importBody();
        if (mode === "selection") {
          const result = await apiFetch<IconImportBatchResponse>(
            `${serverUrl}/api/icons/import/figma`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ icons: bodies }),
            },
          );
          onImported(result.registry, result.icons);
        } else if (bodies.length === 1) {
          const result = await apiFetch<IconImportResponse>(
            `${serverUrl}/api/icons/import/svg`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bodies[0]),
            },
          );
          onImported(result.registry, [result.icon]);
        } else {
          const result = await apiFetch<IconImportBatchResponse>(
            `${serverUrl}/api/icons/import/svgs`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ icons: bodies }),
            },
          );
          onImported(result.registry, result.icons);
        }
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to import icon."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="tm-modal-shell"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        ref={dialogRef}
        className={`tm-modal-panel ${
          mode === "library" ? "tm-modal-panel--wide" : "tm-modal-panel--dialog"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="icon-import-title"
        onSubmit={handleSubmit}
      >
        <div className="tm-modal-header">
          <h3
            id="icon-import-title"
            className="text-heading font-semibold text-[color:var(--color-figma-text)]"
          >
            Import icons
          </h3>
        </div>

        <div className="tm-modal-body">
          <SegmentedControl
            value={mode}
            options={IMPORT_MODES}
            onChange={(nextMode) => {
              setMode(nextMode);
              setError("");
            }}
            ariaLabel="Icon import source"
            size="compact"
          />

          {mode === "library" ? (
            <div className="flex min-w-0 flex-col gap-3">
              {publicProviderError ? (
                <p
                  role="alert"
                  className="m-0 text-secondary text-[color:var(--color-figma-text-error)]"
                >
                  {publicProviderError}
                </p>
              ) : null}

              <PublicLibraryRail
                selectedPublicSourceId={selectedPublicSourceId}
                disabled={busy || libraryLoading || catalogLoading}
                onSelectSource={handlePublicSourceSelect}
                onOpenCatalog={handleOpenPublicCatalog}
              />

              {selectedPublicSourceId === "all" ? (
                <PublicCollectionCatalog
                  query={catalogQuery}
                  onQueryChange={handleCatalogQueryChange}
                  onSearch={() => void loadPublicCatalog()}
                  onLoadMore={handleLoadMorePublicCatalog}
                  canLoadMore={catalogCanLoadMore}
                  loading={catalogLoading}
                  response={catalogResults}
                  selectedCollectionId={libraryCollection}
                  onSelectCollection={handlePublicCatalogCollectionSelect}
                />
              ) : null}

              {selectedPublicSourceId === "all" ||
              selectedPublicSourceId === "custom" ? (
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Field
                    label="Iconify prefix"
                    help="Open a known collection directly, such as ph, mdi, or carbon."
                  >
                    <TextInput
                      value={libraryCollection}
                      onChange={(event) =>
                        handleLibraryCollectionChange(event.target.value)
                      }
                      onKeyDown={handleLibrarySearchKeyDown}
                      placeholder="ph"
                      size="sm"
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCustomCollectionBrowse}
                    disabled={busy || libraryLoading || !libraryCollection.trim()}
                    className="mt-[18px] self-start bg-[var(--color-figma-bg-secondary)]"
                  >
                    Browse
                  </Button>
                </div>
              ) : null}

              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Field
                  label="Search in collection"
                  help={
                    selectedPublicSource
                      ? `${selectedPublicSource.label} via Iconify`
                      : currentPublicCollection
                        ? `${currentPublicCollection.name} via Iconify`
                        : activePublicProvider?.description ??
                          "Search within the selected public library."
                  }
                >
                  <SearchField
                    value={libraryQuery}
                    onChange={(event) =>
                      handleLibraryQueryChange(event.target.value)
                    }
                    onClear={clearLibraryQuery}
                    onKeyDown={handleLibrarySearchKeyDown}
                    placeholder="home, arrow, menu"
                    size="sm"
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setLibraryCategory("");
                    void loadPublicCollection({
                      query: libraryQuery,
                      category: "",
                    });
                  }}
                  disabled={busy || libraryLoading || !libraryQuery.trim()}
                  className="mt-[18px] self-start bg-[var(--color-figma-bg-secondary)]"
                >
                  <Search size={13} strokeWidth={1.5} aria-hidden />
                  {libraryLoading && libraryQuery.trim() ? "Searching" : "Search"}
                </Button>
              </div>

              {libraryLoading && !libraryResults ? (
                <div className="flex min-h-40 items-center justify-center rounded-md bg-[var(--color-figma-bg-secondary)] text-secondary text-[color:var(--color-figma-text-secondary)]">
                  Loading public icons...
                </div>
              ) : libraryResults ? (
                <div className="flex min-w-0 flex-col gap-2">
                  <PublicCollectionHeader
                    collection={currentPublicCollection}
                    resultSummary={publicResultSummary(libraryResults)}
                  />
                  <PublicCategoryFilter
                    categories={publicCollectionCategories}
                    selectedCategory={libraryCategory}
                    disabled={busy || libraryLoading}
                    onSelectCategory={handlePublicCategorySelect}
                  />
                  <PublicIconGrid
                    icons={libraryResults.icons}
                    selectedIconIds={selectedPublicIconIds}
                    existingIconPaths={existingIconPaths}
                    onToggleIcon={togglePublicIcon}
                  />
                  {publicIconsCanLoadMore ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleLoadMorePublicIcons}
                      disabled={busy || libraryLoading}
                      className="self-start bg-[var(--color-figma-bg-secondary)]"
                    >
                      {libraryLoading ? "Loading" : "More icons"}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                  Choose a library to browse. Icons without license metadata are hidden.
                </p>
              )}
            </div>
          ) : null}

          {mode === "files" ? (
            <div className="flex min-w-0 flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded border border-dashed border-[var(--color-figma-border)] px-3 py-4 text-center text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:border-[color:var(--color-figma-text-tertiary)] hover:bg-[var(--surface-hover)]"
              >
                <FileUp size={18} strokeWidth={1.5} aria-hidden />
                <span>{selectedFileSummary}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                multiple
                className="sr-only"
                onChange={handleFilesChange}
              />
            </div>
          ) : null}

          {mode === "selection" ? (
            <div className="flex min-w-0 flex-col gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleReadSelection()}
                disabled={busy || selectionLoading}
                className="self-start bg-[var(--color-figma-bg-secondary)]"
              >
                <MousePointer2 size={13} strokeWidth={1.5} aria-hidden />
                {selectionLoading ? "Reading selection" : "Read selection"}
              </Button>

              {selectionIcons.length > 0 ? (
                <div className="flex max-h-72 min-w-0 flex-col gap-2 overflow-auto">
                  {selectionIcons.map((icon) => (
                    <div
                      key={icon.nodeId}
                      className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2"
                    >
                      <div className="row-span-2 flex h-10 w-10 items-center justify-center rounded bg-[var(--color-figma-bg)]">
                        <img
                          src={svgDataUrl(icon.svg)}
                          alt=""
                          className="h-7 w-7 object-contain"
                          draggable={false}
                        />
                      </div>
                      <div className="col-span-2 min-w-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                        <span className="block truncate font-medium text-[color:var(--color-figma-text)]">
                          {icon.nodeName}
                        </span>
                        <span className="block truncate">
                          {icon.nodeType.toLowerCase()} - layer {formatIconFrame(icon.width, icon.height)} - viewBox {icon.viewBox}
                        </span>
                      </div>
                      <Field label="Icon path">
                        <TextInput
                          value={icon.path}
                          onChange={(event) =>
                            updateSelectionIcon(icon.nodeId, {
                              path: event.target.value,
                            })
                          }
                          placeholder="navigation.home"
                          size="sm"
                        />
                      </Field>
                      <Field label="Display name">
                        <TextInput
                          value={icon.displayName}
                          onChange={(event) =>
                            updateSelectionIcon(icon.nodeId, {
                              displayName: event.target.value,
                            })
                          }
                          placeholder="Home"
                          size="sm"
                        />
                      </Field>
                      {(selectionIssues.get(icon.nodeId) ?? []).length > 0 ? (
                        <div className="col-span-3 flex min-w-0 flex-col gap-1">
                          {(selectionIssues.get(icon.nodeId) ?? []).map((issue) => (
                            <p
                              key={`${issue.tone}:${issue.message}`}
                              className={`m-0 text-secondary ${
                                issue.tone === "error"
                                  ? "text-[color:var(--color-figma-text-error)]"
                                  : issue.tone === "warning"
                                    ? "text-[color:var(--color-figma-text-warning)]"
                                    : "text-[color:var(--color-figma-text-secondary)]"
                              }`}
                            >
                              {issue.message}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                  Select Figma components, instances, frames, or vectors, then read the selection before importing.
                </p>
              )}
            </div>
          ) : null}

          {mode === "paste" ? (
            <>
              <Field label="Icon path">
                <TextInput
                  value={pastedPath}
                  onChange={(event) => setPastedPath(event.target.value)}
                  placeholder="navigation.home"
                  size="sm"
                />
              </Field>
              <Field label="SVG">
                <textarea
                  ref={pasteTextareaRef}
                  value={pastedSvg}
                  onChange={(event) => setPastedSvg(event.target.value)}
                  placeholder="<svg viewBox=&quot;0 0 24 24&quot;>...</svg>"
                  rows={8}
                  className={`w-full resize-y px-2 py-1.5 font-mono text-[11px] leading-[1.45] ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DISABLED_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES}`}
                />
              </Field>
            </>
          ) : null}

          {mode === "workspace" ? (
            <>
              <Field
                label="SVG file path"
                help="Relative to the token workspace."
              >
                <TextInput
                  ref={workspacePathRef}
                  value={workspaceFilePath}
                  onChange={(event) => setWorkspaceFilePath(event.target.value)}
                  placeholder="icons/navigation/home.svg"
                  size="sm"
                />
              </Field>
              <Field
                label="Icon path"
                help="Optional. Defaults from the file path."
              >
                <TextInput
                  value={workspacePath}
                  onChange={(event) => setWorkspacePath(event.target.value)}
                  placeholder="navigation.home"
                  size="sm"
                />
              </Field>
            </>
          ) : null}

          {mode !== "selection" && mode !== "library" ? (
            <Field label="Display name" help="Optional. Best for single-icon imports.">
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Home"
                size="sm"
              />
            </Field>
          ) : null}

          <Field label="Tags" help="Optional comma-separated tags.">
            <TextInput
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="navigation, interface"
              size="sm"
            />
          </Field>

          {error ? (
            <p
              role="alert"
              className="m-0 text-secondary text-[color:var(--color-figma-text-error)]"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="tm-modal-footer tm-modal-footer--confirm">
          {mode === "library" ? (
            <PublicSelectionSummary
              selectedIconCount={selectedPublicIconIds.size}
              updateCount={selectedPublicIconUpdateCount}
              licenseSummaries={selectedPublicIconLicenseSummaries}
              selectedIcons={selectedPublicIcons}
              onClear={clearPublicIconSelection}
            />
          ) : null}
          <Button
            type="button"
            onClick={onClose}
            disabled={busy}
            variant="secondary"
            className="bg-[var(--color-figma-bg-secondary)]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={confirmDisabled}
            variant="primary"
            data-modal-primary="true"
          >
            {mode === "library"
              ? publicIconImportLabel(selectedPublicIconIds.size, busy)
              : busy
                ? "Importing..."
                : "Import"}
          </Button>
        </div>
      </form>
    </div>
  );
}
