import { useState, useEffect, useCallback, useRef } from 'react';
import { dispatchToast } from '../shared/toastBus';
import type { DTCGToken } from '@token-workshop/core';
import { describeError } from '../shared/utils';
import { apiFetch, ApiError, createFetchSignal } from '../shared/apiFetch';
import { getPluginMessageFromEvent } from '../../shared/utils';
import {
  getDiffRowId,
  loadSyncSnapshot,
  type DiffRowBase,
  type SyncApplyResultBase,
  type SyncFailure,
  type SyncDirection,
  type SyncSnapshot,
} from '../shared/syncWorkflow';

export type { DiffRowBase } from '../shared/syncWorkflow';

// ── Shared helpers ──

/**
 * Extract the standard `{ count, total, failures, skipped }` shape from a Figma apply response message.
 * All three sync hooks (style, variable, figma-group) share this response shape.
 */
export const extractSyncApplyResult = (msg: Partial<SyncApplyResultBase>): SyncApplyResultBase => ({
  count: msg.count ?? 0,
  total: msg.total ?? msg.count ?? 0,
  failures: msg.failures ?? [],
  skipped: msg.skipped ?? [],
});

export interface SyncProgress {
  current: number;
  total: number;
}

// ── Configuration callbacks ──

export interface TokenSyncConfig<
  TRow extends DiffRowBase,
  TLocal = unknown,
  TFigma = unknown,
> {
  /** Plugin message type that reports incremental progress (e.g. 'variable-sync-progress') */
  progressEventType: string;

  /** Fetch tokens from Figma via postMessage round-trip */
  readFigmaTokens: () => Promise<unknown[]>;

  /**
   * Build a map from Figma token array.
   * Key = token path, Value = arbitrary entry used by buildRow/isConflict.
   */
  buildFigmaMap: (tokens: unknown[]) => Map<string, TFigma>;

  /**
   * Build a map from local (server) flattened tokens.
   * Key = token path, Value = arbitrary entry used by buildRow/isConflict.
   */
  buildLocalMap: (tokens: Map<string, DTCGToken>) => Map<string, TLocal>;

  /** Create a diff row for a token that exists only locally */
  buildLocalOnlyRow: (path: string, local: TLocal) => TRow;

  /** Create a diff row for a token that exists only in Figma */
  buildFigmaOnlyRow: (path: string, figma: TFigma) => TRow;

  /** Create a diff row for a conflicting token */
  buildConflictRow: (path: string, local: TLocal, figma: TFigma) => TRow;

  /** Return true when local and figma entries differ */
  isConflict: (local: TLocal, figma: TFigma) => boolean;

  /** Optional custom snapshot loader for compare flows that do not map 1:1 to the active collection. */
  loadSnapshot?: (params: {
    serverUrl: string;
    currentCollectionId: string;
    signal?: AbortSignal;
    readFigmaTokens: () => Promise<unknown[]>;
  }) => Promise<SyncSnapshot<TLocal, TFigma, TRow>>;

  /**
   * Execute push (local → Figma).
   * Return an object with failures, or null if no push was performed.
   * Progress for push is typically reported by the plugin sandbox.
   */
  executePush: (rows: TRow[]) => Promise<{ failures: SyncFailure[] } | null>;

  /** Build the PATCH body for a single pull (Figma → local) row */
  buildPullPayload: (row: TRow) => { $type: string; $value: unknown };

  /** Toast message shown on full success */
  successMessage: string;

  /** Error context labels */
  compareErrorLabel: string;
  applyErrorLabel: string;
}

// ── Return type ──

export interface TokenSyncReturn<TRow extends DiffRowBase> {
  rows: TRow[];
  dirs: Record<string, SyncDirection>;
  setDirs: React.Dispatch<React.SetStateAction<Record<string, SyncDirection>>>;
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

export function useTokenSyncBase<
  TRow extends DiffRowBase,
  TLocal = unknown,
  TFigma = unknown,
>(
  serverUrl: string,
  currentCollectionId: string,
  config: TokenSyncConfig<TRow, TLocal, TFigma>,
): TokenSyncReturn<TRow> {
  const [rows, setRows] = useState<TRow[]>([]);
  const [dirs, setDirs] = useState<Record<string, SyncDirection>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const toProgressPayload = (
    msg: { current?: number; total?: number } | null,
  ): SyncProgress | null => {
    if (
      !msg ||
      typeof msg.current !== 'number' ||
      !Number.isFinite(msg.current) ||
      typeof msg.total !== 'number' ||
      !Number.isFinite(msg.total)
    ) {
      return null;
    }
    return {
      current: msg.current,
      total: msg.total,
    };
  };

  // AbortController reset on every mount; aborted on unmount to cancel in-flight pull fetches
  const abortRef = useRef(new AbortController());
  useEffect(() => {
    abortRef.current = new AbortController();
    const controller = abortRef.current;
    return () => { controller.abort(); };
  }, []);

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
      const msg = getPluginMessageFromEvent<{ type?: string; current?: number; total?: number }>(ev);
      if (msg?.type === configRef.current.progressEventType) {
        const nextProgress = toProgressPayload(msg);
        if (nextProgress) {
          setProgress(nextProgress);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const computeDiff = useCallback(async () => {
    if (!currentCollectionId) return;
    const cfg = configRef.current;
    setLoading(true);
    setError(null);
    setChecked(false);
    try {
      const signal = createFetchSignal(abortRef.current.signal);
      const snapshot = cfg.loadSnapshot
        ? await cfg.loadSnapshot({
          serverUrl,
          currentCollectionId,
          signal,
          readFigmaTokens: cfg.readFigmaTokens,
        })
        : await loadSyncSnapshot({
          serverUrl,
          currentCollectionId,
          readFigmaTokens: cfg.readFigmaTokens,
          signal,
          buildFigmaMap: cfg.buildFigmaMap,
          buildLocalMap: cfg.buildLocalMap,
          buildLocalOnlyRow: cfg.buildLocalOnlyRow,
          buildFigmaOnlyRow: cfg.buildFigmaOnlyRow,
          buildConflictRow: cfg.buildConflictRow,
          isConflict: cfg.isConflict,
        });

      setRows(snapshot.rows);
      rowsRef.current = snapshot.rows; // update ref immediately so applyDiff sees fresh data
      setChecked(true);
      setDirs(snapshot.dirs);
      dirsRef.current = snapshot.dirs; // update ref immediately so applyDiff sees fresh data
    } catch (err) {
      setError(describeError(err, cfg.compareErrorLabel));
    } finally {
      setLoading(false);
    }
  }, [serverUrl, currentCollectionId]);

  const applyDiff = useCallback(async () => {
    const cfg = configRef.current;
    const dirsSnapshot = dirsRef.current;
    const rowsSnapshot = rowsRef.current;
    const signal = abortRef.current.signal;

    const pushRows = rowsSnapshot.filter(r => dirsSnapshot[getDiffRowId(r)] === 'push');
    const pullRows = rowsSnapshot.filter(r => dirsSnapshot[getDiffRowId(r)] === 'pull');

    // No-op: nothing to apply (supports quick-sync calling applyDiff unconditionally)
    if (pushRows.length === 0 && pullRows.length === 0) return;

    setSyncing(true);
    setError(null);
    setProgress(null);
    try {
      const totalOps = pushRows.length + pullRows.length;

      // Execute push (local → Figma)
      const pushResult = pushRows.length > 0 ? await cfg.executePush(pushRows) : null;

      // Execute pull (Figma → local) via batch-update (single atomic request)
      const pullFailures: { path: string; error: string }[] = [];
      if (pullRows.length > 0) {
        const pullBase = pushRows.length;
        try {
          const patches = pullRows.map(r => ({ path: r.path, patch: cfg.buildPullPayload(r) }));
          await apiFetch(
            `${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/batch-update`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ patches }),
              signal: createFetchSignal(signal, 30000),
            },
          );
          if (!signal.aborted) setProgress({ current: pullBase + pullRows.length, total: totalOps });
        } catch (err) {
          if (signal.aborted) return;
          const msg = err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : (err instanceof Error ? err.message : String(err));
          for (const r of pullRows) pullFailures.push({ path: r.path, error: msg });
          if (!signal.aborted) setProgress({ current: pullBase + pullRows.length, total: totalOps });
        }
      }

      if (signal.aborted) return;
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
        for (const row of rowsSnapshot) {
          const rowId = getDiffRowId(row);
          if (failedPaths.has(row.path) && dirsSnapshot[rowId]) {
            failedDirs[rowId] = dirsSnapshot[rowId];
          }
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
        dispatchToast(cfg.successMessage, 'success');
      }
    } catch (err) {
      if (!signal.aborted) setError(describeError(err, cfg.applyErrorLabel));
    } finally {
      if (!signal.aborted) {
        setSyncing(false);
        setProgress(null);
      }
    }
  }, [serverUrl, currentCollectionId]);

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
