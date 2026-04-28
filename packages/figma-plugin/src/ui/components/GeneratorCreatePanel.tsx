import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GitBranch, Sparkles, X } from "lucide-react";
import type {
  TokenCollection,
  TokenGeneratorDocument,
  TokenGeneratorPreviewResult,
} from "@tokenmanager/core";
import {
  GENERATOR_PRESET_OPTIONS,
  SOURCELESS_GENERATOR_PRESETS,
  buildGeneratorNodesFromStructuredDraft,
  generatorDefaultConfig,
  generatorDefaultSourceValue,
  type GeneratorPresetKind,
  type GeneratorSourceMode,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { apiFetch } from "../shared/apiFetch";
import { ValuePreview, previewIsValueBearing } from "./ValuePreview";

type BusyState = "preview" | "apply" | "open" | null;

interface GeneratorCreatePanelProps {
  serverUrl: string;
  collections: TokenCollection[];
  workingCollectionId: string;
  initialOutputPrefix?: string | null;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onClose: () => void;
  onApplied: (result: {
    generatorId: string;
    collectionId: string;
    outputPrefix: string;
    firstPath?: string;
  }) => void;
  onOpenGenerator: (generatorId: string, collectionId: string) => void;
}

interface GeneratorResponse {
  generator: TokenGeneratorDocument;
}

interface GeneratorPreviewResponse {
  preview: TokenGeneratorPreviewResult;
}

interface GeneratorApplyResponse {
  preview: TokenGeneratorPreviewResult;
  generator?: TokenGeneratorDocument;
  created: string[];
  updated: string[];
  deleted: string[];
  operationId?: string;
}

function parseNumberList(value: string): number[] {
  return value
    .split(",")
    .map((step) => Number(step.trim()))
    .filter(Number.isFinite);
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (typeof value === "object" && "value" in value && "unit" in value) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}

function readCollectionLabel(collection: TokenCollection): string {
  return collection.publishRouting?.collectionName?.trim() || collection.id;
}

const COLOR_RAMP_DEFAULT = generatorDefaultConfig("colorRamp") as {
  steps: number[];
  lightEnd: number;
  darkEnd: number;
};
const TYPE_SCALE_DEFAULT = generatorDefaultConfig("type") as {
  ratio: number;
  unit: string;
};
const SHADOW_SCALE_DEFAULT = generatorDefaultConfig("shadow") as {
  color: string;
};
const CUSTOM_SCALE_DEFAULT = generatorDefaultConfig("formula") as {
  formula: string;
  roundTo: number;
  outputType: "number" | "dimension";
};

export function GeneratorCreatePanel({
  serverUrl,
  collections,
  workingCollectionId,
  initialOutputPrefix,
  perCollectionFlat,
  onClose,
  onApplied,
  onOpenGenerator,
}: GeneratorCreatePanelProps) {
  const initialKind: GeneratorPresetKind = "colorRamp";
  const initialCollectionId = workingCollectionId || collections[0]?.id || "";
  const [kind, setKind] = useState<GeneratorPresetKind>(initialKind);
  const [targetCollectionId, setTargetCollectionId] =
    useState(initialCollectionId);
  const [outputPrefix, setOutputPrefix] = useState(
    initialOutputPrefix?.trim() || "color.brand",
  );
  const [sourceMode, setSourceMode] = useState<GeneratorSourceMode>("literal");
  const [sourceValue, setSourceValue] = useState(
    generatorDefaultSourceValue(initialKind),
  );
  const [sourceCollectionId, setSourceCollectionId] =
    useState(initialCollectionId);
  const [sourceTokenPath, setSourceTokenPath] = useState("");
  const [sourceAdvancedOpen, setSourceAdvancedOpen] = useState(false);
  const [paletteSteps, setPaletteSteps] = useState(
    COLOR_RAMP_DEFAULT.steps.join(", "),
  );
  const [paletteLightEnd, setPaletteLightEnd] = useState(
    COLOR_RAMP_DEFAULT.lightEnd,
  );
  const [paletteDarkEnd, setPaletteDarkEnd] = useState(
    COLOR_RAMP_DEFAULT.darkEnd,
  );
  const [scaleUnit, setScaleUnit] = useState("px");
  const [typeRatio, setTypeRatio] = useState(TYPE_SCALE_DEFAULT.ratio);
  const [shadowColor, setShadowColor] = useState(SHADOW_SCALE_DEFAULT.color);
  const [formula, setFormula] = useState(CUSTOM_SCALE_DEFAULT.formula);
  const [formulaRoundTo, setFormulaRoundTo] = useState(
    CUSTOM_SCALE_DEFAULT.roundTo,
  );
  const [formulaOutputType, setFormulaOutputType] = useState(
    CUSTOM_SCALE_DEFAULT.outputType,
  );
  const [preview, setPreview] = useState<TokenGeneratorPreviewResult | null>(
    null,
  );
  const [previewPayloadKey, setPreviewPayloadKey] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);
  const latestPayloadKeyRef = useRef("");
  const fallbackCollectionId = collections[0]?.id ?? "";

  const selectedOption =
    GENERATOR_PRESET_OPTIONS.find((item) => item.id === kind) ??
    GENERATOR_PRESET_OPTIONS[0];
  const targetCollection = collections.find(
    (collection) => collection.id === targetCollectionId,
  );
  const sourceCollection = collections.find(
    (collection) => collection.id === sourceCollectionId,
  );
  const crossCollectionSource =
    sourceMode === "token" && sourceCollectionId !== targetCollectionId;
  const modeCompatibility =
    !crossCollectionSource ||
    !targetCollection ||
    !sourceCollection ||
    targetCollection.modes.every((mode) =>
      sourceCollection.modes.some(
        (sourceModeItem) => sourceModeItem.name === mode.name,
      ),
    );
  const collectionOptions = useMemo(
    () =>
      collections.map((collection) => ({
        id: collection.id,
        label: readCollectionLabel(collection),
      })),
    [collections],
  );
  const sourceTokenOptions = useMemo(() => {
    const tokens = perCollectionFlat[sourceCollectionId] ?? {};
    return Object.entries(tokens)
      .filter(([, token]) => {
        if (kind === "colorRamp") return token.$type === "color";
        if (kind === "formula")
          return token.$type === "number" || token.$type === "dimension";
        return token.$type === "dimension" || token.$type === "number";
      })
      .map(([path]) => path)
      .sort((a, b) => a.localeCompare(b));
  }, [kind, perCollectionFlat, sourceCollectionId]);

  useEffect(() => {
    if (collections.length === 0) {
      if (targetCollectionId) {
        setTargetCollectionId("");
      }
      if (sourceCollectionId) {
        setSourceCollectionId("");
      }
      if (sourceTokenPath) {
        setSourceTokenPath("");
      }
      return;
    }

    if (
      !collections.some((collection) => collection.id === targetCollectionId)
    ) {
      setTargetCollectionId(fallbackCollectionId);
      setPreview(null);
    }

    if (
      !collections.some((collection) => collection.id === sourceCollectionId)
    ) {
      setSourceCollectionId(fallbackCollectionId);
      setSourceTokenPath("");
      setPreview(null);
    }
  }, [
    collections,
    fallbackCollectionId,
    sourceCollectionId,
    sourceTokenPath,
    targetCollectionId,
  ]);

  useEffect(() => {
    if (!sourceTokenPath) {
      return;
    }
    if (sourceTokenOptions.includes(sourceTokenPath)) {
      return;
    }
    setSourceTokenPath("");
    setPreview(null);
  }, [sourceTokenOptions, sourceTokenPath]);

  useEffect(() => {
    if (sourceAdvancedOpen || sourceCollectionId === targetCollectionId) {
      return;
    }
    setSourceCollectionId(targetCollectionId);
    setSourceTokenPath("");
    setPreview(null);
  }, [sourceAdvancedOpen, sourceCollectionId, targetCollectionId]);

  const previewBlocking = Boolean(
    preview?.blocking ||
    preview?.outputs.length === 0 ||
    preview?.outputs.some((output) => output.collision),
  );
  const modes =
    targetCollection?.modes.map((mode) => mode.name) ??
    preview?.targetModes ??
    [];
  const generationConfig = useMemo(() => {
    if (kind === "colorRamp") {
      return {
        ...generatorDefaultConfig("colorRamp"),
        steps: parseNumberList(paletteSteps),
        lightEnd: paletteLightEnd,
        darkEnd: paletteDarkEnd,
      };
    }
    if (kind === "spacing") {
      return { ...generatorDefaultConfig("spacing"), unit: scaleUnit };
    }
    if (kind === "type") {
      return {
        ...generatorDefaultConfig("type"),
        ratio: typeRatio,
        unit: scaleUnit,
      };
    }
    if (kind === "radius") {
      return { ...generatorDefaultConfig("radius"), unit: scaleUnit };
    }
    if (kind === "shadow") {
      return { ...generatorDefaultConfig("shadow"), color: shadowColor };
    }
    if (kind === "formula") {
      return {
        ...generatorDefaultConfig("formula"),
        formula,
        roundTo: formulaRoundTo,
        outputType: formulaOutputType,
      };
    }
    return generatorDefaultConfig(kind);
  }, [
    formula,
    formulaOutputType,
    formulaRoundTo,
    kind,
    paletteDarkEnd,
    paletteLightEnd,
    paletteSteps,
    scaleUnit,
    shadowColor,
    typeRatio,
  ]);

  const updateKind = useCallback(
    (nextKind: GeneratorPresetKind) => {
      const option =
        GENERATOR_PRESET_OPTIONS.find((item) => item.id === nextKind) ??
        GENERATOR_PRESET_OPTIONS[0];
      setKind(nextKind);
      setOutputPrefix(option.outputPrefix);
      setSourceMode(option.sourceMode);
      setSourceValue(generatorDefaultSourceValue(nextKind));
      setSourceAdvancedOpen(false);
      setSourceCollectionId(targetCollectionId);
      setScaleUnit(nextKind === "type" ? TYPE_SCALE_DEFAULT.unit : "px");
      setSourceTokenPath("");
      setPreview(null);
      setError(null);
    },
    [targetCollectionId],
  );

  const generatorPayload = useCallback(() => {
    const generatedNodes = buildGeneratorNodesFromStructuredDraft({
      kind,
      sourceMode,
      sourceValue,
      sourceCollectionId,
      sourceTokenPath,
      outputPrefix: outputPrefix.trim(),
      config: generationConfig,
    });
    return {
      name: `${selectedOption.label} generator`,
      targetCollectionId,
      nodes: generatedNodes.nodes,
      edges: generatedNodes.edges,
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }, [
    generationConfig,
    kind,
    outputPrefix,
    selectedOption.label,
    sourceCollectionId,
    sourceMode,
    sourceTokenPath,
    sourceValue,
    targetCollectionId,
  ]);
  const currentPayloadKey = useMemo(
    () => JSON.stringify(generatorPayload()),
    [generatorPayload],
  );

  useEffect(() => {
    latestPayloadKeyRef.current = currentPayloadKey;
  }, [currentPayloadKey]);

  const handlePreview = useCallback(async () => {
    if (!targetCollectionId) {
      setError("Choose a collection first.");
      return;
    }
    if (!outputPrefix.trim()) {
      setError("Choose an output group.");
      return;
    }
    if (
      !SOURCELESS_GENERATOR_PRESETS.has(kind) &&
      sourceMode === "token" &&
      !sourceTokenPath.trim()
    ) {
      setError("Choose a source token.");
      return;
    }
    if (!modeCompatibility) {
      setError("Source and target collections need matching mode names.");
      return;
    }
    if (kind === "colorRamp" && parseNumberList(paletteSteps).length === 0) {
      setError("Add at least one numeric palette step.");
      return;
    }
    setBusy("preview");
    setError(null);
    try {
      const payload = generatorPayload();
      const payloadKey = JSON.stringify(payload);
      const data = await apiFetch<GeneratorPreviewResponse>(
        `${serverUrl}/api/generators/preview-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (payloadKey !== latestPayloadKeyRef.current) {
        return;
      }
      setPreview(data.preview);
      setPreviewPayloadKey(payloadKey);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : String(previewError),
      );
    } finally {
      setBusy(null);
    }
  }, [
    generatorPayload,
    kind,
    outputPrefix,
    paletteSteps,
    serverUrl,
    modeCompatibility,
    sourceMode,
    sourceTokenPath,
    targetCollectionId,
  ]);

  const handleApply = useCallback(async () => {
    if (!preview || previewBlocking || previewPayloadKey !== currentPayloadKey)
      return;
    setBusy("apply");
    setError(null);
    try {
      const payload = generatorPayload();
      const result = await apiFetch<GeneratorApplyResponse>(
        `${serverUrl}/api/generators/apply-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, previewHash: preview.hash }),
        },
      );
      onApplied({
        generatorId: result.generator?.id ?? "",
        collectionId: targetCollectionId,
        outputPrefix: outputPrefix.trim(),
        firstPath:
          result.created[0] ??
          result.updated[0] ??
          result.preview.outputs[0]?.path,
      });
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : String(applyError),
      );
    } finally {
      setBusy(null);
    }
  }, [
    currentPayloadKey,
    generatorPayload,
    onApplied,
    outputPrefix,
    preview,
    previewBlocking,
    previewPayloadKey,
    serverUrl,
    targetCollectionId,
  ]);

  const handleOpenGenerator = useCallback(async () => {
    setBusy("open");
    setError(null);
    try {
      const payload = generatorPayload();
      const created = await apiFetch<GeneratorResponse>(
        `${serverUrl}/api/generators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      onOpenGenerator(
        created.generator.id,
        created.generator.targetCollectionId,
      );
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : String(openError),
      );
    } finally {
      setBusy(null);
    }
  }, [generatorPayload, onOpenGenerator, serverUrl]);

  const handleOpenCustomGenerator = useCallback(async () => {
    if (!targetCollectionId) {
      setError("Choose a collection first.");
      return;
    }
    setBusy("open");
    setError(null);
    try {
      const created = await apiFetch<GeneratorResponse>(
        `${serverUrl}/api/generators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Custom generator",
            targetCollectionId,
            template: "blank",
          }),
        },
      );
      onOpenGenerator(
        created.generator.id,
        created.generator.targetCollectionId,
      );
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : String(openError),
      );
    } finally {
      setBusy(null);
    }
  }, [onOpenGenerator, serverUrl, targetCollectionId]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-4 py-3">
        <Sparkles
          size={15}
          className="text-[var(--color-figma-accent)]"
          aria-hidden
        />
        <h3 className="min-w-0 flex-1 truncate text-body font-semibold text-[var(--color-figma-text)]">
          Create generator
        </h3>
        <button
          type="button"
          onClick={handleOpenGenerator}
          disabled={busy !== null || !targetCollectionId}
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
        >
          <ExternalLink size={12} aria-hidden />
          {busy === "open" ? "Opening..." : "Open in Generators"}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          aria-label="Close"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-1.5">
          {GENERATOR_PRESET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => updateKind(option.id)}
              className={`rounded px-2 py-1.5 text-left text-secondary font-medium transition-colors ${
                option.id === kind
                  ? "bg-[var(--color-figma-accent)] text-[var(--color-figma-text-onbrand)]"
                  : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleOpenCustomGenerator}
          disabled={busy !== null || !targetCollectionId}
          className="mt-2 inline-flex min-h-7 items-center gap-1.5 rounded px-2 text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
        >
          <GitBranch size={13} aria-hidden />
          Start with blank graph
        </button>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Collection
            </span>
            <select
              value={targetCollectionId}
              onChange={(event) => {
                const nextCollectionId = event.target.value;
                setTargetCollectionId(nextCollectionId);
                if (!sourceAdvancedOpen) {
                  setSourceCollectionId(nextCollectionId);
                  setSourceTokenPath("");
                }
                setPreview(null);
              }}
              className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
            >
              {collectionOptions.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Output group
            </span>
            <input
              value={outputPrefix}
              onChange={(event) => {
                setOutputPrefix(event.target.value);
                setPreview(null);
              }}
              className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
            />
          </label>

          {!SOURCELESS_GENERATOR_PRESETS.has(kind) ? (
            <div className="space-y-2">
              <div className="flex rounded bg-[var(--color-figma-bg-secondary)] p-0.5">
                {(["literal", "token"] as GeneratorSourceMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSourceMode(mode);
                      if (mode === "token" && !sourceAdvancedOpen) {
                        setSourceCollectionId(targetCollectionId);
                      }
                      setPreview(null);
                    }}
                    className={`min-h-7 flex-1 rounded px-2 text-secondary font-medium ${
                      sourceMode === mode
                        ? "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
                        : "text-[var(--color-figma-text-secondary)]"
                    }`}
                  >
                    {mode === "literal" ? "Literal" : "Token"}
                  </button>
                ))}
              </div>

              {sourceMode === "literal" ? (
                <label className="block">
                  <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                    Source value
                  </span>
                  <input
                    value={sourceValue}
                    onChange={(event) => {
                      setSourceValue(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                  />
                </label>
              ) : (
                <div className="space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                      Source token
                    </span>
                    <input
                      list="generate-token-source-options"
                      value={sourceTokenPath}
                      onChange={(event) => {
                        setSourceTokenPath(event.target.value);
                        setPreview(null);
                      }}
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                    />
                    <datalist id="generate-token-source-options">
                      {sourceTokenOptions.map((path) => (
                        <option key={path} value={path} />
                      ))}
                    </datalist>
                  </label>
                  <details
                    open={sourceAdvancedOpen}
                    onToggle={(event) => {
                      const open = event.currentTarget.open;
                      setSourceAdvancedOpen(open);
                      if (!open) {
                        setSourceCollectionId(targetCollectionId);
                        setSourceTokenPath("");
                        setPreview(null);
                      }
                    }}
                    className="rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5"
                  >
                    <summary className="cursor-pointer text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                      Cross-collection source
                    </summary>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                        Source collection
                      </span>
                      <select
                        value={sourceCollectionId}
                        onChange={(event) => {
                          setSourceCollectionId(event.target.value);
                          setSourceTokenPath("");
                          setPreview(null);
                        }}
                        className="w-full rounded bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                      >
                        {collectionOptions.map((collection) => (
                          <option key={collection.id} value={collection.id}>
                            {collection.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {crossCollectionSource ? (
                      <div
                        className={`mt-2 text-tertiary ${modeCompatibility ? "text-[var(--color-figma-text-secondary)]" : "text-[var(--color-figma-error)]"}`}
                      >
                        {modeCompatibility
                          ? "Mode names match the target collection."
                          : "Mode names must match the target collection before previewing."}
                      </div>
                    ) : null}
                  </details>
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            {kind === "colorRamp" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                    Steps
                  </span>
                  <input
                    value={paletteSteps}
                    onChange={(event) => {
                      setPaletteSteps(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                      Light end
                    </span>
                    <input
                      type="number"
                      value={paletteLightEnd}
                      onChange={(event) => {
                        setPaletteLightEnd(Number(event.target.value));
                        setPreview(null);
                      }}
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                      Dark end
                    </span>
                    <input
                      type="number"
                      value={paletteDarkEnd}
                      onChange={(event) => {
                        setPaletteDarkEnd(Number(event.target.value));
                        setPreview(null);
                      }}
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                    />
                  </label>
                </div>
              </>
            ) : null}

            {kind === "spacing" || kind === "type" || kind === "radius" ? (
              <div className={kind === "type" ? "grid grid-cols-2 gap-2" : ""}>
                {kind === "type" ? (
                  <label className="block">
                    <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                      Ratio
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={typeRatio}
                      onChange={(event) => {
                        setTypeRatio(Number(event.target.value));
                        setPreview(null);
                      }}
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                    />
                  </label>
                ) : null}
                <label className="block">
                  <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                    Unit
                  </span>
                  <input
                    value={scaleUnit}
                    onChange={(event) => {
                      setScaleUnit(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                  />
                </label>
              </div>
            ) : null}

            {kind === "shadow" ? (
              <label className="block">
                <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                  Shadow color
                </span>
                <input
                  value={shadowColor}
                  onChange={(event) => {
                    setShadowColor(event.target.value);
                    setPreview(null);
                  }}
                  className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                />
              </label>
            ) : null}

            {kind === "formula" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                    Formula
                  </span>
                  <input
                    value={formula}
                    onChange={(event) => {
                      setFormula(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                      Output type
                    </span>
                    <select
                      value={formulaOutputType}
                      onChange={(event) => {
                        setFormulaOutputType(
                          event.target.value as typeof formulaOutputType,
                        );
                        setPreview(null);
                      }}
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                    >
                      <option value="number">Number</option>
                      <option value="dimension">Dimension</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                      Round to
                    </span>
                    <input
                      type="number"
                      value={formulaRoundTo}
                      onChange={(event) => {
                        setFormulaRoundTo(Number(event.target.value));
                        setPreview(null);
                      }}
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                    />
                  </label>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)] px-3 py-2 text-secondary text-[var(--color-figma-error)]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-secondary font-semibold text-[var(--color-figma-text)]">
              Preview
            </h4>
            {preview ? (
              <span className="text-tertiary text-[var(--color-figma-text-secondary)]">
                {preview.outputs.length} outputs
              </span>
            ) : null}
          </div>
          {!preview ? (
            <div className="rounded bg-[var(--color-figma-bg-secondary)] px-3 py-3 text-secondary text-[var(--color-figma-text-secondary)]">
              Preview creates a draft generator and shows exactly which tokens
              will change.
            </div>
          ) : (
            <div className="space-y-2">
              {preview.diagnostics.map((diagnostic) => (
                <div
                  key={diagnostic.id}
                  className="rounded bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text)]"
                >
                  <span className="font-semibold capitalize">
                    {diagnostic.severity}
                  </span>
                  <span className="text-[var(--color-figma-text-secondary)]">
                    : {diagnostic.message}
                  </span>
                </div>
              ))}
              {preview.outputs.length === 0 ? (
                <div className="rounded bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-error)]">
                  No tokens will be created. Adjust the source or steps and
                  preview again.
                </div>
              ) : null}
              {preview.outputs.map((output) => (
                <div
                  key={`${output.nodeId}-${output.path}`}
                  className="rounded bg-[var(--color-figma-bg-secondary)] px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-secondary font-medium text-[var(--color-figma-text)]">
                      {output.path}
                    </span>
                    <span
                      className={`text-tertiary ${
                        output.collision
                          ? "text-[var(--color-figma-error)]"
                          : "text-[var(--color-figma-text-secondary)]"
                      }`}
                    >
                      {output.collision ? "collision" : output.change}
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {modes.map((modeName) => (
                      <div
                        key={modeName}
                        className="grid grid-cols-[70px_1fr] gap-2 text-tertiary"
                      >
                        <span className="truncate text-[var(--color-figma-text-secondary)]">
                          {modeName}
                        </span>
                        <span className="min-w-0 flex items-center gap-1.5 text-[var(--color-figma-text)]">
                          {previewIsValueBearing(output.type) ? (
                            <ValuePreview
                              type={output.type}
                              value={output.modeValues[modeName]}
                              size={12}
                            />
                          ) : null}
                          <span className="truncate">
                            {formatValue(output.modeValues[modeName])}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-figma-border)] px-4 py-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={busy !== null || !targetCollectionId}
          className="rounded px-3 py-1.5 text-secondary font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
        >
          {busy === "preview" ? "Previewing..." : "Preview"}
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={
            busy !== null ||
            !preview ||
            previewBlocking ||
            previewPayloadKey !== currentPayloadKey
          }
          className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-secondary font-semibold text-[var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {busy === "apply" ? "Applying..." : "Apply"}
        </button>
      </div>
    </div>
  );
}
