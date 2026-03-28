import type { PluginMessage } from './types.js';

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error ? err.message : (fallback ?? String(err));
}

/** Type-safe wrapper for sending a PluginMessage from the UI to the controller. */
export function postPluginMessage(msg: PluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}
