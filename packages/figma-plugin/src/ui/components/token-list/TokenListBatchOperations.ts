import { useCallback } from "react";
import { apiFetch, ApiError } from "../../shared/apiFetch";

interface BatchOperationsConfig {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  selectedPaths: Set<string>;
  onRefresh: () => void;
  onError?: (msg: string) => void;
  clearSelection: () => void;
  setOperationLoading: (v: string | null) => void;
}

export function useTokenListBatchOperations(config: BatchOperationsConfig) {
  const {
    connected,
    serverUrl,
    collectionId,
    selectedPaths,
    onRefresh,
    onError,
    clearSelection,
    setOperationLoading,
  } = config;

  const handleBatchMoveToGroup = useCallback(
    async (
      moveToGroupTarget: string,
      setShowMoveToGroup: (v: boolean) => void,
      setMoveToGroupError: (v: string) => void,
    ) => {
      const target = moveToGroupTarget.trim();
      if (!target || selectedPaths.size === 0 || !connected) return;

      const renames = [...selectedPaths].map((oldPath) => {
        const name = oldPath.split(".").pop()!;
        const newPath = `${target}.${name}`;
        return { oldPath, newPath };
      });

      const newPaths = renames.map((r) => r.newPath);
      if (new Set(newPaths).size !== newPaths.length) {
        setMoveToGroupError(
          "Some selected tokens have the same name — resolve conflicts before moving",
        );
        return;
      }

      setShowMoveToGroup(false);
      setMoveToGroupError("");
      setOperationLoading(
        `Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""}…`,
      );
      try {
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-rename-paths`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ renames, updateAliases: true }),
          },
        );
        clearSelection();
      } catch (err) {
        onError?.(
          err instanceof ApiError ? err.message : "Move failed: network error",
        );
      }
      setOperationLoading(null);
      onRefresh();
    },
    [
      selectedPaths,
      connected,
      serverUrl,
      collectionId,
      onRefresh,
      onError,
      clearSelection,
      setOperationLoading,
    ],
  );

  const handleBatchMoveToCollection = useCallback(
    async (
      batchMoveToCollectionTarget: string,
      setShowBatchMoveToCollection: (v: boolean) => void,
    ) => {
      const target = batchMoveToCollectionTarget.trim();
      if (!target || selectedPaths.size === 0 || !connected) return;
      setShowBatchMoveToCollection(false);
      setOperationLoading(
        `Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""} to ${target}…`,
      );
      try {
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paths: [...selectedPaths],
              targetCollectionId: target,
            }),
          },
        );
        clearSelection();
      } catch (err) {
        onError?.(
          err instanceof ApiError
            ? err.message
            : "Move to collection failed: network error",
        );
      }
      setOperationLoading(null);
      onRefresh();
    },
    [
      selectedPaths,
      connected,
      serverUrl,
      collectionId,
      onRefresh,
      onError,
      clearSelection,
      setOperationLoading,
    ],
  );

  const handleBatchCopyToCollection = useCallback(
    async (
      batchCopyToCollectionTarget: string,
      setShowBatchCopyToCollection: (v: boolean) => void,
    ) => {
      const target = batchCopyToCollectionTarget.trim();
      if (!target || selectedPaths.size === 0 || !connected) return;
      setShowBatchCopyToCollection(false);
      setOperationLoading(
        `Copying ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""} to ${target}…`,
      );
      try {
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-copy`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paths: [...selectedPaths],
              targetCollectionId: target,
            }),
          },
        );
      } catch (err) {
        onError?.(
          err instanceof ApiError
            ? err.message
            : "Copy to collection failed: network error",
        );
      }
      setOperationLoading(null);
      onRefresh();
    },
    [
      selectedPaths,
      connected,
      serverUrl,
      collectionId,
      onRefresh,
      onError,
      setOperationLoading,
    ],
  );

  return {
    handleBatchMoveToGroup,
    handleBatchMoveToCollection,
    handleBatchCopyToCollection,
  };
}
