import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

export type Severity = 'error' | 'warning' | 'info';

export interface LintRuleCollectionOverride {
  enabled?: boolean;
  severity?: Severity;
  options?: Record<string, unknown>;
}

export interface LintRuleConfig {
  enabled: boolean;
  severity?: Severity;
  options?: Record<string, unknown>;
  /**
   * Exclude token paths matching these prefix patterns from this rule.
   * A pattern matches if the token path equals the pattern or starts with "<pattern>.".
   */
  excludePaths?: string[];
  /**
   * Per-collection overrides — merged with the global rule config when linting a specific collection.
   * Keyed by collection id. Unset fields fall back to the global values.
   */
  collectionOverrides?: Record<string, LintRuleCollectionOverride>;
}

export interface LintConfig {
  lintRules: Record<string, LintRuleConfig>;
}

export function useLintConfig(serverUrl: string, connected: boolean) {
  const [config, setConfig] = useState<LintConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAbortRef = useRef<AbortController | null>(null);
  // Abort any in-flight config fetch on unmount
  useEffect(() => () => { fetchAbortRef.current?.abort(); }, []);

  const fetchConfig = useCallback(async () => {
    if (!connected) {
      fetchAbortRef.current?.abort();
      setConfig(null);
      setError(null);
      setLoading(false);
      return;
    }
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LintConfig>(`${serverUrl}/api/lint/config`, { signal: createFetchSignal(controller.signal) });
      setConfig(data);
      setError(null);
    } catch (err) {
      if (isAbortError(err)) return;
      console.warn('[useLintConfig] fetch config failed:', err);
      setConfig(null);
      setError('Failed to load rules. Try reconnecting.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = useCallback(async (updated: LintConfig) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<LintConfig>(`${serverUrl}/api/lint/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setConfig(saved);
      setError(null);
      return true;
    } catch (err) {
      console.warn('[useLintConfig] update config failed:', err);
      setError('Failed to save rules. Try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [serverUrl]);

  const updateRule = useCallback(async (ruleId: string, patch: Partial<LintRuleConfig>) => {
    if (!config) return false;
    const current = config.lintRules[ruleId] ?? { enabled: false };
    const updated: LintConfig = {
      ...config,
      lintRules: {
        ...config.lintRules,
        [ruleId]: { ...current, ...patch },
      },
    };
    return updateConfig(updated);
  }, [config, updateConfig]);

  const resetToDefaults = useCallback(async () => {
    try {
      const defaults = await apiFetch<LintConfig>(`${serverUrl}/api/lint/config/default`);
      return await updateConfig(defaults);
    } catch (err) {
      console.warn('[useLintConfig] reset to defaults failed:', err);
      setError('Failed to load default rules. Try again.');
      return false;
    }
  }, [serverUrl, updateConfig]);

  return { config, loading, error, saving, updateRule, applyConfig: updateConfig, resetToDefaults };
}
