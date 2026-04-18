import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getErrorMessage, isAbortError } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import type {
  RecipeType,
  RecipeConfig,
  GeneratedTokenResult,
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

export function requiresPreviewReview(
  analysis: RecipePreviewAnalysis | null,
): boolean {
  if (!analysis) return true;
  return hasPreviewRisks(analysis) || analysis.safeUpdates.length >= 12;
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
  sourceValue?: unknown;
  targetGroup: string;
  targetCollection: string;
  config: RecipeConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
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
  sourceValue,
  targetGroup,
  targetCollection,
  config,
  pendingOverrides,
  existingRecipeId,
  detachedPaths,
  refreshNonce = 0,
}: UseRecipePreviewParams): UseRecipePreviewReturn {
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAnalysis, setPreviewAnalysis] = useState<RecipePreviewAnalysis | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPreview = useCallback(() => {
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
          sourceValue,
          targetGroup,
          targetCollection,
          config,
          pendingOverrides,
          baseRecipeId: existingRecipeId,
          detachedPaths,
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
    inlineValue,
    pendingOverrides,
    selectedType,
    serverUrl,
    sourceValue,
    sourceTokenPath,
    targetGroup,
    targetCollection,
  ]);

  useEffect(() => {
    fetchPreview();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [fetchPreview, refreshNonce]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
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

  return {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError: '',
    overwrittenEntries,
    existingOverwritePathSet,
    previewDiff,
    previewFingerprint: previewAnalysis?.fingerprint ?? '',
    previewAnalysis,
  };
}

function stableValueChanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
