import { useEffect, useRef } from "react";

export interface GeneratorErrorEvent {
  generatorId?: string;
  message: string;
}

export interface ServiceErrorEvent {
  collectionId: string;
  message: string;
}

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

/**
 * Subscribe to the server's SSE event stream and call callbacks for specific
 * event types. Automatically reconnects with exponential backoff when the
 * connection drops (e.g. after a server restart).
 *
 * On reconnect the server replays missed events (via Last-Event-ID) or sends
 * a `stale` event when the gap is too large. In either case the hook triggers
 * `onRefresh` so the UI refetches current data.
 */
export function useServerEvents(
  serverUrl: string,
  connected: boolean,
  onGeneratedGroupError: (event: GeneratorErrorEvent) => void,
  onRefresh?: () => void,
  onServiceError?: (event: ServiceErrorEvent) => void,
) {
  const callbackRef = useRef(onGeneratedGroupError);
  callbackRef.current = onGeneratedGroupError;

  const serviceErrorRef = useRef(onServiceError);
  serviceErrorRef.current = onServiceError;

  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!connected) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = BASE_DELAY;
    let disposed = false;
    let hasConnectedBefore = false;
    // Track the last received event ID so manual reconnects can request replay.
    // The browser's built-in reconnect (while CONNECTING) carries the header
    // automatically, but when we create a new EventSource instance after CLOSED
    // we must pass it explicitly as a query parameter.
    let lastEventId: string | null = null;

    function scheduleRefresh() {
      if (disposed || refreshTimer !== null) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshRef.current?.();
      }, 0);
    }

    function connect() {
      if (disposed) return;

      const url = lastEventId
        ? `${serverUrl}/api/events?lastEventId=${encodeURIComponent(lastEventId)}`
        : `${serverUrl}/api/events`;
      es = new EventSource(url);

      es.onopen = () => {
        // Reset backoff on successful connection
        retryDelay = BASE_DELAY;
      };

      // Handle the 'stale' named event — server couldn't replay missed events
      es.addEventListener("stale", (ev: Event) => {
        const id = (ev as MessageEvent).lastEventId;
        if (id) lastEventId = id;
        scheduleRefresh();
      });

      es.onmessage = (e) => {
        if (e.lastEventId) lastEventId = e.lastEventId;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(e.data as string);
        } catch (e) {
          console.debug("[useServerEvents] failed to parse SSE event data:", e);
          return;
        }

        if (data.type === "connected") {
          // If this is a reconnection, trigger a refresh to catch up on any
          // events that were replayed before the connected message, or to
          // handle the case where the server restarted (seq reset).
          if (hasConnectedBefore) {
            scheduleRefresh();
          }
          hasConnectedBefore = true;
          return;
        }

        if (data.type === "generator-error") {
          callbackRef.current({
            generatorId:
              typeof data.generatorId === "string"
                ? data.generatorId
                : undefined,
            message:
              typeof data.message === "string" ? data.message : "Unknown error",
          });
        }

        if (data.type === "file-load-error") {
          serviceErrorRef.current?.({
            collectionId: typeof data.collectionId === "string" ? data.collectionId : "",
            message:
              typeof data.message === "string" ? data.message : "Unknown error",
          });
        }

        if (
          data.type === "collection-added" ||
          data.type === "collection-updated" ||
          data.type === "collection-removed" ||
          data.type === "workspace-file-changed" ||
          data.type === "workspace-file-removed"
        ) {
          scheduleRefresh();
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
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      if (es) es.close();
    };
  }, [serverUrl, connected]);
}
