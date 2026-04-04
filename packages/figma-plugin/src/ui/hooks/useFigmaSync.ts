import { getErrorMessage } from '../shared/utils';
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { fetchAllTokensFlat } from './useTokens';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { useFigmaMessage } from './useFigmaMessage';
import { extractSyncApplyResult } from './useTokenSyncBase';

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
  const [groupScopesProgress, setGroupScopesProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncGroupStylesError, setSyncGroupStylesError] = useState<string | null>(null);
  const [syncGroupError, setSyncGroupError] = useState<string | null>(null);
  const [syncGroupApplying, setSyncGroupApplying] = useState(false);
  const [syncGroupProgress, setSyncGroupProgress] = useState<{ current: number; total: number } | null>(null);
  const [syncGroupStylesApplying, setSyncGroupStylesApplying] = useState(false);
  const [syncGroupStylesProgress, setSyncGroupStylesProgress] = useState<{ current: number; total: number } | null>(null);

  const abortRef = useRef(new AbortController());
  useEffect(() => {
    const controller = abortRef.current;
    return () => { controller.abort(); };
  }, []);

  // Listen for incremental progress messages from the plugin sandbox
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variable-sync-progress') {
        setSyncGroupProgress({ current: msg.current as number, total: msg.total as number });
      } else if (msg?.type === 'style-sync-progress') {
        setSyncGroupStylesProgress({ current: msg.current as number, total: msg.total as number });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sendStyleApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[] }>({
    responseType: 'styles-applied',
    errorType: 'styles-apply-error',
    timeout: 15000,
    extractResponse: extractSyncApplyResult,
  });

  const sendVarApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[] }>({
    responseType: 'variables-applied',
    errorType: 'apply-variables-error',
    timeout: 30000,
    extractResponse: extractSyncApplyResult,
  });

  const handleSyncGroup = useCallback(async () => {
    if (!syncGroupPending || !connected) return;
    const saved = syncGroupPending;
    setSyncGroupPending(null);
    setSyncGroupApplying(true);
    setSyncGroupProgress(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const resolved = resolveAllAliases(rawMap);
      const prefix = saved.groupPath + '.';
      const tokens: { path: string; $type: string; $value: any; setName?: string }[] = [];
      for (const [path, entry] of Object.entries(resolved)) {
        if (path === saved.groupPath || path.startsWith(prefix)) {
          tokens.push({ path, $type: entry.$type, $value: entry.$value, setName: pathToSet[path] });
        }
      }
      const result = await sendVarApply('apply-variables', { tokens, collectionMap: setCollectionNames, modeMap: setModeNames });
      if (result.failures.length > 0) {
        const failedPaths = result.failures.map(f => f.path).join(', ');
        setSyncGroupError(`${result.count}/${result.total} variables synced. Failed: ${failedPaths}`);
      } else {
        parent.postMessage({ pluginMessage: { type: 'notify', message: `${result.count} variable${result.count !== 1 ? 's' : ''} synced` } }, '*');
      }
    } catch (err) {
      if (abortRef.current.signal.aborted) return;
      console.error('Failed to sync group to Figma:', err);
      setSyncGroupError(getErrorMessage(err, 'Failed to sync group to Figma'));
    } finally {
      if (!abortRef.current.signal.aborted) {
        setSyncGroupApplying(false);
        setSyncGroupProgress(null);
      }
    }
  }, [syncGroupPending, connected, serverUrl, pathToSet, setCollectionNames, setModeNames, sendVarApply]);

  const handleSyncGroupStyles = useCallback(async () => {
    if (!syncGroupStylesPending || !connected) return;
    const saved = syncGroupStylesPending;
    setSyncGroupStylesPending(null);
    setSyncGroupStylesError(null);
    setSyncGroupStylesApplying(true);
    setSyncGroupStylesProgress(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const resolved = resolveAllAliases(rawMap);
      const prefix = saved.groupPath + '.';
      const tokens: { path: string; $type: string; $value: any; setName?: string }[] = [];
      for (const [path, entry] of Object.entries(resolved)) {
        if (path === saved.groupPath || path.startsWith(prefix)) {
          tokens.push({ path, $type: entry.$type, $value: entry.$value, setName: pathToSet[path] });
        }
      }
      const result = await sendStyleApply('apply-styles', { tokens });
      if (result.failures.length > 0) {
        const failedPaths = result.failures.map(f => f.path).join(', ');
        setSyncGroupStylesError(`${result.count}/${result.total} styles created. Failed: ${failedPaths}`);
      } else {
        parent.postMessage({ pluginMessage: { type: 'notify', message: `${result.count} style${result.count !== 1 ? 's' : ''} created` } }, '*');
      }
    } catch (err) {
      if (abortRef.current.signal.aborted) return;
      console.error('Failed to create styles from group:', err);
      setSyncGroupStylesError(getErrorMessage(err, 'Failed to create styles from group'));
    } finally {
      if (!abortRef.current.signal.aborted) {
        setSyncGroupStylesApplying(false);
        setSyncGroupStylesProgress(null);
      }
    }
  }, [syncGroupStylesPending, connected, serverUrl, pathToSet, sendStyleApply]);

  const handleApplyGroupScopes = useCallback(async () => {
    if (!groupScopesPath || !connected) return;
    const signal = abortRef.current.signal;
    setGroupScopesApplying(true);
    setGroupScopesError(null);
    try {
      const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`, { signal });
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
        await Promise.all(batch.map(async path => {
          await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${path.split('.').map(encodeURIComponent).join('/')}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $extensions: { 'com.figma.scopes': groupScopesSelected } }),
            signal,
          });
        }));
        done += batch.length;
        if (!signal.aborted) setGroupScopesProgress({ done, total });
      }
      setGroupScopesPath(null);
      setGroupScopesSelected([]);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Failed to apply group scopes:', err);
      setGroupScopesError(getErrorMessage(err, 'Failed to apply scopes'));
    } finally {
      if (!signal.aborted) {
        setGroupScopesApplying(false);
        setGroupScopesProgress(null);
      }
    }
  }, [groupScopesPath, groupScopesSelected, connected, serverUrl, activeSet]);

  return {
    syncGroupPending,
    setSyncGroupPending,
    syncGroupApplying,
    syncGroupProgress,
    syncGroupStylesPending,
    setSyncGroupStylesPending,
    syncGroupStylesApplying,
    syncGroupStylesProgress,
    groupScopesPath,
    setGroupScopesPath,
    groupScopesSelected,
    setGroupScopesSelected,
    groupScopesApplying,
    groupScopesError,
    setGroupScopesError,
    groupScopesProgress,
    handleSyncGroup,
    handleSyncGroupStyles,
    syncGroupStylesError,
    syncGroupError,
    handleApplyGroupScopes,
  };
}
