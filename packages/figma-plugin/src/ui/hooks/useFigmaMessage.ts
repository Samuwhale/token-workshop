import { useRef, useEffect, useCallback } from 'react';

/**
 * Shared hook for roundtrip plugin communication via correlationId tracking.
 *
 * Manages a pending-promise map, message listener, timeout, and cleanup —
 * the boilerplate that was previously duplicated across useStyleSync,
 * useVariableSync, and useFigmaSync.
 */

interface FigmaMessageConfig<TResponse> {
  /** Message type for successful response from the plugin */
  responseType: string;
  /** Message type for error response from the plugin (optional) */
  errorType?: string;
  /** Timeout in ms (default 10000) */
  timeout?: number;
  /** Extract the resolved value from the raw plugin message. Defaults to identity. */
  extractResponse?: (msg: any) => TResponse;
}

export function useFigmaMessage<TResponse = any>(
  config: FigmaMessageConfig<TResponse>,
): (sendType: string, payload?: Record<string, any>) => Promise<TResponse> {
  const { responseType, errorType, timeout = 10000, extractResponse } = config;

  const pendingRef = useRef<
    Map<string, { resolve: (value: TResponse) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>
  >(new Map());

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (!msg?.correlationId) return;

      const cid = msg.correlationId as string;

      if (msg.type === responseType) {
        const entry = pendingRef.current.get(cid);
        if (entry) {
          pendingRef.current.delete(cid);
          clearTimeout(entry.timer);
          entry.resolve(extractResponse ? extractResponse(msg) : msg);
        }
      }

      if (errorType && msg.type === errorType) {
        const entry = pendingRef.current.get(cid);
        if (entry) {
          pendingRef.current.delete(cid);
          clearTimeout(entry.timer);
          entry.reject(new Error(msg.error ?? 'Unknown error'));
        }
      }
    };

    window.addEventListener('message', handler);
    const pending = pendingRef.current;
    return () => {
      window.removeEventListener('message', handler);
      // Clear all pending timers so they don't fire after unmount (or after deps change).
      // Reject each promise so callers don't hang waiting for a response that will never arrive.
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Hook unmounted or reconfigured'));
      }
      pending.clear();
    };
  }, [responseType, errorType, extractResponse]);

  const send = useCallback(
    (sendType: string, payload?: Record<string, any>) => {
      return new Promise<TResponse>((resolve, reject) => {
        const cid = `${sendType}-${Date.now()}-${Math.random()}`;
        const timer = setTimeout(() => {
          pendingRef.current.delete(cid);
          reject(new Error('Figma message timed out \u2014 is the plugin running?'));
        }, timeout);
        pendingRef.current.set(cid, { resolve, reject, timer });
        parent.postMessage(
          { pluginMessage: { type: sendType, correlationId: cid, ...payload } },
          '*',
        );
      });
    },
    [timeout],
  );

  return send;
}
