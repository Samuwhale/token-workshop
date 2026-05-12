import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
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
import { CONTROL_INPUT_BASE_CLASSES, CONTROL_INPUT_DEFAULT_STATE_CLASSES, CONTROL_INPUT_DISABLED_CLASSES } from "../../shared/controlClasses";
import { apiFetch } from "../../shared/apiFetch";
import { getErrorMessage } from "../../shared/utils";

type ImportMode = "files" | "selection" | "paste" | "workspace";

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
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

  const confirmDisabled =
    busy ||
    (mode === "files" && files.length === 0) ||
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

          {mode !== "selection" ? (
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
