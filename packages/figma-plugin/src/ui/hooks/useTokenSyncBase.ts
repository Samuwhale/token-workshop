import { useState, useEffect, useCallback, useRef } from 'react';
import { flattenTokenGroup, type DTCGToken } from '@tokenmanager/core';
import { describeError, tokenPathToUrlSegment } from '../shared/utils';
import { apiFetch, ApiError, createFetchSignal } from '../shared/apiFetch';

// ── Shared helpers ──

/**
 * Extract the standard `{ count, total, failures, skipped }` shape from a Figma apply response message.
 * All three sync hooks (style, variable, figma-group) share this response shape.
 */
export const extractSyncApplyResult = (msg: any): {
  count: number;
  total: number;
  failures: { path: string; error: string }[];
  skipped: Array<{ path: string; $type: string }>;
} => ({
  count: msg.count ?? 0,
  total: msg.total ?? msg.count ?? 0,
  failures: msg.failures ?? [],
  skipped: msg.skipped ?? [],
});

// ── Shared types ──

export interface SyncProgress {
  current: number;
  total: number;
}

export interface DiffRowBase {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localType?: string;
  figmaType?: string;
}

// ── Configuration callbacks ──

export interface TokenSyncConfig<TRow extends DiffRowBase> {
  /** Plugin message type that reports incremental progress (e.g. 'variable-sync-progress') */
  progressEventType: string;

  /** Fetch tokens from Figma via postMessage round-trip */
  readFigmaTokens: () => Promise<any[]>;

  /**
   * Build a map from Figma token array.
   * Key = token path, Value = arbitrary entry used by buildRow/isConflict.
   */
  buildFigmaMap: (tokens: any[]) => Map<string, any>;

  /**
   * Build a map from local (server) flattened tokens.
   * Key = token path, Value = arbitrary entry used by buildRow/isConflict.
   */
  buildLocalMap: (tokens: Map<string, DTCGToken>) => Map<string, any>;

  /** Create a diff row for a token that exists only locally */
  buildLocalOnlyRow: (path: string, local: any) => TRow;

  /** Create a diff row for a token that exists only in Figma */
  buildFigmaOnlyRow: (path: string, figma: any) => TRow;

  /** Create a diff row for a conflicting token */
  buildConflictRow: (path: string, local: any, figma: any) => TRow;

  /** Return true when local and figma entries differ */
  isConflict: (local: any, figma: any) => boolean;

  /**
   * Execute push (local → Figma).
   * Return an object with failures, or null if no push was performed.
   * Progress for push is typically reported by the plugin sandbox.
   */
  executePush: (rows: TRow[]) => Promise<{ failures: { path: string; error: string }[] } | null>;

  /** Build the PATCH body for a single pull (Figma → local) row */
  buildPullPayload: (row: TRow) => { $type: string; $value: any };

  /** Toast message shown on full success */
  successMessage: string;

  /** Error context labels */
  compareErrorLabel: string;
  applyErrorLabel: string;
}

// ── Return type ──

export interface TokenSyncReturn<TRow extends DiffRowBase> {
  rows: TRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
  setDirs: React.Dispatch<React.SetStateAction<Record<string, 'push' | 'pull' | 'skip'>>>;
  loading: boolean;
  syncing: boolean;
  progress: SyncProgress | null;
  error: string | null;
  checked: boolean;
  computeDiff: () => Promise<void>;
  applyDiff: () => Promise<void>;
  syncCount: number;
  pushCount: number;
  pullCount: number;
}

// ── Hook ──

export function useTokenSyncBase<TRow extends DiffRowBase>(
  serverUrl: string,
  activeSet: string,
  config: TokenSyncConfig<TRow>,
): TokenSyncReturn<TRow> {
  const [rows, setRows] = useState<TRow[]>([]);
  const [dirs, setDirs] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const progressRef = useRef<SyncProgress | null>(null);

  // Keep config in a ref so the effect and callbacks don't re-register on every render
  const configRef = useRef(config);
  configRef.current = config;

  // Keep rows/dirs in refs so applyDiff always reads current values without
  // needing them in its dependency array (which would recreate the callback
  // on every user interaction with the direction selectors).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;

  // Listen for incremental progress messages from the plugin sandbox
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === configRef.current.progressEventType) {
        const p = { current: msg.current as number, total: msg.total as number };
        progressRef.current = p;
        setProgress(p);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const computeDiff = useCallback(async () => {
    if (!activeSet) return;
    const cfg = configRef.current;
    setLoading(true);
    setError(null);
    setChecked(false);
    try {
      const figmaTokens = await cfg.readFigmaTokens();

      const data = await apiFetch<{ tokens?: Record<string, unknown> }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`,
        { signal: createFetchSignal() },
      );
      const localTokens = flattenTokenGroup(data.tokens || {});

      const figmaMap = cfg.buildFigmaMap(figmaTokens);
      const localMap = cfg.buildLocalMap(localTokens);

      const newRows: TRow[] = [];
      for (const [path, local] of localMap) {
        const figma = figmaMap.get(path);
        if (!figma) {
          newRows.push(cfg.buildLocalOnlyRow(path, local));
        } else if (cfg.isConflict(local, figma)) {
          newRows.push(cfg.buildConflictRow(path, local, figma));
        }
      }
      for (const [path, figma] of figmaMap) {
        if (!localMap.has(path)) {
          newRows.push(cfg.buildFigmaOnlyRow(path, figma));
        }
      }

      setRows(newRows);
      setChecked(true);
      const newDirs: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const r of newRows) {
        newDirs[r.path] = r.cat === 'figma-only' ? 'pull' : 'push';
      }
      setDirs(newDirs);
    } catch (err) {
      setError(describeError(err, cfg.compareErrorLabel));
    } finally {
      setLoading(false);
    }
  }, [serverUrl, activeSet]);

  const applyDiff = useCallback(async () => {
    const cfg = configRef.current;
    const dirsSnapshot = dirsRef.current;
    const rowsSnapshot = rowsRef.current;
    setSyncing(true);
    setError(null);
    setProgress(null);
    progressRef.current = null;
    try {
      const pushRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'push');
      const pullRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'pull');
      const totalOps = pushRows.length + pullRows.length;

      // Execute push (local → Figma)
      const pushResult = pushRows.length > 0 ? await cfg.executePush(pushRows) : null;

      // Execute pull (Figma → local) via server PATCH
      const pullFailures: { path: string; error: string }[] = [];
      if (pullRows.length > 0) {
        let pullDone = 0;
        const pullBase = pushRows.length;
        const results = await Promise.all(pullRows.map(async (r) => {
          try {
            const payload = cfg.buildPullPayload(r);
            await apiFetch(
              `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${tokenPathToUrlSegment(r.path)}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: createFetchSignal(undefined, 10000),
              },
            );
            return null;
          } catch (err) {
            const msg = err instanceof ApiError
              ? `${err.status}: ${err.message}`
              : (err instanceof Error ? err.message : String(err));
            return { path: r.path, error: msg };
          } finally {
            pullDone++;
            setProgress({ current: pullBase + pullDone, total: totalOps });
          }
        }));
        for (const f of results) {
          if (f) pullFailures.push(f);
        }
      }

      setChecked(true);

      // Report errors or show success toast
      const pushFailed = pushResult ? pushResult.failures.length : 0;
      if (pushFailed > 0 || pullFailures.length > 0) {
        // Keep only the failed rows visible so the user can see what failed
        // (successfully applied rows are removed from the list)
        const failedPaths = new Set([
          ...(pushResult?.failures.map(f => f.path) ?? []),
          ...pullFailures.map(f => f.path),
        ]);
        setRows(rowsSnapshot.filter(r => failedPaths.has(r.path)));
        const failedDirs: Record<string, 'push' | 'pull' | 'skip'> = {};
        for (const path of failedPaths) {
          if (dirsSnapshot[path]) failedDirs[path] = dirsSnapshot[path];
        }
        setDirs(failedDirs);

        const parts: string[] = [];
        if (pushResult && pushFailed > 0) {
          parts.push(`Push: ${pushRows.length - pushFailed}/${pushRows.length} applied (failed: ${pushResult.failures.map(f => f.path).join(', ')})`);
        }
        if (pullFailures.length > 0) {
          const pullOk = pullRows.length - pullFailures.length;
          parts.push(`Pull: ${pullOk}/${pullRows.length} applied (failed: ${pullFailures.map(f => f.path).join(', ')})`);
        }
        setError(parts.join('. '));
      } else {
        setRows([]);
        setDirs({});
        parent.postMessage({ pluginMessage: { type: 'notify', message: cfg.successMessage } }, '*');
      }
    } catch (err) {
      setError(describeError(err, cfg.applyErrorLabel));
    } finally {
      setSyncing(false);
      setProgress(null);
      progressRef.current = null;
    }
  }, [serverUrl, activeSet]);

  const syncCount = Object.values(dirs).filter(d => d !== 'skip').length;
  const pushCount = Object.values(dirs).filter(d => d === 'push').length;
  const pullCount = Object.values(dirs).filter(d => d === 'pull').length;

  return {
    rows,
    dirs,
    setDirs,
    loading,
    syncing,
    progress,
    error,
    checked,
    computeDiff,
    applyDiff,
    syncCount,
    pushCount,
    pullCount,
  };
}
