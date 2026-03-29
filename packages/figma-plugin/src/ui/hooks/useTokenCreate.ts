import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { SelectionNodeInfo } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import { parseInlineValue, generateNameSuggestions } from '../components/tokenListHelpers';
import { getDefaultValue, nodeParentPath } from '../components/tokenListUtils';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { validateTokenPath } from '../shared/tokenParsers';
import { apiFetch, ApiError } from '../shared/apiFetch';

export interface PathValidation {
  error: string | null;
  warning: string | null;
  info: string | null;
}

export interface UseTokenCreateParams {
  defaultCreateOpen?: boolean;
  connected: boolean;
  serverUrl: string;
  setName: string;
  selectedNodes: SelectionNodeInfo[];
  siblingOrderMap: Map<string, string[]>;
  allGroupPaths: string[];
  allTokensFlat: Record<string, unknown>;
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
  allTokensFlat,
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
    try { return localStorage.getItem('tm_last_token_type') || 'color'; } catch (e) { console.debug('[useTokenCreate] storage read failed:', e); return 'color'; }
  });
  const setNewTokenType = (t: string) => {
    setNewTokenTypeState(t);
    try { localStorage.setItem('tm_last_token_type', t); } catch (e) { console.debug('[useTokenCreate] storage write failed:', e); }
  };
  const [newTokenValue, setNewTokenValue] = useState('');
  const [newTokenDescription, setNewTokenDescription] = useState('');
  const [typeAutoInferred, setTypeAutoInferred] = useState(false);
  const [createError, setCreateError] = useState('');
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [nameIsAutoSuggested, setNameIsAutoSuggested] = useState(false);
  const createFormRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Computed full path from group + name
  const newTokenPath = useMemo(() => {
    const g = newTokenGroup.trim();
    const n = newTokenName.trim();
    if (!n) return '';
    return g ? `${g}.${n}` : n;
  }, [newTokenGroup, newTokenName]);

  // Inline path validation — runs on every keystroke
  const pathValidation: PathValidation = useMemo(() => {
    const result: PathValidation = { error: null, warning: null, info: null };
    const path = newTokenPath;
    if (!path) return result;

    // 1) Invalid characters / format
    const pathError = validateTokenPath(path);
    if (pathError) {
      result.error = pathError;
      return result;
    }

    // 2) Would overwrite existing token
    if (path in allTokensFlat) {
      result.warning = `Token "${path}" already exists — creating will overwrite it`;
    }

    // 3) Parent group will be auto-created
    const group = newTokenGroup.trim();
    if (group && !allGroupPaths.includes(group)) {
      result.info = `Group "${group}" will be created automatically`;
    }

    return result;
  }, [newTokenPath, newTokenGroup, allTokensFlat, allGroupPaths]);

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

  // Auto-select pre-filled name so typing replaces it
  useEffect(() => {
    if (nameIsAutoSuggested && showCreateForm && nameInputRef.current) {
      requestAnimationFrame(() => {
        nameInputRef.current?.select();
      });
      setNameIsAutoSuggested(false);
    }
  }, [nameIsAutoSuggested, showCreateForm]);

  const handleOpenCreateSibling = useCallback((groupPath: string, tokenType: string) => {
    if (onCreateNew) {
      onCreateNew(groupPath ? groupPath + '.' : '', tokenType || 'color');
      return;
    }
    setNewTokenGroup(groupPath);
    // Auto-fill name from sibling pattern if available
    const siblings = siblingOrderMap.get(groupPath) ?? [];
    const layerName = selectedNodes.length === 1 ? selectedNodes[0].name : null;
    const suggestions = generateNameSuggestions(tokenType || 'color', '', groupPath, siblings, layerName);
    if (suggestions.length > 0) {
      const first = suggestions[0];
      const leafName = first.value.includes('.') ? first.value.slice(first.value.lastIndexOf('.') + 1) : first.value;
      // Only auto-fill pattern-based suggestions (not type prefix or layer name)
      if (!first.value.endsWith('.') && leafName.length > 0) {
        setNewTokenName(leafName);
        setNameIsAutoSuggested(true);
      } else {
        setNewTokenName('');
        setNameIsAutoSuggested(false);
      }
    } else {
      setNewTokenName('');
      setNameIsAutoSuggested(false);
    }
    setNewTokenType(tokenType || 'color');
    setShowCreateForm(true);
  }, [onCreateNew, siblingOrderMap, selectedNodes]);

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
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(effectiveSet)}/${trimmedPath.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: parsedValue,
          ...(newTokenDescription.trim() ? { $description: newTokenDescription.trim() } : {}),
        }),
      });
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
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, { method: 'DELETE' });
            onRefresh();
          },
          redo: async () => {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: createdType, $value: createdValue }),
            });
            onRefresh();
          },
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message || `Failed to create token (${err.status})`);
      } else {
        setCreateError('Network error — could not create token');
      }
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
    pathValidation,
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
    nameInputRef,
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
