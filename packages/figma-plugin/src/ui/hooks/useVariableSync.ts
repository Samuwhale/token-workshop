import { useEffect, useCallback, useMemo, useState } from 'react';
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

// Opaque snapshot type — round-tripped from plugin to UI and back for revert.
export type VarSyncSnapshot = {
  records: Record<string, any>;
  createdIds: string[];
};

const extractVarApplyResult = (msg: any): { count: number; total: number; failures: { path: string; error: string }[]; created?: number; overwritten?: number; varSnapshot?: VarSyncSnapshot } => ({
  ...extractSyncApplyResult(msg),
  varSnapshot: msg.varSnapshot ?? undefined,
});

export function useVariableSync({ serverUrl, connected, activeSet, collectionMap, modeMap }: UseVariableSyncOptions) {
  const [varSnapshot, setVarSnapshot] = useState<VarSyncSnapshot | null>(null);
  const [varReverting, setVarReverting] = useState(false);
  const [varRevertError, setVarRevertError] = useState<string | null>(null);

  const sendReadVariables = useFigmaMessage<any[]>({
    responseType: 'variables-read',
    timeout: 10000,
    extractResponse: extractCollections,
  });

  const sendVarApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[]; created?: number; overwritten?: number; varSnapshot?: VarSyncSnapshot }>({
    responseType: 'variables-applied',
    errorType: 'apply-variables-error',
    timeout: 30000,
    extractResponse: extractVarApplyResult,
  });

  const sendVarRevert = useFigmaMessage<{ failures: string[] }>({
    responseType: 'variables-reverted',
    timeout: 30000,
    extractResponse: (msg: any) => ({ failures: msg.failures ?? [] }),
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
      // Store snapshot so the user can revert this sync
      if (result.varSnapshot) {
        setVarSnapshot(result.varSnapshot);
        setVarRevertError(null);
      }
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

  const revertVarSync = useCallback(async () => {
    if (!varSnapshot) return;
    setVarReverting(true);
    setVarRevertError(null);
    try {
      const result = await sendVarRevert('revert-variables', { varSnapshot });
      if (result.failures.length > 0) {
        setVarRevertError(`Revert completed with ${result.failures.length} issue(s): ${result.failures.slice(0, 3).join('; ')}`);
      } else {
        setVarSnapshot(null);
        parent.postMessage({ pluginMessage: { type: 'notify', message: 'Variable sync reverted' } }, '*');
      }
    } catch (err) {
      setVarRevertError(err instanceof Error ? err.message : 'Failed to revert variable sync');
    } finally {
      setVarReverting(false);
    }
  }, [varSnapshot, sendVarRevert]);

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
    varSnapshot,
    varReverting,
    varRevertError,
    revertVarSync,
  };
}
