import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { IconRegistryFile, ManagedIcon } from "@token-workshop/core";
import { FileUp } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button, Field, SegmentedControl, TextInput } from "../../primitives";
import { CONTROL_INPUT_BASE_CLASSES, CONTROL_INPUT_DEFAULT_STATE_CLASSES, CONTROL_INPUT_DISABLED_CLASSES } from "../../shared/controlClasses";
import { apiFetch } from "../../shared/apiFetch";
import { getErrorMessage } from "../../shared/utils";

type ImportMode = "files" | "paste" | "workspace";

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

interface IconImportDialogProps {
  serverUrl: string;
  onClose: () => void;
  onImported: (registry: IconRegistryFile, icons: ManagedIcon[]) => void;
}

const IMPORT_MODES: Array<{ value: ImportMode; label: string }> = [
  { value: "files", label: "Files" },
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

export function IconImportDialog({
  serverUrl,
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

  const confirmDisabled =
    busy ||
    (mode === "files" && files.length === 0) ||
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmDisabled) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const bodies = await importBody();
      if (bodies.length === 1) {
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

          <Field label="Display name" help="Optional. Best for single-icon imports.">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Home"
              size="sm"
            />
          </Field>

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
