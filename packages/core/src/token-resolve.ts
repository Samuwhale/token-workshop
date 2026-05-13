import type { Token, TokenCollection } from "./types.js";
import { readTokenModeValuesForCollection } from "./collections.js";
import {
  extractReferencePaths,
  isFormula,
  isReference,
  parseReference,
} from "./dtcg-types.js";
import { resolveCollectionIdForPath } from "./collection-paths.js";
import { makeReferenceGlobalRegex } from "./constants.js";
import { evalExpr } from "./eval-expr.js";

type ResolvedTokenLike = Pick<Token, "$value" | "$type" | "$extensions">;

// Pure mode-aware upstream alias walker. Used by:
// - useTokenAncestors hook (TokenDetails "Resolves to" block)
// - DetachConfirm popover (per-mode terminal literal preview)
// Stays pure so the same code can run on the server in future lint rules.

export interface AncestorChainRow {
  path: string;
  collectionId?: string;
  formulaSource?: string;
  status?: "missing" | "ambiguous" | "cycle";
}

export type AncestorTerminalKind =
  | "literal"
  | "missing"
  | "ambiguous"
  | "cycle"
  | "depth";

export interface AncestorChainByMode {
  modeName: string;
  rows: AncestorChainRow[];
  terminalKind: AncestorTerminalKind;
  terminalValue?: unknown;
  terminalType?: string;
}

const MAX_HOPS = 16;

interface ResolvedModeTerminal {
  terminalKind: AncestorTerminalKind;
  terminalValue?: unknown;
  terminalType?: string;
}

export interface ResolveTokenAncestorsParams {
  tokenPath: string;
  collectionId: string;
  collections: TokenCollection[];
  tokensByCollection: Record<string, Record<string, ResolvedTokenLike>>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}

function readModeValue(
  entry: ResolvedTokenLike,
  collection: TokenCollection,
  requestedModeName: string,
): { found: boolean; value?: unknown } {
  const modeValues = readTokenModeValuesForCollection(
    {
      $value: entry.$value,
      ...(entry.$extensions ? { $extensions: entry.$extensions } : {}),
    } as Parameters<typeof readTokenModeValuesForCollection>[0],
    collection,
  );
  if (Object.prototype.hasOwnProperty.call(modeValues, requestedModeName)) {
    return { found: true, value: modeValues[requestedModeName] };
  }
  return { found: false };
}

function extractNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    const numericValue = (value as { value: unknown }).value;
    return typeof numericValue === "number" ? numericValue : null;
  }
  return null;
}

function inferFormulaUnit(
  resolvedRefs: Array<Pick<ResolvedModeTerminal, "terminalType" | "terminalValue">>,
): string | null {
  for (const resolvedRef of resolvedRefs) {
    const value = resolvedRef.terminalValue;
    if (typeof value === "object" && value !== null && "unit" in value) {
      const unit = (value as { unit: unknown }).unit;
      if (typeof unit === "string" && unit.trim().length > 0) {
        return unit;
      }
    }
    if (typeof value === "number") {
      if (resolvedRef.terminalType === "dimension") {
        return "px";
      }
      if (resolvedRef.terminalType === "duration") {
        return "ms";
      }
    }
  }
  return null;
}

function wrapResolvedFormulaValue(
  value: number,
  terminalType: string | undefined,
  resolvedRefs: Array<Pick<ResolvedModeTerminal, "terminalType" | "terminalValue">>,
): unknown {
  if (terminalType === "dimension") {
    return {
      value,
      unit: inferFormulaUnit(resolvedRefs) ?? "px",
    };
  }
  if (terminalType === "duration") {
    return {
      value,
      unit: inferFormulaUnit(resolvedRefs) ?? "ms",
    };
  }
  return value;
}

function resolveModeValue(params: {
  value: unknown;
  terminalType?: string;
  modeName: string;
  preferredCollectionId: string;
  collectionsById: Map<string, TokenCollection>;
  tokensByCollection: Record<string, Record<string, ResolvedTokenLike>>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  visited: Set<string>;
  depth: number;
}): ResolvedModeTerminal {
  if (params.depth >= MAX_HOPS) {
    return { terminalKind: "depth" };
  }

  if (typeof params.value === "string" && isReference(params.value)) {
    const nextPath = parseReference(params.value);
    const resolution = resolveCollectionIdForPath({
      path: nextPath,
      pathToCollectionId: params.pathToCollectionId,
      collectionIdsByPath: params.collectionIdsByPath,
      preferredCollectionId: params.preferredCollectionId,
    });
    if (!resolution.collectionId || resolution.reason === "missing") {
      return { terminalKind: "missing" };
    }
    if (resolution.reason === "ambiguous") {
      return { terminalKind: "ambiguous" };
    }
    return resolveTokenModeTerminal({
      tokenPath: nextPath,
      collectionId: resolution.collectionId,
      modeName: params.modeName,
      collectionsById: params.collectionsById,
      tokensByCollection: params.tokensByCollection,
      pathToCollectionId: params.pathToCollectionId,
      collectionIdsByPath: params.collectionIdsByPath,
      visited: params.visited,
      depth: params.depth + 1,
    });
  }

  if (typeof params.value === "string" && isFormula(params.value)) {
    const resolvedRefs: ResolvedModeTerminal[] = [];
    try {
      const substituted = params.value.replace(
        makeReferenceGlobalRegex(),
        (_match, refPath: string) => {
          const resolution = resolveCollectionIdForPath({
            path: refPath,
            pathToCollectionId: params.pathToCollectionId,
            collectionIdsByPath: params.collectionIdsByPath,
            preferredCollectionId: params.preferredCollectionId,
          });
          if (!resolution.collectionId || resolution.reason === "missing") {
            throw new Error("missing");
          }
          if (resolution.reason === "ambiguous") {
            throw new Error("ambiguous");
          }
          const resolvedRef = resolveTokenModeTerminal({
            tokenPath: refPath,
            collectionId: resolution.collectionId,
            modeName: params.modeName,
            collectionsById: params.collectionsById,
            tokensByCollection: params.tokensByCollection,
            pathToCollectionId: params.pathToCollectionId,
            collectionIdsByPath: params.collectionIdsByPath,
            visited: params.visited,
            depth: params.depth + 1,
          });
          if (resolvedRef.terminalKind !== "literal") {
            throw new Error(resolvedRef.terminalKind);
          }
          const numericValue = extractNumericValue(resolvedRef.terminalValue);
          if (numericValue === null) {
            throw new Error("missing");
          }
          resolvedRefs.push(resolvedRef);
          return String(numericValue);
        },
      );
      const evaluated = evalExpr(substituted);
      return {
        terminalKind: "literal",
        terminalType: params.terminalType,
        terminalValue: wrapResolvedFormulaValue(
          evaluated,
          params.terminalType,
          resolvedRefs,
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "ambiguous") {
        return { terminalKind: "ambiguous" };
      }
      if (message === "cycle") {
        return { terminalKind: "cycle" };
      }
      if (message === "depth") {
        return { terminalKind: "depth" };
      }
      return { terminalKind: "missing" };
    }
  }

  return {
    terminalKind: "literal",
    terminalValue: params.value,
    terminalType: params.terminalType,
  };
}

function resolveTokenModeTerminal(params: {
  tokenPath: string;
  collectionId: string;
  modeName: string;
  collectionsById: Map<string, TokenCollection>;
  tokensByCollection: Record<string, Record<string, ResolvedTokenLike>>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  visited: Set<string>;
  depth: number;
}): ResolvedModeTerminal {
  if (params.depth >= MAX_HOPS) {
    return { terminalKind: "depth" };
  }

  const visitKey = `${params.collectionId}::${params.tokenPath}::${params.modeName}`;
  if (params.visited.has(visitKey)) {
    return { terminalKind: "cycle" };
  }

  const collection = params.collectionsById.get(params.collectionId);
  const entry = params.tokensByCollection[params.collectionId]?.[params.tokenPath];
  if (!collection || !entry) {
    return { terminalKind: "missing" };
  }

  const nextVisited = new Set(params.visited);
  nextVisited.add(visitKey);

  const modeValue = readModeValue(entry, collection, params.modeName);
  if (!modeValue.found) {
    return { terminalKind: "missing" };
  }

  return resolveModeValue({
    value: modeValue.value,
    terminalType: entry.$type,
    modeName: params.modeName,
    preferredCollectionId: params.collectionId,
    collectionsById: params.collectionsById,
    tokensByCollection: params.tokensByCollection,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
    visited: nextVisited,
    depth: params.depth + 1,
  });
}

export function resolveTokenAncestors({
  tokenPath,
  collectionId,
  collections,
  tokensByCollection,
  pathToCollectionId,
  collectionIdsByPath,
}: ResolveTokenAncestorsParams): {
  chains: AncestorChainByMode[];
  isEmpty: boolean;
} {
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const ownerCollection = collectionsById.get(collectionId);
  const collectionEntries = tokensByCollection[collectionId];
  if (!ownerCollection || !collectionEntries) {
    return { chains: [], isEmpty: true };
  }
  const originEntry = collectionEntries[tokenPath];
  if (!originEntry) {
    return { chains: [], isEmpty: true };
  }

  const originModeValues = readTokenModeValuesForCollection(
    {
      $value: originEntry.$value,
      ...(originEntry.$extensions ? { $extensions: originEntry.$extensions } : {}),
    } as Parameters<typeof readTokenModeValuesForCollection>[0],
    ownerCollection,
  );

  const chains: AncestorChainByMode[] = [];
  for (const [modeName, modeValue] of Object.entries(originModeValues)) {
    const initialRefs = extractReferencePaths(modeValue);
    if (initialRefs.length === 0) continue;

    const resolvedTerminal = resolveModeValue({
      value: modeValue,
      terminalType: originEntry.$type,
      modeName,
      preferredCollectionId: collectionId,
      collectionsById,
      tokensByCollection,
      pathToCollectionId,
      collectionIdsByPath,
      visited: new Set([`${collectionId}::${tokenPath}::${modeName}`]),
      depth: 0,
    });

    const rows: AncestorChainRow[] = [];
    const visited = new Set<string>([`${collectionId}::${tokenPath}`]);

    let currentValue: unknown = modeValue;
    let currentCollectionId = collectionId;
    let pendingFormula: string | undefined = isFormula(modeValue)
      ? (modeValue as string)
      : undefined;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const refs = extractReferencePaths(currentValue);
      if (refs.length === 0) {
        break;
      }

      const nextPath = refs[0];
      if (!nextPath) {
        break;
      }

      const resolution = resolveCollectionIdForPath({
        path: nextPath,
        pathToCollectionId,
        collectionIdsByPath,
        preferredCollectionId: currentCollectionId,
      });

      const nextCollectionId = resolution.collectionId;
      const terminalStatus =
        !nextCollectionId || resolution.reason === "missing"
          ? "missing"
          : resolution.reason === "ambiguous"
            ? "ambiguous"
            : null;

      const row: AncestorChainRow = {
        path: nextPath,
        ...(nextCollectionId ? { collectionId: nextCollectionId } : {}),
        ...(pendingFormula ? { formulaSource: pendingFormula } : {}),
        ...(terminalStatus ? { status: terminalStatus } : {}),
      };
      pendingFormula = undefined;

      if (terminalStatus || !nextCollectionId) {
        rows.push(row);
        break;
      }

      const key = `${nextCollectionId}::${nextPath}`;
      if (visited.has(key)) {
        row.status = "cycle";
        rows.push(row);
        break;
      }
      visited.add(key);

      const nextCollection = collectionsById.get(nextCollectionId);
      const nextEntry = tokensByCollection[nextCollectionId]?.[nextPath];
      if (!nextCollection || !nextEntry) {
        row.status = "missing";
        rows.push(row);
        break;
      }

      const nextMode = readModeValue(nextEntry, nextCollection, modeName);
      rows.push(row);

      if (!nextMode.found) {
        row.status = "missing";
        break;
      }

      if (typeof nextMode.value === "string" && isFormula(nextMode.value)) {
        pendingFormula = nextMode.value;
      }

      currentValue = nextMode.value;
      currentCollectionId = nextCollectionId;
    }

    chains.push({
      modeName,
      rows,
      terminalKind: resolvedTerminal.terminalKind,
      terminalValue:
        resolvedTerminal.terminalKind === "literal"
          ? resolvedTerminal.terminalValue
          : undefined,
      terminalType:
        resolvedTerminal.terminalKind === "literal"
          ? resolvedTerminal.terminalType
          : undefined,
    });
  }

  return { chains, isEmpty: chains.length === 0 };
}
