import { getErrorMessage, isAbortError } from '../shared/utils';
import { dispatchToast } from '../shared/toastBus';
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { createTokenBody, updateToken } from '../shared/tokenMutations';
import { fetchAllTokensFlat } from './useTokens';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { getPluginMessageFromEvent } from '../../shared/utils';
import type {
  StylesAppliedMessage,
  VariablesAppliedMessage,
} from '../../shared/types';
import { useFigmaMessage } from './useFigmaMessage';
import { extractSyncApplyResult } from './useTokenSyncBase';

// ── Per-flow state ────────────────────────────────────────────────────────
// Encapsulates the repeated (pending / applying / progress / error) pattern
// that appears once per sync entity (variables, styles).

function useSyncFlow<TPending>() {
  const [pending, setPending] = useState<TPending | null>(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return { pending, setPending, applying, setApplying, progress, setProgress, error, setError };
}

type GroupPending = { groupPath: string; tokenCount: number };

export function useFigmaSync(
  serverUrl: string,
  connected: boolean,
  pathToCollectionId: Record<string, string>,
  collectionMap: Record<string, string>,
  modeMap: Record<string, string>,
  currentCollectionId: string,
) {
  const varFlow = useSyncFlow<GroupPending>();
  const styleFlow = useSyncFlow<GroupPending>();
  const {
    pending: syncGroupPending,
    setPending: setSyncGroupPending,
    applying: syncGroupApplying,
    setApplying: setSyncGroupApplying,
    progress: syncGroupProgress,
    setProgress: setSyncGroupProgress,
    error: syncGroupError,
    setError: setSyncGroupError,
  } = varFlow;
  const {
    pending: syncGroupStylesPending,
    setPending: setSyncGroupStylesPending,
    applying: syncGroupStylesApplying,
    setApplying: setSyncGroupStylesApplying,
    progress: syncGroupStylesProgress,
    setProgress: setSyncGroupStylesProgress,
    error: syncGroupStylesError,
    setError: setSyncGroupStylesError,
  } = styleFlow;

  const [groupScopesPath, setGroupScopesPath] = useState<string | null>(null);
  const [groupScopesSelected, setGroupScopesSelected] = useState<string[]>([]);
  const [groupScopesApplying, setGroupScopesApplying] = useState(false);
  const [groupScopesError, setGroupScopesError] = useState<string | null>(null);
  const [groupScopesProgress, setGroupScopesProgress] = useState<{ done: number; total: number } | null>(null);

  const abortRef = useRef(new AbortController());
  useEffect(() => {
    const controller = abortRef.current;
    return () => { controller.abort(); };
  }, []);

  // Listen for incremental progress messages from the plugin sandbox
  useEffect(() => {
    const signal = abortRef.current.signal;
    const handler = (ev: MessageEvent) => {
      if (signal.aborted) return;
      const msg = getPluginMessageFromEvent<{ type?: string; current?: number; total?: number }>(ev);
      if (msg?.type === 'variable-sync-progress') {
        setSyncGroupProgress({ current: msg.current as number, total: msg.total as number });
      } else if (msg?.type === 'style-sync-progress') {
        setSyncGroupStylesProgress({ current: msg.current as number, total: msg.total as number });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setSyncGroupProgress, setSyncGroupStylesProgress]);

  const sendStyleApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[]; skipped: Array<{ path: string; $type: string }> }, StylesAppliedMessage>({
    responseType: 'styles-applied',
    errorType: 'styles-apply-error',
    timeout: 15000,
    extractResponse: extractSyncApplyResult,
  });

  const sendVarApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[]; skipped: Array<{ path: string; $type: string }> }, VariablesAppliedMessage>({
    responseType: 'variables-applied',
    errorType: 'apply-variables-error',
    timeout: 30000,
    extractResponse: extractSyncApplyResult,
  });

  // ── Shared group-sync helper ──────────────────────────────────────────────
  // Fetches all resolved tokens, filters to the given group, and sends them.

  const syncGroupBase = useCallback(async ({
    pending,
    setPending,
    setApplying,
    setProgress,
    setError,
    sendApply,
    buildPayload,
    successMsg,
    entityName,
  }: {
    pending: GroupPending | null;
    setPending: (v: null) => void;
    setApplying: (v: boolean) => void;
    setProgress: (v: { current: number; total: number } | null) => void;
    setError: (v: string | null) => void;
    sendApply: (type: string, payload: Record<string, any>) => Promise<{ count: number; total: number; failures: { path: string; error: string }[]; skipped: Array<{ path: string; $type: string }> }>;
    buildPayload: (tokens: { path: string; $type: string; $value: any; collectionId?: string }[]) => Record<string, any>;
    successMsg: (count: number, skippedCount: number) => string;
    entityName: string;
  }) => {
    if (!pending || !connected) return;
    const saved = pending;
    setPending(null);
    setApplying(true);
    setProgress(null);
    setError(null);
    const prefix = saved.groupPath + '.';
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const resolved = resolveAllAliases(rawMap);
      const tokens: { path: string; $type: string; $value: any; collectionId?: string }[] = [];
      for (const [path, entry] of Object.entries(resolved)) {
        if (path === saved.groupPath || path.startsWith(prefix)) {
          tokens.push({ path, $type: entry.$type, $value: entry.$value, collectionId: pathToCollectionId[path] });
        }
      }
      const result = await sendApply('', buildPayload(tokens));
      const skippedCount = result.skipped?.length ?? 0;
      if (result.failures.length > 0) {
        const failedPaths = result.failures.map(f => f.path).join(', ');
        const skippedNote = skippedCount > 0 ? ` · ${skippedCount} skipped (unsupported type)` : '';
        setError(`${result.count}/${result.total} ${entityName} published. Failed: ${failedPaths}${skippedNote}`);
      } else {
        dispatchToast(successMsg(result.count, skippedCount), 'success', {
          destination: { kind: "workspace", topTab: "sync", subTab: "figma-sync" },
        });
      }
    } catch (err) {
      if (abortRef.current.signal.aborted) return;
      console.error(`Failed to sync group (${entityName}):`, err);
      setError(getErrorMessage(err, `Failed to sync group to Figma`));
    } finally {
      if (!abortRef.current.signal.aborted) {
        setApplying(false);
        setProgress(null);
      }
    }
  }, [connected, serverUrl, pathToCollectionId]);

  const handleSyncGroup = useCallback(async () => {
    await syncGroupBase({
      pending: syncGroupPending,
      setPending: setSyncGroupPending,
      setApplying: setSyncGroupApplying,
      setProgress: setSyncGroupProgress,
      setError: setSyncGroupError,
      sendApply: (_, payload) => sendVarApply('apply-variables', payload),
      buildPayload: (tokens) => ({ tokens, collectionMap, modeMap }),
      successMsg: (count, skipped) => `${count} variable${count !== 1 ? 's' : ''} published${skipped > 0 ? ` · ${skipped} skipped (unsupported type)` : ''}`,
      entityName: 'variables',
    });
  }, [
    sendVarApply,
    collectionMap,
    modeMap,
    setSyncGroupApplying,
    setSyncGroupError,
    setSyncGroupPending,
    setSyncGroupProgress,
    syncGroupBase,
    syncGroupPending,
  ]);

  const handleSyncGroupStyles = useCallback(async () => {
    await syncGroupBase({
      pending: syncGroupStylesPending,
      setPending: setSyncGroupStylesPending,
      setApplying: setSyncGroupStylesApplying,
      setProgress: setSyncGroupStylesProgress,
      setError: setSyncGroupStylesError,
      sendApply: (_, payload) => sendStyleApply('apply-styles', payload),
      buildPayload: (tokens) => ({ tokens }),
      successMsg: (count, skipped) => `${count} style${count !== 1 ? 's' : ''} created${skipped > 0 ? ` · ${skipped} skipped (unsupported type)` : ''}`,
      entityName: 'styles',
    });
  }, [
    sendStyleApply,
    setSyncGroupStylesApplying,
    setSyncGroupStylesError,
    setSyncGroupStylesPending,
    setSyncGroupStylesProgress,
    syncGroupBase,
    syncGroupStylesPending,
  ]);

  const handleApplyGroupScopes = useCallback(async () => {
    if (!groupScopesPath || !connected) return;
    const signal = abortRef.current.signal;
    setGroupScopesApplying(true);
    setGroupScopesError(null);
    try {
      const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}`, { signal });
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
          await updateToken(serverUrl, currentCollectionId, path, createTokenBody({
            $extensions: { 'com.figma.scopes': groupScopesSelected },
          }), { signal });
        }));
        done += batch.length;
        if (!signal.aborted) setGroupScopesProgress({ done, total });
      }
      setGroupScopesPath(null);
      setGroupScopesSelected([]);
    } catch (err) {
      if (isAbortError(err)) return;
      console.error('Failed to apply group scopes:', err);
      setGroupScopesError(getErrorMessage(err, 'Failed to apply scopes'));
    } finally {
      if (!signal.aborted) {
        setGroupScopesApplying(false);
        setGroupScopesProgress(null);
      }
    }
  }, [groupScopesPath, groupScopesSelected, connected, serverUrl, currentCollectionId]);

  return {
    syncGroupPending,
    setSyncGroupPending,
    syncGroupApplying,
    syncGroupProgress,
    syncGroupError,
    syncGroupStylesPending,
    setSyncGroupStylesPending,
    syncGroupStylesApplying,
    syncGroupStylesProgress,
    syncGroupStylesError,
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
    handleApplyGroupScopes,
  };
}
