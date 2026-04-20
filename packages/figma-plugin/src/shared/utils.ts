import type { PluginMessage } from './types.js';

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error ? err.message : (fallback ?? String(err));
}

export function coerceBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === '') {
      return false;
    }
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return false;
    }
    return value !== 0;
  }
  return Boolean(value);
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
 * Read a pluginMessage from a postMessage event. Only accepts events whose
 * data contains a `pluginMessage` property (the Figma plugin protocol).
 *
 * We intentionally do NOT check `event.source` — Figma's internal message
 * routing does not guarantee that `event.source === window.parent`.
 */
export function getPluginMessageFromEvent<T>(event: MessageEvent): T | null {
  if (!getPluginMessageHost()) {
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
  try {
    host.postMessage({ pluginMessage: msg }, '*');
    return true;
  } catch {
    return false;
  }
}
