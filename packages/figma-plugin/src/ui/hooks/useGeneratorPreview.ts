import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getErrorMessage } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { GeneratorType, GeneratorConfig, GeneratedTokenResult } from './useGenerators';
import type { OverwrittenEntry } from './useGeneratorDialog';

interface UseGeneratorPreviewParams {
  serverUrl: string;
  selectedType: GeneratorType;
  sourceTokenPath?: string;
  targetGroup: string;
  targetSet: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  isMultiBrand: boolean;
}

export interface UseGeneratorPreviewReturn {
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  existingTokensError: string;
  overwrittenEntries: OverwrittenEntry[];
}

export function useGeneratorPreview({
  serverUrl,
  selectedType,
  sourceTokenPath,
  targetGroup,
  targetSet,
  config,
  pendingOverrides,
  isMultiBrand,
}: UseGeneratorPreviewParams): UseGeneratorPreviewReturn {
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [existingSetTokens, setExistingSetTokens] = useState<Record<string, { $value: unknown; $type: string }>>({});
  const [existingTokensError, setExistingTokensError] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced preview fetch
  const fetchPreview = useCallback(() => {
    if (isMultiBrand) {
      setPreviewTokens([]);
      setPreviewError('');
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const body = {
          type: selectedType,
          sourceToken: sourceTokenPath || undefined,
          targetGroup,
          targetSet,
          config,
          overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
        };
        const data = await apiFetch<{ count: number; tokens: GeneratedTokenResult[] }>(
          `${serverUrl}/api/generators/preview`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal },
        );
        setPreviewTokens(data.tokens ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setPreviewError(getErrorMessage(err, 'Preview failed'));
        setPreviewTokens([]);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
  }, [serverUrl, selectedType, sourceTokenPath, targetGroup, targetSet, config, pendingOverrides, isMultiBrand]);

  useEffect(() => {
    fetchPreview();
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [fetchPreview]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Fetch existing tokens in the target set
  useEffect(() => {
    if (!targetSet) return;
    const controller = new AbortController();
    setExistingTokensError('');
    apiFetch<{ tokens: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}`, { signal: controller.signal })
      .then(data => {
        const map = flattenTokenGroup(data.tokens || {});
        const obj: Record<string, { $value: unknown; $type: string }> = {};
        for (const [path, token] of map) {
          obj[path] = { $value: token.$value, $type: token.$type || 'unknown' };
        }
        setExistingSetTokens(obj);
      })
      .catch(err => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setExistingTokensError(getErrorMessage(err, 'Could not load existing tokens — save is blocked to prevent overwriting unknown values'));
      });
    return () => controller.abort();
  }, [serverUrl, targetSet]);

  // Compute overwritten entries
  const overwrittenEntries = useMemo<OverwrittenEntry[]>(() => {
    if (isMultiBrand || previewTokens.length === 0) return [];
    return previewTokens
      .filter(pt => {
        const existing = existingSetTokens[pt.path];
        return existing !== undefined && JSON.stringify(existing.$value) !== JSON.stringify(pt.value);
      })
      .map(pt => ({
        path: pt.path,
        type: pt.type,
        oldValue: existingSetTokens[pt.path].$value,
        newValue: pt.value,
      }));
  }, [previewTokens, existingSetTokens, isMultiBrand]);

  return {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError,
    overwrittenEntries,
  };
}
