import { Plus, X } from "lucide-react";
import type { Ref } from "react";
import { Button, Field, IconButton, TextInput } from "../primitives";
import { COLLECTION_NAME_RE } from "../shared/utils";

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

const MODE_PRESETS: Array<{
  label: string;
  description: string;
  modes: string[];
}> = [
  {
    label: "One mode",
    description: "One value per token.",
    modes: ["Default"],
  },
  {
    label: "Light and dark",
    description: "Separate values for light and dark.",
    modes: ["Light", "Dark"],
  },
  {
    label: "Mobile and desktop",
    description: "Separate values for mobile and desktop.",
    modes: ["Mobile", "Desktop"],
  },
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

function getModeFieldLabel(index: number, hasMultipleModes: boolean): string {
  if (!hasMultipleModes) {
    return "Mode name";
  }
  return `Mode ${index + 1}`;
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
  const hasMultipleModes = draft.modeNames.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Collection name">
        <TextInput
          ref={nameInputRef}
          size="sm"
          value={draft.name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="colors"
          disabled={pending}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            Modes
          </span>
          <Button
            type="button"
            onClick={onAddMode}
            disabled={pending}
            variant="ghost"
            size="sm"
            className="shrink-0 px-1.5"
          >
            <Plus size={12} strokeWidth={1.5} aria-hidden />
            Add mode
          </Button>
        </div>

        {onModeNamesChange ? (
          <div className="grid gap-1" aria-label="Mode presets">
            <span className="px-0.5 text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
              Mode templates
            </span>
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
                  className={`rounded px-2 py-1.5 text-left transition-colors disabled:opacity-50 ${
                    presetActive
                      ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                      : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                  }`}
                >
                  <span className="block text-body font-medium">
                    {preset.label}
                  </span>
                  <span className="mt-0.5 block text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {draft.modeNames.map((modeName, index) => {
            const modeInputId = `collection-mode-${index}`;
            return (
              <Field
                key={index}
                label={getModeFieldLabel(index, hasMultipleModes)}
                htmlFor={modeInputId}
              >
                <div className="flex items-center gap-2">
                  <TextInput
                    id={modeInputId}
                    size="sm"
                    value={modeName}
                    onChange={(event) => onModeNameChange(index, event.target.value)}
                    placeholder={index === 0 ? "Light" : index === 1 ? "Dark" : "Mode name"}
                    disabled={pending}
                    aria-label={`Mode ${index + 1} name`}
                    className="flex-1"
                  />
                  {draft.modeNames.length > 1 ? (
                    <IconButton
                      type="button"
                      onClick={() => onRemoveMode(index)}
                      disabled={pending}
                      aria-label={`Remove ${modeName.trim() || `mode ${index + 1}`}`}
                      title={`Remove ${modeName.trim() || `mode ${index + 1}`}`}
                      size="sm"
                    >
                      <X size={12} strokeWidth={1.5} aria-hidden />
                    </IconButton>
                  ) : null}
                </div>
              </Field>
            );
          })}
        </div>

        <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Every token in this collection has one value per mode.
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
