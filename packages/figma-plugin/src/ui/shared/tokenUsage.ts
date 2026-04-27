import {
  collectReferencePaths,
  extractDerivationRefPaths,
  getTokenManagerExt,
  readTokenCollectionModeValues,
  validateDerivationOps,
  type TokenLifecycle,
} from "@tokenmanager/core";

interface TokenUsageEntry {
  $value: unknown;
  $extensions?: Record<string, unknown>;
  $lifecycle?: TokenLifecycle;
}

interface ComputeUnusedTokenPathOptions {
  includeDeprecated?: boolean;
}

export function collectReferencedTokenPaths(value: unknown, referencedPaths: Set<string>): void {
  for (const path of collectReferencePaths(value)) {
    referencedPaths.add(path);
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

  const derivation = getTokenManagerExt({
    $extensions: entry.$extensions as Record<string, unknown> | undefined,
  })?.derivation;
  if (!derivation) {
    return;
  }

  try {
    const ops = validateDerivationOps(derivation.ops);
    for (const path of extractDerivationRefPaths(ops)) {
      referencedPaths.add(path);
    }
  } catch {
    // Ignore malformed derivations here so usage scanning stays resilient.
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
