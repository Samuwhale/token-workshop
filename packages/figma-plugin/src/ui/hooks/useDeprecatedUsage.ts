import { useEffect, useState } from "react";
import { createFetchSignal } from "../shared/apiFetch";
import { isAbortError } from "../shared/utils";
import {
  fetchDeprecatedUsage,
  type DeprecatedUsageEntry,
} from "../shared/deprecatedUsage";

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

    const loadDeprecatedUsage = async () => {
      try {
        const nextEntries = await fetchDeprecatedUsage(
          serverUrl,
          createFetchSignal(controller.signal, 8000),
        );
        if (!controller.signal.aborted) {
          setEntries(nextEntries);
        }
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) {
          return;
        }

        setEntries([]);
        setError("Failed to load deprecated usage. Try refreshing.");
        console.warn("[useDeprecatedUsage] failed to load deprecated usage:", err);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadDeprecatedUsage();

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
