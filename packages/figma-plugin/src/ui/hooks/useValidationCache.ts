import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

export interface ValidationIssue {
  rule: string;
  path: string;
  collectionId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  targetPath?: string;
  targetCollectionId?: string;
  cyclePath?: string[];
  suggestedFix?: string;
  /** Concrete fix target — e.g. an alias path like `{primitive.color}` */
  suggestion?: string;
  /** For no-duplicate-values: canonical token path shared by all tokens in this duplicate group. */
  group?: string;
  graphId?: string;
}

export interface ValidationCacheResult {
  /** null = validation has never run; [] = ran with no issues */
  validationIssues: ValidationIssue[] | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  refreshValidation: () => Promise<ValidationSnapshot | null>;
}

export interface ValidationSnapshot {
  issues: ValidationIssue[];
}

interface UseValidationCacheOptions {
  serverUrl: string;
  connected: boolean;
  /** Incrementing this triggers a debounced re-validation (2s) if results already exist. */
  tokenChangeKey?: number;
  /** Incrementing this triggers an immediate manual re-validation. */
  validateKey?: number;
}

/**
 * Shared validation cache for the library review surfaces.
 *
 * Review surfaces can POST to /api/tokens/validate independently, causing
 * redundant server round-trips when the user switches between them. This hook
 * centralises that fetch so a single in-flight request serves both consumers.
 *
 * Behaviour:
 * - Auto-validates once when `connected` first becomes true.
 * - Re-validates immediately when `validateKey` increments.
 * - Marks results stale + debounces 2 s re-validation when `tokenChangeKey` increments.
 */
export function useValidationCache({
  serverUrl,
  connected,
  tokenChangeKey,
  validateKey,
}: UseValidationCacheOptions): ValidationCacheResult {
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);

  const hasAutoValidated = useRef(false);
  const lastValidateKey = useRef(0);
  const autoRevalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasResultsRef = useRef(false);
  const mountedRef = useRef(true);
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchAbortRef.current?.abort();
      if (autoRevalidateTimer.current !== null) {
        clearTimeout(autoRevalidateTimer.current);
        autoRevalidateTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    fetchAbortRef.current?.abort();
    hasAutoValidated.current = false;
    hasResultsRef.current = false;
    lastValidateKey.current = 0;
    if (autoRevalidateTimer.current !== null) {
      clearTimeout(autoRevalidateTimer.current);
      autoRevalidateTimer.current = null;
    }
    setIssues(null);
    setError(null);
    setLastRefreshed(null);
    setIsStale(false);
    setLoading(false);
  }, [serverUrl]);

  const runValidation = useCallback(async (): Promise<ValidationSnapshot | null> => {
    if (!connected) return null;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;
    const requestSignal = createFetchSignal(signal, 15000);
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ issues: ValidationIssue[] }>(
        `${serverUrl}/api/tokens/validate`,
        { method: 'POST', signal: requestSignal },
      );
      if (requestSignal.aborted || !mountedRef.current) {
        return null;
      }
      const fetched = data.issues ?? [];
      setIssues(fetched);
      setLastRefreshed(new Date());
      setIsStale(false);
      hasResultsRef.current = true;
      return { issues: fetched };
    } catch (err) {
      if (isAbortError(err) || requestSignal.aborted || !mountedRef.current) {
        return null;
      }
      console.warn('[useValidationCache] validation fetch failed:', err);
      setError('Validation failed — check server connection');
      return null;
    } finally {
      if (!requestSignal.aborted && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    if (connected) {
      return;
    }
    hasAutoValidated.current = false;
    hasResultsRef.current = false;
    lastValidateKey.current = 0;
    fetchAbortRef.current?.abort();
    if (autoRevalidateTimer.current !== null) {
      clearTimeout(autoRevalidateTimer.current);
      autoRevalidateTimer.current = null;
    }
    setIssues(null);
    setError(null);
    setLastRefreshed(null);
    setLoading(false);
    setIsStale(false);
  }, [connected]);

  // Auto-validate on first connection
  useEffect(() => {
    if (connected && !hasAutoValidated.current) {
      hasAutoValidated.current = true;
      void runValidation();
    }
  }, [connected, runValidation]);

  // Manual validation trigger via validateKey
  useEffect(() => {
    if (validateKey != null && validateKey > 0 && validateKey !== lastValidateKey.current) {
      lastValidateKey.current = validateKey;
      void runValidation();
    }
  }, [validateKey, runValidation]);

  // Debounced auto-revalidation after token changes (only when results already exist)
  useEffect(() => {
    if (!tokenChangeKey) return;
    if (!hasResultsRef.current) return;
    setIsStale(true);
    if (autoRevalidateTimer.current !== null) clearTimeout(autoRevalidateTimer.current);
    autoRevalidateTimer.current = setTimeout(() => {
      autoRevalidateTimer.current = null;
      void runValidation();
    }, 2000);
    return () => {
      if (autoRevalidateTimer.current !== null) {
        clearTimeout(autoRevalidateTimer.current);
        autoRevalidateTimer.current = null;
      }
    };
  }, [tokenChangeKey, runValidation]);

  return {
    validationIssues: issues,
    validationLoading: loading,
    validationError: error,
    validationLastRefreshed: lastRefreshed,
    validationIsStale: isStale,
    refreshValidation: runValidation,
  };
}
