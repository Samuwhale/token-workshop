import { useState } from 'react';
import { getErrorMessage } from '../shared/utils';

interface UseSetMetadataParams {
  serverUrl: string;
  connected: boolean;
  setDescriptions: Record<string, string>;
  setCollectionNames: Record<string, string>;
  setModeNames: Record<string, string>;
  refreshTokens: () => void;
  setTabMenuOpen: (v: string | null) => void;
  onError: (msg: string) => void;
}

export function useSetMetadata({
  serverUrl, connected,
  setDescriptions, setCollectionNames, setModeNames,
  refreshTokens, setTabMenuOpen, onError,
}: UseSetMetadataParams) {
  const [editingMetadataSet, setEditingMetadataSet] = useState<string | null>(null);
  const [metadataDescription, setMetadataDescription] = useState('');
  const [metadataCollectionName, setMetadataCollectionName] = useState('');
  const [metadataModeName, setMetadataModeName] = useState('');

  const openSetMetadata = (setName: string) => {
    setTabMenuOpen(null);
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
      const res = await fetch(`${serverUrl}/api/sets/${encodeURIComponent(editingMetadataSet)}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: metadataDescription, figmaCollection: metadataCollectionName, figmaMode: metadataModeName }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        onError(`Save metadata failed: ${body || res.statusText}`);
        return;
      }
    } catch (err) {
      onError(`Save metadata failed: ${getErrorMessage(err)}`);
      return;
    }
    setEditingMetadataSet(null);
    refreshTokens();
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
