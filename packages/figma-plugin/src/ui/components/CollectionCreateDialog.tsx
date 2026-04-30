import { useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Button } from "../primitives/Button";
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
  if (!isOpen) return null;

  return (
    <CollectionCreateDialogContent
      onClose={onClose}
      onCreate={onCreate}
      onCreated={onCreated}
    />
  );
}

function CollectionCreateDialogContent({
  onClose,
  onCreate,
  onCreated,
}: Omit<CollectionCreateDialogProps, "isOpen">) {
  const [draft, setDraft] = useState<CollectionAuthoringDraft>({
    name: "",
    modeNames: ["Default"],
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useFocusTrap(dialogRef, { initialFocusRef: nameInputRef });

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
        ref={dialogRef}
        className="tm-modal-panel tm-modal-panel--dialog"
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
        aria-describedby="new-collection-dialog-description"
      >
        <div className="tm-modal-header border-b border-[var(--color-figma-border)]">
          <h2
            id="new-collection-dialog-title"
            className="text-heading font-semibold text-[color:var(--color-figma-text)]"
          >
            New collection
          </h2>
        </div>

        <div className="tm-modal-body py-3">
          <p
            id="new-collection-dialog-description"
            className="text-secondary text-[color:var(--color-figma-text-secondary)]"
          >
            Collections match Figma variable collections. Name the collection, then add the modes every token should support.
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
            onModeNamesChange={(modeNames) => {
              setDraft((current) => ({ ...current, modeNames }));
              setError("");
            }}
            onModeNameChange={(index, value) => {
              setDraft((current) => ({
                ...current,
                modeNames: current.modeNames.map((modeName, modeIndex) =>
                  modeIndex === index ? value : modeName,
                ),
              }));
              setError("");
            }}
            onAddMode={() => {
              setDraft((current) => ({
                ...current,
                modeNames: [...current.modeNames, ""],
              }));
              setError("");
            }}
            onRemoveMode={(index) => {
              setDraft((current) => ({
                ...current,
                modeNames: current.modeNames.filter((_, modeIndex) => modeIndex !== index),
              }));
              setError("");
            }}
          />
        </div>

        <div className="tm-modal-footer border-t border-[var(--color-figma-border)] pt-3">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="w-full bg-[var(--color-figma-bg-secondary)]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || !draft.name.trim()}
            variant="primary"
            className="w-full"
          >
            {pending ? "Creating…" : "Create collection"}
          </Button>
        </div>
      </div>
    </div>
  );
}
