import { useState, useCallback } from 'react';
import { apiFetch, ApiError } from '../shared/apiFetch';
import {
  createTokenBody,
  updateToken,
} from '../shared/tokenMutations';

export interface UseExtractToAliasParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  onRefresh: () => void;
}

export interface SharedAliasSourceToken {
  path: string;
  setName: string;
}

export interface PromoteToSharedAliasParams {
  serverUrl: string;
  primitivePath: string;
  primitiveSet: string;
  sourceTokens: SharedAliasSourceToken[];
  tokenType?: string;
  tokenValue: unknown;
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
  primitiveSet,
  sourceTokens,
  tokenType,
  tokenValue,
}: PromoteToSharedAliasParams): Promise<void> {
  await apiFetch(`${serverUrl}/api/tokens/promote-alias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      primitivePath,
      primitiveSet,
      sourceTokens,
      tokenType,
      tokenValue,
    }),
  });
}

export function useExtractToAlias({
  connected,
  serverUrl,
  setName,
  onRefresh,
}: UseExtractToAliasParams) {
  const [extractToken, setExtractToken] = useState<{ path: string; $type?: string; $value: any } | null>(null);
  const [extractMode, setExtractMode] = useState<'new' | 'existing'>('new');
  const [newPrimitivePath, setNewPrimitivePath] = useState('');
  const [newPrimitiveSet, setNewPrimitiveSet] = useState('');
  const [existingAlias, setExistingAlias] = useState('');
  const [existingAliasSearch, setExistingAliasSearch] = useState('');
  const [extractError, setExtractError] = useState('');

  const handleOpenExtractToAlias = useCallback((path: string, $type?: string, $value?: any) => {
    const suggested = suggestSharedAliasPath([path], $type);
    setNewPrimitivePath(suggested);
    setNewPrimitiveSet(setName);
    setExistingAlias('');
    setExistingAliasSearch('');
    setExtractMode('new');
    setExtractError('');
    setExtractToken({ path, $type, $value });
  }, [setName]);

  const handleConfirmExtractToAlias = useCallback(async () => {
    if (!extractToken || !connected) return;
    setExtractError('');

    if (extractMode === 'new') {
      if (!newPrimitivePath.trim()) { setExtractError('Enter a path for the new primitive token.'); return; }
      try {
        await promoteTokensToSharedAlias({
          serverUrl,
          primitivePath: newPrimitivePath.trim(),
          primitiveSet: newPrimitiveSet,
          sourceTokens: [{ path: extractToken.path, setName }],
          tokenType: extractToken.$type,
          tokenValue: extractToken.$value,
        });
      } catch (err) {
        setExtractError(err instanceof ApiError ? err.message : 'Failed to create primitive token.');
        return;
      }
    } else {
      if (!existingAlias) { setExtractError('Select an existing token to alias.'); return; }
      await updateToken(serverUrl, setName, extractToken.path, createTokenBody({
        $value: `{${existingAlias}}`,
      }));
    }

    setExtractToken(null);
    onRefresh();
  }, [extractToken, extractMode, newPrimitivePath, newPrimitiveSet, existingAlias, connected, serverUrl, setName, onRefresh]);

  return {
    extractToken, setExtractToken,
    extractMode, setExtractMode,
    newPrimitivePath, setNewPrimitivePath,
    newPrimitiveSet, setNewPrimitiveSet,
    existingAlias, setExistingAlias,
    existingAliasSearch, setExistingAliasSearch,
    extractError, setExtractError,
    handleOpenExtractToAlias,
    handleConfirmExtractToAlias,
    promoteTokensToSharedAlias,
  };
}
