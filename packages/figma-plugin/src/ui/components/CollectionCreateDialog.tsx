import { useEffect, useRef, useState } from "react";

const COLLECTION_PATH_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

interface CollectionCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<string>;
}

export function CollectionCreateDialog({
  isOpen,
  onClose,
  onCreate,
}: CollectionCreateDialogProps) {
  const [collectionName, setCollectionName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCollectionName("");
    setError("");
    setPending(false);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const trimmedCollectionName = collectionName.trim();

    if (!trimmedCollectionName) {
      setError("Collection name is required");
      return;
    }
    if (!COLLECTION_PATH_RE.test(trimmedCollectionName)) {
      setError("Use letters, numbers, - and _. Use / to group related collections.");
      return;
    }

    setPending(true);
    setError("");
    try {
      await onCreate(trimmedCollectionName);
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
            className="text-heading font-semibold text-[var(--color-figma-text)]"
          >
            New collection
          </h2>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
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
              placeholder="primitives or brand/primitives"
              disabled={pending}
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
            />
            <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
              Use `/` only if you want to group related collections together.
            </span>
          </label>

          {error && <div className="text-secondary text-[var(--color-figma-error)]">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-figma-border)] px-4 py-3">
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
