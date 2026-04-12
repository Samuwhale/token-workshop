import { useState } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import { createToken, createTokenBody } from '../shared/tokenMutations';
import type { CoverageMap, CoverageToken, AutoFillPreview } from '../components/themeManagerTypes';

export interface UseThemeAutoFillParams {
  serverUrl: string;
  dimensions: ThemeDimension[];
  coverage: CoverageMap;
  debouncedFetchDimensions: () => void;
  setError: (msg: string | null) => void;
}

export function useThemeAutoFill({
  serverUrl,
  dimensions,
  coverage,
  debouncedFetchDimensions,
  setError,
}: UseThemeAutoFillParams) {
  const [fillingKeys, setFillingKeys] = useState<Set<string>>(new Set());
  const [autoFillPreview, setAutoFillPreview] = useState<AutoFillPreview | null>(null);
  const [autoFillStrategy, setAutoFillStrategy] = useState<'skip' | 'overwrite'>('skip');

  /** Find the first override (enabled) set for a given option */
  const getOverrideSet = (dimId: string, optionName: string): string | null => {
    const dim = dimensions.find(d => d.id === dimId);
    const opt = dim?.options.find(o => o.name === optionName);
    if (!opt) return null;
    const entry = Object.entries(opt.sets).find(([, s]) => s === 'enabled');
    return entry?.[0] ?? null;
  };

  /** Auto-fill a single uncovered token by creating its missing reference in the override set */
  const handleAutoFillSingle = async (dimId: string, optionName: string, item: CoverageToken) => {
    if (!item.missingRef || item.fillValue === undefined) return;
    const targetSet = getOverrideSet(dimId, optionName);
    if (!targetSet) {
      setError('No override set available. Assign a set as Override first.');
      return;
    }
    const fillKey = `${dimId}:${optionName}:${item.path}`;
    setFillingKeys(prev => { const n = new Set(prev); n.add(fillKey); return n; });
    try {
      await createToken(serverUrl, targetSet, item.missingRef, createTokenBody({
        $type: item.fillType,
        $value: item.fillValue,
      }));
      debouncedFetchDimensions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to auto-fill token'));
    } finally {
      setFillingKeys(prev => { const n = new Set(prev); n.delete(fillKey); return n; });
    }
  };

  /** Auto-fill all uncovered tokens that have a known fill value — shows a preview modal first */
  const handleAutoFillAll = (dimId: string, optionName: string) => {
    const items = coverage[dimId]?.[optionName]?.uncovered ?? [];
    const fillable = items.filter(i => i.missingRef && i.fillValue !== undefined);
    if (fillable.length === 0) return;
    const targetSet = getOverrideSet(dimId, optionName);
    if (!targetSet) {
      setError('No override set available. Assign a set as Override first.');
      return;
    }
    // De-duplicate by missingRef — multiple tokens may reference the same missing path
    const seen = new Set<string>();
    const tokens: Array<{ path: string; $value: unknown; $type?: string }> = [];
    for (const item of fillable) {
      if (!item.missingRef || seen.has(item.missingRef)) continue;
      seen.add(item.missingRef);
      const t: { path: string; $value: unknown; $type?: string } = { path: item.missingRef, $value: item.fillValue };
      if (item.fillType) t.$type = item.fillType;
      tokens.push(t);
    }
    setAutoFillPreview({ mode: 'single-option', dimId, optionName, targetSet, tokens });
  };

  /** Execute the auto-fill for a single option after confirmation */
  const executeAutoFillAll = async (preview: Extract<AutoFillPreview, { mode: 'single-option' }>, strategy: 'skip' | 'overwrite') => {
    const { dimId, optionName, targetSet, tokens } = preview;
    const fillKey = `${dimId}:${optionName}:__all__`;
    setFillingKeys(prev => { const n = new Set(prev); n.add(fillKey); return n; });
    setAutoFillPreview(null);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, strategy }),
      });
      debouncedFetchDimensions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to auto-fill tokens'));
    } finally {
      setFillingKeys(prev => { const n = new Set(prev); n.delete(fillKey); return n; });
    }
  };

  /** Auto-fill all uncovered tokens across ALL options within a dimension — shows a preview modal first */
  const handleAutoFillAllOptions = (dimId: string) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    const dimCov = coverage[dimId];
    if (!dimCov) return;

    const perSetBatch: Record<string, Array<{ path: string; $value: unknown; $type?: string }>> = {};
    let totalCount = 0;
    for (const opt of dim.options) {
      const items = dimCov[opt.name]?.uncovered ?? [];
      const fillable = items.filter(i => i.missingRef && i.fillValue !== undefined);
      if (fillable.length === 0) continue;
      const targetSet = getOverrideSet(dimId, opt.name);
      if (!targetSet) continue;
      if (!perSetBatch[targetSet]) perSetBatch[targetSet] = [];
      const seenInSet = new Set(perSetBatch[targetSet].map(t => t.path));
      for (const item of fillable) {
        if (!item.missingRef || seenInSet.has(item.missingRef)) continue;
        seenInSet.add(item.missingRef);
        const t: { path: string; $value: unknown; $type?: string } = { path: item.missingRef, $value: item.fillValue };
        if (item.fillType) t.$type = item.fillType;
        perSetBatch[targetSet].push(t);
        totalCount++;
      }
    }
    if (totalCount === 0) {
      setError('No override sets available. Assign sets as Override first.');
      return;
    }
    setAutoFillPreview({ mode: 'all-options', dimId, perSetBatch, totalCount });
  };

  /** Execute the auto-fill for all options after confirmation */
  const executeAutoFillAllOptions = async (preview: Extract<AutoFillPreview, { mode: 'all-options' }>, strategy: 'skip' | 'overwrite') => {
    const { dimId, perSetBatch } = preview;
    const fillKey = `${dimId}:__all_options__`;
    setFillingKeys(prev => { const n = new Set(prev); n.add(fillKey); return n; });
    setAutoFillPreview(null);
    try {
      await Promise.all(
        Object.entries(perSetBatch).map(([targetSet, tokens]) =>
          apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens, strategy }),
          })
        )
      );
      debouncedFetchDimensions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to auto-fill tokens'));
    } finally {
      setFillingKeys(prev => { const n = new Set(prev); n.delete(fillKey); return n; });
    }
  };

  return {
    fillingKeys,
    autoFillPreview,
    setAutoFillPreview,
    autoFillStrategy,
    setAutoFillStrategy,
    handleAutoFillSingle,
    handleAutoFillAll,
    executeAutoFillAll,
    handleAutoFillAllOptions,
    executeAutoFillAllOptions,
  };
}
