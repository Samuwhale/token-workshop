import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

const DEFAULT_URL = 'http://localhost:9400';

export function useServerConnection() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => lsGet(STORAGE_KEYS.SERVER_URL, DEFAULT_URL));
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const updateServerUrl = useCallback((url: string) => {
    lsSet(STORAGE_KEYS.SERVER_URL, url);
    setServerUrl(url);
  }, []);

  const checkConnection = useCallback(async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const retryConnection = useCallback(async () => {
    setChecking(true);
    const ok = await checkConnection(serverUrlRef.current);
    setConnected(ok);
    setChecking(false);
  }, [checkConnection]);

  /** Save a new URL and immediately test connectivity. Returns the result. */
  const updateServerUrlAndConnect = useCallback(async (url: string): Promise<boolean> => {
    updateServerUrl(url);
    setChecking(true);
    const ok = await checkConnection(url);
    setConnected(ok);
    setChecking(false);
    return ok;
  }, [updateServerUrl, checkConnection]);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (!cancelled) setConnected(res.ok);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };

    check();
    const interval = setInterval(check, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverUrl]);

  return { connected, checking, serverUrl, updateServerUrl, updateServerUrlAndConnect, retryConnection };
}
