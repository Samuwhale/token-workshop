import { useState, useEffect, useCallback } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { describeError } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { useFigmaMessage } from './useFigmaMessage';
import type { SyncProgress } from './useVariableSync';

const STYLE_TYPES = new Set(['color', 'typography', 'shadow']);

function summarizeStyleValue(value: any, type: string): string {
  if (type === 'color') return String(value);
  if (type === 'typography' && value && typeof value === 'object') {
    const family = Array.isArray(value.fontFamily) ? value.fontFamily[0] : value.fontFamily;
    const size = typeof value.fontSize === 'object'
      ? `${value.fontSize.value}${value.fontSize.unit}`
      : String(value.fontSize ?? '');
    return `${family ?? ''}${size ? ' ' + size : ''}`.trim() || JSON.stringify(value).slice(0, 28);
  }
  if (type === 'shadow') {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((s: any) => s?.color ?? '').join(', ').slice(0, 28);
  }
  return JSON.stringify(value).slice(0, 28);
}

export interface StyleDiffRow {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;
  figmaValue?: string;
  localRaw?: any;
  figmaRaw?: any;
  localType?: string;
  figmaType?: string;
}

interface UseStyleSyncOptions {
  serverUrl: string;
  activeSet: string;
}

const extractStyleReadTokens = (msg: any): any[] => msg.tokens ?? [];

const extractStyleApplyResult = (msg: any): { count: number; total: number; failures: { path: string; error: string }[] } => ({
  count: msg.count ?? 0,
  total: msg.total ?? msg.count ?? 0,
  failures: msg.failures ?? [],
});

export function useStyleSync({ serverUrl, activeSet }: UseStyleSyncOptions) {
  const [styleRows, setStyleRows] = useState<StyleDiffRow[]>([]);
  const [styleDirs, setStyleDirs] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleSyncing, setStyleSyncing] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [styleChecked, setStyleChecked] = useState(false);
  const [styleProgress, setStyleProgress] = useState<SyncProgress | null>(null);

  const sendStyleRead = useFigmaMessage<any[]>({
    responseType: 'styles-read',
    errorType: 'styles-read-error',
    timeout: 10000,
    extractResponse: extractStyleReadTokens,
  });

  const sendStyleApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[] }>({
    responseType: 'styles-applied',
    errorType: 'styles-apply-error',
    timeout: 15000,
    extractResponse: extractStyleApplyResult,
  });

  // Listen for incremental progress messages from the plugin sandbox
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'style-sync-progress') {
        setStyleProgress({ current: msg.current as number, total: msg.total as number });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const computeStyleDiff = useCallback(async () => {
    if (!activeSet) return;
    setStyleLoading(true);
    setStyleError(null);
    setStyleChecked(false);
    try {
      const figmaTokens = await sendStyleRead('read-styles');

      const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      const localTokens = flattenTokenGroup(data.tokens || {});

      const figmaMap = new Map<string, { raw: any; type: string }>(
        figmaTokens.map(t => [t.path, { raw: t.$value, type: String(t.$type ?? 'string') }])
      );
      const localMap = new Map<string, { raw: any; type: string }>();
      for (const [path, token] of localTokens) {
        const type = String(token.$type ?? 'string');
        if (STYLE_TYPES.has(type)) {
          localMap.set(path, { raw: token.$value, type });
        }
      }

      const rows: StyleDiffRow[] = [];
      for (const [path, local] of localMap) {
        const figmaEntry = figmaMap.get(path);
        if (!figmaEntry) {
          rows.push({ path, cat: 'local-only', localRaw: local.raw, localValue: summarizeStyleValue(local.raw, local.type), localType: local.type });
        } else if (JSON.stringify(figmaEntry.raw) !== JSON.stringify(local.raw)) {
          rows.push({ path, cat: 'conflict', localRaw: local.raw, figmaRaw: figmaEntry.raw, localValue: summarizeStyleValue(local.raw, local.type), figmaValue: summarizeStyleValue(figmaEntry.raw, figmaEntry.type), localType: local.type, figmaType: figmaEntry.type });
        }
      }
      for (const [path, figmaEntry] of figmaMap) {
        if (!localMap.has(path)) {
          rows.push({ path, cat: 'figma-only', figmaRaw: figmaEntry.raw, figmaValue: summarizeStyleValue(figmaEntry.raw, figmaEntry.type), figmaType: figmaEntry.type });
        }
      }

      setStyleRows(rows);
      setStyleChecked(true);
      const dirs: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const r of rows) {
        dirs[r.path] = r.cat === 'figma-only' ? 'pull' : 'push';
      }
      setStyleDirs(dirs);
    } catch (err) {
      setStyleError(describeError(err, 'Compare styles'));
    } finally {
      setStyleLoading(false);
    }
  }, [serverUrl, activeSet, sendStyleRead]);

  const applyStyleDiff = useCallback(async () => {
    const dirsSnapshot = styleDirs;
    const rowsSnapshot = styleRows;
    setStyleSyncing(true);
    setStyleError(null);
    setStyleProgress(null);
    try {
      const pushRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'push');
      const pullRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'pull');
      const totalOps = pushRows.length + pullRows.length;

      let pushResult: { count: number; total: number; failures: { path: string; error: string }[] } | null = null;

      if (pushRows.length > 0) {
        const tokens = pushRows.map(r => ({
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localRaw,
        }));
        pushResult = await sendStyleApply('apply-styles', { tokens });
      }

      const pullFailures: { path: string; error: string }[] = [];
      if (pullRows.length > 0) {
        let pullDone = 0;
        const pullBase = pushRows.length;
        const results = await Promise.all(pullRows.map(async (r) => {
          try {
            await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${r.path.split('.').map(encodeURIComponent).join('/')}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: r.figmaType ?? 'string', $value: r.figmaRaw }),
            });
            return null;
          } catch (err) {
            const msg = err instanceof ApiError ? `${err.status}: ${err.message}` : (err instanceof Error ? err.message : String(err));
            return { path: r.path, error: msg };
          } finally {
            pullDone++;
            setStyleProgress({ current: pullBase + pullDone, total: totalOps });
          }
        }));
        for (const f of results) {
          if (f) pullFailures.push(f);
        }
      }

      setStyleRows([]);
      setStyleDirs({});
      setStyleChecked(true);

      const pushFailed = pushResult ? pushResult.failures.length : 0;
      if (pushFailed > 0 || pullFailures.length > 0) {
        const parts: string[] = [];
        if (pushResult && pushFailed > 0) {
          parts.push(`Push: ${pushResult.count}/${pushResult.total} applied (failed: ${pushResult.failures.map(f => f.path).join(', ')})`);
        }
        if (pullFailures.length > 0) {
          const pullOk = pullRows.length - pullFailures.length;
          parts.push(`Pull: ${pullOk}/${pullRows.length} applied (failed: ${pullFailures.map(f => f.path).join(', ')})`);
        }
        setStyleError(parts.join('. '));
      } else {
        parent.postMessage({ pluginMessage: { type: 'notify', message: 'Style sync applied' } }, '*');
      }
    } catch (err) {
      setStyleError(describeError(err, 'Apply style sync'));
    } finally {
      setStyleSyncing(false);
      setStyleProgress(null);
    }
  }, [serverUrl, activeSet, styleRows, styleDirs, sendStyleApply]);

  const styleSyncCount = Object.values(styleDirs).filter(d => d !== 'skip').length;
  const stylePushCount = Object.values(styleDirs).filter(d => d === 'push').length;
  const stylePullCount = Object.values(styleDirs).filter(d => d === 'pull').length;

  return {
    styleRows,
    styleDirs,
    setStyleDirs,
    styleLoading,
    styleSyncing,
    styleProgress,
    styleError,
    styleChecked,
    computeStyleDiff,
    applyStyleDiff,
    styleSyncCount,
    stylePushCount,
    stylePullCount,
  };
}
