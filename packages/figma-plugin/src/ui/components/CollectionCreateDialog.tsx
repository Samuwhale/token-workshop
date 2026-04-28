import { useEffect, useRef, useState } from "react";
import {
  buildCollectionModeNames,
  CollectionAuthoringFields,
  type CollectionAuthoringDraft,
  validateCollectionAuthoringDraft,
} from "./CollectionAuthoringFields";

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
  const [draft, setDraft] = useState<CollectionAuthoringDraft>({
    name: "",
    primaryModeName: "Default",
    secondaryModeEnabled: false,
    secondaryModeName: "",
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft({
      name: "",
      primaryModeName: "Default",
      secondaryModeEnabled: false,
      secondaryModeName: "",
    });
    setError("");
    setPending(false);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const validationError = validateCollectionAuthoringDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    setError("");
    try {
      const createdCollectionId = await onCreate({
        name: draft.name.trim(),
        modes: buildCollectionModeNames(draft),
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
            Collections hold related tokens and their modes. Name the collection, set the first mode, and add a second only if you already need another context.
          </p>
          <CollectionAuthoringFields
            draft={draft}
            pending={pending}
            error={error}
            nameInputRef={nameInputRef}
            onNameChange={(value) => {
              setDraft((current) => ({ ...current, name: value }));
              setError("");
            }}
            onPrimaryModeChange={(value) => {
              setDraft((current) => ({ ...current, primaryModeName: value }));
              setError("");
            }}
            onSecondaryModeEnabledChange={(enabled) => {
              setDraft((current) => ({
                ...current,
                secondaryModeEnabled: enabled,
                secondaryModeName: enabled ? current.secondaryModeName : "",
              }));
              setError("");
            }}
            onSecondaryModeChange={(value) => {
              setDraft((current) => ({ ...current, secondaryModeName: value }));
              setError("");
            }}
          />
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
            disabled={pending || !draft.name.trim()}
            className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-body font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create collection"}
          </button>
        </div>
      </div>
    </div>
  );
}
