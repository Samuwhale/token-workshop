import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

export interface UseImportSetsParams {
  serverUrl: string;
  connected: boolean;
  onClearConflictState: () => void;
}

export function useImportSets({ serverUrl, connected, onClearConflictState }: UseImportSetsParams) {
  const [targetSet, setTargetSet] = useState(() => lsGet(STORAGE_KEYS.IMPORT_TARGET_SET, 'imported'));
  const [sets, setSets] = useState<string[]>([]);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [newSetInputVisible, setNewSetInputVisible] = useState(false);
  const [newSetDraft, setNewSetDraft] = useState('');
  const [newSetError, setNewSetError] = useState<string | null>(null);

  const targetSetRef = useRef(targetSet);

  useEffect(() => {
    targetSetRef.current = targetSet;
  }, [targetSet]);

  const fetchSets = useCallback(async () => {
    if (!connected) return;
    setSetsError(null);
    try {
      const data = await apiFetch<{ sets?: string[] }>(`${serverUrl}/api/sets`);
      const fetchedSets: string[] = data.sets || [];
      setSets(fetchedSets);
      setTargetSet(prev => {
        if (fetchedSets.includes(prev)) return prev;
        return fetchedSets[0] ?? prev;
      });
    } catch (err) {
      setSetsError(err instanceof Error ? err.message : 'Failed to load sets');
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  const commitNewSet = useCallback(() => {
    const name = newSetDraft.trim();
    if (!name) { setNewSetError('Name cannot be empty'); return; }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name)) {
      setNewSetError('Use letters, numbers, - and _ (/ for folders)');
      return;
    }
    setNewSetError(null);
    setTargetSet(name);
    lsSet(STORAGE_KEYS.IMPORT_TARGET_SET, name);
    onClearConflictState();
    setNewSetInputVisible(false);
    setNewSetDraft('');
  }, [newSetDraft, onClearConflictState]);

  const cancelNewSet = useCallback(() => {
    setNewSetInputVisible(false);
    setNewSetDraft('');
    setNewSetError(null);
  }, []);

  const setTargetSetAndPersist = useCallback((name: string) => {
    setTargetSet(name);
    lsSet(STORAGE_KEYS.IMPORT_TARGET_SET, name);
  }, []);

  return {
    targetSet,
    setTargetSet,
    targetSetRef,
    sets,
    setSets,
    setsError,
    newSetInputVisible,
    newSetDraft,
    newSetError,
    setNewSetInputVisible,
    setNewSetDraft,
    setNewSetError,
    fetchSets,
    commitNewSet,
    cancelNewSet,
    setTargetSetAndPersist,
  };
}
