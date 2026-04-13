import { useState } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import { createToken, createTokenValueBody } from '../shared/tokenMutations';
import type { CoverageMap, CoverageToken, AutoFillPendingItem, AutoFillPreview } from '../components/themeManagerTypes';

function createAutoFillPendingItem(path: string, type: string | undefined, value: unknown): AutoFillPendingItem {
  const body = createTokenValueBody({ type, value });
  return {
    path,
    $value: body.$value,
    ...(body.$type ? { $type: body.$type } : {}),
  };
}

export interface UseThemeAutoFillParams {
  serverUrl: string;
  dimensions: ThemeDimension[];
  coverage: CoverageMap;
  debouncedFetchDimensions: () => void;
  setError: (msg: string | null) => void;
  onSuccess?: (message: string) => void;
}

export function useThemeAutoFill({
  serverUrl,
  dimensions,
  coverage,
  debouncedFetchDimensions,
  setError,
  onSuccess,
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
      await createToken(serverUrl, targetSet, item.missingRef, createTokenValueBody({
        type: item.fillType,
        value: item.fillValue,
      }));
      debouncedFetchDimensions();
      onSuccess?.(`Auto-filled token "${item.missingRef}" in "${targetSet}"`);
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
    const tokens: AutoFillPendingItem[] = [];
    for (const item of fillable) {
      if (!item.missingRef || seen.has(item.missingRef)) continue;
      seen.add(item.missingRef);
      tokens.push(createAutoFillPendingItem(item.missingRef, item.fillType, item.fillValue));
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
      onSuccess?.(`Auto-filled ${tokens.length} token${tokens.length !== 1 ? 's' : ''} in "${targetSet}"`);
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

    const perSetBatch: Record<string, AutoFillPendingItem[]> = {};
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
        perSetBatch[targetSet].push(createAutoFillPendingItem(item.missingRef, item.fillType, item.fillValue));
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
      onSuccess?.(`Auto-filled ${preview.totalCount} token${preview.totalCount !== 1 ? 's' : ''} across ${Object.keys(perSetBatch).length} set${Object.keys(perSetBatch).length !== 1 ? 's' : ''}`);
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
