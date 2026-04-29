import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  type Viewport,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
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
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type {
  TokenCollection,
  TokenGeneratorDocument,
  TokenGeneratorEdge,
  TokenGeneratorDocumentNode,
  TokenGeneratorPortDescriptor,
  TokenGeneratorPreviewResult,
} from "@tokenmanager/core";
import {
  GENERATOR_PRESET_OPTIONS,
  SOURCELESS_GENERATOR_PRESETS,
  buildGeneratorNodesFromStructuredDraft,
  checkTokenGeneratorConnection,
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
  getTokenGeneratorInputPorts,
  getTokenGeneratorOutputPorts,
  readStructuredGeneratorDraft,
  type GeneratorPresetKind,
  type GeneratorStructuredDraft,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { useElementWidth } from "../../hooks/useElementWidth";
import { apiFetch } from "../../shared/apiFetch";
import { ActionRow, Button, IconButton, SegmentedControl } from "../../primitives";
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
  initialView?: GeneratorEditorMode | null;
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
  edgeId?: string;
  targetPort?: string;
  severity: "error" | "warning" | "info";
  message: string;
}

interface GraphMenuPoint {
  x: number;
  y: number;
  flowPosition: TokenGeneratorDocumentNode["position"];
}

type GraphMenuState =
  | ({ kind: "pane-add" } & GraphMenuPoint)
  | ({
      kind: "connect-from-output";
      sourceNodeId: string;
      sourcePort: string;
      replaceEdgeId?: string;
    } & GraphMenuPoint)
  | ({
      kind: "connect-to-input";
      targetNodeId: string;
      targetPort: string;
      replaceEdgeId?: string;
    } & GraphMenuPoint)
  | ({ kind: "node"; nodeId: string } & GraphMenuPoint)
  | ({ kind: "edge"; edgeId: string } & GraphMenuPoint)
  | ({ kind: "edge-insert"; edgeId: string } & GraphMenuPoint);

type PendingConnectionStart = {
  nodeId: string;
  port: string;
  handleType: "source" | "target";
} | null;

type PendingDeleteAction =
  | { kind: "generator"; generatorId: string; name: string }
  | {
      kind: "node";
      nodeId: string;
      label: string;
      connectedEdgeCount: number;
      reconnectCount: number;
    };

type GraphFlowNode = Node<
  {
    graphNode: TokenGeneratorDocumentNode;
    preview?: TokenGeneratorPreviewResult;
    issues?: GraphIssue[];
  },
  "graphNode"
>;
type GraphFlowEdge = Edge<Record<string, never>>;
type GeneratorEditorMode = "setup" | "graph";
const COMPACT_GENERATORS_WIDTH = 860;

const GENERATOR_VIEW_OPTIONS: Array<{
  value: GeneratorEditorMode;
  label: string;
}> = [
  { value: "setup", label: "Outputs" },
  { value: "graph", label: "Graph" },
];

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
  initialView,
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [graphMenu, setGraphMenu] = useState<GraphMenuState | null>(null);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [externalPreviewInvalidated, setExternalPreviewInvalidated] =
    useState(false);
  const [lastApply, setLastApply] = useState<GeneratorApplyResponse | null>(
    null,
  );
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [allNodesOpen, setAllNodesOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false);
  const [setupPanelOpen, setSetupPanelOpen] = useState(false);
  const [generatorListOpen, setGeneratorListOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteAction | null>(
    null,
  );
  const [editorMode, setEditorMode] = useState<GeneratorEditorMode>("setup");
  const [activeInitialFocus, setActiveInitialFocus] =
    useState<GeneratorPanelFocus | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    GraphFlowNode,
    GraphFlowEdge
  > | null>(null);
  const [nodes, setNodes] = useNodesState<GraphFlowNode>([]);
  const [edges, setEdges] = useEdgesState<GraphFlowEdge>([]);
  const nodesRef = useRef<GraphFlowNode[]>([]);
  const edgesRef = useRef<GraphFlowEdge[]>([]);
  const activeGeneratorIdRef = useRef<string | null>(null);
  const previewRef = useRef<TokenGeneratorPreviewResult | null>(null);
  const pendingConnectionStartRef = useRef<PendingConnectionStart>(null);
  const connectionCompletedRef = useRef(false);
  const suppressNextPaneClickRef = useRef(false);
  const localGraphEditRef = useRef(false);
  const dirtyRef = useRef(false);
  const dirtyGeneratorIdRef = useRef<string | null>(null);
  const graphRevisionRef = useRef(0);
  const autoPreviewRunRef = useRef(0);
  const latestPreviewSignatureRef = useRef("");
  const panelRef = useRef<HTMLDivElement>(null);
  const panelWidth = useElementWidth(panelRef);
  const compactGenerators =
    panelWidth !== null && panelWidth < COMPACT_GENERATORS_WIDTH;

  const setActiveGeneratorSelection = useCallback(
    (generatorId: string | null) => {
      activeGeneratorIdRef.current = generatorId;
      setActiveGeneratorId(generatorId);
    },
    [],
  );

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
        ? collectGraphIssues(
            generatorWithInferredTokenInputTypes(
              activeGenerator,
              perCollectionFlat,
            ),
            preview,
          )
        : [],
    [activeGenerator, perCollectionFlat, preview],
  );
  const previewHasCollisions =
    preview?.outputs.some((output) => output.collision) ?? false;
  const previewHasNoOutputs = preview ? preview.outputs.length === 0 : false;
  const graphHasErrors = graphIssues.some(
    (issue) => issue.severity === "error",
  );
  const canRepairGraph = graphIssues.some(
    (issue) =>
      Boolean(issue.edgeId) || issue.id.endsWith("-multiple-inputs"),
  );
  const activeGeneratorSignature = useMemo(
    () =>
      activeGenerator
        ? JSON.stringify({
            id: activeGenerator.id,
            name: activeGenerator.name,
            targetCollectionId: activeGenerator.targetCollectionId,
            nodes: activeGenerator.nodes,
            edges: activeGenerator.edges,
            tokenChangeKey,
          })
        : "",
    [activeGenerator, tokenChangeKey],
  );
  const activeGeneratorStructureSignature = useMemo(
    () =>
      activeGenerator
        ? JSON.stringify({
            id: activeGenerator.id,
            nodes: activeGenerator.nodes,
            edges: activeGenerator.edges,
          })
        : "",
    [activeGenerator],
  );

  const loadGenerators = useCallback(async () => {
    const data = await apiFetch<GeneratorListResponse>(
      `${serverUrl}/api/generators`,
    );
    setGenerators((current) => {
      const dirtyGeneratorId = dirtyGeneratorIdRef.current;
      if (!dirtyRef.current || !dirtyGeneratorId) {
        return data.generators;
      }
      const dirtyGenerator = current.find(
        (generator) => generator.id === dirtyGeneratorId,
      );
      if (!dirtyGenerator) {
        return data.generators;
      }
      const merged = data.generators.map((generator) =>
        generator.id === dirtyGenerator.id ? dirtyGenerator : generator,
      );
      return merged.some((generator) => generator.id === dirtyGenerator.id)
        ? merged
        : [dirtyGenerator, ...merged];
    });
    setActiveGeneratorId((current) => {
      if (dirtyRef.current) return current;
      const currentGenerator = data.generators.find(
        (generator) => generator.id === current,
      );
      if (currentGenerator?.targetCollectionId === workingCollectionId) {
        activeGeneratorIdRef.current = current;
        return current;
      }
      const nextId =
        data.generators.find(
          (generator) => generator.targetCollectionId === workingCollectionId,
        )?.id ?? null;
      activeGeneratorIdRef.current = nextId;
      return nextId;
    });
  }, [serverUrl, workingCollectionId]);

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
    activeGeneratorIdRef.current = activeGeneratorId;
  }, [activeGeneratorId]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (!initialGeneratorId) return;
    const initialGenerator = generators.find(
      (generator) => generator.id === initialGeneratorId,
    );
    if (!initialGenerator) return;
    let cancelled = false;
    const currentGeneratorId = activeGeneratorIdRef.current;
    const preservingDirtyGenerator =
      dirtyRef.current && currentGeneratorId === initialGeneratorId;
    if (dirtyRef.current && currentGeneratorId !== initialGeneratorId) {
      setError("Save the current generator before opening another one.");
      onInitialGeneratorHandled?.();
      return;
    }
    const focus = initialFocus ?? null;
    setActiveInitialFocus(focus);
    setActiveGeneratorSelection(initialGeneratorId);
    setError(null);
    if (!preservingDirtyGenerator) {
      setPreview(null);
      setLastApply(null);
      setDirty(false);
      dirtyRef.current = false;
      dirtyGeneratorIdRef.current = null;
      setExternalPreviewInvalidated(false);
    }
    if (initialView === "graph" || focus?.nodeId || focus?.edgeId) {
      setEditorMode("graph");
    }
    if (focus?.nodeId) {
      setSelectedNodeId(focus.nodeId);
      setSelectedEdgeId(null);
      setInspectorOpen(true);
    } else if (focus?.edgeId) {
      setSelectedNodeId(null);
      setSelectedEdgeId(focus.edgeId);
      setInspectorOpen(false);
    }
    if (preservingDirtyGenerator) {
      onInitialGeneratorHandled?.();
      return;
    }
    setBusy("preview");
    apiFetch<GeneratorPreviewResponse>(
      `${serverUrl}/api/generators/${encodeURIComponent(initialGenerator.id)}/preview`,
      { method: "POST" },
    )
      .then((data) => {
        if (
          cancelled ||
          activeGeneratorIdRef.current !== initialGenerator.id ||
          data.preview.generatorId !== initialGenerator.id
        ) {
          return;
        }
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
    initialView,
    onInitialGeneratorHandled,
    serverUrl,
    setActiveGeneratorSelection,
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
    setActiveGeneratorSelection(scopedGenerators[0]?.id ?? null);
  }, [
    activeGenerator,
    dirty,
    initialGeneratorId,
    scopedGenerators,
    setActiveGeneratorSelection,
    workingCollectionId,
  ]);

  useEffect(() => {
    if (!previewRef.current) return;
    setPreview(null);
    setLastApply(null);
    setExternalPreviewInvalidated(true);
  }, [tokenChangeKey]);

  useLayoutEffect(() => {
    if (!activeGenerator) {
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setGraphMenu(null);
      return;
    }
    if (localGraphEditRef.current) {
      localGraphEditRef.current = false;
      return;
    }
    setNodes(toFlowNodes(activeGenerator, previewRef.current));
    setEdges(toFlowEdges(activeGenerator.edges));
    setSelectedNodeId((current) =>
      current && activeGenerator.nodes.some((node) => node.id === current)
        ? current
        : null,
    );
    setSelectedEdgeId((current) =>
      current && activeGenerator.edges.some((edge) => edge.id === current)
        ? current
        : null,
    );
  }, [activeGenerator, activeGeneratorStructureSignature, setEdges, setNodes]);

  useEffect(() => {
    if (!activeGenerator) return;
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          preview: preview ?? undefined,
          issues: graphIssues.filter(
            (issue) => issue.nodeId === node.id,
          ),
        },
      })),
    );
  }, [activeGenerator, graphIssues, preview, setNodes]);

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
      dirtyRef.current = true;
      dirtyGeneratorIdRef.current = activeGenerator.id;
      graphRevisionRef.current += 1;
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

  const commitFlowState = useCallback(
    (nextNodes: GraphFlowNode[], nextEdges: GraphFlowEdge[]) => {
      if (!activeGenerator) return;
      localGraphEditRef.current = true;
      graphRevisionRef.current += 1;
      const nextGenerator = graphWithFlowState(
        activeGenerator,
        nextNodes,
        nextEdges,
      );
      setGenerators((current) =>
        current.map((graph) =>
          graph.id === activeGenerator.id
            ? { ...nextGenerator, updatedAt: new Date().toISOString() }
            : graph,
        ),
      );
      setDirty(true);
      dirtyRef.current = true;
      dirtyGeneratorIdRef.current = activeGenerator.id;
      setPreview(null);
      setLastApply(null);
      setExternalPreviewInvalidated(false);
    },
    [activeGenerator],
  );

  const commitViewport = useCallback(
    (viewport: Viewport) => {
      if (!activeGenerator) return;
      const currentViewport = activeGenerator.viewport;
      if (
        currentViewport.x === viewport.x &&
        currentViewport.y === viewport.y &&
        currentViewport.zoom === viewport.zoom
      ) {
        return;
      }
      setGenerators((current) =>
        current.map((generator) =>
          generator.id === activeGenerator.id
            ? {
                ...graphWithFlowState(
                  activeGenerator,
                  nodesRef.current,
                  edgesRef.current,
                ),
                viewport: {
                  x: viewport.x,
                  y: viewport.y,
                  zoom: viewport.zoom,
                },
              }
            : generator,
        ),
      );
    },
    [activeGenerator],
  );

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
    if (graphHasErrors) {
      setError("Fix graph issues before saving this generator.");
      setEditorMode("graph");
      return null;
    }
    const generator = syncFlowToGenerator();
    if (!generator) return null;
    const saveRevision = graphRevisionRef.current;
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
      if (
        activeGeneratorIdRef.current !== data.generator.id ||
        graphRevisionRef.current !== saveRevision
      ) {
        return null;
      }
      setGenerators((current) =>
        current.map((candidate) =>
          candidate.id === data.generator.id ? data.generator : candidate,
        ),
      );
      setDirty(false);
      dirtyRef.current = false;
      dirtyGeneratorIdRef.current = null;
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
  }, [graphHasErrors, serverUrl, syncFlowToGenerator]);

  const discardGeneratorDraft = useCallback(async () => {
    const generatorId = activeGeneratorIdRef.current;
    if (!generatorId) return;
    autoPreviewRunRef.current += 1;
    setBusy("restore");
    setError(null);
    try {
      const data = await apiFetch<GeneratorResponse>(
        `${serverUrl}/api/generators/${encodeURIComponent(generatorId)}`,
      );
      if (activeGeneratorIdRef.current !== data.generator.id) return;
      setGenerators((current) =>
        current.map((generator) =>
          generator.id === data.generator.id ? data.generator : generator,
        ),
      );
      setNodes(toFlowNodes(data.generator, null));
      setEdges(toFlowEdges(data.generator.edges));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setGraphMenu(null);
      setPendingDelete(null);
      setPreview(null);
      setLastApply(null);
      setDirty(false);
      dirtyRef.current = false;
      dirtyGeneratorIdRef.current = null;
      setExternalPreviewInvalidated(false);
      latestPreviewSignatureRef.current = "";
    } catch (discardError) {
      setError(
        discardError instanceof Error
          ? discardError.message
          : String(discardError),
      );
    } finally {
      setBusy(null);
    }
  }, [serverUrl, setEdges, setNodes]);

  useEffect(() => {
    if (!activeGenerator || createPanelOpen || !activeGeneratorSignature) return;
    if (
      preview &&
      !externalPreviewInvalidated &&
      latestPreviewSignatureRef.current === activeGeneratorSignature
    ) {
      return;
    }

    const runId = autoPreviewRunRef.current + 1;
    autoPreviewRunRef.current = runId;
    setExternalPreviewInvalidated(true);

    const timeout = window.setTimeout(async () => {
      const previewGenerator = dirty
        ? graphWithFlowState(
            activeGenerator,
            nodesRef.current,
            edgesRef.current,
          )
        : activeGenerator;
      const previewGeneratorId = previewGenerator.id;
      if (autoPreviewRunRef.current !== runId) return;
      setBusy("preview");
      setError(null);
      try {
        const data = await apiFetch<GeneratorPreviewResponse>(
          dirty
            ? `${serverUrl}/api/generators/${encodeURIComponent(previewGeneratorId)}/preview-draft`
            : `${serverUrl}/api/generators/${encodeURIComponent(previewGeneratorId)}/preview`,
          dirty
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: previewGenerator.name,
                  targetCollectionId: previewGenerator.targetCollectionId,
                  nodes: previewGenerator.nodes,
                  edges: previewGenerator.edges,
                  viewport: previewGenerator.viewport,
                }),
              }
            : { method: "POST" },
        );
        if (
          autoPreviewRunRef.current !== runId ||
          activeGeneratorIdRef.current !== previewGeneratorId ||
          data.preview.generatorId !== previewGeneratorId
        ) {
          return;
        }
        setPreview(data.preview);
        latestPreviewSignatureRef.current = activeGeneratorSignature;
        setExternalPreviewInvalidated(false);
        setActiveInitialFocus(null);
      } catch (previewError) {
        if (autoPreviewRunRef.current !== runId) return;
        setError(
          previewError instanceof Error
            ? previewError.message
            : String(previewError),
        );
      } finally {
        if (autoPreviewRunRef.current === runId) setBusy(null);
      }
    }, dirty ? 500 : 0);

    return () => window.clearTimeout(timeout);
  }, [
    activeGenerator,
    activeGeneratorSignature,
    createPanelOpen,
    dirty,
    externalPreviewInvalidated,
    preview,
    serverUrl,
  ]);

  const applyGenerator = useCallback(async () => {
    if (dirty) {
      setError("Save the generator before applying the latest preview.");
      return;
    }
    if (graphHasErrors) {
      setError("Fix graph issues before applying this generator.");
      setEditorMode("graph");
      return;
    }
    if (
      !preview ||
      preview.blocking ||
      preview.outputs.length === 0 ||
      preview.outputs.some((output) => output.collision)
    ) {
      setError("Wait for the latest output preview before applying.");
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
      if (
        activeGeneratorIdRef.current !== saved.id ||
        data.preview.generatorId !== saved.id
      ) {
        return;
      }
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
    graphHasErrors,
    loadGenerators,
    preview,
    serverUrl,
  ]);

  const deleteGenerator = useCallback(async () => {
    if (!activeGenerator) return;
    const deletedGeneratorId = activeGenerator.id;
    const targetCollectionId = activeGenerator.targetCollectionId;
    setBusy("delete");
    setError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${encodeURIComponent(deletedGeneratorId)}`,
        {
          method: "DELETE",
        },
      );
      const nextGenerators = generators.filter(
        (generator) => generator.id !== deletedGeneratorId,
      );
      const nextActiveGeneratorId =
        nextGenerators.find(
          (generator) => generator.targetCollectionId === targetCollectionId,
        )?.id ?? null;
      setGenerators(nextGenerators);
      setActiveGeneratorSelection(nextActiveGeneratorId);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setGraphMenu(null);
      setActiveInitialFocus(null);
      setExternalPreviewInvalidated(false);
      setLastApply(null);
      setEditorMode("setup");
      setPreview(null);
      setDirty(false);
      dirtyRef.current = false;
      dirtyGeneratorIdRef.current = null;
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setBusy(null);
    }
  }, [activeGenerator, generators, serverUrl, setActiveGeneratorSelection]);

  const requestDeleteGenerator = useCallback(() => {
    if (!activeGenerator) return;
    setPendingDelete({
      kind: "generator",
      generatorId: activeGenerator.id,
      name: activeGenerator.name,
    });
  }, [activeGenerator]);

  const selectGenerator = useCallback(
    (generatorId: string) => {
      if (busy) {
        setError("Wait for the current generator action to finish.");
        return;
      }
      if (dirty) {
        setError("Save the current generator before switching to another one.");
        return;
      }
      autoPreviewRunRef.current += 1;
      setActiveGeneratorSelection(generatorId);
      setPreview(null);
      setActiveInitialFocus(null);
      setError(null);
      setLastApply(null);
      setExternalPreviewInvalidated(false);
      setDirty(false);
      setSelectedEdgeId(null);
      setGraphMenu(null);
      dirtyRef.current = false;
      dirtyGeneratorIdRef.current = null;
      setEditorMode("setup");
    },
    [busy, dirty, setActiveGeneratorSelection],
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

  const commitValidatedConnection = useCallback(
    (
      flowEdge: GraphFlowEdge,
      options: {
        baseNodes?: GraphFlowNode[];
        baseEdges?: GraphFlowEdge[];
        replaceEdgeId?: string;
      } = {},
    ) => {
      if (!activeGenerator) return false;
      const baseNodes = options.baseNodes ?? nodes;
      const baseEdges = (options.baseEdges ?? edges).filter(
        (edge) => edge.id !== options.replaceEdgeId,
      );
      const nextEdges = addSingleInputEdge(baseEdges, flowEdge);
      const validationNodes = withTokenInputTypes(
        baseNodes,
        perCollectionFlat,
        activeGenerator.targetCollectionId,
      );
      const candidateGenerator = graphWithFlowState(
        activeGenerator,
        validationNodes,
        nextEdges,
      );
      const check = checkTokenGeneratorConnection(candidateGenerator, {
        sourceNodeId: flowEdge.source,
        sourcePort: String(flowEdge.sourceHandle ?? "value"),
        targetNodeId: flowEdge.target,
        targetPort: String(flowEdge.targetHandle ?? "value"),
        edges: candidateGenerator.edges,
      });
      if (!check.valid) {
        setError(check.reason ?? "That connection is not valid.");
        return false;
      }
      setEdges(nextEdges);
      commitFlowState(baseNodes, nextEdges);
      setSelectedEdgeId(flowEdge.id);
      setGraphMenu(null);
      setError(null);
      return true;
    },
    [activeGenerator, commitFlowState, edges, nodes, perCollectionFlat, setEdges],
  );

  const addPaletteNode = useCallback(
    (
      item: (typeof PALETTE)[number],
      position?: TokenGeneratorDocumentNode["position"],
      options: {
        connectFrom?: { nodeId: string; port: string };
        connectTo?: { nodeId: string; port: string };
        insertEdgeId?: string;
        replaceEdgeId?: string;
      } = {},
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
      const flowNode: GraphFlowNode = {
        id,
        type: "graphNode",
        position: resolvedPosition,
        data: { graphNode, preview: preview ?? undefined },
      };
      const nextNodes = [...nodes, flowNode];
      const validationNextNodes = withTokenInputTypes(
        nextNodes,
        perCollectionFlat,
        activeGenerator.targetCollectionId,
      );
      let nextEdges = edges.filter((edge) => edge.id !== options.replaceEdgeId);
      if (options.insertEdgeId) {
        const edgeToInsert = edges.find((edge) => edge.id === options.insertEdgeId);
        if (!edgeToInsert) return;
        const firstEdge = firstCompatibleEdge(
          activeGenerator,
          validationNextNodes,
          nextEdges.filter((edge) => edge.id !== edgeToInsert.id),
          {
            sourceNodeId: edgeToInsert.source,
            sourcePort: String(edgeToInsert.sourceHandle ?? "value"),
            targetNodeId: id,
          },
        );
        const secondEdge = firstCompatibleEdge(
          activeGenerator,
          validationNextNodes,
          nextEdges.filter((edge) => edge.id !== edgeToInsert.id),
          {
            sourceNodeId: id,
            targetNodeId: edgeToInsert.target,
            targetPort: String(edgeToInsert.targetHandle ?? "value"),
          },
        );
        if (!firstEdge || !secondEdge) {
          setError("That step cannot be inserted into this connection.");
          return;
        }
        nextEdges = addSingleInputEdge(
          addSingleInputEdge(
            nextEdges.filter((edge) => edge.id !== edgeToInsert.id),
            firstEdge,
          ),
          secondEdge,
        );
      } else if (options.connectFrom) {
        const flowEdge = firstCompatibleEdge(activeGenerator, validationNextNodes, nextEdges, {
          sourceNodeId: options.connectFrom.nodeId,
          sourcePort: options.connectFrom.port,
          targetNodeId: id,
        });
        if (!flowEdge) {
          setError("That step cannot receive this connection.");
          return;
        }
        nextEdges = addSingleInputEdge(nextEdges, flowEdge);
      } else if (options.connectTo) {
        const existingInputEdge = options.replaceEdgeId
          ? null
          : nextEdges.find(
              (edge) =>
                edge.target === options.connectTo?.nodeId &&
                (edge.targetHandle ?? "value") === options.connectTo.port,
            );
        if (existingInputEdge) {
          const firstEdge = firstCompatibleEdge(activeGenerator, validationNextNodes, nextEdges, {
            sourceNodeId: existingInputEdge.source,
            sourcePort: String(existingInputEdge.sourceHandle ?? "value"),
            targetNodeId: id,
          });
          const secondEdge = firstCompatibleEdge(activeGenerator, validationNextNodes, nextEdges, {
            sourceNodeId: id,
            targetNodeId: options.connectTo.nodeId,
            targetPort: options.connectTo.port,
            replaceEdgeId: existingInputEdge.id,
          });
          if (!firstEdge || !secondEdge) {
            setError("That step cannot be inserted before this input.");
            return;
          }
          nextEdges = addSingleInputEdge(
            addSingleInputEdge(
              nextEdges.filter((edge) => edge.id !== existingInputEdge.id),
              firstEdge,
            ),
            secondEdge,
          );
        } else {
          const flowEdge = firstCompatibleEdge(activeGenerator, validationNextNodes, nextEdges, {
            sourceNodeId: id,
            targetNodeId: options.connectTo.nodeId,
            targetPort: options.connectTo.port,
          });
          if (!flowEdge) {
            setError("That step cannot connect to this input.");
            return;
          }
          nextEdges = addSingleInputEdge(nextEdges, flowEdge);
        }
      }
      setNodes(nextNodes);
      setEdges(nextEdges);
      commitFlowState(nextNodes, nextEdges);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      setInspectorOpen(true);
      setNodeLibraryOpen(false);
      setGraphMenu(null);
      setError(null);
    },
    [activeGenerator, commitFlowState, edges, nodes, perCollectionFlat, preview, setEdges, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      connectionCompletedRef.current = true;
      const flowEdge = createFlowEdgeFromConnection(connection);
      if (!flowEdge) return;
      commitValidatedConnection(flowEdge);
    },
    [commitValidatedConnection],
  );

  const graphMenuPointFromClient = useCallback(
    (clientX: number, clientY: number): GraphMenuPoint => ({
      x: clientX,
      y: clientY,
      flowPosition:
        flowInstance?.screenToFlowPosition({ x: clientX, y: clientY }) ?? {
          x: clientX,
          y: clientY,
        },
    }),
    [flowInstance],
  );

  const graphMenuPointFromNode = useCallback(
    (node: TokenGeneratorDocumentNode): GraphMenuPoint => {
      const position = { x: node.position.x + 210, y: node.position.y + 40 };
      const screenPosition =
        (
          flowInstance as
            | (ReactFlowInstance<GraphFlowNode, GraphFlowEdge> & {
                flowToScreenPosition?: (position: { x: number; y: number }) => {
                  x: number;
                  y: number;
                };
              })
            | null
        )?.flowToScreenPosition?.(position);
      const fallback = panelRef.current?.getBoundingClientRect();
      return {
        x: screenPosition?.x ?? (fallback ? fallback.left + 240 : 240),
        y: screenPosition?.y ?? (fallback ? fallback.top + 160 : 160),
        flowPosition: position,
      };
    },
    [flowInstance],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!activeGenerator || !selectedNode) return;
    const connectedEdgeCount = edges.filter(
      (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id,
    ).length;
    const deletion = deleteNodeAndPreserveFlow(
      activeGenerator,
      nodes,
      edges,
      selectedNode.id,
      perCollectionFlat,
    );
    setPendingDelete({
      kind: "node",
      nodeId: selectedNode.id,
      label: selectedNode.label,
      connectedEdgeCount,
      reconnectCount: deletion?.reconnectedEdgeCount ?? 0,
    });
  }, [activeGenerator, edges, nodes, perCollectionFlat, selectedNode]);

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      if (!activeGenerator) return;
      const deletion = deleteNodeAndPreserveFlow(
        activeGenerator,
        nodes,
        edges,
        nodeId,
        perCollectionFlat,
      );
      if (!deletion) return;
      setNodes(deletion.nodes);
      setEdges(deletion.edges);
      commitFlowState(deletion.nodes, deletion.edges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setGraphMenu(null);
    },
    [
      activeGenerator,
      commitFlowState,
      edges,
      nodes,
      perCollectionFlat,
      setEdges,
      setNodes,
    ],
  );

  const requestDeleteNodeById = useCallback(
    (nodeId: string) => {
      if (!activeGenerator) return;
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      const deletion = deleteNodeAndPreserveFlow(
        activeGenerator,
        nodes,
        edges,
        nodeId,
        perCollectionFlat,
      );
      const connectedEdgeCount = edges.filter(
        (edge) => edge.source === nodeId || edge.target === nodeId,
      ).length;
      setPendingDelete({
        kind: "node",
        nodeId,
        label: node.data.graphNode.label,
        connectedEdgeCount,
        reconnectCount: deletion?.reconnectedEdgeCount ?? 0,
      });
    },
    [activeGenerator, edges, nodes, perCollectionFlat],
  );

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      if (!activeGenerator) return;
      const edge = edges.find((candidate) => candidate.id === edgeId);
      const targetNode = edge
        ? nodes.find((node) => node.id === edge.target)?.data.graphNode
        : null;
      const removesRequiredOutputInput =
        edge &&
        targetNode &&
        (targetNode.kind === "output" || targetNode.kind === "groupOutput") &&
        edges.filter(
          (candidate) =>
            candidate.target === edge.target &&
            (candidate.targetHandle ?? "value") ===
              (edge.targetHandle ?? "value"),
        ).length <= 1;
      if (removesRequiredOutputInput) {
        setError("Outputs need an input. Replace this connection instead.");
        setGraphMenu(null);
        return;
      }
      const nextEdges = edges.filter((edge) => edge.id !== edgeId);
      setEdges(nextEdges);
      commitFlowState(nodes, nextEdges);
      setSelectedEdgeId(null);
      setGraphMenu(null);
    },
    [activeGenerator, commitFlowState, edges, nodes, setEdges],
  );

  const repairGraphConnections = useCallback(() => {
    if (!activeGenerator) return;
    const validationNodes = withTokenInputTypes(
      nodes,
      perCollectionFlat,
      activeGenerator.targetCollectionId,
    );
    const nextEdges = cleanGraphEdges(activeGenerator, validationNodes, edges);
    if (sameEdgeList(nextEdges, edges)) {
      setError("No broken connections were found to clean up.");
      return;
    }
    setEdges(nextEdges);
    commitFlowState(nodes, nextEdges);
    setSelectedEdgeId(null);
    setGraphMenu(null);
    setError(null);
  }, [
    activeGenerator,
    commitFlowState,
    edges,
    nodes,
    perCollectionFlat,
    setEdges,
  ]);

  const confirmPendingDelete = useCallback(() => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "generator") {
      if (pendingDelete.generatorId !== activeGenerator?.id) {
        setPendingDelete(null);
        return;
      }
      setPendingDelete(null);
      void deleteGenerator();
      return;
    }
    deleteNodeById(pendingDelete.nodeId);
    setPendingDelete(null);
  }, [activeGenerator?.id, deleteGenerator, deleteNodeById, pendingDelete]);

  const duplicateNodeById = useCallback(
    (nodeId: string) => {
      if (!activeGenerator) return;
      const sourceNode = nodes.find((node) => node.id === nodeId);
      if (!sourceNode) return;
      const id = `${sourceNode.data.graphNode.kind}_${Math.random().toString(36).slice(2, 8)}`;
      const position = {
        x: sourceNode.position.x + 36,
        y: sourceNode.position.y + 36,
      };
      const graphNode: TokenGeneratorDocumentNode = {
        ...sourceNode.data.graphNode,
        id,
        label: `${sourceNode.data.graphNode.label} copy`,
        position,
        data: JSON.parse(JSON.stringify(sourceNode.data.graphNode.data)) as Record<
          string,
          unknown
        >,
      };
      const flowNode: GraphFlowNode = {
        id,
        type: "graphNode",
        position,
        data: { graphNode, preview: preview ?? undefined },
      };
      const nextNodes = [...nodes, flowNode];
      setNodes(nextNodes);
      commitFlowState(nextNodes, edges);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      setInspectorOpen(true);
      setGraphMenu(null);
    },
    [activeGenerator, commitFlowState, edges, nodes, preview, setNodes],
  );

  const addOutputStep = useCallback(() => {
    if (!activeGenerator) return;
    const sourceNode =
      (selectedNode &&
      !["output", "groupOutput"].includes(selectedNode.kind)
        ? selectedNode
        : null) ??
      [...nodes]
        .map((node) => node.data.graphNode)
        .filter((node) => !["output", "groupOutput"].includes(node.kind))
        .sort((a, b) => b.position.x - a.position.x)[0] ??
      null;
    const sourcePorts = sourceNode ? getNodeOutputPorts(sourceNode) : [];
    const sourcePortIds = sourcePorts.map((port) => port.id);
    const outputKind =
      sourcePortIds.includes("steps") ||
      sourceNode?.kind === "list"
        ? "groupOutput"
        : "output";
    const paletteItem = PALETTE.find((item) => item.kind === outputKind);
    if (!paletteItem) return;
    const id = `${paletteItem.kind}_${Math.random().toString(36).slice(2, 8)}`;
    const position = sourceNode
      ? { x: sourceNode.position.x + 280, y: sourceNode.position.y + 10 }
      : {
          x:
            Math.max(180, ...nodes.map((node) => node.position.x)) + 260,
          y: 160,
        };
    const graphNode: TokenGeneratorDocumentNode = {
      id,
      kind: paletteItem.kind,
      label: paletteItem.label,
      position,
      data: { ...paletteItem.defaults },
    };
    const flowNode: GraphFlowNode = {
      id,
      type: "graphNode",
      position,
      data: { graphNode, preview: preview ?? undefined },
    };
    const sourcePort = sourcePortIds.includes("steps") ? "steps" : "value";
    const nextEdges =
      sourceNode && sourcePorts.length > 0
        ? addSingleInputEdge(edges, {
            id: `${sourceNode.id}-${sourcePort}-${id}-value`,
            source: sourceNode.id,
            sourceHandle: sourcePort,
            target: id,
            targetHandle: "value",
          })
        : edges;
    const nextNodes = [...nodes, flowNode];
    setNodes(nextNodes);
    setEdges(nextEdges);
    commitFlowState(nextNodes, nextEdges);
    setSelectedNodeId(id);
    setInspectorOpen(true);
    setNodeLibraryOpen(false);
    setEditorMode("graph");
  }, [
    activeGenerator,
    commitFlowState,
    edges,
    nodes,
    preview,
    selectedNode,
    setEdges,
    setNodes,
  ]);

  const focusGraphIssue = useCallback(
    (issue: GraphIssue) => {
      setEditorMode("graph");
      setNodeLibraryOpen(false);
      if (issue.id === "missing-output") {
        addOutputStep();
        return;
      }
      if (issue.edgeId) {
        const edge = activeGenerator?.edges.find(
          (candidate) => candidate.id === issue.edgeId,
        );
        const edgeTargetNode = edge
          ? activeGenerator?.nodes.find((node) => node.id === edge.to.nodeId)
          : null;
        setSelectedNodeId(null);
        setSelectedEdgeId(issue.edgeId);
        setInspectorOpen(false);
        if (edgeTargetNode) {
          setGraphMenu({
            kind: "edge",
            edgeId: issue.edgeId,
            ...graphMenuPointFromNode(edgeTargetNode),
          });
        }
        return;
      }
      if (issue.nodeId) {
        const issueNode = activeGenerator?.nodes.find(
          (node) => node.id === issue.nodeId,
        );
        if (
          issueNode &&
          (issue.message === "Connect an input" || issue.targetPort)
        ) {
          setSelectedNodeId(issue.nodeId);
          setSelectedEdgeId(null);
          setInspectorOpen(false);
          setGraphMenu({
            kind: "connect-to-input",
            targetNodeId: issue.nodeId,
            targetPort: issue.targetPort ?? "value",
            ...graphMenuPointFromNode(issueNode),
          });
          return;
        }
        setSelectedNodeId(issue.nodeId);
        setSelectedEdgeId(null);
        setInspectorOpen(true);
      }
    },
    [activeGenerator, addOutputStep, graphMenuPointFromNode],
  );

  const focusFirstGraphIssue = useCallback(() => {
    const issue =
      graphIssues.find((item) => item.severity === "error") ??
      graphIssues[0];
    if (issue) {
      focusGraphIssue(issue);
    } else {
      setEditorMode("graph");
    }
  }, [focusGraphIssue, graphIssues]);

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
  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
      })),
    [edges, selectedEdgeId],
  );
  const validationNodes = useMemo(
    () =>
      activeGenerator
        ? withTokenInputTypes(
            nodes,
            perCollectionFlat,
            activeGenerator.targetCollectionId,
          )
        : nodes,
    [activeGenerator, nodes, perCollectionFlat],
  );

  const statusLabel = graphHasErrors
    ? "Fix settings"
    : dirty
      ? "Save before applying"
      : externalPreviewInvalidated
        ? "Updating preview"
        : preview?.blocking || previewHasCollisions || previewHasNoOutputs
          ? "Preview has issues"
          : preview
            ? "Ready to apply"
            : activeGenerator
              ? "Preparing preview"
              : "No generator";

  useEffect(() => {
    if (!compactGenerators) {
      setSetupPanelOpen(false);
      setGeneratorListOpen(false);
      setActionsMenuOpen(false);
      return;
    }
    if (editorMode === "graph") {
      setSetupPanelOpen(false);
    } else {
      setNodeLibraryOpen(false);
      setInspectorOpen(false);
    }
  }, [compactGenerators, editorMode]);

  useEffect(() => {
    if (!compactGenerators || editorMode !== "graph" || !flowInstance) return;
    let timeoutId = 0;
    const fitCompactGraph = () => {
      flowInstance.fitView({ padding: 0.14, duration: 150 });
    };
    window.requestAnimationFrame(fitCompactGraph);
    timeoutId = window.setTimeout(fitCompactGraph, 220);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeGeneratorId,
    compactGenerators,
    editorMode,
    flowInstance,
    nodes.length,
    panelWidth,
  ]);

  const renderGraphWorkspace = () => {
    if (!activeGenerator) return null;
    return (
      <div
        className={
          compactGenerators
            ? "relative h-full min-h-0 overflow-hidden"
            : "flex h-full min-h-0 overflow-x-auto"
        }
      >
        <section
          className={
            compactGenerators
              ? "relative h-full min-h-0 w-full min-w-0"
              : "relative min-w-[420px] flex-1"
          }
        >
          {graphIssues.length > 0 ? (
            <GraphIssueCallout
              issues={graphIssues}
              dirty={dirty}
              canRepair={canRepairGraph}
              onFocusIssue={focusGraphIssue}
              onRepair={repairGraphConnections}
              onDiscard={discardGeneratorDraft}
            />
          ) : null}
          <ReactFlow
            key={activeGenerator.id}
            nodes={nodes}
            edges={displayedEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={(changes) => {
              const safeChanges = changes.filter(
                (change) => change.type !== "remove",
              );
              if (safeChanges.length !== changes.length) {
                setError("Use the step menu to delete steps safely.");
              }
              if (safeChanges.length === 0) return;
              if (hasStructuralNodeChange(safeChanges)) {
                const nextNodes = applyNodeChanges(safeChanges, nodesRef.current);
                setNodes(nextNodes);
                commitFlowState(nextNodes, edgesRef.current);
                return;
              }
              setNodes((current) => applyNodeChanges(safeChanges, current));
            }}
            onEdgesChange={(changes) => {
              const safeChanges = changes.filter(
                (change) => change.type !== "remove",
              );
              if (safeChanges.length !== changes.length) {
                setError("Use the connection menu to disconnect safely.");
              }
              if (safeChanges.length === 0) return;
              if (hasStructuralEdgeChange(safeChanges)) {
                const nextEdges = applyEdgeChanges(safeChanges, edgesRef.current);
                setEdges(nextEdges);
                commitFlowState(nodesRef.current, nextEdges);
                return;
              }
              setEdges((current) => applyEdgeChanges(safeChanges, current));
            }}
            onConnect={onConnect}
            onInit={setFlowInstance}
            onMoveEnd={(_event, viewport) => commitViewport(viewport)}
            isValidConnection={(connection) => {
              const flowEdge = createFlowEdgeFromConnection(connection);
              if (!flowEdge || !activeGenerator) return false;
              const nextEdges = addSingleInputEdge(edgesRef.current, flowEdge);
              const validationNodes = withTokenInputTypes(
                nodesRef.current,
                perCollectionFlat,
                activeGenerator.targetCollectionId,
              );
              const candidateGenerator = graphWithFlowState(
                activeGenerator,
                validationNodes,
                nextEdges,
              );
              return checkTokenGeneratorConnection(candidateGenerator, {
                sourceNodeId: flowEdge.source,
                sourcePort: String(flowEdge.sourceHandle ?? "value"),
                targetNodeId: flowEdge.target,
                targetPort: String(flowEdge.targetHandle ?? "value"),
                edges: candidateGenerator.edges,
              }).valid;
            }}
            onConnectStart={(_event, params) => {
              if (!params.nodeId || !params.handleId || !params.handleType) {
                pendingConnectionStartRef.current = null;
                return;
              }
              pendingConnectionStartRef.current = {
                nodeId: params.nodeId,
                port: params.handleId,
                handleType: params.handleType,
              };
              connectionCompletedRef.current = false;
              setGraphMenu(null);
            }}
            onConnectEnd={(event, connectionState) => {
              const start = pendingConnectionStartRef.current;
              pendingConnectionStartRef.current = null;
              if (!start) return;
              if (connectionCompletedRef.current) {
                connectionCompletedRef.current = false;
                return;
              }
              const target = event.target as Element | null;
              if (target?.closest(".react-flow__handle")) return;
              const clientX =
                "clientX" in event
                  ? event.clientX
                  : connectionState.pointer?.x ?? 0;
              const clientY =
                "clientY" in event
                  ? event.clientY
                  : connectionState.pointer?.y ?? 0;
              const point = graphMenuPointFromClient(clientX, clientY);
              suppressNextPaneClickRef.current = true;
              window.setTimeout(() => {
                suppressNextPaneClickRef.current = false;
              }, 120);
              setGraphMenu(
                start.handleType === "source"
                  ? {
                      kind: "connect-from-output",
                      sourceNodeId: start.nodeId,
                      sourcePort: start.port,
                      ...point,
                    }
                  : {
                      kind: "connect-to-input",
                      targetNodeId: start.nodeId,
                      targetPort: start.port,
                      replaceEdgeId: edgesRef.current.find(
                        (edge) =>
                          edge.target === start.nodeId &&
                          (edge.targetHandle ?? "value") === start.port,
                      )?.id,
                      ...point,
                    },
              );
            }}
            onPaneClick={() => {
              if (suppressNextPaneClickRef.current) {
                suppressNextPaneClickRef.current = false;
                return;
              }
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setInspectorOpen(false);
              setGraphMenu(null);
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setGraphMenu({
                kind: "pane-add",
                ...graphMenuPointFromClient(event.clientX, event.clientY),
              });
            }}
            onNodeClick={(_event, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
              setInspectorOpen(false);
              setGraphMenu(null);
              setNodeLibraryOpen(false);
            }}
            onNodeDoubleClick={(_event, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
              setInspectorOpen(true);
              setGraphMenu(null);
            }}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
              setGraphMenu({
                kind: "node",
                nodeId: node.id,
                ...graphMenuPointFromClient(event.clientX, event.clientY),
              });
            }}
            onEdgeClick={(event, edge) => {
              event.stopPropagation();
              setSelectedNodeId(null);
              setSelectedEdgeId(edge.id);
              setInspectorOpen(false);
              setGraphMenu(null);
            }}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              setSelectedNodeId(null);
              setSelectedEdgeId(edge.id);
              setInspectorOpen(false);
              setGraphMenu({
                kind: "edge",
                edgeId: edge.id,
                ...graphMenuPointFromClient(event.clientX, event.clientY),
              });
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
            defaultViewport={activeGenerator.viewport}
            deleteKeyCode={null}
            className="tm-graph"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="var(--color-figma-border)" />
            <Controls
              className="tm-graph-controls"
              showInteractive={false}
            />
          </ReactFlow>
          {graphMenu ? (
            <GraphContextMenu
              menu={graphMenu}
              generator={activeGenerator}
              nodes={validationNodes}
              edges={edges}
              paletteItems={PALETTE}
              onClose={() => setGraphMenu(null)}
              onAddNode={addPaletteNode}
              onConnectEdge={(edge, options) =>
                commitValidatedConnection(edge, options)
              }
              onOpenSettings={(nodeId) => {
                setSelectedNodeId(nodeId);
                setSelectedEdgeId(null);
                setInspectorOpen(true);
                setGraphMenu(null);
              }}
              onDeleteNode={(nodeId) => {
                requestDeleteNodeById(nodeId);
              }}
              onDeleteEdge={deleteEdgeById}
              onDuplicateNode={duplicateNodeById}
              onOpenMenu={setGraphMenu}
            />
          ) : null}
        </section>
        {nodeLibraryOpen ? (
          compactGenerators ? (
            <GeneratorOverlayPanel
              title="Add step"
              onClose={() => setNodeLibraryOpen(false)}
            >
              <NodeLibraryPanel
                allNodesOpen={allNodesOpen}
                paletteQuery={paletteQuery}
                paletteItems={filteredPalette}
                onToggleAllNodes={() => setAllNodesOpen((open) => !open)}
                onPaletteQueryChange={setPaletteQuery}
                onAddNode={addPaletteNode}
                presentation="overlay"
              />
            </GeneratorOverlayPanel>
          ) : (
            <NodeLibraryPanel
              allNodesOpen={allNodesOpen}
              paletteQuery={paletteQuery}
              paletteItems={filteredPalette}
              onToggleAllNodes={() => setAllNodesOpen((open) => !open)}
              onPaletteQueryChange={setPaletteQuery}
              onAddNode={addPaletteNode}
            />
          )
        ) : null}
        {inspectorOpen && selectedNode ? (
          compactGenerators ? (
            <GeneratorOverlayPanel
              title="Graph step"
              onClose={() => setInspectorOpen(false)}
            >
              <section className="p-3">
                <NodeInspector
                  node={selectedNode}
                  collections={collections}
                  perCollectionFlat={perCollectionFlat}
                  defaultCollectionId={activeGenerator.targetCollectionId}
                  onChange={(data) => updateNodeData(selectedNode.id, data)}
                  onDelete={deleteSelectedNode}
                />
              </section>
            </GeneratorOverlayPanel>
          ) : (
            <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-figma-border)]">
              <section className="p-3">
                <h2 className="mb-2 text-primary font-semibold">
                  Graph step
                </h2>
                <NodeInspector
                  node={selectedNode}
                  collections={collections}
                  perCollectionFlat={perCollectionFlat}
                  defaultCollectionId={activeGenerator.targetCollectionId}
                  onChange={(data) => updateNodeData(selectedNode.id, data)}
                  onDelete={deleteSelectedNode}
                />
              </section>
            </aside>
          )
        ) : null}
      </div>
    );
  };

  const renderSetupSummary = (showHeader = true) => {
    if (!activeGenerator) return null;
    return (
      <GeneratorSetupSummary
        generator={activeGenerator}
        targetCollection={targetCollection}
        collections={collections}
        perCollectionFlat={perCollectionFlat}
        preview={preview}
        dirty={dirty}
        externalPreviewInvalidated={externalPreviewInvalidated}
        structuredDraft={structuredDraft}
        graphIssues={graphIssues}
        onChangeStructuredDraft={updateStructuredDraft}
        onEditGraph={() => {
          setEditorMode("graph");
          setSetupPanelOpen(false);
        }}
        onFocusGraphIssue={focusGraphIssue}
        showHeader={showHeader}
      />
    );
  };

  const renderPreviewPanel = () => {
    if (!activeGenerator) return null;
    return (
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
    );
  };

  const renderSetupWorkspace = () => {
    if (!activeGenerator) return null;
    if (compactGenerators) {
      return (
        <div className="relative h-full min-h-0 overflow-hidden">
          <section className="h-full min-w-0 overflow-auto p-3">
            {renderPreviewPanel()}
          </section>
          {setupPanelOpen ? (
            <GeneratorOverlayPanel
              title="Generator setup"
              onClose={() => setSetupPanelOpen(false)}
            >
              <section className="p-3">{renderSetupSummary(false)}</section>
            </GeneratorOverlayPanel>
          ) : null}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 overflow-hidden max-[900px]:flex-col max-[900px]:overflow-y-auto">
        <aside className="w-[360px] shrink-0 overflow-y-auto border-r border-[var(--color-figma-border)] p-3 max-[900px]:max-h-none max-[900px]:w-full max-[900px]:border-b max-[900px]:border-r-0">
          {renderSetupSummary()}
        </aside>
        <section className="min-w-0 flex-1 overflow-auto p-3">
          {renderPreviewPanel()}
        </section>
      </div>
    );
  };

  const renderGeneratorSelector = () => (
    <div className="flex min-w-0 basis-full items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setGeneratorListOpen(true);
          setActionsMenuOpen(false);
          setSetupPanelOpen(false);
          setNodeLibraryOpen(false);
          setInspectorOpen(false);
        }}
        aria-expanded={generatorListOpen}
        aria-label="Open generators"
      >
        <PanelLeft size={14} />
        Generators
      </Button>
      <span
        className="min-w-0 flex-1 truncate text-primary font-semibold"
        title={activeGenerator?.name}
      >
        {activeGenerator?.name ?? "No generator"}
      </span>
    </div>
  );

  const renderActionsMenu = () =>
    actionsMenuOpen ? (
      <>
        <button
          type="button"
          className="fixed inset-0 z-20 cursor-default"
          aria-label="Close generator actions"
          onClick={() => setActionsMenuOpen(false)}
        />
        <div className="absolute right-0 top-9 z-30 min-w-[176px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1 shadow-lg">
          <div className="px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)]">
            {statusLabel}
          </div>
          <ActionRow
            onClick={() => {
              setActionsMenuOpen(false);
              void saveGenerator();
            }}
            disabled={!dirty || busy !== null || graphHasErrors}
          >
            Save generator
          </ActionRow>
          <ActionRow
            onClick={() => {
              setActionsMenuOpen(false);
              void discardGeneratorDraft();
            }}
            disabled={!dirty || busy !== null}
          >
            Discard changes
          </ActionRow>
          {graphHasErrors ? (
            <ActionRow
              onClick={() => {
                setActionsMenuOpen(false);
                focusFirstGraphIssue();
              }}
            >
              Fix settings
            </ActionRow>
          ) : null}
          <ActionRow
            tone="danger"
            onClick={() => {
              setActionsMenuOpen(false);
              requestDeleteGenerator();
            }}
            disabled={busy !== null}
          >
            Delete generator
          </ActionRow>
        </div>
      </>
    ) : null;

  return (
    <div
      ref={panelRef}
      className="relative flex h-full min-h-0 bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
    >
      {leftPanelOpen && !compactGenerators ? (
        <GeneratorListSidebar
          generators={scopedGenerators}
          activeGeneratorId={activeGeneratorId}
          createPanelOpen={createPanelOpen}
          onCreate={() => {
            if (busy) {
              setError("Wait for the current generator action to finish.");
              return;
            }
            if (dirty) {
              setError("Save the current generator before creating another one.");
              return;
            }
            setCreatePanelOpen(true);
            setEditorMode("setup");
            setError(null);
          }}
          onSelect={(generatorId) => {
            setCreatePanelOpen(false);
            selectGenerator(generatorId);
          }}
        />
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        {createPanelOpen ? (
          <GeneratorCreatePanel
            serverUrl={serverUrl}
            collections={collections}
            workingCollectionId={workingCollectionId}
            perCollectionFlat={perCollectionFlat}
            onClose={() => setCreatePanelOpen(false)}
            onOpenGenerator={(generatorId, collectionId, initialView) => {
              if (
                dirtyRef.current &&
                dirtyGeneratorIdRef.current &&
                dirtyGeneratorIdRef.current !== generatorId
              ) {
                setError("Save the current generator before opening another one.");
                setCreatePanelOpen(false);
                return;
              }
              if (collectionId === workingCollectionId) {
                setActiveGeneratorSelection(generatorId);
                setEditorMode(initialView ?? "setup");
                void loadGenerators().then(() => {
                  setActiveGeneratorSelection(generatorId);
                  setEditorMode(initialView ?? "setup");
                });
              } else {
                setError(
                  `Created in ${collectionId}. Switch collections to edit it.`,
                );
                void loadGenerators();
              }
              setCreatePanelOpen(false);
            }}
          />
        ) : (
          <>
            <div
              className={
                compactGenerators
                  ? "flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-2"
                  : "flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] px-3"
              }
            >
              {!compactGenerators ? (
                <IconButton
                  title={leftPanelOpen ? "Hide generator list" : "Show generator list"}
                  aria-label={leftPanelOpen ? "Hide generator list" : "Show generator list"}
                  onClick={() => setLeftPanelOpen((open) => !open)}
                  size="lg"
                >
                  <PanelLeft size={14} />
                </IconButton>
              ) : null}

              {activeGenerator ? (
                <>
                  {compactGenerators ? (
                    renderGeneratorSelector()
                  ) : (
                    <>
                      <input
                        value={activeGenerator.name}
                        onChange={(event) =>
                          patchActiveGraph({ name: event.target.value })
                        }
                        className="min-w-[150px] max-w-[300px] rounded-md bg-transparent px-2 py-1 text-primary font-semibold outline-none hover:bg-[var(--color-figma-bg-hover)] focus:bg-[var(--color-figma-bg-secondary)] max-[760px]:min-w-0 max-[760px]:max-w-[140px]"
                      />
                      <span
                        className="max-w-[220px] truncate text-secondary text-[var(--color-figma-text-secondary)] max-[760px]:hidden"
                        title={activeGenerator.targetCollectionId}
                      >
                        {targetCollection?.publishRouting?.collectionName?.trim() ||
                          activeGenerator.targetCollectionId}
                      </span>
                    </>
                  )}
                  <SegmentedControl
                    value={editorMode}
                    options={GENERATOR_VIEW_OPTIONS}
                    ariaLabel="Generator view"
                    onChange={(mode) => {
                      if (mode === "setup") {
                        setEditorMode("setup");
                        setNodeLibraryOpen(false);
                        setInspectorOpen(false);
                        return;
                      }
                      setEditorMode("graph");
                      setSetupPanelOpen(false);
                    }}
                  />
                  {!compactGenerators ? (
                    busy ? (
                      <span
                        id="generator-status-label"
                        className="text-secondary text-[var(--color-figma-text-secondary)]"
                      >
                        {`${busy.charAt(0).toUpperCase()}${busy.slice(1)}...`}
                      </span>
                    ) : graphHasErrors ? (
                      <button
                        id="generator-status-label"
                        type="button"
                        onClick={focusFirstGraphIssue}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-secondary font-medium text-[var(--color-figma-error)] hover:bg-[color-mix(in_srgb,var(--color-figma-error)_10%,var(--color-figma-bg))]"
                      >
                        <AlertTriangle size={13} />
                        {statusLabel}
                      </button>
                    ) : (
                      <span
                        id="generator-status-label"
                        className="text-secondary text-[var(--color-figma-text-secondary)]"
                      >
                        {statusLabel}
                      </span>
                    )
                  ) : busy ? (
                    <span
                      id="generator-status-label"
                      className="max-w-[104px] truncate text-secondary text-[var(--color-figma-text-secondary)]"
                      title={`${busy.charAt(0).toUpperCase()}${busy.slice(1)}...`}
                    >
                      {`${busy.charAt(0).toUpperCase()}${busy.slice(1)}...`}
                    </span>
                  ) : graphHasErrors ? (
                    <button
                      id="generator-status-label"
                      type="button"
                      onClick={focusFirstGraphIssue}
                      className="inline-flex h-7 max-w-[118px] items-center gap-1.5 rounded-md px-2 text-secondary font-medium text-[var(--color-figma-error)] hover:bg-[color-mix(in_srgb,var(--color-figma-error)_10%,var(--color-figma-bg))]"
                      title={statusLabel}
                    >
                      <AlertTriangle size={13} />
                      <span className="truncate max-[560px]:sr-only">
                        {statusLabel}
                      </span>
                    </button>
                  ) : (
                    <span
                      id="generator-status-label"
                      className="max-w-[112px] truncate text-secondary text-[var(--color-figma-text-secondary)]"
                      title={statusLabel}
                    >
                      {statusLabel}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    {editorMode === "setup" && compactGenerators ? (
                      <IconButton
                        title="Generator setup"
                        aria-label="Generator setup"
                        onClick={() => {
                          setSetupPanelOpen((open) => !open);
                          setActionsMenuOpen(false);
                        }}
                        size="lg"
                      >
                        <Settings2 size={14} />
                      </IconButton>
                    ) : null}
                    {editorMode === "graph" ? (
                      <>
                        <IconButton
                          title={nodeLibraryOpen ? "Hide step library" : "Add step"}
                          aria-label={nodeLibraryOpen ? "Hide step library" : "Add step"}
                          onClick={() => {
                            setNodeLibraryOpen((open) => !open);
                            setInspectorOpen(false);
                            setActionsMenuOpen(false);
                          }}
                          size="lg"
                        >
                          <Plus size={14} />
                        </IconButton>
                        {selectedNode ? (
                          <IconButton
                            title={inspectorOpen ? "Hide settings" : "Show settings"}
                            aria-label={inspectorOpen ? "Hide settings" : "Show settings"}
                            onClick={() => {
                              setInspectorOpen((open) => !open);
                              setNodeLibraryOpen(false);
                              setActionsMenuOpen(false);
                            }}
                            size="lg"
                          >
                            <PanelRight size={14} />
                          </IconButton>
                        ) : null}
                      </>
                    ) : null}
                    {compactGenerators && dirty ? (
                      <Button
                        title="Save generator"
                        aria-label="Save generator"
                        onClick={saveGenerator}
                        disabled={busy !== null || graphHasErrors}
                        variant="secondary"
                        size="sm"
                      >
                        <Save size={14} />
                        <span className="sr-only">Save</span>
                      </Button>
                    ) : null}
                    {!compactGenerators ? (
                      <Button
                        title="Save generator"
                        aria-label="Save generator"
                        onClick={saveGenerator}
                        disabled={!dirty || busy !== null || graphHasErrors}
                        variant={dirty ? "secondary" : "ghost"}
                        size="sm"
                      >
                        <Save size={14} />
                        <span className="max-[760px]:sr-only">Save</span>
                      </Button>
                    ) : null}
                    {!compactGenerators && dirty ? (
                      <Button
                        title="Discard changes"
                        aria-label="Discard changes"
                        onClick={discardGeneratorDraft}
                        disabled={busy !== null}
                        variant="ghost"
                        size="sm"
                      >
                        <X size={14} />
                        <span className="max-[760px]:sr-only">Discard</span>
                      </Button>
                    ) : null}
                    <Button
                      title="Apply generator"
                      aria-label="Apply generator"
                      aria-describedby="generator-status-label"
                      onClick={applyGenerator}
                      disabled={
                        busy !== null ||
                        dirty ||
                        graphHasErrors ||
                        !preview ||
                        Boolean(preview.blocking) ||
                        previewHasCollisions ||
                        previewHasNoOutputs
                      }
                      variant="primary"
                      size="sm"
                    >
                      <Sparkles size={14} />
                      <span className={compactGenerators ? "" : "max-[760px]:sr-only"}>
                        Apply
                      </span>
                    </Button>
                    {compactGenerators ? (
                      <div className="relative">
                        <IconButton
                          title="More generator actions"
                          aria-label="More generator actions"
                          onClick={() => setActionsMenuOpen((open) => !open)}
                          size="lg"
                        >
                          <MoreHorizontal size={14} />
                        </IconButton>
                        {renderActionsMenu()}
                      </div>
                    ) : (
                      <IconButton
                        title="Delete generator"
                        aria-label="Delete generator"
                        onClick={requestDeleteGenerator}
                        disabled={busy !== null}
                        size="lg"
                        tone="danger"
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                    Create a generator for this collection.
                  </span>
                  <Button
                    onClick={() => setCreatePanelOpen(true)}
                    variant="primary"
                    size="sm"
                    className="ml-auto"
                  >
                    <Plus size={14} />
                    Create
                  </Button>
                </>
              )}
            </div>

            {error ? (
              <div className="flex items-center gap-2 px-3 py-2 text-secondary text-[var(--color-figma-error)]">
                <AlertTriangle size={14} />
                {error}
              </div>
            ) : null}
            {lastApply ? (
              <div className="flex items-center gap-2 px-3 py-2 text-secondary text-[var(--color-figma-success)]">
                <Check size={14} />
                Applied {lastApply.created.length} created,{" "}
                {lastApply.updated.length} updated, {lastApply.deleted.length}{" "}
                deleted.
              </div>
            ) : null}

            <div className="min-h-0 flex-1">
              {activeGenerator ? (
                editorMode === "graph" ? (
                  renderGraphWorkspace()
                ) : (
                  renderSetupWorkspace()
                )
              ) : (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-[320px] text-center">
                    <h2 className="text-primary font-semibold">
                      No generators in this collection
                    </h2>
                    <p className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">
                      Create a generator, preview outputs, then apply them.
                    </p>
                    <Button
                      onClick={() => setCreatePanelOpen(true)}
                      variant="primary"
                      size="sm"
                      className="mt-4"
                    >
                      <Plus size={14} />
                      Create generator
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
      {pendingDelete ? (
        <GeneratorDeleteDialog
          action={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPendingDelete}
        />
      ) : null}
      {compactGenerators && generatorListOpen ? (
        <GeneratorOverlayPanel
          title="Generators"
          side="left"
          onClose={() => setGeneratorListOpen(false)}
        >
          <GeneratorListSidebar
            generators={scopedGenerators}
            activeGeneratorId={activeGeneratorId}
            createPanelOpen={createPanelOpen}
            presentation="overlay"
            onCreate={() => {
              if (busy) {
                setError("Wait for the current generator action to finish.");
                return;
              }
              if (dirty) {
                setError("Save the current generator before creating another one.");
                return;
              }
              setGeneratorListOpen(false);
              setCreatePanelOpen(true);
              setEditorMode("setup");
              setError(null);
            }}
            onSelect={(generatorId) => {
              if (busy) {
                setError("Wait for the current generator action to finish.");
                return;
              }
              if (dirty) {
                setError("Save the current generator before switching to another one.");
                return;
              }
              setGeneratorListOpen(false);
              setCreatePanelOpen(false);
              selectGenerator(generatorId);
            }}
          />
        </GeneratorOverlayPanel>
      ) : null}
    </div>
  );
}

function GraphIssueCallout({
  issues,
  dirty,
  canRepair,
  onFocusIssue,
  onRepair,
  onDiscard,
}: {
  issues: GraphIssue[];
  dirty: boolean;
  canRepair: boolean;
  onFocusIssue: (issue: GraphIssue) => void;
  onRepair: () => void;
  onDiscard: () => void;
}) {
  const primaryIssue =
    issues.find((issue) => issue.severity === "error") ?? issues[0];
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const issueCountLabel =
    issues.length === 1
      ? primaryIssue.severity === "error"
        ? "1 issue blocks apply"
        : "1 warning"
      : errorCount > 0
        ? `${errorCount} issue${errorCount === 1 ? "" : "s"} block apply`
        : `${issues.length} warnings`;

  return (
    <div className="absolute left-3 top-3 z-10 max-w-[420px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2 shadow-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          className={
            primaryIssue.severity === "error"
              ? "mt-0.5 shrink-0 text-[var(--color-figma-error)]"
              : "mt-0.5 shrink-0 text-[var(--color-figma-warning)]"
          }
        />
        <div className="min-w-0 flex-1">
          <div className="text-secondary font-semibold text-[var(--color-figma-text)]">
            {issueCountLabel}
          </div>
          <button
            type="button"
            onClick={() => onFocusIssue(primaryIssue)}
            className={`mt-0.5 block max-w-full truncate text-left text-secondary hover:underline ${
              primaryIssue.severity === "error"
                ? "text-[var(--color-figma-error)]"
                : "text-[var(--color-figma-text-secondary)]"
            }`}
            title={primaryIssue.message}
          >
            {primaryIssue.message}
          </button>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onFocusIssue(primaryIssue)}
            >
              Fix
            </Button>
            {canRepair ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onRepair}
              >
                Clean up
              </Button>
            ) : null}
            {dirty ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onDiscard}
              >
                Discard
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneratorDeleteDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: PendingDeleteAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title =
    action.kind === "generator"
      ? "Delete generator?"
      : `Delete "${action.label}"?`;
  const description =
    action.kind === "generator"
      ? `"${action.name}" and its generated-token ownership will be removed. Existing generated tokens stay in the collection.`
      : action.connectedEdgeCount === 0
        ? "This step is not connected to the graph."
        : action.reconnectCount > 0
          ? `${action.connectedEdgeCount} connection${action.connectedEdgeCount === 1 ? "" : "s"} will be removed. ${action.reconnectCount} compatible connection${action.reconnectCount === 1 ? "" : "s"} will be restored around it.`
          : `${action.connectedEdgeCount} connection${action.connectedEdgeCount === 1 ? "" : "s"} will be removed. Review the output preview before applying.`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-figma-overlay)] p-4">
      <section className="w-full max-w-[360px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 shadow-lg">
        <h2 className="text-primary font-semibold text-[var(--color-figma-text)]">
          {title}
        </h2>
        <p className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">
          {description}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </section>
    </div>
  );
}

function GraphContextMenu({
  menu,
  generator,
  nodes,
  edges,
  paletteItems,
  onClose,
  onAddNode,
  onConnectEdge,
  onOpenSettings,
  onDeleteNode,
  onDeleteEdge,
  onDuplicateNode,
  onOpenMenu,
}: {
  menu: GraphMenuState;
  generator: TokenGeneratorDocument;
  nodes: GraphFlowNode[];
  edges: GraphFlowEdge[];
  paletteItems: GeneratorPaletteItem[];
  onClose: () => void;
  onAddNode: (
    item: GeneratorPaletteItem,
    position?: TokenGeneratorDocumentNode["position"],
    options?: {
      connectFrom?: { nodeId: string; port: string };
      connectTo?: { nodeId: string; port: string };
      insertEdgeId?: string;
      replaceEdgeId?: string;
    },
  ) => void;
  onConnectEdge: (
    edge: GraphFlowEdge,
    options?: {
      baseNodes?: GraphFlowNode[];
      baseEdges?: GraphFlowEdge[];
      replaceEdgeId?: string;
    },
  ) => boolean;
  onOpenSettings: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onOpenMenu: (menu: GraphMenuState) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const edge = "edgeId" in menu ? edges.find((item) => item.id === menu.edgeId) : null;
  const node =
    menu.kind === "node"
      ? nodes.find((item) => item.id === menu.nodeId)?.data.graphNode ?? null
      : null;
  const existingCandidates = existingConnectionCandidates(generator, nodes, edges, menu);
  const addCandidates = paletteItems
    .filter((item) => paletteItemFitsMenu(generator, nodes, edges, item, menu))
    .filter(
      (item) =>
        !normalizedQuery ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.category.toLowerCase().includes(normalizedQuery),
    );
  const showAddSearch =
    menu.kind === "pane-add" ||
    menu.kind === "connect-from-output" ||
    menu.kind === "connect-to-input" ||
    menu.kind === "edge-insert";

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 cursor-default"
        aria-label="Close graph menu"
        onClick={onClose}
      />
      <div
        className="fixed z-30 w-[260px] overflow-hidden rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1 shadow-lg"
        style={{ left: menu.x, top: menu.y }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {showAddSearch ? (
          <div className="mb-1 flex items-center gap-2 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
            <Search size={13} className="text-[var(--color-figma-text-secondary)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search steps"
              className="min-w-0 flex-1 bg-transparent text-secondary outline-none"
              autoFocus
            />
          </div>
        ) : null}

        {menu.kind === "node" && node ? (
          <>
            <GraphMenuAction onClick={() => onOpenSettings(node.id)}>
              Settings
            </GraphMenuAction>
            <GraphMenuAction
              disabled={getNodeInputPorts(node).length === 0}
              onClick={() => {
                const inputPort = getNodeInputPorts(node)[0];
                if (!inputPort) return;
                onOpenMenu({
                  ...menu,
                  kind: "connect-to-input",
                  targetNodeId: node.id,
                  targetPort: inputPort.id,
                });
              }}
            >
              Add before
            </GraphMenuAction>
            <GraphMenuAction
              disabled={getNodeOutputPorts(node).length === 0}
              onClick={() => {
                const outputPort = getNodeOutputPorts(node)[0];
                if (!outputPort) return;
                onOpenMenu({
                  ...menu,
                  kind: "connect-from-output",
                  sourceNodeId: node.id,
                  sourcePort: outputPort.id,
                });
              }}
            >
              Add after
            </GraphMenuAction>
            <GraphMenuAction onClick={() => onDuplicateNode(node.id)}>
              Duplicate
            </GraphMenuAction>
            <GraphMenuAction tone="danger" onClick={() => onDeleteNode(node.id)}>
              Delete
            </GraphMenuAction>
          </>
        ) : null}

        {menu.kind === "edge" && edge ? (
          <>
            <GraphMenuAction
              onClick={() =>
                onOpenMenu({
                  ...menu,
                  kind: "edge-insert",
                  edgeId: edge.id,
                })
              }
            >
              Insert step
            </GraphMenuAction>
            <GraphMenuAction
              onClick={() =>
                onOpenMenu({
                  ...menu,
                  kind: "connect-to-input",
                  targetNodeId: edge.target,
                  targetPort: String(edge.targetHandle ?? "value"),
                  replaceEdgeId: edge.id,
                })
              }
            >
              Replace source
            </GraphMenuAction>
            <GraphMenuAction
              onClick={() =>
                onOpenMenu({
                  ...menu,
                  kind: "connect-from-output",
                  sourceNodeId: edge.source,
                  sourcePort: String(edge.sourceHandle ?? "value"),
                  replaceEdgeId: edge.id,
                })
              }
            >
              Replace target
            </GraphMenuAction>
            <GraphMenuAction tone="danger" onClick={() => onDeleteEdge(edge.id)}>
              Delete connection
            </GraphMenuAction>
          </>
        ) : null}

        {existingCandidates.length > 0 ? (
          <GraphMenuGroup title="Existing steps">
            {existingCandidates.map((candidate) => (
              <GraphMenuAction
                key={`${candidate.edge.source}-${candidate.edge.sourceHandle}-${candidate.edge.target}-${candidate.edge.targetHandle}`}
                onClick={() =>
                  onConnectEdge(candidate.edge, {
                    replaceEdgeId:
                      menu.kind === "connect-from-output" ||
                      menu.kind === "connect-to-input"
                        ? menu.replaceEdgeId
                        : undefined,
                  })
                }
              >
                {candidate.label}
              </GraphMenuAction>
            ))}
          </GraphMenuGroup>
        ) : null}

        {showAddSearch ? (
          <GraphMenuGroup title={existingCandidates.length > 0 ? "New steps" : "Steps"}>
            {addCandidates.map((item) => (
              <GraphMenuAction
                key={`${item.kind}-${item.label}`}
                onClick={() => {
                  if (menu.kind === "connect-from-output") {
                    onAddNode(item, menu.flowPosition, {
                      connectFrom: {
                        nodeId: menu.sourceNodeId,
                        port: menu.sourcePort,
                      },
                      replaceEdgeId: menu.replaceEdgeId,
                    });
                    return;
                  }
                  if (menu.kind === "connect-to-input") {
                    onAddNode(item, menu.flowPosition, {
                      connectTo: {
                        nodeId: menu.targetNodeId,
                        port: menu.targetPort,
                      },
                      replaceEdgeId: menu.replaceEdgeId,
                    });
                    return;
                  }
                  if (menu.kind === "edge-insert") {
                    onAddNode(item, menu.flowPosition, {
                      insertEdgeId: menu.edgeId,
                    });
                    return;
                  }
                  onAddNode(item, menu.flowPosition);
                }}
              >
                {item.label}
              </GraphMenuAction>
            ))}
            {addCandidates.length === 0 ? (
              <div className="px-2 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
                No compatible steps.
              </div>
            ) : null}
          </GraphMenuGroup>
        ) : null}
      </div>
    </>
  );
}

function GraphMenuGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-2 py-1 text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function GraphMenuAction({
  children,
  disabled,
  tone,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded px-2 py-1.5 text-left text-secondary disabled:pointer-events-none disabled:opacity-40 ${
        tone === "danger"
          ? "text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
          : "text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

function existingConnectionCandidates(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
  menu: GraphMenuState,
): Array<{ label: string; edge: GraphFlowEdge }> {
  if (menu.kind !== "connect-from-output" && menu.kind !== "connect-to-input") {
    return [];
  }
  if (
    menu.kind === "connect-to-input" &&
    !menu.replaceEdgeId &&
    edges.some(
      (edge) =>
        edge.target === menu.targetNodeId &&
        (edge.targetHandle ?? "value") === menu.targetPort,
    )
  ) {
    return [];
  }
  return nodes
    .map((node) => {
      const edge =
        menu.kind === "connect-from-output"
          ? firstCompatibleEdge(generator, nodes, edges, {
              sourceNodeId: menu.sourceNodeId,
              sourcePort: menu.sourcePort,
              targetNodeId: node.id,
              replaceEdgeId: menu.replaceEdgeId,
            })
          : firstCompatibleEdge(generator, nodes, edges, {
              sourceNodeId: node.id,
              targetNodeId: menu.targetNodeId,
              targetPort: menu.targetPort,
              replaceEdgeId: menu.replaceEdgeId,
            });
      if (!edge) return null;
      const graphNode = node.data.graphNode;
      const portLabel =
        menu.kind === "connect-from-output"
          ? getNodeInputPorts(graphNode).find(
              (port) => port.id === edge.targetHandle,
            )?.label
          : getNodeOutputPorts(graphNode).find(
              (port) => port.id === edge.sourceHandle,
            )?.label;
      return {
        label: `${graphNode.label}${portLabel ? `: ${portLabel}` : ""}`,
        edge,
      };
    })
    .filter((candidate): candidate is { label: string; edge: GraphFlowEdge } =>
      Boolean(candidate),
    );
}

function paletteItemFitsMenu(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
  item: GeneratorPaletteItem,
  menu: GraphMenuState,
): boolean {
  if (menu.kind === "pane-add") return true;
  if (menu.kind !== "connect-from-output" && menu.kind !== "connect-to-input" && menu.kind !== "edge-insert") {
    return false;
  }
  const candidateId = `candidate_${item.kind}`;
  const candidateNode = flowNodeFromPaletteItem(item, candidateId, menu.flowPosition);
  const candidateNodes = [...nodes, candidateNode];
  if (menu.kind === "connect-from-output") {
    return Boolean(
      firstCompatibleEdge(generator, candidateNodes, edges, {
        sourceNodeId: menu.sourceNodeId,
        sourcePort: menu.sourcePort,
        targetNodeId: candidateId,
        replaceEdgeId: menu.replaceEdgeId,
      }),
    );
  }
  if (menu.kind === "connect-to-input") {
    const existingInputEdge = menu.replaceEdgeId
      ? null
      : edges.find(
          (edge) =>
            edge.target === menu.targetNodeId &&
            (edge.targetHandle ?? "value") === menu.targetPort,
        );
    if (existingInputEdge) {
      const first = firstCompatibleEdge(generator, candidateNodes, edges, {
        sourceNodeId: existingInputEdge.source,
        sourcePort: String(existingInputEdge.sourceHandle ?? "value"),
        targetNodeId: candidateId,
      });
      const second = firstCompatibleEdge(generator, candidateNodes, edges, {
        sourceNodeId: candidateId,
        targetNodeId: menu.targetNodeId,
        targetPort: menu.targetPort,
        replaceEdgeId: existingInputEdge.id,
      });
      return Boolean(first && second);
    }
    return Boolean(
      firstCompatibleEdge(generator, candidateNodes, edges, {
        sourceNodeId: candidateId,
        targetNodeId: menu.targetNodeId,
        targetPort: menu.targetPort,
        replaceEdgeId: menu.replaceEdgeId,
      }),
    );
  }
  const edge = edges.find((candidate) => candidate.id === menu.edgeId);
  if (!edge) return false;
  const baseEdges = edges.filter((candidate) => candidate.id !== edge.id);
  const first = firstCompatibleEdge(generator, candidateNodes, baseEdges, {
    sourceNodeId: edge.source,
    sourcePort: String(edge.sourceHandle ?? "value"),
    targetNodeId: candidateId,
  });
  const second = firstCompatibleEdge(generator, candidateNodes, baseEdges, {
    sourceNodeId: candidateId,
    targetNodeId: edge.target,
    targetPort: String(edge.targetHandle ?? "value"),
  });
  return Boolean(first && second);
}

function firstCompatibleEdge(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
  input: {
    sourceNodeId: string;
    sourcePort?: string;
    targetNodeId: string;
    targetPort?: string;
    replaceEdgeId?: string;
  },
): GraphFlowEdge | null {
  if (input.sourceNodeId === input.targetNodeId) return null;
  const sourceNode = nodes.find((node) => node.id === input.sourceNodeId)?.data.graphNode;
  const targetNode = nodes.find((node) => node.id === input.targetNodeId)?.data.graphNode;
  if (!sourceNode || !targetNode) return null;
  const sourcePorts = getNodeOutputPorts(sourceNode).filter(
    (port) => !input.sourcePort || port.id === input.sourcePort,
  );
  const targetPorts = getNodeInputPorts(targetNode).filter(
    (port) => !input.targetPort || port.id === input.targetPort,
  );
  const baseEdges = edges.filter((edge) => edge.id !== input.replaceEdgeId);
  for (const sourcePort of sourcePorts) {
    for (const targetPort of targetPorts) {
      const edge = makeGraphFlowEdge(
        input.sourceNodeId,
        sourcePort.id,
        input.targetNodeId,
        targetPort.id,
      );
      const nextEdges = addSingleInputEdge(baseEdges, edge);
      const candidateGenerator = graphWithFlowState(generator, nodes, nextEdges);
      const check = checkTokenGeneratorConnection(candidateGenerator, {
        sourceNodeId: edge.source,
        sourcePort: String(edge.sourceHandle ?? "value"),
        targetNodeId: edge.target,
        targetPort: String(edge.targetHandle ?? "value"),
        edges: candidateGenerator.edges,
      });
      if (check.valid) return edge;
    }
  }
  return null;
}

function flowNodeFromPaletteItem(
  item: GeneratorPaletteItem,
  id: string,
  position: TokenGeneratorDocumentNode["position"],
): GraphFlowNode {
  const graphNode: TokenGeneratorDocumentNode = {
    id,
    kind: item.kind,
    label: item.label,
    position,
    data: { ...item.defaults },
  };
  return {
    id,
    type: "graphNode",
    position,
    data: { graphNode },
  };
}

function withTokenInputTypes(
  nodes: GraphFlowNode[],
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  defaultCollectionId: string,
): GraphFlowNode[] {
  return nodes.map((node) => {
    const graphNode = node.data.graphNode;
    if (graphNode.kind !== "tokenInput") return node;
    const nextGraphNode = graphNodeWithInferredTokenInputType(
      graphNode,
      perCollectionFlat,
      defaultCollectionId,
    );
    if (nextGraphNode === graphNode) return node;
    return {
      ...node,
      data: {
        ...node.data,
        graphNode: nextGraphNode,
      },
    };
  });
}

function generatorWithInferredTokenInputTypes(
  generator: TokenGeneratorDocument,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): TokenGeneratorDocument {
  return {
    ...generator,
    nodes: generator.nodes.map((node) =>
      graphNodeWithInferredTokenInputType(
        node,
        perCollectionFlat,
        generator.targetCollectionId,
      ),
    ),
  };
}

function graphNodeWithInferredTokenInputType(
  graphNode: TokenGeneratorDocumentNode,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  defaultCollectionId: string,
): TokenGeneratorDocumentNode {
  if (graphNode.kind !== "tokenInput") return graphNode;
  const collectionId = String(
    graphNode.data.collectionId ?? defaultCollectionId,
  );
  const path = String(graphNode.data.path ?? "");
  const tokenType = perCollectionFlat[collectionId]?.[path]?.$type;
  if (tokenType === graphNode.data.tokenType) return graphNode;
  if (!tokenType) {
    if (!("tokenType" in graphNode.data)) return graphNode;
    const data = { ...graphNode.data };
    delete data.tokenType;
    return {
      ...graphNode,
      data,
    };
  }
  return {
    ...graphNode,
    data: {
      ...graphNode.data,
      tokenType,
    },
  };
}

function makeGraphFlowEdge(
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
): GraphFlowEdge {
  return {
    id: `${sourceNodeId}-${sourcePort}-${targetNodeId}-${targetPort}`,
    source: sourceNodeId,
    sourceHandle: sourcePort,
    target: targetNodeId,
    targetHandle: targetPort,
  };
}

function GeneratorOverlayPanel({
  title,
  side = "right",
  onClose,
  children,
}: {
  title: string;
  side?: "left" | "right";
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 z-20 flex bg-[var(--color-figma-overlay)] ${
        side === "left" ? "justify-start" : "justify-end"
      }`}
    >
      <aside
        className={`flex h-full w-full max-w-[360px] flex-col overflow-hidden bg-[var(--color-figma-bg)] shadow-[0_18px_36px_rgba(0,0,0,0.24)] max-[640px]:max-w-none ${
          side === "left"
            ? "border-r border-[var(--color-figma-border)]"
            : "border-l border-[var(--color-figma-border)]"
        }`}
      >
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--color-figma-border)] px-3">
          <h2 className="min-w-0 truncate text-primary font-semibold">{title}</h2>
          <IconButton title="Close" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

function GeneratorSetupSummary({
  generator,
  targetCollection,
  collections,
  perCollectionFlat,
  preview,
  dirty,
  externalPreviewInvalidated,
  structuredDraft,
  graphIssues,
  onChangeStructuredDraft,
  onEditGraph,
  onFocusGraphIssue,
  showHeader = true,
}: {
  generator: TokenGeneratorDocument;
  targetCollection: TokenCollection | undefined;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  preview: TokenGeneratorPreviewResult | null;
  dirty: boolean;
  externalPreviewInvalidated: boolean;
  structuredDraft: GeneratorStructuredDraft | null;
  graphIssues: GraphIssue[];
  onChangeStructuredDraft: (patch: Partial<GeneratorStructuredDraft>) => void;
  onEditGraph: () => void;
  onFocusGraphIssue: (issue: GraphIssue) => void;
  showHeader?: boolean;
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
      ? "Updating preview"
      : preview
        ? "Preview ready"
        : "Preparing preview";

  return (
    <div className="min-h-0">
      <div className="space-y-3">
        {showHeader ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-primary font-semibold text-[var(--color-figma-text)]">
                Generator setup
              </h3>
              <button
                type="button"
                onClick={onEditGraph}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                <Workflow size={13} />
                Edit graph
              </button>
            </div>
          </section>
        ) : null}

        <section className="flex flex-wrap gap-x-4 gap-y-1 text-secondary">
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
              perCollectionFlat={perCollectionFlat}
              onChange={onChangeStructuredDraft}
            />
          ) : (
            <div className="py-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
              Custom graph. Edit the graph to change the steps.
            </div>
          )}
        </section>

        {graphIssues.length > 0 ? (
          <section className="space-y-1">
            <h3 className="text-primary font-semibold text-[var(--color-figma-text)]">
              Needs attention
            </h3>
            {graphIssues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => onFocusGraphIssue(issue)}
                className={`block w-full rounded px-1 py-1.5 text-secondary ${
                  issue.severity === "error"
                    ? "text-[var(--color-figma-error)]"
                    : "text-[var(--color-figma-text-secondary)]"
                } text-left hover:bg-[var(--color-figma-bg-hover)]`}
              >
                {issue.message}
              </button>
            ))}
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-primary font-semibold text-[var(--color-figma-text)]">
            Output groups
          </h3>
          {outputNodes.length > 0 ? (
            <div className="space-y-1">
              {outputNodes.map((node) => (
                <div
                  key={node.id}
                  className="py-1.5 text-secondary text-[var(--color-figma-text)]"
                >
                  {String(
                    node.data.pathPrefix ?? node.data.path ?? "Untitled output",
                  )}
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                onFocusGraphIssue({
                  id: "missing-output",
                  severity: "error",
                  message: "Add an output step",
                })
              }
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              <Plus size={13} />
              Add output step
            </button>
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
  perCollectionFlat,
  onChange,
}: {
  draft: GeneratorStructuredDraft;
  targetCollectionId: string;
  targetCollection: TokenCollection | undefined;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
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
  const sourceTokenEntries = useMemo(
    () =>
      Object.entries(perCollectionFlat[sourceCollectionId] ?? {})
        .filter(([, token]) => generatorAcceptsTokenType(draft.kind, token.$type))
        .sort(([a], [b]) => a.localeCompare(b)),
    [draft.kind, perCollectionFlat, sourceCollectionId],
  );
  const targetModeNames = targetCollection?.modes.map((mode) => mode.name) ?? [];
  const sourceModeNames = sourceCollection?.modes.map((mode) => mode.name) ?? [];
  const missingSourceModes = targetModeNames.filter(
    (modeName) => !sourceModeNames.includes(modeName),
  );
  const modeCompatibility =
    !crossCollectionSource ||
    !targetCollection ||
    !sourceCollection ||
    missingSourceModes.length === 0;
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
          className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary"
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
          className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
        />
      </label>

      {!SOURCELESS_GENERATOR_PRESETS.has(draft.kind) ? (
        <div className="space-y-2">
          <SegmentedControl
            value={draft.sourceMode}
            options={[
              { value: "literal", label: "Value" },
              { value: "token", label: "Token" },
            ]}
            ariaLabel="Generator source"
            onChange={(mode) =>
              onChange({
                sourceMode: mode,
                ...(mode === "token"
                  ? { sourceCollectionId: targetCollectionId }
                  : {}),
              })
            }
          />
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
              <TokenSourcePicker
                value={draft.sourceTokenPath}
                entries={sourceTokenEntries}
                sourceCollectionId={sourceCollectionId}
                sourceModes={sourceModeNames}
                onChange={(sourceTokenPath) => onChange({ sourceTokenPath })}
              />
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
                      ? "Source modes match the target collection."
                      : `Missing source ${missingSourceModes.length === 1 ? "mode" : "modes"}: ${missingSourceModes.join(", ")}. Add matching modes to the source collection or choose a source from this collection.`}
                  </div>
                ) : null}
              </details>
            </div>
          )}
        </div>
      ) : null}

      {draft.kind === "colorRamp" ? (
        <>
          <NumberStepList
            label="Steps"
            values={asNumberArray(draft.config.steps)}
            onChange={(steps) => setConfig({ steps })}
          />
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
        <>
          <TextField
            label="Unit"
            value={draft.config.unit}
            onChange={(value) => setConfig({ unit: value })}
          />
          <NamedNumberStepList
            label="Steps"
            values={asNamedNumberSteps(
              draft.config.steps,
              draft.kind === "radius" ? "multiplier" : "multiplier",
            )}
            valueKey="multiplier"
            onChange={(steps) => setConfig({ steps })}
          />
        </>
      ) : null}
      {draft.kind === "type" ? (
        <>
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
          <NamedNumberStepList
            label="Steps"
            values={asNamedNumberSteps(draft.config.steps, "exponent")}
            valueKey="exponent"
            onChange={(steps) => setConfig({ steps })}
          />
        </>
      ) : null}
      {draft.kind === "shadow" ? (
        <>
          <TextField
            label="Shadow color"
            value={draft.config.color}
            onChange={(value) => setConfig({ color: value })}
          />
          <ShadowStepList
            values={asRecordArray(draft.config.steps)}
            onChange={(steps) => setConfig({ steps })}
          />
        </>
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
          <NamedNumberStepList
            label="Steps"
            values={asNamedNumberSteps(draft.config.steps, "index")}
            valueKey="index"
            optionalValueKey="multiplier"
            onChange={(steps) => setConfig({ steps })}
          />
        </>
      ) : null}
      {draft.kind === "opacity" || draft.kind === "zIndex" ? (
        <NamedNumberStepList
          label="Steps"
          values={asNamedNumberSteps(draft.config.steps, "value")}
          valueKey="value"
          onChange={(steps) => setConfig({ steps })}
        />
      ) : null}
    </div>
  );
}

function TokenSourcePicker({
  value,
  entries,
  sourceCollectionId,
  sourceModes,
  onChange,
}: {
  value: string;
  entries: Array<[string, TokenMapEntry]>;
  sourceCollectionId: string;
  sourceModes: string[];
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return entries.filter(
      ([path, token]) =>
        !normalized ||
        path.toLowerCase().includes(normalized) ||
        token.$type.toLowerCase().includes(normalized),
    );
  }, [entries, query]);
  const selected = value ? entries.find(([path]) => path === value) : undefined;

  return (
    <div className="space-y-2">
      <div>
        <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
          Source token
        </span>
        <div className="flex items-center gap-2 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
          <Search
            size={14}
            className="shrink-0 text-[var(--color-figma-text-secondary)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={value || "Search compatible tokens"}
            className="min-w-0 flex-1 bg-transparent text-secondary outline-none"
          />
        </div>
      </div>
      {selected ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex w-full items-center gap-2 rounded bg-[var(--color-figma-bg-selected)] px-2 py-1.5 text-left text-secondary"
          title="Clear source token"
          aria-label="Clear source token"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{selected[0]}</span>
            <TokenModeValueCell
              token={selected[1]}
              collectionId={sourceCollectionId}
              modes={sourceModes}
            />
          </span>
        </button>
      ) : null}
      <div className="max-h-[180px] overflow-y-auto py-1">
        {filteredEntries.slice(0, 40).map(([path, token]) => (
          <button
            key={path}
            type="button"
            onClick={() => {
              onChange(path);
              setQuery("");
            }}
            className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{path}</span>
              <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                {token.$type}
              </span>
              <TokenModeValueCell
                token={token}
                collectionId={sourceCollectionId}
                modes={sourceModes}
              />
            </span>
          </button>
        ))}
        {filteredEntries.length === 0 ? (
          <div className="px-2 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
            No compatible tokens in this collection.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TokenModeValueCell({
  token,
  collectionId,
  modes,
}: {
  token: TokenMapEntry;
  collectionId: string;
  modes: string[];
}) {
  const modeValues = readTokenModeValues(token, collectionId, modes).slice(0, 3);
  return (
    <span className="mt-1 flex min-w-0 flex-col gap-0.5 text-tertiary text-[var(--color-figma-text-secondary)]">
      {modeValues.map(([modeName, value]) => (
        <span key={modeName} className="flex min-w-0 items-center gap-1">
          {previewIsValueBearing(token.$type) ? (
            <ValuePreview type={token.$type} value={value} size={12} />
          ) : null}
          <span
            className={`truncate ${
              value == null ? "text-[var(--color-figma-text-tertiary)]" : ""
            }`}
          >
            {modeName}: {value == null ? "No value" : formatValue(value)}
          </span>
        </span>
      ))}
    </span>
  );
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

function NumberStepList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: number[];
  onChange: (values: number[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <StepListHeader label={label} onAdd={() => onChange([...values, 0])} />
      <div className="space-y-1">
        {values.map((value, index) => (
          <StepRow key={index}>
            <input
              type="number"
              value={value}
              onChange={(event) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? Number(event.target.value) : item,
                  ),
                )
              }
              className="min-w-0 flex-1 bg-transparent text-secondary outline-none"
            />
            <RemoveStepButton
              onClick={() =>
                onChange(values.filter((_item, itemIndex) => itemIndex !== index))
              }
            />
          </StepRow>
        ))}
      </div>
    </div>
  );
}

function NamedNumberStepList({
  label,
  values,
  valueKey,
  optionalValueKey,
  onChange,
}: {
  label: string;
  values: Record<string, unknown>[];
  valueKey: string;
  optionalValueKey?: string;
  onChange: (values: Record<string, unknown>[]) => void;
}) {
  const addStep = () =>
    onChange([
      ...values,
      { name: `step-${values.length + 1}`, [valueKey]: 0 },
    ]);
  return (
    <div className="space-y-1.5">
      <StepListHeader label={label} onAdd={addStep} />
      <div className="space-y-1">
        {values.map((step, index) => (
          <StepRow key={index}>
            <input
              value={String(step.name ?? "")}
              onChange={(event) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                )
              }
              className="min-w-0 flex-[1.2] bg-transparent text-secondary outline-none"
              placeholder="name"
            />
            <input
              type="number"
              value={Number(step[valueKey] ?? 0)}
              onChange={(event) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, [valueKey]: Number(event.target.value) }
                      : item,
                  ),
                )
              }
              className="min-w-0 flex-1 bg-transparent text-secondary outline-none"
              title={valueKey}
            />
            {optionalValueKey ? (
              <input
                type="number"
                value={
                  step[optionalValueKey] == null
                    ? ""
                    : String(step[optionalValueKey])
                }
                onChange={(event) =>
                  onChange(
                    values.map((item, itemIndex) =>
                      itemIndex === index
                        ? applyOptionalNumberField(
                            item,
                            optionalValueKey,
                            event.target.value,
                          )
                        : item,
                    ),
                  )
                }
                className="min-w-0 flex-1 bg-transparent text-secondary outline-none"
                title={optionalValueKey}
              />
            ) : null}
            <RemoveStepButton
              onClick={() =>
                onChange(values.filter((_item, itemIndex) => itemIndex !== index))
              }
            />
          </StepRow>
        ))}
      </div>
    </div>
  );
}

function ShadowStepList({
  values,
  onChange,
}: {
  values: Record<string, unknown>[];
  onChange: (values: Record<string, unknown>[]) => void;
}) {
  const fields = ["offsetX", "offsetY", "blur", "spread", "opacity"];
  return (
    <div className="space-y-1.5">
      <StepListHeader
        label="Steps"
        onAdd={() =>
          onChange([
            ...values,
            {
              name: `step-${values.length + 1}`,
              offsetX: 0,
              offsetY: 2,
              blur: 8,
              spread: 0,
              opacity: 0.2,
            },
          ])
        }
      />
      <div className="space-y-1">
        {values.map((step, index) => (
          <div
            key={index}
            className="border-t border-[var(--color-figma-border)] px-0 py-2 first:border-t-0"
          >
            <div className="mb-1 flex items-center gap-2">
              <input
                value={String(step.name ?? "")}
                onChange={(event) =>
                  onChange(
                    values.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
                className="min-w-0 flex-1 bg-transparent text-secondary font-medium outline-none"
                placeholder="name"
              />
              <RemoveStepButton
                onClick={() =>
                  onChange(
                    values.filter((_item, itemIndex) => itemIndex !== index),
                  )
                }
              />
            </div>
            <div className="grid grid-cols-5 gap-1">
              {fields.map((fieldName) => (
                <input
                  key={fieldName}
                  type="number"
                  value={Number(step[fieldName] ?? 0)}
                  onChange={(event) =>
                    onChange(
                      values.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, [fieldName]: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                  className="min-w-0 rounded bg-[var(--color-figma-bg)] px-1 py-1 text-tertiary outline-none"
                  title={fieldName}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepListHeader({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        title={`Add ${label.toLowerCase()}`}
        aria-label={`Add ${label.toLowerCase()}`}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function StepRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2 py-1">
      {children}
    </div>
  );
}

function RemoveStepButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
      title="Remove step"
      aria-label="Remove step"
    >
      <Trash2 size={12} />
    </button>
  );
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

function applyOptionalNumberField(
  item: Record<string, unknown>,
  key: string,
  rawValue: string,
): Record<string, unknown> {
  if (rawValue.trim() === "") {
    const next = { ...item };
    delete next[key];
    return next;
  }
  return { ...item, [key]: Number(rawValue) };
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter(Number.isFinite)
    : [];
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object")
    ? (value as Record<string, unknown>[])
    : [];
}

function asNamedNumberSteps(
  value: unknown,
  valueKey: string,
): Record<string, unknown>[] {
  return asRecordArray(value).map((item) => ({
    ...item,
    name: String(item.name ?? ""),
    [valueKey]: Number(item[valueKey] ?? 0),
  }));
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
        className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
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
        className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary outline-none"
      />
    </label>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <div className="text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </div>
      <div
        className="max-w-[160px] truncate text-secondary font-semibold text-[var(--color-figma-text)]"
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
  const hasWarnings = !hasErrors && (issues.length > 0 || diagnostics.length > 0);
  const nodeStateClass = selected
    ? "tm-graph-node--selected"
    : hasErrors
      ? "tm-graph-node--error"
      : hasWarnings
        ? "tm-graph-node--warning"
        : "";
  const summary = nodeSummary(graphNode);
  const statusMessage = issues[0]?.message ?? diagnostics[0]?.message;
  const nodeStyle: CSSProperties & { "--tm-graph-node-accent": string } = {
    minBlockSize: graphNodeMinBlockSize(inputPorts.length, outputPorts.length),
    "--tm-graph-node-accent": graphNodeAccent(graphNode),
  };

  return (
    <div
      className={`tm-graph-node ${nodeStateClass}`.trim()}
      style={nodeStyle}
    >
      {inputPorts.map((port, index) => (
        <Handle
          key={`in-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          className="tm-graph-node__handle"
          style={portHandleStyle(inputPorts.length, index)}
        />
      ))}
      {outputPorts.map((port, index) => (
        <Handle
          key={`out-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          className="tm-graph-node__handle"
          style={portHandleStyle(outputPorts.length, index)}
        />
      ))}
      <PortLabelColumn ports={inputPorts} side="input" />
      <PortLabelColumn ports={outputPorts} side="output" />
      <div className="tm-graph-node__content">
        <div className="tm-graph-node__header">
          <div className="tm-graph-node__heading">
            <div className="tm-graph-node__title" title={graphNode.label}>
              {graphNode.label}
            </div>
            <div className="tm-graph-node__kind">
              {formatNodeKind(graphNode.kind)}
            </div>
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
        <div className="tm-graph-node__summary" title={summary}>
          {summary}
        </div>
        {statusMessage ? (
          <div
            className={`tm-graph-node__status ${hasErrors ? "tm-graph-node__status--error" : "tm-graph-node__status--warning"}`}
            title={statusMessage}
          >
            {statusMessage}
          </div>
        ) : null}
        {relatedOutputs.length > 0 && (
          <div className="tm-graph-node__outputs">
            {relatedOutputs.slice(0, 3).map((output) => (
              <div
                key={output.path}
                className="tm-graph-node__output-path"
                title={output.path}
              >
                {output.path}
              </div>
            ))}
            {relatedOutputs.length > 3 && (
              <div className="tm-graph-node__output-more">
                +{relatedOutputs.length - 3} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PortLabelColumn({
  ports,
  side,
}: {
  ports: TokenGeneratorPortDescriptor[];
  side: "input" | "output";
}) {
  if (ports.length === 0) return null;
  return (
    <div
      className={`tm-graph-node__ports tm-graph-node__ports--${side}`}
      aria-hidden="true"
    >
      {ports.map((port, index) => (
        <div
          key={port.id}
          className="tm-graph-node__port-label"
          style={portLabelStyle(ports.length, index)}
          title={formatPortLabel(port)}
        >
          <span className="tm-graph-node__port-name">{port.label}</span>
          <span className="tm-graph-node__port-meta">
            {formatPortMeta(port)}
          </span>
        </div>
      ))}
    </div>
  );
}

function graphNodeMinBlockSize(inputCount: number, outputCount: number): number {
  const portCount = Math.max(inputCount, outputCount, 1);
  return Math.max(116, 64 + portCount * 30);
}

function graphNodeAccent(node: TokenGeneratorDocumentNode): string {
  switch (node.kind) {
    case "color":
    case "colorRamp":
      return "var(--color-token-family-color)";
    case "spacingScale":
    case "borderRadiusScale":
    case "customScale":
      return "var(--color-token-family-size)";
    case "typeScale":
      return "var(--color-token-family-type)";
    case "opacityScale":
    case "shadowScale":
      return "var(--color-token-family-effect)";
    case "output":
    case "groupOutput":
      return "var(--color-figma-accent)";
    default:
      return "var(--color-figma-text-tertiary)";
  }
}

function formatNodeKind(kind: TokenGeneratorDocumentNode["kind"]): string {
  switch (kind) {
    case "tokenInput":
      return "Token input";
    case "groupOutput":
      return "Group output";
    case "colorRamp":
      return "Color ramp";
    case "spacingScale":
      return "Spacing scale";
    case "typeScale":
      return "Type scale";
    case "borderRadiusScale":
      return "Radius scale";
    case "opacityScale":
      return "Opacity scale";
    case "shadowScale":
      return "Shadow scale";
    case "zIndexScale":
      return "Z-index scale";
    case "customScale":
      return "Custom scale";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

function NodeInspector({
  node,
  collections,
  perCollectionFlat,
  defaultCollectionId,
  onChange,
  onDelete,
}: {
  node: TokenGeneratorDocumentNode;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  defaultCollectionId: string;
  onChange: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const selectedCollectionId =
    node.kind === "alias"
      ? defaultCollectionId
      : String(node.data.collectionId ?? defaultCollectionId);
  const tokenOptions = Object.keys(
    perCollectionFlat[selectedCollectionId] ?? {},
  ).sort();
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
                onChange({
                  collectionId: event.target.value,
                  path: "",
                })
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
          <NamedNumberStepList
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "multiplier")}
            valueKey="multiplier"
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "typeScale" && (
        <>
          {field("ratio", "Ratio", "number")}
          {field("unit", "Unit")}
          {field("baseStep", "Base step")}
          {field("roundTo", "Round to", "number")}
          <NamedNumberStepList
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "exponent")}
            valueKey="exponent"
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "borderRadiusScale" && (
        <>
          {field("unit", "Unit")}
          <NamedNumberStepList
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "multiplier")}
            valueKey="multiplier"
            optionalValueKey="exactValue"
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "opacityScale" && (
        <NamedNumberStepList
          label="Steps"
          values={asNamedNumberSteps(node.data.steps, "value")}
          valueKey="value"
          onChange={(steps) => onChange({ steps })}
        />
      )}
      {node.kind === "shadowScale" && (
        <>
          {field("color", "Color")}
          <ShadowStepList
            values={asRecordArray(node.data.steps)}
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "zIndexScale" && (
        <NamedNumberStepList
          label="Steps"
          values={asNamedNumberSteps(node.data.steps, "value")}
          valueKey="value"
          onChange={(steps) => onChange({ steps })}
        />
      )}
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
          <NamedNumberStepList
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "index")}
            valueKey="index"
            optionalValueKey="multiplier"
            onChange={(steps) => onChange({ steps })}
          />
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

function getNodeInputPorts(
  node: TokenGeneratorDocumentNode,
): TokenGeneratorPortDescriptor[] {
  return getTokenGeneratorInputPorts(node);
}

function getNodeOutputPorts(
  node: TokenGeneratorDocumentNode,
): TokenGeneratorPortDescriptor[] {
  return getTokenGeneratorOutputPorts(node);
}

function portHandleStyle(total: number, index: number): CSSProperties {
  const verticalPosition =
    total <= 1 ? "50%" : `${Math.round(((index + 1) / (total + 1)) * 100)}%`;
  return {
    top: verticalPosition,
  };
}

function portLabelStyle(total: number, index: number): CSSProperties {
  const verticalPosition =
    total <= 1 ? "50%" : `${Math.round(((index + 1) / (total + 1)) * 100)}%`;
  return {
    top: verticalPosition,
  };
}

function formatPortLabel(port: TokenGeneratorPortDescriptor): string {
  return `${port.label} · ${formatPortMeta(port)}`;
}

function formatPortMeta(port: TokenGeneratorPortDescriptor): string {
  const shape = port.shape === "list" ? "list" : "value";
  if (port.type === "any") return shape;
  return port.shape === "list" ? `${port.type} list` : port.type;
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
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-md bg-[var(--color-figma-bg-secondary)] p-6 text-center text-secondary text-[var(--color-figma-text-secondary)]">
        Preview shows the exact tokens and mode values this generator will apply.
      </div>
    );
  }
  const modes =
    targetCollection?.modes.map((mode) => mode.name) ?? preview.targetModes;
  const outputGroups = groupPreviewOutputs(preview.outputs);
  const focusedDiagnostic = preview.diagnostics.find(
    (diagnostic) => diagnostic.id === focusedDiagnosticId,
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-primary font-semibold text-[var(--color-figma-text)]">
            Output preview
          </h3>
          <p className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
            {preview.outputs.length} outputs across {modes.length}{" "}
            {modes.length === 1 ? "mode" : "modes"}
          </p>
        </div>
        <span className="text-tertiary text-[var(--color-figma-text-secondary)]">
          {new Date(preview.previewedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
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
      <div className="space-y-4">
        {preview.outputs.length === 0 ? (
          <div className="rounded-md bg-[var(--color-figma-bg-secondary)] p-2 text-secondary text-[var(--color-figma-error)]">
            No tokens will be created. Adjust the generator and wait for the
            preview to refresh.
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
            <div className="overflow-x-auto rounded-md bg-[var(--color-figma-bg-secondary)]">
              <table className="min-w-full border-separate border-spacing-0 text-left text-secondary">
                <thead>
                  <tr className="text-tertiary text-[var(--color-figma-text-secondary)]">
                    <th className="sticky left-0 z-[1] min-w-[200px] bg-[var(--color-figma-bg-secondary)] px-2 py-2 font-medium">
                      Token
                    </th>
                    {modes.map((modeName) => (
                      <th
                        key={modeName}
                        className="min-w-[150px] px-2 py-2 font-medium"
                      >
                        {modeName}
                      </th>
                    ))}
                    <th className="min-w-[90px] px-2 py-2 font-medium">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.outputs.map((output) => (
                    <tr
                      key={output.path}
                      className={
                        focusedDiagnostic?.nodeId === output.nodeId
                          ? "ring-1 ring-[var(--color-figma-accent)]"
                          : ""
                      }
                    >
                      <td className="sticky left-0 z-[1] max-w-[260px] bg-[var(--color-figma-bg-secondary)] px-2 py-2 align-top">
                        {output.change === "created" ? (
                          <span className="block truncate font-medium">
                            {output.path}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigateToToken(output.path)}
                            className="block max-w-full truncate text-left font-medium hover:underline"
                          >
                            {output.path}
                          </button>
                        )}
                        {output.collision ? (
                          <span className="mt-1 block text-tertiary text-[var(--color-figma-error)]">
                            Manual token exists
                          </span>
                        ) : null}
                      </td>
                      {modes.map((modeName) => (
                        <td
                          key={modeName}
                          className="px-2 py-2 align-top text-[var(--color-figma-text)]"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {previewIsValueBearing(output.type) ? (
                              <ValuePreview
                                type={output.type}
                                value={output.modeValues[modeName]}
                                size={14}
                              />
                            ) : null}
                            <span className="truncate">
                              {formatValue(output.modeValues[modeName])}
                            </span>
                          </span>
                        </td>
                      ))}
                      <td
                        className={`px-2 py-2 align-top text-tertiary ${
                          output.collision
                            ? "text-[var(--color-figma-error)]"
                            : "text-[var(--color-figma-text-secondary)]"
                        }`}
                      >
                        {output.collision ? "manual token" : output.change}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

function createFlowEdgeFromConnection(
  connection: {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): GraphFlowEdge | null {
  if (!connection.source || !connection.target) return null;
  const sourceHandle = connection.sourceHandle ?? "value";
  const targetHandle = connection.targetHandle ?? "value";
  return {
    id: `${connection.source}-${sourceHandle}-${connection.target}-${targetHandle}`,
    source: connection.source,
    sourceHandle,
    target: connection.target,
    targetHandle,
  };
}

function addSingleInputEdge(
  edges: GraphFlowEdge[],
  edge: GraphFlowEdge,
): GraphFlowEdge[] {
  const targetHandle = edge.targetHandle ?? "value";
  const edgesWithoutExistingInput = edges.filter(
    (existingEdge) =>
      existingEdge.target !== edge.target ||
      (existingEdge.targetHandle ?? "value") !== targetHandle,
  );
  return addEdge(edge, edgesWithoutExistingInput);
}

function deleteNodeAndPreserveFlow(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
  nodeId: string,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): { nodes: GraphFlowNode[]; edges: GraphFlowEdge[]; reconnectedEdgeCount: number } | null {
  const deletedNode = nodes.find((node) => node.id === nodeId);
  if (!deletedNode) return null;
  const nextNodes = nodes.filter((node) => node.id !== nodeId);
  const validationNodes = withTokenInputTypes(
    nextNodes,
    perCollectionFlat,
    generator.targetCollectionId,
  );
  const incomingEdges = edges.filter((edge) => edge.target === nodeId);
  const outgoingEdges = edges.filter((edge) => edge.source === nodeId);
  let nextEdges = edges.filter(
    (edge) => edge.source !== nodeId && edge.target !== nodeId,
  );
  let reconnectedEdgeCount = 0;
  for (const incomingEdge of incomingEdges) {
    for (const outgoingEdge of outgoingEdges) {
      const edge = firstCompatibleEdge(generator, validationNodes, nextEdges, {
        sourceNodeId: incomingEdge.source,
        sourcePort: String(incomingEdge.sourceHandle ?? "value"),
        targetNodeId: outgoingEdge.target,
        targetPort: String(outgoingEdge.targetHandle ?? "value"),
      });
      if (!edge) continue;
      nextEdges = addSingleInputEdge(nextEdges, edge);
      reconnectedEdgeCount += 1;
    }
  }
  return { nodes: nextNodes, edges: nextEdges, reconnectedEdgeCount };
}

function cleanGraphEdges(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
): GraphFlowEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node.data.graphNode]));
  let nextEdges: GraphFlowEdge[] = [];
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    if (
      !getNodeOutputPorts(sourceNode).some(
        (port) => port.id === (edge.sourceHandle ?? "value"),
      )
    ) {
      continue;
    }
    if (
      !getNodeInputPorts(targetNode).some(
        (port) => port.id === (edge.targetHandle ?? "value"),
      )
    ) {
      continue;
    }
    const candidateEdges = addSingleInputEdge(nextEdges, edge);
    const candidateGenerator = graphWithFlowState(
      generator,
      nodes,
      candidateEdges,
    );
    const check = checkTokenGeneratorConnection(candidateGenerator, {
      sourceNodeId: edge.source,
      sourcePort: String(edge.sourceHandle ?? "value"),
      targetNodeId: edge.target,
      targetPort: String(edge.targetHandle ?? "value"),
      edges: candidateGenerator.edges,
    });
    if (check.valid) {
      nextEdges = candidateEdges;
    }
  }
  return nextEdges;
}

function sameEdgeList(a: GraphFlowEdge[], b: GraphFlowEdge[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((edge, index) => {
    const other = b[index];
    return (
      other &&
      edge.id === other.id &&
      edge.source === other.source &&
      edge.target === other.target &&
      edge.sourceHandle === other.sourceHandle &&
      edge.targetHandle === other.targetHandle
    );
  });
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
    const hasNodes = generator.nodes.length > 0;
    const hasOutput = generator.nodes.some(
      (node) => node.kind === "output" || node.kind === "groupOutput",
    );
    return palette.filter((item) => {
      if (item.category === "Inputs" || item.category === "Scales") {
        return true;
      }
      return item.category === "Outputs" && (!hasNodes || !hasOutput);
    });
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
  preview: TokenGeneratorPreviewResult | null,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeById = new Map(generator.nodes.map((node) => [node.id, node]));
  const incomingEdgesByPort = new Map<string, TokenGeneratorEdge[]>();
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
        targetPort: "value",
        severity: "error",
        message: "Connect an input",
      });
    }
    if (node.kind !== "output" && node.kind !== "groupOutput") {
      const requiredValuePort = getNodeInputPorts(node).find(
        (port) => port.id === "value",
      );
      if (
        requiredValuePort &&
        !generator.edges.some(
          (edge) =>
            edge.to.nodeId === node.id && edge.to.port === requiredValuePort.id,
        )
      ) {
        issues.push({
          id: `${node.id}-missing-${requiredValuePort.id}`,
          nodeId: node.id,
          targetPort: requiredValuePort.id,
          severity: "error",
          message: `Connect ${requiredValuePort.label.toLowerCase()}`,
        });
      }
    }
  }
  for (const edge of generator.edges) {
    const sourceNode = nodeById.get(edge.from.nodeId);
    const targetNode = nodeById.get(edge.to.nodeId);
    if (!sourceNode || !targetNode) {
      issues.push({
        id: `${edge.id}-missing-node`,
        edgeId: edge.id,
        severity: "error",
        message: "Connection references a missing step",
      });
      continue;
    }
    const sourcePorts = getNodeOutputPorts(sourceNode);
    const targetPorts = getNodeInputPorts(targetNode);
    let missingPort = false;
    if (!sourcePorts.some((port) => port.id === edge.from.port)) {
      missingPort = true;
      issues.push({
        id: `${edge.id}-source-port`,
        nodeId: sourceNode.id,
        edgeId: edge.id,
        severity: "error",
        message: "Connection starts from an unavailable output",
      });
    }
    if (!targetPorts.some((port) => port.id === edge.to.port)) {
      missingPort = true;
      issues.push({
        id: `${edge.id}-target-port`,
        nodeId: targetNode.id,
        edgeId: edge.id,
        severity: "error",
        message: "Connection targets an unavailable input",
      });
    }
    if (missingPort) continue;
    const compatibility = checkTokenGeneratorConnection(generator, {
      sourceNodeId: edge.from.nodeId,
      sourcePort: edge.from.port,
      targetNodeId: edge.to.nodeId,
      targetPort: edge.to.port,
      edges: generator.edges,
    });
    if (!compatibility.valid) {
      issues.push({
        id: `${edge.id}-incompatible`,
        nodeId: targetNode.id,
        edgeId: edge.id,
        targetPort: edge.to.port,
        severity: "error",
        message: compatibility.reason ?? "Connection is not compatible.",
      });
    }
    const portKey = `${targetNode.id}:${edge.to.port}`;
    incomingEdgesByPort.set(portKey, [
      ...(incomingEdgesByPort.get(portKey) ?? []),
      edge,
    ]);
  }
  for (const incomingEdges of incomingEdgesByPort.values()) {
    if (incomingEdges.length <= 1) continue;
    const [{ to }] = incomingEdges;
    issues.push({
      id: `${to.nodeId}-${to.port}-multiple-inputs`,
      nodeId: to.nodeId,
      severity: "error",
      message: "Input has multiple connections. Reconnect it to choose one source.",
    });
  }
  for (const diagnostic of preview?.diagnostics ?? []) {
    issues.push({
      id: diagnostic.id,
      nodeId: diagnostic.nodeId,
      edgeId: diagnostic.edgeId,
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
