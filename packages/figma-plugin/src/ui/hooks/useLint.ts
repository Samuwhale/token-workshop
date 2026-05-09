import { useState, useEffect } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

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
    let active = true;
    const timer = setTimeout(async () => {
      const requestSignal = createFetchSignal(controller.signal, 8000);
      try {
        const data = await apiFetch<{ violations: LintViolation[] }>(`${serverUrl}/api/tokens/lint`, {
          method: 'POST',
          signal: requestSignal,
        });
        if (!active || requestSignal.aborted) return;
        setViolations(data.violations ?? []);
      } catch (err) {
        if (!active || requestSignal.aborted || isAbortError(err)) return;
        console.debug('[useLint] lint fetch failed (server offline, timeout, or cleanup):', err);
        setViolations([]);
      }
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [serverUrl, connected, refreshKey]);

  return violations;
}
