/**
 * InspectContext — owns canvas selection, heatmap, token-usage counts, and
 * consistency scan results.
 *
 * Extracts useSelection, useHeatmap, and the tokenUsageCounts/consistencyScan
 * state from App.tsx so that frequent Figma selection changes and scan progress
 * events don't cascade through the token-data or theme domains. Consumers call
 * `useInspectContext()` to subscribe.
 *
 * Note: The effect that triggers `scan-token-usage` based on the active tab
 * and current token count stays in App.tsx because it depends on navigation
 * state. Call `inspect.triggerUsageScan()` from that effect.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { useSelection } from '../hooks/useSelection';
import { useHeatmap } from '../hooks/useHeatmap';
import type { HeatmapResult } from '../components/HeatmapPanel';
import type { SelectionNodeInfo, HeatmapScope, ConsistencySuggestion } from '../../shared/types';
import type { HeatmapProgress } from '../hooks/useHeatmap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CONSISTENCY_SCAN_TIMEOUT_MS = 60_000;

export interface InspectContextValue {
  // ---- useSelection -------------------------------------------------------
  selectedNodes: SelectionNodeInfo[];

  // ---- useHeatmap ---------------------------------------------------------
  heatmapResult: HeatmapResult | null;
  heatmapLoading: boolean;
  heatmapError: string | null;
  heatmapProgress: HeatmapProgress | null;
  heatmapScope: HeatmapScope;
  setHeatmapScope: (scope: HeatmapScope) => void;
  triggerHeatmapScan: (scope?: HeatmapScope) => void;
  cancelHeatmapScan: () => void;

  // ---- Token usage counts -------------------------------------------------
  tokenUsageCounts: Record<string, number>;
  /** Imperatively trigger a scan-token-usage postMessage. Called from App.tsx
   *  when the active tab/token state indicates a scan is needed. */
  triggerUsageScan: () => void;

  // ---- Consistency scan ---------------------------------------------------
  consistencyResult: ConsistencySuggestion[] | null;
  consistencyLoading: boolean;
  consistencyError: string | null;
  consistencyProgress: { processed: number; total: number } | null;
  consistencyTotalNodes: number;
  consistencySnappedKeys: Set<string>;
  setConsistencySnappedKeys: Dispatch<SetStateAction<Set<string>>>;
  triggerConsistencyScan: (
    tokenMap: Record<string, { $value: unknown; $type: string }>,
    scope: string,
  ) => void;
  cancelConsistencyScan: () => void;
}

const InspectContext = createContext<InspectContextValue | null>(null);

export function useInspectContext(): InspectContextValue {
  const ctx = useContext(InspectContext);
  if (!ctx) throw new Error('useInspectContext must be used inside InspectProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function InspectProvider({ children }: { children: ReactNode }) {
  const { selectedNodes } = useSelection();

  const {
    heatmapResult,
    heatmapLoading,
    heatmapError,
    heatmapProgress,
    heatmapScope,
    setHeatmapScope,
    triggerHeatmapScan,
    cancelHeatmapScan,
  } = useHeatmap();

  // Token usage counts — updated by the plugin sandbox after each scan
  const [tokenUsageCounts, setTokenUsageCounts] = useState<Record<string, number>>({});

  const scanDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Consistency scan state — persisted here so results survive tab switches
  const [consistencyResult, setConsistencyResult] = useState<ConsistencySuggestion[] | null>(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [consistencyProgress, setConsistencyProgress] = useState<{ processed: number; total: number } | null>(null);
  const [consistencyTotalNodes, setConsistencyTotalNodes] = useState(0);
  const [consistencySnappedKeys, setConsistencySnappedKeys] = useState<Set<string>>(new Set());
  const consistencyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConsistencyTimeout = useCallback(() => {
    if (consistencyTimeoutRef.current !== null) {
      clearTimeout(consistencyTimeoutRef.current);
      consistencyTimeoutRef.current = null;
    }
  }, []);

  // Listen for token-usage-map results; re-scan after apply/sync/remap changes.
  // Debounce the re-scan trigger to avoid flooding the plugin during rapid
  // operations (e.g. batch token applies that fire multiple sync-complete events).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'token-usage-map') {
        setTokenUsageCounts(msg.usageMap ?? {});
      } else if (
        msg?.type === 'applied-to-selection' ||
        msg?.type === 'sync-complete' ||
        msg?.type === 'remap-complete'
      ) {
        if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
        scanDebounceRef.current = setTimeout(() => {
          parent.postMessage({ pluginMessage: { type: 'scan-token-usage' } }, '*');
        }, 300);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
    };
  }, []);

  // Listen for consistency scan messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === 'consistency-scan-progress') {
        setConsistencyProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === 'consistency-scan-result') {
        clearConsistencyTimeout();
        setConsistencyLoading(false);
        setConsistencyProgress(null);
        setConsistencyResult(msg.suggestions);
        setConsistencyTotalNodes(msg.totalNodes);
        setConsistencyError(null);
      } else if (msg.type === 'consistency-scan-error') {
        clearConsistencyTimeout();
        setConsistencyLoading(false);
        setConsistencyProgress(null);
        setConsistencyError(msg.error);
      } else if (msg.type === 'consistency-scan-cancelled') {
        clearConsistencyTimeout();
        setConsistencyLoading(false);
        setConsistencyProgress(null);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearConsistencyTimeout();
    };
  }, [clearConsistencyTimeout]);

  const triggerUsageScan = useCallback(() => {
    parent.postMessage({ pluginMessage: { type: 'scan-token-usage' } }, '*');
  }, []);

  const triggerConsistencyScan = useCallback(
    (tokenMap: Record<string, { $value: unknown; $type: string }>, scope: string) => {
      clearConsistencyTimeout();
      setConsistencyLoading(true);
      setConsistencyProgress(null);
      setConsistencyResult(null);
      setConsistencyError(null);
      setConsistencySnappedKeys(new Set());

      consistencyTimeoutRef.current = setTimeout(() => {
        consistencyTimeoutRef.current = null;
        parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
        setConsistencyLoading(false);
        setConsistencyProgress(null);
        setConsistencyError('Scan timed out. Try a smaller scope (Page instead of All pages).');
      }, CONSISTENCY_SCAN_TIMEOUT_MS);

      parent.postMessage({
        pluginMessage: { type: 'scan-consistency', tokenMap, scope },
      }, '*');
    },
    [clearConsistencyTimeout],
  );

  const cancelConsistencyScan = useCallback(() => {
    clearConsistencyTimeout();
    parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
    setConsistencyLoading(false);
    setConsistencyProgress(null);
  }, [clearConsistencyTimeout]);

  const value = useMemo<InspectContextValue>(
    () => ({
      selectedNodes,
      heatmapResult,
      heatmapLoading,
      heatmapError,
      heatmapProgress,
      heatmapScope,
      setHeatmapScope,
      triggerHeatmapScan,
      cancelHeatmapScan,
      tokenUsageCounts,
      triggerUsageScan,
      consistencyResult,
      consistencyLoading,
      consistencyError,
      consistencyProgress,
      consistencyTotalNodes,
      consistencySnappedKeys,
      setConsistencySnappedKeys,
      triggerConsistencyScan,
      cancelConsistencyScan,
    }),
    [
      selectedNodes,
      heatmapResult, heatmapLoading, heatmapError, heatmapProgress,
      heatmapScope, setHeatmapScope, triggerHeatmapScan, cancelHeatmapScan,
      tokenUsageCounts, triggerUsageScan,
      consistencyResult, consistencyLoading, consistencyError, consistencyProgress,
      consistencyTotalNodes, consistencySnappedKeys,
      setConsistencySnappedKeys, triggerConsistencyScan, cancelConsistencyScan,
    ],
  );

  return (
    <InspectContext.Provider value={value}>
      {children}
    </InspectContext.Provider>
  );
}
