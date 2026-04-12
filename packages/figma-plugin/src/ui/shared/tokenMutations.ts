import type { Token } from '@tokenmanager/core';
import type { ApiError } from './apiFetch';
import { apiFetch } from './apiFetch';
import { dispatchToast } from './toastBus';
import { tokenPathToUrlSegment } from './utils';

export type TokenMutationBody = Partial<Token>;
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

export function getTokenMutationUrl(serverUrl: string, setName: string, tokenPath: string): string {
  return `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(tokenPath)}`;
}

export async function fetchToken<T = unknown>(serverUrl: string, setName: string, tokenPath: string): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, setName, tokenPath));
}

export async function createToken<T = unknown>(
  serverUrl: string,
  setName: string,
  tokenPath: string,
  body: TokenMutationBody,
  options?: RequestInit,
): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, setName, tokenPath), {
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
  setName: string,
  tokenPath: string,
  body: TokenMutationBody,
  options?: RequestInit,
): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, setName, tokenPath), {
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
  setName: string,
  tokenPath: string,
  options?: RequestInit,
): Promise<T> {
  return apiFetch<T>(getTokenMutationUrl(serverUrl, setName, tokenPath), {
    ...options,
    method: 'DELETE',
  });
}

export async function upsertToken<T = unknown>(
  serverUrl: string,
  setName: string,
  tokenPath: string,
  body: TokenMutationBody,
  isConflictError: (err: unknown) => err is ApiError = isTokenMutationConflictError,
  options?: RequestInit,
): Promise<TokenMutationResult<T>> {
  try {
    const response = await createToken<T>(serverUrl, setName, tokenPath, body, options);
    return { kind: 'created', response };
  } catch (err) {
    if (!isConflictError(err)) throw err;
    const response = await updateToken<T>(serverUrl, setName, tokenPath, body, options);
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
