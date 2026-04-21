import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';
import { createTimeoutSignal } from '../shared/apiFetch';

const DEFAULT_URL = 'http://localhost:9400';

function getQueryServerUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = new URLSearchParams(window.location.search).get('serverUrl');
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

export function useServerConnection() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [serverUrl, setServerUrl] = useState(
    () => getQueryServerUrl() ?? lsGet(STORAGE_KEYS.SERVER_URL, DEFAULT_URL),
  );
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // AbortController that fires when the server goes offline.
  // In-flight fetch calls should combine this signal via the shared fetch helpers so they
  // are cancelled immediately when the health check detects a disconnect rather than
  // waiting for their own timeouts.
  const disconnectControllerRef = useRef(new AbortController());

  /** Returns the current disconnect signal.  Read this at fetch-call time. */
  const getDisconnectSignal = useCallback((): AbortSignal => {
    return disconnectControllerRef.current.signal;
  }, []);

  /** Abort all in-flight requests and replace the controller for future fetches. */
  const fireDisconnect = useCallback(() => {
    disconnectControllerRef.current.abort();
    disconnectControllerRef.current = new AbortController();
  }, []);

  const updateServerUrl = useCallback((url: string) => {
    lsSet(STORAGE_KEYS.SERVER_URL, url);
    setServerUrl(url);
  }, []);

  const checkConnection = useCallback(async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(`${url}/api/health`, { signal: createTimeoutSignal(2000) });
      return res.ok;
    } catch (err) {
      console.warn('[useServerConnection] health check failed:', err);
      return false;
    }
  }, []);

  const retryConnection = useCallback(async () => {
    setChecking(true);
    const ok = await checkConnection(serverUrlRef.current);
    if (!mountedRef.current) return;
    setConnected(ok);
    setChecking(false);
  }, [checkConnection]);

  /**
   * Immediately mark the server as disconnected and begin a reconnection check.
   * Call this from any fetch error handler when a mid-operation network failure
   * is detected so the disconnect banner appears right away instead of waiting
   * for the next 5-second health poll.
   */
  const markDisconnected = useCallback(() => {
    if (!mountedRef.current) return;
    fireDisconnect();
    setConnected(false);
    setChecking(true);
    checkConnection(serverUrlRef.current).then(ok => {
      if (mountedRef.current) {
        setConnected(ok);
        setChecking(false);
      }
    });
  }, [fireDisconnect, checkConnection]);

  /** Save a new URL and immediately test connectivity. Returns the result. */
  const updateServerUrlAndConnect = useCallback(async (url: string): Promise<boolean> => {
    fireDisconnect();
    updateServerUrl(url);
    setChecking(true);
    const ok = await checkConnection(url);
    if (!mountedRef.current) return false;
    setConnected(ok);
    setChecking(false);
    return ok;
  }, [fireDisconnect, updateServerUrl, checkConnection]);

  useEffect(() => {
    let cancelled = false;
    let prevConnected: boolean | null = null;

    const check = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/health`, { signal: createTimeoutSignal(2000) });
        const ok = res.ok;
        if (!cancelled) {
          if (prevConnected === true && !ok) {
            // Just went offline — abort any in-flight requests immediately.
            fireDisconnect();
          }
          setConnected(ok);
          prevConnected = ok;
        }
      } catch (err) {
        console.warn('[useServerConnection] health poll failed:', err);
        if (!cancelled) {
          if (prevConnected === true) {
            fireDisconnect();
          }
          setConnected(false);
          prevConnected = false;
        }
      }
    };

    check();
    const interval = setInterval(check, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      fireDisconnect();
    };
  }, [serverUrl, fireDisconnect]);

  return { connected, checking, serverUrl, getDisconnectSignal, markDisconnected, updateServerUrlAndConnect, retryConnection };
}
