import {
  flattenTokenGroup,
  isValidCollectionName as isCoreValidCollectionName,
  isDTCGToken,
  readTokenCollectionModeValues,
  writeTokenCollectionModeValues,
  type DTCGToken,
  type Token,
  type TokenGroup,
  type TokenModeValues,
} from "@tokenmanager/core";
import {
  getSnapshotTokenPath,
  type SnapshotEntry,
} from "./operation-log.js";
import { setTokenAtPath } from "./token-tree-utils.js";

const FOLDER_ITEM_SUFFIX = "/";
const GENERATOR_EXTENSION_KEY = "com.tokenmanager.generator";
const TOKENMANAGER_EXTENSION_KEY = "tokenmanager";
const GRAPH_EXTENSION_KEY = "graph";

export interface FolderCollectionRename {
  from: string;
  to: string;
}

export function isValidCollectionName(name: string): boolean {
  return isCoreValidCollectionName(name);
}

function isFolderItemKey(item: string): boolean {
  return item.endsWith(FOLDER_ITEM_SUFFIX);
}

function topLevelFolderName(collectionId: string): string | null {
  const slashIdx = collectionId.indexOf("/");
  return slashIdx === -1 ? null : collectionId.slice(0, slashIdx);
}

export function buildTopLevelItems(collectionIds: string[]): string[] {
  const items: string[] = [];
  const seenFolders = new Set<string>();
  for (const collectionId of collectionIds) {
    const folder = topLevelFolderName(collectionId);
    if (!folder) {
      items.push(collectionId);
      continue;
    }
    if (seenFolders.has(folder)) continue;
    seenFolders.add(folder);
    items.push(`${folder}${FOLDER_ITEM_SUFFIX}`);
  }
  return items;
}

export function expandTopLevelItems(
  collectionIds: string[],
  order: string[],
): string[] {
  const standaloneCollections = new Map<string, string>();
  const collectionsByFolder = new Map<string, string[]>();
  for (const collectionId of collectionIds) {
    const folder = topLevelFolderName(collectionId);
    if (!folder) {
      standaloneCollections.set(collectionId, collectionId);
      continue;
    }
    const members = collectionsByFolder.get(folder) ?? [];
    members.push(collectionId);
    collectionsByFolder.set(folder, members);
  }

  const expanded: string[] = [];
  for (const item of order) {
    if (isFolderItemKey(item)) {
      expanded.push(...(collectionsByFolder.get(item.slice(0, -1)) ?? []));
      continue;
    }
    if (standaloneCollections.has(item)) {
      expanded.push(item);
    }
  }
  return expanded;
}

export function getFolderCollectionIds(
  allCollectionIds: string[],
  folder: string,
): string[] {
  const prefix = `${folder}/`;
  return allCollectionIds.filter((collectionId) =>
    collectionId.startsWith(prefix),
  );
}

export function sortFolderRenamePairsForApply(
  pairs: FolderCollectionRename[],
): FolderCollectionRename[] {
  return [...pairs].sort((left, right) => right.from.length - left.from.length);
}

export function sortFolderRenamePairsForRollback(
  pairs: FolderCollectionRename[],
): FolderCollectionRename[] {
  return [...pairs].reverse().map(({ from, to }) => ({ from: to, to: from }));
}

export function findFolderRenameConflicts(
  allCollectionIds: string[],
  sourceCollectionIds: string[],
  renames: FolderCollectionRename[],
): string[] {
  const sourceCollectionLookup = new Set(sourceCollectionIds);
  const conflicts = new Set<string>();
  const targetCounts = new Map<string, number>();

  for (const rename of renames) {
    targetCounts.set(rename.to, (targetCounts.get(rename.to) ?? 0) + 1);
  }

  for (const [target, count] of targetCounts) {
    if (count > 1) {
      conflicts.add(target);
    }
  }

  for (const rename of renames) {
    if (!isValidCollectionName(rename.to)) {
      conflicts.add(rename.to);
      continue;
    }
    if (
      !sourceCollectionLookup.has(rename.to) &&
      allCollectionIds.includes(rename.to)
    ) {
      conflicts.add(rename.to);
    }
  }

  return [...conflicts].sort((a, b) => a.localeCompare(b));
}

export function renameCollectionModeKey(
  modes: TokenModeValues,
  oldCollectionId: string,
  newCollectionId: string,
): TokenModeValues | null {
  if (!(oldCollectionId in modes)) {
    return null;
  }

  const nextModes = {
    ...modes,
    [newCollectionId]: structuredClone(modes[oldCollectionId]),
  };
  delete nextModes[oldCollectionId];
  return nextModes;
}

export function copyCollectionModeKey(
  modes: TokenModeValues,
  sourceCollectionId: string,
  targetCollectionId: string,
): TokenModeValues | null {
  if (!(sourceCollectionId in modes)) {
    return null;
  }

  const nextModes = {
    ...modes,
    [targetCollectionId]: structuredClone(modes[sourceCollectionId]),
  };
  return nextModes;
}

export function rewriteTokenGroupCollectionModes(
  tokens: TokenGroup,
  rewrite: (modes: TokenModeValues) => TokenModeValues | null,
): { tokens: TokenGroup; changed: boolean } {
  const nextTokens = structuredClone(tokens);
  let changed = false;

  for (const [, token] of flattenTokenGroup(nextTokens)) {
    const nextModes = rewrite(readTokenCollectionModeValues(token as Token));
    if (!nextModes) {
      continue;
    }
    writeTokenCollectionModeValues(token as Token, nextModes);
    changed = true;
  }

  return { tokens: nextTokens, changed };
}

export function stripGeneratedOwnershipFromTokenGroup(
  tokens: TokenGroup,
): TokenGroup {
  const cloned = structuredClone(tokens);

  const visit = (node: Record<string, unknown>): void => {
    if (isDTCGToken(node)) {
      const extensions = node.$extensions;
      if (
        extensions &&
        typeof extensions === "object" &&
        (GENERATOR_EXTENSION_KEY in extensions ||
          TOKENMANAGER_EXTENSION_KEY in extensions)
      ) {
        const nextExtensions = { ...extensions };
        delete nextExtensions[GENERATOR_EXTENSION_KEY];
        const tokenmanager =
          nextExtensions[TOKENMANAGER_EXTENSION_KEY];
        if (
          tokenmanager &&
          typeof tokenmanager === "object" &&
          !Array.isArray(tokenmanager) &&
          GRAPH_EXTENSION_KEY in tokenmanager
        ) {
          const nextTokenmanager = { ...(tokenmanager as Record<string, unknown>) };
          delete nextTokenmanager[GRAPH_EXTENSION_KEY];
          if (Object.keys(nextTokenmanager).length > 0) {
            nextExtensions[TOKENMANAGER_EXTENSION_KEY] = nextTokenmanager;
          } else {
            delete nextExtensions[TOKENMANAGER_EXTENSION_KEY];
          }
        }
        if (Object.keys(nextExtensions).length > 0) {
          node.$extensions = nextExtensions;
        } else {
          delete node.$extensions;
        }
      }
      return;
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        visit(value as Record<string, unknown>);
      }
    }
  };

  visit(cloned as Record<string, unknown>);
  return cloned;
}

export function stripGeneratedOwnershipFromToken(token: DTCGToken): Token {
  return stripGeneratedOwnershipFromTokenGroup({
    value: token as unknown as TokenGroup,
  }).value as Token;
}

export function buildTokenGroupFromSnapshot(
  snapshot: Record<string, SnapshotEntry>,
  collectionId: string,
): TokenGroup {
  const tokens: TokenGroup = {};
  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    if (entry.collectionId !== collectionId || entry.token === null) {
      continue;
    }
    setTokenAtPath(
      tokens,
      getSnapshotTokenPath(snapshotKey, collectionId),
      structuredClone(entry.token),
    );
  }
  return tokens;
}
