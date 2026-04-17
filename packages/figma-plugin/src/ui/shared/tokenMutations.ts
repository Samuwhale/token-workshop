import type { ApiError } from './apiFetch';
import { apiFetch } from './apiFetch';
import { dispatchToast } from './toastBus';
import { tokenPathToUrlSegment } from './utils';

export interface TokenMutationRequest {
  $type?: string;
  $value?: unknown;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export interface TokenValueDraftInput {
  type?: string | null;
  value: unknown;
  description?: string;
  extensions?: Record<string, unknown> | null;
  scopes?: readonly string[] | null;
  defaultScopes?: readonly string[] | null;
}

export type TokenMutationBody = TokenMutationRequest;
export type TokenMutationMode = 'create' | 'update' | 'upsert';

export interface TokenMutationResult<T = unknown> {
  kind: 'created' | 'updated';
  response: T;
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

export function normalizeTokenMutationValue<T>(value: T): T {
  return value;
}

export function normalizeTokenScopes(
  scopes?: readonly string[] | null,
  defaultScopes?: readonly string[] | null,
): string[] | undefined {
  const nextScopes = scopes && scopes.length > 0
    ? scopes
    : defaultScopes && defaultScopes.length > 0
      ? defaultScopes
      : undefined;
  return nextScopes ? [...nextScopes] : undefined;
}

export function createTokenExtensions({
  extensions,
  scopes,
  defaultScopes,
}: Pick<TokenValueDraftInput, 'extensions' | 'scopes' | 'defaultScopes'>): Record<string, unknown> | undefined {
  const nextExtensions = extensions ? { ...extensions } : {};
  const normalizedScopes = normalizeTokenScopes(scopes, defaultScopes);
  if (normalizedScopes) {
    nextExtensions['com.figma.scopes'] = normalizedScopes;
  }
  return Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined;
}

export function createTokenValueBody({
  type,
  value,
  description,
  extensions,
  scopes,
  defaultScopes,
}: TokenValueDraftInput): TokenMutationBody {
  return createTokenBody({
    $type: normalizeTokenMutationType(type),
    $value: normalizeTokenMutationValue(value),
    $description: description,
    $extensions: createTokenExtensions({ extensions, scopes, defaultScopes }),
  });
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
