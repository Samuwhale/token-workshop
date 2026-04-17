import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getErrorMessage, isAbortError } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import type {
  RecipeType,
  RecipeConfig,
  GeneratedTokenResult,
  InputTable,
} from './useRecipes';

export interface OverwrittenEntry {
  path: string;
  type: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface RecipePreviewDiff {
  created: Array<{ path: string; value: unknown; type: string }>;
  updated: Array<{ path: string; currentValue: unknown; newValue: unknown; type: string }>;
  deleted: Array<{ path: string; currentValue: unknown; type: string }>;
  unchanged: Array<{ path: string; value: unknown; type: string }>;
}

export interface RecipePreviewChangeEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue: unknown;
  changesValue: boolean;
}

export interface RecipePreviewOverwriteEntry extends RecipePreviewChangeEntry {
  owner: 'manual' | 'recipe';
  recipeId?: string;
}

export interface RecipePreviewManualConflictEntry extends RecipePreviewChangeEntry {
  baselineValue: unknown;
}

export interface RecipePreviewDeletedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
}

export interface RecipePreviewDetachedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue?: unknown;
  state: 'preserved' | 'recreated';
}

export interface RecipePreviewAnalysis {
  fingerprint: string;
  safeCreateCount: number;
  unchangedCount: number;
  existingPathSet: string[];
  safeUpdates: RecipePreviewChangeEntry[];
  nonRecipeOverwrites: RecipePreviewOverwriteEntry[];
  manualEditConflicts: RecipePreviewManualConflictEntry[];
  deletedOutputs: RecipePreviewDeletedEntry[];
  detachedOutputs: RecipePreviewDetachedEntry[];
  diff: RecipePreviewDiff;
}

/** True when the analysis contains risks that warrant user review before saving. */
export function hasPreviewRisks(analysis: RecipePreviewAnalysis | null): boolean {
  if (!analysis) return true;
  return (
    analysis.nonRecipeOverwrites.length > 0 ||
    analysis.manualEditConflicts.length > 0 ||
    analysis.deletedOutputs.length > 0 ||
    analysis.detachedOutputs.length > 0
  );
}

export interface RecipePreviewResponse {
  count: number;
  tokens: GeneratedTokenResult[];
  analysis: RecipePreviewAnalysis;
}

export interface RecipePreviewRequest {
  serverUrl: string;
  selectedType: RecipeType;
  sourceTokenPath?: string;
  inlineValue?: unknown;
  targetGroup: string;
  targetCollection: string;
  config: RecipeConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  sourceValue?: unknown;
  baseRecipeId?: string;
  detachedPaths?: string[];
  inputTable?: InputTable;
  targetCollectionTemplate?: string;
  signal?: AbortSignal;
}

export async function requestRecipePreview({
  serverUrl,
  selectedType,
  sourceTokenPath,
  inlineValue,
  targetGroup,
  targetCollection,
  config,
  pendingOverrides,
  sourceValue,
  baseRecipeId,
  detachedPaths,
  inputTable,
  targetCollectionTemplate,
  signal,
}: RecipePreviewRequest): Promise<RecipePreviewResponse> {
  const body: Record<string, unknown> = {
    type: selectedType,
    targetGroup,
    targetCollection,
    config,
    overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
    sourceValue,
    baseRecipeId,
    detachedPaths,
    inputTable,
    targetCollectionTemplate,
  };

  if (sourceTokenPath) {
    body.sourceToken = sourceTokenPath;
  } else if (inlineValue !== undefined && inlineValue !== '') {
    body.inlineValue = inlineValue;
  }

  return apiFetch<RecipePreviewResponse>(`${serverUrl}/api/recipes/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ? createFetchSignal(signal) : undefined,
  });
}

interface UseRecipePreviewParams {
  serverUrl: string;
  selectedType: RecipeType;
  sourceTokenPath?: string;
  inlineValue?: unknown;
  targetGroup: string;
  targetCollection: string;
  config: RecipeConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  isMultiBrand: boolean;
  inputTable?: InputTable;
  targetCollectionTemplate: string;
  existingRecipeId?: string;
  detachedPaths?: string[];
  refreshNonce?: number;
}

export interface UseRecipePreviewReturn {
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  existingTokensError: string;
  overwrittenEntries: OverwrittenEntry[];
  existingOverwritePathSet: Set<string>;
  previewDiff: RecipePreviewDiff | null;
  previewBrand: string | undefined;
  multiBrandPreviews: Map<string, GeneratedTokenResult[]>;
  previewFingerprint: string;
  previewAnalysis: RecipePreviewAnalysis | null;
}

const EMPTY_ANALYSIS: RecipePreviewAnalysis = {
  fingerprint: '',
  safeCreateCount: 0,
  unchangedCount: 0,
  existingPathSet: [],
  safeUpdates: [],
  nonRecipeOverwrites: [],
  manualEditConflicts: [],
  deletedOutputs: [],
  detachedOutputs: [],
  diff: {
    created: [],
    updated: [],
    deleted: [],
    unchanged: [],
  },
};

export function useRecipePreview({
  serverUrl,
  selectedType,
  sourceTokenPath,
  inlineValue,
  targetGroup,
  targetCollection,
  config,
  pendingOverrides,
  isMultiBrand,
  inputTable,
  targetCollectionTemplate,
  existingRecipeId,
  detachedPaths,
  refreshNonce = 0,
}: UseRecipePreviewParams): UseRecipePreviewReturn {
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAnalysis, setPreviewAnalysis] = useState<RecipePreviewAnalysis | null>(null);
  const [multiBrandPreviews, setMultiBrandPreviews] = useState<Map<string, GeneratedTokenResult[]>>(new Map());

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const multiBrandAbortRef = useRef<AbortController | null>(null);

  const firstBrandRow = useMemo(() => {
    if (!isMultiBrand || !inputTable || inputTable.rows.length === 0) return undefined;
    return inputTable.rows.find((row) => row.brand.trim() && row.inputs[inputTable.inputKey] !== undefined);
  }, [isMultiBrand, inputTable]);

  const fetchPreview = useCallback(() => {
    if (isMultiBrand && !firstBrandRow) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      abortRef.current?.abort();
      setPreviewTokens([]);
      setPreviewAnalysis(null);
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
        const response = await requestRecipePreview({
          serverUrl,
          selectedType,
          sourceTokenPath,
          inlineValue,
          targetGroup,
          targetCollection,
          config,
          pendingOverrides,
          sourceValue: isMultiBrand && firstBrandRow ? firstBrandRow.inputs[inputTable!.inputKey] : undefined,
          baseRecipeId: existingRecipeId,
          detachedPaths,
          inputTable: isMultiBrand ? inputTable : undefined,
          targetCollectionTemplate: isMultiBrand ? targetCollectionTemplate : undefined,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setPreviewTokens(response.tokens ?? []);
        setPreviewAnalysis(response.analysis ?? EMPTY_ANALYSIS);
      } catch (err) {
        if (isAbortError(err)) return;
        if (controller.signal.aborted) return;
        setPreviewError(getErrorMessage(err, 'Preview failed'));
        setPreviewTokens([]);
        setPreviewAnalysis(null);
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 300);
  }, [
    config,
    detachedPaths,
    existingRecipeId,
    firstBrandRow,
    inlineValue,
    inputTable,
    isMultiBrand,
    pendingOverrides,
    selectedType,
    serverUrl,
    sourceTokenPath,
    targetGroup,
    targetCollection,
    targetCollectionTemplate,
  ]);

  useEffect(() => {
    fetchPreview();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [fetchPreview, refreshNonce]);

  const allBrandRows = useMemo(() => {
    if (!isMultiBrand || !inputTable || inputTable.rows.length === 0) return [];
    return inputTable.rows.filter((row) => row.brand.trim() && row.inputs[inputTable.inputKey] !== undefined);
  }, [isMultiBrand, inputTable]);

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
      const requests = allBrandRows.map(async (row) => {
        try {
          const response = await requestRecipePreview({
            serverUrl,
            selectedType,
            targetGroup,
            targetCollection,
            config,
            pendingOverrides,
            sourceValue: row.inputs[inputTable!.inputKey],
            baseRecipeId: existingRecipeId,
            detachedPaths,
            signal: controller.signal,
          });
          return { brand: row.brand, tokens: response.tokens ?? [] };
        } catch (err) {
          if (isAbortError(err)) return null;
          return { brand: row.brand, tokens: [] as GeneratedTokenResult[] };
        }
      });

      const settled = await Promise.all(requests);
      if (controller.signal.aborted) return;
      for (const result of settled) {
        if (!result) continue;
        results.set(result.brand, result.tokens);
      }
      setMultiBrandPreviews(results);
    };

    const timer = setTimeout(fetchAll, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    allBrandRows,
    config,
    detachedPaths,
    existingRecipeId,
    inputTable,
    isMultiBrand,
    pendingOverrides,
    selectedType,
    serverUrl,
    targetGroup,
    targetCollection,
    targetCollectionTemplate,
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      multiBrandAbortRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const overwrittenEntries = useMemo<OverwrittenEntry[]>(() => {
    const analysis = previewAnalysis;
    if (!analysis) return [];
    return [
      ...analysis.safeUpdates,
      ...analysis.nonRecipeOverwrites.filter((entry) => entry.changesValue),
      ...analysis.manualEditConflicts,
      ...analysis.detachedOutputs
        .filter((entry) => entry.state === 'recreated' && entry.newValue !== undefined && stableValueChanged(entry.currentValue, entry.newValue))
        .map((entry) => ({
          path: entry.path,
          collectionId: entry.collectionId,
          type: entry.type,
          currentValue: entry.currentValue,
          newValue: entry.newValue,
          changesValue: true,
        })),
    ].map((entry) => ({
      path: entry.path,
      type: entry.type,
      oldValue: entry.currentValue,
      newValue: entry.newValue,
    }));
  }, [previewAnalysis]);

  const existingOverwritePathSet = useMemo(
    () => new Set(previewAnalysis?.existingPathSet ?? []),
    [previewAnalysis],
  );

  const previewDiff = previewAnalysis?.diff ?? null;
  const previewBrand = isMultiBrand && firstBrandRow ? firstBrandRow.brand : undefined;

  return {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError: '',
    overwrittenEntries,
    existingOverwritePathSet,
    previewDiff,
    previewBrand,
    multiBrandPreviews,
    previewFingerprint: previewAnalysis?.fingerprint ?? '',
    previewAnalysis,
  };
}

function stableValueChanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
