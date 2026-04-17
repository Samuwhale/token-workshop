import { useEffect, useMemo, useRef, useState } from "react";

const SET_LEAF_RE = /^[a-zA-Z0-9_-]+$/;
const FOLDER_PATH_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

interface CollectionCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CollectionCreateDialog({
  isOpen,
  onClose,
  onCreate,
}: CollectionCreateDialogProps) {
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setFolderPath("");
    setError("");
    setPending(false);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  }, [isOpen]);

  const fullSetName = useMemo(() => {
    const trimmedName = name.trim();
    const trimmedFolderPath = folderPath.trim();
    if (!trimmedName) return "";
    return trimmedFolderPath ? `${trimmedFolderPath}/${trimmedName}` : trimmedName;
  }, [folderPath, name]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedFolderPath = folderPath.trim();

    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    if (!SET_LEAF_RE.test(trimmedName)) {
      setError("Use letters, numbers, - and _");
      return;
    }
    if (trimmedFolderPath && !FOLDER_PATH_RE.test(trimmedFolderPath)) {
      setError("Folder path uses / between names");
      return;
    }

    setPending(true);
    setError("");
    try {
      await onCreate(
        trimmedFolderPath ? `${trimmedFolderPath}/${trimmedName}` : trimmedName,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create collection",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)] p-3"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[320px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            void handleSubmit();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-collection-dialog-title"
      >
        <div className="border-b border-[var(--color-figma-border)] px-4 py-3">
          <h2
            id="new-collection-dialog-title"
            className="text-[12px] font-semibold text-[var(--color-figma-text)]"
          >
            New collection
          </h2>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Name
            </span>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
              placeholder="primitives"
              disabled={pending}
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Folder path
            </span>
            <input
              type="text"
              value={folderPath}
              onChange={(event) => {
                setFolderPath(event.target.value);
                setError("");
              }}
              placeholder="brand or brand/colors"
              disabled={pending}
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
            />
          </label>

          {fullSetName && (
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Creates <span className="font-mono text-[var(--color-figma-text)]">{fullSetName}</span>
            </div>
          )}

          {error && <div className="text-[10px] text-[var(--color-figma-error)]">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-figma-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || !name.trim()}
            className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {pending ? "Creating…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
