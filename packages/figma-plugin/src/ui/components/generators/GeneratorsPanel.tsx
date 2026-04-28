import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
  Check,
  Database,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  TokenCollection,
  TokenGeneratorDocument,
  TokenGeneratorEdge,
  TokenGeneratorDocumentNode,
  TokenGeneratorPreviewResult,
} from "@tokenmanager/core";
import {
  GENERATOR_PRESET_OPTIONS,
  SOURCELESS_GENERATOR_PRESETS,
  buildGeneratorNodesFromStructuredDraft,
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
  generatorDefaultConfig,
  generatorDefaultSourceValue,
  readStructuredGeneratorDraft,
  type GeneratorPresetKind,
  type GeneratorSourceMode,
  type GeneratorStructuredDraft,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { apiFetch } from "../../shared/apiFetch";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";
import { GeneratorCreatePanel } from "../GeneratorCreatePanel";
import {
  GeneratorListSidebar,
  NodeLibraryPanel,
  type GeneratorPaletteItem,
} from "./GeneratorWorkspacePanels";
import "@xyflow/react/dist/style.css";

interface GeneratorsPanelProps {
  serverUrl: string;
  collections: TokenCollection[];
  workingCollectionId: string;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  tokenChangeKey?: number;
  initialGeneratorId?: string | null;
  initialFocus?: GeneratorPanelFocus | null;
  onInitialGeneratorHandled?: () => void;
}

export interface GeneratorPanelFocus {
  diagnosticId?: string;
  nodeId?: string;
  edgeId?: string;
}

interface GeneratorListResponse {
  generators: TokenGeneratorDocument[];
}

interface GeneratorResponse {
  generator: TokenGeneratorDocument;
}

interface GeneratorPreviewResponse {
  preview: TokenGeneratorPreviewResult;
}

interface GeneratorApplyResponse {
  preview: TokenGeneratorPreviewResult;
  operationId?: string;
  created: string[];
  updated: string[];
  deleted: string[];
}

interface GraphIssue {
  id: string;
  nodeId?: string;
  severity: "error" | "warning" | "info";
  message: string;
}

type GraphFlowNode = Node<
  {
    graphNode: TokenGeneratorDocumentNode;
    preview?: TokenGeneratorPreviewResult;
    issues?: GraphIssue[];
  },
  "graphNode"
>;
type GraphFlowEdge = Edge<Record<string, never>>;

const PALETTE: GeneratorPaletteItem[] = [
  {
    category: "Inputs",
    kind: "tokenInput",
    label: "Token input",
    defaults: { path: "" },
  },
  {
    category: "Inputs",
    kind: "literal",
    label: "Color",
    defaults: { type: "color", value: "#6366f1" },
  },
  {
    category: "Inputs",
    kind: "literal",
    label: "Number",
    defaults: { type: "number", value: 1 },
  },
  {
    category: "Inputs",
    kind: "literal",
    label: "Dimension",
    defaults: { type: "dimension", value: 16, unit: "px" },
  },
  {
    category: "Inputs",
    kind: "literal",
    label: "String",
    defaults: { type: "string", value: "" },
  },
  {
    category: "Math",
    kind: "math",
    label: "Add",
    defaults: { operation: "add", amount: 1 },
  },
  {
    category: "Math",
    kind: "math",
    label: "Scale by",
    defaults: { operation: "scaleBy", amount: 1.25 },
  },
  {
    category: "Math",
    kind: "math",
    label: "Clamp",
    defaults: { operation: "clamp", min: 0, max: 1 },
  },
  {
    category: "Math",
    kind: "formula",
    label: "Formula",
    defaults: { expression: "var1 * 2" },
  },
  {
    category: "Color",
    kind: "color",
    label: "Lighten",
    defaults: { operation: "lighten", amount: 8 },
  },
  {
    category: "Color",
    kind: "color",
    label: "Darken",
    defaults: { operation: "darken", amount: 8 },
  },
  {
    category: "Color",
    kind: "color",
    label: "Alpha",
    defaults: { operation: "alpha", amount: 0.6 },
  },
  {
    category: "Color",
    kind: "color",
    label: "Mix",
    defaults: { operation: "mix", mixWith: "#ffffff", ratio: 0.5 },
  },
  {
    category: "Color",
    kind: "colorRamp",
    label: "Ramp",
    defaults: { ...DEFAULT_COLOR_RAMP_CONFIG },
  },
  {
    category: "Scales",
    kind: "spacingScale",
    label: "Spacing scale",
    defaults: { ...DEFAULT_SPACING_SCALE_CONFIG },
  },
  {
    category: "Scales",
    kind: "typeScale",
    label: "Type scale",
    defaults: { ...DEFAULT_TYPE_SCALE_CONFIG },
  },
  {
    category: "Scales",
    kind: "borderRadiusScale",
    label: "Radius scale",
    defaults: { ...DEFAULT_BORDER_RADIUS_SCALE_CONFIG },
  },
  {
    category: "Scales",
    kind: "opacityScale",
    label: "Opacity scale",
    defaults: { ...DEFAULT_OPACITY_SCALE_CONFIG },
  },
  {
    category: "Scales",
    kind: "shadowScale",
    label: "Shadow scale",
    defaults: { ...DEFAULT_SHADOW_SCALE_CONFIG },
  },
  {
    category: "Scales",
    kind: "zIndexScale",
    label: "Z-index scale",
    defaults: { ...DEFAULT_Z_INDEX_SCALE_CONFIG },
  },
  {
    category: "Scales",
    kind: "customScale",
    label: "Formula scale",
    defaults: { ...DEFAULT_CUSTOM_SCALE_CONFIG },
  },
  {
    category: "Lists",
    kind: "list",
    label: "Step list",
    defaults: { type: "number", items: [1, 2, 3, 4, 5] },
  },
  {
    category: "Outputs",
    kind: "alias",
    label: "Alias",
    defaults: { path: "" },
  },
  {
    category: "Outputs",
    kind: "output",
    label: "Token output",
    defaults: { path: "semantic.token" },
  },
  {
    category: "Outputs",
    kind: "groupOutput",
    label: "Group output",
    defaults: { pathPrefix: "generated.group" },
  },
];

const NODE_TYPES = {
  graphNode: GeneratorDocumentNode,
};

export function GeneratorsPanel({
  serverUrl,
  collections,
  workingCollectionId,
  perCollectionFlat,
  onNavigateToToken,
  tokenChangeKey,
  initialGeneratorId,
  initialFocus,
  onInitialGeneratorHandled,
}: GeneratorsPanelProps) {
  const [generators, setGenerators] = useState<TokenGeneratorDocument[]>([]);
  const [activeGeneratorId, setActiveGeneratorId] = useState<string | null>(
    null,
  );
  const [preview, setPreview] = useState<TokenGeneratorPreviewResult | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [externalPreviewInvalidated, setExternalPreviewInvalidated] =
    useState(false);
  const [lastApply, setLastApply] = useState<GeneratorApplyResponse | null>(
    null,
  );
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [allNodesOpen, setAllNodesOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false);
  const [inspectorErrors, setInspectorErrors] = useState<
    Record<string, string>
  >({});
  const [activeInitialFocus, setActiveInitialFocus] =
    useState<GeneratorPanelFocus | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    GraphFlowNode,
    GraphFlowEdge
  > | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphFlowEdge>([]);
  const previewRef = useRef<TokenGeneratorPreviewResult | null>(null);

  const activeGenerator = useMemo(
    () => generators.find((graph) => graph.id === activeGeneratorId) ?? null,
    [generators, activeGeneratorId],
  );
  const scopedGenerators = useMemo(
    () =>
      generators.filter(
        (generator) => generator.targetCollectionId === workingCollectionId,
      ),
    [generators, workingCollectionId],
  );
  const targetCollection = useMemo(
    () =>
      collections.find(
        (collection) => collection.id === activeGenerator?.targetCollectionId,
      ),
    [activeGenerator?.targetCollectionId, collections],
  );
  const selectedNode = useMemo(
    () =>
      activeGenerator?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [activeGenerator, selectedNodeId],
  );
  const structuredDraft = useMemo(
    () =>
      activeGenerator ? readStructuredGeneratorDraft(activeGenerator) : null,
    [activeGenerator],
  );
  const graphIssues = useMemo(
    () =>
      activeGenerator
        ? collectGraphIssues(activeGenerator, inspectorErrors, preview)
        : [],
    [activeGenerator, inspectorErrors, preview],
  );
  const previewHasCollisions =
    preview?.outputs.some((output) => output.collision) ?? false;
  const previewHasNoOutputs = preview ? preview.outputs.length === 0 : false;
  const inspectorHasErrors = Object.keys(inspectorErrors).length > 0;
  const reviewPanelOpen =
    Boolean(preview) && !nodeLibraryOpen && !inspectorOpen;

  const loadGenerators = useCallback(async () => {
    const data = await apiFetch<GeneratorListResponse>(
      `${serverUrl}/api/generators`,
    );
    setGenerators(data.generators);
    setActiveGeneratorId((current) => {
      if (dirty) return current;
      const currentGenerator = data.generators.find(
        (generator) => generator.id === current,
      );
      if (currentGenerator?.targetCollectionId === workingCollectionId)
        return current;
      return (
        data.generators.find(
          (generator) => generator.targetCollectionId === workingCollectionId,
        )?.id ?? null
      );
    });
  }, [dirty, serverUrl, workingCollectionId]);

  useEffect(() => {
    loadGenerators().catch((loadError) =>
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      ),
    );
  }, [loadGenerators]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    if (!initialGeneratorId) return;
    const initialGenerator = generators.find(
      (generator) => generator.id === initialGeneratorId,
    );
    if (!initialGenerator) return;
    let cancelled = false;
    const focus = initialFocus ?? null;
    setActiveInitialFocus(focus);
    setActiveGeneratorId(initialGeneratorId);
    setPreview(null);
    setError(null);
    setLastApply(null);
    setDirty(false);
    setExternalPreviewInvalidated(false);
    if (focus?.nodeId) {
      setSelectedNodeId(focus.nodeId);
      setInspectorOpen(true);
    }
    setInspectorErrors({});
    setBusy("preview");
    apiFetch<GeneratorPreviewResponse>(
      `${serverUrl}/api/generators/${encodeURIComponent(initialGenerator.id)}/preview`,
      { method: "POST" },
    )
      .then((data) => {
        if (cancelled) return;
        setPreview(data.preview);
        setExternalPreviewInvalidated(false);
      })
      .catch((previewError) => {
        if (cancelled) return;
        setError(
          previewError instanceof Error
            ? previewError.message
            : String(previewError),
        );
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    onInitialGeneratorHandled?.();
    return () => {
      cancelled = true;
    };
  }, [
    generators,
    initialFocus,
    initialGeneratorId,
    onInitialGeneratorHandled,
    serverUrl,
  ]);

  useEffect(() => {
    if (initialGeneratorId) return;
    if (
      activeGenerator &&
      activeGenerator.targetCollectionId === workingCollectionId
    )
      return;
    if (dirty) {
      setError("Save the current generator before switching collections.");
      return;
    }
    setActiveGeneratorId(scopedGenerators[0]?.id ?? null);
  }, [
    activeGenerator,
    dirty,
    initialGeneratorId,
    scopedGenerators,
    workingCollectionId,
  ]);

  useEffect(() => {
    if (!previewRef.current) return;
    setPreview(null);
    setLastApply(null);
    setExternalPreviewInvalidated(true);
  }, [tokenChangeKey]);

  useEffect(() => {
    if (selectedNodeId) {
      setInspectorOpen(true);
    }
  }, [selectedNodeId]);

  useEffect(() => {
    if (!activeGenerator) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes(toFlowNodes(activeGenerator, preview, graphIssues));
    setEdges(toFlowEdges(activeGenerator.edges));
    setSelectedNodeId((current) =>
      current && activeGenerator.nodes.some((node) => node.id === current)
        ? current
        : null,
    );
  }, [activeGenerator, graphIssues, preview, setEdges, setNodes]);

  const patchActiveGraph = useCallback(
    (patch: Partial<TokenGeneratorDocument>) => {
      if (!activeGenerator) return;
      const baseGenerator = graphWithFlowState(activeGenerator, nodes, edges);
      setGenerators((current) =>
        current.map((graph) =>
          graph.id === activeGenerator.id
            ? {
                ...baseGenerator,
                ...patch,
                updatedAt: new Date().toISOString(),
              }
            : graph,
        ),
      );
      setDirty(true);
      setPreview(null);
      setLastApply(null);
      setExternalPreviewInvalidated(false);
    },
    [activeGenerator, edges, nodes],
  );

  const syncFlowToGenerator = useCallback(() => {
    if (!activeGenerator) return activeGenerator;
    const nextGenerator = graphWithFlowState(activeGenerator, nodes, edges);
    setGenerators((current) =>
      current.map((graph) =>
        graph.id === activeGenerator.id ? nextGenerator : graph,
      ),
    );
    return nextGenerator;
  }, [activeGenerator, edges, nodes, setGenerators]);

  const updateStructuredDraft = useCallback(
    (patch: Partial<GeneratorStructuredDraft>) => {
      if (!activeGenerator || !structuredDraft) return;
      const nextDraft: GeneratorStructuredDraft = {
        ...structuredDraft,
        ...patch,
        config: patch.config
          ? { ...structuredDraft.config, ...patch.config }
          : structuredDraft.config,
      };
      const generated = buildGeneratorNodesFromStructuredDraft(nextDraft);
      patchActiveGraph({
        nodes: generated.nodes,
        edges: generated.edges,
      });
    },
    [activeGenerator, patchActiveGraph, structuredDraft],
  );

  const saveGenerator = useCallback(async () => {
    if (inspectorHasErrors) {
      setError("Fix inspector input before saving.");
      return null;
    }
    const generator = syncFlowToGenerator();
    if (!generator) return null;
    setBusy("save");
    setError(null);
    try {
      const data = await apiFetch<GeneratorResponse>(
        `${serverUrl}/api/generators/${encodeURIComponent(generator.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: generator.name,
            targetCollectionId: generator.targetCollectionId,
            nodes: generator.nodes,
            edges: generator.edges,
            viewport: generator.viewport,
          }),
        },
      );
      setGenerators((current) =>
        current.map((candidate) =>
          candidate.id === data.generator.id ? data.generator : candidate,
        ),
      );
      setDirty(false);
      setExternalPreviewInvalidated(false);
      return data.generator;
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
      return null;
    } finally {
      setBusy(null);
    }
  }, [inspectorHasErrors, serverUrl, syncFlowToGenerator]);

  const previewGenerator = useCallback(async () => {
    if (inspectorHasErrors) {
      setError("Fix inspector input before previewing.");
      return;
    }
    const saved = dirty ? await saveGenerator() : activeGenerator;
    if (!saved) return;
    setBusy("preview");
    setError(null);
    setActiveInitialFocus(null);
    try {
      const data = await apiFetch<GeneratorPreviewResponse>(
        `${serverUrl}/api/generators/${encodeURIComponent(saved.id)}/preview`,
        { method: "POST" },
      );
      setPreview(data.preview);
      setExternalPreviewInvalidated(false);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : String(previewError),
      );
    } finally {
      setBusy(null);
    }
  }, [activeGenerator, dirty, inspectorHasErrors, saveGenerator, serverUrl]);

  const applyGenerator = useCallback(async () => {
    if (
      inspectorHasErrors ||
      !preview ||
      dirty ||
      preview.blocking ||
      preview.outputs.length === 0 ||
      preview.outputs.some((output) => output.collision)
    ) {
      setError("Review the latest generator changes before applying.");
      return;
    }
    const saved = activeGenerator;
    if (!saved) return;
    setBusy("apply");
    setError(null);
    try {
      const data = await apiFetch<GeneratorApplyResponse>(
        `${serverUrl}/api/generators/${encodeURIComponent(saved.id)}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previewHash: preview.hash }),
        },
      );
      setPreview(data.preview);
      setLastApply(data);
      await loadGenerators();
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : String(applyError),
      );
    } finally {
      setBusy(null);
    }
  }, [
    activeGenerator,
    dirty,
    inspectorHasErrors,
    loadGenerators,
    preview,
    serverUrl,
  ]);

  const deleteGenerator = useCallback(async () => {
    if (!activeGenerator) return;
    setBusy("delete");
    setError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${encodeURIComponent(activeGenerator.id)}`,
        {
          method: "DELETE",
        },
      );
      const nextGenerators = generators.filter(
        (generator) => generator.id !== activeGenerator.id,
      );
      setGenerators(nextGenerators);
      setActiveGeneratorId(nextGenerators[0]?.id ?? null);
      setPreview(null);
      setDirty(false);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setBusy(null);
    }
  }, [activeGenerator, generators, serverUrl]);

  const selectGenerator = useCallback(
    (generatorId: string) => {
      if (dirty) {
        setError("Save the current generator before switching to another one.");
        return;
      }
      setActiveGeneratorId(generatorId);
      setPreview(null);
      setActiveInitialFocus(null);
      setError(null);
      setLastApply(null);
      setExternalPreviewInvalidated(false);
      setDirty(false);
      setInspectorErrors({});
    },
    [dirty],
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      const { label, ...nodeData } = data;
      const updateGraphNode = (node: TokenGeneratorDocumentNode) =>
        node.id === nodeId
          ? {
              ...node,
              ...(typeof label === "string" ? { label } : {}),
              data: { ...node.data, ...nodeData },
            }
          : node;
      if (!activeGenerator) return;
      const currentGenerator = graphWithFlowState(
        activeGenerator,
        nodes,
        edges,
      );
      patchActiveGraph({
        nodes: currentGenerator.nodes.map(updateGraphNode),
      });
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  graphNode: updateGraphNode(node.data.graphNode),
                },
              }
            : node,
        ),
      );
    },
    [activeGenerator, edges, nodes, patchActiveGraph, setNodes],
  );

  const handleInspectorValidationChange = useCallback(
    (nodeId: string, dataKey: string, message: string | null) => {
      const key = `${nodeId}:${dataKey}`;
      setInspectorErrors((current) => {
        if (!message) {
          if (!(key in current)) return current;
          const next = { ...current };
          delete next[key];
          return next;
        }
        return { ...current, [key]: message };
      });
      if (message) {
        setPreview(null);
        setLastApply(null);
        setExternalPreviewInvalidated(false);
      }
    },
    [],
  );

  const addPaletteNode = useCallback(
    (
      item: (typeof PALETTE)[number],
      position?: TokenGeneratorDocumentNode["position"],
    ) => {
      if (!activeGenerator) return;
      const resolvedPosition = position ?? {
        x: 220 + nodes.length * 28,
        y: 120 + nodes.length * 18,
      };
      const id = `${item.kind}_${Math.random().toString(36).slice(2, 8)}`;
      const graphNode: TokenGeneratorDocumentNode = {
        id,
        kind: item.kind,
        label: item.label,
        position: resolvedPosition,
        data: { ...item.defaults },
      };
      const currentGenerator = graphWithFlowState(
        activeGenerator,
        nodes,
        edges,
      );
      patchActiveGraph({
        nodes: [...currentGenerator.nodes, graphNode],
      });
      setNodes((current) => [
        ...current,
        {
          id,
          type: "graphNode",
          position: resolvedPosition,
          data: { graphNode, preview: preview ?? undefined },
        },
      ]);
      setSelectedNodeId(id);
      setInspectorOpen(true);
      setNodeLibraryOpen(false);
    },
    [activeGenerator, edges, nodes, patchActiveGraph, preview, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const graphEdge: TokenGeneratorEdge = {
        id: `${connection.source}-${connection.sourceHandle ?? "value"}-${connection.target}-${connection.targetHandle ?? "value"}`,
        from: {
          nodeId: String(connection.source),
          port: String(connection.sourceHandle ?? "value"),
        },
        to: {
          nodeId: String(connection.target),
          port: String(connection.targetHandle ?? "value"),
        },
      };
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: graphEdge.id,
          },
          current,
        ),
      );
      if (activeGenerator) {
        const currentGenerator = graphWithFlowState(
          activeGenerator,
          nodes,
          edges,
        );
        patchActiveGraph({
          edges: [
            ...currentGenerator.edges.filter(
              (edge) => edge.id !== graphEdge.id,
            ),
            graphEdge,
          ],
        });
      }
      setDirty(true);
      setPreview(null);
      setExternalPreviewInvalidated(false);
    },
    [activeGenerator, edges, nodes, patchActiveGraph, setEdges],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!activeGenerator || !selectedNode) return;
    const currentGenerator = graphWithFlowState(activeGenerator, nodes, edges);
    patchActiveGraph({
      nodes: currentGenerator.nodes.filter(
        (node) => node.id !== selectedNode.id,
      ),
      edges: currentGenerator.edges.filter(
        (edge) =>
          edge.from.nodeId !== selectedNode.id &&
          edge.to.nodeId !== selectedNode.id,
      ),
    });
    setNodes((current) =>
      current.filter((node) => node.id !== selectedNode.id),
    );
    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== selectedNode.id && edge.target !== selectedNode.id,
      ),
    );
    setInspectorErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith(`${selectedNode.id}:`),
        ),
      ),
    );
  }, [
    activeGenerator,
    edges,
    nodes,
    patchActiveGraph,
    selectedNode,
    setEdges,
    setNodes,
  ]);

  const contextualPalette = useMemo(
    () => contextualPaletteItems(PALETTE, selectedNode, activeGenerator),
    [activeGenerator, selectedNode],
  );
  const allPaletteItems = allNodesOpen ? PALETTE : contextualPalette;
  const filteredPalette = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return allPaletteItems.filter(
      (item) =>
        !query ||
        item.label.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query),
    );
  }, [allPaletteItems, paletteQuery]);

  return (
    <div className="flex h-full min-h-0 bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]">
      {leftPanelOpen && (
        <GeneratorListSidebar
          generators={scopedGenerators}
          activeGeneratorId={activeGeneratorId}
          createPanelOpen={createPanelOpen}
          onCreate={() => {
            setCreatePanelOpen(true);
            setError(null);
          }}
          onSelect={(generatorId) => {
            setCreatePanelOpen(false);
            selectGenerator(generatorId);
          }}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {createPanelOpen ? (
          <GeneratorCreatePanel
            serverUrl={serverUrl}
            collections={collections}
            workingCollectionId={workingCollectionId}
            perCollectionFlat={perCollectionFlat}
            onClose={() => setCreatePanelOpen(false)}
            onApplied={({ generatorId, collectionId }) => {
              void loadGenerators();
              if (collectionId === workingCollectionId && generatorId) {
                setActiveGeneratorId(generatorId);
              }
              setCreatePanelOpen(false);
            }}
            onOpenGenerator={(generatorId, collectionId) => {
              void loadGenerators();
              if (collectionId === workingCollectionId) {
                setActiveGeneratorId(generatorId);
              } else {
                setError(
                  `Created in ${collectionId}. Switch collections to edit it.`,
                );
              }
              setCreatePanelOpen(false);
            }}
          />
        ) : (
          <>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] px-3">
              {activeGenerator ? (
                <>
                  <button
                    type="button"
                    title={
                      leftPanelOpen
                        ? "Hide generator list"
                        : "Show generator list"
                    }
                    onClick={() => setLeftPanelOpen((open) => !open)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <PanelLeft size={14} />
                  </button>
                  <input
                    value={activeGenerator.name}
                    onChange={(event) =>
                      patchActiveGraph({ name: event.target.value })
                    }
                    className="min-w-[160px] max-w-[300px] rounded-md bg-transparent px-2 py-1 text-primary font-semibold outline-none hover:bg-[var(--color-figma-bg-hover)] focus:bg-[var(--color-figma-bg-secondary)] max-[760px]:min-w-0 max-[760px]:max-w-[140px]"
                  />
                  <span
                    className="max-w-[220px] truncate rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] max-[760px]:hidden"
                    title={activeGenerator.targetCollectionId}
                  >
                    {targetCollection?.publishRouting?.collectionName?.trim() ||
                      activeGenerator.targetCollectionId}
                  </span>
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                    {inspectorHasErrors
                      ? "Fix inspector input"
                      : dirty
                        ? "Unsaved changes"
                        : externalPreviewInvalidated
                          ? "Recheck preview"
                          : preview?.blocking ||
                              previewHasCollisions ||
                              previewHasNoOutputs
                            ? "Preview has issues"
                            : preview
                              ? "Ready to apply"
                              : "Saved"}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      title={nodeLibraryOpen ? "Hide node library" : "Add step"}
                      onClick={() => {
                        setNodeLibraryOpen((open) => !open);
                        setInspectorOpen(false);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      <Plus size={14} />
                    </button>
                    {selectedNode ? (
                      <button
                        type="button"
                        title={
                          inspectorOpen ? "Hide inspector" : "Show inspector"
                        }
                        onClick={() => {
                          setInspectorOpen((open) => !open);
                          setNodeLibraryOpen(false);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        <PanelRight size={14} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title="Save generator"
                      onClick={saveGenerator}
                      disabled={!dirty || busy !== null || inspectorHasErrors}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-secondary font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      <Save size={14} />
                      <span className="max-[760px]:sr-only">Save</span>
                    </button>
                    <button
                      type="button"
                      title={dirty ? "Save and review" : "Review"}
                      onClick={previewGenerator}
                      disabled={busy !== null || inspectorHasErrors}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-secondary font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      <Play size={14} />
                      <span className="max-[760px]:sr-only">
                        {dirty ? "Save and review" : "Review"}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Apply generator"
                      onClick={applyGenerator}
                      disabled={
                        busy !== null ||
                        dirty ||
                        inspectorHasErrors ||
                        !preview ||
                        Boolean(preview.blocking) ||
                        previewHasCollisions ||
                        previewHasNoOutputs
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-secondary font-semibold text-white disabled:opacity-40"
                    >
                      <Sparkles size={14} />
                      <span className="max-[760px]:sr-only">Apply</span>
                    </button>
                    <button
                      type="button"
                      title="Delete generator"
                      onClick={deleteGenerator}
                      disabled={busy !== null}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    title={
                      leftPanelOpen
                        ? "Hide generator list"
                        : "Show generator list"
                    }
                    onClick={() => setLeftPanelOpen((open) => !open)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <PanelLeft size={14} />
                  </button>
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                    Create a generator to manage generated tokens for a
                    collection.
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreatePanelOpen(true)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-secondary font-semibold text-white"
                  >
                    <Plus size={14} />
                    Create
                  </button>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-[var(--color-figma-error)]/10 px-3 py-2 text-secondary text-[var(--color-figma-error)]">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}
            {lastApply && (
              <div className="flex items-center gap-2 bg-[var(--color-figma-success)]/10 px-3 py-2 text-secondary text-[var(--color-figma-success)]">
                <Check size={14} />
                Applied {lastApply.created.length} created,{" "}
                {lastApply.updated.length} updated, {lastApply.deleted.length}{" "}
                deleted.
              </div>
            )}

            <div className="min-h-0 flex-1">
              {activeGenerator ? (
                <div className="flex h-full min-h-0 overflow-x-auto max-[760px]:flex-col max-[760px]:overflow-x-hidden max-[760px]:overflow-y-auto">
                  <aside className="w-[320px] shrink-0 overflow-y-auto border-r border-[var(--color-figma-border)] p-3 max-[760px]:max-h-[45%] max-[760px]:w-full max-[760px]:border-b max-[760px]:border-r-0">
                    <GeneratorSetupSummary
                      generator={activeGenerator}
                      targetCollection={targetCollection}
                      collections={collections}
                      preview={preview}
                      dirty={dirty}
                      externalPreviewInvalidated={externalPreviewInvalidated}
                      structuredDraft={structuredDraft}
                      sourceTokenOptions={
                        structuredDraft
                          ? Object.keys(
                              perCollectionFlat[
                                structuredDraft.sourceCollectionId ||
                                  activeGenerator.targetCollectionId
                              ] ?? {},
                            ).sort()
                          : []
                      }
                      onChangeStructuredDraft={updateStructuredDraft}
                    />
                  </aside>
                  <section className="relative min-w-[360px] flex-1 max-[760px]:min-h-[320px] max-[760px]:w-full max-[760px]:min-w-0">
                    {graphIssues.length > 0 ? (
                      <div className="absolute left-3 top-3 z-10 flex max-w-[520px] flex-wrap gap-1.5">
                        {graphIssues.slice(0, 4).map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            onClick={() => {
                              if (issue.nodeId) {
                                setSelectedNodeId(issue.nodeId);
                                setInspectorOpen(true);
                              }
                            }}
                            className={`rounded-md px-2 py-1 text-tertiary font-medium shadow-sm ${
                              issue.severity === "error"
                                ? "bg-[color-mix(in_srgb,var(--color-figma-error)_12%,var(--color-figma-bg))] text-[var(--color-figma-error)]"
                                : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"
                            }`}
                          >
                            {issue.message}
                          </button>
                        ))}
                        {graphIssues.length > 4 ? (
                          <span className="rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-tertiary text-[var(--color-figma-text-secondary)] shadow-sm">
                            +{graphIssues.length - 4} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      nodeTypes={NODE_TYPES}
                      onNodesChange={(changes) => {
                        onNodesChange(changes);
                        if (hasStructuralNodeChange(changes)) {
                          setDirty(true);
                          setPreview(null);
                          setLastApply(null);
                          setExternalPreviewInvalidated(false);
                        }
                      }}
                      onEdgesChange={(changes) => {
                        onEdgesChange(changes);
                        if (hasStructuralEdgeChange(changes)) {
                          setDirty(true);
                          setPreview(null);
                          setLastApply(null);
                          setExternalPreviewInvalidated(false);
                        }
                      }}
                      onConnect={onConnect}
                      onInit={setFlowInstance}
                      onPaneClick={() => setSelectedNodeId(null)}
                      onNodeClick={(_event, node) => {
                        setSelectedNodeId(node.id);
                        setInspectorOpen(true);
                        setNodeLibraryOpen(false);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const label = event.dataTransfer.getData(
                          "application/tokenmanager-node",
                        );
                        const item = PALETTE.find(
                          (candidate) => candidate.label === label,
                        );
                        if (!item) return;
                        const position = flowInstance?.screenToFlowPosition({
                          x: event.clientX,
                          y: event.clientY,
                        }) ?? { x: event.clientX, y: event.clientY };
                        addPaletteNode(item, position);
                      }}
                      fitView
                      proOptions={{ hideAttribution: true }}
                    >
                      <Background
                        gap={16}
                        size={1}
                        color="var(--color-figma-border)"
                      />
                      <Controls showInteractive={false} />
                    </ReactFlow>
                  </section>
                  {reviewPanelOpen ? (
                    <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-[var(--color-figma-border)] p-3 max-[760px]:max-h-[260px] max-[760px]:w-full max-[760px]:border-l-0 max-[760px]:border-t">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-primary font-semibold text-[var(--color-figma-text)]">
                          Output preview
                        </h3>
                        {targetCollection ? (
                          <span className="text-tertiary text-[var(--color-figma-text-secondary)]">
                            {targetCollection.modes.length} modes
                          </span>
                        ) : null}
                      </div>
                      <PreviewPanel
                        preview={preview}
                        targetCollection={targetCollection}
                        focusedDiagnosticId={activeInitialFocus?.diagnosticId}
                        onNavigateToToken={(path) =>
                          onNavigateToToken(
                            path,
                            activeGenerator.targetCollectionId,
                          )
                        }
                      />
                    </aside>
                  ) : null}
                  {nodeLibraryOpen ? (
                    <NodeLibraryPanel
                      allNodesOpen={allNodesOpen}
                      paletteQuery={paletteQuery}
                      paletteItems={filteredPalette}
                      onToggleAllNodes={() => setAllNodesOpen((open) => !open)}
                      onPaletteQueryChange={setPaletteQuery}
                      onAddNode={addPaletteNode}
                    />
                  ) : null}
                  {inspectorOpen && selectedNode ? (
                    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-figma-border)] max-[760px]:max-h-[260px] max-[760px]:w-full max-[760px]:border-l-0 max-[760px]:border-t">
                      <section className="p-3">
                        <h2 className="mb-2 text-primary font-semibold">
                          Graph node
                        </h2>
                        <NodeInspector
                          node={selectedNode}
                          collections={collections}
                          perCollectionFlat={perCollectionFlat}
                          defaultCollectionId={
                            activeGenerator.targetCollectionId
                          }
                          onChange={(data) =>
                            updateNodeData(selectedNode.id, data)
                          }
                          onValidationChange={(dataKey, message) =>
                            handleInspectorValidationChange(
                              selectedNode.id,
                              dataKey,
                              message,
                            )
                          }
                          onDelete={deleteSelectedNode}
                        />
                      </section>
                    </aside>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setCreatePanelOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-figma-accent)] px-3 py-2 text-secondary font-semibold text-white"
                  >
                    <Plus size={14} />
                    Create generator
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function GeneratorSetupSummary({
  generator,
  targetCollection,
  collections,
  preview,
  dirty,
  externalPreviewInvalidated,
  structuredDraft,
  sourceTokenOptions,
  onChangeStructuredDraft,
}: {
  generator: TokenGeneratorDocument;
  targetCollection: TokenCollection | undefined;
  collections: TokenCollection[];
  preview: TokenGeneratorPreviewResult | null;
  dirty: boolean;
  externalPreviewInvalidated: boolean;
  structuredDraft: GeneratorStructuredDraft | null;
  sourceTokenOptions: string[];
  onChangeStructuredDraft: (patch: Partial<GeneratorStructuredDraft>) => void;
}) {
  const outputNodes = generator.nodes.filter(
    (node) => node.kind === "groupOutput" || node.kind === "output",
  );
  const modes =
    targetCollection?.modes.map((mode) => mode.name) ??
    preview?.targetModes ??
    [];
  const status = dirty
    ? "Unsaved changes"
    : externalPreviewInvalidated
      ? "Review is out of date"
      : preview
        ? "Reviewed"
        : "Not reviewed";

  return (
    <div className="min-h-0">
      <div className="space-y-3">
        <section className="space-y-2">
          <h3 className="text-primary font-semibold text-[var(--color-figma-text)]">
            Generator setup
          </h3>
          <p className="text-secondary text-[var(--color-figma-text-secondary)]">
            This generator manages generated tokens in{" "}
            {targetCollection?.id ?? generator.targetCollectionId}.
          </p>
        </section>

        <section className="grid gap-2 sm:grid-cols-3">
          <SummaryMetric
            label="Collection"
            value={targetCollection?.id ?? generator.targetCollectionId}
          />
          <SummaryMetric
            label="Modes"
            value={modes.length > 0 ? modes.join(", ") : "No modes"}
          />
          <SummaryMetric label="Status" value={status} />
        </section>

        <section className="space-y-3">
          {structuredDraft ? (
            <StructuredGeneratorSetup
              draft={structuredDraft}
              targetCollectionId={generator.targetCollectionId}
              targetCollection={targetCollection}
              collections={collections}
              sourceTokenOptions={sourceTokenOptions}
              onChange={onChangeStructuredDraft}
            />
          ) : (
            <div className="rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
              This generator uses a custom graph. Edit steps directly on the
              canvas, then review the output before applying.
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-primary font-semibold text-[var(--color-figma-text)]">
            Output groups
          </h3>
          {outputNodes.length > 0 ? (
            <div className="space-y-1">
              {outputNodes.map((node) => (
                <div
                  key={node.id}
                  className="rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text)]"
                >
                  {String(
                    node.data.pathPrefix ?? node.data.path ?? "Untitled output",
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary text-[var(--color-figma-text-secondary)]">
              Add an output on the generator canvas before applying.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function StructuredGeneratorSetup({
  draft,
  targetCollectionId,
  targetCollection,
  collections,
  sourceTokenOptions,
  onChange,
}: {
  draft: GeneratorStructuredDraft;
  targetCollectionId: string;
  targetCollection: TokenCollection | undefined;
  collections: TokenCollection[];
  sourceTokenOptions: string[];
  onChange: (patch: Partial<GeneratorStructuredDraft>) => void;
}) {
  const setConfig = (patch: Record<string, unknown>) =>
    onChange({ config: patch });
  const sourceCollectionId = draft.sourceCollectionId || targetCollectionId;
  const sourceCollection = collections.find(
    (collection) => collection.id === sourceCollectionId,
  );
  const crossCollectionSource =
    draft.sourceMode === "token" && sourceCollectionId !== targetCollectionId;
  const modeCompatibility =
    !crossCollectionSource ||
    !targetCollection ||
    !sourceCollection ||
    targetCollection.modes.every((mode) =>
      sourceCollection.modes.some(
        (sourceModeItem) => sourceModeItem.name === mode.name,
      ),
    );
  const [crossCollectionOpen, setCrossCollectionOpen] = useState(
    crossCollectionSource,
  );

  useEffect(() => {
    if (crossCollectionSource) {
      setCrossCollectionOpen(true);
    }
  }, [crossCollectionSource]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
          Preset
        </span>
        <select
          value={draft.kind}
          onChange={(event) => {
            const kind = event.target.value as GeneratorPresetKind;
            onChange({
              kind,
              outputPrefix:
                GENERATOR_PRESET_OPTIONS.find((option) => option.id === kind)
                  ?.outputPrefix ?? draft.outputPrefix,
              sourceValue: generatorDefaultSourceValue(kind),
              config: generatorDefaultConfig(kind),
            });
          }}
          className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
        >
          {GENERATOR_PRESET_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
          Output group
        </span>
        <input
          value={draft.outputPrefix}
          onChange={(event) => onChange({ outputPrefix: event.target.value })}
          className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
        />
      </label>

      {!SOURCELESS_GENERATOR_PRESETS.has(draft.kind) ? (
        <div className="space-y-2">
          <div className="flex rounded-md bg-[var(--color-figma-bg-secondary)] p-0.5">
            {(["literal", "token"] as GeneratorSourceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  onChange({
                    sourceMode: mode,
                    ...(mode === "token"
                      ? { sourceCollectionId: targetCollectionId }
                      : {}),
                  })
                }
                className={`min-h-7 flex-1 rounded px-2 text-secondary font-medium ${
                  draft.sourceMode === mode
                    ? "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
                    : "text-[var(--color-figma-text-secondary)]"
                }`}
              >
                {mode === "literal" ? "Literal" : "Token"}
              </button>
            ))}
          </div>
          {draft.sourceMode === "literal" ? (
            <label className="block">
              <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                Source value
              </span>
              <input
                value={draft.sourceValue}
                onChange={(event) =>
                  onChange({ sourceValue: event.target.value })
                }
                className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
              />
            </label>
          ) : (
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                  Source token
                </span>
                <input
                  list="generator-setup-token-options"
                  value={draft.sourceTokenPath}
                  onChange={(event) =>
                    onChange({ sourceTokenPath: event.target.value })
                  }
                  className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
                />
                <datalist id="generator-setup-token-options">
                  {sourceTokenOptions.map((path) => (
                    <option key={path} value={path} />
                  ))}
                </datalist>
              </label>
              <details
                open={crossCollectionOpen}
                onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setCrossCollectionOpen(open);
                  if (open || sourceCollectionId === targetCollectionId) return;
                  onChange({
                    sourceCollectionId: targetCollectionId,
                    sourceTokenPath: "",
                  });
                }}
                className="rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5"
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
                    onChange={(event) =>
                      onChange({
                        sourceCollectionId: event.target.value,
                        sourceTokenPath: "",
                      })
                    }
                    className="w-full rounded-md bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary outline-none"
                  >
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.publishRouting?.collectionName?.trim() ||
                          collection.id}
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
                      : "Mode names must match the target collection before reviewing."}
                  </div>
                ) : null}
              </details>
            </div>
          )}
        </div>
      ) : null}

      {draft.kind === "colorRamp" ? (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Steps
            </span>
            <input
              value={
                Array.isArray(draft.config.steps)
                  ? draft.config.steps.join(", ")
                  : ""
              }
              onChange={(event) =>
                setConfig({ steps: parseNumberList(event.target.value) })
              }
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Light end"
              value={draft.config.lightEnd}
              onChange={(value) => setConfig({ lightEnd: value })}
            />
            <NumberField
              label="Dark end"
              value={draft.config.darkEnd}
              onChange={(value) => setConfig({ darkEnd: value })}
            />
          </div>
        </>
      ) : null}

      {draft.kind === "spacing" || draft.kind === "radius" ? (
        <TextField
          label="Unit"
          value={draft.config.unit}
          onChange={(value) => setConfig({ unit: value })}
        />
      ) : null}
      {draft.kind === "type" ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Ratio"
            value={draft.config.ratio}
            onChange={(value) => setConfig({ ratio: value })}
            step="0.01"
          />
          <TextField
            label="Unit"
            value={draft.config.unit}
            onChange={(value) => setConfig({ unit: value })}
          />
        </div>
      ) : null}
      {draft.kind === "shadow" ? (
        <TextField
          label="Shadow color"
          value={draft.config.color}
          onChange={(value) => setConfig({ color: value })}
        />
      ) : null}
      {draft.kind === "formula" ? (
        <>
          <TextField
            label="Formula"
            value={draft.config.formula}
            onChange={(value) => setConfig({ formula: value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                Output type
              </span>
              <select
                value={String(draft.config.outputType ?? "number")}
                onChange={(event) =>
                  setConfig({ outputType: event.target.value })
                }
                className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
              >
                <option value="number">Number</option>
                <option value="dimension">Dimension</option>
              </select>
            </label>
            <NumberField
              label="Round to"
              value={draft.config.roundTo}
              onChange={(value) => setConfig({ roundTo: value })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <input
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: unknown;
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
        value={Number(value ?? 0)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
      />
    </label>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-2">
      <div className="text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </div>
      <div
        className="mt-1 truncate text-secondary font-semibold text-[var(--color-figma-text)]"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function GeneratorDocumentNode({ data, selected }: NodeProps<GraphFlowNode>) {
  const graphNode = data.graphNode;
  const relatedOutputs =
    data.preview?.outputs.filter((output) => output.nodeId === graphNode.id) ??
    [];
  const diagnostics =
    data.preview?.diagnostics.filter(
      (diagnostic) => diagnostic.nodeId === graphNode.id,
    ) ?? [];
  const issues = data.issues ?? [];
  const inputPorts = getNodeInputPorts(graphNode);
  const outputPorts = getNodeOutputPorts(graphNode);
  const hasErrors =
    issues.some((issue) => issue.severity === "error") ||
    diagnostics.some((diagnostic) => diagnostic.severity === "error");

  return (
    <div
      className={`min-w-[180px] rounded-lg border bg-[var(--color-figma-bg)] px-3 py-2 shadow-sm ${
        selected
          ? "border-[var(--color-figma-accent)]"
          : hasErrors
            ? "border-[var(--color-figma-error)]"
            : issues.length > 0 || diagnostics.length > 0
              ? "border-[var(--color-figma-warning)]"
              : "border-[var(--color-figma-border)]"
      }`}
    >
      {inputPorts.map((port, index) => (
        <Handle
          key={`in-${port}`}
          type="target"
          position={Position.Left}
          id={port}
          style={portHandleStyle(inputPorts.length, index)}
        />
      ))}
      {outputPorts.map((port, index) => (
        <Handle
          key={`out-${port}`}
          type="source"
          position={Position.Right}
          id={port}
          style={portHandleStyle(outputPorts.length, index)}
        />
      ))}
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-secondary font-semibold">
          {graphNode.label}
        </div>
        {(diagnostics.length > 0 || issues.length > 0) && (
          <AlertTriangle
            size={14}
            className={
              hasErrors
                ? "text-[var(--color-figma-error)]"
                : "text-[var(--color-figma-warning)]"
            }
          />
        )}
      </div>
      <div className="mt-1 text-tertiary text-[var(--color-figma-text-secondary)]">
        {nodeSummary(graphNode)}
      </div>
      {issues.length > 0 ? (
        <div
          className={`mt-2 text-tertiary ${hasErrors ? "text-[var(--color-figma-error)]" : "text-[var(--color-figma-warning)]"}`}
        >
          {issues[0].message}
        </div>
      ) : null}
      {relatedOutputs.length > 0 && (
        <div className="mt-2 space-y-1 text-tertiary">
          {relatedOutputs.slice(0, 3).map((output) => (
            <div
              key={output.path}
              className="truncate text-[var(--color-figma-text-secondary)]"
            >
              {output.path}
            </div>
          ))}
          {relatedOutputs.length > 3 && (
            <div className="text-[var(--color-figma-text-secondary)]">
              +{relatedOutputs.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NodeInspector({
  node,
  collections,
  perCollectionFlat,
  defaultCollectionId,
  onChange,
  onValidationChange,
  onDelete,
}: {
  node: TokenGeneratorDocumentNode;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  defaultCollectionId: string;
  onChange: (data: Record<string, unknown>) => void;
  onValidationChange: (dataKey: string, message: string | null) => void;
  onDelete: () => void;
}) {
  const selectedCollectionId =
    node.kind === "alias"
      ? defaultCollectionId
      : String(node.data.collectionId ?? defaultCollectionId);
  const tokenOptions = Object.keys(
    perCollectionFlat[selectedCollectionId] ?? {},
  ).sort();
  const jsonField = (key: string, label: string) => (
    <details className="rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
      <summary className="cursor-pointer text-secondary font-medium text-[var(--color-figma-text)]">
        {label}
      </summary>
      <div className="mt-2">
        <JsonDataField
          nodeId={node.id}
          dataKey={key}
          label="Raw JSON"
          value={node.data[key]}
          onChange={(value) => onChange({ [key]: value })}
          onValidationChange={(message) => onValidationChange(key, message)}
        />
      </div>
    </details>
  );
  const field = (key: string, label: string, type = "text") => (
    <label className="block">
      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <input
        type={type}
        value={String(node.data[key] ?? "")}
        onChange={(event) =>
          onChange({
            [key]:
              type === "number"
                ? Number(event.target.value)
                : event.target.value,
          })
        }
        className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
          Name
        </span>
        <input
          value={node.label}
          onChange={(event) => onChange({ label: event.target.value })}
          className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
        />
      </label>
      {node.kind === "tokenInput" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Collection
            </span>
            <select
              value={selectedCollectionId}
              onChange={(event) =>
                onChange({ collectionId: event.target.value, path: "" })
              }
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Token
            </span>
            <input
              list={`graph-token-options-${node.id}`}
              value={String(node.data.path ?? "")}
              onChange={(event) => onChange({ path: event.target.value })}
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
            />
            <datalist id={`graph-token-options-${node.id}`}>
              {tokenOptions.map((path) => (
                <option key={path} value={path} />
              ))}
            </datalist>
          </label>
        </>
      )}
      {node.kind === "alias" && (
        <label className="block">
          <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
            Token
          </span>
          <input
            list={`graph-token-options-${node.id}`}
            value={String(node.data.path ?? "")}
            onChange={(event) => onChange({ path: event.target.value })}
            className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
          />
          <datalist id={`graph-token-options-${node.id}`}>
            {tokenOptions.map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>
        </label>
      )}
      {node.kind === "literal" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Type
            </span>
            <select
              value={String(node.data.type ?? "string")}
              onChange={(event) => onChange({ type: event.target.value })}
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
            >
              <option value="color">Color</option>
              <option value="number">Number</option>
              <option value="dimension">Dimension</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>
          </label>
          {field(
            "value",
            "Value",
            node.data.type === "number" || node.data.type === "dimension"
              ? "number"
              : "text",
          )}
          {node.data.type === "dimension" && field("unit", "Unit")}
        </>
      )}
      {node.kind === "math" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Operation
            </span>
            <select
              value={String(node.data.operation ?? "add")}
              onChange={(event) => onChange({ operation: event.target.value })}
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
            >
              <option value="add">Add</option>
              <option value="subtract">Subtract</option>
              <option value="multiply">Multiply</option>
              <option value="divide">Divide</option>
              <option value="scaleBy">Scale by</option>
              <option value="clamp">Clamp</option>
              <option value="round">Round</option>
            </select>
          </label>
          {field("amount", "Amount", "number")}
          {node.data.operation === "clamp" && (
            <>
              {field("min", "Minimum", "number")}
              {field("max", "Maximum", "number")}
            </>
          )}
        </>
      )}
      {node.kind === "color" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Operation
            </span>
            <select
              value={String(node.data.operation ?? "lighten")}
              onChange={(event) => onChange({ operation: event.target.value })}
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
            >
              <option value="lighten">Lighten</option>
              <option value="darken">Darken</option>
              <option value="alpha">Alpha</option>
              <option value="mix">Mix</option>
              <option value="invertLightness">Invert lightness</option>
            </select>
          </label>
          {field("amount", "Amount", "number")}
          {node.data.operation === "mix" && (
            <>
              {field("mixWith", "Mix with")}
              {field("ratio", "Ratio", "number")}
            </>
          )}
        </>
      )}
      {node.kind === "formula" && field("expression", "Formula")}
      {node.kind === "colorRamp" && (
        <>
          {field("lightEnd", "Light end", "number")}
          {field("darkEnd", "Dark end", "number")}
          {field("chromaBoost", "Chroma", "number")}
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Steps
            </span>
            <input
              value={
                Array.isArray(node.data.steps) ? node.data.steps.join(", ") : ""
              }
              onChange={(event) =>
                onChange({
                  steps: event.target.value
                    .split(",")
                    .map((item) => Number(item.trim()))
                    .filter(Number.isFinite),
                })
              }
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
            />
          </label>
        </>
      )}
      {node.kind === "spacingScale" && (
        <>
          {field("unit", "Unit")}
          {jsonField("steps", "Steps")}
        </>
      )}
      {node.kind === "typeScale" && (
        <>
          {field("ratio", "Ratio", "number")}
          {field("unit", "Unit")}
          {field("baseStep", "Base step")}
          {field("roundTo", "Round to", "number")}
          {jsonField("steps", "Steps")}
        </>
      )}
      {node.kind === "borderRadiusScale" && (
        <>
          {field("unit", "Unit")}
          {jsonField("steps", "Steps")}
        </>
      )}
      {node.kind === "opacityScale" && jsonField("steps", "Steps")}
      {node.kind === "shadowScale" && (
        <>
          {field("color", "Color")}
          {jsonField("steps", "Steps")}
        </>
      )}
      {node.kind === "zIndexScale" && jsonField("steps", "Steps")}
      {node.kind === "customScale" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Output type
            </span>
            <select
              value={String(node.data.outputType ?? "number")}
              onChange={(event) => onChange({ outputType: event.target.value })}
              className="w-full rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
            >
              <option value="number">Number</option>
              <option value="dimension">Dimension</option>
            </select>
          </label>
          {field("unit", "Unit")}
          {field("formula", "Formula")}
          {field("roundTo", "Round to", "number")}
          {jsonField("steps", "Steps")}
        </>
      )}
      {(node.kind === "output" || node.kind === "groupOutput") &&
        field(
          node.kind === "output" ? "path" : "pathPrefix",
          node.kind === "output" ? "Token path" : "Group path",
        )}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-secondary font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
      >
        <Trash2 size={14} />
        Delete node
      </button>
    </div>
  );
}

function JsonDataField({
  nodeId,
  dataKey,
  label,
  value,
  onChange,
  onValidationChange,
}: {
  nodeId: string;
  dataKey: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onValidationChange: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState(() => formatJsonDraft(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatJsonDraft(value));
    setError(null);
    onValidationChange(null);
  }, [dataKey, nodeId, onValidationChange, value]);

  return (
    <label className="block">
      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <textarea
        value={draft}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          try {
            onChange(JSON.parse(nextDraft));
            setError(null);
            onValidationChange(null);
          } catch {
            const message = "Enter valid JSON.";
            setError(message);
            onValidationChange(message);
          }
        }}
        rows={6}
        spellCheck={false}
        className="min-h-[120px] w-full resize-y rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-figma-text)] outline-none"
      />
      {error ? (
        <span className="mt-1 block text-tertiary text-[var(--color-figma-error)]">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function formatJsonDraft(value: unknown): string {
  return JSON.stringify(value ?? [], null, 2);
}

function getNodeInputPorts(node: TokenGeneratorDocumentNode): string[] {
  if (["tokenInput", "literal", "alias", "list"].includes(node.kind)) {
    return [];
  }
  if (["opacityScale", "shadowScale", "zIndexScale"].includes(node.kind)) {
    return [];
  }
  if (node.kind === "formula") {
    return ["value", "var2", "var3"];
  }
  return ["value"];
}

function getNodeOutputPorts(node: TokenGeneratorDocumentNode): string[] {
  if (["output", "groupOutput"].includes(node.kind)) {
    return [];
  }
  if (
    node.kind === "colorRamp" ||
    node.kind === "spacingScale" ||
    node.kind === "typeScale" ||
    node.kind === "borderRadiusScale" ||
    node.kind === "opacityScale" ||
    node.kind === "shadowScale" ||
    node.kind === "zIndexScale" ||
    node.kind === "customScale" ||
    node.kind === "list"
  ) {
    return ["value", "steps"];
  }
  return ["value"];
}

function portHandleStyle(total: number, index: number): CSSProperties {
  if (total <= 1) return {};
  return { top: `${Math.round(((index + 1) / (total + 1)) * 100)}%` };
}

function PreviewPanel({
  preview,
  targetCollection,
  focusedDiagnosticId,
  onNavigateToToken,
}: {
  preview: TokenGeneratorPreviewResult | null;
  targetCollection: TokenCollection | undefined;
  focusedDiagnosticId?: string;
  onNavigateToToken: (path: string) => void;
}) {
  if (!preview) {
    return (
      <div className="rounded-md bg-[var(--color-figma-bg-secondary)] p-3 text-secondary text-[var(--color-figma-text-secondary)]">
        Review the generator output before creating or updating tokens in the
        collection.
      </div>
    );
  }
  const modes =
    targetCollection?.modes.map((mode) => mode.name) ?? preview.targetModes;
  const outputGroups = groupPreviewOutputs(preview.outputs);
  return (
    <div className="space-y-3">
      {preview.diagnostics.length > 0 && (
        <div className="space-y-1">
          {preview.diagnostics.map((diagnostic) => (
            <div
              key={diagnostic.id}
              className={`rounded-md bg-[var(--color-figma-bg-secondary)] p-2 text-secondary ${
                focusedDiagnosticId === diagnostic.id
                  ? "ring-1 ring-[var(--color-figma-accent)]"
                  : ""
              }`}
            >
              <span className="font-medium capitalize">
                {diagnostic.severity}
              </span>
              <span className="text-[var(--color-figma-text-secondary)]">
                {" "}
                - {diagnostic.message}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {preview.outputs.length === 0 ? (
          <div className="rounded-md bg-[var(--color-figma-bg-secondary)] p-2 text-secondary text-[var(--color-figma-error)]">
            No tokens will be created. Adjust the generator and review the
            output again.
          </div>
        ) : null}
        {outputGroups.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-secondary font-semibold text-[var(--color-figma-text)]">
                {group.label}
              </h3>
              <span className="text-tertiary text-[var(--color-figma-text-secondary)]">
                {group.outputs.length}
              </span>
            </div>
            {group.outputs.map((output) => (
              <div
                key={output.path}
                className="rounded-md bg-[var(--color-figma-bg-secondary)] p-2"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Database
                    size={14}
                    className="text-[var(--color-figma-text-secondary)]"
                  />
                  {output.change === "created" ? (
                    <span className="min-w-0 flex-1 truncate text-secondary font-semibold">
                      {output.path}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateToToken(output.path)}
                      className="min-w-0 flex-1 truncate text-left text-secondary font-semibold hover:underline"
                    >
                      {output.path}
                    </button>
                  )}
                  <span
                    className={`text-tertiary ${output.collision ? "text-[var(--color-figma-error)]" : "text-[var(--color-figma-text-secondary)]"}`}
                  >
                    {output.collision ? "collision" : output.change}
                  </span>
                </div>
                {output.collision && (
                  <div className="mb-2 text-tertiary text-[var(--color-figma-error)]">
                    Manual token collision. Detach or rename before applying.
                  </div>
                )}
                <div className="space-y-1">
                  {modes.map((modeName) => (
                    <div
                      key={modeName}
                      className="grid grid-cols-[82px_1fr] gap-2 text-tertiary"
                    >
                      <span className="truncate text-[var(--color-figma-text-secondary)]">
                        {modeName}
                      </span>
                      <span className="min-w-0 flex items-center gap-1.5">
                        {previewIsValueBearing(output.type) && (
                          <ValuePreview
                            type={output.type}
                            value={output.modeValues[modeName]}
                            size={14}
                          />
                        )}
                        <span className="truncate">
                          {formatValue(output.modeValues[modeName])}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
        {preview.outputs.length === 0 && (
          <div className="text-secondary text-[var(--color-figma-text-secondary)]">
            No outputs yet. Add an output node and connect a value.
          </div>
        )}
      </div>
    </div>
  );
}

function groupPreviewOutputs(outputs: TokenGeneratorPreviewResult["outputs"]) {
  const collisions = outputs.filter((output) => output.collision);
  const nonCollisions = outputs.filter((output) => !output.collision);
  return [
    { id: "collisions", label: "Needs attention", outputs: collisions },
    {
      id: "created",
      label: "New tokens",
      outputs: nonCollisions.filter((output) => output.change === "created"),
    },
    {
      id: "updated",
      label: "Updated tokens",
      outputs: nonCollisions.filter((output) => output.change === "updated"),
    },
    {
      id: "unchanged",
      label: "Unchanged tokens",
      outputs: nonCollisions.filter((output) => output.change === "unchanged"),
    },
  ].filter((group) => group.outputs.length > 0);
}

function toFlowNodes(
  generator: TokenGeneratorDocument,
  preview: TokenGeneratorPreviewResult | null,
  issues: GraphIssue[] = [],
): GraphFlowNode[] {
  return generator.nodes.map((graphNode) => ({
    id: graphNode.id,
    type: "graphNode",
    position: graphNode.position,
    data: {
      graphNode,
      preview: preview ?? undefined,
      issues: issues.filter((issue) => issue.nodeId === graphNode.id),
    },
  }));
}

function graphWithFlowState(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
): TokenGeneratorDocument {
  return {
    ...generator,
    nodes: nodes.map((node) => ({
      ...node.data.graphNode,
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: {
        nodeId: String(edge.source),
        port: String(edge.sourceHandle ?? "value"),
      },
      to: {
        nodeId: String(edge.target),
        port: String(edge.targetHandle ?? "value"),
      },
    })),
  };
}

function toFlowEdges(edges: TokenGeneratorEdge[]): GraphFlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    sourceHandle: edge.from.port,
    targetHandle: edge.to.port,
    animated: false,
  }));
}

function hasStructuralNodeChange(
  changes: NodeChange<GraphFlowNode>[],
): boolean {
  return changes.some(
    (change) =>
      change.type === "add" ||
      change.type === "remove" ||
      (change.type === "position" && Boolean(change.dragging === false)),
  );
}

function hasStructuralEdgeChange(
  changes: EdgeChange<GraphFlowEdge>[],
): boolean {
  return changes.some(
    (change) => change.type === "add" || change.type === "remove",
  );
}

function contextualPaletteItems(
  palette: typeof PALETTE,
  selectedNode: TokenGeneratorDocumentNode | null,
  generator: TokenGeneratorDocument | null,
): typeof PALETTE {
  if (!generator)
    return palette.filter(
      (item) => item.category === "Inputs" || item.category === "Scales",
    );
  if (!selectedNode) {
    const hasOutput = generator.nodes.some(
      (node) => node.kind === "output" || node.kind === "groupOutput",
    );
    return palette.filter((item) =>
      hasOutput
        ? item.category === "Inputs" || item.category === "Scales"
        : item.category === "Outputs",
    );
  }
  if (
    selectedNode.kind === "tokenInput" ||
    selectedNode.kind === "literal" ||
    selectedNode.kind === "alias"
  ) {
    return palette.filter(
      (item) =>
        item.category === "Math" ||
        item.category === "Color" ||
        item.category === "Scales" ||
        item.category === "Outputs",
    );
  }
  if (selectedNode.kind === "output" || selectedNode.kind === "groupOutput") {
    return palette.filter(
      (item) => item.category === "Inputs" || item.category === "Scales",
    );
  }
  return palette.filter(
    (item) =>
      item.category === "Outputs" ||
      item.category === "Math" ||
      item.category === "Color",
  );
}

function collectGraphIssues(
  generator: TokenGeneratorDocument,
  inspectorErrors: Record<string, string>,
  preview: TokenGeneratorPreviewResult | null,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeIds = new Set(generator.nodes.map((node) => node.id));
  for (const node of generator.nodes) {
    if (node.kind === "tokenInput" && !String(node.data.path ?? "").trim()) {
      issues.push({
        id: `${node.id}-token`,
        nodeId: node.id,
        severity: "error",
        message: "Choose a source token",
      });
    }
    if (
      node.kind === "literal" &&
      String(node.data.value ?? "").trim() === ""
    ) {
      issues.push({
        id: `${node.id}-literal`,
        nodeId: node.id,
        severity: "warning",
        message: "Add a source value",
      });
    }
    if (
      node.kind === "groupOutput" &&
      !String(node.data.pathPrefix ?? "").trim()
    ) {
      issues.push({
        id: `${node.id}-output`,
        nodeId: node.id,
        severity: "error",
        message: "Add an output group",
      });
    }
    if (node.kind === "output" && !String(node.data.path ?? "").trim()) {
      issues.push({
        id: `${node.id}-path`,
        nodeId: node.id,
        severity: "error",
        message: "Add an output path",
      });
    }
    if (
      (node.kind === "output" || node.kind === "groupOutput") &&
      !generator.edges.some((edge) => edge.to.nodeId === node.id)
    ) {
      issues.push({
        id: `${node.id}-disconnected`,
        nodeId: node.id,
        severity: "error",
        message: "Connect an input",
      });
    }
  }
  for (const edge of generator.edges) {
    if (!nodeIds.has(edge.from.nodeId) || !nodeIds.has(edge.to.nodeId)) {
      issues.push({
        id: `${edge.id}-missing-node`,
        severity: "error",
        message: "Connection references a missing step",
      });
    }
  }
  for (const [key, message] of Object.entries(inspectorErrors)) {
    const nodeId = key.split(":")[0];
    issues.push({ id: key, nodeId, severity: "error", message });
  }
  for (const diagnostic of preview?.diagnostics ?? []) {
    issues.push({
      id: diagnostic.id,
      nodeId: diagnostic.nodeId,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }
  if (
    !generator.nodes.some(
      (node) => node.kind === "output" || node.kind === "groupOutput",
    )
  ) {
    issues.push({
      id: "missing-output",
      severity: "error",
      message: "Add an output step",
    });
  }
  return issues;
}

function parseNumberList(value: string): number[] {
  return value
    .split(",")
    .map((step) => Number(step.trim()))
    .filter(Number.isFinite);
}

function nodeSummary(node: TokenGeneratorDocumentNode): string {
  if (node.kind === "tokenInput")
    return String(node.data.path || "Choose token");
  if (node.kind === "literal") return formatValue(node.data.value);
  if (node.kind === "math")
    return `${node.data.operation ?? "add"} ${node.data.amount ?? ""}`.trim();
  if (node.kind === "color") return String(node.data.operation ?? "lighten");
  if (node.kind === "formula") return String(node.data.expression ?? "Formula");
  if (node.kind === "colorRamp") return "Mode-aware steps";
  if (node.kind === "spacingScale") return "Spacing steps";
  if (node.kind === "typeScale") return "Type steps";
  if (node.kind === "borderRadiusScale") return "Radius steps";
  if (node.kind === "opacityScale") return "Opacity steps";
  if (node.kind === "shadowScale") return "Shadow steps";
  if (node.kind === "zIndexScale") return "Z-index steps";
  if (node.kind === "customScale") return "Formula steps";
  if (node.kind === "output") return String(node.data.path || "Output path");
  if (node.kind === "groupOutput")
    return String(node.data.pathPrefix || "Output group");
  return node.kind;
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object" && "value" in value && "unit" in value) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}
