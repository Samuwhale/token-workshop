import type { TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import {
  createRecentTokenKey,
  getRecentTokens,
} from './recentTokens';

export interface ScopedTokenCandidate {
  key: string;
  path: string;
  collectionId: string;
  entry: TokenMapEntry;
  resolvedEntry: TokenMapEntry;
  isAmbiguousPath: boolean;
}

interface BuildScopedTokenCandidatesParams {
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
}

function resolveScopedEntry(
  entry: TokenMapEntry,
  collectionFlat: Record<string, TokenMapEntry>,
  allTokensFlat: Record<string, TokenMapEntry>,
): TokenMapEntry {
  if (!isAlias(entry.$value)) return entry;

  const result = resolveTokenValue(entry.$value, entry.$type, collectionFlat);
  if (result.value != null) {
    return { ...entry, $value: result.value, $type: result.$type };
  }

  const fallback = resolveTokenValue(entry.$value, entry.$type, allTokensFlat);
  if (fallback.value != null) {
    return { ...entry, $value: fallback.value, $type: fallback.$type };
  }

  return entry;
}

export function buildScopedTokenCandidates({
  allTokensFlat,
  pathToCollectionId = {},
  perCollectionFlat = {},
}: BuildScopedTokenCandidatesParams): ScopedTokenCandidate[] {
  const scopedCollections = Object.entries(perCollectionFlat);
  const ownerCounts = new Map<string, number>();
  const candidates: ScopedTokenCandidate[] = [];

  if (scopedCollections.length > 0) {
    for (const [collectionId, collectionFlat] of scopedCollections) {
      for (const [path, entry] of Object.entries(collectionFlat)) {
        ownerCounts.set(path, (ownerCounts.get(path) ?? 0) + 1);
        candidates.push({
          key: createRecentTokenKey(path, collectionId),
          path,
          collectionId,
          entry,
          resolvedEntry: resolveScopedEntry(entry, collectionFlat, allTokensFlat),
          isAmbiguousPath: false,
        });
      }
    }

    return candidates.map((candidate) => ({
      ...candidate,
      isAmbiguousPath: (ownerCounts.get(candidate.path) ?? 0) > 1,
    }));
  }

  for (const [path, entry] of Object.entries(allTokensFlat)) {
    const collectionId = pathToCollectionId[path] ?? '';
    ownerCounts.set(path, (ownerCounts.get(path) ?? 0) + 1);
    candidates.push({
      key: collectionId ? createRecentTokenKey(path, collectionId) : path,
      path,
      collectionId,
      entry,
      resolvedEntry: resolveScopedEntry(entry, allTokensFlat, allTokensFlat),
      isAmbiguousPath: false,
    });
  }

  return candidates;
}

export function getRecentScopedTokenCandidates(
  candidates: ScopedTokenCandidate[],
  options?: { collectionId?: string },
): ScopedTokenCandidate[] {
  const candidatesByKey = new Map(
    candidates.map((candidate) => [candidate.key, candidate] as const),
  );

  const recentCandidates: ScopedTokenCandidate[] = [];
  for (const recent of getRecentTokens()) {
    if (options?.collectionId && recent.collectionId !== options.collectionId) {
      continue;
    }

    const candidate = candidatesByKey.get(
      createRecentTokenKey(recent.path, recent.collectionId),
    );
    if (candidate) {
      recentCandidates.push(candidate);
    }
  }

  return recentCandidates;
}
