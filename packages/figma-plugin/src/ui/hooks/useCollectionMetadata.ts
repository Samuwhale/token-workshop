import { useState } from "react";
import { getErrorMessage } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";

interface UseCollectionMetadataParams {
  serverUrl: string;
  connected: boolean;
  collectionDescriptions: Record<string, string>;
  updateCollectionMetadataInState: (collectionId: string, description: string) => void;
  onError: (msg: string) => void;
}

export function useCollectionMetadata({
  serverUrl,
  connected,
  collectionDescriptions,
  updateCollectionMetadataInState,
  onError,
}: UseCollectionMetadataParams) {
  const [editingMetadataCollectionId, setEditingMetadataCollectionId] = useState<string | null>(
    null,
  );
  const [metadataDescription, setMetadataDescription] = useState("");

  const openCollectionMetadata = (collectionId: string) => {
    setEditingMetadataCollectionId(collectionId);
    setMetadataDescription(collectionDescriptions[collectionId] || "");
  };

  const closeCollectionMetadata = () => {
    setEditingMetadataCollectionId(null);
  };

  const handleSaveMetadata = async () => {
    if (!editingMetadataCollectionId || !connected) {
      setEditingMetadataCollectionId(null);
      return;
    }
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(editingMetadataCollectionId)}`,
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
    updateCollectionMetadataInState(
      editingMetadataCollectionId,
      metadataDescription,
    );
    setEditingMetadataCollectionId(null);
  };

  return {
    editingMetadataCollectionId,
    metadataDescription,
    setMetadataDescription,
    closeCollectionMetadata,
    openCollectionMetadata,
    handleSaveMetadata,
  };
}
