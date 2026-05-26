import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import {
  PUBLIC_ICON_LIMITS,
  type IconRegistryFile,
  type ManagedIcon,
  type PublicIconCollection,
  type PublicIconCollectionCategory,
  type PublicIconCollectionListResponse,
  type PublicIconSearchResult,
} from "@token-workshop/core";
import type {
  IconSelectionImportItem,
  ReadIconSelectionMessage,
  IconSelectionReadMessage,
} from "../../../shared/types";
import {
  Check,
  Code2,
  ExternalLink,
  FileUp,
  FolderOpen,
  Library,
  MousePointer2,
  Search,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, Field, SearchField, TextInput } from "../../primitives";
import {
  CONTROL_INPUT_BASE_CLASSES,
  CONTROL_INPUT_DEFAULT_STATE_CLASSES,
  CONTROL_INPUT_DISABLED_CLASSES,
} from "../../shared/controlClasses";
import { apiFetch, createFetchSignal } from "../../shared/apiFetch";
import { getErrorMessage } from "../../shared/utils";
import { requestPluginMessage } from "../../shared/pluginMessaging";
import {
  displayNameFromIconPath,
  formatIconDimension,
  formatIconFrame,
  iconFrameDimensionMatches,
  iconPathKey,
  svgDataUrl,
} from "./iconUiUtils";
import {
  attributionSummaryLabel,
  formatPublicIconSelection,
  PUBLIC_ICON_SOURCES,
  publicIconImportLabel,
  publicIconPreviewUrl,
  publicResultSummary,
  summarizePublicIconLicenses,
  type PublicIconLicenseSummary,
  type PublicIconSourceId,
} from "./publicIconImportUtils";
import { usePublicIconLibrary } from "./usePublicIconLibrary";

type ImportMode = "library" | "selection" | "svg" | "workspace";
type SvgImportMethod = "files" | "paste";
type PreparedImportMode = "files" | "paste" | "selection" | "workspace";

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

interface EditableSelectionIcon extends IconSelectionImportItem {
  path: string;
  displayName: string;
}

type SelectionImportIssue = {
  tone: "error" | "warning" | "info";
  message: string;
};

interface IconImportPanelProps {
  serverUrl: string;
  existingIconPaths: Set<string>;
  existingLinkedIconPaths: Set<string>;
  defaultIconSize: number;
  cancelable?: boolean;
  onCancel: () => void;
  onImported: (registry: IconRegistryFile, icons: ManagedIcon[]) => void;
}

const IMPORT_MODES: Array<{
  value: ImportMode;
  label: string;
  Icon: LucideIcon;
}> = [
  {
    value: "selection",
    label: "Selection",
    Icon: MousePointer2,
  },
  {
    value: "svg",
    label: "SVG",
    Icon: FileUp,
  },
  {
    value: "library",
    label: "Public",
    Icon: Library,
  },
  {
    value: "workspace",
    label: "Workspace",
    Icon: FolderOpen,
  },
];

const SVG_IMPORT_METHODS: Array<{
  value: SvgImportMethod;
  label: string;
  Icon: LucideIcon;
}> = [
  { value: "files", label: "Files", Icon: FileUp },
  { value: "paste", label: "Paste", Icon: Code2 },
];

const ICON_IMPORT_TIMEOUT_MS = 90_000;
const IMPORT_DIALOG_SECTION_CLASSES =
  "flex min-w-0 flex-col gap-2";

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

function mergeEditableSelectionIcons(
  previous: EditableSelectionIcon[],
  next: EditableSelectionIcon[],
): EditableSelectionIcon[] {
  const previousByNodeId = new Map(previous.map((icon) => [icon.nodeId, icon]));
  return next.map((icon) => {
    const existing = previousByNodeId.get(icon.nodeId);
    return existing
      ? { ...icon, path: existing.path, displayName: existing.displayName }
      : icon;
  });
}

function normalizePathDraft(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\s+/g, "-")
    .replace(/[/.]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function prefixedIconPath(prefix: string, path: string): string {
  const cleanPrefix = normalizePathDraft(prefix);
  const cleanPath = normalizePathDraft(path);
  if (!cleanPrefix || !cleanPath || cleanPath === cleanPrefix) {
    return cleanPath || cleanPrefix;
  }
  return cleanPath.startsWith(`${cleanPrefix}.`)
    ? cleanPath
    : `${cleanPrefix}.${cleanPath}`;
}

function countSelectionPaths(
  icons: EditableSelectionIcon[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const icon of icons) {
    const key = iconPathKey(icon.path);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function selectionImportIssuesForIcon({
  defaultIconSize,
  existingIconPaths,
  existingLinkedIconPaths,
  icon,
  pathCounts,
}: {
  defaultIconSize: number;
  existingIconPaths: Set<string>;
  existingLinkedIconPaths: Set<string>;
  icon: EditableSelectionIcon;
  pathCounts: Map<string, number>;
}): SelectionImportIssue[] {
  const issues: SelectionImportIssue[] = [];
  const pathKey = iconPathKey(icon.path);
  const updatesExistingIcon = Boolean(pathKey && existingIconPaths.has(pathKey));
  const updatesLinkedIcon = Boolean(
    pathKey && existingLinkedIconPaths.has(pathKey),
  );

  if (!pathKey) {
    issues.push({ tone: "error", message: "Enter a valid icon path." });
  } else {
    if ((pathCounts.get(pathKey) ?? 0) > 1) {
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

  return issues;
}

function selectionImportIssues({
  defaultIconSize,
  existingIconPaths,
  existingLinkedIconPaths,
  icons,
  pathCounts,
}: {
  defaultIconSize: number;
  existingIconPaths: Set<string>;
  existingLinkedIconPaths: Set<string>;
  icons: EditableSelectionIcon[];
  pathCounts: Map<string, number>;
}): Map<string, SelectionImportIssue[]> {
  const issuesByNodeId = new Map<string, SelectionImportIssue[]>();
  for (const icon of icons) {
    issuesByNodeId.set(
      icon.nodeId,
      selectionImportIssuesForIcon({
        defaultIconSize,
        existingIconPaths,
        existingLinkedIconPaths,
        icon,
        pathCounts,
      }),
    );
  }
  return issuesByNodeId;
}

function selectionImportHasErrors(
  issuesByNodeId: Map<string, SelectionImportIssue[]>,
): boolean {
  for (const issues of issuesByNodeId.values()) {
    if (issues.some((issue) => issue.tone === "error")) {
      return true;
    }
  }
  return false;
}

function ImportModePicker({
  value,
  disabled,
  onChange,
}: {
  value: ImportMode;
  disabled: boolean;
  onChange: (mode: ImportMode) => void;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap gap-1 pb-0.5"
      role="radiogroup"
      aria-label="Icon import source"
    >
      {IMPORT_MODES.map((mode) => {
        const selected = value === mode.value;
        const ModeIcon = mode.Icon;
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(mode.value)}
            className={`flex min-h-7 shrink-0 items-center gap-1.5 rounded px-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-figma-accent)] ${
              selected
                ? "bg-[var(--surface-selected)] shadow-[inset_0_0_0_1px_var(--color-figma-accent)]"
                : disabled
                  ? "cursor-not-allowed opacity-55"
                  : "hover:bg-[var(--surface-hover)]"
            }`}
          >
            <ModeIcon
              size={14}
              strokeWidth={1.6}
              className="shrink-0 text-[color:var(--color-figma-text-secondary)]"
              aria-hidden
            />
            <span className="text-secondary font-medium text-[color:var(--color-figma-text)]">
              {mode.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SvgMethodPicker({
  value,
  disabled,
  onChange,
}: {
  value: SvgImportMethod;
  disabled: boolean;
  onChange: (method: SvgImportMethod) => void;
}) {
  return (
    <div
      className="flex min-w-0 gap-1"
      role="radiogroup"
      aria-label="SVG input method"
    >
      {SVG_IMPORT_METHODS.map((method) => {
        const selected = value === method.value;
        const MethodIcon = method.Icon;
        return (
          <button
            key={method.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(method.value)}
            className={`flex min-h-7 items-center gap-1.5 rounded px-2 text-secondary font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-figma-accent)] ${
              selected
                ? "bg-[var(--surface-selected)] text-[color:var(--color-figma-text)] shadow-[inset_0_0_0_1px_var(--color-figma-accent)]"
                : disabled
                  ? "cursor-not-allowed opacity-55"
                  : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)]"
            }`}
          >
            <MethodIcon size={13} strokeWidth={1.6} aria-hidden />
            {method.label}
          </button>
        );
      })}
    </div>
  );
}

function PublicLibraryRail({
  selectedPublicSourceId,
  disabled,
  onSelectSource,
  onOpenCatalog,
  onSelectCustom,
}: {
  selectedPublicSourceId: PublicIconSourceId;
  disabled: boolean;
  onSelectSource: (source: (typeof PUBLIC_ICON_SOURCES)[number]) => void;
  onOpenCatalog: () => void;
  onSelectCustom: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div>
        <div className="text-body font-semibold text-[color:var(--color-figma-text)]">
          Source
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-1 min-[640px]:grid-cols-1">
        {PUBLIC_ICON_SOURCES.map((source) => (
          <Button
            key={source.id}
            type="button"
            variant={selectedPublicSourceId === source.id ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={selectedPublicSourceId === source.id}
            onClick={() => onSelectSource(source)}
            disabled={disabled}
            className="justify-start"
          >
            {source.label}
          </Button>
        ))}
        <Button
          type="button"
          variant={selectedPublicSourceId === "all" ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={selectedPublicSourceId === "all"}
          onClick={onOpenCatalog}
          disabled={disabled}
          className="justify-start"
        >
          All libraries
        </Button>
        <Button
          type="button"
          variant={selectedPublicSourceId === "custom" ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={selectedPublicSourceId === "custom"}
          onClick={onSelectCustom}
          disabled={disabled}
          className="justify-start"
        >
          Iconify prefix
        </Button>
      </div>
    </div>
  );
}

function PublicCollectionCatalog({
  query,
  disabled,
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
  disabled: boolean;
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
    <div className={IMPORT_DIALOG_SECTION_CLASSES}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <SearchField
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onClear={() => onQueryChange("")}
          onKeyDown={(event) => {
            if (!disabled && event.key === "Enter") {
              event.preventDefault();
              onSearch();
            }
          }}
          placeholder="Search libraries"
          size="sm"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onSearch}
          disabled={disabled || loading}
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
                disabled={disabled}
                className={`flex min-w-0 items-center justify-between gap-3 rounded px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-figma-accent)] ${
                  collection.id === selectedCollectionId
                    ? "bg-[var(--surface-selected)] text-[color:var(--color-figma-text)]"
                    : disabled
                      ? "cursor-not-allowed opacity-55"
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
              disabled={disabled || loading}
              className="self-start bg-[var(--color-figma-bg)]"
            >
              {loading ? "Loading" : "More libraries"}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          Search Iconify libraries by name or prefix.
        </div>
      )}
    </div>
  );
}

function PublicCategoryFilter({
  categories,
  selectedCategory,
  disabled,
  onSelectCategory,
}: {
  categories: PublicIconCollectionCategory[];
  selectedCategory: string;
  disabled: boolean;
  onSelectCategory: (category: string) => void;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="flex min-w-0 gap-1 overflow-x-auto pb-1">
      <Button
        type="button"
        variant={!selectedCategory ? "secondary" : "ghost"}
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
          variant={selectedCategory === category.name ? "secondary" : "ghost"}
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
  serverUrl,
  selectedIconIds,
  disabled,
  selectionLimitReached,
  existingIconPaths,
  onToggleIcon,
}: {
  icons: PublicIconSearchResult[];
  serverUrl: string;
  selectedIconIds: Set<string>;
  disabled: boolean;
  selectionLimitReached: boolean;
  existingIconPaths: Set<string>;
  onToggleIcon: (iconId: string) => void;
}) {
  return (
    <div className="grid max-h-[46vh] min-w-0 grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2 gap-y-3 overflow-auto pr-1">
      {icons.map((icon) => {
        const selected = selectedIconIds.has(icon.id);
        const updatesExisting = existingIconPaths.has(iconPathKey(icon.path));
        const iconDisabled = disabled || (!selected && selectionLimitReached);
        return (
          <button
            key={icon.id}
            type="button"
            onClick={() => onToggleIcon(icon.id)}
            aria-pressed={selected}
            disabled={iconDisabled}
            aria-label={`${selected ? "Deselect" : "Select"} ${icon.name} from ${icon.collection.name}`}
            className={`relative flex min-h-[110px] min-w-0 flex-col items-center gap-1.5 rounded-md p-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--color-figma-accent)] ${
              selected
                ? "bg-[var(--color-figma-bg-selected)] shadow-[inset_0_0_0_1px_var(--color-figma-accent)]"
                : iconDisabled
                  ? "cursor-not-allowed opacity-45"
                  : "hover:bg-[var(--surface-hover)]"
            }`}
            title={`${icon.name} · ${icon.collection.name} · ${icon.collection.license.name}`}
          >
            <span
              className={`absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full border ${
                selected
                  ? "border-[color:var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-[color:var(--color-figma-text-onbrand)]"
                  : "border-[color:var(--color-figma-border)] bg-white text-transparent"
              }`}
              aria-hidden
            >
              <Check size={10} strokeWidth={2.5} />
            </span>
            {updatesExisting ? (
              <span
                className="absolute left-1.5 top-1.5 size-1.5 rounded-full bg-[var(--color-figma-warning)]"
                title="Updates existing icon"
                aria-label="Updates existing icon"
              />
            ) : null}
            <span className="flex h-12 w-full items-center justify-center rounded bg-white">
              <img
                src={publicIconPreviewUrl(serverUrl, icon)}
                alt=""
                className="h-8 w-8 object-contain"
                draggable={false}
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-secondary font-medium text-[color:var(--color-figma-text)]">
                {icon.name}
              </span>
              <span className="block truncate text-[11px] leading-tight text-[color:var(--color-figma-text-secondary)]">
                {icon.collection.name} · {icon.collection.license.name}
              </span>
            </span>
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
  disabled,
  onClear,
}: {
  selectedIconCount: number;
  updateCount: number;
  licenseSummaries: PublicIconLicenseSummary[];
  selectedIcons: PublicIconSearchResult[];
  disabled: boolean;
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={disabled}
        >
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
          {disabled ? (
            <span>{summary.licenseName}</span>
          ) : (
            <a
              href={summary.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--color-figma-text-accent)] underline"
            >
              {summary.licenseName}
            </a>
          )}
          {" · "}
          {attributionSummaryLabel(summary.attributionRequired)}
        </div>
      ))}
      <div className="flex min-w-0 gap-x-3 gap-y-1 overflow-hidden">
        {selectedIcons.slice(0, 2).map((icon) => (
          disabled ? (
            <span
              key={icon.id}
              className="inline-flex min-w-0 max-w-full items-center gap-1 text-[color:var(--color-figma-text-secondary)]"
            >
              <span className="truncate">{icon.name} source</span>
            </span>
          ) : (
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
          )
        ))}
      </div>
    </div>
  );
}

export function IconImportPanel({
  serverUrl,
  existingIconPaths,
  existingLinkedIconPaths,
  defaultIconSize,
  cancelable = true,
  onCancel,
  onImported,
}: IconImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filePickerButtonRef = useRef<HTMLButtonElement>(null);
  const librarySearchRef = useRef<HTMLInputElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const readSelectionButtonRef = useRef<HTMLButtonElement>(null);
  const workspacePathRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("selection");
  const [svgMethod, setSvgMethod] = useState<SvgImportMethod>("files");
  const [files, setFiles] = useState<File[]>([]);
  const [pastedSvg, setPastedSvg] = useState("");
  const [pastedPath, setPastedPath] = useState("");
  const [workspaceFilePath, setWorkspaceFilePath] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [selectionPathPrefix, setSelectionPathPrefix] = useState("");
  const [selectionIcons, setSelectionIcons] = useState<
    EditableSelectionIcon[]
  >([]);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [name, setName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [showMetadataFields, setShowMetadataFields] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const publicLibrary = usePublicIconLibrary({
    serverUrl,
    enabled: mode === "library",
    busy,
  });

  const selectedFileSummary = useMemo(() => {
    if (files.length === 0) {
      return "Choose SVG files";
    }
    if (files.length === 1) {
      return files[0].name;
    }
    return `${files.length} SVG files selected`;
  }, [files]);

  const selectionPathCounts = useMemo(
    () => countSelectionPaths(selectionIcons),
    [selectionIcons],
  );

  const selectionIssues = useMemo(() => {
    return selectionImportIssues({
      defaultIconSize,
      existingIconPaths,
      existingLinkedIconPaths,
      icons: selectionIcons,
      pathCounts: selectionPathCounts,
    });
  }, [
    defaultIconSize,
    existingIconPaths,
    existingLinkedIconPaths,
    selectionIcons,
    selectionPathCounts,
  ]);

  const selectionHasErrors = useMemo(
    () => selectionImportHasErrors(selectionIssues),
    [selectionIssues],
  );

  const selectedPublicIconUpdateCount = useMemo(
    () =>
      publicLibrary.selectedIcons.filter((icon) =>
        existingIconPaths.has(iconPathKey(icon.path)),
      ).length,
    [existingIconPaths, publicLibrary.selectedIcons],
  );

  const selectedPublicIconLicenseSummaries = useMemo(
    () => summarizePublicIconLicenses(publicLibrary.selectedIcons),
    [publicLibrary.selectedIcons],
  );
  const selectedPublicIconCount = publicLibrary.selectedIconCount;

  const noFilesSelected =
    mode === "svg" && svgMethod === "files" && files.length === 0;
  const invalidPublicIconSelection =
    mode === "library" &&
    (selectedPublicIconCount === 0 ||
      selectedPublicIconCount > PUBLIC_ICON_LIMITS.importMax);
  const invalidSelectionImport =
    mode === "selection" && (selectionIcons.length === 0 || selectionHasErrors);
  const invalidPastedSvg =
    mode === "svg" &&
    svgMethod === "paste" &&
    (!pastedSvg.trim() || !pastedPath.trim());
  const missingWorkspaceFile =
    mode === "workspace" && !workspaceFilePath.trim();
  const showDisplayNameField =
    mode === "workspace" ||
    (mode === "svg" && (svgMethod === "paste" || files.length === 1));
  const confirmDisabled =
    busy ||
    noFilesSelected ||
    invalidPublicIconSelection ||
    invalidSelectionImport ||
    invalidPastedSvg ||
    missingWorkspaceFile;

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).filter((file) =>
      file.name.toLowerCase().endsWith(".svg"),
    );
    setFiles(selected);
    setError("");
  };

  const importBody = async (
    importMode: PreparedImportMode,
  ): Promise<Array<Record<string, unknown>>> => {
    const tags = parseTags(tagInput);
    const sharedFields = {
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(tags ? { tags } : {}),
    };

    if (importMode === "files") {
      return Promise.all(
        files.map(async (file) => ({
          svg: await readSvgFile(file),
          path: browserFilePath(file),
          ...(files.length === 1 ? sharedFields : { ...(tags ? { tags } : {}) }),
        })),
      );
    }

    if (importMode === "paste") {
      return [
        {
          svg: pastedSvg,
          path: pastedPath,
          ...sharedFields,
        },
      ];
    }

    if (importMode === "selection") {
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

  const handleLibrarySearchKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    publicLibrary.searchIcons();
  };

  const handleCustomCollectionKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    publicLibrary.browseCustomCollection();
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
      const nextIcons = editableSelectionIcons(result.icons);
      setSelectionIcons((current) =>
        mergeEditableSelectionIcons(current, nextIcons),
      );
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

  const applySelectionPathPrefix = () => {
    setSelectionIcons((current) =>
      current.map((icon) => ({
        ...icon,
        path: prefixedIconPath(selectionPathPrefix, icon.path),
      })),
    );
  };

  const removeSelectionIcon = (nodeId: string) => {
    setSelectionIcons((current) =>
      current.filter((icon) => icon.nodeId !== nodeId),
    );
  };

  const generateSelectionDisplayNames = () => {
    setSelectionIcons((current) =>
      current.map((icon) => ({
        ...icon,
        displayName: displayNameFromIconPath(icon.path) || icon.displayName,
      })),
    );
  };

  const submitPublicIconImport = async () => {
    if (publicLibrary.selectedIcons.length > PUBLIC_ICON_LIMITS.importMax) {
      throw new Error(
        `Import up to ${PUBLIC_ICON_LIMITS.importMax} public icons at a time.`,
      );
    }
    const tags = parseTags(tagInput);
    const result = await apiFetch<IconImportBatchResponse>(
      `${serverUrl}/api/icons/import/public`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: createFetchSignal(undefined, ICON_IMPORT_TIMEOUT_MS),
        body: JSON.stringify({
          icons: publicLibrary.selectedIcons.map((icon) => ({
            id: icon.id,
            path: icon.path,
            name: icon.name,
          })),
          ...(tags ? { tags } : {}),
        }),
      },
    );
    onImported(result.registry, result.icons);
  };

  const submitPreparedIconImport = async (importMode: PreparedImportMode) => {
    const bodies = await importBody(importMode);
    if (importMode === "selection") {
      const result = await apiFetch<IconImportBatchResponse>(
        `${serverUrl}/api/icons/import/figma`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: createFetchSignal(undefined, ICON_IMPORT_TIMEOUT_MS),
          body: JSON.stringify({ icons: bodies }),
        },
      );
      onImported(result.registry, result.icons);
      return;
    }

    if (bodies.length === 1) {
      const result = await apiFetch<IconImportResponse>(
        `${serverUrl}/api/icons/import/svg`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: createFetchSignal(undefined, ICON_IMPORT_TIMEOUT_MS),
          body: JSON.stringify(bodies[0]),
        },
      );
      onImported(result.registry, [result.icon]);
      return;
    }

    const result = await apiFetch<IconImportBatchResponse>(
      `${serverUrl}/api/icons/import/svgs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: createFetchSignal(undefined, ICON_IMPORT_TIMEOUT_MS),
        body: JSON.stringify({ icons: bodies }),
      },
    );
    onImported(result.registry, result.icons);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmDisabled) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const submittedMode = mode;
      if (submittedMode === "library") {
        await submitPublicIconImport();
      } else if (submittedMode === "svg") {
        await submitPreparedIconImport(svgMethod);
      } else {
        await submitPreparedIconImport(submittedMode);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to import icon."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex min-w-0 flex-col gap-3 rounded-md bg-[var(--color-figma-bg-secondary)] p-2"
      aria-label="Add icons"
      onSubmit={handleSubmit}
    >
        <div className="flex min-w-0 flex-col gap-3">
          <ImportModePicker
            value={mode}
            disabled={busy}
            onChange={(nextMode) => {
              setMode(nextMode);
              setError("");
            }}
          />

          {mode === "library" ? (
            <div className="grid min-w-0 gap-3 min-[640px]:grid-cols-[164px_minmax(0,1fr)]">
              {publicLibrary.providerError ? (
                <p
                  role="alert"
                  className="m-0 text-secondary text-[color:var(--color-figma-text-error)] min-[640px]:col-span-2"
                >
                  {publicLibrary.providerError}
                </p>
              ) : null}

              <PublicLibraryRail
                selectedPublicSourceId={publicLibrary.selectedSourceId}
                disabled={busy || publicLibrary.loading || publicLibrary.catalogLoading}
                onSelectSource={publicLibrary.selectSource}
                onOpenCatalog={publicLibrary.openCatalog}
                onSelectCustom={publicLibrary.selectCustomSource}
              />

              <div className="flex min-w-0 flex-col gap-3">
                {publicLibrary.selectedSourceId === "all" ? (
                  <PublicCollectionCatalog
                    query={publicLibrary.catalogQuery}
                    disabled={busy}
                    onQueryChange={publicLibrary.updateCatalogQuery}
                    onSearch={publicLibrary.searchCatalog}
                    onLoadMore={publicLibrary.loadMoreCatalog}
                    canLoadMore={publicLibrary.canLoadMoreCatalog}
                    loading={publicLibrary.catalogLoading}
                    response={publicLibrary.catalogResults}
                    selectedCollectionId={publicLibrary.collection}
                    onSelectCollection={publicLibrary.selectCatalogCollection}
                  />
                ) : null}

                {publicLibrary.selectedSourceId === "custom" ? (
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Field
                      label="Iconify prefix"
                      help="Examples: ph, mdi, carbon."
                    >
                      <TextInput
                        value={publicLibrary.collection}
                        onChange={(event) =>
                          publicLibrary.updateCollectionDraft(event.target.value)
                        }
                        onKeyDown={handleCustomCollectionKeyDown}
                        placeholder="ph"
                        size="sm"
                        disabled={busy}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={publicLibrary.browseCustomCollection}
                      disabled={
                        busy ||
                        publicLibrary.loading ||
                        !publicLibrary.canBrowseCustomCollection
                      }
                      className="mt-[18px] self-start bg-[var(--color-figma-bg-secondary)]"
                      title={publicLibrary.customCollectionError ?? "Browse collection"}
                    >
                      Browse
                    </Button>
                  </div>
                ) : null}

                <div className={IMPORT_DIALOG_SECTION_CLASSES}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-body font-semibold text-[color:var(--color-figma-text)]">
                        {publicLibrary.currentCollection?.name ??
                          publicLibrary.selectedSource?.label ??
                          "Public icons"}
                      </div>
                      <div className="truncate text-secondary text-[color:var(--color-figma-text-secondary)]">
                        {publicLibrary.currentCollection
                          ? `${publicLibrary.currentCollection.id} · ${publicLibrary.currentCollection.license.name}`
                          : publicLibrary.activeProvider?.description ??
                            "Search licensed icon libraries."}
                      </div>
                    </div>
                    {publicLibrary.results ? (
                      <div className="shrink-0 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                        {publicResultSummary(publicLibrary.results)}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <SearchField
                      ref={librarySearchRef}
                      value={publicLibrary.query}
                      onChange={(event) =>
                        publicLibrary.updateQuery(event.target.value)
                      }
                      onClear={publicLibrary.clearQuery}
                      onKeyDown={handleLibrarySearchKeyDown}
                      placeholder="Search home, arrow, menu"
                      size="sm"
                      disabled={busy || publicLibrary.loading}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={publicLibrary.searchIcons}
                      disabled={busy || publicLibrary.loading || !publicLibrary.query.trim()}
                      className="bg-[var(--color-figma-bg)]"
                    >
                      <Search size={13} strokeWidth={1.5} aria-hidden />
                      {publicLibrary.loading && publicLibrary.query.trim() ? "Searching" : "Search"}
                    </Button>
                  </div>
                  <PublicCategoryFilter
                    categories={publicLibrary.categories}
                    selectedCategory={publicLibrary.category}
                    disabled={busy || publicLibrary.loading}
                    onSelectCategory={publicLibrary.selectCategory}
                  />
                </div>

                {publicLibrary.loading && !publicLibrary.results ? (
                  <div className="flex min-h-40 items-center justify-center rounded-md bg-[var(--color-figma-bg-secondary)] text-secondary text-[color:var(--color-figma-text-secondary)]">
                    Loading public icons
                  </div>
                ) : publicLibrary.results ? (
                  <div className="flex min-w-0 flex-col gap-2">
                    <PublicIconGrid
                      icons={publicLibrary.results.icons}
                      serverUrl={serverUrl}
                      selectedIconIds={publicLibrary.selectedIconIds}
                      disabled={busy}
                      selectionLimitReached={publicLibrary.selectionLimitReached}
                      existingIconPaths={existingIconPaths}
                      onToggleIcon={publicLibrary.toggleIcon}
                    />
                    {publicLibrary.canLoadMoreIcons ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={publicLibrary.loadMoreIcons}
                        disabled={busy || publicLibrary.loading}
                        className="self-start bg-[var(--color-figma-bg-secondary)]"
                      >
                        {publicLibrary.loading ? "Loading" : "More icons"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {mode === "svg" ? (
            <div className="flex min-w-0 flex-col gap-2">
              <SvgMethodPicker
                value={svgMethod}
                disabled={busy}
                onChange={(nextMethod) => {
                  setSvgMethod(nextMethod);
                  setError("");
                }}
              />
              {svgMethod === "files" ? (
                <>
                  <button
                    ref={filePickerButtonRef}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded border border-dashed border-[var(--color-figma-border)] px-3 py-4 text-center text-body text-[color:var(--color-figma-text-secondary)] transition-colors ${
                      busy
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-[color:var(--color-figma-text-tertiary)] hover:bg-[var(--surface-hover)]"
                    }`}
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
                    disabled={busy}
                  />
                </>
              ) : (
                <>
                  <Field label="Icon path">
                    <TextInput
                      value={pastedPath}
                      onChange={(event) => setPastedPath(event.target.value)}
                      placeholder="navigation.home"
                      size="sm"
                      disabled={busy}
                    />
                  </Field>
                  <Field label="SVG">
                    <textarea
                      ref={pasteTextareaRef}
                      value={pastedSvg}
                      onChange={(event) => setPastedSvg(event.target.value)}
                      placeholder="<svg viewBox=&quot;0 0 24 24&quot;>...</svg>"
                      rows={8}
                      disabled={busy}
                      className={`w-full resize-y px-2 py-1.5 font-mono text-[11px] leading-[1.45] ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DISABLED_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES}`}
                    />
                  </Field>
                </>
              )}
            </div>
          ) : null}

          {mode === "selection" ? (
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 flex-wrap items-end gap-2">
                <Button
                  ref={readSelectionButtonRef}
                  type="button"
                  variant="secondary"
                  onClick={() => void handleReadSelection()}
                  disabled={busy || selectionLoading}
                  className="bg-[var(--color-figma-bg-secondary)]"
                >
                  <MousePointer2 size={13} strokeWidth={1.5} aria-hidden />
                  {selectionLoading ? "Reading selection" : "Read selection"}
                </Button>
                {selectionIcons.length > 0 ? (
                  <>
                    <Field label="Path prefix" className="w-36">
                      <TextInput
                        value={selectionPathPrefix}
                        onChange={(event) =>
                          setSelectionPathPrefix(event.target.value)
                        }
                        placeholder="navigation"
                        size="sm"
                        disabled={busy}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={applySelectionPathPrefix}
                      disabled={busy || !selectionPathPrefix.trim()}
                      className="bg-[var(--color-figma-bg-secondary)]"
                    >
                      Apply
                    </Button>
                  </>
                ) : null}
                {selectionIcons.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateSelectionDisplayNames}
                    disabled={busy}
                    className="px-1.5"
                  >
                    Name from path
                  </Button>
                ) : null}
              </div>

              {selectionIcons.length > 0 ? (
                <div className="flex max-h-72 min-w-0 flex-col gap-2 overflow-auto pr-1">
                  {selectionIcons.map((icon) => (
                    <div
                      key={icon.nodeId}
                      className="flex min-w-0 flex-col gap-2 rounded bg-[var(--color-figma-bg-secondary)] p-2"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--color-figma-bg)]">
                          <img
                            src={svgDataUrl(icon.svg)}
                            alt=""
                            className="h-7 w-7 object-contain"
                            draggable={false}
                          />
                        </div>
                        <div className="min-w-0 flex-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
                          <span className="block truncate font-medium text-[color:var(--color-figma-text)]">
                            {icon.nodeName}
                          </span>
                          <span className="block truncate">
                            {icon.nodeType.toLowerCase()} · {formatIconFrame(icon.width, icon.height)} · viewBox {icon.viewBox}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSelectionIcon(icon.nodeId)}
                          disabled={busy}
                          aria-label={`Remove ${icon.nodeName}`}
                          title={`Remove ${icon.nodeName}`}
                          className="shrink-0 px-1.5"
                        >
                          <X size={13} strokeWidth={1.75} aria-hidden />
                        </Button>
                      </div>
                      <div className="grid min-w-0 gap-2 min-[520px]:grid-cols-2">
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
                            disabled={busy}
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
                            disabled={busy}
                          />
                        </Field>
                      </div>
                      {(selectionIssues.get(icon.nodeId) ?? []).length > 0 ? (
                        <div className="flex min-w-0 flex-col gap-1">
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
                  Select Figma layers, then read the selection.
                </p>
              )}
            </div>
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
                  disabled={busy}
                />
              </Field>
              <Field label="Icon path">
                <TextInput
                  value={workspacePath}
                  onChange={(event) => setWorkspacePath(event.target.value)}
                  placeholder="navigation.home"
                  size="sm"
                  disabled={busy}
                />
              </Field>
            </>
          ) : null}

          {showDisplayNameField ? (
            <Field label="Display name">
              <TextInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Home"
                size="sm"
                disabled={busy}
              />
            </Field>
          ) : null}

          <div className="flex min-w-0 flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowMetadataFields((current) => !current)}
              aria-expanded={showMetadataFields || Boolean(tagInput.trim())}
              disabled={busy}
              className="self-start px-1.5"
            >
              Add tags
            </Button>
            {showMetadataFields || Boolean(tagInput.trim()) ? (
              <Field label="Tags">
                <TextInput
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="navigation, interface"
                  size="sm"
                  disabled={busy}
                />
              </Field>
            ) : null}
          </div>

          {error || (mode === "library" && publicLibrary.error) ? (
            <p
              role="alert"
              className="m-0 text-secondary text-[color:var(--color-figma-text-error)]"
            >
              {error || publicLibrary.error}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-end justify-end gap-2">
          {mode === "library" ? (
            <PublicSelectionSummary
              selectedIconCount={selectedPublicIconCount}
              updateCount={selectedPublicIconUpdateCount}
              licenseSummaries={selectedPublicIconLicenseSummaries}
              selectedIcons={publicLibrary.selectedIcons}
              disabled={busy}
              onClear={publicLibrary.clearSelection}
            />
          ) : null}
          {cancelable ? (
            <Button
              type="button"
              onClick={onCancel}
              disabled={busy}
              variant="secondary"
              className="bg-[var(--color-figma-bg)]"
            >
              Cancel
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={confirmDisabled}
            variant="primary"
            data-modal-primary="true"
          >
            {mode === "library"
              ? publicIconImportLabel(selectedPublicIconCount, busy)
              : busy
                ? "Importing..."
                : "Import"}
          </Button>
        </div>
    </form>
  );
}
