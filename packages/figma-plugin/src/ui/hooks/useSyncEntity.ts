import { useEffect, useCallback, useState, useRef } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { useFigmaMessage } from './useFigmaMessage';
import { useTokenSyncBase, extractSyncApplyResult, type SyncProgress, type DiffRowBase } from './useTokenSyncBase';
import type { DTCGToken } from '@tokenmanager/core';

export type { SyncProgress, DiffRowBase };

// ── Static message config ─────────────────────────────────────────────────
// All functions here MUST be stable references (module-level constants or
// memoized with useCallback), because useFigmaMessage puts them in its
// event-listener dep array and will re-register on every change.

export interface SyncMessages<TSnapshot> {
  readSendType: string;
  readResponseType: string;
  readErrorType?: string;
  readTimeout: number;
  /** Must be a stable reference (module-level constant). */
  extractReadResponse: (msg: any) => any[];

  applySendType: string;
  applyResponseType: string;
  applyErrorType?: string;
  applyTimeout: number;
  /** Must be a stable reference (module-level constant). */
  extractApplySnapshot: (msg: any) => TSnapshot | undefined;

  revertSendType: string;
  revertResponseType: string;
  revertTimeout: number;
}

// ── Dynamic config ────────────────────────────────────────────────────────
// Stored in a ref inside the hook — safe to recreate each render.

export interface SyncEntityConfig<TRow extends DiffRowBase, TSnapshot> {
  progressEventType: string;
  buildFigmaMap: (tokens: any[]) => Map<string, any>;
  buildLocalMap: (tokens: Map<string, DTCGToken>) => Map<string, any>;
  buildLocalOnlyRow: (path: string, local: any) => TRow;
  buildFigmaOnlyRow: (path: string, figma: any) => TRow;
  buildConflictRow: (path: string, local: any, figma: any) => TRow;
  isConflict: (local: any, figma: any) => boolean;
  buildApplyPayload: (rows: TRow[]) => Record<string, any>;
  buildPullPayload: (row: TRow) => { $type: string; $value: any };
  buildRevertPayload: (snapshot: TSnapshot) => Record<string, any>;
  onApplySuccess?: (result: { count: number; total: number; snapshot?: TSnapshot; created?: number; overwritten?: number; skipped?: Array<{ path: string; $type: string }> }) => void;
  successMessage: string;
  compareErrorLabel: string;
  applyErrorLabel: string;
  revertSuccessMessage: string;
  revertErrorMessage: string;
  /** Auto-trigger computeDiff when connected + activeSet become truthy. */
  autoComputeOnConnect?: boolean;
}

// Shared stable extractor for all revert responses.
const extractRevertResponse = (msg: any): { failures: string[] } => ({
  failures: msg.failures ?? [],
});

export function useSyncEntity<TRow extends DiffRowBase, TSnapshot>(
  serverUrl: string,
  activeSet: string,
  connected: boolean,
  messages: SyncMessages<TSnapshot>,
  config: SyncEntityConfig<TRow, TSnapshot>,
) {
  const [snapshot, setSnapshot] = useState<TSnapshot | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  // Keep latest dynamic config in a ref so executePush always reads current
  // values without needing to rebuild the TokenSyncConfig on every render.
  const configRef = useRef(config);
  configRef.current = config;

  // Compose a stable extractResponse for the apply message sender.
  // Stable as long as messages.extractApplySnapshot is stable (module-level).
  const extractApply = useCallback(
    (msg: any) => ({
      ...extractSyncApplyResult(msg),
      snapshot: messages.extractApplySnapshot(msg),
    }),
    [messages],
  );

  const sendRead = useFigmaMessage<any[]>({
    responseType: messages.readResponseType,
    errorType: messages.readErrorType,
    timeout: messages.readTimeout,
    extractResponse: messages.extractReadResponse,
  });

  const sendApply = useFigmaMessage<{
    count: number;
    total: number;
    failures: { path: string; error: string }[];
    skipped: Array<{ path: string; $type: string }>;
    snapshot?: TSnapshot;
    created?: number;
    overwritten?: number;
  }>({
    responseType: messages.applyResponseType,
    errorType: messages.applyErrorType,
    timeout: messages.applyTimeout,
    extractResponse: extractApply,
  });

  const sendRevert = useFigmaMessage<{ failures: string[] }>({
    responseType: messages.revertResponseType,
    timeout: messages.revertTimeout,
    extractResponse: extractRevertResponse,
  });

  const readFigmaTokens = useCallback(
    () => sendRead(messages.readSendType),
    [sendRead, messages.readSendType],
  );

  // Build a TokenSyncConfig that delegates all dynamic callbacks through configRef.
  // This object may be recreated each render, but useTokenSyncBase reads it via
  // its own configRef — all callbacks remain up-to-date.
  const tokenSyncConfig = {
    progressEventType: configRef.current.progressEventType,
    readFigmaTokens,
    buildFigmaMap: (tokens: any[]) => configRef.current.buildFigmaMap(tokens),
    buildLocalMap: (tokens: Map<string, DTCGToken>) => configRef.current.buildLocalMap(tokens),
    buildLocalOnlyRow: (path: string, local: any): TRow => configRef.current.buildLocalOnlyRow(path, local),
    buildFigmaOnlyRow: (path: string, figma: any): TRow => configRef.current.buildFigmaOnlyRow(path, figma),
    buildConflictRow: (path: string, local: any, figma: any): TRow => configRef.current.buildConflictRow(path, local, figma),
    isConflict: (local: any, figma: any) => configRef.current.isConflict(local, figma),
    executePush: async (rows: TRow[]) => {
      const cfg = configRef.current;
      const result = await sendApply(messages.applySendType, cfg.buildApplyPayload(rows));
      if (result.snapshot) {
        setSnapshot(result.snapshot);
        setRevertError(null);
      }
      cfg.onApplySuccess?.(result);
      return { failures: result.failures };
    },
    buildPullPayload: (row: TRow) => configRef.current.buildPullPayload(row),
    successMessage: configRef.current.successMessage,
    compareErrorLabel: configRef.current.compareErrorLabel,
    applyErrorLabel: configRef.current.applyErrorLabel,
  };

  const base = useTokenSyncBase<TRow>(serverUrl, activeSet, tokenSyncConfig);

  // Auto-trigger diff computation when connection + set become available.
  useEffect(() => {
    if (config.autoComputeOnConnect && connected && activeSet) base.computeDiff();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.autoComputeOnConnect, connected, activeSet, base.computeDiff]);

  const revert = useCallback(async () => {
    if (!snapshot) return;
    setReverting(true);
    setRevertError(null);
    try {
      const result = await sendRevert(
        messages.revertSendType,
        configRef.current.buildRevertPayload(snapshot),
      );
      if (result.failures.length > 0) {
        setRevertError(
          `Revert completed with ${result.failures.length} issue(s): ${result.failures.slice(0, 3).join('; ')}`,
        );
      } else {
        setSnapshot(null);
        dispatchToast(configRef.current.revertSuccessMessage, 'success');
      }
    } catch (err) {
      setRevertError(
        err instanceof Error ? err.message : configRef.current.revertErrorMessage,
      );
    } finally {
      setReverting(false);
    }
  }, [snapshot, sendRevert, messages.revertSendType]);

  return {
    rows: base.rows,
    dirs: base.dirs,
    setDirs: base.setDirs,
    loading: base.loading,
    syncing: base.syncing,
    progress: base.progress,
    error: base.error,
    checked: base.checked,
    computeDiff: base.computeDiff,
    applyDiff: base.applyDiff,
    syncCount: base.syncCount,
    pushCount: base.pushCount,
    pullCount: base.pullCount,
    readFigmaTokens,
    snapshot,
    reverting,
    revertError,
    revert,
  };
}
