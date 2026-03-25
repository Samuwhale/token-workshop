import { useState, useEffect, useCallback, useRef } from 'react';

const DEFAULT_URL = 'http://localhost:9400';
const STORAGE_KEY = 'tokenmanager_server_url';

export function useServerConnection() {
  const [connected, setConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
    } catch {
      return DEFAULT_URL;
    }
  });
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const updateServerUrl = useCallback((url: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, url);
    } catch {
      // ignore
    }
    setServerUrl(url);
  }, []);

  const retryConnection = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrlRef.current}/api/health`, { signal: AbortSignal.timeout(2000) });
      setConnected(res.ok);
    } catch {
      setConnected(false);
    }
  }, []);

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

  return { connected, serverUrl, updateServerUrl, retryConnection };
}
