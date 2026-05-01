import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
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
  ChevronDown,
  ChevronRight,
  Check,
  List,
  MoreHorizontal,
  PanelRight,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  TokenCollection,
  TokenGeneratorDocument,
  TokenGeneratorEdge,
  TokenGeneratorDocumentNode,
  TokenGeneratorNodePreviewValue,
  TokenGeneratorPortDescriptor,
  TokenGeneratorPreviewOutput,
  TokenGeneratorPreviewResult,
} from "@tokenmanager/core";
import {
  checkTokenGeneratorConnection,
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
  getTokenGeneratorInputPorts,
  getTokenGeneratorOutputPorts,
  readStructuredGeneratorDraft,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import type { EditorSessionRegistration } from "../../contexts/WorkspaceControllerContext";
import { useElementWidth } from "../../hooks/useElementWidth";
import { apiFetch } from "../../shared/apiFetch";
import { ActionRow, Button, IconButton, SegmentedControl } from "../../primitives";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";
import { FeedbackPlaceholder } from "../FeedbackPlaceholder";
import { GeneratorCreatePanel } from "../GeneratorCreatePanel";
import {
  NodeLibraryPanel,
  type GeneratorPaletteItem,
} from "./GeneratorWorkspacePanels";
import type { GeneratorEditorMode } from "./generatorEditorTypes";
import {
  FieldBlock,
  GeneratorBooleanField,
  GeneratorColorField,
  GeneratorDimensionField,
  GeneratorFormulaField,
  GeneratorListValueEditor,
  GeneratorNumberField,
  GeneratorPathField,
  GeneratorTextField,
  GeneratorTokenPicker,
  GeneratorUnitField,
  NamedNumberStepTable,
  NumberStepTable,
  ReferenceableField,
  ShadowStepTable,
  type GeneratorTokenRefs,
} from "./GeneratorFieldControls";
import { collectGraphIssues, type GraphIssue } from "./generatorGraphValidation";
import "@xyflow/react/dist/style.css";

interface GeneratorsPanelProps {
  serverUrl: string;
  collections: TokenCollection[];
  workingCollectionId: string;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onWorkingCollectionChange?: (collectionId: string) => void;
  tokenChangeKey?: number;
  initialGeneratorId?: string | null;
  initialView?: GeneratorEditorMode | null;
  initialFocus?: GeneratorPanelFocus | null;
  initialCreateOutputPrefix?: string | null;
  onInitialGeneratorHandled?: () => void;
  onInitialCreateHandled?: () => void;
  editorSessionHost?: {
    registerSession: (session: EditorSessionRegistration | null) => void;
  };
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

interface GeneratorStatusItem {
  generator: TokenGeneratorDocument;
  preview: TokenGeneratorPreviewResult;
  stale: boolean;
  unapplied: boolean;
  blocking: boolean;
  managedTokenCount: number;
}

interface GeneratorStatusResponse {
  generators: GeneratorStatusItem[];
}

interface GeneratorApplyResponse {
  preview: TokenGeneratorPreviewResult;
  operationId?: string;
  created: string[];
  updated: string[];
  deleted: string[];
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

type GraphStructureCommitUiState = {
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  graphPanelState?: GraphPanelState;
  graphMenu?: GraphMenuState | null;
  editorMode?: GeneratorEditorMode;
};
type GraphPanelState = "none" | "inspector" | "nodeLibrary";
type GeneratorListScope = "collection" | "all";

type GraphFlowNode = Node<
  {
    graphNode: TokenGeneratorDocumentNode;
    preview?: TokenGeneratorPreviewResult;
    issues?: GraphIssue[];
    detailsExpanded?: boolean;
    onToggleDetailsExpanded?: (nodeId: string) => void;
  },
  "graphNode"
>;
type GraphFlowEdge = Edge<Record<string, never>>;
const COMPACT_GENERATORS_WIDTH = 560;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const GENERATOR_EDITOR_TABS: Array<{ value: GeneratorEditorMode; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "graph", label: "Graph" },
];

const GENERATOR_LIST_SCOPE_OPTIONS: Array<{
  value: GeneratorListScope;
  label: string;
}> = [
  { value: "collection", label: "This collection" },
  { value: "all", label: "All" },
];

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0 && !element.hidden);
}

function readCollectionLabel(collection: TokenCollection | undefined): string {
  if (!collection) return "Unknown collection";
  return collection.publishRouting?.collectionName?.trim() || collection.id;
}

type PreviewChangeCounts = {
  collisions: number;
  created: number;
  updated: number;
  unchanged: number;
};

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
    description: "Creates one token.",
    defaults: { path: "semantic.token" },
  },
  {
    category: "Outputs",
    kind: "groupOutput",
    label: "Series output",
    description: "Creates one token per step.",
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
  onWorkingCollectionChange,
  tokenChangeKey,
  initialGeneratorId,
  initialView,
  initialFocus,
  initialCreateOutputPrefix,
  onInitialGeneratorHandled,
  onInitialCreateHandled,
  editorSessionHost,
}: GeneratorsPanelProps) {
  const [generators, setGenerators] = useState<TokenGeneratorDocument[]>([]);
  const [activeGeneratorId, setActiveGeneratorId] = useState<string | null>(
    null,
  );
  const [preview, setPreview] = useState<TokenGeneratorPreviewResult | null>(
    null,
  );
  const [generatorStatusesById, setGeneratorStatusesById] = useState<
    Record<string, GeneratorStatusItem>
  >({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [expandedGraphNodeIds, setExpandedGraphNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const [graphPanelState, setGraphPanelState] =
    useState<GraphPanelState>("none");
  const [inspectorMinimized, setInspectorMinimized] = useState(false);
  const [allNodesOpen, setAllNodesOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [createOutputPrefix, setCreateOutputPrefix] = useState<string | null>(null);
  const [generatorListOpen, setGeneratorListOpen] = useState(false);
  const [generatorListQuery, setGeneratorListQuery] = useState("");
  const [generatorListScope, setGeneratorListScope] =
    useState<GeneratorListScope>("collection");
  const [outputDockOpen, setOutputDockOpen] = useState(false);
  const [reviewedPreviewHash, setReviewedPreviewHash] = useState<string | null>(
    null,
  );
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteAction | null>(
    null,
  );
  const [editorMode, setEditorMode] = useState<GeneratorEditorMode>("overview");
  const [activeInitialFocus, setActiveInitialFocus] =
    useState<GeneratorPanelFocus | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    GraphFlowNode,
    GraphFlowEdge
  > | null>(null);

  useEffect(() => {
    if (initialCreateOutputPrefix === undefined) return;
    setCreateOutputPrefix(initialCreateOutputPrefix?.trim() || null);
    setCreatePanelOpen(true);
    onInitialCreateHandled?.();
  }, [initialCreateOutputPrefix, onInitialCreateHandled]);
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
  const suppressedViewportCommitCountRef = useRef(0);
  const lastGraphAutoFitKeyRef = useRef<string | null>(null);
  const autoPreviewRunRef = useRef(0);
  const latestPreviewSignatureRef = useRef("");
  const tokenChangeInitializedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const generatorListSearchRef = useRef<HTMLInputElement | null>(null);
  const createSheetPanelRef = useRef<HTMLElement | null>(null);
  const createSheetPreviousFocusRef = useRef<HTMLElement | null>(null);
  const panelWidth = useElementWidth(panelRef);
  const compactGenerators =
    panelWidth !== null && panelWidth < COMPACT_GENERATORS_WIDTH;

  const markGeneratorDirty = useCallback((generatorId: string) => {
    setDirty(true);
    dirtyRef.current = true;
    dirtyGeneratorIdRef.current = generatorId;
  }, []);

  const clearGeneratorDirty = useCallback(() => {
    setDirty(false);
    dirtyRef.current = false;
    dirtyGeneratorIdRef.current = null;
  }, []);

  const closeCreatePanel = useCallback(() => {
    setCreateOutputPrefix(null);
    setCreatePanelOpen(false);
  }, []);

  const openOutputReview = useCallback(() => {
    setOutputDockOpen(true);
  }, []);

  const markCurrentPreviewReviewed = useCallback(() => {
    if (previewRef.current) {
      setReviewedPreviewHash(previewRef.current.hash);
    }
  }, []);

  useEffect(() => {
    if (!generatorListOpen) return;
    generatorListSearchRef.current?.focus();
  }, [generatorListOpen]);

  useEffect(() => {
    if (!createPanelOpen) return;
    createSheetPreviousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const animationFrame = window.requestAnimationFrame(() => {
      const firstFocusable = createSheetPanelRef.current
        ? getFocusableElements(createSheetPanelRef.current)[0]
        : null;
      firstFocusable?.focus();
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
      createSheetPreviousFocusRef.current?.focus();
      createSheetPreviousFocusRef.current = null;
    };
  }, [createPanelOpen]);

  const setActiveGeneratorSelection = useCallback(
    (generatorId: string | null) => {
      if (activeGeneratorIdRef.current !== generatorId) {
        setExpandedGraphNodeIds(new Set());
      }
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
  const collectionLabelById = useMemo(
    () =>
      new Map(
        collections.map((collection) => [
          collection.id,
          readCollectionLabel(collection),
        ]),
      ),
    [collections],
  );
  const visibleGenerators = useMemo(
    () => (generatorListScope === "all" ? generators : scopedGenerators),
    [generatorListScope, generators, scopedGenerators],
  );
  const filteredVisibleGenerators = useMemo(() => {
    const query = generatorListQuery.trim().toLowerCase();
    if (!query) return visibleGenerators;
    return visibleGenerators.filter((generator) => {
      const outputLabel = readGeneratorDestinationSearchLabel(generator).toLowerCase();
      const status = readGeneratorStatusLabel(generator).toLowerCase();
      const collectionLabel = (
        collectionLabelById.get(generator.targetCollectionId) ??
        "Unknown collection"
      ).toLowerCase();
      return (
        generator.name.toLowerCase().includes(query) ||
        outputLabel.includes(query) ||
        status.includes(query) ||
        collectionLabel.includes(query)
      );
    });
  }, [collectionLabelById, generatorListQuery, visibleGenerators]);
  const collectionOptions = useMemo(
    () =>
      collections.map((collection) => ({
        id: collection.id,
        label: readCollectionLabel(collection),
      })),
    [collections],
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
  const graphIssues = useMemo(
    () =>
      activeGenerator
        ? collectGraphIssues(
            generatorWithInferredTokenInputTypes(
              activeGenerator,
              perCollectionFlat,
            ),
            preview,
            perCollectionFlat,
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
            nodes: previewRelevantNodes(activeGenerator.nodes),
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

  const toggleGraphNodeDetailsExpanded = useCallback((nodeId: string) => {
    setExpandedGraphNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const loadGeneratorStatuses = useCallback(async () => {
    const data = await apiFetch<GeneratorStatusResponse>(
      `${serverUrl}/api/generators/status`,
    );
    setGeneratorStatusesById(
      Object.fromEntries(
        data.generators.map((status) => [status.generator.id, status]),
      ),
    );
  }, [serverUrl]);

  const refreshGeneratorStatuses = useCallback(() => {
    void loadGeneratorStatuses().catch((statusError) => {
      setError(
        statusError instanceof Error ? statusError.message : String(statusError),
      );
    });
  }, [loadGeneratorStatuses]);

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
      if (currentGenerator) {
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
    refreshGeneratorStatuses();
  }, [loadGenerators, refreshGeneratorStatuses]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    if (!preview) {
      setReviewedPreviewHash(null);
    }
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
      clearGeneratorDirty();
      setExternalPreviewInvalidated(false);
    }
    const opensGraph = initialView === "graph" || focus?.nodeId || focus?.edgeId;
    const opensOutputs = Boolean(focus?.diagnosticId);
    if (opensGraph) {
      setEditorMode("graph");
      setOutputDockOpen(Boolean(opensOutputs));
    } else {
      setEditorMode("overview");
      setOutputDockOpen(Boolean(opensOutputs));
      setGraphPanelState("none");
      setGraphMenu(null);
    }
    if (focus?.nodeId) {
      setSelectedNodeId(focus.nodeId);
      setSelectedEdgeId(null);
      setExpandedGraphNodeIds((current) => new Set(current).add(focus.nodeId!));
      setGraphPanelState("inspector");
    } else if (focus?.edgeId) {
      setSelectedNodeId(null);
      setSelectedEdgeId(focus.edgeId);
      setGraphPanelState("none");
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
    clearGeneratorDirty,
    setActiveGeneratorSelection,
  ]);

  useEffect(() => {
    if (initialGeneratorId) return;
    if (activeGenerator) return;
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
    if (!tokenChangeInitializedRef.current) {
      tokenChangeInitializedRef.current = true;
      return;
    }
    refreshGeneratorStatuses();
    if (!previewRef.current) return;
    setPreview(null);
    setLastApply(null);
    setExternalPreviewInvalidated(true);
  }, [refreshGeneratorStatuses, tokenChangeKey]);

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
    const activePreview =
      previewRef.current?.generatorId === activeGenerator.id
        ? previewRef.current
        : null;
    setNodes(
      toFlowNodes(
        activeGenerator,
        activePreview,
        graphIssues,
        expandedGraphNodeIds,
        toggleGraphNodeDetailsExpanded,
      ),
    );
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
  }, [
    activeGenerator,
    activeGeneratorStructureSignature,
    expandedGraphNodeIds,
    graphIssues,
    setEdges,
    setNodes,
    toggleGraphNodeDetailsExpanded,
  ]);

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
          detailsExpanded: expandedGraphNodeIds.has(node.id),
          onToggleDetailsExpanded: toggleGraphNodeDetailsExpanded,
        },
      })),
    );
  }, [
    activeGenerator,
    expandedGraphNodeIds,
    graphIssues,
    preview,
    setNodes,
    toggleGraphNodeDetailsExpanded,
  ]);

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
      markGeneratorDirty(activeGenerator.id);
      graphRevisionRef.current += 1;
      setPreview(null);
      setLastApply(null);
      setExternalPreviewInvalidated(false);
    },
    [activeGenerator, edges, markGeneratorDirty, nodes],
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
    (
      nextNodes: GraphFlowNode[],
      nextEdges: GraphFlowEdge[],
      options: {
        preservePreview?: boolean;
      } = {},
    ) => {
      if (!activeGenerator) return;
      localGraphEditRef.current = true;
      graphRevisionRef.current += 1;
      const nextGenerator = graphWithFlowState(activeGenerator, nextNodes, nextEdges);
      setGenerators((current) =>
        current.map((graph) =>
          graph.id === activeGenerator.id
            ? { ...nextGenerator, updatedAt: new Date().toISOString() }
            : graph,
        ),
      );
      markGeneratorDirty(activeGenerator.id);
      if (!options.preservePreview) {
        setPreview(null);
        setLastApply(null);
        setExternalPreviewInvalidated(false);
      }
    },
    [activeGenerator, markGeneratorDirty],
  );

  const applyGraphStructureUiState = useCallback(
    (state: GraphStructureCommitUiState | undefined) => {
      if (!state) return;
      if ("selectedNodeId" in state) {
        setSelectedNodeId(state.selectedNodeId ?? null);
      }
      if ("selectedEdgeId" in state) {
        setSelectedEdgeId(state.selectedEdgeId ?? null);
      }
      if (state.graphPanelState !== undefined) {
        setGraphPanelState(state.graphPanelState);
      }
      if ("graphMenu" in state) {
        setGraphMenu(state.graphMenu ?? null);
      }
      if (state.editorMode) {
        setEditorMode(state.editorMode);
      }
    },
    [],
  );

  const commitGraphStructure = useCallback(
    (
      nextNodes: GraphFlowNode[],
      nextEdges: GraphFlowEdge[],
      options: {
        preservePreview?: boolean;
        afterCommit?: GraphStructureCommitUiState;
      } = {},
    ) => {
      setNodes(nextNodes);
      setEdges(nextEdges);
      commitFlowState(nextNodes, nextEdges, {
        preservePreview: options.preservePreview,
      });
      applyGraphStructureUiState(options.afterCommit);
      return true;
    },
    [
      applyGraphStructureUiState,
      commitFlowState,
      setEdges,
      setNodes,
    ],
  );

  const commitViewport = useCallback(
    (viewport: Viewport) => {
      if (!activeGenerator) return;
      if (suppressedViewportCommitCountRef.current > 0) {
        suppressedViewportCommitCountRef.current -= 1;
        return;
      }
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
      markGeneratorDirty(activeGenerator.id);
    },
    [activeGenerator, markGeneratorDirty],
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
      clearGeneratorDirty();
      setExternalPreviewInvalidated(false);
      refreshGeneratorStatuses();
      return data.generator;
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
      return null;
    } finally {
      setBusy(null);
    }
  }, [
    clearGeneratorDirty,
    graphHasErrors,
    refreshGeneratorStatuses,
    serverUrl,
    syncFlowToGenerator,
  ]);

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
      clearGeneratorDirty();
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
  }, [clearGeneratorDirty, serverUrl, setEdges, setNodes]);

  useEffect(() => {
    if (!editorSessionHost) return;

    if (!activeGenerator) {
      editorSessionHost.registerSession(null);
      return;
    }

    editorSessionHost.registerSession({
      isDirty: dirty,
      canSave: dirty && busy === null && !graphHasErrors,
      save: async () => {
        if (!dirty || busy !== null || graphHasErrors) return false;
        const saved = await saveGenerator();
        return saved !== null;
      },
      discard: discardGeneratorDraft,
      closeWhenClean: () => undefined,
    });

    return () => {
      editorSessionHost.registerSession(null);
    };
  }, [
    activeGenerator,
    busy,
    dirty,
    discardGeneratorDraft,
    editorSessionHost,
    graphHasErrors,
    saveGenerator,
  ]);

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
    let saved = activeGenerator;
    if (dirty) {
      saved = await saveGenerator();
      if (!saved) return;
    }
    if (graphHasErrors) {
      setError("Fix graph issues before applying this generator.");
      setEditorMode("graph");
      return;
    }
    if (!preview) {
      setError("Wait for the latest output preview before applying.");
      return;
    }
    if (
      preview.blocking ||
      preview.outputs.length === 0 ||
      preview.outputs.some((output) => output.collision)
    ) {
      setOutputDockOpen(true);
      setError("Review the output issues before applying.");
      return;
    }
    if (reviewedPreviewHash !== preview.hash) {
      setOutputDockOpen(true);
      setError("Review the current outputs and mark them reviewed before applying.");
      return;
    }
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
      refreshGeneratorStatuses();
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
    refreshGeneratorStatuses,
    reviewedPreviewHash,
    saveGenerator,
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
      setEditorMode("overview");
      setPreview(null);
      clearGeneratorDirty();
      setGeneratorStatusesById((current) => {
        const next = { ...current };
        delete next[deletedGeneratorId];
        return next;
      });
      refreshGeneratorStatuses();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setBusy(null);
    }
  }, [
    activeGenerator,
    clearGeneratorDirty,
    generators,
    refreshGeneratorStatuses,
    serverUrl,
    setActiveGeneratorSelection,
  ]);

  const requestDeleteGenerator = useCallback(() => {
    if (!activeGenerator) return;
    setPendingDelete({
      kind: "generator",
      generatorId: activeGenerator.id,
      name: activeGenerator.name,
    });
  }, [activeGenerator]);

  const clearGeneratorSelectionState = useCallback(() => {
    autoPreviewRunRef.current += 1;
    setPreview(null);
    setReviewedPreviewHash(null);
    setActiveInitialFocus(null);
    setError(null);
    setLastApply(null);
    setExternalPreviewInvalidated(false);
    clearGeneratorDirty();
    setSelectedEdgeId(null);
    setGraphPanelState("none");
    setGraphMenu(null);
    setActionsMenuOpen(false);
    setOutputDockOpen(false);
  }, [clearGeneratorDirty]);

  const changeWorkingCollection = useCallback(
    (collectionId: string) => {
      if (busy) {
        setError("Wait for the current generator action to finish.");
        return;
      }
      if (dirty) {
        setError("Save the current generator before switching collections.");
        return;
      }
      if (collectionId === workingCollectionId) return;
      onWorkingCollectionChange?.(collectionId);
      const nextGeneratorId =
        generators.find((generator) => generator.targetCollectionId === collectionId)
          ?.id ?? null;
      setActiveGeneratorSelection(nextGeneratorId);
      clearGeneratorSelectionState();
      setGeneratorListScope("collection");
      setGeneratorListQuery("");
    },
    [
      busy,
      clearGeneratorSelectionState,
      dirty,
      generators,
      onWorkingCollectionChange,
      setActiveGeneratorSelection,
      workingCollectionId,
    ],
  );

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
      const nextGenerator = generators.find((generator) => generator.id === generatorId);
      if (
        nextGenerator &&
        nextGenerator.targetCollectionId !== workingCollectionId
      ) {
        onWorkingCollectionChange?.(nextGenerator.targetCollectionId);
      }
      clearGeneratorSelectionState();
      setActiveGeneratorSelection(generatorId);
      setGeneratorListOpen(false);
      setGeneratorListQuery("");
    },
    [
      busy,
      clearGeneratorSelectionState,
      dirty,
      generators,
      onWorkingCollectionChange,
      setActiveGeneratorSelection,
      workingCollectionId,
    ],
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
      if (
        !commitGraphStructure(baseNodes, nextEdges, {
          afterCommit: {
            selectedEdgeId: flowEdge.id,
            graphMenu: null,
          },
        })
      )
        return false;
      setSelectedEdgeId(flowEdge.id);
      setGraphMenu(null);
      setError(null);
      return true;
    },
    [activeGenerator, commitGraphStructure, edges, nodes, perCollectionFlat],
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
          setError("That node cannot be inserted into this connection.");
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
          setError("That node cannot receive this connection.");
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
            setError("That node cannot be inserted before this input.");
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
            setError("That node cannot connect to this input.");
            return;
          }
          nextEdges = addSingleInputEdge(nextEdges, flowEdge);
        }
      }
      if (
        !commitGraphStructure(nextNodes, nextEdges, {
          afterCommit: {
            selectedNodeId: id,
            selectedEdgeId: null,
            graphPanelState: inspectorMinimized ? "none" : "inspector",
            graphMenu: null,
          },
        })
      )
        return;
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      setGraphPanelState(inspectorMinimized ? "none" : "inspector");
      setGraphMenu(null);
      setError(null);
    },
    [
      activeGenerator,
      commitGraphStructure,
      edges,
      inspectorMinimized,
      nodes,
      perCollectionFlat,
      preview,
    ],
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
      if (
        !commitGraphStructure(deletion.nodes, deletion.edges, {
          afterCommit: {
            selectedNodeId: null,
            selectedEdgeId: null,
            graphMenu: null,
          },
        })
      )
        return;
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setGraphMenu(null);
    },
    [
      activeGenerator,
      commitGraphStructure,
      edges,
      nodes,
      perCollectionFlat,
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
      if (
        !commitGraphStructure(nodes, nextEdges, {
          afterCommit: {
            selectedEdgeId: null,
            graphMenu: null,
          },
        })
      )
        return;
      setSelectedEdgeId(null);
      setGraphMenu(null);
    },
    [activeGenerator, commitGraphStructure, edges, nodes],
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
    if (
      !commitGraphStructure(nodes, nextEdges, {
        afterCommit: {
          selectedEdgeId: null,
          graphMenu: null,
        },
      })
    )
      return;
    setSelectedEdgeId(null);
    setGraphMenu(null);
    setError(null);
  }, [
    activeGenerator,
    commitGraphStructure,
    edges,
    nodes,
    perCollectionFlat,
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
      if (
        !commitGraphStructure(nextNodes, edges, {
          afterCommit: {
            selectedNodeId: id,
            selectedEdgeId: null,
            graphPanelState: inspectorMinimized ? "none" : "inspector",
            graphMenu: null,
          },
        })
      )
        return;
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      setGraphPanelState(inspectorMinimized ? "none" : "inspector");
      setGraphMenu(null);
    },
    [activeGenerator, commitGraphStructure, edges, inspectorMinimized, nodes, preview],
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
    const listSourcePort = sourcePorts.find((port) => port.shape === "list");
    const outputKind = listSourcePort ? "groupOutput" : "output";
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
    const sourcePort = listSourcePort?.id ?? "value";
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
    if (
      !commitGraphStructure(nextNodes, nextEdges, {
        afterCommit: {
          selectedNodeId: id,
          graphPanelState: inspectorMinimized ? "none" : "inspector",
          editorMode: "graph",
        },
      })
    )
      return;
    setSelectedNodeId(id);
    setGraphPanelState(inspectorMinimized ? "none" : "inspector");
    setEditorMode("graph");
  }, [
    activeGenerator,
    commitGraphStructure,
    edges,
    inspectorMinimized,
    nodes,
    preview,
    selectedNode,
  ]);

  const focusGraphIssue = useCallback(
    (issue: GraphIssue) => {
      setEditorMode("graph");
      setGraphPanelState("none");
      if (issue.id === "missing-output") {
        addOutputStep();
        return;
      }
      if (issue.nodeId) {
        const issueNode = activeGenerator?.nodes.find(
          (node) => node.id === issue.nodeId,
        );
        setSelectedNodeId(issue.nodeId);
        setSelectedEdgeId(null);
        setExpandedGraphNodeIds((current) => new Set(current).add(issue.nodeId!));
        setGraphPanelState(inspectorMinimized ? "none" : "inspector");
        if (
          issueNode &&
          (issue.message === "Connect an input" || issue.targetPort)
        ) {
          setGraphMenu({
            kind: "connect-to-input",
            targetNodeId: issue.nodeId,
            targetPort: issue.targetPort ?? "value",
            ...graphMenuPointFromNode(issueNode),
          });
        } else {
          setGraphMenu(null);
        }
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
        setGraphPanelState("none");
        if (edgeTargetNode) {
          setGraphMenu({
            kind: "edge",
            edgeId: issue.edgeId,
            ...graphMenuPointFromNode(edgeTargetNode),
          });
        }
        return;
      }
    },
    [activeGenerator, addOutputStep, graphMenuPointFromNode, inspectorMinimized],
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
      ? "Unsaved changes"
      : externalPreviewInvalidated
        ? "Updating preview"
        : preview?.blocking || previewHasCollisions || previewHasNoOutputs
          ? "Preview has issues"
          : preview
            ? reviewedPreviewHash === preview.hash
              ? "Ready to apply"
              : "Outputs ready"
            : activeGenerator
              ? "Preparing preview"
              : "No generator";
  const activeGeneratorCollectionLabel = activeGenerator
    ? (collectionLabelById.get(activeGenerator.targetCollectionId) ??
        "Unknown collection")
    : "No collection";
  const activeGeneratorDestinationLabel = activeGenerator
    ? readGeneratorOutputLabel(activeGenerator)
    : "No output";
  const activeGeneratorSummary = activeGenerator
    ? `${activeGeneratorDestinationLabel} · ${activeGeneratorCollectionLabel}`
    : "Choose a generator";
  const workbenchStateSummary = preview
    ? `${
        preview.outputs.length === 1
          ? "1 output"
          : `${preview.outputs.length} outputs`
      } · ${formatOutputChangeSummary(countPreviewChanges(preview.outputs))}`
    : statusLabel;

  const openNodeLibraryPanel = useCallback(() => {
    if (selectedNode) {
      setInspectorMinimized(true);
    }
    setGraphPanelState("nodeLibrary");
    setActionsMenuOpen(false);
  }, [selectedNode]);

  useEffect(() => {
    if (!compactGenerators) {
      setActionsMenuOpen(false);
      return;
    }
    if (editorMode === "graph") {
      setActionsMenuOpen(false);
    } else {
      setGraphPanelState("none");
    }
  }, [compactGenerators, editorMode]);

  useEffect(() => {
    if (editorMode !== "graph" || !flowInstance || !activeGenerator) {
      if (editorMode !== "graph") {
        lastGraphAutoFitKeyRef.current = null;
      }
      return;
    }
    const viewportIsDefault =
      activeGenerator.viewport.x === 0 &&
      activeGenerator.viewport.y === 0 &&
      activeGenerator.viewport.zoom === 1;
    if (!viewportIsDefault) return;
    const autoFitKey = `${activeGenerator.id}:${compactGenerators ? "compact" : "full"}`;
    if (lastGraphAutoFitKeyRef.current === autoFitKey) return;
    lastGraphAutoFitKeyRef.current = autoFitKey;
    const setGraphViewport = () => {
      suppressedViewportCommitCountRef.current += 1;
      flowInstance.fitView({
        duration: 150,
        maxZoom: compactGenerators ? 0.62 : 0.82,
        padding: compactGenerators ? 0.22 : 0.18,
      });
    };
    const animationFrameId = window.requestAnimationFrame(setGraphViewport);
    const resetTimeoutId = window.setTimeout(() => {
      suppressedViewportCommitCountRef.current = 0;
    }, 300);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(resetTimeoutId);
    };
  }, [
    activeGenerator,
    compactGenerators,
    editorMode,
    flowInstance,
  ]);

  const renderGraphWorkspace = () => {
    if (!activeGenerator) return null;
    const visibleGraphPosition = (offsetX = 0, offsetY = 0) => {
      if (typeof window !== "undefined" && flowInstance) {
        return flowInstance.screenToFlowPosition({
          x: window.innerWidth / 2 + offsetX,
          y: window.innerHeight / 2 + offsetY,
        });
      }
      return { x: 160 + offsetX, y: 120 + offsetY };
    };
    return (
      <div className="relative h-full min-h-0 overflow-hidden">
        <section className="relative h-full min-h-0 w-full min-w-0">
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
          {activeGenerator.nodes.length === 0 ? (
            <div className="tm-graph-empty-state">
              <div className="tm-graph-empty-state__content">
                <h2>Add your first nodes</h2>
                <p>Start with a source, transform it, then send the result to tokens.</p>
                <div className="tm-graph-empty-state__actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={openNodeLibraryPanel}
                  >
                    <Plus size={14} />
                    Add node
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const colorItem = PALETTE.find(
                        (item) => item.kind === "literal" && item.label === "Color",
                      );
                      if (colorItem) addPaletteNode(colorItem, visibleGraphPosition(-90));
                    }}
                  >
                    Add color source
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const outputItem = PALETTE.find(
                        (item) => item.kind === "groupOutput",
                      );
                      if (outputItem) addPaletteNode(outputItem, visibleGraphPosition(90));
                    }}
                  >
                    Add output
                  </Button>
                </div>
              </div>
            </div>
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
                setError("Use the node menu to delete nodes safely.");
              }
              if (safeChanges.length === 0) return;
              if (hasStructuralNodeChange(safeChanges)) {
                const nextNodes = applyNodeChanges(safeChanges, nodesRef.current);
                commitGraphStructure(nextNodes, edgesRef.current, {
                  preservePreview: changesOnlyCommitNodePositions(safeChanges),
                });
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
                commitGraphStructure(nodesRef.current, nextEdges);
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
              setGraphPanelState("none");
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
              setGraphMenu(null);
              setGraphPanelState(inspectorMinimized ? "none" : "inspector");
            }}
            onNodeDoubleClick={(_event, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
              setInspectorMinimized(false);
              setGraphPanelState("inspector");
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
              setGraphPanelState("none");
              setGraphMenu(null);
            }}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              setSelectedNodeId(null);
              setSelectedEdgeId(edge.id);
              setGraphPanelState("none");
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
            minZoom={0.35}
            maxZoom={1.6}
            deleteKeyCode={null}
            className="tm-graph"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="var(--color-figma-border)" />
            <Controls
              className="tm-graph-controls"
              position="bottom-left"
              showInteractive={false}
            />
          </ReactFlow>
          <div className="tm-graph-toolbar" aria-label="Graph actions">
            <Button
              type="button"
              title={
                graphPanelState === "nodeLibrary"
                  ? "Hide node library"
                  : "Add node"
              }
              aria-label={
                graphPanelState === "nodeLibrary"
                  ? "Hide node library"
                  : "Add node"
              }
              onClick={() => {
                if (graphPanelState === "nodeLibrary") {
                  setGraphPanelState("none");
                  setActionsMenuOpen(false);
                } else {
                  openNodeLibraryPanel();
                }
              }}
              size="sm"
              variant="secondary"
            >
              <Plus size={14} />
              Add node
            </Button>
          </div>
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
                setInspectorMinimized(false);
                setGraphPanelState("inspector");
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
        {graphPanelState === "nodeLibrary" ? (
          <GraphFloatingPanel
            title="Add node"
            onClose={() => setGraphPanelState("none")}
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
          </GraphFloatingPanel>
        ) : null}
        {graphPanelState === "inspector" && selectedNode && !inspectorMinimized ? (
          <GraphFloatingPanel
            title="Node settings"
            subtitle={`${selectedNode.label} · ${formatNodeKind(selectedNode.kind)}`}
            onMinimize={() => {
              setInspectorMinimized(true);
              setGraphPanelState("none");
            }}
          >
            <section className="p-2">
              <NodeInspector
                node={selectedNode}
                collections={collections}
                perCollectionFlat={perCollectionFlat}
                defaultCollectionId={activeGenerator.targetCollectionId}
                onChange={(data) => updateNodeData(selectedNode.id, data)}
                onDelete={deleteSelectedNode}
              />
            </section>
          </GraphFloatingPanel>
        ) : null}
        {selectedNode &&
        inspectorMinimized ? (
          <GraphInspectorMinimizedTab
            node={selectedNode}
            placement={graphPanelState === "nodeLibrary" ? "bottom" : "top"}
            onExpand={() => {
              setInspectorMinimized(false);
              setGraphPanelState("inspector");
            }}
          />
        ) : null}
      </div>
    );
  };

  const renderOverviewPanel = () => {
    if (!activeGenerator) return null;
    return (
      <GeneratorOverviewPanel
        generator={activeGenerator}
        collections={collections}
        perCollectionFlat={perCollectionFlat}
        preview={preview}
        graphIssues={graphIssues}
        onRename={(name) => patchActiveGraph({ name })}
        onChangeNode={updateNodeData}
        onAddNode={() => {
          setEditorMode("graph");
          openNodeLibraryPanel();
        }}
        onFocusGraphIssue={focusGraphIssue}
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
        compact={compactGenerators}
        onNavigateToToken={(path) =>
          onNavigateToToken(
            path,
            activeGenerator.targetCollectionId,
          )
        }
      />
    );
  };

  const renderOverviewWorkspace = () => {
    if (!activeGenerator) return null;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <section className="min-w-0 flex-1 overflow-y-auto px-2 py-2">
          {renderOverviewPanel()}
        </section>
      </div>
    );
  };

  const openCreateGenerator = () => {
    if (busy) {
      setError("Wait for the current generator action to finish.");
      return;
    }
    if (dirty) {
      setError("Save the current generator before creating another one.");
      return;
    }
    setGeneratorListOpen(false);
    setActionsMenuOpen(false);
    setCreatePanelOpen(true);
    setError(null);
  };

  const renderGeneratorIdentity = () => (
    <div className="tm-generator-header__identity">
      <button
        type="button"
        className="tm-generator-switcher-button"
        onClick={() => {
          setGeneratorListOpen((open) => !open);
          setActionsMenuOpen(false);
          setGraphPanelState("none");
        }}
        aria-expanded={generatorListOpen}
        aria-haspopup="dialog"
        title="Choose generator"
      >
        <span className="tm-generator-switcher-button__icon" aria-hidden>
          <List size={14} />
        </span>
        <span className="tm-generator-switcher-button__label">
          <span
            className="tm-generator-active-title"
            title={activeGenerator?.name || "No generator selected"}
          >
            {activeGenerator?.name || "No generator selected"}
          </span>
          <span
            className="tm-generator-active-meta"
            title={activeGeneratorSummary}
          >
            {activeGeneratorSummary}
          </span>
        </span>
        <ChevronDown
          size={13}
          className={`tm-generator-switcher-button__chevron ${
            generatorListOpen ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {renderGeneratorList()}
    </div>
  );

  const renderGeneratorTabs = () => (
    <div className="tm-generator-header__tabs">
      <SegmentedControl
        value={editorMode}
        options={GENERATOR_EDITOR_TABS}
        onChange={switchEditorMode}
        ariaLabel="Generator surfaces"
      />
    </div>
  );

  const renderGeneratorList = () =>
    generatorListOpen ? (
      <>
        <button
          type="button"
          className="fixed inset-0 z-20 cursor-default"
          aria-label="Close generator list"
          onClick={() => setGeneratorListOpen(false)}
        />
        <div
          className="tm-generator-list"
          role="dialog"
          aria-label="Generators"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setGeneratorListOpen(false);
            }
          }}
        >
          <div className="tm-generator-list__header">
            <h2 className="m-0 text-body font-semibold text-[color:var(--color-figma-text)]">
              Generators
            </h2>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={openCreateGenerator}
            >
              <Plus size={14} />
              New generator
            </Button>
          </div>
          <div className="tm-generator-list__controls">
            <div className="tm-generator-list__search">
              <Search size={14} aria-hidden />
              <input
                ref={generatorListSearchRef}
                value={generatorListQuery}
                onChange={(event) => setGeneratorListQuery(event.target.value)}
                placeholder="Find generator"
                aria-label="Find generator"
              />
            </div>
            <label className="tm-generator-list__collection">
              <span>Collection</span>
              <select
                value={workingCollectionId}
                onChange={(event) => changeWorkingCollection(event.target.value)}
                disabled={busy !== null || dirty}
              >
                {collectionOptions.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.label}
                  </option>
                ))}
              </select>
            </label>
            <SegmentedControl
              value={generatorListScope}
              options={GENERATOR_LIST_SCOPE_OPTIONS}
              onChange={setGeneratorListScope}
              ariaLabel="Generator list scope"
            />
          </div>
          <div className="tm-generator-list__body">
            {filteredVisibleGenerators.length > 0 ? (
              filteredVisibleGenerators.map((generator) => {
                const selected = generator.id === activeGeneratorId;
                const status = generatorStatusesById[generator.id];
                const currentPreview =
                  preview?.generatorId === generator.id ? preview : null;
                const producedTokenCount =
                  currentPreview?.outputs.length ?? status?.preview.outputs.length;
                const destinationLabel = readGeneratorOutputLabel(generator);
                const destinationTitle = readGeneratorDestinationSearchLabel(generator);
                const metadataLabel = formatGeneratorListMetadata(
                  generator,
                  producedTokenCount,
                );
                const collectionLabel =
                  collectionLabelById.get(generator.targetCollectionId) ??
                  "Unknown collection";
                return (
                  <button
                    key={generator.id}
                    type="button"
                    className={`tm-generator-list__item ${
                      selected ? "tm-generator-list__item--selected" : ""
                    }`}
                    onClick={() => {
                      if (selected) {
                        setGeneratorListOpen(false);
                        setGeneratorListQuery("");
                        return;
                      }
                      if (busy) {
                        setError("Wait for the current generator action to finish.");
                        return;
                      }
                      if (dirty && generator.id !== activeGeneratorId) {
                        setError("Save the current generator before switching to another one.");
                        return;
                      }
                      selectGenerator(generator.id);
                      setGeneratorListOpen(false);
                      setGeneratorListQuery("");
                    }}
                  >
                    <span className="tm-generator-list__item-main">
                      <span className="tm-generator-list__item-title">
                        {generator.name}
                      </span>
                      <span
                        className="tm-generator-list__item-detail"
                        title={destinationTitle}
                      >
                        {destinationLabel}
                      </span>
                    </span>
                    <span className="tm-generator-list__item-meta">
                      <span className="tm-generator-list__item-collection">
                        {collectionLabel}
                      </span>
                      <span>{readGeneratorStatusLabel(generator)}</span>
                      <span>{metadataLabel}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="tm-generator-list__empty">
                {visibleGenerators.length === 0
                  ? generatorListScope === "collection"
                    ? "No generators in this collection."
                    : "No generators yet."
                  : "No matching generators."}
              </div>
            )}
          </div>
        </div>
      </>
    ) : null;

  const renderStatusIndicator = (compact = false, includeId = true) => {
    if (busy) {
      const busyLabel = `${busy.charAt(0).toUpperCase()}${busy.slice(1)}...`;
      return (
        <span
          id={includeId ? "generator-status-label" : undefined}
          className={
            compact
              ? "tm-generator-status tm-generator-status--compact tm-generator-status--updating"
              : "tm-generator-status tm-generator-status--updating"
          }
          title={busyLabel}
        >
          {busyLabel}
        </span>
      );
    }
    if (graphHasErrors) {
      return (
        <button
          id={includeId ? "generator-status-label" : undefined}
          type="button"
          onClick={focusFirstGraphIssue}
          className={
            compact
              ? "tm-generator-status tm-generator-status--compact tm-generator-status--error"
              : "tm-generator-status tm-generator-status--error"
          }
          title={statusLabel}
        >
          <AlertTriangle size={13} />
          <span className={compact ? "truncate" : ""}>{statusLabel}</span>
        </button>
      );
    }
    if (preview && (preview.blocking || previewHasCollisions || previewHasNoOutputs)) {
      return (
        <button
          id={includeId ? "generator-status-label" : undefined}
          type="button"
          onClick={openOutputReview}
          className={
            compact
              ? "tm-generator-status tm-generator-status--compact tm-generator-status--warning"
              : "tm-generator-status tm-generator-status--warning"
          }
          title={statusLabel}
        >
          <AlertTriangle size={13} />
          <span className={compact ? "truncate" : ""}>{statusLabel}</span>
        </button>
      );
    }
    return (
      <span
        id={includeId ? "generator-status-label" : undefined}
        className={
          compact
            ? `tm-generator-status tm-generator-status--compact ${readGeneratorStatusClass()}`
            : `tm-generator-status ${readGeneratorStatusClass()}`
        }
        title={statusLabel}
      >
        {statusLabel}
      </span>
    );
  };

  const switchEditorMode = (mode: GeneratorEditorMode) => {
    setEditorMode(mode);
    setActionsMenuOpen(false);
    setGeneratorListOpen(false);
    if (mode === "graph") {
      return;
    }
    setGraphPanelState("none");
    setGraphMenu(null);
  };

  const readGeneratorStatusClass = () => {
    if (dirty) return "tm-generator-status--dirty";
    if (externalPreviewInvalidated || !preview) {
      return "tm-generator-status--updating";
    }
    if (preview.blocking || previewHasCollisions || previewHasNoOutputs) {
      return "tm-generator-status--warning";
    }
    return "tm-generator-status--ready";
  };

  const renderActionsMenu = () =>
    actionsMenuOpen ? (
      <>
        <button
          type="button"
          className="fixed inset-0 z-20 cursor-default"
          aria-label="Close generator actions"
          onClick={() => setActionsMenuOpen(false)}
        />
        <div className="absolute right-0 top-9 z-30 min-w-[176px] rounded-md border border-[var(--border-muted)] bg-[var(--surface-panel-header)] p-1 shadow-[var(--shadow-popover)]">
          {dirty ? (
            <ActionRow
              onClick={() => {
                setActionsMenuOpen(false);
                void discardGeneratorDraft();
              }}
              disabled={busy !== null}
            >
              Discard changes
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

  const previewHasOutputIssues =
    Boolean(preview) &&
    (Boolean(preview?.blocking) || previewHasCollisions || previewHasNoOutputs);
  const canOpenGeneratorOutputReview =
    busy === null &&
    !graphHasErrors &&
    Boolean(preview);
  const previewReviewed =
    Boolean(preview) && reviewedPreviewHash === preview?.hash;
  const canApplyReviewedGenerator =
    canOpenGeneratorOutputReview && previewReviewed && !previewHasOutputIssues;
  const generatorPrimaryActionLabel = previewHasOutputIssues
    ? "Review issues"
    : canApplyReviewedGenerator
      ? "Apply"
      : "Review outputs";
  const generatorPrimaryActionTitle = previewHasOutputIssues
    ? "Review generator output issues"
    : canApplyReviewedGenerator
      ? "Apply reviewed generator outputs"
      : "Review generator outputs before applying";

  const renderGeneratorActions = (compact = false) => (
    <div
      className={
        compact
          ? "tm-generator-action-cluster tm-generator-action-cluster--compact"
          : "tm-generator-action-cluster"
      }
    >
      {dirty && compact ? (
        <Button
          title="Save generator"
          aria-label="Save generator"
          onClick={saveGenerator}
          disabled={!dirty || busy !== null || graphHasErrors}
          variant="secondary"
          size="sm"
        >
          <Save size={14} />
          <span className="sr-only">Save</span>
        </Button>
      ) : null}
      {dirty && !compact ? (
        <Button
          title="Save generator"
          aria-label="Save generator"
          onClick={saveGenerator}
          disabled={!dirty || busy !== null || graphHasErrors}
          variant="secondary"
          size="sm"
        >
          <Save size={14} />
          <span className="max-[760px]:sr-only">Save</span>
        </Button>
      ) : null}
      {preview &&
      preview.outputs.length > 0 &&
      !outputDockOpen &&
      previewReviewed &&
      !compact ? (
        <Button
          title="Review generator outputs"
          aria-label="Review generator outputs"
          onClick={openOutputReview}
          variant="secondary"
          size="sm"
        >
          <PanelRight size={14} />
          <span>Review</span>
        </Button>
      ) : null}
      <Button
        title={generatorPrimaryActionTitle}
        aria-label={generatorPrimaryActionTitle}
        aria-describedby="generator-status-label"
        onClick={canApplyReviewedGenerator ? applyGenerator : openOutputReview}
        disabled={!canOpenGeneratorOutputReview}
        variant="primary"
        size="sm"
      >
        {canApplyReviewedGenerator ? <Sparkles size={14} /> : <PanelRight size={14} />}
        <span>{generatorPrimaryActionLabel}</span>
      </Button>
      <div className="relative">
        <IconButton
          title="More generator actions"
          aria-label="More generator actions"
          onClick={() => setActionsMenuOpen((open) => !open)}
          size="md"
        >
          <MoreHorizontal size={14} />
        </IconButton>
        {renderActionsMenu()}
      </div>
    </div>
  );

  const renderOutputDock = () => {
    if (!activeGenerator) return null;
    const counts = preview ? countPreviewChanges(preview.outputs) : null;
    const previewDiagnosticCount = preview?.diagnostics.length ?? 0;
    const previewIssueCount =
      previewDiagnosticCount +
      (counts?.collisions ?? 0) +
      (previewHasNoOutputs ? 1 : 0);
    const outputLabel = !preview
      ? "Preparing outputs"
      : preview.outputs.length === 1
        ? "1 output"
        : `${preview.outputs.length} outputs`;
    const outputChangeSummary = counts ? formatOutputChangeSummary(counts) : null;
    return (
      <section
        className={`tm-generator-output-dock ${
          outputDockOpen ? "tm-generator-output-dock--open" : ""
        }`}
      >
        <header className="tm-generator-output-dock__header">
          <button
            type="button"
            className="tm-generator-output-dock__summary"
            onClick={() => setOutputDockOpen((open) => !open)}
            aria-expanded={outputDockOpen}
          >
            <ChevronDown
              size={14}
              className={outputDockOpen ? "" : "-rotate-90"}
              aria-hidden
            />
            <span className="font-semibold text-[color:var(--color-figma-text)]">
              Outputs
            </span>
            <span className="text-[color:var(--color-figma-text-secondary)]">
              {outputLabel}
            </span>
            {counts ? (
              <span className="truncate text-[color:var(--color-figma-text-secondary)]">
                {outputChangeSummary}
              </span>
            ) : null}
          </button>
          <div className="tm-generator-output-dock__actions">
            {outputDockOpen &&
            preview &&
            !previewHasOutputIssues &&
            reviewedPreviewHash !== preview.hash ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={markCurrentPreviewReviewed}
              >
                Mark reviewed
              </Button>
            ) : null}
            {outputDockOpen &&
            preview &&
            !previewHasOutputIssues &&
            reviewedPreviewHash === preview.hash ? (
              <span className="tm-generator-output-dock__reviewed">Reviewed</span>
            ) : null}
          </div>
          {graphIssues.length > 0 || previewIssueCount > 0 ? (
            <button
              type="button"
              className="tm-generator-output-dock__issue"
              onClick={graphIssues.length > 0 ? focusFirstGraphIssue : openOutputReview}
            >
              <AlertTriangle size={13} />
              {graphIssues.length + previewIssueCount}
            </button>
          ) : null}
        </header>
        {outputDockOpen ? (
          <div className="tm-generator-output-dock__body">
            {renderPreviewPanel()}
          </div>
        ) : null}
      </section>
    );
  };

  const handleCreateSheetKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      closeCreatePanel();
      return;
    }
    if (event.key !== "Tab" || !createSheetPanelRef.current) return;
    const focusableElements = getFocusableElements(createSheetPanelRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      createSheetPanelRef.current.focus();
      return;
    }
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const renderEmptyWorkbench = () => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="tm-generator-workbench-header tm-generator-workbench-header--empty">
        {renderGeneratorIdentity()}
        <div className="tm-generator-header__empty-summary">
          {generators.length > 0
            ? "No generator selected in this collection."
            : "Automate token groups from values, tokens, or graphs."}
        </div>
        <Button type="button" size="sm" variant="primary" onClick={openCreateGenerator}>
          <Plus size={14} />
          New generator
        </Button>
      </div>
      <FeedbackPlaceholder
        variant="empty"
        size="full"
        icon={null}
        title={
          generators.length > 0
            ? "No generators in this collection"
            : "No generators yet"
        }
        description={
          generators.length > 0
            ? "This collection does not have its own generators. View all generators or create one for this collection."
            : "Create a generator for repeated scales, ramps, and token groups in this collection."
        }
        actions={
          generators.length > 0
            ? [
                {
                  label: "View all generators",
                  onClick: () => {
                    setGeneratorListScope("all");
                    setGeneratorListOpen(true);
                  },
                },
                {
                  label: "Create generator",
                  onClick: () => {
                    if (busy) {
                      setError("Wait for the current generator action to finish.");
                      return;
                    }
                    setCreatePanelOpen(true);
                  },
                  tone: "secondary",
                },
              ]
            : [
                {
                  label: "Create generator",
                  onClick: () => {
                    if (busy) {
                      setError("Wait for the current generator action to finish.");
                      return;
                    }
                    setCreatePanelOpen(true);
                  },
                },
              ]
        }
      />
    </div>
  );

  return (
    <div
      ref={panelRef}
      className="relative flex h-full min-h-0 bg-[var(--surface-app)] text-[color:var(--color-figma-text)]"
    >
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {!activeGenerator ? (
          renderEmptyWorkbench()
        ) : (
          <>
            <div className="tm-generator-workbench-header">
              <div className="tm-generator-workbench-header__primary">
                {renderGeneratorIdentity()}
                <div className="tm-generator-header__state">
                  <span title={workbenchStateSummary}>
                    {workbenchStateSummary}
                  </span>
                </div>
              </div>
              <div className="tm-generator-workbench-header__secondary">
                {renderGeneratorTabs()}
                <div className="tm-generator-header__actions">
                  {renderStatusIndicator(compactGenerators)}
                  {renderGeneratorActions(compactGenerators)}
                </div>
              </div>
            </div>

            {error ? (
              <div className="flex items-center gap-2 px-3 py-2 text-secondary text-[color:var(--color-figma-text-error)]">
                <AlertTriangle size={14} />
                {error}
              </div>
            ) : null}
            {lastApply ? (
              <div className="flex items-center gap-2 px-3 py-2 text-secondary text-[color:var(--color-figma-text-success)]">
                <Check size={14} />
                Applied {lastApply.created.length} created,{" "}
                {lastApply.updated.length} updated, {lastApply.deleted.length}{" "}
                deleted.
              </div>
            ) : null}

            <div className="min-h-0 flex-1">
              {editorMode === "graph" ? renderGraphWorkspace() : renderOverviewWorkspace()}
            </div>
            {renderOutputDock()}
          </>
        )}
        {createPanelOpen ? (
          <div
            className="tm-generator-create-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Create generator"
            onKeyDown={handleCreateSheetKeyDown}
          >
            <button
              type="button"
              className="tm-generator-create-sheet__backdrop"
              aria-label="Close create generator"
              onClick={closeCreatePanel}
            />
            <aside
              ref={createSheetPanelRef}
              className="tm-generator-create-sheet__panel"
              tabIndex={-1}
            >
              <GeneratorCreatePanel
                serverUrl={serverUrl}
                collections={collections}
                workingCollectionId={workingCollectionId}
                initialOutputPrefix={createOutputPrefix}
                perCollectionFlat={perCollectionFlat}
                onClose={closeCreatePanel}
                onOpenGenerator={(generatorId, collectionId, initialView) => {
                  if (
                    dirtyRef.current &&
                    dirtyGeneratorIdRef.current &&
                    dirtyGeneratorIdRef.current !== generatorId
                  ) {
                    setError("Save the current generator before opening another one.");
                    closeCreatePanel();
                    return;
                  }
                  const nextEditorMode = initialView ?? "overview";
                  if (collectionId !== workingCollectionId) {
                    setGeneratorListScope("all");
                  }
                  setActiveGeneratorSelection(generatorId);
                  setEditorMode(nextEditorMode);
                  void loadGenerators().then(() => {
                    setActiveGeneratorSelection(generatorId);
                    setEditorMode(nextEditorMode);
                    refreshGeneratorStatuses();
                  });
                  closeCreatePanel();
                  setGeneratorListOpen(false);
                  setOutputDockOpen(false);
                }}
              />
            </aside>
          </div>
        ) : null}
      </main>
      {pendingDelete ? (
        <GeneratorDeleteDialog
          action={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmPendingDelete}
        />
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
    <div
      className={`absolute left-3 right-3 top-3 z-10 max-w-[420px] rounded-md border border-[var(--border-muted)] p-2 shadow-[var(--shadow-popover)] ${
        primaryIssue.severity === "error"
          ? "bg-[var(--surface-error)]"
          : "bg-[var(--surface-warning)]"
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          className={
            primaryIssue.severity === "error"
              ? "mt-0.5 shrink-0 text-[color:var(--color-figma-text-error)]"
              : "mt-0.5 shrink-0 text-[color:var(--color-figma-text-warning)]"
          }
        />
        <div className="min-w-0 flex-1">
          <div className="text-secondary font-semibold text-[color:var(--color-figma-text)]">
            {issueCountLabel}
          </div>
          <button
            type="button"
            onClick={() => onFocusIssue(primaryIssue)}
            className={`mt-0.5 block max-w-full truncate text-left text-secondary hover:underline ${
              primaryIssue.severity === "error"
                ? "text-[color:var(--color-figma-text-error)]"
                : "text-[color:var(--color-figma-text-secondary)]"
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
        ? "This node is not connected to the graph."
        : action.reconnectCount > 0
          ? `${action.connectedEdgeCount} connection${action.connectedEdgeCount === 1 ? "" : "s"} will be removed. ${action.reconnectCount} compatible connection${action.reconnectCount === 1 ? "" : "s"} will be restored around it.`
          : `${action.connectedEdgeCount} connection${action.connectedEdgeCount === 1 ? "" : "s"} will be removed. Check the output preview before applying.`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--backdrop-danger)] p-3">
      <section className="w-full max-w-[360px] rounded-md border border-[var(--border-muted)] bg-[var(--surface-1)] p-3 shadow-[var(--shadow-dialog)]">
        <h2 className="text-primary font-semibold text-[color:var(--color-figma-text)]">
          {title}
        </h2>
        <p className="mt-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
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
  const menuLeft =
    typeof window === "undefined"
      ? menu.x
      : Math.min(Math.max(8, menu.x), Math.max(8, window.innerWidth - 268));
  const menuTop =
    typeof window === "undefined"
      ? menu.y
      : Math.min(Math.max(8, menu.y), Math.max(8, window.innerHeight - 320));

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 cursor-default"
        aria-label="Close graph menu"
        onClick={onClose}
      />
      <div
        className="fixed z-30 w-[260px] max-w-[calc(100vw_-_16px)] overflow-hidden rounded-md border border-[var(--border-muted)] bg-[var(--surface-panel-header)] p-1 shadow-[var(--shadow-popover)]"
        style={{ left: menuLeft, top: menuTop }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {showAddSearch ? (
          <div className="tm-generator-field mb-1">
            <Search size={13} className="text-[color:var(--color-figma-text-secondary)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nodes"
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
              Insert node
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
          <GraphMenuGroup title="Existing nodes">
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
          <GraphMenuGroup title={existingCandidates.length > 0 ? "New nodes" : "Nodes"}>
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
              <div className="px-2 py-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
                <div>
                  {normalizedQuery
                    ? "No nodes match this search."
                    : "No compatible nodes."}
                </div>
                {normalizedQuery ? (
                  <button
                    type="button"
                    className="mt-1 text-[color:var(--color-figma-text-accent)] hover:underline"
                    onClick={() => setQuery("")}
                  >
                    Clear search
                  </button>
                ) : null}
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
      <div className="px-2 py-1 text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
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
          ? "text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-bg-hover)]"
          : "text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
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

function GraphFloatingPanel({
  title,
  subtitle,
  onClose,
  onMinimize,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="tm-graph-floating-panel-shell pointer-events-none">
      <aside
        className="tm-graph-floating-panel pointer-events-auto"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <header className="tm-graph-floating-panel__header">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-primary font-semibold">{title}</h2>
            {subtitle ? (
              <p className="m-0 truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {onMinimize ? (
            <IconButton
              title="Minimize node settings"
              aria-label="Minimize node settings"
              onClick={onMinimize}
            >
              <PanelRight size={14} />
            </IconButton>
          ) : null}
          {onClose ? (
            <IconButton title="Close" aria-label="Close" onClick={onClose}>
              <X size={14} />
            </IconButton>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

function GraphInspectorMinimizedTab({
  node,
  placement,
  onExpand,
}: {
  node: TokenGeneratorDocumentNode;
  placement: "top" | "bottom";
  onExpand: () => void;
}) {
  return (
    <div
      className={`tm-graph-inspector-tab-shell tm-graph-inspector-tab-shell--${placement} pointer-events-none`}
    >
      <button
        type="button"
        className="tm-graph-inspector-tab pointer-events-auto"
        onClick={(event) => {
          event.stopPropagation();
          onExpand();
        }}
        title={`Expand settings for ${node.label}`}
        aria-label={`Expand settings for ${node.label}`}
      >
        <PanelRight size={14} aria-hidden />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{node.label}</span>
          <span className="block truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
            {formatNodeKind(node.kind)}
          </span>
        </span>
      </button>
    </div>
  );
}

function ReviewIssueList({
  issues,
  onFocusIssue,
}: {
  issues: GraphIssue[];
  onFocusIssue: (issue: GraphIssue) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <section className="shrink-0 space-y-1">
      <h3 className="text-primary font-semibold text-[color:var(--color-figma-text)]">
        Needs attention
      </h3>
      {issues.map((issue) => (
        <button
          key={issue.id}
          type="button"
          onClick={() => onFocusIssue(issue)}
          className={`block w-full rounded px-2 py-1.5 text-left text-secondary ${
            issue.severity === "error"
              ? "text-[color:var(--color-figma-text-error)] hover:bg-[var(--surface-error)]"
              : "text-[color:var(--color-figma-text-warning)] hover:bg-[var(--surface-warning)]"
          }`}
        >
          {issue.message}
        </button>
      ))}
    </section>
  );
}

function readGeneratorOutputLabel(generator: TokenGeneratorDocument): string {
  const structured = readStructuredGeneratorDraft(generator);
  if (structured?.outputPrefix) return structured.outputPrefix;
  const destinations = readGeneratorDestinationLabels(generator);
  if (destinations.length === 0) return "No output";
  if (destinations.length === 1) return destinations[0];
  return `${destinations[0]} + ${destinations.length - 1} more`;
}

function readGeneratorDestinationSearchLabel(
  generator: TokenGeneratorDocument,
): string {
  const structured = readStructuredGeneratorDraft(generator);
  if (structured?.outputPrefix) return structured.outputPrefix;
  return readGeneratorDestinationLabels(generator).join(" ");
}

function readGeneratorDestinationLabels(
  generator: TokenGeneratorDocument,
): string[] {
  return generator.nodes
    .filter(isGeneratorOutputNode)
    .map((node) => String(node.data.pathPrefix ?? node.data.path ?? "").trim())
    .filter(Boolean);
}

function formatGeneratorListMetadata(
  generator: TokenGeneratorDocument,
  producedTokenCount: number | undefined,
): string {
  const inputCount = generator.nodes.filter(isGeneratorInputNode).length;
  const outputCount = generator.nodes.filter(isGeneratorOutputNode).length;
  const parts = [`${inputCount} in`, `${outputCount} out`];
  if (producedTokenCount !== undefined) {
    parts.push(
      `${producedTokenCount} ${producedTokenCount === 1 ? "token" : "tokens"}`,
    );
  }
  return parts.join(" · ");
}

function isGeneratorInputNode(node: TokenGeneratorDocumentNode): boolean {
  return node.kind === "tokenInput" || node.kind === "literal" || node.kind === "alias";
}

function isGeneratorOutputNode(node: TokenGeneratorDocumentNode): boolean {
  return node.kind === "groupOutput" || node.kind === "output";
}

function readGeneratorStatusLabel(generator: TokenGeneratorDocument): string {
  const diagnostics = generator.lastApplyDiagnostics ?? [];
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "Needs attention";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "Applied with warnings";
  }
  return generator.lastAppliedAt ? "Applied" : "Not applied";
}

function GeneratorOverviewPanel({
  generator,
  collections,
  perCollectionFlat,
  preview,
  graphIssues,
  onRename,
  onChangeNode,
  onAddNode,
  onFocusGraphIssue,
}: {
  generator: TokenGeneratorDocument;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  preview: TokenGeneratorPreviewResult | null;
  graphIssues: GraphIssue[];
  onRename: (name: string) => void;
  onChangeNode: (nodeId: string, data: Record<string, unknown>) => void;
  onAddNode: () => void;
  onFocusGraphIssue: (issue: GraphIssue) => void;
}) {
  const sourceNodes = generator.nodes.filter(isGeneratorInputNode);
  const outputNodes = generator.nodes.filter(isGeneratorOutputNode);
  const nodeGroups = overviewNodeGroups(generator.nodes);
  const hasGraphErrors = graphIssues.some((issue) => issue.severity === "error");
  const destinationLabel =
    outputNodes
      .map((node) => String(node.data.pathPrefix ?? node.data.path ?? ""))
      .filter(Boolean)
      .join(", ") ||
    "No output";
  const sourceLabel =
    sourceNodes
      .map((node) =>
        node.kind === "tokenInput" || node.kind === "alias"
          ? String(node.data.path ?? "").trim()
          : formatValue(node.data.value) || node.label,
      )
      .filter(Boolean)
      .join(", ") ||
    (generator.nodes.length === 0 ? "No nodes" : "Generated");
  const outputCount = preview?.outputs.length ?? 0;
  const outputSummary =
    hasGraphErrors
      ? "Fix settings to preview output"
      : outputCount > 0
        ? `${outputCount} ${outputCount === 1 ? "output" : "outputs"} ready to review`
        : "No generated output yet";
  return (
    <div className="min-w-0 shrink-0">
      <div className="space-y-3">
        <section className="tm-generator-overview">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="m-0 truncate text-body font-semibold text-[color:var(--color-figma-text)]">
                Generator
              </h2>
              <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                {outputSummary}
              </p>
            </div>
          </div>
          <div className="tm-generator-overview__facts">
            <span className="text-[color:var(--color-figma-text-secondary)]">
              Source
            </span>
            <span className="min-w-0 truncate font-medium text-[color:var(--color-figma-text)]" title={sourceLabel}>
              {sourceLabel}
            </span>
            <span className="text-[color:var(--color-figma-text-secondary)]">
              Output
            </span>
            <span className="min-w-0 truncate font-medium text-[color:var(--color-figma-text)]" title={destinationLabel}>
              {destinationLabel}
            </span>
          </div>
        </section>

        <ReviewIssueList issues={graphIssues} onFocusIssue={onFocusGraphIssue} />

        <section className="space-y-3">
          <h3 className="text-primary font-semibold text-[color:var(--color-figma-text)]">
            Configuration
          </h3>
          <GeneratorTextField
            label="Name"
            value={generator.name}
            onChange={onRename}
          />
          {generator.nodes.length === 0 ? (
            <div className="space-y-2 py-1">
              <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                Add nodes to define what this generator creates.
              </p>
              <Button type="button" size="sm" variant="secondary" onClick={onAddNode}>
                <Plus size={14} />
                Add node
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {nodeGroups.map((group) => (
                <OverviewNodeGroup
                  key={group.label}
                  label={group.label}
                  nodes={group.nodes}
                  allNodes={generator.nodes}
                  collections={collections}
                  perCollectionFlat={perCollectionFlat}
                  defaultCollectionId={generator.targetCollectionId}
                  edges={generator.edges}
                  onChangeNode={onChangeNode}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OverviewNodeGroup({
  label,
  nodes,
  allNodes,
  collections,
  perCollectionFlat,
  defaultCollectionId,
  edges,
  onChangeNode,
}: {
  label: string;
  nodes: TokenGeneratorDocumentNode[];
  allNodes: TokenGeneratorDocumentNode[];
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  defaultCollectionId: string;
  edges: TokenGeneratorEdge[];
  onChangeNode: (nodeId: string, data: Record<string, unknown>) => void;
}) {
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(
    () => new Set(nodes[0] ? [nodes[0].id] : []),
  );
  useEffect(() => {
    setOpenNodeIds((current) => {
      const validIds = new Set(nodes.map((node) => node.id));
      const next = new Set(
        Array.from(current).filter((nodeId) => validIds.has(nodeId)),
      );
      if (next.size === 0 && nodes[0]) {
        next.add(nodes[0].id);
      }
      return next;
    });
  }, [nodes]);

  if (nodes.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-primary font-semibold text-[color:var(--color-figma-text)]">
        {label}
      </h3>
      <div className="space-y-3">
        {nodes.map((node) => {
          const description = overviewNodeDescription(node);
          return (
            <details
              key={node.id}
              className="tm-generator-overview-node"
              open={openNodeIds.has(node.id)}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenNodeIds((current) => {
                  const next = new Set(current);
                  if (isOpen) {
                    next.add(node.id);
                  } else {
                    next.delete(node.id);
                  }
                  return next;
                });
              }}
            >
              <summary className="tm-generator-overview-node__summary">
                <span className="min-w-0">
                  <span className="tm-generator-overview-node__title">
                    {node.label}
                  </span>
                  <span className="tm-generator-overview-node__meta">
                    {formatNodeKind(node.kind)}
                    {description ? ` · ${description}` : ""}
                  </span>
                </span>
                <span className="tm-generator-overview-node__edit">Edit</span>
              </summary>
              <div className="tm-generator-overview-node__body">
                <NodeInspector
                  node={node}
                  collections={collections}
                  perCollectionFlat={perCollectionFlat}
                  defaultCollectionId={defaultCollectionId}
                  onChange={(data) => onChangeNode(node.id, data)}
                  showDelete={false}
                  showIdentity={false}
                  showHelp={false}
                  outputPathPrefix={readConnectedGroupOutputPrefix(node, allNodes, edges)}
                />
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function overviewNodeGroups(nodes: TokenGeneratorDocumentNode[]): Array<{
  label: string;
  nodes: TokenGeneratorDocumentNode[];
}> {
  return [
    { label: "Sources", nodes: nodes.filter(isGeneratorInputNode) },
    {
      label: "Steps",
      nodes: nodes.filter(
        (node) => !isGeneratorInputNode(node) && !isGeneratorOutputNode(node),
      ),
    },
    { label: "Outputs", nodes: nodes.filter(isGeneratorOutputNode) },
  ].filter((group) => group.nodes.length > 0);
}

function readConnectedGroupOutputPrefix(
  node: TokenGeneratorDocumentNode,
  nodes: TokenGeneratorDocumentNode[],
  edges: TokenGeneratorEdge[],
): string | undefined {
  const edge = edges.find((candidate) => {
    if (candidate.from.nodeId !== node.id) return false;
    const target = nodes.find((nodeCandidate) => nodeCandidate.id === candidate.to.nodeId);
    return target?.kind === "groupOutput";
  });
  if (!edge) return undefined;
  const targetNode = nodes.find((candidate) => candidate.id === edge.to.nodeId);
  if (targetNode?.kind !== "groupOutput") return undefined;
  const pathPrefix = String(targetNode.data.pathPrefix ?? "").trim();
  return pathPrefix || undefined;
}

function overviewNodeDescription(node: TokenGeneratorDocumentNode): string {
  if (node.kind === "groupOutput") {
    return String(node.data.pathPrefix ?? "").trim();
  }
  if (node.kind === "output") {
    return String(node.data.path ?? "").trim();
  }
  if (node.kind === "tokenInput" || node.kind === "alias") {
    return String(node.data.path ?? "").trim();
  }
  return nodeSummary(node);
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

function readGeneratorTokenRefs(value: unknown): GeneratorTokenRefs {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}

function allTokensForCollection(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  collectionId: string,
): Record<string, TokenMapEntry> {
  return perCollectionFlat[collectionId] ?? {};
}

function pathToCollectionIdMap(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [collectionId, tokens] of Object.entries(perCollectionFlat)) {
    for (const path of Object.keys(tokens)) {
      result[path] = collectionId;
    }
  }
  return result;
}

function countPreviewChanges(
  outputs: TokenGeneratorPreviewOutput[],
): PreviewChangeCounts {
  return outputs.reduce<PreviewChangeCounts>(
    (counts, output) => {
      if (output.collision) counts.collisions += 1;
      else if (output.change === "created") counts.created += 1;
      else if (output.change === "updated") counts.updated += 1;
      else counts.unchanged += 1;
      return counts;
    },
    { collisions: 0, created: 0, updated: 0, unchanged: 0 },
  );
}

function formatOutputChangeSummary(counts: PreviewChangeCounts): string {
  const parts: string[] = [];
  if (counts.collisions > 0) {
    parts.push(`${counts.collisions} need attention`);
  }
  if (counts.created > 0) {
    parts.push(`${counts.created} new`);
  }
  if (counts.updated > 0) {
    parts.push(`${counts.updated} updated`);
  }
  if (counts.unchanged > 0) {
    parts.push(`${counts.unchanged} same`);
  }
  return parts.length > 0 ? parts.join(", ") : "No output changes";
}

function GeneratorDocumentNode({ data, selected }: NodeProps<GraphFlowNode>) {
  const graphNode = data.graphNode;
  const relatedOutputs =
    data.preview?.outputs.filter((output) => output.nodeId === graphNode.id) ??
    [];
  const nodePreview = data.preview?.nodePreviews[graphNode.id];
  const diagnostics =
    (data.preview?.nodePreviewDiagnostics ?? []).filter(
      (diagnostic) => diagnostic.nodeId === graphNode.id,
    );
  const issues = data.issues ?? [];
  const issueMessages = uniqueStrings([
    ...issues.map((issue) => issue.message),
    ...diagnostics.map((diagnostic) => diagnostic.message),
  ]);
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
  const issueCountLabel =
    issueMessages.length === 1
      ? hasErrors
        ? "1 issue"
        : "1 warning"
      : hasErrors
        ? `${issueMessages.length} issues`
        : `${issueMessages.length} warnings`;
  const issueTitle = issueMessages.join("\n");
  const nodeStyle: CSSProperties & { "--tm-graph-node-accent": string } = {
    minBlockSize: graphNodeMinBlockSize(inputPorts.length, outputPorts.length),
    "--tm-graph-node-accent": graphNodeAccent(graphNode),
  };
  const isOutputNode =
    graphNode.kind === "output" || graphNode.kind === "groupOutput";
  const detailsExpanded = Boolean(data.detailsExpanded);
  const hasIssues = issueMessages.length > 0;
  const detailsLabel = hasIssues
    ? "details"
    : isOutputNode
      ? "output preview"
      : "preview";

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
            <div
              className={`tm-graph-node__issue-count ${
                hasErrors
                  ? "tm-graph-node__issue-count--error"
                  : "tm-graph-node__issue-count--warning"
              }`}
              title={issueTitle}
            >
              <AlertTriangle size={13} />
              <span>{issueCountLabel}</span>
            </div>
          )}
        </div>
        <div className="tm-graph-node__summary" title={summary}>
          {summary}
        </div>
        <CompactNodePreview
          isOutputNode={isOutputNode}
          nodePreview={nodePreview}
          outputs={relatedOutputs}
          modeNames={data.preview?.targetModes ?? []}
          previewReady={Boolean(data.preview)}
        />
        <button
          type="button"
          className="tm-graph-node__details-toggle nodrag nopan"
          aria-expanded={detailsExpanded}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleDetailsExpanded?.(graphNode.id);
          }}
        >
          {detailsExpanded ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )}
          <span>
            {detailsExpanded ? `Hide ${detailsLabel}` : `Show ${detailsLabel}`}
          </span>
        </button>
        {detailsExpanded && hasIssues ? (
          <NodeIssueList messages={issueMessages} hasErrors={hasErrors} />
        ) : null}
        {isOutputNode && detailsExpanded ? (
          <OutputNodeResults
            outputs={relatedOutputs}
            diagnostics={diagnostics}
            issues={issues}
            previewReady={Boolean(data.preview)}
            modeNames={data.preview?.targetModes ?? []}
          />
        ) : null}
        {!isOutputNode && detailsExpanded ? (
          nodePreview ? (
            <NodeRuntimePreview
              preview={nodePreview}
              modeNames={data.preview?.targetModes ?? []}
            />
          ) : (
            <NodePreviewPending />
          )
        ) : null}
      </div>
    </div>
  );
}

function OutputNodeResults({
  outputs,
  diagnostics,
  issues,
  previewReady,
  modeNames,
}: {
  outputs: TokenGeneratorPreviewOutput[];
  diagnostics: TokenGeneratorPreviewResult["diagnostics"];
  issues: GraphIssue[];
  previewReady: boolean;
  modeNames: string[];
}) {
  const sortedOutputs = sortPreviewOutputs(outputs);
  const visibleOutputs = sortedOutputs.slice(0, 5);
  const hiddenOutputCount = Math.max(
    0,
    sortedOutputs.length - visibleOutputs.length,
  );
  const issueCount = [
    ...issues.filter((issue) => issue.severity === "error"),
    ...diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
  ].length + outputs.filter((output) => output.collision).length;
  const hasBlockingIssues = issueCount > 0;

  return (
    <div className="tm-graph-node__result nowheel nodrag nopan">
      <div className="tm-graph-node__result-header">
        <span className="tm-graph-node__result-summary">
          {!previewReady
            ? "Output preview"
            : outputs.length === 0
            ? "No generated tokens"
            : `${outputs.length} generated ${outputs.length === 1 ? "token" : "tokens"}`}
        </span>
      </div>
      {!previewReady ? (
        <div className="tm-graph-node__result-empty">
          Preparing preview.
        </div>
      ) : outputs.length === 0 ? (
        <div className="tm-graph-node__result-empty">
          {hasBlockingIssues
            ? "Resolve issues to preview output."
            : "Connect a value and wait for preview."}
        </div>
      ) : (
        <div className="tm-graph-node__result-list">
          {visibleOutputs.map((output) => (
            <OutputPreviewRow
              key={output.path}
              output={output}
              modeNames={modeNames}
            />
          ))}
          {hiddenOutputCount > 0 ? (
            <div className="tm-graph-node__result-more">
              {hiddenOutputCount} more outputs
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CompactNodePreview({
  isOutputNode,
  nodePreview,
  outputs,
  modeNames,
  previewReady,
}: {
  isOutputNode: boolean;
  nodePreview?: TokenGeneratorPreviewResult["nodePreviews"][string];
  outputs: TokenGeneratorPreviewOutput[];
  modeNames: string[];
  previewReady: boolean;
}) {
  if (isOutputNode) {
    const firstOutput = outputs[0];
    const label = !previewReady
      ? "Preparing preview"
      : outputs.length === 0
        ? "No generated tokens"
        : `${outputs.length} ${outputs.length === 1 ? "token" : "tokens"}`;
    return (
      <div className="tm-graph-node__compact-preview" title={firstOutput?.path ?? label}>
        <div className="tm-graph-node__compact-preview-row">
          <span className="tm-graph-node__mode-name">Output</span>
          <span className="tm-graph-node__compact-output-value">
            <span className="tm-graph-node__result-summary">{label}</span>
            {firstOutput ? (
              <span className="tm-graph-node__compact-output-path">
                {firstOutput.path}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    );
  }
  if (!nodePreview) {
    return (
      <div className="tm-graph-node__compact-preview tm-graph-node__compact-preview--empty">
        {previewReady ? "No preview" : "Preparing preview"}
      </div>
    );
  }
  const modes = modeNames.length > 0 ? modeNames : Object.keys(nodePreview.modeValues);
  return (
    <div className="tm-graph-node__compact-preview">
      {modes.length > 0 ? (
        modes.map((modeName) => (
          <div key={modeName} className="tm-graph-node__compact-preview-row">
            <span className="tm-graph-node__mode-name">{modeName}</span>
            <CompactRuntimeValue value={nodePreview.modeValues[modeName]} />
          </div>
        ))
      ) : (
        <div className="tm-graph-node__compact-preview--empty">No preview</div>
      )}
    </div>
  );
}

function CompactRuntimeValue({
  value,
}: {
  value: TokenGeneratorNodePreviewValue | undefined,
}) {
  if (!value) return <ModeValueLine value={undefined} />;
  if (value.kind === "scalar") {
    return <ModeValueLine type={value.type} value={value.value} />;
  }
  if (value.kind === "list") {
    const first = value.values[0];
    if (!first) {
      return (
        <span className="tm-graph-node__mode-value">
          <span className="tm-graph-node__mode-value-text">Empty series</span>
        </span>
      );
    }
    const label = `${value.values.length} ${value.values.length === 1 ? "item" : "items"}`;
    const title = `${label}, first ${formatValue(first.value) || "No value"}`;
    return (
      <span className="tm-graph-node__mode-value" title={title}>
        {previewIsValueBearing(first.type ?? value.type) ? (
          <ValuePreview type={first.type ?? value.type} value={first.value} size={16} />
        ) : null}
        <span className="tm-graph-node__mode-value-text">{label}</span>
      </span>
    );
  }
  return <ModeValueLine value={undefined} />;
}

function NodeIssueList({
  messages,
  hasErrors,
}: {
  messages: string[];
  hasErrors: boolean;
}) {
  return (
    <div
      className={`tm-graph-node__issues ${
        hasErrors
          ? "tm-graph-node__issues--error"
          : "tm-graph-node__issues--warning"
      }`}
    >
      {messages.map((message) => (
        <div key={message} className="tm-graph-node__issue-message">
          {message}
        </div>
      ))}
    </div>
  );
}

function OutputPreviewRow({
  output,
  modeNames,
}: {
  output: TokenGeneratorPreviewOutput;
  modeNames: string[];
}) {
  const modes = modeNames.length > 0 ? modeNames : Object.keys(output.modeValues);
  return (
    <div
      className={`tm-graph-node__result-row ${
        output.collision ? "tm-graph-node__result-row--warning" : ""
      }`}
    >
      <div className="tm-graph-node__result-path" title={output.path}>
        {output.path}
      </div>
      <div
        className={`tm-graph-node__result-change ${
          output.collision ? "tm-graph-node__result-change--warning" : ""
        }`}
      >
        {output.collision ? "manual token" : output.change}
      </div>
      <ModeValueStack
        modeNames={modes}
        values={output.modeValues}
        type={output.type}
      />
    </div>
  );
}

function NodePreviewPending() {
  return (
    <div className="tm-graph-node__result tm-graph-node__result--intermediate nowheel nodrag nopan">
      <div className="tm-graph-node__result-empty">
        Preparing preview.
      </div>
    </div>
  );
}

function NodeRuntimePreview({
  preview,
  modeNames,
}: {
  preview: { modeValues: Record<string, TokenGeneratorNodePreviewValue> };
  modeNames: string[];
}) {
  const modes =
    modeNames.length > 0 ? modeNames : Object.keys(preview.modeValues);
  return (
    <div className="tm-graph-node__result tm-graph-node__result--intermediate nowheel nodrag nopan">
      <div className="tm-graph-node__result-header">
        <span className="tm-graph-node__result-summary">Preview</span>
      </div>
      <div className="tm-graph-node__result-list">
        {modes.map((modeName) => {
          const value = preview.modeValues[modeName];
          return (
            <div key={modeName} className="tm-graph-node__runtime-mode">
              <div className="tm-graph-node__runtime-mode-name">
                {modeName}
              </div>
              {!value ? (
                <ModeValueLine value={undefined} />
              ) : value.kind === "scalar" ? (
                <ModeValueLine
                  type={value.type}
                  value={value.value}
                />
              ) : (
                <div className="tm-graph-node__runtime-list">
                  {value.values.slice(0, 3).map((item) => (
                    <div key={item.key} className="tm-graph-node__runtime-item">
                      <span
                        className="tm-graph-node__runtime-item-label"
                        title={item.label}
                      >
                        {item.label}
                      </span>
                      <ModeValueLine
                        type={item.type ?? value.type}
                        value={item.value}
                      />
                    </div>
                  ))}
                  {value.values.length > 3 ? (
                    <div className="tm-graph-node__output-more">
                      +{value.values.length - 3} more
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModeValueStack({
  modeNames,
  values,
  type,
}: {
  modeNames: string[];
  values: Record<string, unknown>;
  type?: string;
}) {
  return (
    <div className="tm-graph-node__mode-stack">
      {modeNames.map((modeName) => (
        <div key={modeName} className="tm-graph-node__mode-line">
          <span className="tm-graph-node__mode-name">{modeName}</span>
          <ModeValueLine type={type} value={values[modeName]} />
        </div>
      ))}
    </div>
  );
}

function ModeValueLine({
  type,
  value,
}: {
  type?: string;
  value: unknown;
}) {
  return (
    <span className="tm-graph-node__mode-value">
      {previewIsValueBearing(type) ? (
        <ValuePreview type={type} value={value} size={16} />
      ) : null}
      <span className="tm-graph-node__mode-value-text" title={formatValue(value)}>
        {formatValue(value) || "No value"}
      </span>
    </span>
  );
}

function sortPreviewOutputs(
  outputs: TokenGeneratorPreviewOutput[],
): TokenGeneratorPreviewOutput[] {
  const changeRank: Record<TokenGeneratorPreviewOutput["change"], number> = {
    updated: 0,
    created: 1,
    unchanged: 2,
  };
  return outputs
    .map((output, index) => ({ output, index }))
    .sort((a, b) => {
      if (a.output.collision !== b.output.collision) {
        return a.output.collision ? -1 : 1;
      }
      const changeDelta =
        changeRank[a.output.change] - changeRank[b.output.change];
      if (changeDelta !== 0) return changeDelta;
      return a.index - b.index;
    })
    .map(({ output }) => output);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
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
  return Math.max(92, 54 + portCount * 26);
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
      return "Series output";
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
  showDelete = true,
  showIdentity = true,
  showHelp = true,
  outputPathPrefix,
}: {
  node: TokenGeneratorDocumentNode;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  defaultCollectionId: string;
  onChange: (data: Record<string, unknown>) => void;
  onDelete?: () => void;
  showDelete?: boolean;
  showIdentity?: boolean;
  showHelp?: boolean;
  outputPathPrefix?: string;
}) {
  const selectedCollectionId =
    node.kind === "alias"
      ? defaultCollectionId
      : String(node.data.collectionId ?? defaultCollectionId);
  const nodeRefs = readGeneratorTokenRefs(node.data.$tokenRefs);
  const allTokensFlat = allTokensForCollection(perCollectionFlat, defaultCollectionId);
  const pathToCollectionId = pathToCollectionIdMap(perCollectionFlat);
  const field = (key: string, label: string, type = "text") => (
    type === "number" ? (
      <GeneratorNumberField
        label={label}
        value={node.data[key]}
        onChange={(value) => onChange({ [key]: value })}
      />
    ) : (
      <GeneratorTextField
        label={label}
        value={node.data[key]}
        onChange={(value) => onChange({ [key]: value })}
      />
    )
  );

  return (
    <div className="space-y-3">
      {showIdentity ? (
        <label className="block">
          <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
            Name
          </span>
          <input
            value={node.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className="tm-generator-field text-secondary"
          />
        </label>
      ) : null}
      {showHelp ? <NodeInspectorNote node={node} /> : null}
      {node.kind === "tokenInput" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
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
              className="tm-generator-field text-secondary"
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.id}
                </option>
              ))}
            </select>
          </label>
          <FieldBlock label="Token">
            <GeneratorTokenPicker
              value={String(node.data.path ?? "")}
              collectionId={selectedCollectionId}
              collections={collections}
              perCollectionFlat={perCollectionFlat}
              onChange={(path) => onChange({ path })}
            />
          </FieldBlock>
        </>
      )}
      {node.kind === "alias" && (
        <FieldBlock label="Token">
          <GeneratorTokenPicker
            value={String(node.data.path ?? "")}
            collectionId={selectedCollectionId}
            collections={collections}
            perCollectionFlat={perCollectionFlat}
            onChange={(path) => onChange({ path })}
          />
        </FieldBlock>
      )}
      {node.kind === "literal" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
              Type
            </span>
            <select
              value={String(node.data.type ?? "string")}
              onChange={(event) => onChange({ type: event.target.value })}
              className="tm-generator-field text-secondary"
            >
              <option value="color">Color</option>
              <option value="number">Number</option>
              <option value="dimension">Dimension</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>
          </label>
          <ReferenceableField
            fieldKey="value"
            refs={nodeRefs}
            collectionId={defaultCollectionId}
            collections={collections}
            perCollectionFlat={perCollectionFlat}
            tokenTypes={
              node.data.type === "dimension"
                ? ["dimension", "number"]
                : node.data.type === "number"
                  ? ["number", "dimension"]
                  : typeof node.data.type === "string"
                    ? [node.data.type]
                    : undefined
            }
            onRefsChange={($tokenRefs) => onChange({ $tokenRefs })}
          >
            {node.data.type === "color" ? (
              <GeneratorColorField
                label="Value"
                value={node.data.value}
                allTokensFlat={allTokensFlat}
                onChange={(value) => onChange({ value })}
              />
            ) : node.data.type === "dimension" ? (
              <GeneratorDimensionField
                label="Value"
                value={node.data.value}
                unit={node.data.unit}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
                onChange={(dimension) => onChange({ value: dimension.value, unit: dimension.unit })}
              />
            ) : node.data.type === "number" ? (
              <GeneratorNumberField
                label="Value"
                value={node.data.value}
                onChange={(value) => onChange({ value })}
              />
            ) : node.data.type === "boolean" ? (
              <GeneratorBooleanField
                label="Value"
                value={node.data.value}
                onChange={(value) => onChange({ value })}
              />
            ) : (
              <GeneratorTextField
                label="Value"
                value={node.data.value}
                onChange={(value) => onChange({ value })}
              />
            )}
          </ReferenceableField>
        </>
      )}
      {node.kind === "math" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
              Operation
            </span>
            <select
              value={String(node.data.operation ?? "add")}
              onChange={(event) => onChange({ operation: event.target.value })}
              className="tm-generator-field text-secondary"
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
            <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
              Operation
            </span>
            <select
              value={String(node.data.operation ?? "lighten")}
              onChange={(event) => onChange({ operation: event.target.value })}
              className="tm-generator-field text-secondary"
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
              <GeneratorColorField
                label="Mix with"
                value={node.data.mixWith}
                allTokensFlat={allTokensFlat}
                onChange={(mixWith) => onChange({ mixWith })}
              />
              {field("ratio", "Ratio", "number")}
            </>
          )}
        </>
      )}
      {node.kind === "formula" && (
        <GeneratorFormulaField
          label="Formula"
          value={node.data.expression}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          onChange={(expression) => onChange({ expression })}
        />
      )}
      {node.kind === "colorRamp" && (
        <>
          <div className="grid gap-2 min-[420px]:grid-cols-2">
            <ReferenceableField
              fieldKey="lightEnd"
              refs={nodeRefs}
              collectionId={defaultCollectionId}
              collections={collections}
              perCollectionFlat={perCollectionFlat}
              tokenTypes={["number", "dimension"]}
              onRefsChange={($tokenRefs) => onChange({ $tokenRefs })}
            >
              {field("lightEnd", "Light end", "number")}
            </ReferenceableField>
            <ReferenceableField
              fieldKey="darkEnd"
              refs={nodeRefs}
              collectionId={defaultCollectionId}
              collections={collections}
              perCollectionFlat={perCollectionFlat}
              tokenTypes={["number", "dimension"]}
              onRefsChange={($tokenRefs) => onChange({ $tokenRefs })}
            >
              {field("darkEnd", "Dark end", "number")}
            </ReferenceableField>
          </div>
          <ReferenceableField
            fieldKey="chromaBoost"
            refs={nodeRefs}
            collectionId={defaultCollectionId}
            collections={collections}
            perCollectionFlat={perCollectionFlat}
            tokenTypes={["number", "dimension"]}
            onRefsChange={($tokenRefs) => onChange({ $tokenRefs })}
          >
            {field("chromaBoost", "Chroma", "number")}
          </ReferenceableField>
          <NumberStepTable
            label="Steps"
            values={asNumberArray(node.data.steps)}
            pathPrefix={outputPathPrefix}
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "spacingScale" && (
        <>
          <GeneratorUnitField
            label="Unit"
            value={node.data.unit}
            onChange={(unit) => onChange({ unit })}
          />
          <NamedNumberStepTable
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "multiplier")}
            valueKey="multiplier"
            pathPrefix={outputPathPrefix}
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "typeScale" && (
        <>
          <ReferenceableField
            fieldKey="ratio"
            refs={nodeRefs}
            collectionId={defaultCollectionId}
            collections={collections}
            perCollectionFlat={perCollectionFlat}
            tokenTypes={["number", "dimension"]}
            onRefsChange={($tokenRefs) => onChange({ $tokenRefs })}
          >
            {field("ratio", "Ratio", "number")}
          </ReferenceableField>
          <GeneratorUnitField
            label="Unit"
            value={node.data.unit}
            onChange={(unit) => onChange({ unit })}
          />
          {field("baseStep", "Base step")}
          {field("roundTo", "Round to", "number")}
          <NamedNumberStepTable
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "exponent")}
            valueKey="exponent"
            pathPrefix={outputPathPrefix}
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "borderRadiusScale" && (
        <>
          <GeneratorUnitField
            label="Unit"
            value={node.data.unit}
            onChange={(unit) => onChange({ unit })}
          />
          <NamedNumberStepTable
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "multiplier")}
            valueKey="multiplier"
            optionalValueKey="exactValue"
            pathPrefix={outputPathPrefix}
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "opacityScale" && (
        <NamedNumberStepTable
          label="Steps"
          values={asNamedNumberSteps(node.data.steps, "value")}
          valueKey="value"
          pathPrefix={outputPathPrefix}
          onChange={(steps) => onChange({ steps })}
        />
      )}
      {node.kind === "shadowScale" && (
        <>
          <ReferenceableField
            fieldKey="color"
            refs={nodeRefs}
            collectionId={defaultCollectionId}
            collections={collections}
            perCollectionFlat={perCollectionFlat}
            tokenTypes={["color"]}
            onRefsChange={($tokenRefs) => onChange({ $tokenRefs })}
          >
            <GeneratorColorField
              label="Color"
              value={node.data.color}
              allTokensFlat={allTokensFlat}
              onChange={(color) => onChange({ color })}
            />
          </ReferenceableField>
          <ShadowStepTable
            values={asRecordArray(node.data.steps)}
            pathPrefix={outputPathPrefix}
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "zIndexScale" && (
        <NamedNumberStepTable
          label="Steps"
          values={asNamedNumberSteps(node.data.steps, "value")}
          valueKey="value"
          pathPrefix={outputPathPrefix}
          onChange={(steps) => onChange({ steps })}
        />
      )}
      {node.kind === "customScale" && (
        <>
          <label className="block">
            <span className="mb-1 block text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
              Output type
            </span>
            <select
              value={String(node.data.outputType ?? "number")}
              onChange={(event) => onChange({ outputType: event.target.value })}
              className="tm-generator-field text-secondary"
            >
              <option value="number">Number</option>
              <option value="dimension">Dimension</option>
            </select>
          </label>
          <GeneratorUnitField
            label="Unit"
            value={node.data.unit}
            onChange={(unit) => onChange({ unit })}
          />
          <GeneratorFormulaField
            label="Formula"
            value={node.data.formula}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            onChange={(formula) => onChange({ formula })}
          />
          {field("roundTo", "Round to", "number")}
          <NamedNumberStepTable
            label="Steps"
            values={asNamedNumberSteps(node.data.steps, "index")}
            valueKey="index"
            optionalValueKey="multiplier"
            pathPrefix={outputPathPrefix}
            onChange={(steps) => onChange({ steps })}
          />
        </>
      )}
      {node.kind === "list" && (
        <GeneratorListValueEditor
          type={String(node.data.type ?? "number")}
          items={Array.isArray(node.data.items) ? node.data.items : []}
          collectionId={defaultCollectionId}
          collections={collections}
          perCollectionFlat={perCollectionFlat}
          onTypeChange={(type, items) => onChange({ type, items })}
          onChange={(items) => onChange({ items })}
        />
      )}
      {(node.kind === "output" || node.kind === "groupOutput") &&
        <GeneratorPathField
          label={node.kind === "output" ? "Token path" : "Series path"}
          value={node.kind === "output" ? node.data.path : node.data.pathPrefix}
          series={node.kind === "groupOutput"}
          onChange={(value) =>
            onChange({ [node.kind === "output" ? "path" : "pathPrefix"]: value })
          }
        />}
      {showDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-secondary font-medium text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          <Trash2 size={14} />
          Delete node
        </button>
      ) : null}
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

function NodeInspectorNote({ node }: { node: TokenGeneratorDocumentNode }) {
  const note = nodeInspectorNote(node);
  if (!note) return null;
  return (
    <p className="m-0 rounded-md bg-[var(--surface-muted)] px-2 py-1.5 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
      {note}
    </p>
  );
}

function nodeInspectorNote(node: TokenGeneratorDocumentNode): string | null {
  if (node.kind === "output") {
    return "Use this when the graph ends in one value. It creates one token at the path below.";
  }
  if (node.kind === "groupOutput") {
    return "Use this for ramps and scales. It creates one token per item in the connected series.";
  }
  if (getNodeOutputPorts(node).some((port) => port.shape === "list")) {
    return "This node outputs a series. Connect it to Series output to create one token per item.";
  }
  return null;
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
  if (port.type === "any") {
    return port.shape === "list" ? "series" : "value";
  }
  return port.shape === "list" ? `${port.type} series` : port.type;
}

function PreviewPanel({
  preview,
  targetCollection,
  focusedDiagnosticId,
  compact = false,
  onNavigateToToken,
}: {
  preview: TokenGeneratorPreviewResult | null;
  targetCollection: TokenCollection | undefined;
  focusedDiagnosticId?: string;
  compact?: boolean;
  onNavigateToToken: (path: string) => void;
}) {
  if (!preview) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--color-figma-bg-secondary)_34%,var(--color-figma-bg))] p-3 text-center text-secondary text-[color:var(--color-figma-text-secondary)] ${
          compact ? "min-h-[120px]" : "min-h-[220px]"
        }`}
      >
        Preparing output preview.
      </div>
    );
  }
  const modes =
    targetCollection?.modes.map((mode) => mode.name) ?? preview.targetModes;
  const outputGroups = groupPreviewOutputs(preview.outputs);
  const focusedDiagnostic = preview.diagnostics.find(
    (diagnostic) => diagnostic.id === focusedDiagnosticId,
  );
  const changeCounts = countPreviewChanges(preview.outputs);
  return (
    <div className="space-y-3">
      <PreviewChangeSummary counts={changeCounts} compact={compact} />
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
              <span className="text-[color:var(--color-figma-text-secondary)]">
                {" "}
                - {diagnostic.message}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {preview.outputs.length === 0 ? (
          <div className="rounded-md bg-[var(--color-figma-bg-secondary)] p-2 text-secondary text-[color:var(--color-figma-text-error)]">
            No tokens will be created. Adjust the generator and wait for the
            preview to refresh.
          </div>
        ) : null}
        {outputGroups.map((group) => (
          <section key={group.id} className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-secondary font-semibold text-[color:var(--color-figma-text)]">
                {group.label}
              </h3>
              <span className="text-tertiary text-[color:var(--color-figma-text-secondary)]">
                {group.outputs.length}
              </span>
            </div>
            {compact ? (
              <PreviewOutputStack
                outputs={group.outputs}
                modes={modes}
                focusedNodeId={focusedDiagnostic?.nodeId}
                onNavigateToToken={onNavigateToToken}
              />
            ) : (
              <div className="overflow-x-auto rounded-md bg-[var(--color-figma-bg-secondary)]">
                <table className="min-w-full border-separate border-spacing-0 text-left text-secondary">
                  <thead>
                    <tr className="text-tertiary text-[color:var(--color-figma-text-secondary)]">
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
                            <span className="mt-1 block text-tertiary text-[color:var(--color-figma-text-error)]">
                              Manual token exists
                            </span>
                          ) : null}
                        </td>
                        {modes.map((modeName) => (
                          <td
                            key={modeName}
                            className="px-2 py-2 align-top text-[color:var(--color-figma-text)]"
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
                              ? "text-[color:var(--color-figma-text-error)]"
                              : "text-[color:var(--color-figma-text-secondary)]"
                          }`}
                        >
                          {output.collision ? "manual token" : output.change}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        {preview.outputs.length === 0 && (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            No outputs yet. Add an output node and connect a value.
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewChangeSummary({
  counts,
  compact,
}: {
  counts: PreviewChangeCounts;
  compact: boolean;
}) {
  const items = [
    {
      label: "Attention",
      value: counts.collisions,
      tone: "error",
      hidden: counts.collisions === 0,
    },
    { label: "New", value: counts.created, tone: "success", hidden: false },
    { label: "Updated", value: counts.updated, tone: "accent", hidden: false },
    { label: "Same", value: counts.unchanged, tone: "muted", hidden: false },
  ] as const;
  const toneClass: Record<(typeof items)[number]["tone"], string> = {
    error: "bg-[color-mix(in_srgb,var(--color-figma-error)_12%,var(--color-figma-bg-secondary))] text-[color:var(--color-figma-text-error)]",
    success: "bg-[color-mix(in_srgb,var(--color-figma-success)_16%,var(--color-figma-bg-secondary))] text-[color:var(--color-figma-text-success)]",
    accent: "bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,var(--color-figma-bg-secondary))] text-[color:var(--color-figma-text-accent)]",
    muted: "bg-[var(--surface-muted)] text-[color:var(--color-figma-text-secondary)]",
  };

  return (
    <div
      className={`grid gap-1.5 ${
        compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fit,minmax(96px,1fr))]"
      }`}
    >
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <div
            key={item.label}
            className={`rounded-md px-2 py-1.5 ${toneClass[item.tone]}`}
          >
            <div className="text-primary font-semibold leading-tight">
              {item.value}
            </div>
            <div className="truncate text-tertiary font-medium leading-tight">
              {item.label}
            </div>
          </div>
        ))}
    </div>
  );
}

function PreviewOutputStack({
  outputs,
  modes,
  focusedNodeId,
  onNavigateToToken,
}: {
  outputs: TokenGeneratorPreviewOutput[];
  modes: string[];
  focusedNodeId?: string;
  onNavigateToToken: (path: string) => void;
}) {
  return (
    <div className="space-y-1">
      {outputs.map((output) => (
        <div
          key={output.path}
          className={`rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-2 text-secondary ${
            focusedNodeId === output.nodeId
              ? "ring-1 ring-[var(--color-figma-accent)]"
              : ""
          }`}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {output.change === "created" ? (
                <span className="block truncate font-semibold text-[color:var(--color-figma-text)]">
                  {output.path}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigateToToken(output.path)}
                  className="block max-w-full truncate text-left font-semibold text-[color:var(--color-figma-text)] hover:underline"
                >
                  {output.path}
                </button>
              )}
              {output.collision ? (
                <span className="mt-1 block text-tertiary text-[color:var(--color-figma-text-error)]">
                  Manual token exists
                </span>
              ) : null}
            </div>
            <span
              className={`shrink-0 text-tertiary ${
                output.collision
                  ? "text-[color:var(--color-figma-text-error)]"
                  : "text-[color:var(--color-figma-text-secondary)]"
              }`}
            >
              {output.collision ? "manual" : output.change}
            </span>
          </div>
          <div className="mt-2 grid gap-1">
            {modes.map((modeName) => (
              <div
                key={modeName}
                className="flex min-w-0 items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
                  {modeName}
                </span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-[color:var(--color-figma-text)]">
                  {previewIsValueBearing(output.type) ? (
                    <ValuePreview
                      type={output.type}
                      value={output.modeValues[modeName]}
                      size={13}
                    />
                  ) : null}
                  <span className="truncate text-right">
                    {formatValue(output.modeValues[modeName])}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
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

function previewRelevantNodes(nodes: TokenGeneratorDocumentNode[]) {
  return nodes.map(({ position: _position, ...node }) => node);
}

function toFlowNodes(
  generator: TokenGeneratorDocument,
  preview: TokenGeneratorPreviewResult | null,
  issues: GraphIssue[] = [],
  expandedNodeIds: Set<string> = new Set(),
  onToggleDetailsExpanded?: (nodeId: string) => void,
): GraphFlowNode[] {
  return generator.nodes.map((graphNode) => ({
    id: graphNode.id,
    type: "graphNode",
    position: graphNode.position,
    data: {
      graphNode,
      preview: preview ?? undefined,
      issues: issues.filter((issue) => issue.nodeId === graphNode.id),
      detailsExpanded: expandedNodeIds.has(graphNode.id),
      onToggleDetailsExpanded,
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

function changesOnlyCommitNodePositions(
  changes: NodeChange<GraphFlowNode>[],
): boolean {
  return (
    changes.length > 0 &&
    changes.every(
      (change) =>
        change.type === "position" && Boolean(change.dragging === false),
    )
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
    return palette.filter((item) => {
      if (item.category === "Inputs" || item.category === "Scales") {
        return true;
      }
      return item.category === "Outputs";
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

function nodeSummary(node: TokenGeneratorDocumentNode): string {
  if (node.kind === "tokenInput")
    return String(node.data.path || "Choose token");
  if (node.kind === "literal") return formatValue(node.data.value);
  if (node.kind === "math")
    return `${node.data.operation ?? "add"} ${node.data.amount ?? ""}`.trim();
  if (node.kind === "color") return String(node.data.operation ?? "lighten");
  if (node.kind === "formula") return String(node.data.expression ?? "Formula");
  if (node.kind === "colorRamp") return "Mode-aware color series";
  if (node.kind === "spacingScale") return "Spacing series";
  if (node.kind === "typeScale") return "Type series";
  if (node.kind === "borderRadiusScale") return "Radius series";
  if (node.kind === "opacityScale") return "Opacity series";
  if (node.kind === "shadowScale") return "Shadow series";
  if (node.kind === "zIndexScale") return "Z-index series";
  if (node.kind === "customScale") return "Formula series";
  if (node.kind === "output") return String(node.data.path || "Output path");
  if (node.kind === "groupOutput")
    return String(node.data.pathPrefix || "Output series");
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
