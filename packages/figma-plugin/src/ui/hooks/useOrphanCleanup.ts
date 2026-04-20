import { useState, useRef, useEffect, useCallback } from 'react';
import type { OrphanVariableDeleteTarget } from '../../shared/types';
import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';
import { describeError } from '../shared/utils';

interface UseOrphanCleanupParams {
  collectionMap: Record<string, string>;
  /** Called after a successful deletion run — typically triggers re-running readiness checks. */
  onDeletionComplete: () => void;
  /** Called to surface errors back to the readiness section. */
  setReadinessError: (msg: string | null) => void;
}

export interface OrphanConfirmState {
  orphanPaths: string[];
  localPaths: Set<string>;
  targets?: OrphanVariableDeleteTarget[];
}

export interface UseOrphanCleanupReturn {
  orphansDeleting: boolean;
  orphanConfirm: OrphanConfirmState | null;
  setOrphanConfirm: React.Dispatch<React.SetStateAction<OrphanConfirmState | null>>;
  executeOrphanDeletion: () => Promise<void>;
}

interface OrphanDeletionResult {
  count: number;
  failures?: string[];
}

interface PendingOrphanDeletion {
  resolve: (result: OrphanDeletionResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export function useOrphanCleanup({
  collectionMap,
  onDeletionComplete,
  setReadinessError,
}: UseOrphanCleanupParams): UseOrphanCleanupReturn {
  const [orphansDeleting, setOrphansDeleting] = useState(false);
  const orphansPendingRef = useRef<Map<string, PendingOrphanDeletion>>(new Map());
  const [orphanConfirm, setOrphanConfirm] = useState<OrphanConfirmState | null>(null);

  const clearPendingRequests = useCallback((reason: string) => {
    for (const [correlationId, pending] of orphansPendingRef.current) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
      orphansPendingRef.current.delete(correlationId);
    }
  }, []);

  // ── Orphan deletion message handler ──
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{
        type?: string;
        correlationId?: string;
        count?: number;
        failures?: string[];
      }>(ev);
      if (msg?.type === 'orphans-deleted' && msg.correlationId) {
        const pending = orphansPendingRef.current.get(msg.correlationId);
        if (pending) {
          orphansPendingRef.current.delete(msg.correlationId);
          clearTimeout(pending.timeoutId);
          pending.resolve({ count: msg.count ?? 0, failures: msg.failures });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearPendingRequests('Orphan deletion listener disposed');
    };
  }, [clearPendingRequests]);

  const executeOrphanDeletion = useCallback(async () => {
    if (!orphanConfirm) return;
    const { localPaths, targets } = orphanConfirm;
    setOrphanConfirm(null);
    setOrphansDeleting(true);
    setReadinessError(null);
    // Clear any stale handlers from a previous invocation so a late plugin response
    // from an earlier timed-out attempt cannot interfere with this new run.
    clearPendingRequests('Orphan deletion restarted');
    const MAX_RETRIES = 2;
    const TIMEOUTS = [10000, 20000, 30000];
    let deleteResult: OrphanDeletionResult | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        deleteResult = await new Promise<OrphanDeletionResult>((resolve, reject) => {
          const cid = `orphans-${Date.now()}-${Math.random()}`;
          const timeoutId = setTimeout(() => {
            orphansPendingRef.current.delete(cid);
            reject(new Error('Timeout'));
          }, TIMEOUTS[attempt]);
          orphansPendingRef.current.set(cid, { resolve, reject, timeoutId });
          const didPost = postPluginMessage({
            type: 'delete-orphan-variables',
            knownPaths: [...localPaths],
            collectionMap,
            ...(targets && targets.length > 0 ? { targets } : {}),
            correlationId: cid,
          });
          if (!didPost) {
            const pending = orphansPendingRef.current.get(cid);
            orphansPendingRef.current.delete(cid);
            if (pending) {
              clearTimeout(pending.timeoutId);
            }
            reject(new Error('Plugin host is unavailable'));
          }
        });
        break;
      } catch (err) {
        const isTimeout = err instanceof Error && err.message === 'Timeout';
        if (!isTimeout) {
          setOrphansDeleting(false);
          setReadinessError(describeError(err, 'Orphan deletion'));
          return;
        }
      }
    }
    setOrphansDeleting(false);
    if (deleteResult !== null) {
      if (deleteResult.failures && deleteResult.failures.length > 0) {
        const failList = deleteResult.failures.slice(0, 3).join('; ');
        const extra = deleteResult.failures.length > 3 ? ` (+${deleteResult.failures.length - 3} more)` : '';
        setReadinessError(`Orphan deletion partially failed — ${deleteResult.failures.length} variable(s) could not be removed: ${failList}${extra}`);
      }
      onDeletionComplete();
    } else {
      setReadinessError('Orphan deletion timed out after multiple attempts — the plugin did not respond. Click the button to try again.');
    }
  }, [orphanConfirm, collectionMap, onDeletionComplete, setReadinessError, clearPendingRequests]);

  return { orphansDeleting, orphanConfirm, setOrphanConfirm, executeOrphanDeletion };
}
