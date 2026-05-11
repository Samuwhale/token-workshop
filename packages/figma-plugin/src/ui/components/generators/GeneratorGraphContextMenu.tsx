import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type {
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
} from "@token-workshop/core";
import type { GeneratorPaletteItem } from "./GeneratorWorkspacePanels";
import {
  firstCompatibleEdge,
  flowNodeFromPaletteItem,
  getNodeInputPorts,
  getNodeOutputPorts,
  type GraphFlowEdge,
  type GraphFlowNode,
} from "./generatorGraphFlow";

export interface GraphMenuPoint {
  x: number;
  y: number;
  flowPosition: TokenGeneratorDocumentNode["position"];
}

export type GraphMenuState =
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

interface GeneratorGraphContextMenuProps {
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
}

export function GeneratorGraphContextMenu({
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
}: GeneratorGraphContextMenuProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const edge =
    "edgeId" in menu ? edges.find((item) => item.id === menu.edgeId) : null;
  const node =
    menu.kind === "node"
      ? (nodes.find((item) => item.id === menu.nodeId)?.data.graphNode ?? null)
      : null;
  const existingCandidates = existingConnectionCandidates(
    generator,
    nodes,
    edges,
    menu,
  );
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
            <Search
              size={13}
              className="text-[color:var(--color-figma-text-secondary)]"
            />
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
              Insert before this node
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
              Add after this node
            </GraphMenuAction>
            <GraphMenuAction onClick={() => onDuplicateNode(node.id)}>
              Duplicate
            </GraphMenuAction>
            <GraphMenuAction
              tone="danger"
              onClick={() => onDeleteNode(node.id)}
            >
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
              Change incoming connection
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
              Change outgoing connection
            </GraphMenuAction>
            <GraphMenuAction
              tone="danger"
              onClick={() => onDeleteEdge(edge.id)}
            >
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
          <GraphMenuGroup
            title={existingCandidates.length > 0 ? "New nodes" : "Nodes"}
          >
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
  if (
    menu.kind !== "connect-from-output" &&
    menu.kind !== "connect-to-input" &&
    menu.kind !== "edge-insert"
  ) {
    return false;
  }
  const candidateId = `candidate_${item.kind}`;
  const candidateNode = flowNodeFromPaletteItem(
    item,
    candidateId,
    menu.flowPosition,
  );
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
