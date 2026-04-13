import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type {
  ColorRampConfig,
  GeneratedTokenResult,
  GeneratorType,
  SpacingScaleConfig,
  TypeScaleConfig,
} from "../hooks/useGenerators";
import {
  createGeneratorDraftFromTemplate,
  useGeneratorDialog,
  type GeneratorDialogInitialDraft,
} from "../hooks/useGeneratorDialog";
import type { UndoSlot } from "../hooks/useUndo";
import { formatValue, isDimensionLike } from "./generators/generatorShared";
import { COLOR_STEP_PRESETS } from "./generators/ColorRampGenerator";
import { SPACING_STEP_PRESETS } from "./generators/SpacingScaleGenerator";
import {
  TYPE_RATIO_PRESETS,
  TYPE_STEP_PRESETS,
} from "./generators/TypeScaleGenerator";
import { GRAPH_TEMPLATES, type GraphTemplate } from "./graph-templates";
import { GeneratorIntentCatalog } from "./TemplatePicker";

const POPOVER_CLASS =
  "fixed z-50 w-[360px] max-w-[calc(100vw-16px)] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl";
const SEGMENT_BUTTON_CLASS =
  "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors";

interface QuickGeneratorPopoverProps {
  serverUrl: string;
  position: { x: number; y: number };
  generatorType: GeneratorType;
  sourceTokenPath: string;
  sourceTokenName: string;
  sourceTokenType?: string;
  sourceTokenValue?: unknown;
  activeSet: string;
  onClose: () => void;
  onCreated: (info?: { targetGroup: string }) => void;
  onOpenAdvanced: (draft: GeneratorDialogInitialDraft) => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

function getStepValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (isDimensionLike(value)) return value.value;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function DimensionPreviewStrip({ tokens }: { tokens: GeneratedTokenResult[] }) {
  const maxValue = Math.max(1, ...tokens.map((token) => getStepValue(token.value)));
  return (
    <div className="space-y-1.5">
      {tokens.map((token) => {
        const numeric = getStepValue(token.value);
        const width = Math.max(8, (numeric / maxValue) * 100);
        return (
          <div key={token.path} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[9px] font-mono text-[var(--color-figma-text-secondary)] text-right">
              {token.stepName}
            </span>
            <div className="h-2 flex-1 rounded-full bg-[var(--color-figma-bg-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--color-figma-accent)]/70"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-[9px] font-mono text-[var(--color-figma-text-tertiary)] text-right">
              {formatValue(token.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GenericPreviewStrip({ tokens }: { tokens: GeneratedTokenResult[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.map((token) => (
        <div
          key={token.path}
          className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1"
        >
          <div className="text-[9px] font-mono text-[var(--color-figma-text-secondary)]">
            {token.stepName}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text)]">
            {formatValue(token.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewStrip({
  type,
  tokens,
}: {
  type: GeneratorType;
  tokens: GeneratedTokenResult[];
}) {
  if (type === "colorRamp") {
    return (
      <div className="flex gap-0.5 overflow-hidden rounded-md">
        {tokens.map((token) => (
          <div
            key={token.path}
            className="flex h-14 flex-1 min-w-0 items-end justify-center pb-1"
            style={{ background: String(token.value) }}
            title={`${token.stepName}: ${formatValue(token.value)}`}
          >
            <span className="rounded-sm bg-black/20 px-1 py-0.5 text-[8px] font-mono text-white">
              {token.stepName}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (
    type === "typeScale" ||
    type === "spacingScale" ||
    type === "borderRadiusScale"
  ) {
    return <DimensionPreviewStrip tokens={tokens} />;
  }

  return <GenericPreviewStrip tokens={tokens} />;
}

function QuickGeneratorIntentPicker({
  position,
  sourceTokenPath,
  sourceTokenType,
  recommendedType,
  onClose,
  onSelectTemplate,
  popoverRef,
}: {
  position: { x: number; y: number };
  sourceTokenPath: string;
  sourceTokenType?: string;
  recommendedType?: GeneratorType;
  onClose: () => void;
  onSelectTemplate: (template: GraphTemplate) => void;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={popoverRef as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-modal="false"
      aria-label="Quick generator intent picker"
      className={POPOVER_CLASS}
      style={{ top: position.y, left: position.x }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-figma-border)] px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            Create from current token
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Pick the outcome you want before opening the shared composer.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          aria-label="Close quick generator"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
            Source token
          </div>
          <div className="mt-0.5 text-[11px] font-mono text-[var(--color-figma-text)]">
            {sourceTokenPath}
          </div>
          {sourceTokenType && (
            <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              Current type: <span className="font-medium">{sourceTokenType}</span>
            </div>
          )}
        </div>

        <div className="max-h-[min(70vh,520px)] overflow-y-auto pr-0.5">
          <GeneratorIntentCatalog
            templates={GRAPH_TEMPLATES}
            connected
            onSelectTemplate={onSelectTemplate}
            sourceTokenType={sourceTokenType}
            recommendedType={recommendedType}
            compact
          />
        </div>
      </div>
    </div>
  );
}

function QuickGeneratorSetup({
  serverUrl,
  position,
  template,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  sourceTokenValue,
  activeSet,
  onBack,
  onClose,
  onCreated,
  onOpenAdvanced,
  onPushUndo,
  popoverRef,
}: {
  serverUrl: string;
  position: { x: number; y: number };
  template: GraphTemplate;
  sourceTokenPath: string;
  sourceTokenName: string;
  sourceTokenType?: string;
  sourceTokenValue?: unknown;
  activeSet: string;
  onBack: () => void;
  onClose: () => void;
  onCreated: (info?: { targetGroup: string }) => void;
  onOpenAdvanced: (draft: GeneratorDialogInitialDraft) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  const initialDraft = useMemo(
    () =>
      createGeneratorDraftFromTemplate(template, activeSet, {
        sourceTokenPath,
        sourceTokenName,
      }),
    [activeSet, sourceTokenName, sourceTokenPath, template],
  );

  const dialog = useGeneratorDialog({
    serverUrl,
    sourceTokenPath,
    sourceTokenName,
    sourceTokenType,
    sourceTokenValue,
    activeSet,
    initialDraft,
    onSaved: (info) => onCreated(info),
    pushUndo: onPushUndo,
  });

  const advancedDraft = useMemo<GeneratorDialogInitialDraft>(
    () => ({
      selectedType: dialog.selectedType,
      name: dialog.name,
      nameIsAuto: false,
      targetSet: dialog.targetSet,
      targetGroup: dialog.targetGroup,
      inlineValue: dialog.inlineValue,
      configs: {
        [dialog.selectedType]: dialog.currentConfig,
      },
      pendingOverrides: dialog.pendingOverrides,
      semanticEnabled: dialog.semanticEnabled,
      semanticPrefix: dialog.semanticPrefix,
      semanticMappings: dialog.semanticMappings,
      selectedSemanticPatternId: dialog.selectedSemanticPatternId,
    }),
    [
      dialog.currentConfig,
      dialog.inlineValue,
      dialog.name,
      dialog.pendingOverrides,
      dialog.selectedType,
      dialog.semanticEnabled,
      dialog.semanticMappings,
      dialog.semanticPrefix,
      dialog.selectedSemanticPatternId,
      dialog.targetGroup,
      dialog.targetSet,
    ],
  );

  const colorConfig =
    dialog.selectedType === "colorRamp"
      ? (dialog.currentConfig as ColorRampConfig)
      : null;
  const typeConfig =
    dialog.selectedType === "typeScale"
      ? (dialog.currentConfig as TypeScaleConfig)
      : null;
  const spacingConfig =
    dialog.selectedType === "spacingScale"
      ? (dialog.currentConfig as SpacingScaleConfig)
      : null;

  const canCreate =
    dialog.targetGroup.trim().length > 0 &&
    dialog.name.trim().length > 0 &&
    (!dialog.typeNeedsValue || dialog.hasValue);

  return (
    <div
      ref={popoverRef as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-modal="false"
      aria-label={`Quick ${template.label}`}
      className={POPOVER_CLASS}
      style={{ top: position.y, left: position.x }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-figma-border)] px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Back to generator intents"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M7.5 9.5L4 6l3.5-3.5" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              {template.label}
            </div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {template.starterPreset}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          aria-label="Close quick generator"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="max-h-[min(70vh,540px)] space-y-3 overflow-y-auto px-3 py-3">
        <div className="space-y-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
              Source token
            </div>
            <div className="mt-0.5 text-[11px] font-mono text-[var(--color-figma-text)]">
              {sourceTokenPath}
            </div>
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {template.whenToUse}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
                Target set
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--color-figma-text)]">
                {dialog.targetSet}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
                Target group
              </div>
              <div className="mt-0.5 text-[10px] font-mono text-[var(--color-figma-text)]">
                {dialog.targetGroup}
              </div>
            </div>
          </div>
        </div>

        {colorConfig && (
          <>
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">
                Steps
              </div>
              <div className="flex flex-wrap gap-1">
                {COLOR_STEP_PRESETS.map((preset) => {
                  const active =
                    preset.steps.length === colorConfig.steps.length &&
                    preset.steps.every(
                      (step, index) => step === colorConfig.steps[index],
                    );
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.description}
                      onClick={() =>
                        dialog.handleConfigChange("colorRamp", {
                          ...colorConfig,
                          steps: [...preset.steps],
                        })
                      }
                      className={`${SEGMENT_BUTTON_CLASS} ${
                        active
                          ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                          : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                  Light end
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={80}
                    max={99}
                    step={1}
                    value={colorConfig.lightEnd}
                    onChange={(event) =>
                      dialog.handleConfigChange("colorRamp", {
                        ...colorConfig,
                        lightEnd: Number(event.target.value),
                      })
                    }
                    className="flex-1 accent-[var(--color-figma-accent)]"
                  />
                  <span className="w-7 text-right text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                    {colorConfig.lightEnd}
                  </span>
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                  Dark end
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={1}
                    value={colorConfig.darkEnd}
                    onChange={(event) =>
                      dialog.handleConfigChange("colorRamp", {
                        ...colorConfig,
                        darkEnd: Number(event.target.value),
                      })
                    }
                    className="flex-1 accent-[var(--color-figma-accent)]"
                  />
                  <span className="w-7 text-right text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                    {colorConfig.darkEnd}
                  </span>
                </div>
              </label>
            </div>
          </>
        )}

        {typeConfig && (
          <>
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">
                Ratio preset
              </div>
              <div className="flex flex-wrap gap-1">
                {TYPE_RATIO_PRESETS.map((preset) => {
                  const active = Math.abs(typeConfig.ratio - preset.value) < 0.0001;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      title={preset.description}
                      onClick={() =>
                        dialog.handleConfigChange("typeScale", {
                          ...typeConfig,
                          ratio: preset.value,
                        })
                      }
                      className={`${SEGMENT_BUTTON_CLASS} ${
                        active
                          ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                          : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">
                Steps preset
              </div>
              <div className="flex flex-wrap gap-1">
                {TYPE_STEP_PRESETS.map((preset) => {
                  const active =
                    preset.steps.length === typeConfig.steps.length &&
                    preset.steps.every(
                      (step, index) => step.name === typeConfig.steps[index]?.name,
                    );
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.description}
                      onClick={() =>
                        dialog.handleConfigChange("typeScale", {
                          ...typeConfig,
                          steps: preset.steps.map((step) => ({ ...step })),
                          baseStep:
                            preset.steps.find((step) => step.exponent === 0)?.name ??
                            preset.steps[Math.floor(preset.steps.length / 2)]?.name ??
                            typeConfig.baseStep,
                        })
                      }
                      className={`${SEGMENT_BUTTON_CLASS} ${
                        active
                          ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                          : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {spacingConfig && (
          <div>
            <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">
              Steps preset
            </div>
            <div className="flex flex-wrap gap-1">
              {SPACING_STEP_PRESETS.map((preset) => {
                const active =
                  preset.steps.length === spacingConfig.steps.length &&
                  preset.steps.every(
                    (step, index) => step.name === spacingConfig.steps[index]?.name,
                  );
                return (
                  <button
                    key={preset.label}
                    type="button"
                    title={preset.description}
                    onClick={() =>
                      dialog.handleConfigChange("spacingScale", {
                        ...spacingConfig,
                        steps: preset.steps.map((step) => ({ ...step })),
                      })
                    }
                    className={`${SEGMENT_BUTTON_CLASS} ${
                      active
                        ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                        : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Preview
            </div>
            {dialog.previewLoading && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                Updating…
              </span>
            )}
          </div>
          <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
            {dialog.previewError ? (
              <div className="text-[10px] text-[var(--color-figma-error)]">
                {dialog.previewError}
              </div>
            ) : dialog.previewTokens.length > 0 ? (
              <PreviewStrip type={dialog.selectedType} tokens={dialog.previewTokens} />
            ) : (
              <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                Waiting for a preview from the generator service.
              </div>
            )}
          </div>
        </div>

        {dialog.semanticEnabled && dialog.semanticMappings.length > 0 && (
          <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Semantic starters
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              {dialog.semanticMappings.length} alias
              {dialog.semanticMappings.length === 1 ? "" : "es"} will save under{" "}
              <span className="font-mono text-[var(--color-figma-text)]">
                {dialog.semanticPrefix}.*
              </span>
              .
            </div>
          </div>
        )}

        {dialog.saveError && (
          <div className="rounded-md border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/8 px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
            {dialog.saveError}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-figma-border)] px-3 py-2.5">
        <button
          type="button"
          onClick={() => onOpenAdvanced(advancedDraft)}
          className="text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
        >
          Advanced options…
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate || dialog.saving}
            onClick={() => {
              void dialog.handleQuickSave();
            }}
            className="rounded-md bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dialog.saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuickGeneratorPopover({
  serverUrl,
  position,
  generatorType,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  sourceTokenValue,
  activeSet,
  onClose,
  onCreated,
  onOpenAdvanced,
  onPushUndo,
}: QuickGeneratorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(
    null,
  );

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedTemplate) {
          setSelectedTemplate(null);
          return;
        }
        onClose();
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, selectedTemplate]);

  if (!selectedTemplate) {
    return (
      <QuickGeneratorIntentPicker
        position={position}
        sourceTokenPath={sourceTokenPath}
        sourceTokenType={sourceTokenType}
        recommendedType={generatorType}
        onClose={onClose}
        onSelectTemplate={setSelectedTemplate}
        popoverRef={popoverRef}
      />
    );
  }

  return (
    <QuickGeneratorSetup
      serverUrl={serverUrl}
      position={position}
      template={selectedTemplate}
      sourceTokenPath={sourceTokenPath}
      sourceTokenName={sourceTokenName}
      sourceTokenType={sourceTokenType}
      sourceTokenValue={sourceTokenValue}
      activeSet={activeSet}
      onBack={() => setSelectedTemplate(null)}
      onClose={onClose}
      onCreated={onCreated}
      onOpenAdvanced={onOpenAdvanced}
      onPushUndo={onPushUndo}
      popoverRef={popoverRef}
    />
  );
}
