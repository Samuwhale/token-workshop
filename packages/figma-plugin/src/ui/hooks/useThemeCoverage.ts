import { useState, useMemo, useCallback, useEffect } from 'react';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import type { CoverageMap, MissingOverrideToken, MissingOverridesMap } from '../components/themeManagerTypes';

function makeErrorMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : getErrorMessage(err, fallback);
}

export interface UseThemeCoverageParams {
  coverage: CoverageMap;
  missingOverrides: MissingOverridesMap;
  serverUrl: string;
  debouncedFetchDimensions: () => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export interface UseThemeCoverageReturn {
  expandedCoverage: Set<string>;
  setExpandedCoverage: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedStale: Set<string>;
  setExpandedStale: React.Dispatch<React.SetStateAction<Set<string>>>;
  showMissingOnly: Set<string>;
  setShowMissingOnly: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedMissingOverrides: Set<string>;
  setExpandedMissingOverrides: React.Dispatch<React.SetStateAction<Set<string>>>;
  creatingMissingKeys: Set<string>;
  setCreatingMissingKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  missingOverrideSearch: Record<string, string>;
  setMissingOverrideSearch: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  totalFillableGaps: number;
  handleBulkCreateMissingOverrides: (dimId: string, optionName: string, targetSet: string, tokens: MissingOverrideToken[]) => Promise<void>;
}

export function useThemeCoverage({
  coverage,
  missingOverrides: _missingOverrides,
  serverUrl,
  debouncedFetchDimensions,
  setError,
}: UseThemeCoverageParams): UseThemeCoverageReturn {
  const [expandedCoverage, setExpandedCoverage] = useState<Set<string>>(new Set());
  const [expandedStale, setExpandedStale] = useState<Set<string>>(new Set());
  const [showMissingOnly, setShowMissingOnly] = useState<Set<string>>(new Set());
  const [expandedMissingOverrides, setExpandedMissingOverrides] = useState<Set<string>>(new Set());
  const [creatingMissingKeys, setCreatingMissingKeys] = useState<Set<string>>(new Set());
  const [missingOverrideSearch, setMissingOverrideSearch] = useState<Record<string, string>>({});

  // Auto-expand coverage sections that have gaps after each fetch
  useEffect(() => {
    const keysWithGaps = new Set<string>();
    for (const [dimId, dimCov] of Object.entries(coverage)) {
      for (const [optName, optCov] of Object.entries(dimCov)) {
        if (optCov.uncovered.length > 0) keysWithGaps.add(`${dimId}:${optName}`);
      }
    }
    setExpandedCoverage(keysWithGaps);
  }, [coverage]);

  const totalFillableGaps = useMemo(() => {
    let total = 0;
    for (const dimCoverage of Object.values(coverage)) {
      for (const optCoverage of Object.values(dimCoverage)) {
        total += optCoverage.uncovered.filter(i => i.missingRef && i.fillValue !== undefined).length;
      }
    }
    return total;
  }, [coverage]);

  const handleBulkCreateMissingOverrides = useCallback(async (
    dimId: string,
    optionName: string,
    targetSet: string,
    tokens: MissingOverrideToken[],
  ) => {
    if (tokens.length === 0) return;
    const fillKey = `${dimId}:${optionName}:__missing__`;
    setCreatingMissingKeys(prev => { const n = new Set(prev); n.add(fillKey); return n; });
    try {
      const batch = tokens.map(t => {
        const entry: { path: string; $value: unknown; $type?: string } = { path: t.path, $value: t.value };
        if (t.type) entry.$type = t.type;
        return entry;
      });
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: batch, strategy: 'skip' }),
      });
      debouncedFetchDimensions();
    } catch (err) {
      setError(makeErrorMsg(err, 'Failed to create missing override tokens'));
    } finally {
      setCreatingMissingKeys(prev => { const n = new Set(prev); n.delete(fillKey); return n; });
    }
  }, [serverUrl, debouncedFetchDimensions, setError]);

  return {
    expandedCoverage,
    setExpandedCoverage,
    expandedStale,
    setExpandedStale,
    showMissingOnly,
    setShowMissingOnly,
    expandedMissingOverrides,
    setExpandedMissingOverrides,
    creatingMissingKeys,
    setCreatingMissingKeys,
    missingOverrideSearch,
    setMissingOverrideSearch,
    totalFillableGaps,
    handleBulkCreateMissingOverrides,
  };
}
