import { useMemo } from 'react';
import { useFigmaMessage } from './useFigmaMessage';
import { useTokenSyncBase, extractSyncApplyResult, type SyncProgress } from './useTokenSyncBase';
import type { DiffRowBase } from './useTokenSyncBase';

export type { SyncProgress };

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

export interface StyleDiffRow extends DiffRowBase {
  localValue?: string;
  figmaValue?: string;
  localRaw?: any;
  figmaRaw?: any;
}

interface UseStyleSyncOptions {
  serverUrl: string;
  activeSet: string;
}

const extractStyleReadTokens = (msg: any): any[] => msg.tokens ?? [];

export function useStyleSync({ serverUrl, activeSet }: UseStyleSyncOptions) {
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
    extractResponse: extractSyncApplyResult,
  });

  const config = useMemo(() => ({
    progressEventType: 'style-sync-progress',
    readFigmaTokens: () => sendStyleRead('read-styles'),

    buildFigmaMap: (tokens: any[]) =>
      new Map(tokens.map(t => [t.path, { raw: t.$value, type: String(t.$type ?? 'string') }])),

    buildLocalMap: (tokens: Map<string, any>) => {
      const m = new Map<string, { raw: any; type: string }>();
      for (const [path, token] of tokens) {
        const type = String(token.$type ?? 'string');
        if (STYLE_TYPES.has(type)) {
          m.set(path, { raw: token.$value, type });
        }
      }
      return m;
    },

    buildLocalOnlyRow: (path: string, local: { raw: any; type: string }): StyleDiffRow =>
      ({ path, cat: 'local-only', localRaw: local.raw, localValue: summarizeStyleValue(local.raw, local.type), localType: local.type }),

    buildFigmaOnlyRow: (path: string, figma: { raw: any; type: string }): StyleDiffRow =>
      ({ path, cat: 'figma-only', figmaRaw: figma.raw, figmaValue: summarizeStyleValue(figma.raw, figma.type), figmaType: figma.type }),

    buildConflictRow: (path: string, local: { raw: any; type: string }, figma: { raw: any; type: string }): StyleDiffRow =>
      ({ path, cat: 'conflict', localRaw: local.raw, figmaRaw: figma.raw, localValue: summarizeStyleValue(local.raw, local.type), figmaValue: summarizeStyleValue(figma.raw, figma.type), localType: local.type, figmaType: figma.type }),

    isConflict: (local: { raw: any }, figma: { raw: any }) =>
      JSON.stringify(figma.raw) !== JSON.stringify(local.raw),

    executePush: async (rows: StyleDiffRow[]) => {
      const tokens = rows.map(r => ({
        path: r.path,
        $type: r.localType ?? 'string',
        $value: r.localRaw,
      }));
      const result = await sendStyleApply('apply-styles', { tokens });
      return { failures: result.failures };
    },

    buildPullPayload: (row: StyleDiffRow) => ({
      $type: row.figmaType ?? 'string',
      $value: row.figmaRaw,
    }),

    successMessage: 'Style sync applied',
    compareErrorLabel: 'Compare styles',
    applyErrorLabel: 'Apply style sync',
  }), [sendStyleRead, sendStyleApply]);

  const base = useTokenSyncBase<StyleDiffRow>(serverUrl, activeSet, config);

  return {
    styleRows: base.rows,
    styleDirs: base.dirs,
    setStyleDirs: base.setDirs,
    styleLoading: base.loading,
    styleSyncing: base.syncing,
    styleProgress: base.progress,
    styleError: base.error,
    styleChecked: base.checked,
    computeStyleDiff: base.computeDiff,
    applyStyleDiff: base.applyDiff,
    styleSyncCount: base.syncCount,
    stylePushCount: base.pushCount,
    stylePullCount: base.pullCount,
  };
}
