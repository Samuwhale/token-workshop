import {
  readTokenCollectionModeValues,
  type TokenLifecycle,
} from "@tokenmanager/core";
import { extractAliasPath } from "../../shared/resolveAlias";

interface TokenUsageEntry {
  $value: unknown;
  $extensions?: Record<string, unknown>;
  $lifecycle?: TokenLifecycle;
}

interface ComputeUnusedTokenPathOptions {
  includeDeprecated?: boolean;
}

export function collectReferencedTokenPaths(value: unknown, referencedPaths: Set<string>): void {
  if (typeof value === "string") {
    const aliasPath = extractAliasPath(value);
    if (aliasPath) {
      referencedPaths.add(aliasPath);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferencedTokenPaths(item, referencedPaths);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectReferencedTokenPaths(nestedValue, referencedPaths);
    }
  }
}

function collectReferencedPathsFromEntry<T extends TokenUsageEntry>(
  entry: T,
  referencedPaths: Set<string>,
): void {
  collectReferencedTokenPaths(entry.$value, referencedPaths);

  const modeValues = readTokenCollectionModeValues(entry);
  for (const collectionModes of Object.values(modeValues)) {
    for (const modeValue of Object.values(collectionModes)) {
      collectReferencedTokenPaths(modeValue, referencedPaths);
    }
  }
}

export function buildReferencedTokenPathSet<T extends TokenUsageEntry>(
  entriesByPath: Record<string, T>,
): Set<string> {
  const referencedPaths = new Set<string>();

  for (const entry of Object.values(entriesByPath)) {
    collectReferencedPathsFromEntry(entry, referencedPaths);
  }

  return referencedPaths;
}

export function computeUnusedTokenPaths<T extends TokenUsageEntry>(
  entriesByPath: Record<string, T>,
  tokenUsageCounts: Record<string, number>,
  options: ComputeUnusedTokenPathOptions = {},
): Set<string> {
  const referencedPaths = buildReferencedTokenPathSet(entriesByPath);
  const includeDeprecated = options.includeDeprecated ?? true;
  const unusedPaths = new Set<string>();

  for (const [path, entry] of Object.entries(entriesByPath)) {
    if (!includeDeprecated && entry.$lifecycle === "deprecated") {
      continue;
    }
    if ((tokenUsageCounts[path] ?? 0) > 0 || referencedPaths.has(path)) {
      continue;
    }
    unusedPaths.add(path);
  }

  return unusedPaths;
}
