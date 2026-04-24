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

export function entryReferencesAnyTokenPath<T extends TokenUsageEntry>(
  entry: T,
  targetPaths: ReadonlySet<string>,
): boolean {
  if (targetPaths.size === 0) {
    return false;
  }

  const referencedPaths = new Set<string>();
  collectReferencedPathsFromEntry(entry, referencedPaths);
  for (const path of referencedPaths) {
    if (targetPaths.has(path)) {
      return true;
    }
  }

  return false;
}

export function buildReferencedTokenPathSetFromEntries<
  T extends TokenUsageEntry,
>(entries: Iterable<T>): Set<string> {
  const referencedPaths = new Set<string>();

  for (const entry of entries) {
    collectReferencedPathsFromEntry(entry, referencedPaths);
  }

  return referencedPaths;
}

export function buildReferencedTokenPathSet<T extends TokenUsageEntry>(
  entriesByPath: Record<string, T>,
): Set<string> {
  return buildReferencedTokenPathSetFromEntries(Object.values(entriesByPath));
}

export function isTokenEntryUnused<T extends TokenUsageEntry>(
  path: string,
  entry: T,
  tokenUsageCounts: Record<string, number>,
  referencedPaths: Set<string>,
  options: ComputeUnusedTokenPathOptions = {},
): boolean {
  const includeDeprecated = options.includeDeprecated ?? true;
  if (!includeDeprecated && entry.$lifecycle === "deprecated") {
    return false;
  }

  return (tokenUsageCounts[path] ?? 0) === 0 && !referencedPaths.has(path);
}

export function computeUnusedTokenPaths<T extends TokenUsageEntry>(
  entriesByPath: Record<string, T>,
  tokenUsageCounts: Record<string, number>,
  options: ComputeUnusedTokenPathOptions = {},
): Set<string> {
  const referencedPaths = buildReferencedTokenPathSet(entriesByPath);
  const unusedPaths = new Set<string>();

  for (const [path, entry] of Object.entries(entriesByPath)) {
    if (
      isTokenEntryUnused(path, entry, tokenUsageCounts, referencedPaths, options)
    ) {
      unusedPaths.add(path);
    }
  }

  return unusedPaths;
}
