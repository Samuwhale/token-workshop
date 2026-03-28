import { useState, useCallback, useMemo } from 'react';
import type { UndoSlot } from './useUndo';
import { parseInlineValue, generateNameSuggestions } from '../components/tokenListHelpers';
import { getDefaultValue } from '../components/tokenListUtils';
import { validateTokenPath } from '../shared/tokenParsers';
import { apiFetch, ApiError } from '../shared/apiFetch';

export interface TableRow {
  id: string;
  name: string;
  type: string;
  value: string;
}

let rowCounter = 0;
function newRowId() { return `trow-${++rowCounter}`; }
function makeRow(type = 'color'): TableRow {
  return { id: newRowId(), name: '', type, value: '' };
}

export interface UseTableCreateParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  siblingOrderMap: Map<string, string[]>;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onTokenCreated?: (path: string) => void;
  onRecordTouch: (path: string) => void;
}

export function useTableCreate({
  connected,
  serverUrl,
  setName,
  siblingOrderMap,
  onRefresh,
  onPushUndo,
  onTokenCreated,
  onRecordTouch,
}: UseTableCreateParams) {
  const [showTableCreate, setShowTableCreate] = useState(false);
  const [tableGroup, setTableGroup] = useState('');
  const [tableRows, setTableRows] = useState<TableRow[]>(() => [makeRow()]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [createAllError, setCreateAllError] = useState('');
  const [busy, setBusy] = useState(false);

  const addRow = useCallback((inheritType?: string) => {
    setTableRows(prev => {
      const lastType = prev.length > 0 ? prev[prev.length - 1].type : 'color';
      return [...prev, makeRow(inheritType ?? lastType)];
    });
  }, []);

  const removeRow = useCallback((id: string) => {
    setTableRows(prev => {
      if (prev.length <= 1) return [makeRow(prev[0]?.type)];
      return prev.filter(r => r.id !== id);
    });
    setRowErrors(prev => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  const updateRow = useCallback((id: string, field: keyof Omit<TableRow, 'id'>, value: string) => {
    setTableRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    if (field === 'name') {
      setRowErrors(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
    setCreateAllError('');
  }, []);

  const resetTableCreate = useCallback(() => {
    setShowTableCreate(false);
    setTableGroup('');
    setTableRows([makeRow()]);
    setRowErrors({});
    setCreateAllError('');
    setBusy(false);
  }, []);

  const openTableCreate = useCallback((group = '') => {
    setTableGroup(group);
    setTableRows([makeRow()]);
    setRowErrors({});
    setCreateAllError('');
    setBusy(false);
    setShowTableCreate(true);
  }, []);

  const handleCreateAll = useCallback(async () => {
    if (!connected || busy) return;

    const rowsToCreate = tableRows.filter(r => r.name.trim());
    if (rowsToCreate.length === 0) {
      setCreateAllError('Add at least one token name');
      return;
    }

    const errors: Record<string, string> = {};
    const seenPaths = new Set<string>();

    for (const row of rowsToCreate) {
      const g = tableGroup.trim();
      const n = row.name.trim();
      const path = g ? `${g}.${n}` : n;
      const pathError = validateTokenPath(path);
      if (pathError) { errors[row.id] = pathError; continue; }
      if (seenPaths.has(path)) { errors[row.id] = `Duplicate name "${n}"`; continue; }
      seenPaths.add(path);
    }

    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      return;
    }

    setBusy(true);
    setCreateAllError('');
    const effectiveSet = setName || 'default';
    const created: Array<{ path: string; encodedPath: string; type: string; value: unknown }> = [];

    let batchAborted = false;

    for (const row of rowsToCreate) {
      const g = tableGroup.trim();
      const n = row.name.trim();
      const path = g ? `${g}.${n}` : n;
      const encodedPath = path.split('.').map(encodeURIComponent).join('/');
      const parsedValue = row.value.trim()
        ? parseInlineValue(row.type, row.value.trim())
        : getDefaultValue(row.type);

      if (parsedValue === null) {
        setRowErrors(prev => ({ ...prev, [row.id]: 'Invalid value for type' }));
        batchAborted = true;
        break;
      }

      try {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(effectiveSet)}/${encodedPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: row.type, $value: parsedValue }),
        });
        created.push({ path, encodedPath, type: row.type, value: parsedValue });
      } catch (err) {
        if (err instanceof ApiError) {
          setRowErrors(prev => ({ ...prev, [row.id]: err.message || `Failed (${err.status})` }));
        } else {
          setCreateAllError('Network error — could not create tokens');
        }
        batchAborted = true;
        break;
      }
    }

    // Always refresh and register undo for any tokens that were created,
    // even if the batch was aborted mid-way through.
    if (created.length > 0) {
      onRefresh();
      for (const c of created) {
        onTokenCreated?.(c.path);
        onRecordTouch(c.path);
      }

      if (onPushUndo) {
        const capturedUrl = serverUrl;
        const capturedSet = effectiveSet;
        onPushUndo({
          description: `Create ${created.length} token${created.length > 1 ? 's' : ''}`,
          restore: async () => {
            for (const c of created) {
              await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${c.encodedPath}`, { method: 'DELETE' });
            }
            onRefresh();
          },
          redo: async () => {
            for (const c of created) {
              await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${c.encodedPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ $type: c.type, $value: c.value }),
              });
            }
            onRefresh();
          },
        });
      }
    }

    if (batchAborted) {
      if (created.length > 0) {
        setCreateAllError(`Created ${created.length} token${created.length > 1 ? 's' : ''} before error — use undo to revert`);
      }
      setBusy(false);
      return;
    }

    resetTableCreate();
  }, [connected, busy, tableRows, tableGroup, setName, serverUrl, onRefresh, onPushUndo, onTokenCreated, onRecordTouch, resetTableCreate]);

  // Smart suggestions for the table create group
  const tableSuggestions = useMemo(() => {
    if (!showTableCreate) return [];
    const group = tableGroup.trim();
    const siblings = siblingOrderMap.get(group) ?? [];
    // Determine dominant type from existing rows
    const rowType = tableRows[0]?.type || 'color';
    return generateNameSuggestions(rowType, '', group, siblings, null);
  }, [showTableCreate, tableGroup, siblingOrderMap, tableRows]);

  return {
    showTableCreate,
    setShowTableCreate,
    tableGroup,
    setTableGroup,
    tableRows,
    rowErrors,
    createAllError,
    busy,
    addRow,
    removeRow,
    updateRow,
    resetTableCreate,
    openTableCreate,
    handleCreateAll,
    tableSuggestions,
  };
}
