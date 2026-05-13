import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import {
  normalizeIconPath,
  type IconRegistryFile,
  type ManagedIcon,
} from "@token-workshop/core";
import type {
  IconSelectionImportItem,
  IconSelectionReadMessage,
} from "../../../shared/types";
import { FileUp, MousePointer2 } from "lucide-react";
import {
  getPluginMessageFromEvent,
  postPluginMessage,
} from "../../../shared/utils";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button, Field, SegmentedControl, TextInput } from "../../primitives";
import {
  CONTROL_INPUT_BASE_CLASSES,
  CONTROL_INPUT_DEFAULT_STATE_CLASSES,
  CONTROL_INPUT_DISABLED_CLASSES,
} from "../../shared/controlClasses";
import { apiFetch, createFetchSignal } from "../../shared/apiFetch";
import { getErrorMessage, isAbortError } from "../../shared/utils";

type ImportMode = "library" | "files" | "selection" | "paste" | "workspace";

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

function createCorrelationId(): string {
  return `icon-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readIconSelectionFromFigma(): Promise<IconSelectionReadMessage> {
  const correlationId = createCorrelationId();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Figma did not finish reading the selection."));
    }, 15_000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event: MessageEvent) {
      const pluginMessage =
        getPluginMessageFromEvent<IconSelectionReadMessage>(event);
      if (
        pluginMessage?.type !== "icon-selection-read" ||
        pluginMessage.correlationId !== correlationId
      ) {
        return;
      }
      cleanup();
      resolve(pluginMessage);
    }

    window.addEventListener("message", handleMessage);
    const sent = postPluginMessage({
      type: "read-icon-selection",
      correlationId,
    });
    if (!sent) {
      cleanup();
      reject(new Error("Open the plugin in Figma to import from selection."));
    }
  });
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
  const [mode, setMode] = useState<ImportMode>("files");
  const [files, setFiles] = useState<File[]>([]);
  const [libraryQuery, setLibraryQuery] = useState("home");
  const [libraryCollection, setLibraryCollection] = useState("lucide");
  const [publicProviders, setPublicProviders] = useState<PublicIconProvider[]>(
    [],
  );
  const [publicProviderError, setPublicProviderError] = useState("");
  const [libraryResults, setLibraryResults] =
    useState<PublicIconSearchResponse | null>(null);
  const [selectedPublicIconIds, setSelectedPublicIconIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [libraryLoading, setLibraryLoading] = useState(false);
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

  const activePublicProvider =
    publicProviders.find((provider) => provider.id === "iconify") ??
    libraryResults?.provider ??
    null;

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

  const searchPublicLibrary = async () => {
    if (!libraryQuery.trim() || libraryLoading || busy) {
      return;
    }
    setLibraryLoading(true);
    setError("");
    setLibraryResults(null);
    setSelectedPublicIconIds(new Set());
    try {
      const params = new URLSearchParams({
        provider: activePublicProvider?.id ?? "iconify",
        query: libraryQuery.trim(),
        limit: "48",
      });
      if (libraryCollection.trim()) {
        params.set("collection", libraryCollection.trim());
      }
      const result = await apiFetch<PublicIconSearchResponse>(
        `${serverUrl}/api/icons/public/search?${params.toString()}`,
        { signal: createFetchSignal(undefined, 15_000) },
      );
      setLibraryResults(result);
      if (result.icons.length === 0) {
        setError("No public icons matched this search.");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to search public icons."));
    } finally {
      setLibraryLoading(false);
    }
  };

  const handleLibrarySearchKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    void searchPublicLibrary();
  };

  const handleLibraryQueryChange = (value: string) => {
    setLibraryQuery(value);
    setLibraryResults(null);
    setSelectedPublicIconIds(new Set());
    setError("");
  };

  const handleLibraryCollectionChange = (value: string) => {
    setLibraryCollection(value);
    setLibraryResults(null);
    setSelectedPublicIconIds(new Set());
    setError("");
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
        className="tm-modal-panel tm-modal-panel--dialog"
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
              {activePublicProvider ? (
                <div className="flex min-w-0 flex-col gap-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
                  <span className="font-medium text-[color:var(--color-figma-text)]">
                    {activePublicProvider.name}
                  </span>
                  <span>{activePublicProvider.description}</span>
                </div>
              ) : null}
              {publicProviderError ? (
                <p
                  role="alert"
                  className="m-0 text-secondary text-[color:var(--color-figma-text-error)]"
                >
                  {publicProviderError}
                </p>
              ) : null}
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_116px_auto] gap-2">
                <Field label="Search">
                  <TextInput
                    value={libraryQuery}
                    onChange={(event) => handleLibraryQueryChange(event.target.value)}
                    onKeyDown={handleLibrarySearchKeyDown}
                    placeholder="home, arrow, menu"
                    size="sm"
                  />
                </Field>
                <Field label="Collection">
                  <TextInput
                    value={libraryCollection}
                    onChange={(event) =>
                      handleLibraryCollectionChange(event.target.value)
                    }
                    onKeyDown={handleLibrarySearchKeyDown}
                    placeholder="lucide"
                    size="sm"
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void searchPublicLibrary()}
                  disabled={busy || libraryLoading || !libraryQuery.trim()}
                  className="self-end bg-[var(--color-figma-bg-secondary)]"
                >
                  {libraryLoading ? "Searching" : "Search"}
                </Button>
              </div>

              {libraryResults ? (
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex min-w-0 items-center justify-between gap-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
                    <span>
                      {libraryResults.icons.length} of {libraryResults.total} results
                    </span>
                    {selectedPublicIconIds.size > 0 ? (
                      <span>{selectedPublicIconIds.size} selected</span>
                    ) : null}
                  </div>
                  {selectedPublicIconUpdateCount > 0 ? (
                    <p className="m-0 rounded bg-[var(--color-figma-warning)]/10 px-2 py-1.5 text-secondary text-[color:var(--color-figma-text-warning)]">
                      {selectedPublicIconUpdateCount} selected icon{selectedPublicIconUpdateCount === 1 ? "" : "s"} will update an existing managed icon.
                    </p>
                  ) : null}
                  <div className="grid max-h-72 min-w-0 grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 overflow-auto pr-1">
                    {libraryResults.icons.map((icon) => {
                      const selected = selectedPublicIconIds.has(icon.id);
                      const updatesExisting = existingIconPaths.has(iconPathKey(icon.path));
                      return (
                        <button
                          key={icon.id}
                          type="button"
                          onClick={() => togglePublicIcon(icon.id)}
                          className={`flex min-w-0 flex-col gap-2 rounded border p-2 text-left transition-colors ${
                            selected
                              ? "border-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-bg-selected)]"
                              : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--surface-hover)]"
                          }`}
                        >
                          <span className="flex h-12 w-full items-center justify-center rounded bg-[var(--color-figma-bg)]">
                            <img
                              src={icon.svgUrl}
                              alt=""
                              className="h-7 w-7 object-contain"
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
                            {icon.collection.license.attributionRequired ? " - attribution" : ""}
                          </span>
                          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                            {icon.providerName} source
                          </span>
                          {updatesExisting ? (
                            <span className="text-secondary text-[color:var(--color-figma-text-warning)]">
                              Updates existing icon
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {selectedPublicIconLicenseSummaries.length > 0 ? (
                    <div className="flex min-w-0 flex-col gap-1.5 pt-1 text-secondary">
                      <div className="font-medium text-[color:var(--color-figma-text)]">
                        Import review
                      </div>
                      {selectedPublicIconLicenseSummaries.map((summary) => (
                        <div
                          key={summary.key}
                          className="min-w-0 text-[color:var(--color-figma-text-secondary)]"
                        >
                          <span className="font-medium text-[color:var(--color-figma-text)]">
                            {summary.iconCount} icon{summary.iconCount === 1 ? "" : "s"}
                          </span>{" "}
                          from {summary.collectionName} via {summary.providerName}:{" "}
                          <a
                            href={summary.licenseUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[color:var(--color-figma-text-accent)] underline"
                          >
                            {summary.licenseName}
                          </a>
                          {summary.attributionRequired
                            ? " requires attribution in handoff and exports."
                            : " has no attribution requirement in the provider metadata."}
                        </div>
                      ))}
                      <div className="flex min-w-0 flex-col gap-1 pt-1">
                        {selectedPublicIcons.slice(0, 3).map((icon) => (
                          <a
                            key={icon.id}
                            href={icon.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-[color:var(--color-figma-text-accent)] underline"
                          >
                            View {icon.name} source
                          </a>
                        ))}
                        {selectedPublicIcons.length > 3 ? (
                          <span className="text-[color:var(--color-figma-text-tertiary)]">
                            {selectedPublicIcons.length - 3} more source links are stored after import.
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                  Search Iconify collections before importing. Icons with missing license metadata are not shown.
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
            {busy ? "Importing..." : "Import"}
          </Button>
        </div>
      </form>
    </div>
  );
}
