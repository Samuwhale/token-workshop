/**
 * ConnectionContext — stable server connectivity state (connected, serverUrl, checking,
 * and connection-management callbacks). Changes only when the server connection
 * itself changes.
 *
 * SyncContext — frequently-changing sync state (syncing, syncProgress, syncResult,
 * syncError, sync, gitHasChanges). Kept separate so the 20+ consumers that only
 * need connection status don't re-render on every sync progress tick.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useServerConnection } from '../hooks/useServerConnection';
import { fetchAllTokensFlat } from '../hooks/useTokens';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';
import { isNetworkError } from '../shared/apiFetch';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';
import type { SyncCompleteMessage } from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionContextValue {
  connected: boolean;
  checking: boolean;
  serverUrl: string;
  getDisconnectSignal: () => AbortSignal;
  markDisconnected: () => void;
  updateServerUrlAndConnect: (url: string) => Promise<boolean>;
  retryConnection: () => void;
}

export interface SyncContextValue {
  gitHasChanges: boolean;
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  syncError: string | null;
  sync: (scope: 'page' | 'selection') => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);
const SyncContext = createContext<SyncContextValue | null>(null);

export function useConnectionContext(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnectionContext must be used inside ConnectionProvider');
  return ctx;
}

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used inside ConnectionProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Internal: useSyncBindings (moved from App.tsx)
// ---------------------------------------------------------------------------

function useSyncBindings(serverUrl: string, connected: boolean, onNetworkError?: () => void) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<SyncCompleteMessage | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();
  // Use a ref for the syncing guard so the callback always reads the latest value
  // without being recreated on every sync start/end (which caused stale closure races).
  const syncingRef = useRef(false);

  const clearResultTimer = useCallback(() => {
    if (!clearTimer.current) return;
    clearTimeout(clearTimer.current);
    clearTimer.current = undefined;
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<
        | { type: 'sync-progress'; processed: number; total: number }
        | SyncCompleteMessage
      >(e);
      if (!msg) return;
      if (msg.type === 'sync-progress') {
        setProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === 'sync-complete') {
        syncingRef.current = false;
        setSyncing(false);
        setProgress(null);
        clearResultTimer();
        setResult(msg as SyncCompleteMessage);
        clearTimer.current = setTimeout(() => {
          clearTimer.current = undefined;
          setResult(null);
        }, 3000);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearResultTimer();
    };
  }, [clearResultTimer]);

  const sync = useCallback(async (scope: 'page' | 'selection') => {
    if (!connected || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    clearResultTimer();
    setResult(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const tokenMap = resolveAllAliases(rawMap);
      if (!postPluginMessage({ type: 'sync-bindings', tokenMap, scope })) {
        throw new Error('Figma plugin host is unavailable');
      }
    } catch (err) {
      console.error('Failed to fetch tokens for sync:', err);
      const isNetworkErr = isNetworkError(err);
      if (isNetworkErr) onNetworkError?.();
      const friendly = isNetworkErr
        ? 'Could not reach the token server. Check that it is running.'
        : err instanceof Error && err.message === 'Figma plugin host is unavailable'
          ? 'Could not reach the Figma plugin host.'
          : 'Could not load tokens. Restart the server and try again.';
      setSyncError(friendly);
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [serverUrl, connected, onNetworkError, clearResultTimer]);

  return { syncing, syncProgress: progress, syncResult: result, syncError, sync };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const {
    connected,
    checking,
    serverUrl,
    getDisconnectSignal,
    markDisconnected,
    updateServerUrlAndConnect,
    retryConnection,
  } = useServerConnection();

  const { syncing, syncProgress, syncResult, syncError, sync } = useSyncBindings(
    serverUrl,
    connected,
    markDisconnected,
  );

  // Git status polling — checks every 30 s while connected
  const [gitHasChanges, setGitHasChanges] = useState(false);
  useEffect(() => {
    if (!connected) {
      setGitHasChanges(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const data = await apiFetch<{ status?: { isClean?: boolean } }>(
          `${serverUrl}/api/sync/status`,
          { signal: createFetchSignal(getDisconnectSignal()) },
        );
        if (!cancelled) setGitHasChanges(data.status != null && !data.status.isClean);
      } catch (err) {
        if (cancelled) return;
        if (isAbortError(err)) return;
        if (isNetworkError(err)) {
          markDisconnected();
          return;
        }
        console.warn('[ConnectionProvider] git status check failed:', err);
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected, serverUrl, getDisconnectSignal, markDisconnected]);

  const connectionValue = useMemo<ConnectionContextValue>(
    () => ({
      connected,
      checking,
      serverUrl,
      getDisconnectSignal,
      markDisconnected,
      updateServerUrlAndConnect,
      retryConnection,
    }),
    [
      connected, checking, serverUrl, getDisconnectSignal, markDisconnected,
      updateServerUrlAndConnect, retryConnection,
    ],
  );

  const syncValue = useMemo<SyncContextValue>(
    () => ({
      gitHasChanges,
      syncing,
      syncProgress,
      syncResult,
      syncError,
      sync,
    }),
    [gitHasChanges, syncing, syncProgress, syncResult, syncError, sync],
  );

  return (
    <ConnectionContext.Provider value={connectionValue}>
      <SyncContext.Provider value={syncValue}>
        {children}
      </SyncContext.Provider>
    </ConnectionContext.Provider>
  );
}
