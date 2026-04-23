import { useCallback } from "react";
import { apiFetch, createFetchSignal, isNetworkError } from "../shared/apiFetch";
import { COLLECTION_NAME_RE, isAbortError } from "../shared/utils";
import type { UndoSlot } from "./useUndo";

interface UseCollectionRenameParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  currentCollectionId: string;
  setCurrentCollectionId: (collectionId: string) => void;
  renameCollectionInState: (oldName: string, newName: string) => void;
  setSuccessToast: (msg: string) => void;
  markDisconnected: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRenameComplete?: (oldName: string, newName: string) => void;
}

export interface RenameResult {
  ok: boolean;
  error?: string;
}

export function useCollectionRename({
  serverUrl,
  connected,
  getDisconnectSignal,
  currentCollectionId,
  setCurrentCollectionId,
  renameCollectionInState,
  setSuccessToast,
  markDisconnected,
  onPushUndo,
  onRenameComplete,
}: UseCollectionRenameParams) {
  const renameCollection = useCallback(
    async (oldName: string, rawNewName: string): Promise<RenameResult> => {
      const newName = rawNewName.trim();
      if (!newName || newName === oldName) return { ok: true };
      if (!COLLECTION_NAME_RE.test(newName)) {
        return { ok: false, error: "Use letters, numbers, - and _ (/ for folders)" };
      }
      if (!connected) return { ok: false, error: "Not connected" };
      try {
        await apiFetch(
          `${serverUrl}/api/collections/${encodeURIComponent(oldName)}/rename`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newName }),
            signal: createFetchSignal(getDisconnectSignal()),
          },
        );
        renameCollectionInState(oldName, newName);
        if (currentCollectionId === oldName) setCurrentCollectionId(newName);
        onRenameComplete?.(oldName, newName);
        setSuccessToast(`Renamed collection "${oldName}" → "${newName}"`);
        onPushUndo?.({
          description: `Renamed collection "${oldName}" → "${newName}"`,
          restore: async () => {
            await apiFetch(
              `${serverUrl}/api/collections/${encodeURIComponent(newName)}/rename`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newName: oldName }),
              },
            );
            renameCollectionInState(newName, oldName);
            if (currentCollectionId === newName) setCurrentCollectionId(oldName);
          },
          redo: async () => {
            await apiFetch(
              `${serverUrl}/api/collections/${encodeURIComponent(oldName)}/rename`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newName }),
              },
            );
            renameCollectionInState(oldName, newName);
            if (currentCollectionId === oldName) setCurrentCollectionId(newName);
          },
        });
        return { ok: true };
      } catch (err) {
        if (isAbortError(err)) return { ok: false };
        if (isNetworkError(err)) markDisconnected();
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Rename failed",
        };
      }
    },
    [
      connected,
      currentCollectionId,
      getDisconnectSignal,
      markDisconnected,
      onPushUndo,
      onRenameComplete,
      renameCollectionInState,
      serverUrl,
      setCurrentCollectionId,
      setSuccessToast,
    ],
  );

  return { renameCollection };
}
