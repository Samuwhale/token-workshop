import { useCallback } from "react";
import { apiFetch, ApiError } from "../../shared/apiFetch";

interface BatchOperationsConfig {
  connected: boolean;
  serverUrl: string;
  setName: string;
  selectedPaths: Set<string>;
  onRefresh: () => void;
  onError?: (msg: string) => void;
  setSelectMode: (v: boolean) => void;
  setSelectedPaths: (v: Set<string>) => void;
  setOperationLoading: (v: string | null) => void;
}

export function useTokenListBatchOperations(config: BatchOperationsConfig) {
  const {
    connected,
    serverUrl,
    setName,
    selectedPaths,
    onRefresh,
    onError,
    setSelectMode,
    setSelectedPaths,
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
          `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-rename-paths`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ renames, updateAliases: true }),
          },
        );
        setSelectedPaths(new Set());
        setSelectMode(false);
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
      setName,
      onRefresh,
      onError,
      setSelectMode,
      setSelectedPaths,
      setOperationLoading,
    ],
  );

  const handleBatchMoveToSet = useCallback(
    async (
      batchMoveToSetTarget: string,
      setShowBatchMoveToSet: (v: boolean) => void,
    ) => {
      const target = batchMoveToSetTarget.trim();
      if (!target || selectedPaths.size === 0 || !connected) return;
      setShowBatchMoveToSet(false);
      setOperationLoading(
        `Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""} to ${target}…`,
      );
      try {
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paths: [...selectedPaths],
              targetSet: target,
            }),
          },
        );
        setSelectedPaths(new Set());
        setSelectMode(false);
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
      setName,
      onRefresh,
      onError,
      setSelectMode,
      setSelectedPaths,
      setOperationLoading,
    ],
  );

  const handleBatchCopyToSet = useCallback(
    async (
      batchCopyToSetTarget: string,
      setShowBatchCopyToSet: (v: boolean) => void,
    ) => {
      const target = batchCopyToSetTarget.trim();
      if (!target || selectedPaths.size === 0 || !connected) return;
      setShowBatchCopyToSet(false);
      setOperationLoading(
        `Copying ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""} to ${target}…`,
      );
      try {
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-copy`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paths: [...selectedPaths],
              targetSet: target,
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
      setName,
      onRefresh,
      onError,
      setOperationLoading,
    ],
  );

  return {
    handleBatchMoveToGroup,
    handleBatchMoveToSet,
    handleBatchCopyToSet,
  };
}
