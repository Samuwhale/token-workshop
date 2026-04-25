import { useMemo } from "react";
import type {
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleConfig,
  CustomScaleConfig,
  DarkModeInversionConfig,
} from "../../hooks/useGenerators";
import type { TokenMapEntry } from "../../../shared/types";
import type { OverwrittenEntry } from "../../hooks/useGeneratedGroupPreview";
import { StepWhere, type StepWhereProps } from "./StepWhere";
import { ColorRampConfigEditor, ColorSwatchPreview } from "../generators/ColorRampGenerator";
import { TypeScaleConfigEditor, TypeScalePreview } from "../generators/TypeScaleGenerator";
import { SpacingScaleConfigEditor, SpacingPreview } from "../generators/SpacingScaleGenerator";
import { OpacityScaleConfigEditor, OpacityPreview } from "../generators/OpacityScaleGenerator";
import { ShadowScaleConfigEditor, ShadowPreview } from "../generators/ShadowScaleGenerator";
import { BorderRadiusConfigEditor, BorderRadiusPreview } from "../generators/BorderRadiusGenerator";
import { ZIndexConfigEditor } from "../generators/ZIndexGenerator";
import { CustomScaleConfigEditor } from "../generators/CustomScaleGenerator";
import { DarkModeInversionConfigEditor } from "../generators/DarkModeInversionGenerator";
import { GenericPreview } from "../generators/generatorShared";
import { TYPE_LABELS } from "../generators/generatorUtils";
import { UnifiedSourceInput } from "../UnifiedSourceInput";
import { Spinner } from "../Spinner";
import { AUTHORING } from "../../shared/editorClasses";
import { cloneStarterConfigForGeneratorType } from "../graph-templates";

export interface StepSourceProps {
  selectedType: GeneratorType;
  currentConfig: GeneratorConfig;
  typeNeedsValue: boolean;
  hasValue: boolean;
  sourceTokenPath?: string;
  sourceCollectionId?: string;
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
  collectionIdsByPath?: Record<string, string[]>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onConfigInteractionStart: () => void;
  onConfigChange: (type: GeneratorType, cfg: GeneratorConfig) => void;
  onSourcePathChange: (
    value: string,
    options?: { collectionId?: string },
  ) => void;
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
  selectedType,
  currentConfig,
  typeNeedsValue,
  hasValue,
  sourceTokenPath,
  sourceCollectionId,
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
  collectionIdsByPath,
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
  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map((entry) => entry.path)),
    [overwrittenEntries],
  );
  const shouldNudgeExceptionCleanup = lockedCount >= 3;

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
    selectedType === "darkModeInversion";
  const typeExpectsDimension =
    selectedType === "typeScale" ||
    selectedType === "spacingScale" ||
    selectedType === "borderRadiusScale";

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
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      {typeNeedsValue && (
        <div className={AUTHORING.generatorSectionCard}>
          <UnifiedSourceInput
            expectedType={
              typeExpectsColor ? "color" : typeExpectsDimension ? "dimension" : null
            }
            sourceTokenPath={sourceTokenPath}
            sourceCollectionId={sourceCollectionId}
            sourceTokenValue={sourceTokenValue}
            inlineValue={inlineValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            collectionIdsByPath={collectionIdsByPath}
            onSourcePathChange={onSourcePathChange}
            onInlineValueChange={onInlineValueChange}
          />
        </div>
      )}

      {destination && (
        <div className={AUTHORING.generatorSectionCard}>
          {detachedCount > 0 && (
            <div className="mb-3 rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2.5 py-1.5 text-secondary text-[var(--color-figma-text)]">
              {detachedCount} detached token{detachedCount === 1 ? "" : "s"}
            </div>
          )}
          <StepWhere {...destination} />
        </div>
      )}

      <div className={AUTHORING.generatorSectionCard}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
            {TYPE_LABELS[selectedType]}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                const starterConfig = cloneStarterConfigForGeneratorType(selectedType);
                if (starterConfig) {
                  onConfigInteractionStart();
                  onConfigChange(selectedType, starterConfig);
                }
              }}
              className="rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
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
        {selectedType === "darkModeInversion" && (
          <DarkModeInversionConfigEditor
            config={currentConfig as DarkModeInversionConfig}
            onChange={(config) => onConfigChange("darkModeInversion", config)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
      </div>

      <div className={AUTHORING.generatorSectionCard}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
            Preview
          </span>
          <div className="flex items-center gap-2">
            {destination && collectionModeLabel && (
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                Mode: {collectionModeLabel}
              </span>
            )}
            {previewLoading && (
              <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
            )}
          </div>
        </div>

        {previewError && (
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-error)]">
            {previewError}
          </div>
        )}

        {!previewError && previewTokens.length > 0 && (
          <div className={`rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5 transition-opacity duration-150 ${previewLoading ? "opacity-40" : "opacity-100"}`}>
            {renderPreview()}
          </div>
        )}

        {!previewError && !previewLoading && previewTokens.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-4 text-center text-secondary text-[var(--color-figma-text-secondary)]">
            {typeNeedsValue && !hasValue
              ? `Enter a base ${typeExpectsColor ? "color" : "value"} to preview.`
              : "Adjust settings to preview."}
          </div>
        )}

        {lockedCount > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onClearAllOverrides}
              className="self-start text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-error)]"
            >
              Clear {lockedCount} manual exception{lockedCount === 1 ? "" : "s"}
            </button>
            {shouldNudgeExceptionCleanup && (
              <div className="rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2.5 py-2 text-secondary text-[var(--color-figma-text)]">
                Manual exceptions are starting to pile up in this group. Edit the generator or detach tokens that should stay manual.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
