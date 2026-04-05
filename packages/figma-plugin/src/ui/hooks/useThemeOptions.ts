import { useState, useRef } from 'react';
import type { ThemeDimension, ThemeOption } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import { dispatchToast } from '../shared/toastBus';
import type { UndoSlot } from './useUndo';

function makeErrorMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : getErrorMessage(err, fallback);
}

export interface UseThemeOptionsParams {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  debouncedFetchDimensions: () => void;
  fetchDimensions: () => Promise<void>;
  selectedOptions: Record<string, string>;
  setSelectedOptions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  optionSetOrders: Record<string, Record<string, string[]>>;
  setOptionSetOrders: React.Dispatch<React.SetStateAction<Record<string, Record<string, string[]>>>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  onSuccess?: (msg: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  copyFromNewOption: Record<string, string>;
  setCopyFromNewOption: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export interface UseThemeOptionsReturn {
  // Add option
  newOptionNames: Record<string, string>;
  setNewOptionNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showAddOption: Record<string, boolean>;
  setShowAddOption: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  addOptionErrors: Record<string, string>;
  setAddOptionErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  addOptionInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  isAddingOption: Record<string, boolean>;
  handleAddOption: (dimId: string) => Promise<void>;
  // Duplicate option
  isDuplicatingOption: boolean;
  handleDuplicateOption: (dimId: string, optionName: string) => Promise<void>;
  // Rename option
  renameOption: { dimId: string; optionName: string } | null;
  renameOptionValue: string;
  setRenameOptionValue: React.Dispatch<React.SetStateAction<string>>;
  renameOptionError: string | null;
  isRenamingOption: boolean;
  startRenameOption: (dimId: string, optionName: string) => void;
  cancelRenameOption: () => void;
  executeRenameOption: () => Promise<void>;
  // Delete option
  optionDeleteConfirm: { dimId: string; optionName: string } | null;
  setOptionDeleteConfirm: React.Dispatch<React.SetStateAction<{ dimId: string; optionName: string } | null>>;
  isDeletingOption: boolean;
  executeDeleteOption: (dimId: string, optionName: string) => Promise<void>;
}

export function useThemeOptions({
  serverUrl,
  connected,
  sets,
  dimensions,
  setDimensions,
  debouncedFetchDimensions,
  fetchDimensions,
  selectedOptions,
  setSelectedOptions,
  optionSetOrders: _optionSetOrders,
  setOptionSetOrders,
  setError,
  onSuccess,
  onPushUndo,
  copyFromNewOption,
  setCopyFromNewOption,
}: UseThemeOptionsParams): UseThemeOptionsReturn {
  const [newOptionNames, setNewOptionNames] = useState<Record<string, string>>({});
  const [showAddOption, setShowAddOption] = useState<Record<string, boolean>>({});
  const [addOptionErrors, setAddOptionErrors] = useState<Record<string, string>>({});
  const addOptionInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [isAddingOption, setIsAddingOption] = useState<Record<string, boolean>>({});
  const [isDuplicatingOption, setIsDuplicatingOption] = useState(false);

  const [renameOption, setRenameOption] = useState<{ dimId: string; optionName: string } | null>(null);
  const [renameOptionValue, setRenameOptionValue] = useState('');
  const [renameOptionError, setRenameOptionError] = useState<string | null>(null);
  const [isRenamingOption, setIsRenamingOption] = useState(false);

  const [optionDeleteConfirm, setOptionDeleteConfirm] = useState<{ dimId: string; optionName: string } | null>(null);
  const [isDeletingOption, setIsDeletingOption] = useState(false);

  // --- Add option ---

  const handleAddOption = async (dimId: string) => {
    const name = (newOptionNames[dimId] || '').trim();
    if (!name || !connected || isAddingOption[dimId]) return;
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    if (dim.options.some(o => o.name === name)) {
      setAddOptionErrors(prev => ({ ...prev, [dimId]: `Option "${name}" already exists in this dimension.` }));
      return;
    }
    setAddOptionErrors(prev => ({ ...prev, [dimId]: '' }));
    setIsAddingOption(prev => ({ ...prev, [dimId]: true }));

    const copyFromName = copyFromNewOption[dimId] || '';
    const sourceOpt = copyFromName ? dim.options.find(o => o.name === copyFromName) : null;
    const initialSets: Record<string, 'disabled' | 'enabled' | 'source'> = {};
    if (sourceOpt) {
      sets.forEach(s => { initialSets[s] = (sourceOpt.sets[s] as 'disabled' | 'enabled' | 'source') || 'disabled'; });
    } else {
      sets.forEach(s => { initialSets[s] = 'disabled'; });
    }

    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sets: initialSets }),
      });
      setNewOptionNames(prev => ({ ...prev, [dimId]: '' }));
      setCopyFromNewOption(prev => ({ ...prev, [dimId]: '' }));
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: [...d.options, { name, sets: initialSets }] } : d,
      ));
      setSelectedOptions(prev => ({ ...prev, [dimId]: name }));
      debouncedFetchDimensions();
      setTimeout(() => addOptionInputRefs.current[dimId]?.focus(), 0);
      onSuccess?.(`Added option "${name}"`);
    } catch (err) {
      setAddOptionErrors(prev => ({ ...prev, [dimId]: makeErrorMsg(err, 'Failed to add option') }));
    } finally {
      setIsAddingOption(prev => ({ ...prev, [dimId]: false }));
    }
  };

  // --- Duplicate option ---

  const handleDuplicateOption = async (dimId: string, optionName: string) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim || !connected || isDuplicatingOption) return;
    const opt = dim.options.find(o => o.name === optionName);
    if (!opt) return;
    let newName = `${optionName} copy`;
    let counter = 2;
    while (dim.options.some(o => o.name === newName)) newName = `${optionName} copy ${counter++}`;
    setIsDuplicatingOption(true);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, sets: { ...opt.sets } }),
      });
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: [...d.options, { name: newName, sets: { ...opt.sets } }] } : d,
      ));
      setSelectedOptions(prev => ({ ...prev, [dimId]: newName }));
      debouncedFetchDimensions();
    } catch (err) {
      setError(makeErrorMsg(err, 'Failed to duplicate option'));
    } finally {
      setIsDuplicatingOption(false);
    }
  };

  // --- Rename option ---

  const startRenameOption = (dimId: string, optionName: string) => {
    setRenameOption({ dimId, optionName });
    setRenameOptionValue(optionName);
    setRenameOptionError(null);
  };

  const cancelRenameOption = () => {
    setRenameOption(null);
    setRenameOptionValue('');
    setRenameOptionError(null);
  };

  const executeRenameOption = async () => {
    if (!renameOption || isRenamingOption) return;
    const name = renameOptionValue.trim();
    if (!name) { setRenameOptionError('Name cannot be empty'); return; }
    if (name === renameOption.optionName) { cancelRenameOption(); return; }
    const dim = dimensions.find(d => d.id === renameOption.dimId);
    if (!dim) { cancelRenameOption(); return; }
    if (dim.options.some(o => o.name === name)) {
      setRenameOptionError(`Option "${name}" already exists`);
      return;
    }
    setIsRenamingOption(true);
    try {
      await apiFetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameOption.dimId)}/options/${encodeURIComponent(renameOption.optionName)}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) },
      );
      setDimensions(prev => prev.map(d =>
        d.id === renameOption.dimId
          ? { ...d, options: d.options.map(o => o.name === renameOption.optionName ? { ...o, name } : o) }
          : d,
      ));
      setOptionSetOrders(prev => {
        const next = { ...prev };
        if (next[renameOption.dimId]?.[renameOption.optionName]) {
          next[renameOption.dimId] = {
            ...next[renameOption.dimId],
            [name]: next[renameOption.dimId][renameOption.optionName],
          };
          delete next[renameOption.dimId][renameOption.optionName];
        }
        return next;
      });
      setSelectedOptions(prev => {
        if (prev[renameOption.dimId] === renameOption.optionName) {
          return { ...prev, [renameOption.dimId]: name };
        }
        return prev;
      });
      cancelRenameOption();
      debouncedFetchDimensions();
      onSuccess?.(`Renamed option to "${name}"`);
    } catch (err) {
      setRenameOptionError(makeErrorMsg(err, 'Rename failed'));
    } finally {
      setIsRenamingOption(false);
    }
  };

  // --- Delete option ---

  const executeDeleteOption = async (dimId: string, optionName: string) => {
    if (isDeletingOption) return;
    const dim = dimensions.find(d => d.id === dimId);
    const snapshot = dim?.options.find(o => o.name === optionName);
    if (!snapshot) return;
    const savedOpt = JSON.parse(JSON.stringify(snapshot)) as ThemeOption;
    const dimName = dim!.name;
    setIsDeletingOption(true);
    try {
      await apiFetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options/${encodeURIComponent(optionName)}`,
        { method: 'DELETE' },
      );
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: d.options.filter(o => o.name !== optionName) } : d,
      ));
      debouncedFetchDimensions();
      dispatchToast(`Deleted option "${optionName}"`, 'success');
      onPushUndo?.({
        description: `Deleted option "${optionName}" from "${dimName}"`,
        restore: async () => {
          await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: savedOpt.name, sets: savedOpt.sets }),
          });
          fetchDimensions();
        },
      });
    } catch (err) {
      setError(makeErrorMsg(err, 'Failed to delete option'));
    } finally {
      setIsDeletingOption(false);
    }
  };

  return {
    newOptionNames,
    setNewOptionNames,
    showAddOption,
    setShowAddOption,
    addOptionErrors,
    setAddOptionErrors,
    addOptionInputRefs,
    isAddingOption,
    handleAddOption,
    isDuplicatingOption,
    handleDuplicateOption,
    renameOption,
    renameOptionValue,
    setRenameOptionValue,
    renameOptionError,
    isRenamingOption,
    startRenameOption,
    cancelRenameOption,
    executeRenameOption,
    optionDeleteConfirm,
    setOptionDeleteConfirm,
    isDeletingOption,
    executeDeleteOption,
  };
}
