import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { UndoSlot } from './useUndo';
import { parseInlineValue, generateNameSuggestions } from '../components/tokenListHelpers';
import { getDefaultValue } from '../components/tokenListUtils';
import { validateTokenPath } from '../shared/tokenParsers';
import { ApiError } from '../shared/apiFetch';
import { ssGetJson, ssRemove, ssSetJson } from '../shared/storage';
import {
  createToken,
  createTokenBody,
  deleteToken,
} from '../shared/tokenMutations';

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

// --- sessionStorage persistence for table-create recovery ---
const STORAGE_KEY = 'tokenmanager:table-create-draft';

interface TableDraft {
  group: string;
  rows: TableRow[];
}

function saveDraft(group: string, rows: TableRow[]): void {
  // Only save if there's meaningful data (at least one row with content)
  const hasContent = rows.some(r => r.name.trim() || r.value.trim());
  if (!hasContent) {
    ssRemove(STORAGE_KEY);
    return;
  }
  ssSetJson(STORAGE_KEY, { group, rows });
}

function loadDraft(): TableDraft | null {
  try {
    const draft = ssGetJson<TableDraft | null>(STORAGE_KEY, null);
    if (!draft) return null;
    if (!Array.isArray(draft.rows) || draft.rows.length === 0) return null;
    // Re-assign IDs to avoid collisions with current counter
    draft.rows = draft.rows.map(r => ({ ...r, id: newRowId() }));
    return draft;
  } catch {
    ssRemove(STORAGE_KEY);
    return null;
  }
}

function clearDraft(): void {
  ssRemove(STORAGE_KEY);
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
  const [hasDraft, setHasDraft] = useState(false);

  // Track whether user has dismissed the recovery banner this session
  const dismissedRecovery = useRef(false);

  // Auto-save draft to sessionStorage whenever rows or group change
  useEffect(() => {
    if (showTableCreate) {
      saveDraft(tableGroup, tableRows);
    }
  }, [showTableCreate, tableGroup, tableRows]);

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

  // Close without clearing the draft — used by Cancel so work can be recovered
  const closeTableCreate = useCallback(() => {
    setShowTableCreate(false);
    setRowErrors({});
    setCreateAllError('');
    setBusy(false);
    // Don't clear hasDraft or dismissedRecovery — next open will detect the saved draft
  }, []);

  // Full reset — clears draft from sessionStorage. Used after successful creation.
  const resetTableCreate = useCallback(() => {
    setShowTableCreate(false);
    setTableGroup('');
    setTableRows([makeRow()]);
    setRowErrors({});
    setCreateAllError('');
    setBusy(false);
    setHasDraft(false);
    dismissedRecovery.current = false;
    clearDraft();
  }, []);

  const restoreDraft = useCallback(() => {
    const draft = loadDraft();
    if (draft) {
      setTableGroup(draft.group);
      setTableRows(draft.rows);
      setHasDraft(false);
      dismissedRecovery.current = true;
    }
  }, []);

  const dismissDraft = useCallback(() => {
    setHasDraft(false);
    dismissedRecovery.current = true;
    clearDraft();
  }, []);

  const openTableCreate = useCallback((group = '') => {
    setRowErrors({});
    setCreateAllError('');
    setBusy(false);
    dismissedRecovery.current = false;

    // Check for a saved draft to offer recovery
    const draft = loadDraft();
    if (draft) {
      setHasDraft(true);
      // Start with a fresh table; user can choose to restore
      setTableGroup(group);
      setTableRows([makeRow()]);
    } else {
      setHasDraft(false);
      setTableGroup(group);
      setTableRows([makeRow()]);
    }

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
    const created: Array<{ path: string; tokenPath: string; type: string; value: unknown }> = [];

    let batchAborted = false;

    for (const row of rowsToCreate) {
      const g = tableGroup.trim();
      const n = row.name.trim();
      const path = g ? `${g}.${n}` : n;
      const parsedValue = row.value.trim()
        ? parseInlineValue(row.type, row.value.trim())
        : getDefaultValue(row.type);

      if (parsedValue === null) {
        setRowErrors(prev => ({ ...prev, [row.id]: 'Invalid value for type' }));
        batchAborted = true;
        break;
      }

      try {
        await createToken(serverUrl, effectiveSet, path, createTokenBody({ $type: row.type, $value: parsedValue }));
        created.push({ path, tokenPath: path, type: row.type, value: parsedValue });
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
              await deleteToken(capturedUrl, capturedSet, c.tokenPath);
            }
            onRefresh();
          },
          redo: async () => {
            for (const c of created) {
              await createToken(capturedUrl, capturedSet, c.tokenPath, createTokenBody({ $type: c.type, $value: c.value }));
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
    hasDraft,
    addRow,
    removeRow,
    updateRow,
    closeTableCreate,
    resetTableCreate,
    restoreDraft,
    dismissDraft,
    openTableCreate,
    handleCreateAll,
    tableSuggestions,
  };
}
