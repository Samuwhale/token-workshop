import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../shared/apiFetch';

export type Severity = 'error' | 'warning' | 'info';

export interface LintRuleConfig {
  enabled: boolean;
  severity?: Severity;
  options?: Record<string, unknown>;
}

export interface LintConfig {
  lintRules: Record<string, LintRuleConfig>;
}

export function useLintConfig(serverUrl: string, connected: boolean) {
  const [config, setConfig] = useState<LintConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const data = await apiFetch<LintConfig>(`${serverUrl}/api/lint/config`);
      setConfig(data);
    } catch (err) {
      console.warn('[useLintConfig] fetch config failed:', err);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = useCallback(async (updated: LintConfig) => {
    setSaving(true);
    try {
      const saved = await apiFetch<LintConfig>(`${serverUrl}/api/lint/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setConfig(saved);
      return true;
    } catch (err) {
      console.warn('[useLintConfig] update config failed:', err);
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
    setSaving(true);
    try {
      const defaults = await apiFetch<LintConfig>(`${serverUrl}/api/lint/config/default`);
      return updateConfig(defaults);
    } catch (err) {
      console.warn('[useLintConfig] reset to defaults failed:', err);
      return false;
    } finally {
      setSaving(false);
    }
  }, [serverUrl, updateConfig]);

  return { config, loading, saving, updateRule, applyConfig: updateConfig, resetToDefaults, refetch: fetchConfig };
}
