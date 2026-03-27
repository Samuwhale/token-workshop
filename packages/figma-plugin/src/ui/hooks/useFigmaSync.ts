import { useState, useCallback } from 'react';
import { fetchAllTokensFlat } from './useTokens';
import { resolveAllAliases } from '../../shared/resolveAlias';

export function useFigmaSync(
  serverUrl: string,
  connected: boolean,
  pathToSet: Record<string, string>,
  setCollectionNames: Record<string, string>,
  setModeNames: Record<string, string>,
  activeSet: string,
) {
  const [syncGroupPending, setSyncGroupPending] = useState<{ groupPath: string; tokenCount: number } | null>(null);
  const [syncGroupStylesPending, setSyncGroupStylesPending] = useState<{ groupPath: string; tokenCount: number } | null>(null);
  const [groupScopesPath, setGroupScopesPath] = useState<string | null>(null);
  const [groupScopesSelected, setGroupScopesSelected] = useState<string[]>([]);
  const [groupScopesApplying, setGroupScopesApplying] = useState(false);
  const [groupScopesError, setGroupScopesError] = useState<string | null>(null);

  const handleSyncGroup = useCallback(async () => {
    if (!syncGroupPending || !connected) return;
    const { groupPath } = syncGroupPending;
    setSyncGroupPending(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const resolved = resolveAllAliases(rawMap);
      const prefix = groupPath + '.';
      const tokens: { path: string; $type: string; $value: any; setName?: string }[] = [];
      for (const [path, entry] of Object.entries(resolved)) {
        if (path === groupPath || path.startsWith(prefix)) {
          tokens.push({ path, $type: entry.$type, $value: entry.$value, setName: pathToSet[path] });
        }
      }
      parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap: setCollectionNames, modeMap: setModeNames } }, '*');
    } catch (err) {
      console.error('Failed to sync group to Figma:', err);
      setSyncGroupPending(syncGroupPending);
    }
  }, [syncGroupPending, connected, serverUrl, pathToSet, setCollectionNames, setModeNames]);

  const handleSyncGroupStyles = useCallback(async () => {
    if (!syncGroupStylesPending || !connected) return;
    const { groupPath } = syncGroupStylesPending;
    setSyncGroupStylesPending(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const resolved = resolveAllAliases(rawMap);
      const prefix = groupPath + '.';
      const tokens: { path: string; $type: string; $value: any }[] = [];
      for (const [path, entry] of Object.entries(resolved)) {
        if (path === groupPath || path.startsWith(prefix)) {
          tokens.push({ path, $type: entry.$type, $value: entry.$value });
        }
      }
      parent.postMessage({ pluginMessage: { type: 'apply-styles', tokens } }, '*');
    } catch (err) {
      console.error('Failed to create styles from group:', err);
      setSyncGroupStylesPending(syncGroupStylesPending);
    }
  }, [syncGroupStylesPending, connected, serverUrl]);

  const handleApplyGroupScopes = useCallback(async () => {
    if (!groupScopesPath || !connected) return;
    setGroupScopesApplying(true);
    setGroupScopesError(null);
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      const data = await res.json();
      const prefix = groupScopesPath + '.';
      const tokenPaths: string[] = [];
      const walk = (group: Record<string, any>, p: string) => {
        for (const [key, val] of Object.entries(group)) {
          if (key.startsWith('$')) continue;
          const path = p ? `${p}.${key}` : key;
          if (val && typeof val === 'object' && '$value' in val) {
            if (path === groupScopesPath || path.startsWith(prefix)) {
              tokenPaths.push(path);
            }
          } else if (val && typeof val === 'object') {
            walk(val, path);
          }
        }
      };
      walk(data.tokens || {}, '');
      const total = tokenPaths.length;
      const BATCH_SIZE = 5;
      let done = 0;
      setGroupScopesProgress({ done: 0, total });
      for (let i = 0; i < tokenPaths.length; i += BATCH_SIZE) {
        const batch = tokenPaths.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(path =>
          fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $extensions: { 'com.figma.scopes': groupScopesSelected } }),
          })
        ));
        done += batch.length;
        setGroupScopesProgress({ done, total });
      }
      setGroupScopesPath(null);
      setGroupScopesSelected([]);
    } catch (err) {
      console.error('Failed to apply group scopes:', err);
      setGroupScopesError(err instanceof Error ? err.message : 'Failed to apply scopes');
    } finally {
      setGroupScopesApplying(false);
      setGroupScopesProgress(null);
    }
  }, [groupScopesPath, groupScopesSelected, connected, serverUrl, activeSet]);

  return {
    syncGroupPending,
    setSyncGroupPending,
    syncGroupStylesPending,
    setSyncGroupStylesPending,
    groupScopesPath,
    setGroupScopesPath,
    groupScopesSelected,
    setGroupScopesSelected,
    groupScopesApplying,
    groupScopesError,
    setGroupScopesError,
    handleSyncGroup,
    handleSyncGroupStyles,
    handleApplyGroupScopes,
  };
}
