import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';

export interface UseImportCollectionsParams {
  serverUrl: string;
  connected: boolean;
  workingCollectionId: string;
  onClearConflictState: () => void;
}

export function useImportCollections({
  serverUrl,
  connected,
  workingCollectionId,
  onClearConflictState,
}: UseImportCollectionsParams) {
  const [targetCollectionId, setTargetCollectionId] = useState(
    () => workingCollectionId || 'imported',
  );
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [newCollectionInputVisible, setNewCollectionInputVisible] =
    useState(false);
  const [newCollectionDraft, setNewCollectionDraft] = useState('');
  const [newCollectionError, setNewCollectionError] = useState<string | null>(
    null,
  );

  const targetCollectionIdRef = useRef(targetCollectionId);

  useEffect(() => {
    targetCollectionIdRef.current = targetCollectionId;
  }, [targetCollectionId]);

  const fetchCollections = useCallback(async () => {
    if (!connected) return;
    setCollectionsError(null);
    try {
      const data = await apiFetch<{ collections?: Array<{ id: string }> }>(`${serverUrl}/api/collections`);
      const fetchedCollectionIds = (data.collections || []).map(
        (collection) => collection.id,
      );
      setCollectionIds(fetchedCollectionIds);
      setTargetCollectionId((previousCollectionId) => {
        if (fetchedCollectionIds.includes(previousCollectionId)) {
          return previousCollectionId;
        }
        if (workingCollectionId && fetchedCollectionIds.includes(workingCollectionId)) {
          return workingCollectionId;
        }
        return fetchedCollectionIds[0] ?? previousCollectionId;
      });
    } catch (err) {
      setCollectionsError(
        err instanceof Error ? err.message : 'Failed to load collections',
      );
    }
  }, [serverUrl, connected, workingCollectionId]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const commitNewCollection = useCallback(() => {
    const name = newCollectionDraft.trim();
    if (!name) {
      setNewCollectionError('Name cannot be empty');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name)) {
      setNewCollectionError('Use letters, numbers, - and _ (/ for folders)');
      return;
    }
    setNewCollectionError(null);
    setTargetCollectionId(name);
    onClearConflictState();
    setNewCollectionInputVisible(false);
    setNewCollectionDraft('');
  }, [newCollectionDraft, onClearConflictState]);

  const cancelNewCollection = useCallback(() => {
    setNewCollectionInputVisible(false);
    setNewCollectionDraft('');
    setNewCollectionError(null);
  }, []);

  const setTargetCollectionIdAndPersist = useCallback((name: string) => {
    setTargetCollectionId(name);
  }, []);

  return {
    targetCollectionId,
    setTargetCollectionId,
    targetCollectionIdRef,
    collectionIds,
    setCollectionIds,
    collectionsError,
    newCollectionInputVisible,
    newCollectionDraft,
    newCollectionError,
    setNewCollectionInputVisible,
    setNewCollectionDraft,
    setNewCollectionError,
    fetchCollections,
    commitNewCollection,
    cancelNewCollection,
    setTargetCollectionIdAndPersist,
  };
}
