import {
  normalizeTokenScopeValues,
  readTokenScopes,
  stripTokenScopesFromExtensions,
} from '@token-workshop/core';
import type { ApiError } from './apiFetch';
import { apiFetch } from './apiFetch';
import { dispatchToast } from './toastBus';
import { tokenPathToUrlSegment } from './utils';

export interface TokenMutationRequest {
  $type?: string;
  $value?: unknown;
  $description?: string | null;
  $extensions?: Record<string, unknown> | null;
  $scopes?: string[] | null;
}

export interface TokenMutationSnapshotToken {
  $type?: string;
  $value: unknown;
  $description?: string;
  $extensions?: Record<string, unknown>;
  $scopes?: readonly string[] | null;
}

export interface TokenValueDraftInput {
  type?: string | null;
  value: unknown;
  description?: string | null;
  extensions?: Record<string, unknown> | null;
  scopes?: readonly string[] | null;
  defaultScopes?: readonly string[] | null;
  clearEmptyDescription?: boolean;
  clearEmptyExtensions?: boolean;
}

export interface TokenModeValueDraftInput extends TokenValueDraftInput {
  collectionId: string;
  modeNames: readonly string[];
}

export type TokenMutationBody = TokenMutationRequest;
export type TokenMutationMode = 'create' | 'update' | 'upsert';

export interface TokenMutationResult<T = unknown> {
  kind: 'created' | 'updated';
  response: T;
}

export interface OperationRollbackResult {
  restoredPaths: string[];
  rollbackEntryId: string;
}

export interface TokenMutationSuccessOptions {
  onAfterSave?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onRecordTouch?: (path: string) => void;
  touchedPath?: string;
  successMessage?: string | null;
}

export function isTokenMutationConflictError(err: unknown): err is ApiError {
  return Boolean(err && err instanceof Error && (err as ApiError).name === 'ApiError' && (err as ApiError).status === 409);
}

export function createTokenBody(body: TokenMutationBody): TokenMutationBody {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  ) as TokenMutationBody;
}

export function normalizeTokenMutationType(type: string | null | undefined): string | undefined {
  if (typeof type !== 'string') return undefined;
  const trimmed = type.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTokenScopes(
  scopes?: readonly string[] | null,
  defaultScopes?: readonly string[] | null,
): string[] | undefined {
  const nextScopes =
    scopes !== undefined && scopes !== null
      ? scopes
      : defaultScopes !== undefined && defaultScopes !== null
        ? defaultScopes
        : undefined;
  if (nextScopes === undefined) {
    return undefined;
  }
  return normalizeTokenScopeValues(nextScopes);
}

function readScopesFromExtensions(
  extensions?: Record<string, unknown> | null,
): string[] | undefined {
  const scopes = readTokenScopes({ $extensions: extensions ?? undefined });
  return scopes.length > 0 ? scopes : undefined;
}

export function createTokenValueBody({
  type,
  value,
  description,
  extensions,
  scopes,
  defaultScopes,
  clearEmptyDescription = false,
  clearEmptyExtensions = false,
}: TokenValueDraftInput): TokenMutationBody {
  const hasExplicitScopes = scopes !== undefined && scopes !== null;
  const normalizedScopes = hasExplicitScopes
    ? normalizeTokenScopes(scopes)
    : normalizeTokenScopes(defaultScopes) ?? readScopesFromExtensions(extensions);
  const normalizedExtensions = stripTokenScopesFromExtensions(extensions);
  const normalizedDescription =
    description === null
      ? null
      : description === undefined
        ? undefined
        : description.length > 0 || !clearEmptyDescription
          ? description
          : null;
  return createTokenBody({
    $type: normalizeTokenMutationType(type),
    $value: value,
    $description: normalizedDescription,
    $scopes:
      normalizedScopes ??
      (hasExplicitScopes || clearEmptyExtensions ? null : undefined),
    $extensions:
      normalizedExtensions ??
      (clearEmptyExtensions ? null : undefined),
  });
}

function cloneTokenValue(value: unknown): unknown {
  return typeof value === 'object' && value !== null
    ? structuredClone(value)
    : value;
}

function readObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function createTokenValueBodyForCollectionModes({
  collectionId,
  modeNames,
  extensions,
  value,
  ...input
}: TokenModeValueDraftInput): TokenMutationBody {
  const secondaryModeNames = modeNames.slice(1).filter(Boolean);
  if (secondaryModeNames.length === 0) {
    return createTokenValueBody({ ...input, value, extensions });
  }

  const nextExtensions = readObjectRecord(extensions);
  const tokenworkshop = readObjectRecord(nextExtensions.tokenworkshop);
  const modes = readObjectRecord(tokenworkshop.modes);
  modes[collectionId] = Object.fromEntries(
    secondaryModeNames.map((modeName) => [modeName, cloneTokenValue(value)]),
  );
  tokenworkshop.modes = modes;
  nextExtensions.tokenworkshop = tokenworkshop;

  return createTokenValueBody({
    ...input,
    value,
    extensions: nextExtensions,
  });
}

export function createTokenMutationBodyFromSnapshot(
  token: TokenMutationSnapshotToken,
): TokenMutationBody {
  const extensions = token.$extensions
    ? structuredClone(token.$extensions)
    : undefined;
  const scopes =
    token.$scopes !== undefined && token.$scopes !== null
      ? normalizeTokenScopes(token.$scopes)
      : readScopesFromExtensions(extensions);
  const normalizedExtensions = stripTokenScopesFromExtensions(extensions);

  return createTokenBody({
    $type: normalizeTokenMutationType(token.$type),
    $value: token.$value,
    $description: token.$description ?? null,
    $scopes: scopes ?? null,
    $extensions: normalizedExtensions ?? null,
  });
}

export function createTokenCloneBody(token: TokenMutationSnapshotToken): TokenMutationBody {
  return createTokenValueBody({
    type: token.$type,
    value: token.$value,
    description: token.$description,
    extensions: token.$extensions,
    scopes: token.$scopes,
  });
}

export function getNextTokenCopyPath(
  sourcePath: string,
  existingTokens: Record<string, unknown>,
): string {
  const baseCopyPath = `${sourcePath}-copy`;
  let copyPath = baseCopyPath;
  let suffix = 2;
  while (existingTokens[copyPath]) {
    copyPath = `${baseCopyPath}-${suffix++}`;
  }
  return copyPath;
}

export function getTokenMutationUrl(serverUrl: string, collectionId: string, tokenPath: string): string {
  return `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/${tokenPathToUrlSegment(tokenPath)}`;
}

export async function fetchToken<T = unknown>(serverUrl: string, collectionId: string, tokenPath: string): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, collectionId, tokenPath));
}

export async function createToken<T = unknown>(
  serverUrl: string,
  collectionId: string,
  tokenPath: string,
  body: TokenMutationBody,
  options?: RequestInit,
): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, collectionId, tokenPath), {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

export async function updateToken<T = unknown>(
  serverUrl: string,
  collectionId: string,
  tokenPath: string,
  body: TokenMutationBody,
  options?: RequestInit,
): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, collectionId, tokenPath), {
    ...options,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

export async function deleteToken<T = unknown>(
  serverUrl: string,
  collectionId: string,
  tokenPath: string,
  options?: RequestInit,
): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, collectionId, tokenPath), {
    ...options,
    method: 'DELETE',
  });
}

export async function rollbackOperation(
  serverUrl: string,
  operationId: string,
): Promise<OperationRollbackResult> {
  return apiFetch<OperationRollbackResult>(
    `${serverUrl}/api/operations/${encodeURIComponent(operationId)}/rollback`,
    { method: 'POST' },
  );
}

export async function upsertToken<T = unknown>(
  serverUrl: string,
  collectionId: string,
  tokenPath: string,
  body: TokenMutationBody,
  isConflictError: (err: unknown) => err is ApiError = isTokenMutationConflictError,
  options?: RequestInit,
): Promise<TokenMutationResult<T>> {
  try {
    const response = await createToken<T>(serverUrl, collectionId, tokenPath, body, options);
    return { kind: 'created', response };
  } catch (err) {
    if (!isConflictError(err)) throw err;
    const response = await updateToken<T>(serverUrl, collectionId, tokenPath, body, options);
    return { kind: 'updated', response };
  }
}

export async function applyTokenMutationSuccess({
  onAfterSave,
  onRefresh,
  onRecordTouch,
  touchedPath,
  successMessage,
}: TokenMutationSuccessOptions): Promise<void> {
  await onAfterSave?.();
  await onRefresh?.();
  if (touchedPath) onRecordTouch?.(touchedPath);
  if (successMessage) dispatchToast(successMessage, 'success');
}
