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
  PanelLeft,
  PanelRight,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Workflow,
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
type GeneratorEditorMode = "setup" | "graph";

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
  const localGraphEditRef = useRef(false);
  const dirtyRef = useRef(false);
  const dirtyGeneratorIdRef = useRef<string | null>(null);
  const graphRevisionRef = useRef(0);
  const autoPreviewRunRef = useRef(0);
  const latestPreviewSignatureRef = useRef("");

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
        ? collectGraphIssues(activeGenerator, preview)
        : [],
    [activeGenerator, preview],
  );
  const previewHasCollisions =
    preview?.outputs.some((output) => output.collision) ?? false;
  const previewHasNoOutputs = preview ? preview.outputs.length === 0 : false;
  const graphHasErrors = graphIssues.some(
    (issue) => issue.severity === "error",
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
    if (initialView === "graph" || focus?.nodeId) {
      setEditorMode("graph");
    }
    if (focus?.nodeId) {
      setSelectedNodeId(focus.nodeId);
      setInspectorOpen(true);
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

  useEffect(() => {
    if (selectedNodeId) {
      setInspectorOpen(true);
    }
  }, [selectedNodeId]);

  useLayoutEffect(() => {
    if (!activeGenerator) {
      setNodes([]);
      setEdges([]);
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
                updatedAt: new Date().toISOString(),
              }
            : generator,
        ),
      );
      setDirty(true);
      dirtyRef.current = true;
      dirtyGeneratorIdRef.current = activeGenerator.id;
      graphRevisionRef.current += 1;
      setLastApply(null);
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
  }, [serverUrl, syncFlowToGenerator]);

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
      const flowNode: GraphFlowNode = {
        id,
        type: "graphNode",
        position: resolvedPosition,
        data: { graphNode, preview: preview ?? undefined },
      };
      const nextNodes = [...nodes, flowNode];
      setNodes(nextNodes);
      commitFlowState(nextNodes, edges);
      setSelectedNodeId(id);
      setInspectorOpen(true);
      setNodeLibraryOpen(false);
    },
    [activeGenerator, commitFlowState, edges, nodes, preview, setNodes],
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
      const nextEdges = addEdge(
        {
          ...connection,
          id: graphEdge.id,
        },
        edges,
      );
      setEdges(nextEdges);
      commitFlowState(nodes, nextEdges);
    },
    [commitFlowState, edges, nodes, setEdges],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!activeGenerator || !selectedNode) return;
    const nextNodes = nodes.filter((node) => node.id !== selectedNode.id);
    const nextEdges = edges.filter(
      (edge) =>
        edge.source !== selectedNode.id && edge.target !== selectedNode.id,
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    commitFlowState(nextNodes, nextEdges);
    setSelectedNodeId(null);
  }, [
    activeGenerator,
    commitFlowState,
    edges,
    nodes,
    selectedNode,
    setEdges,
    setNodes,
  ]);

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
    const outputKind =
      sourcePorts.includes("steps") ||
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
    const sourcePort = sourcePorts.includes("steps") ? "steps" : "value";
    const nextEdges =
      sourceNode && sourcePorts.length > 0
        ? addEdge(
            {
              id: `${sourceNode.id}-${sourcePort}-${id}-value`,
              source: sourceNode.id,
              sourceHandle: sourcePort,
              target: id,
              targetHandle: "value",
            },
            edges,
          )
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
      if (issue.nodeId) {
        setSelectedNodeId(issue.nodeId);
        setInspectorOpen(true);
      }
    },
    [addOutputStep],
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

  const renderGraphWorkspace = () => {
    if (!activeGenerator) return null;
    return (
      <div className="flex h-full min-h-0 overflow-x-auto max-[760px]:flex-col max-[760px]:overflow-x-hidden max-[760px]:overflow-y-auto">
        <section className="relative min-w-[420px] flex-1 max-[760px]:min-h-[360px] max-[760px]:w-full max-[760px]:min-w-0">
          {graphIssues.length > 0 ? (
            <div className="absolute left-3 top-3 z-10 flex max-w-[520px] flex-wrap gap-1.5">
              {graphIssues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => focusGraphIssue(issue)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-tertiary font-medium shadow-sm transition-colors ${
                    issue.severity === "error"
                      ? "bg-[color-mix(in_srgb,var(--color-figma-error)_12%,var(--color-figma-bg))] text-[var(--color-figma-error)] hover:bg-[color-mix(in_srgb,var(--color-figma-error)_18%,var(--color-figma-bg))]"
                      : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  }`}
                >
                  {issue.message}
                  {issue.id === "missing-output" ? (
                    <Plus size={12} aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <ReactFlow
            key={activeGenerator.id}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={(changes) => {
              if (hasStructuralNodeChange(changes)) {
                const nextNodes = applyNodeChanges(changes, nodesRef.current);
                setNodes(nextNodes);
                commitFlowState(nextNodes, edgesRef.current);
                return;
              }
              setNodes((current) => applyNodeChanges(changes, current));
            }}
            onEdgesChange={(changes) => {
              if (hasStructuralEdgeChange(changes)) {
                const nextEdges = applyEdgeChanges(changes, edgesRef.current);
                setEdges(nextEdges);
                commitFlowState(nodesRef.current, nextEdges);
                return;
              }
              setEdges((current) => applyEdgeChanges(changes, current));
            }}
            onConnect={onConnect}
            onInit={setFlowInstance}
            onMoveEnd={(_event, viewport) => commitViewport(viewport)}
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
            defaultViewport={activeGenerator.viewport}
            className="tm-graph"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="var(--color-figma-border)" />
            <Controls
              className="tm-graph-controls"
              showInteractive={false}
            />
          </ReactFlow>
        </section>
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
          <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-figma-border)] max-[760px]:max-h-[300px] max-[760px]:w-full max-[760px]:border-l-0 max-[760px]:border-t">
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
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]">
      {leftPanelOpen ? (
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
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] px-3">
              <button
                type="button"
                title={leftPanelOpen ? "Hide generator list" : "Show generator list"}
                aria-label={leftPanelOpen ? "Hide generator list" : "Show generator list"}
                onClick={() => setLeftPanelOpen((open) => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
              >
                <PanelLeft size={14} />
              </button>

              {activeGenerator ? (
                <>
                  <input
                    value={activeGenerator.name}
                    onChange={(event) =>
                      patchActiveGraph({ name: event.target.value })
                    }
                    className="min-w-[150px] max-w-[300px] rounded-md bg-transparent px-2 py-1 text-primary font-semibold outline-none hover:bg-[var(--color-figma-bg-hover)] focus:bg-[var(--color-figma-bg-secondary)] max-[760px]:min-w-0 max-[760px]:max-w-[140px]"
                  />
                  <span
                    className="max-w-[220px] truncate rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] max-[760px]:hidden"
                    title={activeGenerator.targetCollectionId}
                  >
                    {targetCollection?.publishRouting?.collectionName?.trim() ||
                      activeGenerator.targetCollectionId}
                  </span>
                  <div className="flex rounded-md bg-[var(--color-figma-bg-secondary)] p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditorMode("setup");
                        setNodeLibraryOpen(false);
                        setInspectorOpen(false);
                      }}
                      aria-pressed={editorMode === "setup"}
                      className={`min-h-7 rounded px-2 text-secondary font-medium ${
                        editorMode === "setup"
                          ? "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
                          : "text-[var(--color-figma-text-secondary)]"
                      }`}
                    >
                      Outputs
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode("graph")}
                      aria-pressed={editorMode === "graph"}
                      className={`min-h-7 rounded px-2 text-secondary font-medium ${
                        editorMode === "graph"
                          ? "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
                          : "text-[var(--color-figma-text-secondary)]"
                      }`}
                    >
                      Graph
                    </button>
                  </div>
                  {busy ? (
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
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    {editorMode === "graph" ? (
                      <>
                        <button
                          type="button"
                          title={nodeLibraryOpen ? "Hide step library" : "Add step"}
                          aria-label={nodeLibraryOpen ? "Hide step library" : "Add step"}
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
                            title={inspectorOpen ? "Hide settings" : "Show settings"}
                            aria-label={inspectorOpen ? "Hide settings" : "Show settings"}
                            onClick={() => {
                              setInspectorOpen((open) => !open);
                              setNodeLibraryOpen(false);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            <PanelRight size={14} />
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    <button
                      type="button"
                      title="Save generator"
                      aria-label="Save generator"
                      onClick={saveGenerator}
                      disabled={!dirty || busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-secondary font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      <Save size={14} />
                      <span className="max-[760px]:sr-only">Save</span>
                    </button>
                    <button
                      type="button"
                      title="Apply generator"
                      aria-label="Apply generator"
                      aria-describedby="generator-status-label"
                      onClick={applyGenerator}
                      disabled={
                        busy !== null ||
                        dirty ||
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
                      aria-label="Delete generator"
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
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                    Create a generator for this collection.
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

            {error ? (
              <div className="flex items-center gap-2 bg-[var(--color-figma-error)]/10 px-3 py-2 text-secondary text-[var(--color-figma-error)]">
                <AlertTriangle size={14} />
                {error}
              </div>
            ) : null}
            {lastApply ? (
              <div className="flex items-center gap-2 bg-[var(--color-figma-success)]/10 px-3 py-2 text-secondary text-[var(--color-figma-success)]">
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
                  <div className="flex h-full min-h-0 overflow-hidden max-[900px]:flex-col max-[900px]:overflow-y-auto">
                    <aside className="w-[360px] shrink-0 overflow-y-auto border-r border-[var(--color-figma-border)] p-3 max-[900px]:max-h-none max-[900px]:w-full max-[900px]:border-b max-[900px]:border-r-0">
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
                        onEditGraph={() => setEditorMode("graph")}
                        onFocusGraphIssue={focusGraphIssue}
                      />
                    </aside>
                    <section className="min-w-0 flex-1 overflow-auto p-3">
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
                    </section>
                  </div>
                )
              ) : (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-[320px] text-center">
                    <h2 className="text-primary font-semibold">
                      No generators in this collection
                    </h2>
                    <p className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">
                      Create a saved generator, inspect its mode values, then
                      apply the outputs to the collection.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCreatePanelOpen(true)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-figma-accent)] px-3 py-2 text-secondary font-semibold text-white"
                    >
                      <Plus size={14} />
                      Create generator
                    </button>
                  </div>
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
  perCollectionFlat,
  preview,
  dirty,
  externalPreviewInvalidated,
  structuredDraft,
  graphIssues,
  onChangeStructuredDraft,
  onEditGraph,
  onFocusGraphIssue,
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
              perCollectionFlat={perCollectionFlat}
              onChange={onChangeStructuredDraft}
            />
          ) : (
            <div className="rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
              This generator uses a custom graph. Inspect the outputs here, or
              open the graph to change the steps.
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
                className={`rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary ${
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
                  className="rounded-md bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text)]"
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
                aria-pressed={draft.sourceMode === mode}
                className={`min-h-7 flex-1 rounded px-2 text-secondary font-medium ${
                  draft.sourceMode === mode
                    ? "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
                    : "text-[var(--color-figma-text-secondary)]"
                }`}
              >
                {mode === "literal" ? "Value" : "Token"}
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
        <div className="flex items-center gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
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
          className="flex w-full items-center gap-2 rounded-md bg-[var(--color-figma-bg-selected)] px-2 py-1.5 text-left text-secondary"
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
      <div className="max-h-[180px] overflow-y-auto rounded-md bg-[var(--color-figma-bg-secondary)] p-1">
        {filteredEntries.slice(0, 40).map(([path, token]) => (
          <button
            key={path}
            type="button"
            onClick={() => {
              onChange(path);
              setQuery("");
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
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
            className="rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-2"
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
    <div className="flex min-h-8 items-center gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1">
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
      className={`tm-graph-node min-w-[180px] rounded-lg border bg-[var(--color-figma-bg)] px-3 py-2 shadow-sm ${
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
