import { useEffect, useRef, useState } from "react";
import { COLLECTION_NAME_RE } from "../shared/utils";

export interface CreateCollectionRequest {
  name: string;
  modes: string[];
}

interface CollectionCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (request: CreateCollectionRequest) => Promise<string>;
  onCreated?: (collectionId: string) => void;
}

export function CollectionCreateDialog({
  isOpen,
  onClose,
  onCreate,
  onCreated,
}: CollectionCreateDialogProps) {
  const [collectionName, setCollectionName] = useState("");
  const [primaryModeName, setPrimaryModeName] = useState("Default");
  const [secondaryModeName, setSecondaryModeName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCollectionName("");
    setPrimaryModeName("Default");
    setSecondaryModeName("");
    setError("");
    setPending(false);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const trimmedCollectionName = collectionName.trim();
    const trimmedPrimaryMode = primaryModeName.trim();
    const trimmedSecondaryMode = secondaryModeName.trim();

    if (!trimmedCollectionName) {
      setError("Collection name is required");
      return;
    }
    if (!COLLECTION_NAME_RE.test(trimmedCollectionName)) {
      setError("Use letters, numbers, - and _. Use / to group related collections.");
      return;
    }
    if (!trimmedPrimaryMode) {
      setError("Add a first mode name");
      return;
    }
    if (
      trimmedSecondaryMode &&
      trimmedSecondaryMode.localeCompare(trimmedPrimaryMode, undefined, {
        sensitivity: "accent",
      }) === 0
    ) {
      setError("Mode names must be different");
      return;
    }

    setPending(true);
    setError("");
    try {
      const createdCollectionId = await onCreate({
        name: trimmedCollectionName,
        modes: trimmedSecondaryMode
          ? [trimmedPrimaryMode, trimmedSecondaryMode]
          : [trimmedPrimaryMode],
      });
      onCreated?.(createdCollectionId);
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
      className="tm-modal-shell"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="tm-modal-panel"
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
        <div className="tm-modal-header border-b border-[var(--color-figma-border)]">
          <h2
            id="new-collection-dialog-title"
            className="text-heading font-semibold text-[var(--color-figma-text)]"
          >
            New collection
          </h2>
        </div>

        <div className="tm-modal-body flex flex-col gap-3 py-3">
          <p className="text-secondary text-[var(--color-figma-text-secondary)]">
            Collections hold related tokens and their mode columns. Start with a simple
            name, then add the first mode you want to edit.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-secondary text-[var(--color-figma-text-secondary)]">
              Collection name
            </span>
            <input
              ref={nameInputRef}
              type="text"
              value={collectionName}
              onChange={(event) => {
                setCollectionName(event.target.value);
                setError("");
              }}
              placeholder="primitives"
              disabled={pending}
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
            />
            <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
              Keep this simple. Use `/` only when your library already groups collections that way.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                First mode
              </span>
              <input
                type="text"
                value={primaryModeName}
                onChange={(event) => {
                  setPrimaryModeName(event.target.value);
                  setError("");
                }}
                placeholder="Default"
                disabled={pending}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                Second mode
              </span>
              <input
                type="text"
                value={secondaryModeName}
                onChange={(event) => {
                  setSecondaryModeName(event.target.value);
                  setError("");
                }}
                placeholder="Optional"
                disabled={pending}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
              />
            </label>
          </div>
          <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
            Add one mode now for a straightforward collection, or two if you already know
            this collection needs variants like light and dark.
          </span>

          {error && <div className="text-secondary text-[var(--color-figma-error)]">{error}</div>}
        </div>

        <div className="tm-modal-footer border-t border-[var(--color-figma-border)] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-body text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || !collectionName.trim()}
            className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-body font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create collection"}
          </button>
        </div>
      </div>
    </div>
  );
}
