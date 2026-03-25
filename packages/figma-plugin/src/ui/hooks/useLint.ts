import { useState, useEffect } from 'react';

export interface LintViolation {
  rule: string;
  path: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
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
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${serverUrl}/api/tokens/lint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ set: setName }),
        });
        if (res.ok) {
          const data = await res.json() as { violations: LintViolation[] };
          setViolations(data.violations ?? []);
        }
      } catch {
        // server offline or error — silently clear
        setViolations([]);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [serverUrl, setName, connected, refreshKey]);

  return violations;
}
