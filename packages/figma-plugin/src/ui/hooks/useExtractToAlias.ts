import { useState, useCallback } from 'react';
import { apiFetch, ApiError } from '../shared/apiFetch';
import type {
  ExtractAliasMode,
  ExtractAliasTokenDraft,
} from '../shared/tokenListModalTypes';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenCollection } from '@token-workshop/core';
import { rewireAliasModes } from '../shared/aliasMutations';

export interface UseExtractToAliasParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  onRefresh: () => void;
}

export interface SharedAliasSourceToken {
  path: string;
  collectionId: string;
}

export interface PromoteToSharedAliasParams {
  serverUrl: string;
  primitivePath: string;
  primitiveCollectionId: string;
  sourceTokens: SharedAliasSourceToken[];
}

function normalizePathSegment(segment: string): string {
  return segment
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function getSharedPathTail(paths: string[]): string[] {
  if (paths.length === 0) return ['token'];

  const splitPaths = paths.map(path => path.split('.').filter(Boolean));
  const sharedSuffix: string[] = [];
  const minLength = Math.min(...splitPaths.map(segments => segments.length));

  for (let offset = 1; offset <= minLength; offset += 1) {
    const candidate = splitPaths[0][splitPaths[0].length - offset];
    if (!candidate || !splitPaths.every(segments => segments[segments.length - offset] === candidate)) {
      break;
    }
    sharedSuffix.unshift(candidate);
  }

  if (sharedSuffix.length > 0) {
    return sharedSuffix;
  }

  const lastSegments = splitPaths
    .map(segments => normalizePathSegment(segments[segments.length - 1] ?? ''))
    .filter(Boolean);
  if (lastSegments.length === 0) return ['token'];

  const counts = new Map<string, number>();
  for (const segment of lastSegments) {
    counts.set(segment, (counts.get(segment) ?? 0) + 1);
  }
  const bestSegment = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

  return [bestSegment ?? lastSegments[0]];
}

export function suggestSharedAliasPath(paths: string[], tokenType?: string): string {
  const typeSegment = normalizePathSegment(tokenType ?? '') || 'color';
  const tail = getSharedPathTail(paths)
    .map(segment => normalizePathSegment(segment))
    .filter(Boolean);

  return ['primitives', typeSegment, ...(tail.length > 0 ? tail : ['token'])].join('.');
}

export function ensureUniqueSharedAliasPath(
  desiredPath: string,
  occupiedPaths: Iterable<string>,
): string {
  const occupied = new Set(occupiedPaths);
  if (!occupied.has(desiredPath)) return desiredPath;

  let counter = 2;
  while (occupied.has(`${desiredPath}.${counter}`)) {
    counter += 1;
  }
  return `${desiredPath}.${counter}`;
}

export async function promoteTokensToSharedAlias({
  serverUrl,
  primitivePath,
  primitiveCollectionId,
  sourceTokens,
}: PromoteToSharedAliasParams): Promise<void> {
  await apiFetch(`${serverUrl}/api/tokens/promote-alias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primitivePath,
      primitiveCollectionId,
      sourceTokens,
    }),
  });
}

export function useExtractToAlias({
  connected,
  serverUrl,
  collectionId,
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
  onRefresh,
}: UseExtractToAliasParams) {
  const [extractToken, setExtractToken] = useState<ExtractAliasTokenDraft | null>(null);
  const [extractMode, setExtractMode] = useState<ExtractAliasMode>('new');
  const [newPrimitivePath, setNewPrimitivePath] = useState('');
  const [newPrimitiveCollectionId, setNewPrimitiveCollectionId] = useState('');
  const [existingAlias, setExistingAlias] = useState('');
  const [existingAliasSearch, setExistingAliasSearch] = useState('');
  const [extractError, setExtractError] = useState('');

  const handleOpenExtractToAlias = useCallback((path: string, $type?: string, $value?: unknown) => {
    const suggested = ensureUniqueSharedAliasPath(
      suggestSharedAliasPath([path], $type),
      Object.keys(perCollectionFlat[collectionId] ?? {}),
    );
    setNewPrimitivePath(suggested);
    setNewPrimitiveCollectionId(collectionId);
    setExistingAlias('');
    setExistingAliasSearch('');
    setExtractMode('new');
    setExtractError('');
    setExtractToken({ path, $type, $value });
  }, [collectionId, perCollectionFlat]);

  const handleConfirmExtractToAlias = useCallback(async () => {
    if (!extractToken || !connected) return;
    setExtractError('');

    if (extractMode === 'new') {
      if (!newPrimitivePath.trim()) { setExtractError('Enter a path for the new primitive token.'); return; }
      try {
        await promoteTokensToSharedAlias({
          serverUrl,
          primitivePath: newPrimitivePath.trim(),
          primitiveCollectionId: newPrimitiveCollectionId,
          sourceTokens: [{ path: extractToken.path, collectionId: collectionId }],
        });
      } catch (err) {
        setExtractError(err instanceof ApiError ? err.message : 'Failed to create primitive token.');
        return;
      }
    } else {
      if (!existingAlias) { setExtractError('Select an existing token to alias.'); return; }
      const matchingCollections = Object.entries(perCollectionFlat)
        .filter(([, tokens]) => Boolean(tokens[existingAlias]))
        .map(([candidateCollectionId]) => candidateCollectionId);
      if (matchingCollections.length !== 1) {
        setExtractError('Choose a token path that exists in one collection only.');
        return;
      }
      const currentCollection = collections.find((collection) => collection.id === collectionId);
      if (!currentCollection) {
        setExtractError('Current collection is no longer available.');
        return;
      }
      try {
        await rewireAliasModes({
          serverUrl,
          collection: currentCollection,
          tokenPath: extractToken.path,
          targetPath: existingAlias,
          targetCollectionId: matchingCollections[0],
          pathToCollectionId,
          collectionIdsByPath,
          modeNames: currentCollection.modes.map((mode) => mode.name),
        });
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : 'Failed to update alias modes.');
        return;
      }
    }

    setExtractToken(null);
    onRefresh();
  }, [
    collectionId,
    collectionIdsByPath,
    collections,
    connected,
    existingAlias,
    extractMode,
    extractToken,
    newPrimitiveCollectionId,
    newPrimitivePath,
    onRefresh,
    pathToCollectionId,
    perCollectionFlat,
    serverUrl,
  ]);

  return {
    extractToken, setExtractToken,
    extractMode, setExtractMode,
    newPrimitivePath, setNewPrimitivePath,
    newPrimitiveCollectionId, setNewPrimitiveCollectionId,
    existingAlias, setExistingAlias,
    existingAliasSearch, setExistingAliasSearch,
    extractError, setExtractError,
    handleOpenExtractToAlias,
    handleConfirmExtractToAlias,
    promoteTokensToSharedAlias,
  };
}
