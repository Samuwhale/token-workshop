import { useMemo, useState } from "react";
import type {
  RecipeType,
  RecipeConfig,
  GeneratedTokenResult,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleConfig,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
} from "../../hooks/useRecipes";
import type { TokenMapEntry } from "../../../shared/types";
import type { OverwrittenEntry } from "../../hooks/useAutomationPreview";
import { StepWhere, type StepWhereProps } from "./StepWhere";
import { ColorRampConfigEditor, ColorSwatchPreview } from "../recipes/ColorRampRecipe";
import { TypeScaleConfigEditor, TypeScalePreview } from "../recipes/TypeScaleRecipe";
import { SpacingScaleConfigEditor, SpacingPreview } from "../recipes/SpacingScaleRecipe";
import { OpacityScaleConfigEditor, OpacityPreview } from "../recipes/OpacityScaleRecipe";
import { ShadowScaleConfigEditor, ShadowPreview } from "../recipes/ShadowScaleRecipe";
import { BorderRadiusConfigEditor, BorderRadiusPreview } from "../recipes/BorderRadiusRecipe";
import { ZIndexConfigEditor } from "../recipes/ZIndexRecipe";
import { CustomScaleConfigEditor } from "../recipes/CustomScaleRecipe";
import { AccessiblePairConfigEditor } from "../recipes/AccessiblePairRecipe";
import { DarkModeInversionConfigEditor } from "../recipes/DarkModeInversionRecipe";
import { GenericPreview } from "../recipes/recipeShared";
import { TYPE_LABELS } from "../recipes/recipeUtils";
import { UnifiedSourceInput } from "../UnifiedSourceInput";
import { Spinner } from "../Spinner";
import { AUTHORING } from "../../shared/editorClasses";
import { cloneStarterConfigForRecipeType, GRAPH_TEMPLATES, type GraphTemplate } from "../graph-templates";

function TemplateSuggestion({
  template,
  onApply,
  onDismiss,
}: {
  template: GraphTemplate;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/5 px-2.5 py-1.5 text-[10px]">
      <span className="min-w-0 flex-1 truncate text-[var(--color-figma-text)]">
        Start from <span className="font-medium">{template.label}</span>?
      </span>
      <button
        type="button"
        onClick={onApply}
        className="shrink-0 font-medium text-[var(--color-figma-accent)] hover:underline"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
      >
        &times;
      </button>
    </div>
  );
}

export interface StepSourceProps {
  isEditing: boolean;
  selectedType: RecipeType;
  currentConfig: RecipeConfig;
  typeNeedsValue: boolean;
  hasValue: boolean;
  sourceTokenPath?: string;
  sourceTokenValue?: any;
  inlineValue: unknown;
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  lockedCount: number;
  overwrittenEntries: OverwrittenEntry[];
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onConfigInteractionStart: () => void;
  onConfigChange: (type: RecipeType, cfg: RecipeConfig) => void;
  onSourcePathChange: (value: string) => void;
  onInlineValueChange: (value: unknown) => void;
  onOverrideChange: (
    stepName: string,
    value: string,
    locked: boolean,
  ) => void;
  onOverrideClear: (stepName: string) => void;
  onClearAllOverrides: () => void;
  destination?: StepWhereProps;
  detachedCount?: number;
  collectionModeLabel?: string | null;
}

export function StepSource({
  isEditing,
  selectedType,
  currentConfig,
  typeNeedsValue,
  hasValue,
  sourceTokenPath,
  sourceTokenValue,
  inlineValue,
  previewTokens,
  previewLoading,
  previewError,
  pendingOverrides,
  lockedCount,
  overwrittenEntries,
  allTokensFlat,
  pathToCollectionId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onConfigInteractionStart,
  onConfigChange,
  onSourcePathChange,
  onInlineValueChange,
  onOverrideChange,
  onOverrideClear,
  onClearAllOverrides,
  destination,
  detachedCount = 0,
  collectionModeLabel = null,
}: StepSourceProps) {
  const [templateDismissed, setTemplateDismissed] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map((entry) => entry.path)),
    [overwrittenEntries],
  );

  const effectiveSourceHex =
    typeof sourceTokenValue === "string"
      ? sourceTokenValue
      : typeof inlineValue === "string"
        ? inlineValue
        : undefined;
  const effectiveSourceDim = (() => {
    if (
      typeof sourceTokenValue === "object" &&
      sourceTokenValue !== null &&
      "value" in sourceTokenValue
    ) {
      return Number(sourceTokenValue.value);
    }
    if (typeof sourceTokenValue === "number") {
      return sourceTokenValue;
    }
    if (
      typeof inlineValue === "object" &&
      inlineValue !== null &&
      "value" in (inlineValue as Record<string, unknown>)
    ) {
      return Number((inlineValue as { value: number }).value);
    }
    return undefined;
  })();

  const typeExpectsColor =
    selectedType === "colorRamp" ||
    selectedType === "accessibleColorPair" ||
    selectedType === "darkModeInversion";
  const typeExpectsDimension =
    selectedType === "typeScale" ||
    selectedType === "spacingScale" ||
    selectedType === "borderRadiusScale";
  const matchingTemplate =
    !isEditing && !templateDismissed
      ? GRAPH_TEMPLATES.find((template) => template.recipeType === selectedType)
      : undefined;

  const renderPreview = () => {
    if (selectedType === "colorRamp") {
      return (
        <ColorSwatchPreview
          tokens={previewTokens}
          overrides={pendingOverrides}
          onOverrideChange={onOverrideChange}
          onOverrideClear={onOverrideClear}
          overwritePaths={overwritePaths}
        />
      );
    }
    if (selectedType === "typeScale") {
      return (
        <TypeScalePreview
          tokens={previewTokens}
          overrides={pendingOverrides}
          onOverrideChange={onOverrideChange}
          onOverrideClear={onOverrideClear}
          overwritePaths={overwritePaths}
        />
      );
    }
    if (selectedType === "spacingScale") {
      return (
        <SpacingPreview
          tokens={previewTokens}
          overrides={pendingOverrides}
          onOverrideChange={onOverrideChange}
          onOverrideClear={onOverrideClear}
          overwritePaths={overwritePaths}
        />
      );
    }
    if (selectedType === "borderRadiusScale") {
      return (
        <BorderRadiusPreview
          tokens={previewTokens}
          overrides={pendingOverrides}
          onOverrideChange={onOverrideChange}
          onOverrideClear={onOverrideClear}
          overwritePaths={overwritePaths}
        />
      );
    }
    if (selectedType === "opacityScale") {
      return (
        <OpacityPreview
          tokens={previewTokens}
          overrides={pendingOverrides}
          onOverrideChange={onOverrideChange}
          onOverrideClear={onOverrideClear}
          overwritePaths={overwritePaths}
        />
      );
    }
    if (selectedType === "shadowScale") {
      return (
        <ShadowPreview
          tokens={previewTokens}
          config={currentConfig as ShadowScaleConfig}
          overrides={pendingOverrides}
          onOverrideChange={onOverrideChange}
          onOverrideClear={onOverrideClear}
          overwritePaths={overwritePaths}
        />
      );
    }
    return (
      <GenericPreview
        tokens={previewTokens}
        overrides={pendingOverrides}
        onOverrideChange={onOverrideChange}
        onOverrideClear={onOverrideClear}
        overwritePaths={overwritePaths}
      />
    );
  };

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      {matchingTemplate && (
        <TemplateSuggestion
          template={matchingTemplate}
          onApply={() => {
            const starterConfig = cloneStarterConfigForRecipeType(selectedType);
            if (starterConfig) {
              onConfigInteractionStart();
              onConfigChange(selectedType, starterConfig);
            }
            setTemplateDismissed(true);
          }}
          onDismiss={() => setTemplateDismissed(true)}
        />
      )}

      {typeNeedsValue && (
        <div className={AUTHORING.recipeSectionCard}>
          <UnifiedSourceInput
            expectedType={
              typeExpectsColor ? "color" : typeExpectsDimension ? "dimension" : null
            }
            sourceTokenPath={sourceTokenPath}
            sourceTokenValue={sourceTokenValue}
            inlineValue={inlineValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            onSourcePathChange={onSourcePathChange}
            onInlineValueChange={onInlineValueChange}
          />
        </div>
      )}

      <div className={AUTHORING.recipeSectionCard}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            {TYPE_LABELS[selectedType]}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                const starterConfig = cloneStarterConfigForRecipeType(selectedType);
                if (starterConfig) {
                  onConfigInteractionStart();
                  onConfigChange(selectedType, starterConfig);
                }
              }}
              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              title="Reset to defaults"
            >
              Reset
            </button>
            {(canUndo || canRedo) && (
              <>
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo"
                  aria-label="Undo"
                  className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-opacity hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-20"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5h5a2.5 2.5 0 0 1 0 5H6" /><path d="M5 2.5L3 4.5 5 6.5" /></svg>
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo"
                  aria-label="Redo"
                  className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-opacity hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-20"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4.5H4a2.5 2.5 0 0 0 0 5h2" /><path d="M7 2.5l2 2-2 2" /></svg>
                </button>
              </>
            )}
          </div>
        </div>

        {selectedType === "colorRamp" && (
          <ColorRampConfigEditor
            config={currentConfig as ColorRampConfig}
            onChange={(config) => onConfigChange("colorRamp", config)}
            onInteractionStart={onConfigInteractionStart}
            sourceHex={effectiveSourceHex}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
        {selectedType === "typeScale" && (
          <TypeScaleConfigEditor
            config={currentConfig as TypeScaleConfig}
            onChange={(config) => onConfigChange("typeScale", config)}
            onInteractionStart={onConfigInteractionStart}
            sourceValue={effectiveSourceDim}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
        {selectedType === "spacingScale" && (
          <SpacingScaleConfigEditor
            config={currentConfig as SpacingScaleConfig}
            onChange={(config) => onConfigChange("spacingScale", config)}
            onInteractionStart={onConfigInteractionStart}
          />
        )}
        {selectedType === "opacityScale" && (
          <OpacityScaleConfigEditor
            config={currentConfig as OpacityScaleConfig}
            onChange={(config) => onConfigChange("opacityScale", config)}
          />
        )}
        {selectedType === "shadowScale" && (
          <ShadowScaleConfigEditor
            config={currentConfig as ShadowScaleConfig}
            onChange={(config) => onConfigChange("shadowScale", config)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
        {selectedType === "borderRadiusScale" && (
          <BorderRadiusConfigEditor
            config={currentConfig as BorderRadiusScaleConfig}
            onChange={(config) => onConfigChange("borderRadiusScale", config)}
          />
        )}
        {selectedType === "zIndexScale" && (
          <ZIndexConfigEditor
            config={currentConfig as ZIndexScaleConfig}
            onChange={(config) => onConfigChange("zIndexScale", config)}
          />
        )}
        {selectedType === "customScale" && (
          <CustomScaleConfigEditor
            config={currentConfig as CustomScaleConfig}
            onChange={(config) => onConfigChange("customScale", config)}
          />
        )}
        {selectedType === "accessibleColorPair" && (
          <AccessiblePairConfigEditor
            config={currentConfig as AccessibleColorPairConfig}
            onChange={(config) => onConfigChange("accessibleColorPair", config)}
          />
        )}
        {selectedType === "darkModeInversion" && (
          <DarkModeInversionConfigEditor
            config={currentConfig as DarkModeInversionConfig}
            onChange={(config) => onConfigChange("darkModeInversion", config)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
      </div>

      <div className={AUTHORING.recipeSectionCard}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            Preview
          </span>
          <div className="flex items-center gap-2">
            {destination && collectionModeLabel && (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Mode: {collectionModeLabel}
              </span>
            )}
            {previewLoading && (
              <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
            )}
          </div>
        </div>

        {previewError && (
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
            {previewError}
          </div>
        )}

        {!previewError && previewTokens.length > 0 && (
          <div className={`rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5 transition-opacity duration-150 ${previewLoading ? "opacity-40" : "opacity-100"}`}>
            {renderPreview()}
          </div>
        )}

        {!previewError && !previewLoading && previewTokens.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-4 text-center text-[10px] text-[var(--color-figma-text-secondary)]">
            {typeNeedsValue && !hasValue
              ? `Enter a base ${typeExpectsColor ? "color" : "value"} to preview.`
              : "Adjust settings to preview."}
          </div>
        )}

        {lockedCount > 0 && (
          <button
            type="button"
            onClick={onClearAllOverrides}
            className="mt-1.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-error)]"
          >
            Clear {lockedCount} manual exception{lockedCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {destination && (
        <div className={AUTHORING.recipeSectionCard}>
          {detachedCount > 0 && (
            <div className="mb-2 rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2.5 py-1.5 text-[10px] text-[var(--color-figma-text)]">
              {detachedCount} detached output{detachedCount === 1 ? "" : "s"}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOutputExpanded((value) => !value)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <svg
                width="8"
                height="8"
                viewBox="0 0 10 10"
                fill="currentColor"
                className={`shrink-0 text-[var(--color-figma-text-secondary)] transition-transform ${outputExpanded ? "rotate-90" : ""}`}
              >
                <path d="M3 1.5l4 3.5-4 3.5V1.5z" />
              </svg>
              <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                Generated group
              </span>
            </div>
            {!outputExpanded && (
              <span className="max-w-[60%] truncate text-right font-mono text-[10px] text-[var(--color-figma-text-secondary)]">
                {destination.targetGroup || "Set group"}
              </span>
            )}
          </button>
          {outputExpanded && (
            <div className="mt-3">
              <StepWhere {...destination} inline />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
