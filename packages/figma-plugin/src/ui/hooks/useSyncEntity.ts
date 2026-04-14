import { useEffect, useCallback, useState, useRef } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { useFigmaMessage } from './useFigmaMessage';
import { useTokenSyncBase, extractSyncApplyResult, type SyncProgress, type DiffRowBase } from './useTokenSyncBase';
import type { DTCGToken } from '@tokenmanager/core';
import type {
  SyncApplyResult,
  SyncApplyResultBase,
  SyncRevertResult,
  SyncSnapshot,
} from '../shared/syncWorkflow';

export type { SyncProgress, DiffRowBase };

// ── Static message config ─────────────────────────────────────────────────
// All functions here MUST be stable references (module-level constants or
// memoized with useCallback), because useFigmaMessage puts them in its
// event-listener dep array and will re-register on every change.

interface SyncMessageBase {
  type: string;
  correlationId?: string;
  error?: string;
}

export interface SyncMessages<
  TSnapshot,
  TReadResponse extends unknown[],
  TReadMessage extends SyncMessageBase,
  TApplyMessage extends SyncMessageBase & Partial<SyncApplyResultBase>,
> {
  readSendType: string;
  readResponseType: string;
  readErrorType?: string;
  readTimeout: number;
  /** Must be a stable reference (module-level constant). */
  extractReadResponse: (msg: TReadMessage) => TReadResponse;

  applySendType: string;
  applyResponseType: string;
  applyErrorType?: string;
  applyTimeout: number;
  /** Must be a stable reference (module-level constant). */
  extractApplySnapshot: (msg: TApplyMessage) => TSnapshot | undefined;

  revertSendType: string;
  revertResponseType: string;
  revertTimeout: number;
}

// ── Dynamic config ────────────────────────────────────────────────────────
// Stored in a ref inside the hook — safe to recreate each render.

export interface SyncEntityConfig<
  TRow extends DiffRowBase,
  TSnapshot,
  TLocal = unknown,
  TFigma = unknown,
> {
  progressEventType: string;
  buildFigmaMap: (tokens: unknown[]) => Map<string, TFigma>;
  buildLocalMap: (tokens: Map<string, DTCGToken>) => Map<string, TLocal>;
  buildLocalOnlyRow: (path: string, local: TLocal) => TRow;
  buildFigmaOnlyRow: (path: string, figma: TFigma) => TRow;
  buildConflictRow: (path: string, local: TLocal, figma: TFigma) => TRow;
  isConflict: (local: TLocal, figma: TFigma) => boolean;
  loadSnapshot?: (params: {
    serverUrl: string;
    activeSet: string;
    signal?: AbortSignal;
    readFigmaTokens: () => Promise<unknown[]>;
  }) => Promise<SyncSnapshot<TLocal, TFigma, TRow>>;
  buildApplyPayload: (rows: TRow[]) => Record<string, unknown>;
  buildPullPayload: (row: TRow) => { $type: string; $value: unknown };
  buildRevertPayload: (snapshot: TSnapshot) => Record<string, unknown>;
  onApplySuccess?: (result: SyncApplyResult<TSnapshot>) => void;
  successMessage: string;
  compareErrorLabel: string;
  applyErrorLabel: string;
  revertSuccessMessage: string;
  revertErrorMessage: string;
  /** Auto-trigger computeDiff when connected + activeSet become truthy. */
  autoComputeOnConnect?: boolean;
}

// Shared stable extractor for all revert responses.
const extractRevertResponse = (msg: Partial<SyncRevertResult>): SyncRevertResult => ({
  failures: msg.failures ?? [],
});

export function useSyncEntity<
  TRow extends DiffRowBase,
  TSnapshot,
  TReadResponse extends unknown[],
  TReadMessage extends SyncMessageBase,
  TApplyMessage extends SyncMessageBase & Partial<SyncApplyResultBase>,
  TLocal = unknown,
  TFigma = unknown,
>(
  serverUrl: string,
  activeSet: string,
  connected: boolean,
  messages: SyncMessages<TSnapshot, TReadResponse, TReadMessage, TApplyMessage>,
  config: SyncEntityConfig<TRow, TSnapshot, TLocal, TFigma>,
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
    (msg: TApplyMessage): SyncApplyResult<TSnapshot> => ({
      ...extractSyncApplyResult(msg),
      snapshot: messages.extractApplySnapshot(msg),
    }),
    [messages],
  );

  const sendRead = useFigmaMessage<TReadResponse, TReadMessage>({
    responseType: messages.readResponseType,
    errorType: messages.readErrorType,
    timeout: messages.readTimeout,
    extractResponse: messages.extractReadResponse,
  });

  const sendApply = useFigmaMessage<SyncApplyResult<TSnapshot>, TApplyMessage>({
    responseType: messages.applyResponseType,
    errorType: messages.applyErrorType,
    timeout: messages.applyTimeout,
    extractResponse: extractApply,
  });

  const sendRevert = useFigmaMessage<SyncRevertResult, SyncRevertResult & SyncMessageBase>({
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
    buildFigmaMap: (tokens: unknown[]) => configRef.current.buildFigmaMap(tokens),
    buildLocalMap: (tokens: Map<string, DTCGToken>) => configRef.current.buildLocalMap(tokens),
    buildLocalOnlyRow: (path: string, local: TLocal): TRow => configRef.current.buildLocalOnlyRow(path, local),
    buildFigmaOnlyRow: (path: string, figma: TFigma): TRow => configRef.current.buildFigmaOnlyRow(path, figma),
    buildConflictRow: (path: string, local: TLocal, figma: TFigma): TRow =>
      configRef.current.buildConflictRow(path, local, figma),
    isConflict: (local: TLocal, figma: TFigma) => configRef.current.isConflict(local, figma),
    loadSnapshot: configRef.current.loadSnapshot,
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

  const base = useTokenSyncBase<TRow, TLocal, TFigma>(
    serverUrl,
    activeSet,
    tokenSyncConfig,
  );
  const { computeDiff } = base;

  // Auto-trigger diff computation when connection + set become available.
  useEffect(() => {
    if (config.autoComputeOnConnect && connected && activeSet) {
      void computeDiff();
    }
  }, [config.autoComputeOnConnect, connected, activeSet, computeDiff]);

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
    computeDiff,
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
