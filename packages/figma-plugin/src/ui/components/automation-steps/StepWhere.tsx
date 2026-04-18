import { useState } from "react";
import { AUTHORING } from "../../shared/editorClasses";

export interface StepWhereProps {
  name: string;
  targetCollection: string;
  targetGroup: string;
  onNameChange: (value: string) => void;
  onTargetGroupChange: (value: string) => void;
  inline?: boolean;
}

export function StepWhere({
  name,
  targetCollection,
  targetGroup,
  onNameChange,
  onTargetGroupChange,
  inline = false,
}: StepWhereProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fields = (
    <div className="flex flex-col gap-3">
      <div className={`${inline ? "" : AUTHORING.recipeSectionCard} ${AUTHORING.recipeFieldGrid}`}>
        <div className={AUTHORING.recipeFieldStack}>
          <label
            htmlFor="step-where-target-group"
            className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]"
          >
            Group
          </label>
          <input
            id="step-where-target-group"
            type="text"
            value={targetGroup}
            onChange={(event) => onTargetGroupChange(event.target.value)}
            placeholder="color.brand"
            autoFocus={!inline}
            className={`${AUTHORING.recipeControlMono} ${
              !targetGroup.trim()
                ? "border-[var(--color-figma-error)]/50"
                : "border-[var(--color-figma-border)]"
            }`}
          />
        </div>
      </div>

      <div className={inline ? "" : AUTHORING.recipeSectionCard}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Collection
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              Generated tokens stay in this collection.
            </p>
          </div>
          <span className="rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[10px] font-mono text-[var(--color-figma-text)]">
            {targetCollection}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((value) => !value)}
          className={`mt-3 text-[10px] transition-colors ${
            advancedOpen
              ? "text-[var(--color-figma-text)]"
              : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
          }`}
        >
          {advancedOpen ? "Hide generator settings" : "Generator settings"}
        </button>

        {advancedOpen && (
          <div className="mt-3 flex flex-col gap-3 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 p-3">
            <div className={AUTHORING.recipeFieldStack}>
              <label
                htmlFor="step-where-generator-name"
                className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]"
              >
                Generator name
              </label>
              <input
                id="step-where-generator-name"
                type="text"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Brand palette"
                className={`${AUTHORING.recipeControl} ${
                  !name.trim()
                    ? "border-[var(--color-figma-error)]/50"
                    : "border-[var(--color-figma-border)]"
                }`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return fields;
  }

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      {fields}
    </section>
  );
}
