import { Plus, X } from "lucide-react";
import type { Ref } from "react";
import { COLLECTION_NAME_RE } from "../shared/utils";

const COLLECTION_INPUT_CLASS =
  "rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-body text-[color:var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60";

export interface CollectionAuthoringDraft {
  name: string;
  modeNames: string[];
}

export function createInitialCollectionAuthoringDraft(
  hasExistingCollections: boolean,
  seedModeNames: string[] = [],
): CollectionAuthoringDraft {
  const reusableModeNames = seedModeNames
    .map((modeName) => modeName.trim())
    .filter(Boolean);

  return hasExistingCollections
    ? {
        name: "",
        modeNames: reusableModeNames.length > 0 ? reusableModeNames : ["Default"],
      }
    : {
        name: "",
        modeNames: ["Light", "Dark"],
      };
}

const MODE_PRESETS: Array<{ label: string; modes: string[] }> = [
  { label: "Default only", modes: ["Default"] },
  { label: "Light / Dark", modes: ["Light", "Dark"] },
  { label: "Mobile / Desktop", modes: ["Mobile", "Desktop"] },
];

interface CollectionAuthoringFieldsProps {
  draft: CollectionAuthoringDraft;
  pending?: boolean;
  error?: string;
  nameInputRef?: Ref<HTMLInputElement>;
  onNameChange: (value: string) => void;
  onModeNamesChange?: (modeNames: string[]) => void;
  onModeNameChange: (index: number, value: string) => void;
  onAddMode: () => void;
  onRemoveMode: (index: number) => void;
}

export function validateCollectionAuthoringDraft(
  draft: CollectionAuthoringDraft,
): string | null {
  const trimmedCollectionName = draft.name.trim();
  const trimmedModes = draft.modeNames.map((modeName) => modeName.trim());
  const nonEmptyModes = trimmedModes.filter(Boolean);

  if (!trimmedCollectionName) {
    return "Collection name is required";
  }

  if (!COLLECTION_NAME_RE.test(trimmedCollectionName)) {
    return "Use letters, numbers, - and _. Use / to group related collections.";
  }

  if (nonEmptyModes.length === 0) {
    return "Add at least one mode";
  }

  if (trimmedModes.some((modeName) => modeName.length === 0)) {
    return "Mode names cannot be empty";
  }

  const uniqueModes = new Set(
    trimmedModes.map((modeName) => modeName.toLocaleLowerCase()),
  );

  if (uniqueModes.size !== trimmedModes.length) {
    return "Mode names must be different";
  }

  return null;
}

export function buildCollectionModeNames(
  draft: CollectionAuthoringDraft,
): string[] {
  return draft.modeNames.map((modeName) => modeName.trim()).filter(Boolean);
}

export function CollectionAuthoringFields({
  draft,
  pending = false,
  error,
  nameInputRef,
  onNameChange,
  onModeNamesChange,
  onModeNameChange,
  onAddMode,
  onRemoveMode,
}: CollectionAuthoringFieldsProps) {
  const normalizedModes = draft.modeNames.map((modeName) =>
    modeName.trim().toLocaleLowerCase(),
  );

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          Collection name
        </span>
        <input
          ref={nameInputRef}
          type="text"
          value={draft.name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="colors"
          disabled={pending}
          className={COLLECTION_INPUT_CLASS}
        />
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            Modes
          </span>
          <button
            type="button"
            onClick={onAddMode}
            disabled={pending}
            className="inline-flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:underline disabled:opacity-50"
          >
            <Plus size={12} strokeWidth={1.5} aria-hidden />
            Add mode
          </button>
        </div>

        {onModeNamesChange ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Mode presets">
            {MODE_PRESETS.map((preset) => {
              const presetActive =
                preset.modes.length === normalizedModes.length &&
                preset.modes.every(
                  (modeName, index) =>
                    modeName.toLocaleLowerCase() === normalizedModes[index],
                );
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onModeNamesChange(preset.modes)}
                  disabled={pending}
                  aria-pressed={presetActive}
                  className={`rounded border px-2 py-1 text-secondary transition-colors disabled:opacity-50 ${
                    presetActive
                      ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]"
                      : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {draft.modeNames.map((modeName, index) => (
            <label key={index} className="flex flex-col gap-1">
              <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                {index === 0 ? "First mode" : `Mode ${index + 1}`}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={modeName}
                  onChange={(event) => onModeNameChange(index, event.target.value)}
                  placeholder={index === 0 ? "Light" : index === 1 ? "Dark" : "Mode name"}
                  disabled={pending}
                  aria-label={`Mode ${index + 1} name`}
                  className={`${COLLECTION_INPUT_CLASS} flex-1`}
                />
                {draft.modeNames.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemoveMode(index)}
                    disabled={pending}
                    aria-label={`Remove ${modeName.trim() || `mode ${index + 1}`}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] disabled:opacity-50"
                  >
                    <X size={12} strokeWidth={1.5} aria-hidden />
                  </button>
                ) : null}
              </div>
            </label>
          ))}
        </div>

        <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Modes become value columns for every token in this collection.
        </span>
      </div>

      {error ? (
        <div className="text-secondary text-[color:var(--color-figma-text-error)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
