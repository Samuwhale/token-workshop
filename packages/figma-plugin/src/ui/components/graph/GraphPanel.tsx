import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
  CircleDot,
  Database,
  GitBranch,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  TokenCollection,
  TokenGraphDocument,
  TokenGraphEdge,
  TokenGraphDocumentNode,
  TokenGraphNodeKind,
  TokenGraphPreviewResult,
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
import type { TokenMapEntry } from "../../../shared/types";
import { apiFetch } from "../../shared/apiFetch";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";
import "@xyflow/react/dist/style.css";

interface GraphPanelProps {
  serverUrl: string;
  collections: TokenCollection[];
  workingCollectionId: string;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  tokenChangeKey?: number;
  initialGraphId?: string | null;
  onInitialGraphHandled?: () => void;
}

interface GraphListResponse {
  graphs: TokenGraphDocument[];
}

interface GraphResponse {
  graph: TokenGraphDocument;
}

interface GraphPreviewResponse {
  preview: TokenGraphPreviewResult;
}

interface GraphApplyResponse {
  preview: TokenGraphPreviewResult;
  operationId?: string;
  created: string[];
  updated: string[];
  deleted: string[];
}

type GraphFlowNode = Node<{ graphNode: TokenGraphDocumentNode; preview?: TokenGraphPreviewResult }, "graphNode">;
type GraphFlowEdge = Edge<Record<string, never>>;

const TEMPLATE_OPTIONS: Array<{
  id: "colorRamp" | "spacing" | "type" | "radius" | "opacity" | "shadow" | "zIndex" | "formula" | "blank";
  label: string;
}> = [
  { id: "colorRamp", label: "Color ramp" },
  { id: "spacing", label: "Spacing scale" },
  { id: "type", label: "Type scale" },
  { id: "radius", label: "Radius scale" },
  { id: "opacity", label: "Opacity scale" },
  { id: "shadow", label: "Shadow scale" },
  { id: "zIndex", label: "Z-index scale" },
  { id: "formula", label: "Formula" },
  { id: "blank", label: "Blank graph" },
];

const PALETTE: Array<{
  kind: TokenGraphNodeKind;
  category: string;
  label: string;
  defaults: Record<string, unknown>;
}> = [
  { category: "Inputs", kind: "tokenInput", label: "Token input", defaults: { path: "" } },
  { category: "Inputs", kind: "literal", label: "Color", defaults: { type: "color", value: "#6366f1" } },
  { category: "Inputs", kind: "literal", label: "Number", defaults: { type: "number", value: 1 } },
  { category: "Inputs", kind: "literal", label: "Dimension", defaults: { type: "dimension", value: 16, unit: "px" } },
  { category: "Inputs", kind: "literal", label: "String", defaults: { type: "string", value: "" } },
  { category: "Math", kind: "math", label: "Add", defaults: { operation: "add", amount: 1 } },
  { category: "Math", kind: "math", label: "Scale by", defaults: { operation: "scaleBy", amount: 1.25 } },
  { category: "Math", kind: "math", label: "Clamp", defaults: { operation: "clamp", min: 0, max: 1 } },
  { category: "Math", kind: "formula", label: "Formula", defaults: { expression: "var1 * 2" } },
  { category: "Color", kind: "color", label: "Lighten", defaults: { operation: "lighten", amount: 8 } },
  { category: "Color", kind: "color", label: "Darken", defaults: { operation: "darken", amount: 8 } },
  { category: "Color", kind: "color", label: "Alpha", defaults: { operation: "alpha", amount: 0.6 } },
  { category: "Color", kind: "color", label: "Mix", defaults: { operation: "mix", mixWith: "#ffffff", ratio: 0.5 } },
  { category: "Color", kind: "colorRamp", label: "Ramp", defaults: { ...DEFAULT_COLOR_RAMP_CONFIG } },
  { category: "Scales", kind: "spacingScale", label: "Spacing scale", defaults: { ...DEFAULT_SPACING_SCALE_CONFIG } },
  { category: "Scales", kind: "typeScale", label: "Type scale", defaults: { ...DEFAULT_TYPE_SCALE_CONFIG } },
  { category: "Scales", kind: "borderRadiusScale", label: "Radius scale", defaults: { ...DEFAULT_BORDER_RADIUS_SCALE_CONFIG } },
  { category: "Scales", kind: "opacityScale", label: "Opacity scale", defaults: { ...DEFAULT_OPACITY_SCALE_CONFIG } },
  { category: "Scales", kind: "shadowScale", label: "Shadow scale", defaults: { ...DEFAULT_SHADOW_SCALE_CONFIG } },
  { category: "Scales", kind: "zIndexScale", label: "Z-index scale", defaults: { ...DEFAULT_Z_INDEX_SCALE_CONFIG } },
  { category: "Scales", kind: "customScale", label: "Formula scale", defaults: { ...DEFAULT_CUSTOM_SCALE_CONFIG } },
  { category: "Lists", kind: "list", label: "Step list", defaults: { type: "number", items: [1, 2, 3, 4, 5] } },
  { category: "Authoring", kind: "alias", label: "Alias", defaults: { path: "" } },
  { category: "Authoring", kind: "output", label: "Token output", defaults: { path: "semantic.token" } },
  { category: "Authoring", kind: "groupOutput", label: "Group output", defaults: { pathPrefix: "generated.group" } },
  { category: "Preview", kind: "preview", label: "Value preview", defaults: {} },
];

const NODE_TYPES = {
  graphNode: GraphDocumentNode,
};

export function GraphPanel({
  serverUrl,
  collections,
  workingCollectionId,
  perCollectionFlat,
  onNavigateToToken,
  tokenChangeKey,
  initialGraphId,
  onInitialGraphHandled,
}: GraphPanelProps) {
  const [graphs, setGraphs] = useState<TokenGraphDocument[]>([]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [preview, setPreview] = useState<TokenGraphPreviewResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [externalPreviewInvalidated, setExternalPreviewInvalidated] = useState(false);
  const [lastApply, setLastApply] = useState<GraphApplyResponse | null>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<GraphFlowNode, GraphFlowEdge> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphFlowEdge>([]);

  const activeGraph = useMemo(
    () => graphs.find((graph) => graph.id === activeGraphId) ?? null,
    [graphs, activeGraphId],
  );
  const targetCollection = useMemo(
    () => collections.find((collection) => collection.id === activeGraph?.targetCollectionId),
    [activeGraph?.targetCollectionId, collections],
  );
  const selectedNode = useMemo(
    () => activeGraph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [activeGraph, selectedNodeId],
  );
  const previewHasCollisions = preview?.outputs.some((output) => output.collision) ?? false;

  const loadGraphs = useCallback(async () => {
    const data = await apiFetch<GraphListResponse>(`${serverUrl}/api/graphs`);
    setGraphs(data.graphs);
    setActiveGraphId((current) => current ?? data.graphs[0]?.id ?? null);
  }, [serverUrl]);

  useEffect(() => {
    loadGraphs().catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : String(loadError)),
    );
  }, [loadGraphs]);

  useEffect(() => {
    if (!initialGraphId) return;
    if (!graphs.some((graph) => graph.id === initialGraphId)) return;
    setActiveGraphId(initialGraphId);
    setPreview(null);
    setError(null);
    setLastApply(null);
    setDirty(false);
    setExternalPreviewInvalidated(false);
    onInitialGraphHandled?.();
  }, [graphs, initialGraphId, onInitialGraphHandled]);

  useEffect(() => {
    if (!preview) return;
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
    if (!activeGraph) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes(toFlowNodes(activeGraph, preview));
    setEdges(toFlowEdges(activeGraph.edges));
    setSelectedNodeId((current) =>
      current && activeGraph.nodes.some((node) => node.id === current)
        ? current
        : null,
    );
  }, [activeGraph?.id, preview, setEdges, setNodes]);

  const patchActiveGraph = useCallback(
    (patch: Partial<TokenGraphDocument>) => {
      if (!activeGraph) return;
      const baseGraph = graphWithFlowState(activeGraph, nodes, edges);
      setGraphs((current) =>
        current.map((graph) =>
          graph.id === activeGraph.id
            ? { ...baseGraph, ...patch, updatedAt: new Date().toISOString() }
            : graph,
        ),
      );
      setDirty(true);
      setPreview(null);
      setLastApply(null);
      setExternalPreviewInvalidated(false);
    },
    [activeGraph, edges, nodes],
  );

  const syncFlowToGraph = useCallback(() => {
    if (!activeGraph) return activeGraph;
    const nextGraph = graphWithFlowState(activeGraph, nodes, edges);
    setGraphs((current) =>
      current.map((graph) => (graph.id === activeGraph.id ? nextGraph : graph)),
    );
    return nextGraph;
  }, [activeGraph, edges, nodes, setGraphs]);

  const saveGraph = useCallback(async () => {
    const graph = syncFlowToGraph();
    if (!graph) return null;
    setBusy("save");
    setError(null);
    try {
      const data = await apiFetch<GraphResponse>(
        `${serverUrl}/api/graphs/${encodeURIComponent(graph.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: graph.name,
            targetCollectionId: graph.targetCollectionId,
            nodes: graph.nodes,
            edges: graph.edges,
            viewport: graph.viewport,
          }),
        },
      );
      setGraphs((current) =>
        current.map((candidate) => (candidate.id === data.graph.id ? data.graph : candidate)),
      );
      setDirty(false);
      setExternalPreviewInvalidated(false);
      return data.graph;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      return null;
    } finally {
      setBusy(null);
    }
  }, [serverUrl, syncFlowToGraph]);

  const previewGraph = useCallback(async () => {
    const saved = dirty ? await saveGraph() : activeGraph;
    if (!saved) return;
    setBusy("preview");
    setError(null);
    try {
      const data = await apiFetch<GraphPreviewResponse>(
        `${serverUrl}/api/graphs/${encodeURIComponent(saved.id)}/preview`,
        { method: "POST" },
      );
      setPreview(data.preview);
      setExternalPreviewInvalidated(false);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setBusy(null);
    }
  }, [activeGraph, dirty, saveGraph, serverUrl]);

  const applyGraph = useCallback(async () => {
    if (!preview || dirty || preview.blocking || preview.outputs.some((output) => output.collision)) {
      setError("Preview the latest graph changes before applying.");
      return;
    }
    const saved = activeGraph;
    if (!saved) return;
    setBusy("apply");
    setError(null);
    try {
      const data = await apiFetch<GraphApplyResponse>(
        `${serverUrl}/api/graphs/${encodeURIComponent(saved.id)}/apply`,
        { method: "POST" },
      );
      setPreview(data.preview);
      setLastApply(data);
      await loadGraphs();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setBusy(null);
    }
  }, [activeGraph, dirty, loadGraphs, preview, serverUrl]);

  const createGraph = useCallback(
    async (template: (typeof TEMPLATE_OPTIONS)[number]["id"]) => {
      const targetCollectionId = activeGraph?.targetCollectionId ?? workingCollectionId ?? collections[0]?.id;
      if (!targetCollectionId) return;
      setBusy("create");
      setError(null);
      try {
        const data = await apiFetch<GraphResponse>(`${serverUrl}/api/graphs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetCollectionId, template }),
        });
        setGraphs((current) => [...current, data.graph]);
        setActiveGraphId(data.graph.id);
        setPreview(null);
        setDirty(false);
        setExternalPreviewInvalidated(false);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : String(createError));
      } finally {
        setBusy(null);
      }
    },
    [activeGraph?.targetCollectionId, collections, serverUrl, workingCollectionId],
  );

  const deleteGraph = useCallback(async () => {
    if (!activeGraph) return;
    setBusy("delete");
    setError(null);
    try {
      await apiFetch(`${serverUrl}/api/graphs/${encodeURIComponent(activeGraph.id)}`, {
        method: "DELETE",
      });
      const nextGraphs = graphs.filter((graph) => graph.id !== activeGraph.id);
      setGraphs(nextGraphs);
      setActiveGraphId(nextGraphs[0]?.id ?? null);
      setPreview(null);
      setDirty(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setBusy(null);
    }
  }, [activeGraph, graphs, serverUrl]);

  const selectGraph = useCallback((graphId: string) => {
    setActiveGraphId(graphId);
    setPreview(null);
    setError(null);
    setLastApply(null);
    setExternalPreviewInvalidated(false);
    setDirty(false);
  }, []);

  const updateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      const { label, ...nodeData } = data;
      const updateGraphNode = (node: TokenGraphDocumentNode) =>
        node.id === nodeId
          ? {
              ...node,
              ...(typeof label === "string" ? { label } : {}),
              data: { ...node.data, ...nodeData },
            }
          : node;
      if (!activeGraph) return;
      const currentGraph = graphWithFlowState(activeGraph, nodes, edges);
      patchActiveGraph({
        nodes: currentGraph.nodes.map(updateGraphNode),
      });
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, graphNode: updateGraphNode(node.data.graphNode) },
              }
            : node,
        ),
      );
    },
    [activeGraph, edges, nodes, patchActiveGraph, setNodes],
  );

  const addPaletteNode = useCallback(
    (
      item: (typeof PALETTE)[number],
      position = { x: 220 + nodes.length * 28, y: 120 + nodes.length * 18 },
    ) => {
      if (!activeGraph) return;
      const id = `${item.kind}_${Math.random().toString(36).slice(2, 8)}`;
      const graphNode: TokenGraphDocumentNode = {
        id,
        kind: item.kind,
        label: item.label,
        position,
        data: { ...item.defaults },
      };
      const currentGraph = graphWithFlowState(activeGraph, nodes, edges);
      patchActiveGraph({
        nodes: [...currentGraph.nodes, graphNode],
      });
      setNodes((current) => [
        ...current,
        {
          id,
          type: "graphNode",
          position,
          data: { graphNode, preview: preview ?? undefined },
        },
      ]);
      setSelectedNodeId(id);
    },
    [activeGraph, edges, nodes, nodes.length, patchActiveGraph, preview, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const graphEdge: TokenGraphEdge = {
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
      if (activeGraph) {
        const currentGraph = graphWithFlowState(activeGraph, nodes, edges);
        patchActiveGraph({
          edges: [...currentGraph.edges.filter((edge) => edge.id !== graphEdge.id), graphEdge],
        });
      }
      setDirty(true);
      setPreview(null);
      setExternalPreviewInvalidated(false);
    },
    [activeGraph, edges, nodes, patchActiveGraph, setEdges],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!activeGraph || !selectedNode) return;
    const currentGraph = graphWithFlowState(activeGraph, nodes, edges);
    patchActiveGraph({
      nodes: currentGraph.nodes.filter((node) => node.id !== selectedNode.id),
      edges: currentGraph.edges.filter(
        (edge) => edge.from.nodeId !== selectedNode.id && edge.to.nodeId !== selectedNode.id,
      ),
    });
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id,
      ),
    );
  }, [activeGraph, edges, nodes, patchActiveGraph, selectedNode, setEdges, setNodes]);

  const filteredPalette = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return PALETTE.filter(
      (item) =>
        !query ||
        item.label.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query),
    );
  }, [paletteQuery]);

  return (
    <div className="flex h-full min-h-0 bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]">
      {leftPanelOpen && (
      <aside className="flex w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--color-figma-border)] px-3 py-3">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-primary font-semibold">Graphs</h2>
            <button
              type="button"
              title="Create blank graph"
              onClick={() => createGraph("blank")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="space-y-1">
            {graphs.map((graph) => (
              <button
                key={graph.id}
                type="button"
                onClick={() => {
                  selectGraph(graph.id);
                }}
                className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
                  graph.id === activeGraphId
                    ? "bg-[var(--color-figma-bg-selected)]"
                    : "hover:bg-[var(--color-figma-bg-hover)]"
                }`}
              >
                <GitBranch size={14} className="mt-0.5 shrink-0 text-[var(--color-figma-text-secondary)]" />
                <span className="min-w-0">
                  <span className="block truncate text-secondary font-medium">{graph.name}</span>
                  <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                    {graph.targetCollectionId}
                  </span>
                </span>
              </button>
            ))}
            {graphs.length === 0 && (
              <div className="rounded-md bg-[var(--color-figma-bg-secondary)] p-3 text-secondary text-[var(--color-figma-text-secondary)]">
                Create a graph from a template to generate managed tokens.
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-primary font-semibold">Templates</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {TEMPLATE_OPTIONS.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => createGraph(template.id)}
                className="rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary hover:bg-[var(--color-figma-bg-hover)]"
              >
                {template.label}
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-0">
          <div className="mb-2 flex items-center gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
            <Search size={14} className="text-[var(--color-figma-text-secondary)]" />
            <input
              value={paletteQuery}
              onChange={(event) => setPaletteQuery(event.target.value)}
              placeholder="Search nodes"
              className="min-w-0 flex-1 bg-transparent text-secondary outline-none"
            />
          </div>
          <div className="space-y-3">
            {Object.entries(groupBy(filteredPalette, (item) => item.category)).map(
              ([category, items]) => (
                <div key={category}>
                  <div className="mb-1 px-1 text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <button
                        key={`${item.kind}-${item.label}`}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/tokenmanager-node", item.label);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => addPaletteNode(item)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        <CircleDot size={12} className="text-[var(--color-figma-text-secondary)]" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] px-3">
          {activeGraph ? (
            <>
              <button
                type="button"
                title={leftPanelOpen ? "Hide graph list and nodes" : "Show graph list and nodes"}
                onClick={() => setLeftPanelOpen((open) => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
              >
                <PanelLeft size={14} />
              </button>
              <input
                value={activeGraph.name}
                onChange={(event) => patchActiveGraph({ name: event.target.value })}
                className="min-w-[160px] max-w-[300px] rounded-md bg-transparent px-2 py-1 text-primary font-semibold outline-none hover:bg-[var(--color-figma-bg-hover)] focus:bg-[var(--color-figma-bg-secondary)]"
              />
              <select
                value={activeGraph.targetCollectionId}
                onChange={(event) => patchActiveGraph({ targetCollectionId: event.target.value })}
                className="rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-secondary"
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.id}
                  </option>
                ))}
              </select>
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                {dirty
                  ? "Unsaved changes"
                  : externalPreviewInvalidated
                    ? "Recheck preview"
                    : preview?.blocking || previewHasCollisions
                      ? "Preview has issues"
                      : preview
                        ? "Preview ready"
                        : "Saved"}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  title={inspectorOpen ? "Hide inspector" : "Show inspector"}
                  onClick={() => setInspectorOpen((open) => !open)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <PanelRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={saveGraph}
                  disabled={!dirty || busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-secondary font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  type="button"
                  onClick={previewGraph}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-secondary font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  <Play size={14} />
                  {dirty ? "Save & preview" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={applyGraph}
                  disabled={busy !== null || dirty || !preview || Boolean(preview.blocking) || previewHasCollisions}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-secondary font-semibold text-white disabled:opacity-40"
                >
                  <Sparkles size={14} />
                  Apply
                </button>
                <button
                  type="button"
                  title="Delete graph"
                  onClick={deleteGraph}
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
                title={leftPanelOpen ? "Hide graph list and nodes" : "Show graph list and nodes"}
                onClick={() => setLeftPanelOpen((open) => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-figma-bg-hover)]"
              >
                <PanelLeft size={14} />
              </button>
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                Create a graph to start authoring generated tokens.
              </span>
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
            Applied {lastApply.created.length} created, {lastApply.updated.length} updated, {lastApply.deleted.length} deleted.
          </div>
        )}

        <div className="min-h-0 flex-1">
          {activeGraph ? (
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
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const label = event.dataTransfer.getData("application/tokenmanager-node");
                const item = PALETTE.find((candidate) => candidate.label === label);
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
              <Background gap={16} size={1} color="var(--color-figma-border)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : (
            <div className="flex h-full items-center justify-center">
              <button
                type="button"
                onClick={() => createGraph("blank")}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--color-figma-accent)] px-3 py-2 text-secondary font-semibold text-white"
              >
                <Plus size={15} />
                Create blank graph
              </button>
            </div>
          )}
        </div>
      </main>

      {inspectorOpen && (
      <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-figma-border)]">
        <section className="p-3">
          <h2 className="mb-2 text-primary font-semibold">Inspector</h2>
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              collections={collections}
              perCollectionFlat={perCollectionFlat}
              defaultCollectionId={activeGraph?.targetCollectionId ?? workingCollectionId}
              onChange={(data) => updateNodeData(selectedNode.id, data)}
              onDelete={deleteSelectedNode}
            />
          ) : (
            <div className="text-secondary text-[var(--color-figma-text-secondary)]">
              Select a node to edit inputs and inspect its output.
            </div>
          )}
        </section>

        <section className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-primary font-semibold">Output Review</h2>
            {targetCollection && (
              <span className="text-tertiary text-[var(--color-figma-text-secondary)]">
                {targetCollection.modes.length} modes
              </span>
            )}
          </div>
          <PreviewPanel
            preview={preview}
            targetCollection={targetCollection}
            onNavigateToToken={(path) =>
              activeGraph && onNavigateToToken(path, activeGraph.targetCollectionId)
            }
          />
        </section>
      </aside>
      )}
    </div>
  );
}

function GraphDocumentNode({
  data,
  selected,
}: NodeProps<GraphFlowNode>) {
  const graphNode = data.graphNode;
  const relatedOutputs = data.preview?.outputs.filter((output) => output.nodeId === graphNode.id) ?? [];
  const diagnostics = data.preview?.diagnostics.filter((diagnostic) => diagnostic.nodeId === graphNode.id) ?? [];
  const inputPorts = getNodeInputPorts(graphNode);
  const outputPorts = getNodeOutputPorts(graphNode);

  return (
    <div
      className={`min-w-[180px] rounded-lg border bg-[var(--color-figma-bg)] px-3 py-2 shadow-sm ${
        selected ? "border-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)]"
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
        <div className="truncate text-secondary font-semibold">{graphNode.label}</div>
        {diagnostics.length > 0 && <AlertTriangle size={14} className="text-[var(--color-figma-warning)]" />}
      </div>
      <div className="mt-1 text-tertiary text-[var(--color-figma-text-secondary)]">
        {nodeSummary(graphNode)}
      </div>
      {relatedOutputs.length > 0 && (
        <div className="mt-2 space-y-1 text-tertiary">
          {relatedOutputs.slice(0, 3).map((output) => (
            <div key={output.path} className="truncate text-[var(--color-figma-text-secondary)]">
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
  node: TokenGraphDocumentNode;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  defaultCollectionId: string;
  onChange: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const selectedCollectionId = String(node.data.collectionId ?? defaultCollectionId);
  const tokenOptions = Object.keys(perCollectionFlat[selectedCollectionId] ?? {}).sort();
  const jsonField = (key: string, label: string) => (
    <JsonDataField
      nodeId={node.id}
      dataKey={key}
      label={label}
      value={node.data[key]}
      onChange={(value) => onChange({ [key]: value })}
    />
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
          onChange({ [key]: type === "number" ? Number(event.target.value) : event.target.value })
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
      {(node.kind === "tokenInput" || node.kind === "alias") && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
              Collection
            </span>
            <select
              value={selectedCollectionId}
              onChange={(event) => onChange({ collectionId: event.target.value, path: "" })}
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
          {field("value", "Value", node.data.type === "number" || node.data.type === "dimension" ? "number" : "text")}
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
              value={Array.isArray(node.data.steps) ? node.data.steps.join(", ") : ""}
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
        field(node.kind === "output" ? "path" : "pathPrefix", node.kind === "output" ? "Token path" : "Group path")}
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
}: {
  nodeId: string;
  dataKey: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => formatJsonDraft(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatJsonDraft(value));
    setError(null);
  }, [dataKey, nodeId, value]);

  return (
    <label className="block">
      <span className="mb-1 block text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          try {
            onChange(JSON.parse(draft));
            setError(null);
          } catch {
            setError("Enter valid JSON.");
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

function getNodeInputPorts(node: TokenGraphDocumentNode): string[] {
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

function getNodeOutputPorts(node: TokenGraphDocumentNode): string[] {
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
  onNavigateToToken,
}: {
  preview: TokenGraphPreviewResult | null;
  targetCollection: TokenCollection | undefined;
  onNavigateToToken: (path: string) => void;
}) {
  if (!preview) {
    return (
      <div className="rounded-md bg-[var(--color-figma-bg-secondary)] p-3 text-secondary text-[var(--color-figma-text-secondary)]">
        Preview the graph to review created, updated, deleted, and unchanged tokens before applying.
      </div>
    );
  }
  const modes = targetCollection?.modes.map((mode) => mode.name) ?? preview.targetModes;
  return (
    <div className="space-y-3">
      {preview.diagnostics.length > 0 && (
        <div className="space-y-1">
          {preview.diagnostics.map((diagnostic) => (
            <div
              key={diagnostic.id}
              className="rounded-md bg-[var(--color-figma-bg-secondary)] p-2 text-secondary"
            >
              <span className="font-medium capitalize">{diagnostic.severity}</span>
              <span className="text-[var(--color-figma-text-secondary)]"> - {diagnostic.message}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {preview.outputs.map((output) => (
          <div key={output.path} className="rounded-md bg-[var(--color-figma-bg-secondary)] p-2">
            <div className="mb-2 flex items-center gap-2">
              <Database size={14} className="text-[var(--color-figma-text-secondary)]" />
              <button
                type="button"
                onClick={() => onNavigateToToken(output.path)}
                className="min-w-0 flex-1 truncate text-left text-secondary font-semibold hover:underline"
              >
                {output.path}
              </button>
              <span className="text-tertiary text-[var(--color-figma-text-secondary)]">
                {output.change}
              </span>
            </div>
            {output.collision && (
              <div className="mb-2 text-tertiary text-[var(--color-figma-error)]">
                Manual token collision. Detach or rename before applying.
              </div>
            )}
            <div className="space-y-1">
              {modes.map((modeName) => (
                <div key={modeName} className="grid grid-cols-[82px_1fr] gap-2 text-tertiary">
                  <span className="truncate text-[var(--color-figma-text-secondary)]">{modeName}</span>
                  <span className="min-w-0 flex items-center gap-1.5">
                    {previewIsValueBearing(output.type) && (
                      <ValuePreview
                        type={output.type}
                        value={output.modeValues[modeName]}
                        size={14}
                      />
                    )}
                    <span className="truncate">{formatValue(output.modeValues[modeName])}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
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

function toFlowNodes(
  graph: TokenGraphDocument,
  preview: TokenGraphPreviewResult | null,
): GraphFlowNode[] {
  return graph.nodes.map((graphNode) => ({
    id: graphNode.id,
    type: "graphNode",
    position: graphNode.position,
    data: { graphNode, preview: preview ?? undefined },
  }));
}

function graphWithFlowState(
  graph: TokenGraphDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
): TokenGraphDocument {
  return {
    ...graph,
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

function toFlowEdges(edges: TokenGraphEdge[]): GraphFlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    sourceHandle: edge.from.port,
    targetHandle: edge.to.port,
    animated: false,
  }));
}

function hasStructuralNodeChange(changes: NodeChange<GraphFlowNode>[]): boolean {
  return changes.some((change) =>
    change.type === "add" ||
    change.type === "remove" ||
    (change.type === "position" && Boolean(change.dragging === false)),
  );
}

function hasStructuralEdgeChange(changes: EdgeChange<GraphFlowEdge>[]): boolean {
  return changes.some((change) => change.type === "add" || change.type === "remove");
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = keyFn(item);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});
}

function nodeSummary(node: TokenGraphDocumentNode): string {
  if (node.kind === "tokenInput") return String(node.data.path || "Choose token");
  if (node.kind === "literal") return formatValue(node.data.value);
  if (node.kind === "math") return `${node.data.operation ?? "add"} ${node.data.amount ?? ""}`.trim();
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
  if (node.kind === "groupOutput") return String(node.data.pathPrefix || "Output group");
  return node.kind;
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (
    typeof value === "object" &&
    "value" in value &&
    "unit" in value
  ) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}
