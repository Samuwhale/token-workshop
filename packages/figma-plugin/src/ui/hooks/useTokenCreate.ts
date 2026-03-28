import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { SelectionNodeInfo, ApiErrorBody } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import { parseInlineValue, generateNameSuggestions } from '../components/tokenListHelpers';
import { getDefaultValue, nodeParentPath } from '../components/tokenListUtils';

export interface UseTokenCreateParams {
  defaultCreateOpen?: boolean;
  connected: boolean;
  serverUrl: string;
  setName: string;
  selectedNodes: SelectionNodeInfo[];
  siblingOrderMap: Map<string, string[]>;
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
  onCreateNew,
  onRefresh,
  onPushUndo,
  onTokenCreated,
  onRecordTouch,
}: UseTokenCreateParams) {
  const [showCreateForm, setShowCreateForm] = useState(defaultCreateOpen ?? false);
  const [newTokenPath, setNewTokenPath] = useState('');
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
  const [siblingPrefix, setSiblingPrefix] = useState<string | null>(null);
  const createFormRef = useRef<HTMLDivElement>(null);

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
    setSiblingPrefix(groupPath);
    setNewTokenPath(groupPath ? groupPath + '.' : '');
    setNewTokenType(tokenType || 'color');
    setShowCreateForm(true);
  }, [onCreateNew]);

  // Smart name suggestions for inline create form
  const nameSuggestions = useMemo(() => {
    if (!showCreateForm) return [];
    const groupPath = siblingPrefix ?? '';
    const siblings = siblingOrderMap.get(groupPath) ?? [];
    const layerName = selectedNodes.length === 1 ? selectedNodes[0].name : null;
    return generateNameSuggestions(newTokenType, newTokenValue, groupPath, siblings, layerName);
  }, [showCreateForm, siblingPrefix, siblingOrderMap, selectedNodes, newTokenType, newTokenValue]);

  const resetCreateForm = useCallback(() => {
    setShowCreateForm(false);
    setNewTokenPath('');
    setNewTokenValue('');
    setNewTokenDescription('');
    setSiblingPrefix(null);
    setCreateError('');
  }, []);

  const handleCreate = useCallback(async () => {
    const trimmedPath = newTokenPath.trim();
    if (!trimmedPath) { setCreateError('Token path cannot be empty'); return; }
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
      setShowCreateForm(false);
      setNewTokenPath('');
      setNewTokenValue('');
      setNewTokenDescription('');
      setSiblingPrefix(null);
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
  }, [newTokenPath, newTokenType, newTokenValue, newTokenDescription, connected, serverUrl, setName, onRefresh, onPushUndo, onTokenCreated, onRecordTouch]);

  const handleCreateAndNew = useCallback(async () => {
    const trimmedPath = newTokenPath.trim();
    if (!trimmedPath) { setCreateError('Token path cannot be empty'); return; }
    if (!connected) return;
    setCreateError('');
    const effectiveSet = setName || 'default';
    const parsedValue2 = newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType);
    if (parsedValue2 === null) { setCreateError('Invalid value — boolean tokens must be "true" or "false"'); return; }
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(effectiveSet)}/${trimmedPath.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: parsedValue2,
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
      const createdValue = parsedValue2;
      const capturedSet = effectiveSet;
      const capturedUrl = serverUrl;
      const capturedEncodedPath = createdPath.split('.').map(encodeURIComponent).join('/');
      // Compute parent prefix to pre-fill the next token in the same group
      const prefix = createdPath.length > (createdPath.split('.').pop()?.length ?? 0) + 1
        ? nodeParentPath(createdPath, createdPath.split('.').pop()!)
        : null;
      setSiblingPrefix(prefix ?? '');
      setNewTokenPath(prefix ? prefix + '.' : '');
      setNewTokenValue('');
      setNewTokenDescription('');
      setTypeAutoInferred(false);
      setCreateError('');
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
  }, [newTokenPath, newTokenType, newTokenValue, newTokenDescription, connected, serverUrl, setName, onRefresh, onPushUndo, onTokenCreated, onRecordTouch]);

  return {
    showCreateForm,
    setShowCreateForm,
    newTokenPath,
    setNewTokenPath,
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
    siblingPrefix,
    setSiblingPrefix,
    createFormRef,
    nameSuggestions,
    resetCreateForm,
    handleOpenCreateSibling,
    handleCreate,
    handleCreateAndNew,
  };
}
