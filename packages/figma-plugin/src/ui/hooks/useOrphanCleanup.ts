import { useState, useRef, useEffect, useCallback } from 'react';
import { describeError } from '../shared/utils';

interface UseOrphanCleanupParams {
  collectionMap: Record<string, string>;
  /** Called after a successful deletion run — typically triggers re-running readiness checks. */
  onDeletionComplete: () => void;
  /** Called to surface errors back to the readiness section. */
  setReadinessError: (msg: string | null) => void;
}

export interface UseOrphanCleanupReturn {
  orphansDeleting: boolean;
  orphanConfirm: { orphanPaths: string[]; localPaths: Set<string> } | null;
  setOrphanConfirm: React.Dispatch<React.SetStateAction<{ orphanPaths: string[]; localPaths: Set<string> } | null>>;
  executeOrphanDeletion: () => Promise<void>;
}

export function useOrphanCleanup({
  collectionMap,
  onDeletionComplete,
  setReadinessError,
}: UseOrphanCleanupParams): UseOrphanCleanupReturn {
  const [orphansDeleting, setOrphansDeleting] = useState(false);
  const orphansPendingRef = useRef<Map<string, (result: { count: number; failures?: string[] }) => void>>(new Map());
  const [orphanConfirm, setOrphanConfirm] = useState<{ orphanPaths: string[]; localPaths: Set<string> } | null>(null);

  // ── Orphan deletion message handler ──
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'orphans-deleted' && msg.correlationId) {
        const resolve = orphansPendingRef.current.get(msg.correlationId);
        if (resolve) {
          orphansPendingRef.current.delete(msg.correlationId);
          resolve({ count: msg.count ?? 0, failures: msg.failures });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const executeOrphanDeletion = useCallback(async () => {
    if (!orphanConfirm) return;
    const { localPaths } = orphanConfirm;
    setOrphanConfirm(null);
    setOrphansDeleting(true);
    setReadinessError(null);
    // Clear any stale handlers from a previous invocation so a late plugin response
    // from an earlier timed-out attempt cannot interfere with this new run.
    orphansPendingRef.current.clear();
    const MAX_RETRIES = 2;
    const TIMEOUTS = [10000, 20000, 30000];
    let deleteResult: { count: number; failures?: string[] } | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        deleteResult = await new Promise<{ count: number; failures?: string[] }>((resolve, reject) => {
          const cid = `orphans-${Date.now()}-${Math.random()}`;
          const timeout = setTimeout(() => { orphansPendingRef.current.delete(cid); reject(new Error('Timeout')); }, TIMEOUTS[attempt]);
          orphansPendingRef.current.set(cid, (result) => { clearTimeout(timeout); resolve(result); });
          parent.postMessage({ pluginMessage: { type: 'delete-orphan-variables', knownPaths: [...localPaths], collectionMap, correlationId: cid } }, '*');
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
  }, [orphanConfirm, collectionMap, onDeletionComplete, setReadinessError]);

  return { orphansDeleting, orphanConfirm, setOrphanConfirm, executeOrphanDeletion };
}
