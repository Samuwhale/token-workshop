import { useState, useMemo } from 'react';
import type { ThemeDimension, ThemeOption } from '@tokenmanager/core';

export interface UseThemeCompareParams {
  dimensions: ThemeDimension[];
  setTokenValues: Record<string, Record<string, any>>;
}

export function useThemeCompare({ dimensions, setTokenValues }: UseThemeCompareParams) {
  const [showCompare, setShowCompare] = useState(false);
  const [compareOptA, setCompareOptA] = useState<{ dimId: string; optionName: string } | null>(null);
  const [compareOptB, setCompareOptB] = useState<{ dimId: string; optionName: string } | null>(null);
  const [compareSearch, setCompareSearch] = useState('');
  const [compareDiffsOnly, setCompareDiffsOnly] = useState(true);

  const compareRows = useMemo(() => {
    if (!showCompare || !compareOptA || !compareOptB) return [];
    const dimA = dimensions.find(d => d.id === compareOptA.dimId);
    const dimB = dimensions.find(d => d.id === compareOptB.dimId);
    const optA = dimA?.options.find(o => o.name === compareOptA.optionName);
    const optB = dimB?.options.find(o => o.name === compareOptB.optionName);
    if (!optA || !optB) return [];

    const resolveForOpt = (opt: ThemeOption): Record<string, any> => {
      const merged: Record<string, any> = {};
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'source') Object.assign(merged, setTokenValues[s] ?? {});
      }
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'enabled') Object.assign(merged, setTokenValues[s] ?? {});
      }
      const resolve = (v: any, depth = 0): any => {
        if (depth > 10 || typeof v !== 'string') return v;
        const m = /^\{([^}]+)\}$/.exec(v);
        if (!m) return v;
        const t = m[1];
        return t in merged ? resolve(merged[t], depth + 1) : v;
      };
      const out: Record<string, any> = {};
      for (const [p, v] of Object.entries(merged)) out[p] = resolve(v);
      return out;
    };

    const tokensA = resolveForOpt(optA);
    const tokensB = resolveForOpt(optB);
    const allPaths = new Set([...Object.keys(tokensA), ...Object.keys(tokensB)]);

    const rows: Array<{ path: string; a: any; b: any; isDiff: boolean }> = [];
    for (const path of allPaths) {
      const a = tokensA[path];
      const b = tokensB[path];
      const isDiff = JSON.stringify(a) !== JSON.stringify(b);
      rows.push({ path, a, b, isDiff });
    }

    rows.sort((x, y) => {
      if (x.isDiff !== y.isDiff) return x.isDiff ? -1 : 1;
      return x.path.localeCompare(y.path);
    });

    let result = rows;
    if (compareDiffsOnly) result = rows.filter(r => r.isDiff);
    if (compareSearch) {
      const term = compareSearch.toLowerCase();
      result = result.filter(r =>
        r.path.toLowerCase().includes(term) ||
        String(r.a ?? '').toLowerCase().includes(term) ||
        String(r.b ?? '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [showCompare, compareOptA, compareOptB, dimensions, setTokenValues, compareDiffsOnly, compareSearch]);

  return {
    showCompare,
    setShowCompare,
    compareOptA,
    setCompareOptA,
    compareOptB,
    setCompareOptB,
    compareSearch,
    setCompareSearch,
    compareDiffsOnly,
    setCompareDiffsOnly,
    compareRows,
  };
}
