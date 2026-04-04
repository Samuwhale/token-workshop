/**
 * ConnectionContext — owns server connectivity, sync-bindings, and git-status.
 *
 * Extracts these hooks/effects from App.tsx so that connectivity state changes
 * (connect/disconnect, sync progress, git status polling) don't cascade through
 * unrelated domains. Consumers call `useConnectionContext()` to subscribe.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useServerConnection } from '../hooks/useServerConnection';
import { fetchAllTokensFlat } from '../hooks/useTokens';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { isNetworkError } from '../shared/apiFetch';
import { apiFetch } from '../shared/apiFetch';
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
  gitHasChanges: boolean;
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  syncError: string | null;
  sync: (scope: 'page' | 'selection') => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function useConnectionContext(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnectionContext must be used inside ConnectionProvider');
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

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === 'sync-progress') {
        setProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === 'sync-complete') {
        syncingRef.current = false;
        setSyncing(false);
        setProgress(null);
        setResult(msg as SyncCompleteMessage);
        clearTimer.current = setTimeout(() => setResult(null), 3000);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const sync = useCallback(async (scope: 'page' | 'selection') => {
    if (!connected || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    setResult(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const tokenMap = resolveAllAliases(rawMap);
      parent.postMessage({ pluginMessage: { type: 'sync-bindings', tokenMap, scope } }, '*');
    } catch (err) {
      console.error('Failed to fetch tokens for sync:', err);
      const isNetworkErr = isNetworkError(err);
      if (isNetworkErr) onNetworkError?.();
      const friendly = isNetworkErr
        ? 'Could not reach the token server. Check that it is running.'
        : 'Could not load tokens. Restart the server and try again.';
      setSyncError(friendly);
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [serverUrl, connected, onNetworkError]);

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
          { signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]) },
        );
        if (!cancelled) setGitHasChanges(data.status != null && !data.status.isClean);
      } catch (err) {
        console.warn('[ConnectionProvider] git status check failed:', err);
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected, serverUrl, getDisconnectSignal]);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      connected,
      checking,
      serverUrl,
      getDisconnectSignal,
      markDisconnected,
      updateServerUrlAndConnect,
      retryConnection,
      gitHasChanges,
      syncing,
      syncProgress,
      syncResult,
      syncError,
      sync,
    }),
    [
      connected, checking, serverUrl, getDisconnectSignal, markDisconnected,
      updateServerUrlAndConnect, retryConnection, gitHasChanges,
      syncing, syncProgress, syncResult, syncError, sync,
    ],
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}
