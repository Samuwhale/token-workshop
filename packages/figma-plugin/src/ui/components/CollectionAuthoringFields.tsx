import type { RefObject } from "react";
import { COLLECTION_NAME_RE } from "../shared/utils";

export interface CollectionAuthoringDraft {
  name: string;
  primaryModeName: string;
  secondaryModeEnabled: boolean;
  secondaryModeName: string;
}

interface CollectionAuthoringFieldsProps {
  draft: CollectionAuthoringDraft;
  pending?: boolean;
  error?: string;
  nameInputRef?: RefObject<HTMLInputElement | null>;
  onNameChange: (value: string) => void;
  onPrimaryModeChange: (value: string) => void;
  onSecondaryModeEnabledChange: (enabled: boolean) => void;
  onSecondaryModeChange: (value: string) => void;
}

export function validateCollectionAuthoringDraft(
  draft: CollectionAuthoringDraft,
): string | null {
  const trimmedCollectionName = draft.name.trim();
  const trimmedPrimaryMode = draft.primaryModeName.trim();
  const trimmedSecondaryMode = draft.secondaryModeName.trim();

  if (!trimmedCollectionName) {
    return "Collection name is required";
  }

  if (!COLLECTION_NAME_RE.test(trimmedCollectionName)) {
    return "Use letters, numbers, - and _. Use / to group related collections.";
  }

  if (!trimmedPrimaryMode) {
    return "Add a first mode name";
  }

  if (
    draft.secondaryModeEnabled &&
    !trimmedSecondaryMode
  ) {
    return "Add a second mode name or remove it";
  }

  if (
    draft.secondaryModeEnabled &&
    trimmedSecondaryMode.localeCompare(trimmedPrimaryMode, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return "Mode names must be different";
  }

  return null;
}

export function buildCollectionModeNames(
  draft: CollectionAuthoringDraft,
): string[] {
  const modes = [draft.primaryModeName.trim()];
  if (draft.secondaryModeEnabled) {
    modes.push(draft.secondaryModeName.trim());
  }
  return modes;
}

export function CollectionAuthoringFields({
  draft,
  pending = false,
  error,
  nameInputRef,
  onNameChange,
  onPrimaryModeChange,
  onSecondaryModeEnabledChange,
  onSecondaryModeChange,
}: CollectionAuthoringFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-secondary text-[var(--color-figma-text-secondary)]">
          Collection name
        </span>
        <input
          ref={nameInputRef}
          type="text"
          value={draft.name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="primitives"
          disabled={pending}
          className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
        />
        <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
          Keep this simple. Use `/` only when your library already groups collections that way.
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-secondary text-[var(--color-figma-text-secondary)]">
            First mode
          </span>
          <input
            type="text"
            value={draft.primaryModeName}
            onChange={(event) => onPrimaryModeChange(event.target.value)}
            placeholder="Default"
            disabled={pending}
            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
          />
        </label>

        {draft.secondaryModeEnabled ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                Second mode
              </span>
              <input
                type="text"
                value={draft.secondaryModeName}
                onChange={(event) => onSecondaryModeChange(event.target.value)}
                placeholder="Dark"
                disabled={pending}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={() => onSecondaryModeEnabledChange(false)}
              disabled={pending}
              className="self-start text-secondary text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
            >
              Use one mode for now
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSecondaryModeEnabledChange(true)}
            disabled={pending}
            className="self-start text-secondary text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
          >
            Add another mode
          </button>
        )}

        <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
          Start with one mode for a straightforward collection. Add a second only when you already need variants like light and dark.
        </span>
      </div>

      {error ? (
        <div className="text-secondary text-[var(--color-figma-error)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
