import { useEffect, useCallback, useMemo } from 'react';
import { useFigmaMessage } from './useFigmaMessage';
import { useTokenSyncBase, extractSyncApplyResult, type SyncProgress, type DiffRowBase } from './useTokenSyncBase';

export type { SyncProgress };

export interface VarDiffRow extends DiffRowBase {
  localValue?: string;
  figmaValue?: string;
}

interface UseVariableSyncOptions {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
}

const extractCollections = (msg: any): any[] => msg.collections ?? [];

export function useVariableSync({ serverUrl, connected, activeSet, collectionMap, modeMap }: UseVariableSyncOptions) {
  const sendReadVariables = useFigmaMessage<any[]>({
    responseType: 'variables-read',
    timeout: 10000,
    extractResponse: extractCollections,
  });

  const sendVarApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[]; created?: number; overwritten?: number }>({
    responseType: 'variables-applied',
    errorType: 'apply-variables-error',
    timeout: 30000,
    extractResponse: extractSyncApplyResult,
  });

  const readFigmaVariables = useCallback(
    () => sendReadVariables('read-variables'),
    [sendReadVariables],
  );

  const config = useMemo(() => ({
    progressEventType: 'variable-sync-progress',
    readFigmaTokens: readFigmaVariables,

    buildFigmaMap: (tokens: any[]) =>
      new Map(tokens.map(t => [t.path, { value: String(t.$value ?? ''), type: String(t.$type ?? 'string') }])),

    buildLocalMap: (tokens: Map<string, any>) => {
      const m = new Map<string, { value: string; type: string }>();
      for (const [path, token] of tokens) {
        m.set(path, { value: String(token.$value), type: String(token.$type ?? 'string') });
      }
      return m;
    },

    buildLocalOnlyRow: (path: string, local: { value: string; type: string }): VarDiffRow =>
      ({ path, cat: 'local-only', localValue: local.value, localType: local.type }),

    buildFigmaOnlyRow: (path: string, figma: { value: string; type: string }): VarDiffRow =>
      ({ path, cat: 'figma-only', figmaValue: figma.value, figmaType: figma.type }),

    buildConflictRow: (path: string, local: { value: string; type: string }, figma: { value: string; type: string }): VarDiffRow =>
      ({ path, cat: 'conflict', localValue: local.value, figmaValue: figma.value, localType: local.type, figmaType: figma.type }),

    isConflict: (local: { value: string }, figma: { value: string }) =>
      figma.value !== local.value,

    executePush: async (rows: VarDiffRow[]) => {
      const tokens = rows.map(r => ({
        path: r.path,
        $type: r.localType ?? 'string',
        $value: r.localValue ?? '',
        setName: activeSet,
      }));
      const result = await sendVarApply('apply-variables', { tokens, collectionMap, modeMap });
      // Surface overwrite count so the caller can include it in success feedback
      if ((result.overwritten ?? 0) > 0) {
        parent.postMessage({
          pluginMessage: {
            type: 'notify',
            message: `Variables synced — ${result.created ?? 0} created, ${result.overwritten} updated`,
          },
        }, '*');
      }
      return { failures: result.failures };
    },

    buildPullPayload: (row: VarDiffRow) => ({
      $type: row.figmaType ?? 'string',
      $value: row.figmaValue ?? '',
    }),

    successMessage: 'Variable sync applied',
    compareErrorLabel: 'Compare variables',
    applyErrorLabel: 'Apply variable sync',
  }), [readFigmaVariables, sendVarApply, activeSet, collectionMap, modeMap]);

  const base = useTokenSyncBase<VarDiffRow>(serverUrl, activeSet, config);

  // Auto-compute on connect / set change
  useEffect(() => {
    if (connected && activeSet) base.computeDiff();
  }, [connected, activeSet, base.computeDiff]);

  // Re-export with the original property names for backward compat in PublishPanel
  return {
    varRows: base.rows,
    varDirs: base.dirs,
    setVarDirs: base.setDirs,
    varLoading: base.loading,
    varSyncing: base.syncing,
    varProgress: base.progress,
    varError: base.error,
    varChecked: base.checked,
    computeVarDiff: base.computeDiff,
    applyVarDiff: base.applyDiff,
    varSyncCount: base.syncCount,
    varPushCount: base.pushCount,
    varPullCount: base.pullCount,
    readFigmaVariables,
  };
}
