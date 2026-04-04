import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getErrorMessage, isAbortError } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
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
  /** All preview token paths that already exist in the target set (value-changed or unchanged) */
  existingOverwritePathSet: Set<string>;
  /** Brand name used for the preview sample, if multi-brand */
  previewBrand: string | undefined;
  /** Preview tokens for ALL brand rows, keyed by brand name (populated only when multi-brand) */
  multiBrandPreviews: Map<string, GeneratedTokenResult[]>;
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
  const [multiBrandPreviews, setMultiBrandPreviews] = useState<Map<string, GeneratedTokenResult[]>>(new Map());

  const [existingSetTokens, setExistingSetTokens] = useState<Record<string, { $value: unknown; $type: string }>>({});
  const [existingTokensError, setExistingTokensError] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const multiBrandAbortRef = useRef<AbortController | null>(null);

  // For multi-brand, find the first row with a usable input value
  const firstBrandRow = useMemo(() => {
    if (!isMultiBrand || !inputTable || inputTable.rows.length === 0) return undefined;
    return inputTable.rows.find(r => r.brand.trim() && r.inputs[inputTable.inputKey] !== undefined);
  }, [isMultiBrand, inputTable]);

  // Debounced preview fetch
  const fetchPreview = useCallback(() => {
    // For multi-brand without any usable brand row, skip preview.
    // Must clear any pending timer and abort any in-flight fetch so that
    // setPreviewLoading(false) isn't lost (the timer's finally block won't
    // run if the timer was already cancelled by an effect cleanup).
    if (isMultiBrand && !firstBrandRow) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      abortRef.current?.abort();
      setPreviewTokens([]);
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setPreviewLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
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
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: createFetchSignal(controller.signal) },
        );
        if (!controller.signal.aborted) setPreviewTokens(data.tokens ?? []);
      } catch (err) {
        if (isAbortError(err)) return;
        if (!controller.signal.aborted) {
          setPreviewError(getErrorMessage(err, 'Preview failed'));
          setPreviewTokens([]);
        }
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 300);
  }, [serverUrl, selectedType, sourceTokenPath, inlineValue, targetGroup, targetSet, config, pendingOverrides, isMultiBrand, firstBrandRow, inputTable]);

  useEffect(() => {
    fetchPreview();
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [fetchPreview]);

  // All usable brand rows for multi-brand preview
  const allBrandRows = useMemo(() => {
    if (!isMultiBrand || !inputTable || inputTable.rows.length === 0) return [];
    return inputTable.rows.filter(r => r.brand.trim() && r.inputs[inputTable.inputKey] !== undefined);
  }, [isMultiBrand, inputTable]);

  // Fetch preview for ALL brands when multi-brand is active
  useEffect(() => {
    multiBrandAbortRef.current?.abort();

    if (!isMultiBrand || allBrandRows.length === 0) {
      setMultiBrandPreviews(new Map());
      return;
    }

    const controller = new AbortController();
    multiBrandAbortRef.current = controller;

    const fetchAll = async () => {
      const results = new Map<string, GeneratedTokenResult[]>();
      // Fetch all brand previews in parallel
      const promises = allBrandRows.map(async (row) => {
        const body: Record<string, unknown> = {
          type: selectedType,
          targetGroup,
          targetSet,
          config,
          overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
          sourceValue: row.inputs[inputTable!.inputKey],
        };
        try {
          const data = await apiFetch<{ count: number; tokens: GeneratedTokenResult[] }>(
            `${serverUrl}/api/generators/preview`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: createFetchSignal(controller.signal) },
          );
          return { brand: row.brand, tokens: data.tokens ?? [] };
        } catch (err) {
          if (isAbortError(err)) return null;
          // Silently skip failed brand previews — the single-brand preview already shows errors
          return { brand: row.brand, tokens: [] as GeneratedTokenResult[] };
        }
      });
      const settled = await Promise.all(promises);
      if (controller.signal.aborted) return;
      for (const result of settled) {
        if (result) results.set(result.brand, result.tokens);
      }
      setMultiBrandPreviews(results);
    };

    // Debounce to match the single-preview debounce timing
    const timer = setTimeout(fetchAll, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [serverUrl, selectedType, targetGroup, targetSet, config, pendingOverrides, isMultiBrand, allBrandRows, inputTable]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      multiBrandAbortRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Fetch existing tokens in the target set
  useEffect(() => {
    if (!targetSet) return;
    const controller = new AbortController();
    setExistingTokensError('');
    apiFetch<{ tokens: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}`, { signal: createFetchSignal(controller.signal) })
      .then(data => {
        if (controller.signal.aborted) return;
        const map = flattenTokenGroup(data.tokens || {});
        const obj: Record<string, { $value: unknown; $type: string }> = {};
        for (const [path, token] of map) {
          obj[path] = { $value: token.$value, $type: token.$type || 'unknown' };
        }
        setExistingSetTokens(obj);
      })
      .catch(err => {
        if (isAbortError(err)) return;
        if (!controller.signal.aborted) setExistingTokensError(getErrorMessage(err, 'Could not load existing tokens — save is blocked to prevent overwriting unknown values'));
      });
    return () => controller.abort();
  }, [serverUrl, targetSet]);

  // Compute overwritten entries (skip for multi-brand since each brand writes to different sets)
  const { overwrittenEntries, existingOverwritePathSet } = useMemo<{
    overwrittenEntries: OverwrittenEntry[];
    existingOverwritePathSet: Set<string>;
  }>(() => {
    if (isMultiBrand || previewTokens.length === 0) {
      return { overwrittenEntries: [], existingOverwritePathSet: new Set<string>() };
    }
    const pathSet = new Set<string>();
    const entries: OverwrittenEntry[] = [];
    for (const pt of previewTokens) {
      const existing = existingSetTokens[pt.path];
      if (existing !== undefined) {
        pathSet.add(pt.path);
        if (JSON.stringify(existing.$value) !== JSON.stringify(pt.value)) {
          entries.push({
            path: pt.path,
            type: pt.type,
            oldValue: existing.$value,
            newValue: pt.value,
          });
        }
      }
    }
    return { overwrittenEntries: entries, existingOverwritePathSet: pathSet };
  }, [previewTokens, existingSetTokens, isMultiBrand]);

  const previewBrand = isMultiBrand && firstBrandRow ? firstBrandRow.brand : undefined;

  return {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError,
    overwrittenEntries,
    existingOverwritePathSet,
    previewBrand,
    multiBrandPreviews,
  };
}
