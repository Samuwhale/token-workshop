import { useEffect, useRef } from 'react';

export interface GeneratorErrorEvent {
  generatorId?: string;
  message: string;
}

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

/**
 * Subscribe to the server's SSE event stream and call callbacks for specific
 * event types. Automatically reconnects with exponential backoff when the
 * connection drops (e.g. after a server restart).
 */
export function useServerEvents(
  serverUrl: string,
  connected: boolean,
  onGeneratorError: (event: GeneratorErrorEvent) => void,
) {
  const callbackRef = useRef(onGeneratorError);
  callbackRef.current = onGeneratorError;

  useEffect(() => {
    if (!connected) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = BASE_DELAY;
    let disposed = false;

    function connect() {
      if (disposed) return;

      es = new EventSource(`${serverUrl}/api/events`);

      es.onopen = () => {
        // Reset backoff on successful connection
        retryDelay = BASE_DELAY;
      };

      es.onmessage = (e) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(e.data as string);
        } catch {
          return;
        }
        if (data.type === 'generator-error') {
          callbackRef.current({
            generatorId: typeof data.generatorId === 'string' ? data.generatorId : undefined,
            message: typeof data.message === 'string' ? data.message : 'Unknown error',
          });
        }
      };

      es.onerror = () => {
        // EventSource moves to CLOSED when it gives up reconnecting.
        // In that state we must manually create a new instance.
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          scheduleRetry();
        }
        // If readyState is CONNECTING, the browser is already retrying
        // automatically — no action needed.
      };
    }

    function scheduleRetry() {
      if (disposed) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (es) es.close();
    };
  }, [serverUrl, connected]);
}
