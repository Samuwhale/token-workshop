import type { TokenCollection, DerivationOp, TokenType } from "./types.js";
import { getTokenManagerExt } from "./types.js";
import type {
  TokenGenerator,
  GeneratorType,
} from "./generator-types.js";
import {
  createGeneratorOwnershipKey,
  getGeneratorOutputsForGraph,
} from "./generator-types.js";
import { readTokenModeValuesForCollection } from "./collections.js";
import { resolveCollectionIdForPath } from "./collection-paths.js";
import {
  collectReferencePaths,
  extractReferencePaths,
  isReference,
  parseReference,
} from "./dtcg-types.js";
import {
  applyDerivation,
  validateDerivationOps,
  extractDerivationRefPaths,
} from "./derivation-ops.js";

// Pure dependency-graph construction. Reusable server-side (future lint rules,
// health scans) and client-side (graph view, detach popover).

export type GraphNodeId = string;
export type GraphEdgeId = string;

export type GraphHealthStatus = "ok" | "broken" | "cycle" | "generator-error";

export type GhostReason = "missing" | "ambiguous";

export interface GraphTokenLike {
  $value: unknown;
  $type?: string;
  $extensions?: unknown;
}

export interface TokenGraphNode {
  kind: "token";
  id: GraphNodeId;
  path: string;
  collectionId: string;
  displayName: string;
  $type?: string;
  swatchColor?: string;
  valuePreview?: string;
  health: GraphHealthStatus;
  isGeneratorManaged: boolean;
  ownerGeneratorId?: string;
  hasDependents: boolean;
  hasDependencies: boolean;
}

export interface GeneratorGraphNode {
  kind: "generator";
  id: GraphNodeId;
  generatorId: string;
  generatorType: GeneratorType;
  name: string;
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  targetCollection: string;
  targetGroup: string;
  outputCount: number;
  enabled: boolean;
  health: GraphHealthStatus;
  sourceIssue?: GhostReason;
  errorMessage?: string;
}

export interface GhostGraphNode {
  kind: "ghost";
  id: GraphNodeId;
  path: string;
  collectionId?: string;
  reason: GhostReason;
}

/**
 * Visual mediator between a derivation source and its derived token.
 * Carries the op chain so the renderer can show the operation summary.
 * One node per derivation, regardless of how many ops are in the chain.
 */
export interface DerivationGraphNode {
  kind: "derivation";
  id: GraphNodeId;
  /** Path of the derived token (the token whose `derivation` extension we read). */
  derivedPath: string;
  collectionId: string;
  /** Path of the primary `$value` alias source. */
  sourceTokenPath: string;
  /** Validated op chain — used by the UI to render the operation summary. */
  ops: DerivationOp[];
  /** Resolved $type of the derived token (matches the source's $type). */
  $type?: string;
  swatchColor?: string;
  valuePreview?: string;
  health: GraphHealthStatus;
}

export type GraphNode =
  | TokenGraphNode
  | GeneratorGraphNode
  | GhostGraphNode
  | DerivationGraphNode;

export interface AliasEdge {
  kind: "alias";
  id: GraphEdgeId;
  from: GraphNodeId;
  to: GraphNodeId;
  modeNames: string[];
  inCycle?: boolean;
  isMissingTarget?: boolean;
  issueRules?: string[];
}

export interface GeneratorSourceEdge {
  kind: "generator-source";
  id: GraphEdgeId;
  from: GraphNodeId;
  to: GraphNodeId;
}

export interface GeneratorProducesEdge {
  kind: "generator-produces";
  id: GraphEdgeId;
  from: GraphNodeId;
  to: GraphNodeId;
  stepName: string;
  semantic?: string;
}

/**
 * Edge from a source token (or token-ref op param) to a derivation node.
 * `paramLabel` distinguishes secondary param-input edges (e.g. `mix.with`)
 * from the primary `$value` source edge (which has no label).
 */
export interface DerivationSourceEdge {
  kind: "derivation-source";
  id: GraphEdgeId;
  from: GraphNodeId;
  to: GraphNodeId;
  /** Mode names carried by this primary source edge. Empty on param edges. */
  modeNames?: string[];
  /** Param name for secondary edges (e.g. "with"). Absent on the primary edge. */
  paramLabel?: string;
  /** True when the upstream token does not exist (resolves to a ghost). */
  isMissingTarget?: boolean;
  inCycle?: boolean;
}

/** Edge from a derivation node to its derived token (solid in the UI). */
export interface DerivationProducesEdge {
  kind: "derivation-produces";
  id: GraphEdgeId;
  from: GraphNodeId;
  to: GraphNodeId;
  inCycle?: boolean;
}

export type GraphEdge =
  | AliasEdge
  | GeneratorSourceEdge
  | GeneratorProducesEdge
  | DerivationSourceEdge
  | DerivationProducesEdge;

export interface GraphModel {
  nodes: Map<GraphNodeId, GraphNode>;
  edges: Map<GraphEdgeId, GraphEdge>;
  outgoing: Map<GraphNodeId, GraphEdgeId[]>;
  incoming: Map<GraphNodeId, GraphEdgeId[]>;
  fingerprint: string;
}

export interface BuildGraphInput {
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, GraphTokenLike>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  generators: TokenGenerator[];
  derivedTokenPaths: Map<string, TokenGenerator>;
  validationIssues?: GraphValidationIssue[];
}

export interface GraphValidationIssue {
  rule: string;
  path?: string;
  collectionId?: string;
  message: string;
  targetPath?: string;
  targetCollectionId?: string;
  cyclePath?: string[];
}

const TOKEN_PREFIX = "token";
const GENERATOR_PREFIX = "gen";
const GHOST_PREFIX = "ghost";
const DERIVATION_PREFIX = "deriv";

export function tokenNodeId(collectionId: string, path: string): GraphNodeId {
  return `${TOKEN_PREFIX}:${collectionId}::${path}`;
}

export function generatorNodeId(generatorId: string): GraphNodeId {
  return `${GENERATOR_PREFIX}:${generatorId}`;
}

export function derivationNodeId(collectionId: string, derivedPath: string): GraphNodeId {
  return `${DERIVATION_PREFIX}:${collectionId}::${derivedPath}`;
}

function ghostNodeId(path: string, collectionId?: string): GraphNodeId {
  return `${GHOST_PREFIX}:${collectionId ?? "?"}::${path}`;
}

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function pushAdjacency(
  map: Map<GraphNodeId, GraphEdgeId[]>,
  nodeId: GraphNodeId,
  edgeId: GraphEdgeId,
): void {
  const existing = map.get(nodeId);
  if (existing) {
    existing.push(edgeId);
  } else {
    map.set(nodeId, [edgeId]);
  }
}

function fingerprintNode(node: GraphNode): string {
  if (node.kind === "token") {
    return [
      node.kind,
      node.id,
      node.path,
      node.collectionId,
      node.displayName,
      node.$type ?? "",
      node.swatchColor ?? "",
      node.valuePreview ?? "",
      node.health,
      node.isGeneratorManaged ? "1" : "0",
      node.ownerGeneratorId ?? "",
      node.hasDependents ? "1" : "0",
      node.hasDependencies ? "1" : "0",
    ].join("\u0001");
  }

  if (node.kind === "generator") {
    return [
      node.kind,
      node.id,
      node.generatorId,
      node.generatorType,
      node.name,
      node.sourceTokenPath ?? "",
      node.sourceCollectionId ?? "",
      node.targetCollection,
      node.targetGroup,
      String(node.outputCount),
      node.enabled ? "1" : "0",
      node.health,
      node.sourceIssue ?? "",
      node.errorMessage ?? "",
    ].join("\u0001");
  }

  if (node.kind === "ghost") {
    return [
      node.kind,
      node.id,
      node.path,
      node.collectionId ?? "",
      node.reason,
    ].join("\u0001");
  }

  // derivation
  return [
    node.kind,
    node.id,
    node.derivedPath,
    node.collectionId,
    node.sourceTokenPath,
    node.$type ?? "",
    node.swatchColor ?? "",
    node.valuePreview ?? "",
    node.health,
    node.ops.map((op) => op.kind).join(","),
    String(node.ops.length),
  ].join("\u0001");
}

function fingerprintEdge(edge: GraphEdge): string {
  if (edge.kind === "alias") {
    return [
      edge.kind,
      edge.id,
      edge.from,
      edge.to,
      edge.modeNames.join(","),
      edge.inCycle ? "1" : "0",
      edge.isMissingTarget ? "1" : "0",
      edge.issueRules?.join(",") ?? "",
    ].join("\u0001");
  }

  if (edge.kind === "generator-produces") {
    return [
      edge.kind,
      edge.id,
      edge.from,
      edge.to,
      edge.stepName,
      edge.semantic ?? "",
    ].join("\u0001");
  }

  if (edge.kind === "derivation-source") {
    return [
      edge.kind,
      edge.id,
      edge.from,
      edge.to,
      edge.modeNames?.join(",") ?? "",
      edge.paramLabel ?? "",
      edge.isMissingTarget ? "1" : "0",
      edge.inCycle ? "1" : "0",
    ].join("\u0001");
  }

  if (edge.kind === "derivation-produces") {
    return [
      edge.kind,
      edge.id,
      edge.from,
      edge.to,
      edge.inCycle ? "1" : "0",
    ].join("\u0001");
  }

  return [edge.kind, edge.id, edge.from, edge.to].join("\u0001");
}

function readGraphModeValues(
  entry: GraphTokenLike,
  collection: TokenCollection,
): Record<string, unknown> {
  return readTokenModeValuesForCollection(
    {
      $value: entry.$value,
      ...(entry.$extensions ? { $extensions: entry.$extensions } : {}),
    },
    collection,
  );
}

function readGraphModeValue(
  entry: GraphTokenLike,
  collection: TokenCollection,
  requestedModeName: string,
): unknown {
  const modeValues = readGraphModeValues(entry, collection);
  if (Object.prototype.hasOwnProperty.call(modeValues, requestedModeName)) {
    return modeValues[requestedModeName];
  }

  const fallbackModeName = collection.modes[0]?.name;
  return fallbackModeName
    ? modeValues[fallbackModeName]
    : entry.$value;
}

function getTokenSwatchColor(
  entry: GraphTokenLike,
  collection: TokenCollection,
  modeValues: Record<string, unknown>,
): string | undefined {
  if (entry.$type !== "color") {
    return undefined;
  }
  const primaryModeName = collection.modes[0]?.name;
  const primaryValue = primaryModeName ? modeValues[primaryModeName] : undefined;
  if (typeof primaryValue !== "string" || primaryValue.trim().length === 0) {
    return undefined;
  }
  return extractReferencePaths(primaryValue).length === 0
    ? primaryValue
    : undefined;
}

function getTokenValuePreview(
  entry: GraphTokenLike,
  collection: TokenCollection,
  modeValues: Record<string, unknown>,
): string | undefined {
  // Color tokens already convey their value through the swatch.
  if (entry.$type === "color") return undefined;
  const primaryModeName = collection.modes[0]?.name;
  const value = primaryModeName ? modeValues[primaryModeName] : undefined;
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.length > 18 ? `${trimmed.slice(0, 17)}…` : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Composite values (typography, shadow) — show a compact tag.
  return entry.$type ? `{${entry.$type}}` : undefined;
}

function getResolvedSwatchColor(
  $type: string | undefined,
  value: unknown,
): string | undefined {
  if ($type !== "color" || typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || extractReferencePaths(trimmed).length > 0) {
    return undefined;
  }
  return trimmed;
}

function getResolvedValuePreview(
  $type: string | undefined,
  value: unknown,
): string | undefined {
  if ($type === "color") return undefined;
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.length > 18 ? `${trimmed.slice(0, 17)}…` : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "unit" in value &&
    typeof (value as { value: unknown }).value === "number" &&
    typeof (value as { unit: unknown }).unit === "string"
  ) {
    const numericValue = (value as { value: number }).value;
    const unit = (value as { unit: string }).unit;
    return `${Number.isInteger(numericValue) ? numericValue : Number(numericValue.toFixed(4))}${unit}`;
  }
  return $type ? `{${$type}}` : undefined;
}

function readGraphDerivationOps(entry: GraphTokenLike): DerivationOp[] {
  return validateDerivationOps(
    getTokenManagerExt({ $extensions: entry.$extensions as never })?.derivation?.ops,
  );
}

interface ResolvedGraphTarget {
  nodeId: GraphNodeId;
  collectionId?: string;
  reason: "resolved" | GhostReason;
}

function ensureGhostNode(
  ghostIntents: Map<GraphNodeId, GhostGraphNode>,
  path: string,
  collectionId: string | undefined,
  reason: GhostReason,
): GraphNodeId {
  const id = ghostNodeId(path, collectionId);
  if (!ghostIntents.has(id)) {
    ghostIntents.set(id, {
      kind: "ghost",
      id,
      path,
      collectionId,
      reason,
    });
  }
  return id;
}

function resolveGraphTarget(params: {
  path: string;
  nodes: Map<GraphNodeId, GraphNode>;
  ghostIntents: Map<GraphNodeId, GhostGraphNode>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  explicitCollectionId?: string;
  preferredCollectionId?: string;
}): ResolvedGraphTarget {
  const explicitCollectionId = params.explicitCollectionId?.trim();
  if (explicitCollectionId) {
    const candidate = tokenNodeId(explicitCollectionId, params.path);
    if (params.nodes.has(candidate)) {
      return {
        nodeId: candidate,
        collectionId: explicitCollectionId,
        reason: "resolved",
      };
    }
    return {
      nodeId: ensureGhostNode(
        params.ghostIntents,
        params.path,
        explicitCollectionId,
        "missing",
      ),
      collectionId: explicitCollectionId,
      reason: "missing",
    };
  }

  const resolution = resolveCollectionIdForPath({
    path: params.path,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
    preferredCollectionId: params.preferredCollectionId,
  });
  if (
    resolution.reason === "missing" ||
    resolution.reason === "ambiguous" ||
    !resolution.collectionId
  ) {
    const reason = resolution.reason === "ambiguous" ? "ambiguous" : "missing";
    return {
      nodeId: ensureGhostNode(
        params.ghostIntents,
        params.path,
        resolution.collectionId,
        reason,
      ),
      collectionId: resolution.collectionId,
      reason,
    };
  }

  const candidate = tokenNodeId(resolution.collectionId, params.path);
  if (params.nodes.has(candidate)) {
    return {
      nodeId: candidate,
      collectionId: resolution.collectionId,
      reason: "resolved",
    };
  }

  return {
    nodeId: ensureGhostNode(
      params.ghostIntents,
      params.path,
      resolution.collectionId,
      "missing",
    ),
    collectionId: resolution.collectionId,
    reason: "missing",
  };
}

// Tarjan's SCC over the dep-edge subgraph (alias + derivation edges). Returns
// the set of edge ids whose endpoints are in a non-trivial SCC (size > 1, or a
// single-node SCC with a self-loop). Those edges are the ones that belong to
// cycles.
type CycleEligibleEdge =
  | AliasEdge
  | DerivationSourceEdge
  | DerivationProducesEdge;

function computeAliasCycleEdges(
  nodes: Map<GraphNodeId, GraphNode>,
  depEdges: CycleEligibleEdge[],
): { cycleEdgeIds: Set<GraphEdgeId>; cycleNodeIds: Set<GraphNodeId> } {
  const explicitModeNames = new Set<string>();
  for (const edge of depEdges) {
    for (const modeName of edgeCycleModeNames(edge)) {
      explicitModeNames.add(modeName);
    }
  }
  const modeNames =
    explicitModeNames.size > 0 ? [...explicitModeNames] : ["__all__"];
  const cycleEdgeIds = new Set<GraphEdgeId>();
  const cycleNodeIds = new Set<GraphNodeId>();

  for (const modeName of modeNames) {
    const modeResult = computeAliasCycleEdgesForMode(
      nodes,
      depEdges.filter((edge) => edgeActiveInMode(edge, modeName)),
    );
    for (const edgeId of modeResult.cycleEdgeIds) cycleEdgeIds.add(edgeId);
    for (const nodeId of modeResult.cycleNodeIds) cycleNodeIds.add(nodeId);
  }

  return { cycleEdgeIds, cycleNodeIds };
}

function edgeCycleModeNames(edge: CycleEligibleEdge): string[] {
  if (edge.kind === "alias" || edge.kind === "derivation-source") {
    return edge.modeNames ?? [];
  }
  return [];
}

function edgeActiveInMode(edge: CycleEligibleEdge, modeName: string): boolean {
  const edgeModeNames = edgeCycleModeNames(edge);
  return edgeModeNames.length === 0 || edgeModeNames.includes(modeName);
}

function computeAliasCycleEdgesForMode(
  nodes: Map<GraphNodeId, GraphNode>,
  depEdges: CycleEligibleEdge[],
): { cycleEdgeIds: Set<GraphEdgeId>; cycleNodeIds: Set<GraphNodeId> } {
  const outgoingAlias = new Map<GraphNodeId, Array<{ to: GraphNodeId; edgeId: GraphEdgeId }>>();
  for (const edge of depEdges) {
    const list = outgoingAlias.get(edge.from);
    if (list) list.push({ to: edge.to, edgeId: edge.id });
    else outgoingAlias.set(edge.from, [{ to: edge.to, edgeId: edge.id }]);
  }

  const index = new Map<GraphNodeId, number>();
  const lowlink = new Map<GraphNodeId, number>();
  const onStack = new Set<GraphNodeId>();
  const stack: GraphNodeId[] = [];
  let nextIndex = 0;
  const sccs: GraphNodeId[][] = [];

  const strongconnect = (v: GraphNodeId): void => {
    index.set(v, nextIndex);
    lowlink.set(v, nextIndex);
    nextIndex++;
    stack.push(v);
    onStack.add(v);

    for (const { to } of outgoingAlias.get(v) ?? []) {
      if (!index.has(to)) {
        strongconnect(to);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(to)!));
      } else if (onStack.has(to)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(to)!));
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const component: GraphNodeId[] = [];
      let w: GraphNodeId;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      sccs.push(component);
    }
  };

  for (const nodeId of nodes.keys()) {
    if (!index.has(nodeId)) {
      strongconnect(nodeId);
    }
  }

  const cycleNodeIds = new Set<GraphNodeId>();
  for (const component of sccs) {
    if (component.length > 1) {
      for (const id of component) cycleNodeIds.add(id);
      continue;
    }
    const [only] = component;
    const neighbors = outgoingAlias.get(only);
    if (neighbors && neighbors.some((n) => n.to === only)) {
      cycleNodeIds.add(only);
    }
  }

  const cycleEdgeIds = new Set<GraphEdgeId>();
  for (const edge of depEdges) {
    if (cycleNodeIds.has(edge.from) && cycleNodeIds.has(edge.to)) {
      cycleEdgeIds.add(edge.id);
    }
  }

  return { cycleEdgeIds, cycleNodeIds };
}

function parseBrokenAliasTarget(message: string): string | undefined {
  const match = message.match(/non-existent token "([^"]+)"/);
  return match?.[1];
}

function parseCyclePath(message: string): string[] | undefined {
  const [, rawCycle] = message.split("Circular reference:");
  if (!rawCycle) return undefined;
  const paths = rawCycle
    .split("→")
    .map((part) => part.trim())
    .filter(Boolean);
  return paths.length > 1 ? paths : undefined;
}

function pushIssueRule(edge: AliasEdge, rule: string): void {
  const current = edge.issueRules ?? [];
  if (!current.includes(rule)) {
    edge.issueRules = [...current, rule].sort();
  }
}

function applyValidationIssuesToGraph(params: {
  issues: GraphValidationIssue[];
  nodes: Map<GraphNodeId, GraphNode>;
  edges: Map<GraphEdgeId, GraphEdge>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
}): void {
  const {
    issues,
    nodes,
    edges,
    pathToCollectionId,
    collectionIdsByPath,
  } = params;

  for (const issue of issues) {
    if (!issue.path || !issue.collectionId) continue;
    const downstreamId = tokenNodeId(issue.collectionId, issue.path);
    const downstream = nodes.get(downstreamId);
    if (!downstream || downstream.kind !== "token") continue;

    if (issue.rule === "broken-alias") {
      const targetPath = issue.targetPath ?? parseBrokenAliasTarget(issue.message);
      if (!targetPath) continue;
      for (const edge of edges.values()) {
        if (edge.kind !== "alias" || edge.to !== downstreamId) continue;
        const upstream = nodes.get(edge.from);
        if (
          (upstream?.kind === "ghost" || upstream?.kind === "token") &&
          upstream.path === targetPath
        ) {
          edge.isMissingTarget = edge.isMissingTarget || upstream.kind === "ghost";
          pushIssueRule(edge, issue.rule);
          if (downstream.health !== "cycle") {
            downstream.health = "broken";
          }
        }
      }
      continue;
    }

    if (issue.rule === "circular-reference") {
      const cyclePath = issue.cyclePath ?? parseCyclePath(issue.message);
      if (!cyclePath) continue;
      for (let index = 0; index < cyclePath.length - 1; index++) {
        const sourcePath = cyclePath[index];
        const targetPath = cyclePath[index + 1];
        const sourceCollectionId = resolveCollectionIdForPath({
          path: sourcePath,
          pathToCollectionId,
          collectionIdsByPath,
          preferredCollectionId: issue.collectionId,
        }).collectionId;
        const targetCollectionId = resolveCollectionIdForPath({
          path: targetPath,
          pathToCollectionId,
          collectionIdsByPath,
          preferredCollectionId: sourceCollectionId ?? issue.collectionId,
        }).collectionId;
        if (!sourceCollectionId || !targetCollectionId) continue;

        const edgeId = `alias:${tokenNodeId(targetCollectionId, targetPath)}->${tokenNodeId(sourceCollectionId, sourcePath)}`;
        const edge = edges.get(edgeId);
        if (edge?.kind === "alias") {
          edge.inCycle = true;
          pushIssueRule(edge, issue.rule);
        }
        const sourceNode = nodes.get(tokenNodeId(sourceCollectionId, sourcePath));
        if (sourceNode?.kind === "token") {
          sourceNode.health = "cycle";
        }
      }
    }
  }
}

export function buildGraph(input: BuildGraphInput): GraphModel {
  const {
    collections,
    tokensByCollection,
    pathToCollectionId,
    collectionIdsByPath,
    generators,
    derivedTokenPaths,
    validationIssues,
  } = input;

  const nodes = new Map<GraphNodeId, GraphNode>();
  const edges = new Map<GraphEdgeId, GraphEdge>();
  const outgoing = new Map<GraphNodeId, GraphEdgeId[]>();
  const incoming = new Map<GraphNodeId, GraphEdgeId[]>();
  const ghostIntents = new Map<GraphNodeId, GhostGraphNode>();
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection] as const),
  );
  const generatorOutputsById = new Map<
    string,
    ReturnType<typeof getGeneratorOutputsForGraph>
  >();
  const generatorSourceTargets = new Map<string, ResolvedGraphTarget | null>();
  const modeValuesByTokenId = new Map<GraphNodeId, Record<string, unknown>>();

  const resolvePreviewValue = (
    value: unknown,
    preferredCollectionId: string,
    modeName: string,
    visited: Set<string>,
  ): unknown => {
    if (isReference(value)) {
      return resolvePreviewTokenValue(
        parseReference(value),
        preferredCollectionId,
        modeName,
        visited,
      );
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        item == null
          ? item
          : resolvePreviewValue(item, preferredCollectionId, modeName, new Set(visited)),
      );
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
          key,
          nestedValue == null
            ? nestedValue
            : resolvePreviewValue(nestedValue, preferredCollectionId, modeName, new Set(visited)),
        ]),
      );
    }

    return value;
  };

  const resolvePreviewTokenValue = (
    path: string,
    preferredCollectionId: string,
    modeName: string,
    visited: Set<string>,
  ): unknown => {
    const target = resolveCollectionIdForPath({
      path,
      pathToCollectionId,
      collectionIdsByPath,
      preferredCollectionId,
    });
    if (!target.collectionId) {
      return undefined;
    }
    const targetCollection = collectionsById.get(target.collectionId);
    if (!targetCollection) {
      return undefined;
    }

    const visitKey = `${target.collectionId}::${path}::${modeName}`;
    if (visited.has(visitKey)) {
      return undefined;
    }
    visited.add(visitKey);

    const entry = tokensByCollection[target.collectionId]?.[path];
    if (!entry) {
      return undefined;
    }

    const rawValue = readGraphModeValue(entry, targetCollection, modeName);
    let resolved = resolvePreviewValue(rawValue, target.collectionId, modeName, visited);
    const ops = readGraphDerivationOps(entry);
    if (ops.length > 0 && entry.$type) {
      resolved = applyDerivation(
        resolved,
        entry.$type as TokenType,
        ops,
        (refPath) =>
          resolvePreviewTokenValue(refPath, targetCollection.id, modeName, new Set(visited)),
      );
    }

    return resolved;
  };

  // 1. Token nodes
  for (const collection of collections) {
    const entries = tokensByCollection[collection.id];
    if (!entries) continue;
    for (const [path, entry] of Object.entries(entries)) {
      const id = tokenNodeId(collection.id, path);
      const modeValues = readGraphModeValues(entry, collection);
      modeValuesByTokenId.set(id, modeValues);
      const ownerGenerator = derivedTokenPaths.get(
        createGeneratorOwnershipKey(collection.id, path),
      );
      nodes.set(id, {
        kind: "token",
        id,
        path,
        collectionId: collection.id,
        displayName: path.split(".").pop() ?? path,
        $type: entry.$type,
        swatchColor: getTokenSwatchColor(entry, collection, modeValues),
        valuePreview: getTokenValuePreview(entry, collection, modeValues),
        health: "ok",
        isGeneratorManaged: Boolean(ownerGenerator),
        ownerGeneratorId: ownerGenerator?.id,
        hasDependents: false,
        hasDependencies: false,
      });
    }
  }

  // 2. Generator nodes
  for (const generator of generators) {
    const id = generatorNodeId(generator.id);
    const outputs = getGeneratorOutputsForGraph(generator);
    const sourceTarget = generator.sourceToken
      ? resolveGraphTarget({
          path: generator.sourceToken,
          explicitCollectionId: generator.sourceCollectionId,
          nodes,
          ghostIntents,
          pathToCollectionId,
          collectionIdsByPath,
        })
      : null;
    const sourceIssue =
      sourceTarget && sourceTarget.reason !== "resolved"
        ? sourceTarget.reason
        : undefined;
    generatorOutputsById.set(generator.id, outputs);
    generatorSourceTargets.set(generator.id, sourceTarget);
    nodes.set(id, {
      kind: "generator",
      id,
      generatorId: generator.id,
      generatorType: generator.type,
      name: generator.name,
      sourceTokenPath: generator.sourceToken,
      sourceCollectionId: sourceTarget?.collectionId,
      targetCollection: generator.targetCollection,
      targetGroup: generator.targetGroup,
      outputCount: outputs.length,
      enabled: generator.enabled !== false,
      health: generator.lastRunError
        ? "generator-error"
        : sourceIssue
          ? "broken"
          : "ok",
      ...(sourceIssue ? { sourceIssue } : {}),
      errorMessage:
        generator.lastRunError?.message ??
        (sourceIssue === "missing"
          ? `Source token "${generator.sourceToken}" is missing.`
          : sourceIssue === "ambiguous"
            ? `Source token "${generator.sourceToken}" is ambiguous across collections.`
            : undefined),
    });
  }

  // 2.5 Derivation nodes — one per token whose $extensions.tokenmanager.derivation
  // carries at least one valid op. The derivation node mediates the alias from
  // source to derived token in the graph (the direct alias edge is suppressed).
  interface DerivationInfo {
    node: DerivationGraphNode;
    derivedTokenId: GraphNodeId;
    /** Validated op chain. */
    ops: DerivationOp[];
    /** Primary source refs keyed by path, with the modes that read that source. */
    sourceRefModes: Map<string, Set<string>>;
    /** Token-ref paths from op params (e.g. mix.with). */
    paramRefPaths: string[];
  }
  const derivationByTokenId = new Map<GraphNodeId, DerivationInfo>();

  for (const collection of collections) {
    const entries = tokensByCollection[collection.id];
    if (!entries) continue;
    for (const [path, entry] of Object.entries(entries)) {
      const ops = readGraphDerivationOps(entry);
      if (ops.length === 0) continue;

      // Source path comes from the primary $value alias.
      const sourcePaths = extractReferencePaths(entry.$value);
      const sourceTokenPath = sourcePaths[0];
      if (!sourceTokenPath) continue; // brief: derivation requires alias $value
      const modeValues =
        modeValuesByTokenId.get(tokenNodeId(collection.id, path)) ??
        readGraphModeValues(entry, collection);
      const sourceRefModes = new Map<string, Set<string>>();
      for (const [modeName, value] of Object.entries(modeValues)) {
        for (const refPath of collectReferencePaths(value)) {
          const modeNames = sourceRefModes.get(refPath) ?? new Set<string>();
          modeNames.add(modeName);
          sourceRefModes.set(refPath, modeNames);
        }
      }
      if (sourceRefModes.size === 0) {
        sourceRefModes.set(sourceTokenPath, new Set());
      }

      const derivedTokenId = tokenNodeId(collection.id, path);
      const primaryModeName = collection.modes[0]?.name;
      let previewValue: unknown;
      if (primaryModeName) {
        try {
          previewValue = resolvePreviewTokenValue(
            path,
            collection.id,
            primaryModeName,
            new Set(),
          );
        } catch {
          previewValue = undefined;
        }
      }
      const swatchColor = getResolvedSwatchColor(entry.$type, previewValue);
      const valuePreview = getResolvedValuePreview(entry.$type, previewValue);
      const id = derivationNodeId(collection.id, path);
      const node: DerivationGraphNode = {
        kind: "derivation",
        id,
        derivedPath: path,
        collectionId: collection.id,
        sourceTokenPath,
        ops,
        $type: entry.$type,
        ...(swatchColor ? { swatchColor } : {}),
        ...(valuePreview ? { valuePreview } : {}),
        health: "ok",
      };
      nodes.set(id, node);
      derivationByTokenId.set(derivedTokenId, {
        node,
        derivedTokenId,
        ops,
        sourceRefModes,
        paramRefPaths: extractDerivationRefPaths(ops),
      });
    }
  }

  // 3. Alias edges — mode-aware, deduped per (upstream, downstream) pair.
  // Tokens with a derivation node are mediated separately (skipped here).
  interface AliasAcc {
    from: GraphNodeId;
    to: GraphNodeId;
    modeNames: Set<string>;
    isMissingTarget: boolean;
  }
  const aliasAcc = new Map<GraphEdgeId, AliasAcc>();

  for (const collection of collections) {
    const entries = tokensByCollection[collection.id];
    if (!entries) continue;
    for (const [path, entry] of Object.entries(entries)) {
      const downstreamId = tokenNodeId(collection.id, path);
      if (derivationByTokenId.has(downstreamId)) continue;
      const modeValues =
        modeValuesByTokenId.get(downstreamId) ??
        readGraphModeValues(entry, collection);
      for (const [modeName, value] of Object.entries(modeValues)) {
        for (const refPath of collectReferencePaths(value)) {
          const upstreamTarget = resolveGraphTarget({
            path: refPath,
            preferredCollectionId: collection.id,
            nodes,
            ghostIntents,
            pathToCollectionId,
            collectionIdsByPath,
          });
          const edgeId = `alias:${upstreamTarget.nodeId}->${downstreamId}`;
          const existing = aliasAcc.get(edgeId);
          if (existing) {
            existing.modeNames.add(modeName);
          } else {
            aliasAcc.set(edgeId, {
              from: upstreamTarget.nodeId,
              to: downstreamId,
              modeNames: new Set([modeName]),
              isMissingTarget: upstreamTarget.reason !== "resolved",
            });
          }
        }
      }
    }
  }

  // Materialize ghost nodes discovered during alias-edge build
  for (const ghost of ghostIntents.values()) {
    nodes.set(ghost.id, ghost);
  }

  const aliasEdges: AliasEdge[] = [];
  for (const [edgeId, acc] of aliasAcc) {
    const edge: AliasEdge = {
      kind: "alias",
      id: edgeId,
      from: acc.from,
      to: acc.to,
      modeNames: [...acc.modeNames].sort(),
      ...(acc.isMissingTarget ? { isMissingTarget: true } : {}),
    };
    edges.set(edgeId, edge);
    aliasEdges.push(edge);
    pushAdjacency(outgoing, acc.from, edgeId);
    pushAdjacency(incoming, acc.to, edgeId);
  }

  // 3.5 Derivation source + produces edges
  const derivationSourceEdges: DerivationSourceEdge[] = [];
  const derivationProducesEdges: DerivationProducesEdge[] = [];
  for (const info of derivationByTokenId.values()) {
    const { node, derivedTokenId } = info;
    const collectionId = node.collectionId;

    // Primary source edges. `$value` supplies the canonical source path, while
    // secondary modes may alias different source tokens or use literals.
    for (const [sourcePath, modeNames] of info.sourceRefModes) {
      const primaryTarget = resolveGraphTarget({
        path: sourcePath,
        preferredCollectionId: collectionId,
        nodes,
        ghostIntents,
        pathToCollectionId,
        collectionIdsByPath,
      });
      const primaryEdgeId = `deriv-src:${primaryTarget.nodeId}->${node.id}`;
      const primaryEdge: DerivationSourceEdge = {
        kind: "derivation-source",
        id: primaryEdgeId,
        from: primaryTarget.nodeId,
        to: node.id,
        modeNames: [...modeNames].sort(),
        ...(primaryTarget.reason !== "resolved" ? { isMissingTarget: true } : {}),
      };
      edges.set(primaryEdgeId, primaryEdge);
      derivationSourceEdges.push(primaryEdge);
      pushAdjacency(outgoing, primaryTarget.nodeId, primaryEdgeId);
      pushAdjacency(incoming, node.id, primaryEdgeId);
    }

    // Secondary param edges (today: mix.with).
    for (const paramRefPath of info.paramRefPaths) {
      const paramTarget = resolveGraphTarget({
        path: paramRefPath,
        preferredCollectionId: collectionId,
        nodes,
        ghostIntents,
        pathToCollectionId,
        collectionIdsByPath,
      });
      const paramEdgeId = `deriv-src:${paramTarget.nodeId}->${node.id}:with`;
      const paramEdge: DerivationSourceEdge = {
        kind: "derivation-source",
        id: paramEdgeId,
        from: paramTarget.nodeId,
        to: node.id,
        paramLabel: "with",
        ...(paramTarget.reason !== "resolved" ? { isMissingTarget: true } : {}),
      };
      edges.set(paramEdgeId, paramEdge);
      derivationSourceEdges.push(paramEdge);
      pushAdjacency(outgoing, paramTarget.nodeId, paramEdgeId);
      pushAdjacency(incoming, node.id, paramEdgeId);
    }

    // Produces edge (derivation node → derived token).
    const producesEdgeId = `deriv-prod:${node.id}->${derivedTokenId}`;
    const producesEdge: DerivationProducesEdge = {
      kind: "derivation-produces",
      id: producesEdgeId,
      from: node.id,
      to: derivedTokenId,
    };
    edges.set(producesEdgeId, producesEdge);
    derivationProducesEdges.push(producesEdge);
    pushAdjacency(outgoing, node.id, producesEdgeId);
    pushAdjacency(incoming, derivedTokenId, producesEdgeId);
  }

  // Materialize ghost nodes discovered while resolving derivation source edges.
  for (const ghost of ghostIntents.values()) {
    nodes.set(ghost.id, ghost);
  }

  // 4. Generator source + produces edges
  for (const generator of generators) {
    const generatorId = generatorNodeId(generator.id);
    const sourceTarget = generatorSourceTargets.get(generator.id);

    if (generator.sourceToken && sourceTarget) {
      const edgeId = `gen-src:${sourceTarget.nodeId}->${generatorId}`;
      const edge: GeneratorSourceEdge = {
        kind: "generator-source",
        id: edgeId,
        from: sourceTarget.nodeId,
        to: generatorId,
      };
      edges.set(edgeId, edge);
      pushAdjacency(outgoing, sourceTarget.nodeId, edgeId);
      pushAdjacency(incoming, generatorId, edgeId);
    }

    for (const output of generatorOutputsById.get(generator.id) ?? []) {
      const producedId = tokenNodeId(output.collectionId, output.path);
      if (!nodes.has(producedId)) continue;
      const edgeId = `gen-prod:${generatorId}->${producedId}`;
      const edge: GeneratorProducesEdge = {
        kind: "generator-produces",
        id: edgeId,
        from: generatorId,
        to: producedId,
        stepName: output.stepName,
        ...(output.kind === "semantic" && output.semantic
          ? { semantic: output.semantic }
          : {}),
      };
      edges.set(edgeId, edge);
      pushAdjacency(outgoing, generatorId, edgeId);
      pushAdjacency(incoming, producedId, edgeId);
    }
  }

  // 5. Cycle detection over alias + derivation subgraph
  const cycleEligibleEdges: CycleEligibleEdge[] = [
    ...aliasEdges,
    ...derivationSourceEdges,
    ...derivationProducesEdges,
  ];
  const { cycleEdgeIds, cycleNodeIds } = computeAliasCycleEdges(
    nodes,
    cycleEligibleEdges,
  );
  for (const edgeId of cycleEdgeIds) {
    const edge = edges.get(edgeId);
    if (!edge) continue;
    if (
      edge.kind === "alias" ||
      edge.kind === "derivation-source" ||
      edge.kind === "derivation-produces"
    ) {
      edge.inCycle = true;
    }
  }
  for (const nodeId of cycleNodeIds) {
    const node = nodes.get(nodeId);
    if (node && (node.kind === "token" || node.kind === "derivation")) {
      node.health = "cycle";
    }
  }

  if (validationIssues && validationIssues.length > 0) {
    applyValidationIssuesToGraph({
      issues: validationIssues,
      nodes,
      edges,
      pathToCollectionId,
      collectionIdsByPath,
    });
  }

  // 6. Broken ref marking — any alias or derivation-source edge with a ghost
  // upstream marks the downstream node's health as 'broken' (unless already in
  // a cycle). For derivation-source edges, the downstream is a derivation node;
  // we propagate the broken state to the produced token as well.
  for (const edge of aliasEdges) {
    if (!edge.isMissingTarget) continue;
    const downstream = nodes.get(edge.to);
    if (downstream && downstream.kind === "token" && downstream.health === "ok") {
      downstream.health = "broken";
    }
  }
  for (const edge of derivationSourceEdges) {
    if (!edge.isMissingTarget) continue;
    const derivationNode = nodes.get(edge.to);
    if (
      derivationNode &&
      derivationNode.kind === "derivation" &&
      derivationNode.health === "ok"
    ) {
      derivationNode.health = "broken";
      const producedTokenId = tokenNodeId(derivationNode.collectionId, derivationNode.derivedPath);
      const producedNode = nodes.get(producedTokenId);
      if (producedNode && producedNode.kind === "token" && producedNode.health === "ok") {
        producedNode.health = "broken";
      }
    }
  }

  // 7. hasDependents / hasDependencies precompute
  for (const node of nodes.values()) {
    if (node.kind !== "token") continue;
    const out = outgoing.get(node.id);
    const inc = incoming.get(node.id);
    // Alias edges where this node is `from` = this node is used by others
    node.hasDependents = Boolean(
      out?.some((id) => {
        const e = edges.get(id);
        return e?.kind === "alias" || e?.kind === "derivation-source";
      }),
    );
    // Alias / derivation-produces edges where this node is `to` = this node
    // depends on something upstream.
    node.hasDependencies = Boolean(
      inc?.some((id) => {
        const e = edges.get(id);
        return e?.kind === "alias" || e?.kind === "derivation-produces";
      }),
    );
  }

  // 8. Fingerprint — sorted node + edge ids, hashed
  const nodeFingerprints = [...nodes.values()]
    .map((node) => fingerprintNode(node))
    .sort();
  const edgeFingerprints = [...edges.values()]
    .map((edge) => fingerprintEdge(edge))
    .sort();
  const fingerprint = djb2(
    nodeFingerprints.join("|") + "::" + edgeFingerprints.join("|"),
  );

  return { nodes, edges, outgoing, incoming, fingerprint };
}
