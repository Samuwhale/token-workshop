import { normalizeCollectionModeName } from "@token-workshop/core";
import { apiFetch } from "./apiFetch";

export const DUPLICATE_MODE_NAME_MESSAGE = "Mode names must be different.";
export const EMPTY_MODE_SOURCE = "__token-workshop-empty-mode-source__";
export const MODE_STARTING_VALUES_LABEL = "Initial values";

interface CollectionModeRequest {
  serverUrl: string;
  collectionId: string;
}

function collectionModesUrl({ serverUrl, collectionId }: CollectionModeRequest): string {
  return `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes`;
}

function collectionModeUrl(
  request: CollectionModeRequest & { modeName: string },
): string {
  return `${collectionModesUrl(request)}/${encodeURIComponent(request.modeName)}`;
}

export function normalizeModeName(modeName: string): string {
  return normalizeCollectionModeName(modeName);
}

export function isModeNameTaken(
  modeNames: readonly string[],
  candidateName: string,
  currentName?: string,
): boolean {
  const normalizedCandidate = normalizeModeName(candidateName);
  const normalizedCurrent = currentName ? normalizeModeName(currentName) : null;

  if (!normalizedCandidate) {
    return false;
  }

  return modeNames.some((modeName) => {
    const normalizedModeName = normalizeModeName(modeName);
    return (
      normalizedModeName === normalizedCandidate &&
      normalizedModeName !== normalizedCurrent
    );
  });
}

export function getDefaultModeSourceName(modeNames: readonly string[]): string {
  return modeNames[0] ?? EMPTY_MODE_SOURCE;
}

export function getModeSourcePayloadValue(
  sourceModeName: string,
): string | undefined {
  return sourceModeName === EMPTY_MODE_SOURCE ? undefined : sourceModeName;
}

export function formatModeCopyOption(modeName: string): string {
  return `Copy from ${modeName}`;
}

export async function addCollectionMode(
  request: CollectionModeRequest & { name: string; sourceModeName?: string },
): Promise<void> {
  await apiFetch(collectionModesUrl(request), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: request.name,
      ...(request.sourceModeName
        ? { sourceModeName: request.sourceModeName }
        : {}),
    }),
  });
}

export async function renameCollectionMode(
  request: CollectionModeRequest & { modeName: string; name: string },
): Promise<void> {
  await apiFetch(collectionModeUrl(request), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: request.name }),
  });
}

export async function deleteCollectionMode(
  request: CollectionModeRequest & { modeName: string },
): Promise<void> {
  await apiFetch(collectionModeUrl(request), { method: "DELETE" });
}

export async function reorderCollectionModes(
  request: CollectionModeRequest & { modes: string[] },
): Promise<void> {
  await apiFetch(`${collectionModesUrl(request)}-order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modes: request.modes }),
  });
}
