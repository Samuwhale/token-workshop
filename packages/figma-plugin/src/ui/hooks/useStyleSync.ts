import { useState, useCallback, useRef, useEffect } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { describeError } from '../shared/utils';

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

export function useStyleSync({ serverUrl, activeSet }: UseStyleSyncOptions) {
  const [styleRows, setStyleRows] = useState<StyleDiffRow[]>([]);
  const [styleDirs, setStyleDirs] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleSyncing, setStyleSyncing] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [styleChecked, setStyleChecked] = useState(false);
  const styleReadResolveRef = useRef<((tokens: any[]) => void) | null>(null);
  const styleApplyResolveRef = useRef<((result: { count: number; total: number; failures: { path: string; error: string }[] }) => void) | null>(null);

  // Message handler for style reads
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'styles-read' && styleReadResolveRef.current) {
        styleReadResolveRef.current(msg.tokens ?? []);
        styleReadResolveRef.current = null;
      }
      if (msg?.type === 'styles-read-error') {
        setStyleError(`Read styles failed: ${msg.error ?? 'Unknown error'}`);
        setStyleLoading(false);
        styleReadResolveRef.current = null;
      }
      if (msg?.type === 'styles-apply-error') {
        setStyleError(`Apply styles failed: ${msg.error ?? 'Unknown error'}`);
        setStyleSyncing(false);
      }
      if (msg?.type === 'styles-applied') {
        if (styleApplyResolveRef.current) {
          styleApplyResolveRef.current({
            count: msg.count ?? 0,
            total: msg.total ?? msg.count ?? 0,
            failures: msg.failures ?? [],
          });
          styleApplyResolveRef.current = null;
        }
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
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          styleReadResolveRef.current = null;
          reject(new Error('Figma read timed out \u2014 is the plugin running?'));
        }, 10000);
        styleReadResolveRef.current = (tokens) => {
          clearTimeout(timeout);
          resolve(tokens);
        };
        parent.postMessage({ pluginMessage: { type: 'read-styles' } }, '*');
      });

      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      if (!res.ok) throw new Error('Could not fetch local tokens');
      const data = await res.json();
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
  }, [serverUrl, activeSet]);

  const applyStyleDiff = useCallback(async () => {
    const dirsSnapshot = styleDirs;
    const rowsSnapshot = styleRows;
    setStyleSyncing(true);
    setStyleError(null);
    try {
      const pushRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'push');
      const pullRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'pull');

      let pushResult: { count: number; total: number; failures: { path: string; error: string }[] } | null = null;

      if (pushRows.length > 0) {
        const tokens = pushRows.map(r => ({
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localRaw,
        }));
        pushResult = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            styleApplyResolveRef.current = null;
            reject(new Error('Style apply timed out — is the plugin running?'));
          }, 15000);
          styleApplyResolveRef.current = (result) => {
            clearTimeout(timeout);
            resolve(result);
          };
          parent.postMessage({ pluginMessage: { type: 'apply-styles', tokens } }, '*');
        });
      }

      const pullFailures: { path: string; error: string }[] = [];
      if (pullRows.length > 0) {
        const results = await Promise.all(pullRows.map(async (r) => {
          try {
            const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${r.path.split('.').map(encodeURIComponent).join('/')}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: r.figmaType ?? 'string', $value: r.figmaRaw }),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => res.statusText);
              return { path: r.path, error: `${res.status}: ${text}` };
            }
            return null;
          } catch (err) {
            return { path: r.path, error: err instanceof Error ? err.message : String(err) };
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
    }
  }, [serverUrl, activeSet, styleRows, styleDirs]);

  const styleSyncCount = Object.values(styleDirs).filter(d => d !== 'skip').length;
  const stylePushCount = Object.values(styleDirs).filter(d => d === 'push').length;
  const stylePullCount = Object.values(styleDirs).filter(d => d === 'pull').length;

  return {
    styleRows,
    styleDirs,
    setStyleDirs,
    styleLoading,
    styleSyncing,
    styleError,
    styleChecked,
    computeStyleDiff,
    applyStyleDiff,
    styleSyncCount,
    stylePushCount,
    stylePullCount,
  };
}
