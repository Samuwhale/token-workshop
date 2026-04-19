import { useMemo, useState, type ReactNode } from "react";
import type {
  GeneratedTokenResult,
  GeneratorSemanticLayer,
  GeneratorType,
  SemanticTokenMapping,
} from "../../hooks/useGenerators";
import { AUTHORING } from "../../shared/editorClasses";
import { SemanticMappingDialog } from "../SemanticMappingDialog";

export interface StepWhereProps {
  name: string;
  targetCollection: string;
  targetGroup: string;
  keepUpdated: boolean;
  keepUpdatedDisabled?: boolean;
  keepUpdatedHint?: string | null;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: SemanticTokenMapping[];
  selectedSemanticPatternId: string | null;
  previewTokens: GeneratedTokenResult[];
  selectedType: GeneratorType;
  onNameChange: (value: string) => void;
  onTargetGroupChange: (value: string) => void;
  onKeepUpdatedChange: (value: boolean) => void;
  onSemanticLayerChange: (layer: GeneratorSemanticLayer | null) => void;
  inline?: boolean;
}

function SettingRow({
  label,
  description,
  action,
}: {
  label: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
          {label}
        </p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
          {description}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function StepWhere({
  name,
  targetCollection,
  targetGroup,
  keepUpdated,
  keepUpdatedDisabled = false,
  keepUpdatedHint = null,
  semanticEnabled,
  semanticPrefix,
  semanticMappings,
  selectedSemanticPatternId,
  previewTokens,
  selectedType,
  onNameChange,
  onTargetGroupChange,
  onKeepUpdatedChange,
  onSemanticLayerChange,
  inline = false,
}: StepWhereProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [semanticEditorOpen, setSemanticEditorOpen] = useState(false);
  const aliasSummary = useMemo(() => {
    const validCount = semanticMappings.filter(
      (mapping) => mapping.semantic.trim() && mapping.step,
    ).length;
    if (!semanticEnabled || validCount === 0) {
      return "No alias layer configured.";
    }
    return `${validCount} alias${validCount === 1 ? "" : "es"} in ${semanticPrefix}.`;
  }, [semanticEnabled, semanticMappings, semanticPrefix]);

  const fields = (
    <div className="flex flex-col gap-3">
      <div className={`${inline ? "" : AUTHORING.generatorSectionCard} ${AUTHORING.generatorFieldGrid}`}>
        <div className={AUTHORING.generatorFieldStack}>
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
            className={`${AUTHORING.generatorControlMono} ${
              !targetGroup.trim()
                ? "border-[var(--color-figma-error)]/50"
                : "border-[var(--color-figma-border)]"
            }`}
          />
        </div>
      </div>

      <div className={inline ? "" : AUTHORING.generatorSectionCard}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Collection
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              Tokens will be created in this collection.
            </p>
          </div>
          <span className="text-[10px] font-mono text-[var(--color-figma-text)]">
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
          {advancedOpen ? "Hide advanced settings" : "Advanced settings"}
        </button>

        {advancedOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <div className={AUTHORING.generatorFieldStack}>
              <label
                htmlFor="step-where-group-label"
                className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]"
              >
                Group label
              </label>
              <input
                id="step-where-group-label"
                type="text"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Brand palette"
                className={`${AUTHORING.generatorControl} border-[var(--color-figma-border)]`}
              />
            </div>

            <SettingRow
              label="Keep updated"
              description={
                keepUpdatedHint ??
                "When on, source token changes can refresh this generated group automatically."
              }
              action={
                <button
                  type="button"
                  onClick={() => onKeepUpdatedChange(!keepUpdated)}
                  disabled={keepUpdatedDisabled}
                  className={`rounded border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    keepUpdated && !keepUpdatedDisabled
                      ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                      : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:opacity-60"
                  }`}
                >
                  {keepUpdatedDisabled
                    ? "Unavailable"
                    : keepUpdated
                      ? "On"
                      : "Off"}
                </button>
              }
            />

            <SettingRow
              label="Alias layer"
              description={aliasSummary}
              action={
                <button
                  type="button"
                  onClick={() => setSemanticEditorOpen((value) => !value)}
                  disabled={previewTokens.length === 0}
                  className="rounded border border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {semanticEnabled ? "Edit aliases" : "Set up aliases"}
                </button>
              }
            />

            {semanticEditorOpen && (
              <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3">
                <SemanticMappingDialog
                  serverUrl=""
                  generatedTokens={previewTokens}
                  generatorType={selectedType}
                  targetGroup={targetGroup}
                  targetCollection={targetCollection}
                  initialPrefix={semanticPrefix}
                  initialMappings={semanticMappings}
                  initialPatternId={selectedSemanticPatternId}
                  onClose={() => setSemanticEditorOpen(false)}
                  onSaveLayer={(layer) => {
                    onSemanticLayerChange(layer);
                  }}
                  presentation="panel"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return fields;
  }

  return (
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      {fields}
    </section>
  );
}
