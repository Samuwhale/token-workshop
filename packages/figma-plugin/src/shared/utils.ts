import type { PluginMessage } from './types.js';

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error ? err.message : (fallback ?? String(err));
}

function isWindowLike(value: unknown): value is Window {
  return value !== null && typeof value === 'object' && 'postMessage' in value;
}

/** Return the host window that proxies plugin messages, or null outside an iframe host. */
export function getPluginMessageHost(): Window | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const host = window.parent;
  return host && host !== window && isWindowLike(host) ? host : null;
}

/**
 * Read a pluginMessage from a postMessage event, but only when it originated
 * from the expected host window. This avoids reacting to unrelated window
 * messages in the UI shell.
 */
export function getPluginMessageFromEvent<T>(event: MessageEvent): T | null {
  const host = getPluginMessageHost();
  if (!host || event.source !== host) {
    return null;
  }
  const payload = (event.data as { pluginMessage?: unknown } | null)?.pluginMessage;
  return payload === undefined ? null : (payload as T);
}

/** Type-safe wrapper for sending a PluginMessage from the UI to the controller. */
export function postPluginMessage(msg: PluginMessage): boolean {
  const host = getPluginMessageHost();
  if (!host) {
    return false;
  }
  host.postMessage({ pluginMessage: msg }, '*');
  return true;
}
