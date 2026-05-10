import { apiFetch } from "./apiFetch";

export interface DeprecatedUsageDependent {
  path: string;
  collectionId: string;
}

export interface DeprecatedUsageEntry {
  deprecatedPath: string;
  collectionId: string;
  type: string;
  activeReferenceCount: number;
  dependents: DeprecatedUsageDependent[];
}

export interface DeprecatedUsageResponse {
  entries: DeprecatedUsageEntry[];
}

export interface DeprecatedReplacementSelection {
  path: string;
  collectionId: string;
}

export interface DeprecatedReferenceReplacementResult {
  ok: true;
  updated: number;
  operationId?: string;
}

export async function fetchDeprecatedUsage(
  serverUrl: string,
  signal?: AbortSignal,
): Promise<DeprecatedUsageEntry[]> {
  const data = await apiFetch<DeprecatedUsageResponse>(
    `${serverUrl}/api/tokens/deprecated-usage`,
    signal ? { signal } : undefined,
  );
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function replaceDeprecatedReferences({
  serverUrl,
  deprecatedPath,
  collectionId,
  replacement,
}: {
  serverUrl: string;
  deprecatedPath: string;
  collectionId: string;
  replacement: DeprecatedReplacementSelection;
}): Promise<DeprecatedReferenceReplacementResult> {
  return apiFetch<DeprecatedReferenceReplacementResult>(
    `${serverUrl}/api/tokens/deprecated-usage/replace`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionId,
        deprecatedPath,
        replacementPath: replacement.path,
        replacementCollectionId: replacement.collectionId,
      }),
    },
  );
}
