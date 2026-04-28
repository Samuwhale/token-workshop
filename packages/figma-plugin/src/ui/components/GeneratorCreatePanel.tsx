import { useCallback, useMemo, useState } from "react";
import {
  Circle,
  Droplet,
  Hash,
  Layers,
  Palette,
  Ruler,
  Search,
  Sigma,
  Sparkles,
  Type,
  Workflow,
  X,
} from "lucide-react";
import type { TokenCollection, TokenGeneratorDocument } from "@tokenmanager/core";
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

type BusyState = "create" | "custom" | null;

interface GeneratorCreatePanelProps {
  serverUrl: string;
  collections: TokenCollection[];
  workingCollectionId: string;
  initialOutputPrefix?: string | null;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onClose: () => void;
  onOpenGenerator: (
    generatorId: string,
    collectionId: string,
    initialView?: "setup" | "graph",
  ) => void;
}

interface GeneratorResponse {
  generator: TokenGeneratorDocument;
}

function parseNumberList(value: string): number[] {
  return value
    .split(",")
    .map((step) => Number(step.trim()))
    .filter(Number.isFinite);
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
const FORMULA_DEFAULT = generatorDefaultConfig("formula") as {
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
  const [sourceQuery, setSourceQuery] = useState("");
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
  const [scaleUnit, setScaleUnit] = useState(readPresetUnit(initialKind));
  const [typeRatio, setTypeRatio] = useState(TYPE_SCALE_DEFAULT.ratio);
  const [shadowColor, setShadowColor] = useState(SHADOW_SCALE_DEFAULT.color);
  const [formula, setFormula] = useState(FORMULA_DEFAULT.formula);
  const [formulaRoundTo, setFormulaRoundTo] = useState(
    FORMULA_DEFAULT.roundTo,
  );
  const [formulaOutputType, setFormulaOutputType] = useState<
    "number" | "dimension"
  >(FORMULA_DEFAULT.outputType);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedOption =
    GENERATOR_PRESET_OPTIONS.find((item) => item.id === kind) ??
    GENERATOR_PRESET_OPTIONS[0];
  const targetCollection = collections.find(
    (collection) => collection.id === targetCollectionId,
  );
  const sourceCollection = collections.find(
    (collection) => collection.id === sourceCollectionId,
  );
  const collectionOptions = useMemo(
    () =>
      collections.map((collection) => ({
        id: collection.id,
        label: readCollectionLabel(collection),
      })),
    [collections],
  );
  const crossCollectionSource =
    sourceMode === "token" && sourceCollectionId !== targetCollectionId;
  const targetModes = targetCollection?.modes.map((mode) => mode.name) ?? [];
  const sourceModes = sourceCollection?.modes.map((mode) => mode.name) ?? [];
  const missingSourceModes = targetModes.filter(
    (modeName) => !sourceModes.includes(modeName),
  );
  const modeCompatibility =
    !crossCollectionSource || missingSourceModes.length === 0;
  const compatibleSourceTokenEntries = useMemo(
    () =>
      Object.entries(perCollectionFlat[sourceCollectionId] ?? {})
        .filter(([, token]) => generatorAcceptsTokenType(kind, token.$type))
        .sort(([a], [b]) => a.localeCompare(b)),
    [kind, perCollectionFlat, sourceCollectionId],
  );
  const sourceTokenOptions = useMemo(() => {
    const normalizedQuery = sourceQuery.trim().toLowerCase();
    return compatibleSourceTokenEntries.filter(
      ([path, token]) =>
        !normalizedQuery ||
        path.toLowerCase().includes(normalizedQuery) ||
        token.$type.toLowerCase().includes(normalizedQuery),
    );
  }, [compatibleSourceTokenEntries, sourceQuery]);
  const selectedSourceToken = sourceTokenPath
    ? compatibleSourceTokenEntries.find(([path]) => path === sourceTokenPath)
    : undefined;

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
      setScaleUnit(readPresetUnit(nextKind));
      setTypeRatio(readPresetRatio(generatorDefaultConfig(nextKind)));
      setSourceCollectionId(targetCollectionId);
      setSourceTokenPath("");
      setSourceQuery("");
      setSourceAdvancedOpen(false);
      setError(null);
    },
    [targetCollectionId],
  );

  const createGenerator = useCallback(async () => {
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
    if (
      !SOURCELESS_GENERATOR_PRESETS.has(kind) &&
      sourceMode === "token" &&
      !selectedSourceToken
    ) {
      setError("Choose a compatible source token.");
      return;
    }
    if (!modeCompatibility) {
      setError(
        `Source collection is missing ${missingSourceModes.join(", ")}. Add matching modes to the source collection or choose a source from this collection.`,
      );
      return;
    }
    if (kind === "colorRamp" && parseNumberList(paletteSteps).length === 0) {
      setError("Add at least one numeric palette step.");
      return;
    }

    const generatedNodes = buildGeneratorNodesFromStructuredDraft({
      kind,
      sourceMode,
      sourceValue,
      sourceCollectionId,
      sourceTokenPath,
      outputPrefix: outputPrefix.trim(),
      config: generationConfig,
    });
    setBusy("create");
    setError(null);
    try {
      const created = await apiFetch<GeneratorResponse>(
        `${serverUrl}/api/generators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${selectedOption.label} generator`,
            targetCollectionId,
            nodes: generatedNodes.nodes,
            edges: generatedNodes.edges,
            viewport: { x: 0, y: 0, zoom: 1 },
          }),
        },
      );
      onOpenGenerator(
        created.generator.id,
        created.generator.targetCollectionId,
        "graph",
      );
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : String(createError),
      );
    } finally {
      setBusy(null);
    }
  }, [
    generationConfig,
    kind,
    missingSourceModes,
    modeCompatibility,
    onOpenGenerator,
    outputPrefix,
    paletteSteps,
    selectedOption.label,
    serverUrl,
    sourceCollectionId,
    sourceMode,
    sourceTokenPath,
    sourceValue,
    targetCollectionId,
    selectedSourceToken,
  ]);

  const createBlankGenerator = useCallback(async () => {
    if (!targetCollectionId) {
      setError("Choose a collection first.");
      return;
    }
    setBusy("custom");
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
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : String(createError),
      );
    } finally {
      setBusy(null);
    }
  }, [onOpenGenerator, serverUrl, targetCollectionId]);

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
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          aria-label="Close"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-4 min-[860px]:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-1">
            {GENERATOR_PRESET_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => updateKind(option.id)}
                className={`flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors ${
                  option.id === kind
                    ? "bg-[var(--color-figma-bg-selected)]"
                    : "bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-secondary font-semibold text-[var(--color-figma-text)]">
                    {option.label}
                  </span>
                  <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                    {presetSourceLabel(option.id)}
                    {" -> "}
                    {option.outputPrefix}
                  </span>
                </span>
                <PresetIcon kind={option.id} />
              </button>
            ))}
            <button
              type="button"
              onClick={createBlankGenerator}
              disabled={busy !== null || !targetCollectionId}
              className="mt-2 flex w-full items-start justify-between gap-3 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block truncate text-secondary font-semibold text-[var(--color-figma-text)]">
                  Custom generator
                </span>
                <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                  Start with an empty graph
                </span>
              </span>
              <Workflow
                size={13}
                className="mt-0.5 shrink-0 text-[var(--color-figma-text-secondary)]"
              />
            </button>
          </div>

          <div className="space-y-3">
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

          <ModeSummary modes={targetModes} />

          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Output group
            </span>
            <input
              value={outputPrefix}
              onChange={(event) => setOutputPrefix(event.target.value)}
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
                    }}
                    aria-pressed={sourceMode === mode}
                    className={`min-h-7 flex-1 rounded px-2 text-secondary font-medium ${
                      sourceMode === mode
                        ? "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
                        : "text-[var(--color-figma-text-secondary)]"
                    }`}
                  >
                    {mode === "literal" ? "Value" : "Token"}
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
                    onChange={(event) => setSourceValue(event.target.value)}
                    className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                  />
                </label>
              ) : (
                <div className="space-y-2">
                  <div>
                    <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                      Source token
                    </span>
                    <div className="flex items-center gap-2 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
                      <Search
                        size={14}
                        className="text-[var(--color-figma-text-secondary)]"
                      />
                      <input
                        value={sourceQuery}
                        onChange={(event) => setSourceQuery(event.target.value)}
                        placeholder={sourceTokenPath || "Search compatible tokens"}
                        className="min-w-0 flex-1 bg-transparent text-secondary text-[var(--color-figma-text)] outline-none"
                      />
                    </div>
                  </div>
                  {selectedSourceToken ? (
                    <button
                      type="button"
                      onClick={() => setSourceTokenPath("")}
                      className="flex w-full items-start gap-2 rounded bg-[var(--color-figma-bg-selected)] px-2 py-1.5 text-left text-secondary"
                      title="Clear source token"
                      aria-label="Clear source token"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {selectedSourceToken[0]}
                        </span>
                        <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                          {selectedSourceToken[1].$type}
                        </span>
                        <TokenModePreview
                          token={selectedSourceToken[1]}
                          collectionId={sourceCollectionId}
                          modes={sourceModes}
                        />
                      </span>
                      <X
                        size={13}
                        className="mt-0.5 shrink-0 text-[var(--color-figma-text-secondary)]"
                        aria-hidden
                      />
                    </button>
                  ) : null}
                  <div className="max-h-[180px] overflow-y-auto rounded bg-[var(--color-figma-bg-secondary)] p-1">
                    {sourceTokenOptions.slice(0, 40).map(([path, token]) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => {
                          setSourceTokenPath(path);
                          setSourceQuery("");
                        }}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)] ${
                          path === sourceTokenPath
                            ? "bg-[var(--color-figma-bg-selected)]"
                            : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {path}
                          </span>
                          <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                            {token.$type}
                          </span>
                          <TokenModePreview
                            token={token}
                            collectionId={sourceCollectionId}
                            modes={sourceModes}
                          />
                        </span>
                      </button>
                    ))}
                    {sourceTokenOptions.length === 0 ? (
                      <div className="px-2 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
                        No compatible tokens in this collection.
                      </div>
                    ) : null}
                  </div>
                  <details
                    open={sourceAdvancedOpen}
                    onToggle={(event) => {
                      const open = event.currentTarget.open;
                      setSourceAdvancedOpen(open);
                      if (!open) {
                        setSourceCollectionId(targetCollectionId);
                        setSourceTokenPath("");
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
                          ? "Source modes match the target collection."
                          : `Missing source ${missingSourceModes.length === 1 ? "mode" : "modes"}: ${missingSourceModes.join(", ")}. Add matching modes to the source collection or choose a source from this collection.`}
                      </div>
                    ) : null}
                  </details>
                </div>
              )}
            </div>
          ) : null}

          {kind === "colorRamp" ? (
            <>
              <TextInput
                label="Steps"
                value={paletteSteps}
                onChange={setPaletteSteps}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  label="Light end"
                  value={paletteLightEnd}
                  onChange={setPaletteLightEnd}
                />
                <NumberInput
                  label="Dark end"
                  value={paletteDarkEnd}
                  onChange={setPaletteDarkEnd}
                />
              </div>
            </>
          ) : null}

          {kind === "spacing" || kind === "type" || kind === "radius" ? (
            <div className={kind === "type" ? "grid grid-cols-2 gap-2" : ""}>
              {kind === "type" ? (
                <NumberInput
                  label="Ratio"
                  value={typeRatio}
                  step="0.01"
                  onChange={setTypeRatio}
                />
              ) : null}
              <TextInput label="Unit" value={scaleUnit} onChange={setScaleUnit} />
            </div>
          ) : null}

          {kind === "shadow" ? (
            <TextInput
              label="Shadow color"
              value={shadowColor}
              onChange={setShadowColor}
            />
          ) : null}

          {kind === "formula" ? (
            <>
              <TextInput label="Formula" value={formula} onChange={setFormula} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                    Output type
                  </span>
                  <select
                    value={formulaOutputType}
                    onChange={(event) =>
                      setFormulaOutputType(
                        event.target.value as typeof formulaOutputType,
                      )
                    }
                    className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                  >
                    <option value="number">Number</option>
                    <option value="dimension">Dimension</option>
                  </select>
                </label>
                <NumberInput
                  label="Round to"
                  value={formulaRoundTo}
                  onChange={setFormulaRoundTo}
                />
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
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-figma-border)] px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-secondary font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={createGenerator}
          disabled={busy !== null || !targetCollectionId}
          className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-secondary font-semibold text-[var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {busy ? "Creating..." : "Create generator"}
        </button>
      </div>
    </div>
  );
}

function readPresetUnit(kind: GeneratorPresetKind): string {
  const config = generatorDefaultConfig(kind) as { unit?: unknown };
  return typeof config.unit === "string" ? config.unit : "px";
}

function PresetIcon({ kind }: { kind: GeneratorPresetKind }) {
  const className =
    "mt-0.5 shrink-0 text-[var(--color-figma-text-secondary)]";
  if (kind === "colorRamp") return <Palette size={13} className={className} />;
  if (kind === "spacing") return <Ruler size={13} className={className} />;
  if (kind === "type") return <Type size={13} className={className} />;
  if (kind === "radius") return <Circle size={13} className={className} />;
  if (kind === "opacity") return <Droplet size={13} className={className} />;
  if (kind === "shadow") return <Layers size={13} className={className} />;
  if (kind === "zIndex") return <Hash size={13} className={className} />;
  if (kind === "formula") return <Sigma size={13} className={className} />;
  return <Workflow size={13} className={className} />;
}

function readPresetRatio(config: unknown): number {
  const ratio = (config as { ratio?: unknown }).ratio;
  return typeof ratio === "number" ? ratio : 1.25;
}

function readTokenModeValues(
  token: TokenMapEntry,
  collectionId: string,
  modes: string[],
): Array<[string, unknown]> {
  if (modes.length === 0) return [["Value", token.$value]];
  const collectionModes = token.$extensions?.tokenmanager?.modes?.[collectionId];
  return modes.map((modeName, index) => [
    modeName,
    index === 0 ? token.$value : collectionModes?.[modeName] ?? token.$value,
  ]);
}

function TokenModePreview({
  token,
  collectionId,
  modes,
}: {
  token: TokenMapEntry;
  collectionId: string;
  modes: string[];
}) {
  const values = readTokenModeValues(token, collectionId, modes).slice(0, 3);
  return (
    <span className="mt-1 flex min-w-0 flex-col gap-0.5 text-tertiary text-[var(--color-figma-text-secondary)]">
      {values.map(([modeName, value]) => (
        <span key={modeName} className="flex min-w-0 items-center gap-1">
          {previewIsValueBearing(token.$type) ? (
            <ValuePreview type={token.$type} value={value} size={12} />
          ) : null}
          <span className="truncate">
            {modeName}: {formatCompactValue(value)}
          </span>
        </span>
      ))}
    </span>
  );
}

function formatCompactValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object" && "value" in value && "unit" in value) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}

function ModeSummary({ modes }: { modes: string[] }) {
  return (
    <div>
      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        Modes
      </span>
      <div className="flex flex-wrap gap-1 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
        {modes.length > 0 ? (
          modes.map((mode) => (
            <span
              key={mode}
              className="rounded bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-tertiary text-[var(--color-figma-text-secondary)]"
            >
              {mode}
            </span>
          ))
        ) : (
          <span className="text-secondary text-[var(--color-figma-text-secondary)]">
            No modes
          </span>
        )}
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
      />
    </label>
  );
}

function presetSourceLabel(kind: GeneratorPresetKind): string {
  if (SOURCELESS_GENERATOR_PRESETS.has(kind)) return "No source token";
  if (kind === "colorRamp") return "Color source";
  if (kind === "formula") return "Number source";
  return "Dimension source";
}

function generatorAcceptsTokenType(
  kind: GeneratorPresetKind,
  tokenType?: string,
): boolean {
  if (kind === "colorRamp") return tokenType === "color";
  if (kind === "formula")
    return tokenType === "number" || tokenType === "dimension";
  return tokenType === "dimension" || tokenType === "number";
}
