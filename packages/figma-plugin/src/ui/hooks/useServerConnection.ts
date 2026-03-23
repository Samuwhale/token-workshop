import { useState, useEffect } from 'react';

const DEFAULT_URL = 'http://localhost:9400';

export function useServerConnection() {
  const [connected, setConnected] = useState(false);
  const [serverUrl] = useState(DEFAULT_URL);

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

  return { connected, serverUrl };
}
