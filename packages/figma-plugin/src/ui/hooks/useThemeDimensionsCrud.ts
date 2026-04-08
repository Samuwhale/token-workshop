import { useState, useCallback } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import { dispatchToast } from '../shared/toastBus';
import type { UndoSlot } from './useUndo';

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function makeErrorMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : getErrorMessage(err, fallback);
}

export interface UseThemeDimensionsCrudParams {
  serverUrl: string;
  connected: boolean;
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  fetchDimensions: () => Promise<void>;
  debouncedFetchDimensions: () => void;
  setError: (msg: string | null) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSuccess?: (msg: string) => void;
}

export interface UseThemeDimensionsCrudReturn {
  newlyCreatedDim: string | null;

  // Create dimension — encapsulated form state (no raw React.Dispatch setters)
  newDimName: string;
  showCreateDim: boolean;
  createDimError: string | null;
  isCreatingDim: boolean;
  /** Open the create form, optionally pre-filling the name. */
  openCreateDim: (name?: string) => void;
  /** Close the create form and reset all form state. */
  closeCreateDim: () => void;
  /** Update the new dimension name; also clears any current error. */
  setNewDimName: (name: string) => void;
  handleCreateDimension: () => Promise<void>;

  // Rename dimension — encapsulated form state
  renameDim: string | null;
  renameValue: string;
  renameError: string | null;
  isRenamingDim: boolean;
  /** Update the rename input value; also clears any current error. */
  setRenameValue: (value: string) => void;
  startRenameDim: (id: string, currentName: string) => void;
  cancelRenameDim: () => void;
  executeRenameDim: () => Promise<void>;

  // Delete dimension — encapsulated form state
  dimensionDeleteConfirm: string | null;
  /** Open the delete-confirmation modal for the given dimension id. */
  openDeleteConfirm: (id: string) => void;
  /** Close the delete-confirmation modal without deleting. */
  closeDeleteConfirm: () => void;
  isDeletingDim: boolean;
  executeDeleteDimension: (id: string) => Promise<void>;

  // Duplicate dimension
  isDuplicatingDim: boolean;
  handleDuplicateDimension: (id: string) => Promise<void>;
}

export function useThemeDimensionsCrud({
  serverUrl,
  connected,
  dimensions,
  setDimensions,
  fetchDimensions,
  debouncedFetchDimensions,
  setError,
  onPushUndo,
  onSuccess,
}: UseThemeDimensionsCrudParams): UseThemeDimensionsCrudReturn {
  const [newlyCreatedDim, setNewlyCreatedDim] = useState<string | null>(null);

  // Create dimension form state
  const [newDimNameState, setNewDimNameState] = useState('');
  const [showCreateDim, setShowCreateDim] = useState(false);
  const [createDimError, setCreateDimError] = useState<string | null>(null);
  const [isCreatingDim, setIsCreatingDim] = useState(false);

  // Rename dimension form state
  const [renameDim, setRenameDim] = useState<string | null>(null);
  const [renameValue, setRenameValueState] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenamingDim, setIsRenamingDim] = useState(false);

  // Delete dimension form state
  const [dimensionDeleteConfirm, setDimensionDeleteConfirm] = useState<string | null>(null);
  const [isDeletingDim, setIsDeletingDim] = useState(false);

  // Duplicate dimension
  const [isDuplicatingDim, setIsDuplicatingDim] = useState(false);

  // --- Encapsulated create form actions ---

  const openCreateDim = useCallback((name?: string) => {
    if (name !== undefined) setNewDimNameState(name);
    setCreateDimError(null);
    setShowCreateDim(true);
  }, []);

  const closeCreateDim = useCallback(() => {
    setShowCreateDim(false);
    setNewDimNameState('');
    setCreateDimError(null);
  }, []);

  const setNewDimName = useCallback((name: string) => {
    setNewDimNameState(name);
    setCreateDimError(null);
  }, []);

  const handleCreateDimension = useCallback(async () => {
    const name = newDimNameState.trim();
    if (!name || !connected || isCreatingDim) return;
    const id = slugify(name) || name.toLowerCase().replace(/\s+/g, '-');
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      setCreateDimError('Name must contain at least one letter or number (spaces and hyphens are allowed).');
      return;
    }
    if (dimensions.some(d => d.id === id || d.name.toLowerCase() === name.toLowerCase())) {
      setCreateDimError('A dimension with that name already exists.');
      return;
    }
    setCreateDimError(null);
    setIsCreatingDim(true);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      setNewDimNameState('');
      setShowCreateDim(false);
      setNewlyCreatedDim(id);
      setDimensions(prev => [...prev, { id, name, options: [] }]);
      debouncedFetchDimensions();
      onSuccess?.(`Created dimension "${name}"`);
    } catch (err) {
      setCreateDimError(makeErrorMsg(err, 'Failed to create dimension'));
    } finally {
      setIsCreatingDim(false);
    }
  }, [newDimNameState, connected, isCreatingDim, dimensions, serverUrl, setDimensions, debouncedFetchDimensions, onSuccess]);

  // --- Encapsulated rename form actions ---

  const setRenameValue = useCallback((value: string) => {
    setRenameValueState(value);
    setRenameError(null);
  }, []);

  const startRenameDim = useCallback((id: string, currentName: string) => {
    setRenameDim(id);
    setRenameValueState(currentName);
    setRenameError(null);
  }, []);

  const cancelRenameDim = useCallback(() => {
    setRenameDim(null);
    setRenameValueState('');
    setRenameError(null);
  }, []);

  const executeRenameDim = useCallback(async () => {
    if (!renameDim || isRenamingDim) return;
    const name = renameValue.trim();
    if (!name) { setRenameError('Name cannot be empty'); return; }
    const current = dimensions.find(d => d.id === renameDim);
    if (!current) { cancelRenameDim(); return; }
    if (name === current.name) { cancelRenameDim(); return; }
    if (dimensions.some(d => d.id !== renameDim && d.name === name)) {
      setRenameError(`Dimension "${name}" already exists`);
      return;
    }
    setIsRenamingDim(true);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameDim)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const oldName = current.name;
      setDimensions(prev => prev.map(d => d.id === renameDim ? { ...d, name } : d));
      cancelRenameDim();
      debouncedFetchDimensions();
      onSuccess?.(`Renamed dimension to "${name}"`);
      onPushUndo?.({
        description: `Renamed layer "${oldName}" → "${name}"`,
        restore: async () => {
          await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameDim)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: oldName }),
          });
          setDimensions(prev => prev.map(d => d.id === renameDim ? { ...d, name: oldName } : d));
        },
        redo: async () => {
          await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameDim)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          setDimensions(prev => prev.map(d => d.id === renameDim ? { ...d, name } : d));
        },
      });
    } catch (err) {
      setRenameError(makeErrorMsg(err, 'Rename failed'));
    } finally {
      setIsRenamingDim(false);
    }
  }, [renameDim, isRenamingDim, renameValue, dimensions, serverUrl, setDimensions, debouncedFetchDimensions, onSuccess, cancelRenameDim, onPushUndo]);

  // --- Encapsulated delete form actions ---

  const openDeleteConfirm = useCallback((id: string) => {
    setDimensionDeleteConfirm(id);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDimensionDeleteConfirm(null);
  }, []);

  const executeDeleteDimension = useCallback(async (id: string) => {
    if (isDeletingDim) return;
    const snapshot = dimensions.find(d => d.id === id);
    if (!snapshot) return;
    const savedDim = JSON.parse(JSON.stringify(snapshot)) as ThemeDimension;
    setIsDeletingDim(true);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setDimensions(prev => prev.filter(d => d.id !== id));
      debouncedFetchDimensions();
      dispatchToast(`Deleted layer "${savedDim.name}"`, 'success');
      onPushUndo?.({
        description: `Deleted layer "${savedDim.name}"`,
        restore: async () => {
          try {
            await apiFetch(`${serverUrl}/api/themes/dimensions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: savedDim.id, name: savedDim.name }),
            });
          } catch (err) {
            setError(makeErrorMsg(err, 'Failed to undo: could not recreate layer'));
            return;
          }
          for (const opt of savedDim.options) {
            try {
              await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(savedDim.id)}/options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: opt.name, sets: opt.sets }),
              });
            } catch (err) {
              console.warn('[ThemeManager] failed to restore option during undo:', opt.name, err);
              setError(`Undo restored layer but failed to restore option "${opt.name}"`);
            }
          }
          fetchDimensions();
        },
      });
    } catch (err) {
      setError(makeErrorMsg(err, 'Failed to delete dimension'));
    } finally {
      setIsDeletingDim(false);
    }
  }, [isDeletingDim, dimensions, serverUrl, setDimensions, debouncedFetchDimensions, onPushUndo, setError, fetchDimensions]);

  // --- Duplicate dimension ---

  const handleDuplicateDimension = useCallback(async (id: string) => {
    if (isDuplicatingDim) return;
    const source = dimensions.find(d => d.id === id);
    if (!source) return;

    setIsDuplicatingDim(true);
    try {
      const response = await apiFetch<{ dimension: ThemeDimension }>(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(id)}/duplicate`,
        {
          method: 'POST',
        },
      );
      setNewlyCreatedDim(response.dimension.id);
      setDimensions(prev => [...prev, response.dimension]);
      debouncedFetchDimensions();
      onSuccess?.(`Duplicated layer as "${response.dimension.name}"`);
    } catch (err) {
      setError(makeErrorMsg(err, 'Failed to duplicate dimension'));
    } finally {
      setIsDuplicatingDim(false);
    }
  }, [isDuplicatingDim, dimensions, serverUrl, setDimensions, debouncedFetchDimensions, onSuccess, setError]);

  return {
    newlyCreatedDim,
    newDimName: newDimNameState,
    showCreateDim,
    createDimError,
    isCreatingDim,
    openCreateDim,
    closeCreateDim,
    setNewDimName,
    handleCreateDimension,
    renameDim,
    renameValue,
    renameError,
    isRenamingDim,
    setRenameValue,
    startRenameDim,
    cancelRenameDim,
    executeRenameDim,
    dimensionDeleteConfirm,
    openDeleteConfirm,
    closeDeleteConfirm,
    isDeletingDim,
    executeDeleteDimension,
    isDuplicatingDim,
    handleDuplicateDimension,
  };
}
