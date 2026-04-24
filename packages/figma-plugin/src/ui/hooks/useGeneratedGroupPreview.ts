import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getErrorMessage, isAbortError, stableStringify } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import type {
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
} from './useGenerators';

export interface OverwrittenEntry {
  path: string;
  type: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface GeneratorPreviewDiff {
  created: Array<{ path: string; value: unknown; type: string }>;
  updated: Array<{ path: string; currentValue: unknown; newValue: unknown; type: string }>;
  deleted: Array<{ path: string; currentValue: unknown; type: string }>;
  unchanged: Array<{ path: string; value: unknown; type: string }>;
}

export interface GeneratorPreviewChangeEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue: unknown;
  changesValue: boolean;
}

export interface GeneratorPreviewOverwriteEntry extends GeneratorPreviewChangeEntry {
  owner: 'manual' | 'generator';
  generatorId?: string;
}

export interface GeneratorPreviewManualConflictEntry extends GeneratorPreviewChangeEntry {
  baselineValue: unknown;
}

export interface GeneratorPreviewDeletedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
}

export interface GeneratorPreviewDetachedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue?: unknown;
  state: 'preserved' | 'recreated';
}

export interface GeneratorPreviewManualExceptionEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue?: unknown;
  newValue?: unknown;
  state: 'created' | 'preserved' | 'invalidated';
}

export interface GeneratorPreviewAnalysis {
  fingerprint: string;
  safeCreateCount: number;
  unchangedCount: number;
  existingPathSet: string[];
  safeUpdates: GeneratorPreviewChangeEntry[];
  nonGeneratorOverwrites: GeneratorPreviewOverwriteEntry[];
  manualEditConflicts: GeneratorPreviewManualConflictEntry[];
  deletedOutputs: GeneratorPreviewDeletedEntry[];
  detachedOutputs: GeneratorPreviewDetachedEntry[];
  manualExceptions: GeneratorPreviewManualExceptionEntry[];
  diff: GeneratorPreviewDiff;
}

/** True when the analysis contains risks that warrant user review before saving. */
export function hasGeneratedGroupPreviewRisks(
  analysis: GeneratorPreviewAnalysis | null,
): boolean {
  if (!analysis) return true;
  return (
    analysis.nonGeneratorOverwrites.length > 0 ||
    analysis.manualEditConflicts.length > 0 ||
    analysis.deletedOutputs.length > 0 ||
    analysis.detachedOutputs.length > 0 ||
    analysis.manualExceptions.length > 0
  );
}

export function requiresGeneratedGroupReview(
  analysis: GeneratorPreviewAnalysis | null,
): boolean {
  if (!analysis) return true;
  return (
    hasGeneratedGroupPreviewRisks(analysis) ||
    analysis.safeUpdates.length >= 12
  );
}

export interface GeneratorPreviewResponse {
  count: number;
  tokens: GeneratedTokenResult[];
  analysis: GeneratorPreviewAnalysis;
}

export interface GeneratorPreviewRequest {
  serverUrl: string;
  selectedType: GeneratorType;
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  inlineValue?: unknown;
  targetGroup: string;
  targetCollection: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  sourceValue?: unknown;
  baseGeneratorId?: string;
  detachedPaths?: string[];
  signal?: AbortSignal;
}

export async function requestGeneratedGroupPreview({
  serverUrl,
  selectedType,
  sourceTokenPath,
  sourceCollectionId,
  inlineValue,
  targetGroup,
  targetCollection,
  config,
  pendingOverrides,
  sourceValue,
  baseGeneratorId,
  detachedPaths,
  signal,
}: GeneratorPreviewRequest): Promise<GeneratorPreviewResponse> {
  const body: Record<string, unknown> = {
    type: selectedType,
    targetGroup,
    targetCollection,
    config,
    overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
    sourceValue,
    baseGeneratorId,
    detachedPaths,
  };

  if (sourceTokenPath) {
    body.sourceToken = sourceTokenPath;
    if (sourceCollectionId) {
      body.sourceCollectionId = sourceCollectionId;
    }
  } else if (inlineValue !== undefined && inlineValue !== '') {
    body.inlineValue = inlineValue;
  }

  return apiFetch<GeneratorPreviewResponse>(`${serverUrl}/api/generators/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: createFetchSignal(signal, 15_000),
  });
}

interface UseGeneratorPreviewParams {
  serverUrl: string;
  selectedType: GeneratorType;
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  inlineValue?: unknown;
  sourceValue?: unknown;
  targetGroup: string;
  targetCollection: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  existingGeneratorId?: string;
  detachedPaths?: string[];
  refreshNonce?: number;
}

export interface UseGeneratorPreviewReturn {
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  overwrittenEntries: OverwrittenEntry[];
  existingOverwritePathSet: Set<string>;
  previewDiff: GeneratorPreviewDiff | null;
  previewFingerprint: string;
  previewAnalysis: GeneratorPreviewAnalysis | null;
}

const EMPTY_ANALYSIS: GeneratorPreviewAnalysis = {
  fingerprint: '',
  safeCreateCount: 0,
  unchangedCount: 0,
  existingPathSet: [],
  safeUpdates: [],
  nonGeneratorOverwrites: [],
  manualEditConflicts: [],
  deletedOutputs: [],
  detachedOutputs: [],
  manualExceptions: [],
  diff: {
    created: [],
    updated: [],
    deleted: [],
    unchanged: [],
  },
};

export function useGeneratedGroupPreview({
  serverUrl,
  selectedType,
  sourceTokenPath,
  sourceCollectionId,
  inlineValue,
  sourceValue,
  targetGroup,
  targetCollection,
  config,
  pendingOverrides,
  existingGeneratorId,
  detachedPaths,
  refreshNonce = 0,
}: UseGeneratorPreviewParams): UseGeneratorPreviewReturn {
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAnalysis, setPreviewAnalysis] = useState<GeneratorPreviewAnalysis | null>(null);

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
        const response = await requestGeneratedGroupPreview({
          serverUrl,
          selectedType,
          sourceTokenPath,
          sourceCollectionId,
          inlineValue,
          sourceValue,
          targetGroup,
          targetCollection,
          config,
          pendingOverrides,
          baseGeneratorId: existingGeneratorId,
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
    existingGeneratorId,
    inlineValue,
    pendingOverrides,
    selectedType,
    serverUrl,
    sourceValue,
    sourceCollectionId,
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
      ...analysis.nonGeneratorOverwrites.filter((entry) => entry.changesValue),
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
    overwrittenEntries,
    existingOverwritePathSet,
    previewDiff,
    previewFingerprint: previewAnalysis?.fingerprint ?? '',
    previewAnalysis,
  };
}

function stableValueChanged(before: unknown, after: unknown): boolean {
  return stableStringify(before) !== stableStringify(after);
}
