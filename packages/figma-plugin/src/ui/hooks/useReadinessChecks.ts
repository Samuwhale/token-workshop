import { useState, useRef, useEffect, useCallback } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { describeError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'pending';
  /** true = must fix before publish; false = recommended but not blocking */
  blocking: boolean;
  count?: number;
  detail?: string;
  fixLabel?: string;
  onFix?: () => void;
}

export const LAST_READINESS_CHANGE_KEY = 'tm_readiness_change_key';

const READINESS_TIMEOUT_MS = 15_000;

interface UseReadinessChecksParams {
  serverUrl: string;
  activeSet: string;
  connected: boolean;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  tokenChangeKey?: number;
  /** Reads Figma variables — from varSync.readFigmaTokens */
  readFigmaTokens: () => Promise<any[]>;
  /** Sets the orphan confirmation modal — from useOrphanCleanup */
  setOrphanConfirm: (val: { orphanPaths: string[]; localPaths: Set<string> } | null) => void;
}

export interface UseReadinessChecksReturn {
  readinessChecks: ReadinessCheck[];
  readinessLoading: boolean;
  readinessError: string | null;
  setReadinessError: React.Dispatch<React.SetStateAction<string | null>>;
  checksStale: boolean;
  setChecksStale: React.Dispatch<React.SetStateAction<boolean>>;
  runReadinessChecks: () => Promise<void>;
  readinessFails: number;
  readinessPasses: number;
  readinessBlockingFails: number;
  isReadinessOutdated: boolean;
}

export function useReadinessChecks({
  serverUrl,
  activeSet,
  connected,
  collectionMap,
  modeMap,
  tokenChangeKey,
  readFigmaTokens,
  setOrphanConfirm,
}: UseReadinessChecksParams): UseReadinessChecksReturn {
  const [readinessChecks, setReadinessChecks] = useState<ReadinessCheck[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  /** tokenChangeKey value at the time checks last completed successfully */
  const [checksRunAtKey, setChecksRunAtKey] = useState<number | null>(null);
  /** True when a sync/apply happened after checks ran, making results outdated */
  const [checksStale, setChecksStale] = useState(false);

  const runReadinessChecks = useCallback(async () => {
    if (!activeSet) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('No response from Figma after 15 s — make sure the plugin is open and try again.')), READINESS_TIMEOUT_MS)
      );
      const figmaTokens = await Promise.race([readFigmaTokens(), timeoutPromise]);

      const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      const localTokens = flattenTokenGroup(data.tokens || {});
      const localFlat = Array.from(localTokens, ([path, token]) => ({
        path, value: String(token.$value), type: String(token.$type ?? 'string'),
      }));

      const figmaMap = new Map<string, any>(figmaTokens.map(t => [t.path, t]));
      const localPaths = new Set(localTokens.keys());

      const missingInFigma = localFlat.filter(t => !figmaMap.has(t.path));
      const missingScopes = figmaTokens.filter(t =>
        !t.$scopes || t.$scopes.length === 0 || (t.$scopes.length === 1 && t.$scopes[0] === 'ALL_SCOPES')
      );
      const missingDescriptions = figmaTokens.filter(t => !t.$description);
      const orphans = figmaTokens.filter(t => !localPaths.has(t.path));

      const checks: ReadinessCheck[] = [
        {
          id: 'all-vars',
          label: 'All tokens have Figma variables',
          blocking: true,
          status: missingInFigma.length === 0 ? 'pass' : 'fail',
          count: missingInFigma.length || undefined,
          detail: missingInFigma.length > 0 ? 'Some local tokens are not yet pushed to Figma. Use the fix button to create the missing variables now.' : undefined,
          fixLabel: missingInFigma.length > 0 ? `Push ${missingInFigma.length} missing` : undefined,
          onFix: missingInFigma.length > 0 ? () => {
            const tokens = missingInFigma.map(t => ({ path: t.path, $type: t.type, $value: t.value, setName: activeSet }));
            parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap } }, '*');
          } : undefined,
        },
        {
          id: 'orphans',
          label: 'No orphan Figma variables',
          blocking: true,
          status: orphans.length === 0 ? 'pass' : 'fail',
          count: orphans.length || undefined,
          detail: orphans.length > 0 ? 'Figma contains variables that no longer exist in the token set. Delete them to keep Figma in sync.' : undefined,
          fixLabel: orphans.length > 0 ? `Delete ${orphans.length} orphan${orphans.length !== 1 ? 's' : ''}` : undefined,
          onFix: orphans.length > 0 ? () => {
            setOrphanConfirm({ orphanPaths: orphans.map(o => o.path), localPaths });
          } : undefined,
        },
        {
          id: 'scopes',
          label: 'Scopes set for every variable',
          blocking: true,
          status: missingScopes.length === 0 ? 'pass' : 'fail',
          count: missingScopes.length || undefined,
          detail: missingScopes.length > 0 ? 'Open the Figma Variables panel \u2192 select each variable \u2192 set scopes to control where it can be applied (e.g. Fill, Stroke, Gap).' : undefined,
        },
        {
          id: 'descriptions',
          label: 'Descriptions populated',
          blocking: false,
          status: missingDescriptions.length === 0 ? 'pass' : 'fail',
          count: missingDescriptions.length || undefined,
          detail: missingDescriptions.length > 0 ? 'Add $description fields to tokens in the token editor, then re-sync to Figma. Descriptions help designers understand how to use each variable.' : undefined,
        },
      ];
      setReadinessChecks(checks);
      const runKey = tokenChangeKey ?? 0;
      setChecksRunAtKey(runKey);
      setChecksStale(false);
      try { localStorage.setItem(LAST_READINESS_CHANGE_KEY, String(runKey)); } catch { /* ignore */ }
    } catch (err) {
      setReadinessError(describeError(err, 'Readiness checks'));
    } finally {
      setReadinessLoading(false);
    }
  }, [serverUrl, activeSet, readFigmaTokens, collectionMap, modeMap, tokenChangeKey, setOrphanConfirm]);

  /* ── Auto-run checks when tab activates after token edits ───────────── */

  const runReadinessChecksRef = useRef(runReadinessChecks);
  useEffect(() => { runReadinessChecksRef.current = runReadinessChecks; }, [runReadinessChecks]);

  // On mount: auto-run if tokens changed since the last check (user edited then navigated here)
  useEffect(() => {
    if (!connected || !activeSet || tokenChangeKey === undefined) return;
    const stored = localStorage.getItem(LAST_READINESS_CHANGE_KEY);
    if (stored !== null && tokenChangeKey > parseInt(stored, 10)) {
      runReadinessChecksRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs only on mount

  // While mounted: auto-recheck whenever tokenChangeKey increments (after at least one prior check)
  useEffect(() => {
    if (!connected || !activeSet || tokenChangeKey === undefined) return;
    if (checksRunAtKey === null) return; // skip until the user has triggered at least one check
    if (tokenChangeKey === checksRunAtKey) return; // already current
    runReadinessChecksRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenChangeKey]); // re-run when token data changes

  const readinessFails = readinessChecks.filter(c => c.status === 'fail').length;
  const readinessPasses = readinessChecks.filter(c => c.status === 'pass').length;
  const readinessBlockingFails = readinessChecks.filter(c => c.status === 'fail' && c.blocking).length;
  const isReadinessOutdated = readinessChecks.length > 0 && (
    checksStale ||
    (tokenChangeKey !== undefined && checksRunAtKey !== null && tokenChangeKey !== checksRunAtKey)
  );

  return {
    readinessChecks,
    readinessLoading,
    readinessError,
    setReadinessError,
    checksStale,
    setChecksStale,
    runReadinessChecks,
    readinessFails,
    readinessPasses,
    readinessBlockingFails,
    isReadinessOutdated,
  };
}
