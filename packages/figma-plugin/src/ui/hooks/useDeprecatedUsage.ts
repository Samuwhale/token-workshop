import { useEffect, useState } from "react";
import { apiFetch } from "../shared/apiFetch";
import { isAbortError } from "../shared/utils";
import type { DeprecatedUsageEntry } from "../shared/deprecatedUsage";

interface UseDeprecatedUsageOptions {
  serverUrl: string;
  connected: boolean;
  refreshKey?: number;
}

interface DeprecatedUsageResult {
  entries: DeprecatedUsageEntry[];
  loading: boolean;
  error: string | null;
}

export function useDeprecatedUsage({
  serverUrl,
  connected,
  refreshKey = 0,
}: UseDeprecatedUsageOptions): DeprecatedUsageResult {
  const [entries, setEntries] = useState<DeprecatedUsageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !serverUrl) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setEntries([]);
    setLoading(true);
    setError(null);

    apiFetch<{ entries: DeprecatedUsageEntry[] }>(
      `${serverUrl}/api/tokens/deprecated-usage`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setEntries(Array.isArray(data.entries) ? data.entries : []);
        }
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) {
          return;
        }

        if (!controller.signal.aborted) {
          setEntries([]);
          setError("Failed to load deprecated usage. Try refreshing.");
        }

        console.warn("[useDeprecatedUsage] failed to load deprecated usage:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [connected, refreshKey, serverUrl]);

  return {
    entries,
    loading,
    error,
  };
}
