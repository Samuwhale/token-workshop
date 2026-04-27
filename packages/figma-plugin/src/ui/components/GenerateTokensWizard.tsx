import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Sparkles, X } from "lucide-react";
import type {
  TokenCollection,
  TokenGraphDocument,
  TokenGraphDocumentNode,
  TokenGraphEdge,
  TokenGraphNodeKind,
  TokenGraphPreviewResult,
  TokenType,
} from "@tokenmanager/core";
import {
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { apiFetch } from "../shared/apiFetch";
import { ValuePreview, previewIsValueBearing } from "./ValuePreview";

type GenerateKind =
  | "palette"
  | "spacing"
  | "type"
  | "radius"
  | "opacity"
  | "shadow"
  | "zIndex"
  | "formula";

type SourceMode = "literal" | "token";
type BusyState = "preview" | "apply" | "delete" | null;

interface GenerateTokensWizardProps {
  serverUrl: string;
  collections: TokenCollection[];
  workingCollectionId: string;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onClose: () => void;
  onApplied: (result: { graphId: string; collectionId: string; outputPrefix: string; firstPath?: string }) => void;
  onOpenGraph: (graphId: string) => void;
}

interface GraphResponse {
  graph: TokenGraphDocument;
}

interface GraphPreviewResponse {
  preview: TokenGraphPreviewResult;
}

interface GraphApplyResponse {
  preview: TokenGraphPreviewResult;
  created: string[];
  updated: string[];
  deleted: string[];
  operationId?: string;
}

const GENERATE_OPTIONS: Array<{
  id: GenerateKind;
  label: string;
  prefix: string;
  source: SourceMode;
}> = [
  { id: "palette", label: "Palette", prefix: "color.brand", source: "literal" },
  { id: "spacing", label: "Spacing scale", prefix: "spacing", source: "literal" },
  { id: "type", label: "Type scale", prefix: "fontSize", source: "literal" },
  { id: "radius", label: "Radius", prefix: "radius", source: "literal" },
  { id: "opacity", label: "Opacity", prefix: "opacity", source: "literal" },
  { id: "shadow", label: "Shadow", prefix: "shadow", source: "literal" },
  { id: "zIndex", label: "Z-index", prefix: "zIndex", source: "literal" },
  { id: "formula", label: "Formula scale", prefix: "scale", source: "literal" },
];

const GRAPH_KIND_BY_GENERATE_KIND: Record<GenerateKind, TokenGraphNodeKind> = {
  palette: "colorRamp",
  spacing: "spacingScale",
  type: "typeScale",
  radius: "borderRadiusScale",
  opacity: "opacityScale",
  shadow: "shadowScale",
  zIndex: "zIndexScale",
  formula: "customScale",
};

const SOURCELESS_KINDS = new Set<GenerateKind>(["opacity", "shadow", "zIndex"]);

const GRAPH_TEMPLATE_BY_KIND: Record<GenerateKind, string> = {
  palette: "colorRamp",
  spacing: "spacing",
  type: "type",
  radius: "radius",
  opacity: "opacity",
  shadow: "shadow",
  zIndex: "zIndex",
  formula: "formula",
};

function defaultSourceValue(kind: GenerateKind): string {
  if (kind === "palette") return "#6366f1";
  if (kind === "formula") return "8";
  if (kind === "type") return "16";
  return "4";
}

function defaultConfig(kind: GenerateKind): Record<string, unknown> {
  if (kind === "palette") return { ...DEFAULT_COLOR_RAMP_CONFIG };
  if (kind === "spacing") return { ...DEFAULT_SPACING_SCALE_CONFIG };
  if (kind === "type") return { ...DEFAULT_TYPE_SCALE_CONFIG };
  if (kind === "radius") return { ...DEFAULT_BORDER_RADIUS_SCALE_CONFIG };
  if (kind === "opacity") return { ...DEFAULT_OPACITY_SCALE_CONFIG };
  if (kind === "shadow") return { ...DEFAULT_SHADOW_SCALE_CONFIG };
  if (kind === "zIndex") return { ...DEFAULT_Z_INDEX_SCALE_CONFIG };
  return { ...DEFAULT_CUSTOM_SCALE_CONFIG };
}

function parseNumberList(value: string): number[] {
  return value
    .split(",")
    .map((step) => Number(step.trim()))
    .filter(Number.isFinite);
}

function outputType(kind: GenerateKind): TokenType {
  if (kind === "palette") return "color";
  if (kind === "shadow") return "shadow";
  if (kind === "spacing" || kind === "type" || kind === "radius") return "dimension";
  return "number";
}

function semanticStarterItems(kind: GenerateKind): Array<{ key: string; step: string; type: TokenType }> {
  const type = outputType(kind);
  const starters: Record<GenerateKind, Array<{ key: string; step: string }>> = {
    palette: [
      { key: "background", step: "50" },
      { key: "border", step: "200" },
      { key: "surface", step: "100" },
      { key: "text", step: "900" },
    ],
    spacing: [
      { key: "xs", step: "1" },
      { key: "sm", step: "2" },
      { key: "md", step: "4" },
      { key: "lg", step: "6" },
      { key: "xl", step: "8" },
    ],
    type: [
      { key: "caption", step: "sm" },
      { key: "body", step: "base" },
      { key: "heading", step: "2xl" },
    ],
    radius: [
      { key: "small", step: "sm" },
      { key: "medium", step: "md" },
      { key: "large", step: "lg" },
      { key: "pill", step: "full" },
    ],
    opacity: [
      { key: "disabled", step: "50" },
      { key: "hover", step: "80" },
      { key: "overlay", step: "90" },
    ],
    shadow: [
      { key: "card", step: "sm" },
      { key: "popover", step: "lg" },
      { key: "dialog", step: "xl" },
    ],
    zIndex: [
      { key: "dropdown", step: "dropdown" },
      { key: "modal", step: "modal" },
      { key: "toast", step: "toast" },
    ],
    formula: [
      { key: "small", step: "sm" },
      { key: "medium", step: "md" },
      { key: "large", step: "lg" },
    ],
  };
  return starters[kind].map((item) => ({
    key: item.key,
    step: item.step,
    type,
  }));
}

function makeLiteralData(kind: GenerateKind, raw: string): Record<string, unknown> {
  if (kind === "palette") {
    return { type: "color", value: raw.trim() || "#6366f1" };
  }
  if (kind === "formula") {
    return { type: "number", value: Number(raw) || 0 };
  }
  return { type: "dimension", value: Number(raw) || 0, unit: "px" };
}

function buildGraphNodes(options: {
  kind: GenerateKind;
  sourceMode: SourceMode;
  sourceValue: string;
  sourceCollectionId: string;
  sourceTokenPath: string;
  outputPrefix: string;
  semanticPrefix: string;
  includeSemanticAliases: boolean;
  config: Record<string, unknown>;
}): { nodes: TokenGraphDocumentNode[]; edges: TokenGraphEdge[] } {
  const generationId = "generation";
  const outputId = "output";
  const nodes: TokenGraphDocumentNode[] = [];
  const edges: TokenGraphEdge[] = [];
  const hasSource = !SOURCELESS_KINDS.has(options.kind);

  if (hasSource) {
    nodes.push({
      id: "source",
      kind: options.sourceMode === "token" ? "tokenInput" : "literal",
      label: options.sourceMode === "token" ? "Source token" : "Source value",
      position: { x: 80, y: 130 },
      data:
        options.sourceMode === "token"
          ? { collectionId: options.sourceCollectionId, path: options.sourceTokenPath }
          : makeLiteralData(options.kind, options.sourceValue),
    });
    edges.push({
      id: "source-generation",
      from: { nodeId: "source", port: "value" },
      to: { nodeId: generationId, port: "value" },
    });
  }

  nodes.push({
    id: generationId,
    kind: GRAPH_KIND_BY_GENERATE_KIND[options.kind],
    label: GENERATE_OPTIONS.find((item) => item.id === options.kind)?.label ?? "Generate tokens",
    position: { x: hasSource ? 340 : 110, y: 120 },
    data: { ...options.config },
  });
  nodes.push({
    id: outputId,
    kind: "groupOutput",
    label: "Output tokens",
    position: { x: hasSource ? 630 : 400, y: 120 },
    data: { pathPrefix: options.outputPrefix },
  });
  edges.push({
    id: "generation-output",
    from: { nodeId: generationId, port: "value" },
    to: { nodeId: outputId, port: "value" },
  });

  if (options.includeSemanticAliases && options.semanticPrefix.trim()) {
    const aliasListId = "semantic-aliases";
    const semanticOutputId = "semantic-output";
    nodes.push({
      id: aliasListId,
      kind: "list",
      label: "Starter semantic tokens",
      position: { x: 340, y: 320 },
      data: {
        type: "token",
        items: semanticStarterItems(options.kind).map((item) => ({
          key: item.key,
          label: item.key,
          value: `{${options.outputPrefix}.${item.step}}`,
          type: item.type,
        })),
      },
    });
    nodes.push({
      id: semanticOutputId,
      kind: "groupOutput",
      label: "Semantic tokens",
      position: { x: 630, y: 320 },
      data: { pathPrefix: options.semanticPrefix.trim() },
    });
    edges.push({
      id: "aliases-output",
      from: { nodeId: aliasListId, port: "value" },
      to: { nodeId: semanticOutputId, port: "value" },
    });
  }

  return { nodes, edges };
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (
    typeof value === "object" &&
    "value" in value &&
    "unit" in value
  ) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}

export function GenerateTokensWizard({
  serverUrl,
  collections,
  workingCollectionId,
  perCollectionFlat,
  onClose,
  onApplied,
  onOpenGraph,
}: GenerateTokensWizardProps) {
  const initialKind: GenerateKind = "palette";
  const [kind, setKind] = useState<GenerateKind>(initialKind);
  const [targetCollectionId, setTargetCollectionId] = useState(workingCollectionId || collections[0]?.id || "");
  const [outputPrefix, setOutputPrefix] = useState("color.brand");
  const [sourceMode, setSourceMode] = useState<SourceMode>("literal");
  const [sourceValue, setSourceValue] = useState(defaultSourceValue(initialKind));
  const [sourceCollectionId, setSourceCollectionId] = useState(workingCollectionId || collections[0]?.id || "");
  const [sourceTokenPath, setSourceTokenPath] = useState("");
  const [includeSemanticAliases, setIncludeSemanticAliases] = useState(false);
  const [semanticPrefix, setSemanticPrefix] = useState("semantic.color");
  const [paletteSteps, setPaletteSteps] = useState(DEFAULT_COLOR_RAMP_CONFIG.steps.join(", "));
  const [paletteLightEnd, setPaletteLightEnd] = useState(DEFAULT_COLOR_RAMP_CONFIG.lightEnd);
  const [paletteDarkEnd, setPaletteDarkEnd] = useState(DEFAULT_COLOR_RAMP_CONFIG.darkEnd);
  const [scaleUnit, setScaleUnit] = useState("px");
  const [typeRatio, setTypeRatio] = useState(DEFAULT_TYPE_SCALE_CONFIG.ratio);
  const [shadowColor, setShadowColor] = useState(DEFAULT_SHADOW_SCALE_CONFIG.color);
  const [formula, setFormula] = useState(DEFAULT_CUSTOM_SCALE_CONFIG.formula);
  const [formulaRoundTo, setFormulaRoundTo] = useState(DEFAULT_CUSTOM_SCALE_CONFIG.roundTo);
  const [formulaOutputType, setFormulaOutputType] = useState(DEFAULT_CUSTOM_SCALE_CONFIG.outputType);
  const [draftGraph, setDraftGraph] = useState<TokenGraphDocument | null>(null);
  const [preview, setPreview] = useState<TokenGraphPreviewResult | null>(null);
  const [previewPayloadKey, setPreviewPayloadKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);
  const draftGraphIdRef = useRef<string | null>(null);
  const draftPreservedRef = useRef(false);
  const latestPayloadKeyRef = useRef("");

  const selectedOption = GENERATE_OPTIONS.find((item) => item.id === kind) ?? GENERATE_OPTIONS[0];
  const targetCollection = collections.find((collection) => collection.id === targetCollectionId);
  const sourceTokenOptions = useMemo(() => {
    const tokens = perCollectionFlat[sourceCollectionId] ?? {};
    return Object.entries(tokens)
      .filter(([, token]) => {
        if (kind === "palette") return token.$type === "color";
        if (kind === "formula") return token.$type === "number" || token.$type === "dimension";
        return token.$type === "dimension" || token.$type === "number";
      })
      .map(([path]) => path)
      .sort((a, b) => a.localeCompare(b));
  }, [kind, perCollectionFlat, sourceCollectionId]);

  const previewBlocking = Boolean(
    preview?.blocking ||
      preview?.outputs.length === 0 ||
      preview?.outputs.some((output) => output.collision),
  );
  const modes = targetCollection?.modes.map((mode) => mode.name) ?? preview?.targetModes ?? [];
  const generationConfig = useMemo(() => {
    if (kind === "palette") {
      return {
        ...DEFAULT_COLOR_RAMP_CONFIG,
        steps: parseNumberList(paletteSteps),
        lightEnd: paletteLightEnd,
        darkEnd: paletteDarkEnd,
      };
    }
    if (kind === "spacing") {
      return { ...DEFAULT_SPACING_SCALE_CONFIG, unit: scaleUnit };
    }
    if (kind === "type") {
      return { ...DEFAULT_TYPE_SCALE_CONFIG, ratio: typeRatio, unit: scaleUnit };
    }
    if (kind === "radius") {
      return { ...DEFAULT_BORDER_RADIUS_SCALE_CONFIG, unit: scaleUnit };
    }
    if (kind === "shadow") {
      return { ...DEFAULT_SHADOW_SCALE_CONFIG, color: shadowColor };
    }
    if (kind === "formula") {
      return {
        ...DEFAULT_CUSTOM_SCALE_CONFIG,
        formula,
        roundTo: formulaRoundTo,
        outputType: formulaOutputType,
      };
    }
    return defaultConfig(kind);
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

  useEffect(() => {
    return () => {
      const draftGraphId = draftGraphIdRef.current;
      if (!draftGraphId || draftPreservedRef.current) return;
      void apiFetch(`${serverUrl}/api/graphs/${encodeURIComponent(draftGraphId)}`, {
        method: "DELETE",
      }).catch(() => {});
    };
  }, [serverUrl]);

  const updateKind = useCallback((nextKind: GenerateKind) => {
    const option = GENERATE_OPTIONS.find((item) => item.id === nextKind) ?? GENERATE_OPTIONS[0];
    setKind(nextKind);
    setOutputPrefix(option.prefix);
    setSourceMode(option.source);
    setSourceValue(defaultSourceValue(nextKind));
    setSemanticPrefix(`semantic.${option.prefix.split(".")[0]}`);
    setScaleUnit(nextKind === "type" ? DEFAULT_TYPE_SCALE_CONFIG.unit : "px");
    setSourceTokenPath("");
    setPreview(null);
    setError(null);
  }, []);

  const graphPayload = useCallback(() => {
    const graph = buildGraphNodes({
      kind,
      sourceMode,
      sourceValue,
      sourceCollectionId,
      sourceTokenPath,
      outputPrefix: outputPrefix.trim(),
      semanticPrefix,
      includeSemanticAliases,
      config: generationConfig,
    });
    return {
      name: `${selectedOption.label} automation`,
      targetCollectionId,
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }, [
    includeSemanticAliases,
    generationConfig,
    kind,
    outputPrefix,
    selectedOption.label,
    semanticPrefix,
    sourceCollectionId,
    sourceMode,
    sourceTokenPath,
    sourceValue,
    targetCollectionId,
  ]);
  const currentPayloadKey = useMemo(() => JSON.stringify(graphPayload()), [graphPayload]);

  useEffect(() => {
    latestPayloadKeyRef.current = currentPayloadKey;
  }, [currentPayloadKey]);

  const ensureDraftGraph = useCallback(async () => {
    if (draftGraph) return draftGraph;
    const data = await apiFetch<GraphResponse>(`${serverUrl}/api/graphs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${selectedOption.label} automation`,
        targetCollectionId,
        template: GRAPH_TEMPLATE_BY_KIND[kind],
      }),
    });
    setDraftGraph(data.graph);
    draftGraphIdRef.current = data.graph.id;
    return data.graph;
  }, [draftGraph, kind, selectedOption.label, serverUrl, targetCollectionId]);

  const handlePreview = useCallback(async () => {
    if (!targetCollectionId) {
      setError("Choose a collection first.");
      return;
    }
    if (!outputPrefix.trim()) {
      setError("Choose an output group.");
      return;
    }
    if (!SOURCELESS_KINDS.has(kind) && sourceMode === "token" && !sourceTokenPath.trim()) {
      setError("Choose a source token.");
      return;
    }
    if (kind === "palette" && parseNumberList(paletteSteps).length === 0) {
      setError("Add at least one numeric palette step.");
      return;
    }
    setBusy("preview");
    setError(null);
    try {
      const draft = await ensureDraftGraph();
      const payload = graphPayload();
      const payloadKey = JSON.stringify(payload);
      const updated = await apiFetch<GraphResponse>(
        `${serverUrl}/api/graphs/${encodeURIComponent(draft.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      setDraftGraph(updated.graph);
      draftGraphIdRef.current = updated.graph.id;
      const data = await apiFetch<GraphPreviewResponse>(
        `${serverUrl}/api/graphs/${encodeURIComponent(updated.graph.id)}/preview`,
        { method: "POST" },
      );
      if (payloadKey !== latestPayloadKeyRef.current) {
        return;
      }
      setPreview(data.preview);
      setPreviewPayloadKey(payloadKey);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setBusy(null);
    }
  }, [
    ensureDraftGraph,
    graphPayload,
    kind,
    outputPrefix,
    paletteSteps,
    serverUrl,
    sourceMode,
    sourceTokenPath,
    targetCollectionId,
  ]);

  const handleApply = useCallback(async () => {
    if (!draftGraph || !preview || previewBlocking || previewPayloadKey !== currentPayloadKey) return;
    setBusy("apply");
    setError(null);
    try {
      const result = await apiFetch<GraphApplyResponse>(
        `${serverUrl}/api/graphs/${encodeURIComponent(draftGraph.id)}/apply`,
        { method: "POST" },
      );
      draftPreservedRef.current = true;
      onApplied({
        graphId: draftGraph.id,
        collectionId: targetCollectionId,
        outputPrefix: outputPrefix.trim(),
        firstPath: result.created[0] ?? result.updated[0] ?? result.preview.outputs[0]?.path,
      });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setBusy(null);
    }
  }, [currentPayloadKey, draftGraph, onApplied, outputPrefix, preview, previewBlocking, previewPayloadKey, serverUrl, targetCollectionId]);

  const handleOpenGraph = useCallback(async () => {
    setBusy("preview");
    setError(null);
    try {
      const draft = await ensureDraftGraph();
      const updated = await apiFetch<GraphResponse>(
        `${serverUrl}/api/graphs/${encodeURIComponent(draft.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(graphPayload()),
        },
      );
      draftPreservedRef.current = true;
      onOpenGraph(updated.graph.id);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    } finally {
      setBusy(null);
    }
  }, [ensureDraftGraph, graphPayload, onOpenGraph, serverUrl]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-4 py-3">
        <Sparkles size={15} className="text-[var(--color-figma-accent)]" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-body font-semibold text-[var(--color-figma-text)]">
          Generate tokens
        </h3>
        <button
          type="button"
          onClick={handleOpenGraph}
          disabled={busy !== null || !targetCollectionId}
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
        >
          <ExternalLink size={12} aria-hidden />
          Open in Graph
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
          {GENERATE_OPTIONS.map((option) => (
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

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Collection
            </span>
            <select
              value={targetCollectionId}
              onChange={(event) => {
                setTargetCollectionId(event.target.value);
                setPreview(null);
              }}
              className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name || collection.id}
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

          {!SOURCELESS_KINDS.has(kind) ? (
            <div className="space-y-2">
              <div className="flex rounded bg-[var(--color-figma-bg-secondary)] p-0.5">
                {(["literal", "token"] as SourceMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSourceMode(mode);
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
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <label className="block">
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
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
                    >
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name || collection.id}
                        </option>
                      ))}
                    </select>
                  </label>
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
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            {kind === "palette" ? (
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
                        setFormulaOutputType(event.target.value as typeof formulaOutputType);
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

          <label className="flex items-start gap-2 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-2">
            <input
              type="checkbox"
              checked={includeSemanticAliases}
              onChange={(event) => {
                setIncludeSemanticAliases(event.target.checked);
                setPreview(null);
              }}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-secondary font-medium text-[var(--color-figma-text)]">
                Starter semantic tokens
              </span>
              <span className="block text-tertiary text-[var(--color-figma-text-secondary)]">
                Add common names that stay linked to the generated tokens.
              </span>
            </span>
          </label>

          {includeSemanticAliases ? (
            <label className="block">
              <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                Semantic group
              </span>
              <input
                value={semanticPrefix}
                onChange={(event) => {
                  setSemanticPrefix(event.target.value);
                  setPreview(null);
                }}
                className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary text-[var(--color-figma-text)] outline-none"
              />
            </label>
          ) : null}
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
              Preview creates a draft graph and shows exactly which tokens will change.
            </div>
          ) : (
            <div className="space-y-2">
              {preview.diagnostics.map((diagnostic) => (
                <div
                  key={diagnostic.id}
                  className="rounded bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text)]"
                >
                  <span className="font-semibold capitalize">{diagnostic.severity}</span>
                  <span className="text-[var(--color-figma-text-secondary)]">: {diagnostic.message}</span>
                </div>
              ))}
              {preview.outputs.length === 0 ? (
                <div className="rounded bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-error)]">
                  No tokens will be created. Adjust the source or steps and preview again.
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
                      <div key={modeName} className="grid grid-cols-[70px_1fr] gap-2 text-tertiary">
                        <span className="truncate text-[var(--color-figma-text-secondary)]">{modeName}</span>
                        <span className="min-w-0 flex items-center gap-1.5 text-[var(--color-figma-text)]">
                          {previewIsValueBearing(output.type) ? (
                            <ValuePreview type={output.type} value={output.modeValues[modeName]} size={12} />
                          ) : null}
                          <span className="truncate">{formatValue(output.modeValues[modeName])}</span>
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
          disabled={busy !== null || !preview || previewBlocking || previewPayloadKey !== currentPayloadKey}
          className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-secondary font-semibold text-[var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {busy === "apply" ? "Applying..." : "Apply"}
        </button>
      </div>
    </div>
  );
}
