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
import { Button, IconButton, SegmentedControl } from "../primitives";
import { ValuePreview, previewIsValueBearing } from "./ValuePreview";
import {
  GeneratorColorField,
  GeneratorDimensionField,
  GeneratorFormulaField,
  GeneratorNumberField,
  GeneratorPathField,
  GeneratorUnitField,
  NumberStepTable,
  formatGeneratorDimensionInput,
  parseGeneratorDimensionInput,
  validateGeneratorTokenPath,
} from "./generators/GeneratorFieldControls";

type BusyState = "create" | "custom" | null;
type CreateStartMode = "preset" | "graph";

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
    initialView?: "overview" | "graph",
  ) => void;
}

interface GeneratorResponse {
  generator: TokenGeneratorDocument;
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
const SOURCE_MODE_OPTIONS: Array<{ value: GeneratorSourceMode; label: string }> = [
  { value: "literal", label: "Value" },
  { value: "token", label: "Token" },
];
const PRESET_GROUPS: Array<{
  label: string;
  ids: GeneratorPresetKind[];
}> = [
  { label: "Color", ids: ["colorRamp"] },
  { label: "Size", ids: ["spacing", "radius"] },
  { label: "Type", ids: ["type"] },
  { label: "Effects", ids: ["opacity", "shadow"] },
  { label: "Numbers", ids: ["zIndex", "formula"] },
];

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
  const [startMode, setStartMode] = useState<CreateStartMode>("preset");
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
  const [paletteSteps, setPaletteSteps] = useState(COLOR_RAMP_DEFAULT.steps);
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
  const allTargetTokensFlat = perCollectionFlat[targetCollectionId] ?? {};
  const pathToCollectionId = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [collectionId, tokens] of Object.entries(perCollectionFlat)) {
      for (const path of Object.keys(tokens)) {
        result[path] = collectionId;
      }
    }
    return result;
  }, [perCollectionFlat]);

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
        steps: paletteSteps,
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
    const outputPathError = validateGeneratorTokenPath(outputPrefix);
    if (outputPathError) {
      setError(outputPathError);
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
    if (kind === "colorRamp" && paletteSteps.length === 0) {
      setError("Add at least one numeric palette step.");
      return;
    }
    const duplicatePaletteStep = findDuplicateNumber(paletteSteps);
    if (kind === "colorRamp" && duplicatePaletteStep !== null) {
      setError(`Palette step ${duplicatePaletteStep} must be unique.`);
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
            authoringMode: "preset",
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
        "overview",
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

  const createGraphGenerator = useCallback(async (template?: GeneratorPresetKind) => {
    if (!targetCollectionId) {
      setError("Choose a collection first.");
      return;
    }
    setBusy("custom");
    setError(null);
    try {
      const option = template
        ? GENERATOR_PRESET_OPTIONS.find((item) => item.id === template)
        : null;
      const templateDraft = option
        ? buildGeneratorNodesFromStructuredDraft({
            kind: option.id,
            sourceMode: option.sourceMode,
            sourceValue: generatorDefaultSourceValue(option.id),
            sourceCollectionId: targetCollectionId,
            sourceTokenPath: "",
            outputPrefix: option.outputPrefix,
            config: generatorDefaultConfig(option.id),
          })
        : null;
      const created = await apiFetch<GeneratorResponse>(
        `${serverUrl}/api/generators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: option ? `${option.label} generator` : "Custom generator",
            authoringMode: "graph",
            targetCollectionId,
            ...(templateDraft
              ? {
                  nodes: templateDraft.nodes,
                  edges: templateDraft.edges,
                  viewport: { x: 0, y: 0, zoom: 1 },
                }
              : { template: "blank" }),
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
  }, [onOpenGenerator, serverUrl, targetCollectionId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-4 py-3">
        <Sparkles
          size={15}
          className="text-[color:var(--color-figma-text-accent)]"
          aria-hidden
        />
        <h3 className="min-w-0 flex-1 truncate text-body font-semibold text-[color:var(--color-figma-text)]">
          Create generator
        </h3>
        <IconButton
          onClick={onClose}
          aria-label="Close"
        >
          <X size={14} aria-hidden />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 grid gap-2 min-[720px]:grid-cols-2">
          <button
            type="button"
            onClick={() => setStartMode("preset")}
            className={`flex items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${
              startMode === "preset"
                ? "bg-[var(--color-figma-bg-selected)]"
                : "bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            }`}
          >
            <Sparkles
              size={15}
              className="mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]"
            />
            <span className="min-w-0">
              <span className="block text-secondary font-semibold text-[color:var(--color-figma-text)]">
                Preset
              </span>
              <span className="block text-tertiary text-[color:var(--color-figma-text-secondary)]">
                Configure a ready-made token group.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStartMode("graph")}
            className={`flex items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${
              startMode === "graph"
                ? "bg-[var(--color-figma-bg-selected)]"
                : "bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            }`}
          >
            <Workflow
              size={15}
              className="mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]"
            />
            <span className="min-w-0">
              <span className="block text-secondary font-semibold text-[color:var(--color-figma-text)]">
                Graph
              </span>
              <span className="block text-tertiary text-[color:var(--color-figma-text-secondary)]">
                Edit the same generator as nodes and connections.
              </span>
            </span>
          </button>
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
            Target collection
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
            className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[color:var(--color-figma-text)] outline-none"
          >
            {collectionOptions.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.label}
              </option>
            ))}
          </select>
        </label>

        {startMode === "preset" ? (
        <div className="grid gap-4 min-[860px]:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="px-1">
              <h4 className="text-body font-semibold text-[color:var(--color-figma-text)]">
                Preset templates
              </h4>
              <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                Choose the pattern that matches the token group you want.
              </p>
            </div>
            <div className="space-y-3">
              {PRESET_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="mb-1 px-1 text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.ids.map((id) => {
                      const option = GENERATOR_PRESET_OPTIONS.find(
                        (candidate) => candidate.id === id,
                      );
                      if (!option) return null;
                      return (
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
                            <span className="block truncate text-secondary font-semibold text-[color:var(--color-figma-text)]">
                              {option.label}
                            </span>
                            <span className="block truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
                              {presetSourceLabel(option.id)}
                              {" -> "}
                              {option.outputPrefix}
                            </span>
                          </span>
                          <PresetIcon kind={option.id} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-body font-semibold text-[color:var(--color-figma-text)]">
                Generator details
              </h4>
              <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                Pick where the generated tokens live and what they come from.
              </p>
            </div>

            <GeneratorPathField
              label="Output group"
              value={outputPrefix}
              series
              onChange={setOutputPrefix}
            />

          {!SOURCELESS_GENERATOR_PRESETS.has(kind) ? (
            <div className="space-y-2">
              <SegmentedControl
                value={sourceMode}
                options={SOURCE_MODE_OPTIONS}
                ariaLabel="Generator source"
                onChange={(mode) => {
                  setSourceMode(mode);
                  if (mode === "token" && !sourceAdvancedOpen) {
                    setSourceCollectionId(targetCollectionId);
                  }
                }}
              />

              {sourceMode === "literal" ? (
                kind === "colorRamp" ? (
                  <GeneratorColorField
                    label="Source value"
                    value={sourceValue}
                    allTokensFlat={allTargetTokensFlat}
                    onChange={setSourceValue}
                  />
                ) : kind === "formula" ? (
                  <GeneratorNumberField
                    label="Source value"
                    value={sourceValue}
                    onChange={(value) => setSourceValue(String(value))}
                  />
                ) : (
                  <GeneratorDimensionField
                    label="Source value"
                    value={parseGeneratorDimensionInput(sourceValue)}
                    allTokensFlat={allTargetTokensFlat}
                    pathToCollectionId={pathToCollectionId}
                    onChange={(value) => setSourceValue(formatGeneratorDimensionInput(value))}
                  />
                )
              ) : (
                <div className="space-y-2">
                  <div>
                    <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
                      Source token
                    </span>
                    <div className="flex items-center gap-2 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
                      <Search
                        size={14}
                        className="text-[color:var(--color-figma-text-secondary)]"
                      />
                      <input
                        value={sourceQuery}
                        onChange={(event) => setSourceQuery(event.target.value)}
                        placeholder={sourceTokenPath || "Search compatible tokens"}
                        className="min-w-0 flex-1 bg-transparent text-secondary text-[color:var(--color-figma-text)] outline-none"
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
                        <span className="block truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
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
                        className="mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]"
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
                          <span className="block truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
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
                      <div className="px-2 py-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
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
                    <summary className="cursor-pointer text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
                      Cross-collection source
                    </summary>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
                        Source collection
                      </span>
                      <select
                        value={sourceCollectionId}
                        onChange={(event) => {
                          setSourceCollectionId(event.target.value);
                          setSourceTokenPath("");
                        }}
                        className="w-full rounded bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary text-[color:var(--color-figma-text)] outline-none"
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
                        className={`mt-2 text-tertiary ${modeCompatibility ? "text-[color:var(--color-figma-text-secondary)]" : "text-[color:var(--color-figma-text-error)]"}`}
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
              <NumberStepTable
                label="Steps"
                pathPrefix={outputPrefix}
                values={paletteSteps}
                onChange={setPaletteSteps}
              />
              <div className="grid gap-2 min-[420px]:grid-cols-2">
                <GeneratorNumberField
                  label="Light end"
                  value={paletteLightEnd}
                  onChange={setPaletteLightEnd}
                />
                <GeneratorNumberField
                  label="Dark end"
                  value={paletteDarkEnd}
                  onChange={setPaletteDarkEnd}
                />
              </div>
            </>
          ) : null}

          {kind === "spacing" || kind === "type" || kind === "radius" ? (
            <div className={kind === "type" ? "grid gap-2 min-[420px]:grid-cols-2" : ""}>
              {kind === "type" ? (
                <GeneratorNumberField
                  label="Ratio"
                  value={typeRatio}
                  onChange={setTypeRatio}
                />
              ) : null}
              <GeneratorUnitField label="Unit" value={scaleUnit} onChange={setScaleUnit} />
            </div>
          ) : null}

          {kind === "shadow" ? (
            <GeneratorColorField
              label="Shadow color"
              value={shadowColor}
              allTokensFlat={allTargetTokensFlat}
              onChange={setShadowColor}
            />
          ) : null}

          {kind === "formula" ? (
            <>
              <GeneratorFormulaField
                label="Formula"
                value={formula}
                allTokensFlat={allTargetTokensFlat}
                pathToCollectionId={pathToCollectionId}
                onChange={setFormula}
              />
              <div className="grid gap-2 min-[420px]:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
                    Output type
                  </span>
                  <select
                    value={formulaOutputType}
                    onChange={(event) =>
                      setFormulaOutputType(
                        event.target.value as typeof formulaOutputType,
                      )
                    }
                    className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[color:var(--color-figma-text)] outline-none"
                  >
                    <option value="number">Number</option>
                    <option value="dimension">Dimension</option>
                  </select>
                </label>
                <GeneratorNumberField
                  label="Round to"
                  value={formulaRoundTo}
                  onChange={setFormulaRoundTo}
                />
              </div>
            </>
          ) : null}
          </div>
        </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-3">
              <div>
                <h4 className="text-body font-semibold text-[color:var(--color-figma-text)]">
                  Graph templates
                </h4>
                <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                  Start empty or open a preset shape as editable nodes.
                </p>
              </div>
              <div className="grid gap-2 min-[720px]:grid-cols-2">
                <button
                  type="button"
                  onClick={() => createGraphGenerator()}
                  disabled={busy !== null || !targetCollectionId}
                  className="flex min-h-[72px] items-start justify-between gap-3 rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-3 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-secondary font-semibold text-[color:var(--color-figma-text)]">
                      Blank graph
                    </span>
                    <span className="block text-tertiary text-[color:var(--color-figma-text-secondary)]">
                      Add each node yourself.
                    </span>
                  </span>
                  <Workflow
                    size={14}
                    className="mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]"
                  />
                </button>
                {GENERATOR_PRESET_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => createGraphGenerator(option.id)}
                    disabled={busy !== null || !targetCollectionId}
                    className="flex min-h-[72px] items-start justify-between gap-3 rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-3 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-secondary font-semibold text-[color:var(--color-figma-text)]">
                        {option.label}
                      </span>
                      <span className="block text-tertiary text-[color:var(--color-figma-text-secondary)]">
                        Template graph for {option.outputPrefix}.
                      </span>
                    </span>
                    <PresetIcon kind={option.id} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)] px-3 py-2 text-secondary text-[color:var(--color-figma-text-error)]">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-figma-border)] px-4 py-3">
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
        >
          Cancel
        </Button>
        {startMode === "preset" ? (
          <Button
            onClick={createGenerator}
            disabled={busy !== null || !targetCollectionId}
            variant="primary"
            size="sm"
          >
            {busy ? "Creating..." : "Create preset generator"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function findDuplicateNumber(values: number[]): number | null {
  const seen = new Set<number>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function readPresetUnit(kind: GeneratorPresetKind): string {
  const config = generatorDefaultConfig(kind) as { unit?: unknown };
  return typeof config.unit === "string" ? config.unit : "px";
}

function PresetIcon({ kind }: { kind: GeneratorPresetKind }) {
  const className =
    "mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]";
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
    index === 0 ? token.$value : collectionModes?.[modeName],
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
    <span className="mt-1 flex min-w-0 flex-col gap-0.5 text-tertiary text-[color:var(--color-figma-text-secondary)]">
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
  if (value == null) return "No value";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object" && "value" in value && "unit" in value) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
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
