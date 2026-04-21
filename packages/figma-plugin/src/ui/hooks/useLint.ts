import { useState, useEffect } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';

export interface LintViolation {
  rule: string;
  path: string;
  collectionId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
  /** Concrete suggestion — e.g. the alias path to use, or a corrected name. */
  suggestion?: string;
  group?: string;
}

const DEBOUNCE_MS = 800;

export function useLint(
  serverUrl: string,
  connected: boolean,
  refreshKey: number,
): LintViolation[] {
  const [violations, setViolations] = useState<LintViolation[]>([]);

  useEffect(() => {
    if (!connected) {
      setViolations([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ violations: LintViolation[] }>(`${serverUrl}/api/tokens/lint`, {
          method: 'POST',
          signal: createFetchSignal(controller.signal, 8000),
        });
        setViolations(data.violations ?? []);
      } catch (err) {
        console.debug('[useLint] lint fetch failed (server offline, timeout, or cleanup):', err);
        setViolations([]);
      }
    }, DEBOUNCE_MS);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [serverUrl, connected, refreshKey]);

  return violations;
}
