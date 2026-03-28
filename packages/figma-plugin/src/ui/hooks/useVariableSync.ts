import { useState, useEffect, useCallback, useRef } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { describeError } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';

export interface VarDiffRow {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
}

interface UseVariableSyncOptions {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
}

export function useVariableSync({ serverUrl, connected, activeSet, collectionMap, modeMap }: UseVariableSyncOptions) {
  const [varRows, setVarRows] = useState<VarDiffRow[]>([]);
  const [varDirs, setVarDirs] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [varLoading, setVarLoading] = useState(false);
  const [varSyncing, setVarSyncing] = useState(false);
  const [varError, setVarError] = useState<string | null>(null);
  const [varChecked, setVarChecked] = useState(false);
  const varPendingRef = useRef<Map<string, (tokens: any[]) => void>>(new Map());

  const readFigmaVariables = useCallback((): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const cid = `publish-${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        varPendingRef.current.delete(cid);
        reject(new Error('Figma read timed out \u2014 is the plugin running?'));
      }, 10000);
      varPendingRef.current.set(cid, (tokens) => {
        clearTimeout(timeout);
        resolve(tokens);
      });
      parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
    });
  }, []);

  const computeVarDiff = useCallback(async () => {
    if (!activeSet) return;
    setVarLoading(true);
    setVarError(null);
    setVarChecked(false);
    try {
      const figmaTokens = await readFigmaVariables();

      const data = await apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      const localTokens = flattenTokenGroup(data.tokens || {});

      const figmaMap = new Map<string, { value: string; type: string }>(
        figmaTokens.map(t => [t.path, { value: String(t.$value ?? ''), type: String(t.$type ?? 'string') }])
      );
      const localMap = new Map<string, { value: string; type: string }>();
      for (const [path, token] of localTokens) {
        localMap.set(path, { value: String(token.$value), type: String(token.$type ?? 'string') });
      }

      const rows: VarDiffRow[] = [];
      for (const [path, local] of localMap) {
        const figma = figmaMap.get(path);
        if (!figma) {
          rows.push({ path, cat: 'local-only', localValue: local.value, localType: local.type });
        } else if (figma.value !== local.value) {
          rows.push({ path, cat: 'conflict', localValue: local.value, figmaValue: figma.value, localType: local.type, figmaType: figma.type });
        }
      }
      for (const [path, figma] of figmaMap) {
        if (!localMap.has(path)) {
          rows.push({ path, cat: 'figma-only', figmaValue: figma.value, figmaType: figma.type });
        }
      }

      setVarRows(rows);
      setVarChecked(true);
      const dirs: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const r of rows) {
        dirs[r.path] = r.cat === 'figma-only' ? 'pull' : 'push';
      }
      setVarDirs(dirs);
    } catch (err) {
      setVarError(describeError(err, 'Compare variables'));
    } finally {
      setVarLoading(false);
    }
  }, [serverUrl, activeSet, readFigmaVariables]);

  useEffect(() => {
    if (connected && activeSet) computeVarDiff();
  }, [connected, activeSet, computeVarDiff]);

  // Message handler for variable reads
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variables-read' && msg.correlationId) {
        const resolve = varPendingRef.current.get(msg.correlationId);
        if (resolve) {
          varPendingRef.current.delete(msg.correlationId);
          resolve(msg.tokens ?? []);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const applyVarDiff = useCallback(async () => {
    const dirsSnapshot = varDirs;
    const rowsSnapshot = varRows;
    setVarSyncing(true);
    setVarError(null);
    try {
      const pushRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'push');
      const pullRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'pull');

      if (pushRows.length > 0) {
        const tokens = pushRows.map(r => ({
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localValue ?? '',
          setName: activeSet,
        }));
        parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap } }, '*');
      }

      const pullFailures: { path: string; error: string }[] = [];
      if (pullRows.length > 0) {
        const results = await Promise.all(pullRows.map(async (r) => {
          try {
            await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${r.path.split('.').map(encodeURIComponent).join('/')}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: r.figmaType ?? 'string', $value: r.figmaValue ?? '' }),
            });
            return null;
          } catch (err) {
            const msg = err instanceof ApiError ? `${err.status}: ${err.message}` : (err instanceof Error ? err.message : String(err));
            return { path: r.path, error: msg };
          }
        }));
        for (const f of results) {
          if (f) pullFailures.push(f);
        }
      }

      setVarRows([]);
      setVarDirs({});
      setVarChecked(true);

      if (pullFailures.length > 0) {
        const ok = pullRows.length - pullFailures.length;
        setVarError(`Pull: ${ok}/${pullRows.length} applied (failed: ${pullFailures.map(f => f.path).join(', ')})`);
      } else {
        parent.postMessage({ pluginMessage: { type: 'notify', message: 'Variable sync applied' } }, '*');
      }
    } catch (err) {
      setVarError(describeError(err, 'Apply variable sync'));
    } finally {
      setVarSyncing(false);
    }
  }, [serverUrl, activeSet, varRows, varDirs, collectionMap, modeMap]);

  const varSyncCount = Object.values(varDirs).filter(d => d !== 'skip').length;
  const varPushCount = Object.values(varDirs).filter(d => d === 'push').length;
  const varPullCount = Object.values(varDirs).filter(d => d === 'pull').length;

  return {
    varRows,
    varDirs,
    setVarDirs,
    varLoading,
    varSyncing,
    varError,
    varChecked,
    computeVarDiff,
    applyVarDiff,
    varSyncCount,
    varPushCount,
    varPullCount,
    readFigmaVariables,
    varPendingRef,
  };
}
