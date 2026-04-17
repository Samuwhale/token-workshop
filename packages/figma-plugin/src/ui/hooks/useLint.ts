import { useState, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';

export interface LintViolation {
  rule: string;
  path: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
  /** Concrete suggestion — e.g. the alias path to use, or a corrected name. */
  suggestion?: string;
}

const DEBOUNCE_MS = 800;

export function useLint(
  serverUrl: string,
  collectionId: string,
  connected: boolean,
  refreshKey: number,
): LintViolation[] {
  const [violations, setViolations] = useState<LintViolation[]>([]);

  useEffect(() => {
    if (!connected || !collectionId) {
      setViolations([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ violations: LintViolation[] }>(`${serverUrl}/api/tokens/lint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collectionId: collectionId }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        setViolations(data.violations ?? []);
      } catch (err) {
        console.debug('[useLint] lint fetch failed (server offline, timeout, or cleanup):', err);
        setViolations([]);
      }
    }, DEBOUNCE_MS);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [serverUrl, collectionId, connected, refreshKey]);

  return violations;
}
