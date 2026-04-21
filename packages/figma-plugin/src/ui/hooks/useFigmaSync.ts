import { getErrorMessage, isAbortError } from '../shared/utils';
import { dispatchToast } from '../shared/toastBus';
import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
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
import { usePersistedJsonState } from './usePersistedState';
import { STORAGE_KEYS } from '../shared/storage';

// Publish-time target. Variables carry every token type; Styles carry only the
// four DTCG types Figma exposes as native styles. The user does not pick — we
// always fan out to whichever primitives each token needs.
type ApplyResult = {
  count: number;
  total: number;
  failures: { path: string; error: string }[];
  skipped: Array<{ path: string; $type: string }>;
};

export type PublishPending =
  | { scope: 'group'; groupPath: string; tokenCount: number }
  | { scope: 'collection'; collectionId: string; tokenCount: number };

export function useFigmaSync(
  serverUrl: string,
  connected: boolean,
  pathToCollectionId: Record<string, string>,
  collectionMap: Record<string, string>,
  modeMap: Record<string, string>,
  currentCollectionId: string,
) {
  const [publishPending, setPublishPending] = useState<PublishPending | null>(null);
  const [publishApplying, setPublishApplying] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ current: number; total: number } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [createStyles] = usePersistedJsonState<boolean>(STORAGE_KEYS.PUBLISH_CREATE_STYLES, true);

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

  const toProgressPayload = (
    msg: { current?: number; total?: number } | null,
  ): { current: number; total: number } | null => {
    if (
      !msg ||
      typeof msg.current !== 'number' ||
      !Number.isFinite(msg.current) ||
      typeof msg.total !== 'number' ||
      !Number.isFinite(msg.total)
    ) {
      return null;
    }
    return {
      current: msg.current,
      total: msg.total,
    };
  };

  // Both variable- and style-sync progress messages map onto the single publish
  // progress indicator. The user sees one ongoing operation, not two.
  useEffect(() => {
    const signal = abortRef.current.signal;
    const handler = (ev: MessageEvent) => {
      if (signal.aborted) return;
      const msg = getPluginMessageFromEvent<{ type?: string; current?: number; total?: number }>(ev);
      if (msg?.type === 'variable-sync-progress' || msg?.type === 'style-sync-progress') {
        const progress = toProgressPayload(msg);
        if (progress) {
          setPublishProgress(progress);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sendStyleApply = useFigmaMessage<ApplyResult, StylesAppliedMessage>({
    responseType: 'styles-applied',
    errorType: 'styles-apply-error',
    timeout: 15000,
    extractResponse: extractSyncApplyResult,
  });

  const sendVarApply = useFigmaMessage<ApplyResult, VariablesAppliedMessage>({
    responseType: 'variables-applied',
    errorType: 'apply-variables-error',
    timeout: 30000,
    extractResponse: extractSyncApplyResult,
  });

  const handlePublish = useCallback(async () => {
    const pending = publishPending;
    if (!pending || !connected) return;
    const signal = createFetchSignal(abortRef.current.signal, 15_000);

    const matchPath = pending.scope === 'group'
      ? ((path: string) => path === pending.groupPath || path.startsWith(pending.groupPath + '.'))
      : ((path: string) => pathToCollectionId[path] === pending.collectionId);

    setPublishPending(null);
    setPublishApplying(true);
    setPublishProgress(null);
    setPublishError(null);

    try {
      const rawMap = await fetchAllTokensFlat(serverUrl, signal);
      if (signal.aborted) return;
      const resolved = resolveAllAliases(rawMap);
      if (signal.aborted) return;
      const tokens: { path: string; $type: string; $value: any; collectionId?: string }[] = [];
      for (const [path, entry] of Object.entries(resolved)) {
        if (matchPath(path)) {
          tokens.push({ path, $type: entry.$type, $value: entry.$value, collectionId: pathToCollectionId[path] });
        }
      }
      if (signal.aborted) return;

      const varResult = await sendVarApply('apply-variables', { tokens, collectionMap, modeMap });
      const styleResult = createStyles
        ? await sendStyleApply('apply-styles', { tokens })
        : null;

      const allFailures = [
        ...varResult.failures,
        ...(styleResult?.failures ?? []),
      ];
      const varCount = varResult.count;
      const styleCount = styleResult?.count ?? 0;

      if (allFailures.length > 0) {
        const failedPaths = allFailures.map(f => f.path).join(', ');
        setPublishError(`Published ${varCount} variable${varCount !== 1 ? 's' : ''}${styleResult ? ` and ${styleCount} style${styleCount !== 1 ? 's' : ''}` : ''}. Failed: ${failedPaths}`);
      } else {
        const parts: string[] = [];
        parts.push(`${varCount} variable${varCount !== 1 ? 's' : ''}`);
        if (styleResult) parts.push(`${styleCount} style${styleCount !== 1 ? 's' : ''}`);
        dispatchToast(`Published ${parts.join(' · ')} to Figma`, 'success', {
          destination: { kind: 'workspace', topTab: 'sync', subTab: 'figma-sync' },
        });
      }
    } catch (err) {
      if (abortRef.current.signal.aborted) return;
      console.error(`Failed to publish ${pending.scope} to Figma:`, err);
      setPublishError(getErrorMessage(err, `Failed to publish ${pending.scope} to Figma`));
    } finally {
      if (!abortRef.current.signal.aborted) {
        setPublishApplying(false);
        setPublishProgress(null);
      }
    }
  }, [
    publishPending,
    connected,
    serverUrl,
    pathToCollectionId,
    collectionMap,
    modeMap,
    createStyles,
    sendVarApply,
    sendStyleApply,
  ]);

  const handleApplyGroupScopes = useCallback(async () => {
    if (!groupScopesPath || !connected) return;
    const signal = createFetchSignal(abortRef.current.signal, 15_000);
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
      if (signal.aborted) return;
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
    publishPending,
    setPublishPending,
    publishApplying,
    publishProgress,
    publishError,
    handlePublish,
    groupScopesPath,
    setGroupScopesPath,
    groupScopesSelected,
    setGroupScopesSelected,
    groupScopesApplying,
    groupScopesError,
    setGroupScopesError,
    groupScopesProgress,
    handleApplyGroupScopes,
  };
}
