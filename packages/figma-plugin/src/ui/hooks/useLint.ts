import { useState, useEffect } from 'react';

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
  setName: string,
  connected: boolean,
  refreshKey: number,
): LintViolation[] {
  const [violations, setViolations] = useState<LintViolation[]>([]);

  useEffect(() => {
    if (!connected || !setName) {
      setViolations([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${serverUrl}/api/tokens/lint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ set: setName }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (res.ok) {
          const data = await res.json() as { violations: LintViolation[] };
          setViolations(data.violations ?? []);
        }
      } catch {
        // server offline, timeout, or effect cleanup — silently clear
        setViolations([]);
      }
    }, DEBOUNCE_MS);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [serverUrl, setName, connected, refreshKey]);

  return violations;
}
