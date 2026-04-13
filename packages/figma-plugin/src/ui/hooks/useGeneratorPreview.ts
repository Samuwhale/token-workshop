import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getErrorMessage, isAbortError } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import type {
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  InputTable,
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
  setName: string;
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
  setName: string;
  type: string;
  currentValue: unknown;
}

export interface GeneratorPreviewDetachedEntry {
  path: string;
  setName: string;
  type: string;
  currentValue: unknown;
  newValue?: unknown;
  state: 'preserved' | 'recreated';
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
  diff: GeneratorPreviewDiff;
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
  inlineValue?: unknown;
  targetGroup: string;
  targetSet: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  sourceValue?: unknown;
  baseGeneratorId?: string;
  detachedPaths?: string[];
  inputTable?: InputTable;
  targetSetTemplate?: string;
  signal?: AbortSignal;
}

export async function requestGeneratorPreview({
  serverUrl,
  selectedType,
  sourceTokenPath,
  inlineValue,
  targetGroup,
  targetSet,
  config,
  pendingOverrides,
  sourceValue,
  baseGeneratorId,
  detachedPaths,
  inputTable,
  targetSetTemplate,
  signal,
}: GeneratorPreviewRequest): Promise<GeneratorPreviewResponse> {
  const body: Record<string, unknown> = {
    type: selectedType,
    targetGroup,
    targetSet,
    config,
    overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
    sourceValue,
    baseGeneratorId,
    detachedPaths,
    inputTable,
    targetSetTemplate,
  };

  if (sourceTokenPath) {
    body.sourceToken = sourceTokenPath;
  } else if (inlineValue !== undefined && inlineValue !== '') {
    body.inlineValue = inlineValue;
  }

  return apiFetch<GeneratorPreviewResponse>(`${serverUrl}/api/generators/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ? createFetchSignal(signal) : undefined,
  });
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
  targetSetTemplate: string;
  existingGeneratorId?: string;
  detachedPaths?: string[];
  refreshNonce?: number;
}

export interface UseGeneratorPreviewReturn {
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  existingTokensError: string;
  overwrittenEntries: OverwrittenEntry[];
  existingOverwritePathSet: Set<string>;
  previewDiff: GeneratorPreviewDiff | null;
  previewBrand: string | undefined;
  multiBrandPreviews: Map<string, GeneratedTokenResult[]>;
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
  diff: {
    created: [],
    updated: [],
    deleted: [],
    unchanged: [],
  },
};

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
  targetSetTemplate,
  existingGeneratorId,
  detachedPaths,
  refreshNonce = 0,
}: UseGeneratorPreviewParams): UseGeneratorPreviewReturn {
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAnalysis, setPreviewAnalysis] = useState<GeneratorPreviewAnalysis | null>(null);
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
        const response = await requestGeneratorPreview({
          serverUrl,
          selectedType,
          sourceTokenPath,
          inlineValue,
          targetGroup,
          targetSet,
          config,
          pendingOverrides,
          sourceValue: isMultiBrand && firstBrandRow ? firstBrandRow.inputs[inputTable!.inputKey] : undefined,
          baseGeneratorId: existingGeneratorId,
          detachedPaths,
          inputTable: isMultiBrand ? inputTable : undefined,
          targetSetTemplate: isMultiBrand ? targetSetTemplate : undefined,
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
    firstBrandRow,
    inlineValue,
    inputTable,
    isMultiBrand,
    pendingOverrides,
    selectedType,
    serverUrl,
    sourceTokenPath,
    targetGroup,
    targetSet,
    targetSetTemplate,
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
          const response = await requestGeneratorPreview({
            serverUrl,
            selectedType,
            targetGroup,
            targetSet,
            config,
            pendingOverrides,
            sourceValue: row.inputs[inputTable!.inputKey],
            baseGeneratorId: existingGeneratorId,
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
    existingGeneratorId,
    inputTable,
    isMultiBrand,
    pendingOverrides,
    selectedType,
    serverUrl,
    targetGroup,
    targetSet,
    targetSetTemplate,
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
      ...analysis.nonGeneratorOverwrites.filter((entry) => entry.changesValue),
      ...analysis.manualEditConflicts,
      ...analysis.detachedOutputs
        .filter((entry) => entry.state === 'recreated' && entry.newValue !== undefined && stableValueChanged(entry.currentValue, entry.newValue))
        .map((entry) => ({
          path: entry.path,
          setName: entry.setName,
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
