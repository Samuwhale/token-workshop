import { useState } from "react";
import { getErrorMessage } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";

interface UseSetMetadataParams {
  serverUrl: string;
  connected: boolean;
  setDescriptions: Record<string, string>;
  updateSetMetadataInState: (name: string, description: string) => void;
  onError: (msg: string) => void;
}

export function useSetMetadata({
  serverUrl,
  connected,
  setDescriptions,
  updateSetMetadataInState,
  onError,
}: UseSetMetadataParams) {
  const [editingMetadataSet, setEditingMetadataSet] = useState<string | null>(
    null,
  );
  const [metadataDescription, setMetadataDescription] = useState("");

  const openSetMetadata = (setName: string) => {
    setEditingMetadataSet(setName);
    setMetadataDescription(setDescriptions[setName] || "");
  };

  const closeSetMetadata = () => {
    setEditingMetadataSet(null);
  };

  const handleSaveMetadata = async () => {
    if (!editingMetadataSet || !connected) {
      setEditingMetadataSet(null);
      return;
    }
    try {
      await apiFetch(
        `${serverUrl}/api/sets/${encodeURIComponent(editingMetadataSet)}/metadata`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: metadataDescription,
          }),
        },
      );
    } catch (err) {
      onError(`Save metadata failed: ${getErrorMessage(err)}`);
      return;
    }
    updateSetMetadataInState(editingMetadataSet, metadataDescription);
    setEditingMetadataSet(null);
  };

  return {
    editingMetadataSet,
    metadataDescription,
    setMetadataDescription,
    closeSetMetadata,
    openSetMetadata,
    handleSaveMetadata,
  };
}
