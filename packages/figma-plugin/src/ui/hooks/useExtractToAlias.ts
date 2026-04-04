import { useState, useCallback } from 'react';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';

export interface UseExtractToAliasParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  onRefresh: () => void;
}

export function useExtractToAlias({
  connected,
  serverUrl,
  setName,
  onRefresh,
}: UseExtractToAliasParams) {
  const [extractToken, setExtractToken] = useState<{ path: string; $type?: string; $value: any } | null>(null);
  const [extractMode, setExtractMode] = useState<'new' | 'existing'>('new');
  const [newPrimitivePath, setNewPrimitivePath] = useState('');
  const [newPrimitiveSet, setNewPrimitiveSet] = useState('');
  const [existingAlias, setExistingAlias] = useState('');
  const [existingAliasSearch, setExistingAliasSearch] = useState('');
  const [extractError, setExtractError] = useState('');

  const handleOpenExtractToAlias = useCallback((path: string, $type?: string, $value?: any) => {
    const lastSegment = path.split('.').pop() ?? 'token';
    const suggested = `primitives.${$type || 'color'}.${lastSegment}`;
    setNewPrimitivePath(suggested);
    setNewPrimitiveSet(setName);
    setExistingAlias('');
    setExistingAliasSearch('');
    setExtractMode('new');
    setExtractError('');
    setExtractToken({ path, $type, $value });
  }, [setName]);

  const handleConfirmExtractToAlias = useCallback(async () => {
    if (!extractToken || !connected) return;
    setExtractError('');

    if (extractMode === 'new') {
      if (!newPrimitivePath.trim()) { setExtractError('Enter a path for the new primitive token.'); return; }
      try {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(newPrimitiveSet)}/${tokenPathToUrlSegment(newPrimitivePath.trim())}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: extractToken.$type, $value: extractToken.$value }),
        });
      } catch (err) {
        setExtractError(err instanceof ApiError ? err.message : 'Failed to create primitive token.');
        return;
      }
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(extractToken.path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $value: `{${newPrimitivePath.trim()}}` }),
      });
    } else {
      if (!existingAlias) { setExtractError('Select an existing token to alias.'); return; }
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(extractToken.path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $value: `{${existingAlias}}` }),
      });
    }

    setExtractToken(null);
    onRefresh();
  }, [extractToken, extractMode, newPrimitivePath, newPrimitiveSet, existingAlias, connected, serverUrl, setName, onRefresh]);

  return {
    extractToken, setExtractToken,
    extractMode, setExtractMode,
    newPrimitivePath, setNewPrimitivePath,
    newPrimitiveSet, setNewPrimitiveSet,
    existingAlias, setExistingAlias,
    existingAliasSearch, setExistingAliasSearch,
    extractError, setExtractError,
    handleOpenExtractToAlias,
    handleConfirmExtractToAlias,
  };
}
