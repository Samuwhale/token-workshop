import type {
  GraphEdge,
  GraphModel,
  GraphNode,
  GraphNodeId,
} from "@tokenmanager/core";

interface GraphSROutlineProps {
  graph: GraphModel;
  focusNodeId: GraphNodeId | null;
}

/**
 * Screen-reader fallback for the canvas. Renders an offscreen list of the
 * focused node's incoming and outgoing neighbors so that keyboard-only users
 * can navigate the dependency graph even when the visual canvas is hidden.
 */
export function GraphSROutline({ graph, focusNodeId }: GraphSROutlineProps) {
  if (!focusNodeId) return null;
  const focused = graph.nodes.get(focusNodeId);
  if (!focused) return null;

  const incoming = getEdges(graph, graph.incoming.get(focusNodeId));
  const outgoing = getEdges(graph, graph.outgoing.get(focusNodeId));
  const sections = (
    focused.kind === "generator"
      ? [
          {
            title: "Source token",
            nodes: collectNodes(graph, incoming, "generator-source", "from"),
          },
          {
            title: "Produces",
            nodes: collectNodes(graph, outgoing, "generator-produces", "to"),
          },
        ]
      : [
          {
            title: "Resolves to",
            nodes: collectNodes(graph, incoming, "alias", "from"),
          },
          {
            title: "Referenced by",
            nodes: collectNodes(graph, outgoing, "alias", "to"),
          },
          {
            title: "Produced by",
            nodes: collectNodes(graph, incoming, "generator-produces", "from"),
          },
          {
            title: "Feeds generators",
            nodes: collectNodes(graph, outgoing, "generator-source", "to"),
          },
        ]
  ).filter((section) => section.nodes.length > 0);

  return (
    <aside
      role="region"
      aria-label="Graph outline"
      className="sr-only absolute left-0 top-0 h-0 w-0 overflow-hidden"
    >
      <h2>{describeNode(focused)}</h2>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ul>
            {section.nodes.map((node) => (
              <li key={node.id}>{describeNode(node)}</li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

function getEdges(
  graph: GraphModel,
  edgeIds: string[] | undefined,
): GraphEdge[] {
  return (edgeIds ?? [])
    .map((id) => graph.edges.get(id))
    .filter((edge): edge is GraphEdge => edge !== undefined);
}

function collectNodes(
  graph: GraphModel,
  edges: GraphEdge[],
  kind: GraphEdge["kind"],
  side: "from" | "to",
): GraphNode[] {
  const nodes = new Map<string, GraphNode>();
  for (const edge of edges) {
    if (edge.kind !== kind) {
      continue;
    }
    const node = graph.nodes.get(edge[side]);
    if (node) {
      nodes.set(node.id, node);
    }
  }
  return [...nodes.values()];
}

function describeNode(node: GraphNode): string {
  if (node.kind === "token") return `Token ${node.path}`;
  if (node.kind === "generator")
    return `Generator ${node.name} (${node.outputCount} outputs)`;
  return node.reason === "ambiguous"
    ? `Ambiguous token reference ${node.path}`
    : `Missing token ${node.path}`;
}
