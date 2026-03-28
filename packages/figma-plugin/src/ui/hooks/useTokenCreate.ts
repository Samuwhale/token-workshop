import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { SelectionNodeInfo, ApiErrorBody } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import { parseInlineValue, generateNameSuggestions } from '../components/tokenListHelpers';
import { getDefaultValue, nodeParentPath } from '../components/tokenListUtils';
import { fuzzyScore } from '../shared/fuzzyMatch';

export interface UseTokenCreateParams {
  defaultCreateOpen?: boolean;
  connected: boolean;
  serverUrl: string;
  setName: string;
  selectedNodes: SelectionNodeInfo[];
  siblingOrderMap: Map<string, string[]>;
  allGroupPaths: string[];
  onCreateNew?: (initialPath?: string, initialType?: string, initialValue?: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onTokenCreated?: (path: string) => void;
  onRecordTouch: (path: string) => void;
}

export function useTokenCreate({
  defaultCreateOpen,
  connected,
  serverUrl,
  setName,
  selectedNodes,
  siblingOrderMap,
  allGroupPaths,
  onCreateNew,
  onRefresh,
  onPushUndo,
  onTokenCreated,
  onRecordTouch,
}: UseTokenCreateParams) {
  const [showCreateForm, setShowCreateForm] = useState(defaultCreateOpen ?? false);
  const [newTokenGroup, setNewTokenGroup] = useState('');
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenType, setNewTokenTypeState] = useState(() => {
    try { return localStorage.getItem('tm_last_token_type') || 'color'; } catch { return 'color'; }
  });
  const setNewTokenType = (t: string) => {
    setNewTokenTypeState(t);
    try { localStorage.setItem('tm_last_token_type', t); } catch {}
  };
  const [newTokenValue, setNewTokenValue] = useState('');
  const [newTokenDescription, setNewTokenDescription] = useState('');
  const [typeAutoInferred, setTypeAutoInferred] = useState(false);
  const [createError, setCreateError] = useState('');
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const createFormRef = useRef<HTMLDivElement>(null);

  // Computed full path from group + name
  const newTokenPath = useMemo(() => {
    const g = newTokenGroup.trim();
    const n = newTokenName.trim();
    if (!n) return '';
    return g ? `${g}.${n}` : n;
  }, [newTokenGroup, newTokenName]);

  const [groupActiveIdx, setGroupActiveIdx] = useState(-1);

  // Filtered group suggestions with fuzzy scoring
  const filteredGroups = useMemo(() => {
    const q = newTokenGroup.trim();
    if (!q) return allGroupPaths;
    const scored = allGroupPaths
      .map(p => ({ path: p, score: fuzzyScore(q, p) }))
      .filter(x => x.score >= 0);
    scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return scored.map(x => x.path);
  }, [newTokenGroup, allGroupPaths]);

  // Reset keyboard index when suggestions change
  useEffect(() => {
    setGroupActiveIdx(-1);
  }, [filteredGroups]);

  // Scroll to and pulse the create form when it appears
  useEffect(() => {
    if (showCreateForm && createFormRef.current) {
      createFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      createFormRef.current.classList.remove('create-form-pulse');
      void createFormRef.current.offsetWidth;
      createFormRef.current.classList.add('create-form-pulse');
    }
  }, [showCreateForm]);

  const handleOpenCreateSibling = useCallback((groupPath: string, tokenType: string) => {
    if (onCreateNew) {
      onCreateNew(groupPath ? groupPath + '.' : '', tokenType || 'color');
      return;
    }
    setNewTokenGroup(groupPath);
    setNewTokenName('');
    setNewTokenType(tokenType || 'color');
    setShowCreateForm(true);
  }, [onCreateNew]);

  // Smart name suggestions for inline create form
  const nameSuggestions = useMemo(() => {
    if (!showCreateForm) return [];
    const groupPath = newTokenGroup.trim();
    const siblings = siblingOrderMap.get(groupPath) ?? [];
    const layerName = selectedNodes.length === 1 ? selectedNodes[0].name : null;
    return generateNameSuggestions(newTokenType, newTokenValue, groupPath, siblings, layerName);
  }, [showCreateForm, newTokenGroup, siblingOrderMap, selectedNodes, newTokenType, newTokenValue]);

  const resetCreateForm = useCallback(() => {
    setShowCreateForm(false);
    setNewTokenGroup('');
    setNewTokenName('');
    setNewTokenValue('');
    setNewTokenDescription('');
    setCreateError('');
    setGroupDropdownOpen(false);
  }, []);

  const doCreate = useCallback(async (keepOpen: boolean) => {
    const trimmedPath = newTokenPath.trim();
    if (!trimmedPath) { setCreateError('Token name cannot be empty'); return; }
    if (!newTokenName.trim()) { setCreateError('Token name cannot be empty'); return; }
    if (!connected) return;
    setCreateError('');
    const effectiveSet = setName || 'default';
    const parsedValue = newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType);
    if (parsedValue === null) { setCreateError('Invalid value — boolean tokens must be "true" or "false"'); return; }
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(effectiveSet)}/${trimmedPath.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: parsedValue,
          ...(newTokenDescription.trim() ? { $description: newTokenDescription.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data: ApiErrorBody = await res.json().catch(() => ({}));
        setCreateError(data.error || `Failed to create token (${res.status})`);
        return;
      }
      const createdPath = trimmedPath;
      const createdType = newTokenType;
      const createdValue = parsedValue;
      const capturedSet = effectiveSet;
      const capturedUrl = serverUrl;
      const capturedEncodedPath = createdPath.split('.').map(encodeURIComponent).join('/');
      if (keepOpen) {
        // Keep group, clear name for next token in same group
        setNewTokenName('');
        setNewTokenValue('');
        setNewTokenDescription('');
        setTypeAutoInferred(false);
        setCreateError('');
      } else {
        setShowCreateForm(false);
        setNewTokenGroup('');
        setNewTokenName('');
        setNewTokenValue('');
        setNewTokenDescription('');
      }
      onRefresh();
      onTokenCreated?.(createdPath);
      onRecordTouch(createdPath);
      if (onPushUndo) {
        onPushUndo({
          description: `Create "${createdPath.split('.').pop() ?? createdPath}"`,
          restore: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, { method: 'DELETE' });
            onRefresh();
          },
          redo: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: createdType, $value: createdValue }),
            });
            onRefresh();
          },
        });
      }
    } catch (err) {
      setCreateError('Network error — could not create token');
    }
  }, [newTokenPath, newTokenName, newTokenType, newTokenValue, newTokenDescription, connected, serverUrl, setName, onRefresh, onPushUndo, onTokenCreated, onRecordTouch]);

  const handleCreate = useCallback(() => doCreate(false), [doCreate]);
  const handleCreateAndNew = useCallback(() => doCreate(true), [doCreate]);

  return {
    showCreateForm,
    setShowCreateForm,
    newTokenGroup,
    setNewTokenGroup,
    newTokenName,
    setNewTokenName,
    newTokenPath,
    newTokenType,
    setNewTokenType,
    newTokenValue,
    setNewTokenValue,
    newTokenDescription,
    setNewTokenDescription,
    typeAutoInferred,
    setTypeAutoInferred,
    createError,
    setCreateError,
    createFormRef,
    nameSuggestions,
    filteredGroups,
    allGroupPaths,
    groupDropdownOpen,
    setGroupDropdownOpen,
    groupActiveIdx,
    setGroupActiveIdx,
    resetCreateForm,
    handleOpenCreateSibling,
    handleCreate,
    handleCreateAndNew,
  };
}
