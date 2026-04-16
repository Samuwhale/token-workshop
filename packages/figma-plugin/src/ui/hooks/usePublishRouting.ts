import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../shared/apiFetch";
import { getErrorMessage } from "../shared/utils";

export interface PublishRoutingDraft {
  collectionName?: string;
  modeName?: string;
}

export function usePublishRouting(
  serverUrl: string,
  connected: boolean,
  refreshKey: string,
) {
  const [collectionMap, setCollectionMap] = useState<Record<string, string>>({});
  const [modeMap, setModeMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!connected) {
      setCollectionMap({});
      setModeMap({});
      setError(null);
      return;
    }

    try {
      const result = await apiFetch<{
        collectionMap?: Record<string, string>;
        modeMap?: Record<string, string>;
      }>(`${serverUrl}/api/sync/publish-routing`);
      setCollectionMap(result.collectionMap ?? {});
      setModeMap(result.modeMap ?? {});
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load publish routing"));
    }
  }, [connected, serverUrl]);

  const savePublishRouting = useCallback(
    async (setName: string, routing: PublishRoutingDraft) => {
      const result = await apiFetch<{
        collectionName?: string;
        modeName?: string;
      }>(`${serverUrl}/api/sync/publish-routing/${encodeURIComponent(setName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionName: routing.collectionName ?? "",
          modeName: routing.modeName ?? "",
        }),
      });

      setCollectionMap((prev) => {
        const next = { ...prev };
        if (result.collectionName) {
          next[setName] = result.collectionName;
        } else {
          delete next[setName];
        }
        return next;
      });

      setModeMap((prev) => {
        const next = { ...prev };
        if (result.modeName) {
          next[setName] = result.modeName;
        } else {
          delete next[setName];
        }
        return next;
      });
      setError(null);
      return result;
    },
    [serverUrl],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return {
    collectionMap,
    modeMap,
    publishRoutingError: error,
    refreshPublishRouting: refresh,
    savePublishRouting,
  };
}
