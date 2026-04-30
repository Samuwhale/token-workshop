import { apiFetch } from "./apiFetch";

export const DUPLICATE_MODE_NAME_MESSAGE = "Mode names must be different.";

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
  return modeName.trim().toLocaleLowerCase();
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

export async function addCollectionMode(
  request: CollectionModeRequest & { name: string },
): Promise<void> {
  await apiFetch(collectionModesUrl(request), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: request.name }),
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
