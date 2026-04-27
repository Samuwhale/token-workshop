import {
  applyDerivation,
  extractReferencePaths,
  readTokenModeValuesForCollection,
  resolveCollectionIdForPath,
  resolveTokenAncestors,
  type DerivationOp,
  type GraphEdge,
  type GraphEdgeId,
  type GraphModel,
  type GraphNodeId,
  type TokenCollection,
  type TokenGraphNode,
  type TokenType,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { formatTokenValueForDisplay } from "../../shared/tokenFormatting";

export interface ModeDependencyRow {
  modeName: string;
  authoredLabel: string;
  sourceLabel: string;
  sourcePath?: string;
  resolvedLabel: string;
  statusLabel: string;
  edgeId?: GraphEdgeId;
}

interface ModeRowsContext {
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
}

interface BuildTokenModeRowsParams extends ModeRowsContext {
  graph: GraphModel;
  token: TokenGraphNode;
  collection: TokenCollection;
  entry: TokenMapEntry;
}

interface BuildRewireModeRowsParams extends ModeRowsContext {
  sourcePath: string;
  sourceCollectionId: string;
  sourceEntry: TokenMapEntry;
  sourceCollection: TokenCollection;
  targetPath: string;
  targetCollectionId: string;
  selectedModes: ReadonlySet<string>;
}

interface ResolvedModeValue {
  status: "literal" | "missing" | "ambiguous" | "cycle" | "depth";
  value?: unknown;
  type?: string;
}

export function buildTokenModeRows({
  graph,
  token,
  collection,
  entry,
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
}: BuildTokenModeRowsParams): ModeDependencyRow[] {
  const modeValues = readTokenModeValuesForCollection(entry, collection);
  const chainsByMode = new Map(
    resolveTokenAncestors({
      tokenPath: token.path,
      collectionId: token.collectionId,
      collections,
      tokensByCollection: perCollectionFlat,
      pathToCollectionId,
      collectionIdsByPath,
    }).chains.map((chain) => [chain.modeName, chain]),
  );
  const derivationOps = readDerivationOps(entry);

  return collection.modes.map((mode) => {
    const modeName = mode.name;
    const authored = modeValues[modeName];
    const sourcePath = extractReferencePaths(authored)[0];
    const chain = chainsByMode.get(modeName);
    let resolved: ResolvedModeValue;

    if (!sourcePath) {
      resolved = { status: "literal", value: authored, type: entry.$type };
    } else if (!chain) {
      resolved = { status: "missing" };
    } else if (chain.terminalKind === "literal") {
      resolved = {
        status: "literal",
        value: chain.terminalValue,
        type: chain.terminalType ?? entry.$type,
      };
    } else {
      resolved = { status: chain.terminalKind };
    }

    if (derivationOps.length > 0 && resolved.status === "literal") {
      resolved = applyModeDerivation({
        sourceValue: resolved.value,
        sourceType: (resolved.type ?? entry.$type) as TokenType | undefined,
        ops: derivationOps,
        modeName,
        preferredCollectionId: token.collectionId,
        context: {
          collections,
          perCollectionFlat,
          pathToCollectionId,
          collectionIdsByPath,
        },
      });
    }

    return {
      modeName,
      authoredLabel: formatTokenValueForDisplay(entry.$type, authored),
      sourceLabel: sourcePath ?? "Literal value",
      ...(sourcePath ? { sourcePath } : {}),
      resolvedLabel: formatResolvedValue(entry.$type, resolved),
      statusLabel: statusLabel(sourcePath, resolved.status, derivationOps.length > 0),
      edgeId: sourcePath
        ? findModeDependencyEdge(graph, token.id, modeName, sourcePath)
        : undefined,
    };
  });
}

export function buildRewireModeRows({
  sourcePath,
  sourceCollectionId,
  sourceEntry,
  sourceCollection,
  targetPath,
  targetCollectionId,
  selectedModes,
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
}: BuildRewireModeRowsParams): ModeDependencyRow[] {
  const modeValues = readTokenModeValuesForCollection(sourceEntry, sourceCollection);
  return sourceCollection.modes.map((mode) => {
    const modeName = mode.name;
    const authored = modeValues[modeName];
    const currentSourcePath = extractReferencePaths(authored)[0];
    const targetResolved = selectedModes.has(modeName)
      ? resolvePathForMode({
          path: targetPath,
          preferredCollectionId: targetCollectionId,
          modeName,
          context: {
            collections,
            perCollectionFlat,
            pathToCollectionId,
            collectionIdsByPath,
          },
        })
      : resolvePathForMode({
          path: sourcePath,
          preferredCollectionId: sourceCollectionId,
          modeName,
          context: {
            collections,
            perCollectionFlat,
            pathToCollectionId,
            collectionIdsByPath,
          },
        });

    return {
      modeName,
      authoredLabel: currentSourcePath
        ? `{${currentSourcePath}}`
        : formatTokenValueForDisplay(sourceEntry.$type, authored),
      sourceLabel: currentSourcePath ?? "Literal value",
      ...(currentSourcePath ? { sourcePath: currentSourcePath } : {}),
      resolvedLabel: formatResolvedValue(sourceEntry.$type, targetResolved),
      statusLabel: selectedModes.has(modeName)
        ? `Will use {${targetPath}}`
        : "Will stay unchanged",
    };
  });
}

export function ModeDependencyRows({
  rows,
  onSelectEdge,
}: {
  rows: ModeDependencyRow[];
  onSelectEdge?: (edgeId: GraphEdgeId) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => {
        const content = <ModeDependencyRowContent row={row} />;
        if (!row.edgeId || !onSelectEdge) {
          return (
            <div key={row.modeName} className="rounded px-1.5 py-1">
              {content}
            </div>
          );
        }
        return (
          <button
            key={row.modeName}
            type="button"
            onClick={() => onSelectEdge(row.edgeId!)}
            className="w-full rounded px-1.5 py-1 text-left hover:bg-[var(--surface-hover)]"
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function ModeDependencyRowContent({ row }: { row: ModeDependencyRow }) {
  return (
    <div className="grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-secondary">
      <span
        className="truncate text-[var(--color-figma-text-tertiary)]"
        title={row.modeName}
      >
        {row.modeName}
      </span>
      <span
        className="min-w-0 truncate font-mono text-[var(--color-figma-text)]"
        title={row.authoredLabel}
      >
        {row.authoredLabel}
      </span>
      <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
        Source
      </span>
      <span
        className="min-w-0 truncate text-[10px] text-[var(--color-figma-text-secondary)]"
        title={row.sourcePath ?? row.sourceLabel}
      >
        {row.sourceLabel}
      </span>
      <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
        Result
      </span>
      <span
        className="min-w-0 truncate font-mono text-[10px] text-[var(--color-figma-text-secondary)]"
        title={row.resolvedLabel}
      >
        {row.resolvedLabel}
      </span>
      <span />
      <span className="min-w-0 truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
        {row.statusLabel}
      </span>
    </div>
  );
}

function applyModeDerivation({
  sourceValue,
  sourceType,
  ops,
  modeName,
  preferredCollectionId,
  context,
}: {
  sourceValue: unknown;
  sourceType: TokenType | undefined;
  ops: DerivationOp[];
  modeName: string;
  preferredCollectionId: string;
  context: ModeRowsContext;
}): ResolvedModeValue {
  if (!sourceType) {
    return { status: "missing" };
  }
  try {
    const value = applyDerivation(sourceValue, sourceType, ops, (path) => {
      const resolved = resolvePathForMode({
        path,
        preferredCollectionId,
        modeName,
        context,
      });
      return resolved.status === "literal" ? resolved.value : undefined;
    });
    return { status: "literal", value, type: sourceType };
  } catch {
    return { status: "missing" };
  }
}

function readDerivationOps(entry: TokenMapEntry): DerivationOp[] {
  const derivation = entry.$extensions?.tokenmanager?.derivation;
  if (!derivation) return [];
  return derivation.ops;
}

function resolvePathForMode({
  path,
  preferredCollectionId,
  modeName,
  context,
}: {
  path: string;
  preferredCollectionId: string;
  modeName: string;
  context: ModeRowsContext;
}): ResolvedModeValue {
  const resolution = resolveCollectionIdForPath({
    path,
    preferredCollectionId,
    pathToCollectionId: context.pathToCollectionId,
    collectionIdsByPath: context.collectionIdsByPath,
  });
  if (!resolution.collectionId || resolution.reason === "missing") {
    return { status: "missing" };
  }
  if (resolution.reason === "ambiguous") {
    return { status: "ambiguous" };
  }

  const collection = context.collections.find(
    (candidate) => candidate.id === resolution.collectionId,
  );
  const entry = context.perCollectionFlat[resolution.collectionId]?.[path];
  if (!collection || !entry) {
    return { status: "missing" };
  }

  const effectiveModeName = collection.modes.some((mode) => mode.name === modeName)
    ? modeName
    : collection.modes[0]?.name;
  if (!effectiveModeName) {
    return { status: "missing" };
  }

  const modeValues = readTokenModeValuesForCollection(entry, collection);
  const authored = modeValues[effectiveModeName];
  if (extractReferencePaths(authored).length === 0) {
    return { status: "literal", value: authored, type: entry.$type };
  }

  const chain = resolveTokenAncestors({
    tokenPath: path,
    collectionId: resolution.collectionId,
    collections: context.collections,
    tokensByCollection: context.perCollectionFlat,
    pathToCollectionId: context.pathToCollectionId,
    collectionIdsByPath: context.collectionIdsByPath,
  }).chains.find((candidate) => candidate.modeName === effectiveModeName);

  if (!chain) {
    return { status: "missing" };
  }
  if (chain.terminalKind !== "literal") {
    return { status: chain.terminalKind };
  }
  return {
    status: "literal",
    value: chain.terminalValue,
    type: chain.terminalType ?? entry.$type,
  };
}

function formatResolvedValue(
  tokenType: string | undefined,
  resolved: ResolvedModeValue,
): string {
  if (resolved.status === "literal") {
    return formatTokenValueForDisplay(tokenType, resolved.value);
  }
  if (resolved.status === "missing") return "Missing source";
  if (resolved.status === "ambiguous") return "Ambiguous source";
  if (resolved.status === "cycle") return "Circular reference";
  return "Too many links";
}

function statusLabel(
  sourcePath: string | undefined,
  status: ResolvedModeValue["status"],
  isDerived: boolean,
): string {
  if (!sourcePath) return "Authored directly";
  if (status === "literal") return isDerived ? "Modified from source" : "Linked";
  if (status === "missing") return "Source is missing";
  if (status === "ambiguous") return "Source is ambiguous";
  if (status === "cycle") return "Circular reference";
  return "Reference chain is too deep";
}

function findModeDependencyEdge(
  graph: GraphModel,
  tokenId: GraphNodeId,
  modeName: string,
  sourcePath: string,
): GraphEdgeId | undefined {
  for (const edgeId of graph.incoming.get(tokenId) ?? []) {
    const edge = graph.edges.get(edgeId);
    if (!edge) continue;
    if (edge.kind === "alias" && edgeActiveInMode(edge, modeName)) {
      const sourceNode = graph.nodes.get(edge.from);
      if (nodePath(sourceNode) === sourcePath) return edge.id;
    }
    if (edge.kind === "derivation-produces") {
      for (const sourceEdgeId of graph.incoming.get(edge.from) ?? []) {
        const sourceEdge = graph.edges.get(sourceEdgeId);
        if (
          sourceEdge?.kind === "derivation-source" &&
          !sourceEdge.paramLabel &&
          edgeActiveInMode(sourceEdge, modeName)
        ) {
          const sourceNode = graph.nodes.get(sourceEdge.from);
          if (nodePath(sourceNode) === sourcePath) return sourceEdge.id;
        }
      }
    }
  }
  return undefined;
}

function edgeActiveInMode(
  edge: Extract<GraphEdge, { kind: "alias" | "derivation-source" }>,
  modeName: string,
): boolean {
  const modeNames = edge.modeNames ?? [];
  return modeNames.length === 0 || modeNames.includes(modeName);
}

function nodePath(
  node: ReturnType<GraphModel["nodes"]["get"]>,
): string | undefined {
  if (!node) return undefined;
  if (node.kind === "token" || node.kind === "ghost") return node.path;
  if (node.kind === "derivation") return node.derivedPath;
  return undefined;
}
