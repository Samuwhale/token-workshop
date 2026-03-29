import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getErrorMessage } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { GeneratorType, GeneratorConfig, GeneratedTokenResult, InputTable } from './useGenerators';

export interface OverwrittenEntry {
  path: string;
  type: string;
  oldValue: unknown;
  newValue: unknown;
}

interface UseGeneratorPreviewParams {
  serverUrl: string;
  selectedType: GeneratorType;
  sourceTokenPath?: string;
  inlineValue?: unknown;
  targetGroup: string;
  targetSet: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  isMultiBrand: boolean;
  inputTable?: InputTable;
}

export interface UseGeneratorPreviewReturn {
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  existingTokensError: string;
  overwrittenEntries: OverwrittenEntry[];
  /** Brand name used for the preview sample, if multi-brand */
  previewBrand: string | undefined;
}

export function useGeneratorPreview({
  serverUrl,
  selectedType,
  sourceTokenPath,
  inlineValue,
  targetGroup,
  targetSet,
  config,
  pendingOverrides,
  isMultiBrand,
  inputTable,
}: UseGeneratorPreviewParams): UseGeneratorPreviewReturn {
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [existingSetTokens, setExistingSetTokens] = useState<Record<string, { $value: unknown; $type: string }>>({});
  const [existingTokensError, setExistingTokensError] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // For multi-brand, find the first row with a usable input value
  const firstBrandRow = useMemo(() => {
    if (!isMultiBrand || !inputTable || inputTable.rows.length === 0) return undefined;
    return inputTable.rows.find(r => r.brand.trim() && r.inputs[inputTable.inputKey] !== undefined);
  }, [isMultiBrand, inputTable]);

  // Debounced preview fetch
  const fetchPreview = useCallback(() => {
    // For multi-brand without any usable brand row, skip preview
    if (isMultiBrand && !firstBrandRow) {
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
        const body: Record<string, unknown> = {
          type: selectedType,
          targetGroup,
          targetSet,
          config,
          overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
        };
        if (isMultiBrand && firstBrandRow) {
          // Use the first brand's input value as the source for a representative preview
          body.sourceValue = firstBrandRow.inputs[inputTable!.inputKey];
        } else if (sourceTokenPath) {
          body.sourceToken = sourceTokenPath;
        } else if (inlineValue !== undefined && inlineValue !== '') {
          // Use inline value as sourceValue for preview
          body.sourceValue = inlineValue;
        }
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
  }, [serverUrl, selectedType, sourceTokenPath, inlineValue, targetGroup, targetSet, config, pendingOverrides, isMultiBrand, firstBrandRow, inputTable]);

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

  // Compute overwritten entries (skip for multi-brand since each brand writes to different sets)
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

  const previewBrand = isMultiBrand && firstBrandRow ? firstBrandRow.brand : undefined;

  return {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError,
    overwrittenEntries,
    previewBrand,
  };
}
