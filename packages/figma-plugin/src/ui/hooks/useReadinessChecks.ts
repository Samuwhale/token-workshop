import { useState, useRef, useEffect, useCallback } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { describeError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import type {
  PublishPreflightActionId,
  PublishPreflightCluster,
  PublishPreflightStage,
} from '../shared/syncWorkflow';

export const LAST_READINESS_CHANGE_KEY = 'tm_readiness_change_key';

const READINESS_TIMEOUT_MS = 15_000;

interface UseReadinessChecksParams {
  serverUrl: string;
  activeSet: string;
  connected: boolean;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  tokenChangeKey?: number;
  readFigmaTokens: () => Promise<any[]>;
  setOrphanConfirm: (val: { orphanPaths: string[]; localPaths: Set<string> } | null) => void;
}

interface ClusterDraft {
  id: string;
  label: string;
  severity: PublishPreflightCluster['severity'];
  affectedCount?: number;
  detail?: string;
  recommendedActionLabel?: string;
  recommendedActionId?: PublishPreflightActionId;
}

export interface UseReadinessChecksReturn {
  readinessChecks: PublishPreflightCluster[];
  failingReadinessChecks: PublishPreflightCluster[];
  blockingReadinessChecks: PublishPreflightCluster[];
  advisoryReadinessChecks: PublishPreflightCluster[];
  preflightStage: PublishPreflightStage;
  readinessLoading: boolean;
  readinessError: string | null;
  setReadinessError: React.Dispatch<React.SetStateAction<string | null>>;
  checksStale: boolean;
  setChecksStale: React.Dispatch<React.SetStateAction<boolean>>;
  runReadinessChecks: () => Promise<void>;
  triggerReadinessAction: (actionId: PublishPreflightActionId) => Promise<void>;
  readinessFails: number;
  readinessPasses: number;
  readinessBlockingFails: number;
  isReadinessOutdated: boolean;
}

export function useReadinessChecks({
  serverUrl,
  activeSet,
  connected,
  collectionMap,
  modeMap,
  tokenChangeKey,
  readFigmaTokens,
  setOrphanConfirm,
}: UseReadinessChecksParams): UseReadinessChecksReturn {
  const [readinessChecks, setReadinessChecks] = useState<PublishPreflightCluster[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [checksRunAtKey, setChecksRunAtKey] = useState<number | null>(null);
  const [checksStale, setChecksStale] = useState(false);

  const isRunningRef = useRef(false);
  const latestTokenChangeKeyRef = useRef<number | undefined>(tokenChangeKey);
  useEffect(() => { latestTokenChangeKeyRef.current = tokenChangeKey; }, [tokenChangeKey]);

  const runReadinessChecks = useCallback(async () => {
    if (!activeSet || isRunningRef.current) return;
    isRunningRef.current = true;
    setReadinessLoading(true);
    setReadinessError(null);

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('No response from Figma after 15 s — make sure the plugin is open and try again.')), READINESS_TIMEOUT_MS)
      );
      const figmaTokens = await Promise.race([readFigmaTokens(), timeoutPromise]);

      const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      const localTokens = flattenTokenGroup(data.tokens || {});
      const localFlat = Array.from(localTokens, ([path, token]) => ({
        path,
        value: String(token.$value),
        type: String(token.$type ?? 'string'),
      }));

      const figmaMap = new Map<string, any>(figmaTokens.map((token) => [token.path, token]));
      const localPaths = new Set(localTokens.keys());

      const missingInFigma = localFlat.filter((token) => !figmaMap.has(token.path));
      const missingScopes = figmaTokens.filter((token) =>
        !token.$scopes || token.$scopes.length === 0 || (token.$scopes.length === 1 && token.$scopes[0] === 'ALL_SCOPES')
      );
      const missingDescriptions = figmaTokens.filter((token) => !token.$description);
      const orphans = figmaTokens.filter((token) => !localPaths.has(token.path));

      const drafts: ClusterDraft[] = [
        {
          id: 'all-vars',
          label: 'Missing Figma variables',
          severity: 'blocking',
          affectedCount: missingInFigma.length || undefined,
          detail: missingInFigma.length > 0
            ? 'Some local tokens are not yet published as Figma variables. Push them first so compare/apply runs against the full set.'
            : undefined,
          recommendedActionLabel: missingInFigma.length > 0
            ? `Push ${missingInFigma.length} missing variable${missingInFigma.length === 1 ? '' : 's'}`
            : undefined,
          recommendedActionId: missingInFigma.length > 0 ? 'push-missing-variables' : undefined,
        },
        {
          id: 'orphans',
          label: 'Orphaned Figma variables',
          severity: 'blocking',
          affectedCount: orphans.length || undefined,
          detail: orphans.length > 0
            ? 'Figma still contains variables that no longer exist in this token set. Review or delete them before syncing again.'
            : undefined,
          recommendedActionLabel: orphans.length > 0
            ? `Delete ${orphans.length} orphan variable${orphans.length === 1 ? '' : 's'}`
            : undefined,
          recommendedActionId: orphans.length > 0 ? 'delete-orphan-variables' : undefined,
        },
        {
          id: 'scopes',
          label: 'Unscoped variables',
          severity: 'blocking',
          affectedCount: missingScopes.length || undefined,
          detail: missingScopes.length > 0
            ? 'Some Figma variables still allow every binding. Review the variable differences and assign the scopes designers should actually use.'
            : undefined,
          recommendedActionLabel: missingScopes.length > 0 ? 'Review variable scopes' : undefined,
          recommendedActionId: missingScopes.length > 0 ? 'review-variable-scopes' : undefined,
        },
        {
          id: 'descriptions',
          label: 'Missing descriptions',
          severity: 'advisory',
          affectedCount: missingDescriptions.length || undefined,
          detail: missingDescriptions.length > 0
            ? 'Descriptions are optional for publishing, but they make the synced variables much easier to understand inside Figma.'
            : undefined,
          recommendedActionLabel: missingDescriptions.length > 0 ? 'Add token descriptions in the Tokens workspace' : undefined,
          recommendedActionId: missingDescriptions.length > 0 ? 'add-token-descriptions' : undefined,
        },
      ];

      setReadinessChecks(drafts.map((draft) => ({
        id: draft.id,
        label: draft.label,
        severity: draft.severity,
        status: draft.affectedCount && draft.affectedCount > 0 ? 'fail' : 'pass',
        affectedCount: draft.affectedCount,
        detail: draft.detail,
        recommendedActionLabel: draft.recommendedActionLabel,
        recommendedActionId: draft.recommendedActionId,
      })));

      const runKey = tokenChangeKey ?? 0;
      setChecksRunAtKey(runKey);
      setChecksStale(false);
      try { localStorage.setItem(LAST_READINESS_CHANGE_KEY, String(runKey)); } catch { /* ignore */ }
    } catch (err) {
      setReadinessError(describeError(err, 'Readiness checks'));
    } finally {
      setReadinessLoading(false);
      isRunningRef.current = false;

      const thisRunKey = tokenChangeKey ?? 0;
      const latestKey = latestTokenChangeKeyRef.current ?? 0;
      if (latestKey !== thisRunKey) {
        Promise.resolve().then(() => runReadinessChecksRef.current());
      }
    }
  }, [activeSet, readFigmaTokens, serverUrl, tokenChangeKey]);

  const triggerReadinessAction = useCallback(async (actionId: PublishPreflightActionId) => {
    if (!activeSet) return;

    try {
      if (actionId === 'push-missing-variables') {
        const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
        const localTokens = flattenTokenGroup(data.tokens || {});
        const figmaTokens = await readFigmaTokens();
        const figmaPaths = new Set(figmaTokens.map((token) => token.path));
        const tokens = Array.from(localTokens, ([path, token]) => ({
          path,
          $type: String(token.$type ?? 'string'),
          $value: String(token.$value),
          setName: activeSet,
        })).filter((token) => !figmaPaths.has(token.path));

        if (tokens.length === 0) return;

        parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap } }, '*');
        return;
      }

      if (actionId === 'delete-orphan-variables') {
        const figmaTokens = await readFigmaTokens();
        const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
        const localTokens = flattenTokenGroup(data.tokens || {});
        const localPaths = new Set(localTokens.keys());
        const orphanPaths = figmaTokens
          .filter((token) => !localPaths.has(token.path))
          .map((token) => token.path);

        if (orphanPaths.length === 0) return;

        setOrphanConfirm({ orphanPaths, localPaths });
      }
    } catch (error) {
      setReadinessError(describeError(error, 'Readiness action'));
    }
  }, [activeSet, collectionMap, modeMap, readFigmaTokens, serverUrl, setOrphanConfirm]);

  const runReadinessChecksRef = useRef(runReadinessChecks);
  useEffect(() => { runReadinessChecksRef.current = runReadinessChecks; }, [runReadinessChecks]);

  useEffect(() => {
    if (!connected || !activeSet || tokenChangeKey === undefined) return;
    const stored = localStorage.getItem(LAST_READINESS_CHANGE_KEY);
    if (stored !== null && tokenChangeKey > parseInt(stored, 10)) {
      runReadinessChecksRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connected || !activeSet || tokenChangeKey === undefined) return;
    if (checksRunAtKey === null) return;
    if (tokenChangeKey === checksRunAtKey) return;
    runReadinessChecksRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenChangeKey]);

  useEffect(() => {
    if (!checksStale || !connected || !activeSet) return;
    runReadinessChecksRef.current();
  }, [checksStale, connected, activeSet]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = (event.data as { pluginMessage?: { type: string } })?.pluginMessage;
      if (msg?.type === 'variables-applied') {
        runReadinessChecksRef.current();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const failingReadinessChecks = readinessChecks.filter((check) => check.status === 'fail');
  const blockingReadinessChecks = failingReadinessChecks.filter((check) => check.severity === 'blocking');
  const advisoryReadinessChecks = failingReadinessChecks.filter((check) => check.severity === 'advisory');
  const readinessFails = failingReadinessChecks.length;
  const readinessPasses = readinessChecks.filter((check) => check.status === 'pass').length;
  const readinessBlockingFails = blockingReadinessChecks.length;
  const isReadinessOutdated = readinessChecks.length > 0 && (
    checksStale ||
    (tokenChangeKey !== undefined && checksRunAtKey !== null && tokenChangeKey !== checksRunAtKey)
  );
  const preflightStage: PublishPreflightStage =
    readinessLoading ? 'running'
      : readinessChecks.length === 0 ? 'idle'
        : readinessBlockingFails > 0 ? 'blocked'
          : readinessFails > 0 ? 'advisory'
            : 'ready';

  return {
    readinessChecks,
    failingReadinessChecks,
    blockingReadinessChecks,
    advisoryReadinessChecks,
    preflightStage,
    readinessLoading,
    readinessError,
    setReadinessError,
    checksStale,
    setChecksStale,
    runReadinessChecks,
    triggerReadinessAction,
    readinessFails,
    readinessPasses,
    readinessBlockingFails,
    isReadinessOutdated,
  };
}
