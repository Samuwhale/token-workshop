import { useState } from 'react';
import { getErrorMessage } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

interface UseSetMetadataParams {
  serverUrl: string;
  connected: boolean;
  setDescriptions: Record<string, string>;
  setCollectionNames: Record<string, string>;
  setModeNames: Record<string, string>;
  updateSetMetadataInState: (name: string, description: string, collectionName: string, modeName: string) => void;
  onError: (msg: string) => void;
}

export function useSetMetadata({
  serverUrl, connected,
  setDescriptions, setCollectionNames, setModeNames,
  updateSetMetadataInState, onError,
}: UseSetMetadataParams) {
  const [editingMetadataSet, setEditingMetadataSet] = useState<string | null>(null);
  const [metadataDescription, setMetadataDescription] = useState('');
  const [metadataCollectionName, setMetadataCollectionName] = useState('');
  const [metadataModeName, setMetadataModeName] = useState('');

  const openSetMetadata = (setName: string) => {
    setEditingMetadataSet(setName);
    setMetadataDescription(setDescriptions[setName] || '');
    setMetadataCollectionName(setCollectionNames[setName] || '');
    setMetadataModeName(setModeNames[setName] || '');
  };

  const closeSetMetadata = () => {
    setEditingMetadataSet(null);
  };

  const handleSaveMetadata = async () => {
    if (!editingMetadataSet || !connected) { setEditingMetadataSet(null); return; }
    try {
      await apiFetch(`${serverUrl}/api/sets/${encodeURIComponent(editingMetadataSet)}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: metadataDescription, figmaCollection: metadataCollectionName, figmaMode: metadataModeName }),
      });
    } catch (err) {
      onError(`Save metadata failed: ${getErrorMessage(err)}`);
      return;
    }
    updateSetMetadataInState(editingMetadataSet, metadataDescription, metadataCollectionName, metadataModeName);
    setEditingMetadataSet(null);
  };

  return {
    editingMetadataSet,
    metadataDescription,
    setMetadataDescription,
    metadataCollectionName,
    setMetadataCollectionName,
    metadataModeName,
    setMetadataModeName,
    closeSetMetadata,
    openSetMetadata,
    handleSaveMetadata,
  };
}
