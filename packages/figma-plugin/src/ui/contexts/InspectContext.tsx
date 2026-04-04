/**
 * InspectContext — owns canvas selection, heatmap, and token-usage counts.
 *
 * Extracts useSelection, useHeatmap, and the tokenUsageCounts state from
 * App.tsx so that frequent Figma selection changes and heatmap scan progress
 * events don't cascade through the token-data or theme domains. Consumers call
 * `useInspectContext()` to subscribe.
 *
 * Note: The effect that triggers `scan-token-usage` based on the active tab
 * and current token count stays in App.tsx because it depends on navigation
 * state. Call `inspect.triggerUsageScan()` from that effect.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSelection } from '../hooks/useSelection';
import { useHeatmap } from '../hooks/useHeatmap';
import type { HeatmapResult } from '../components/HeatmapPanel';
import type { SelectionNodeInfo, HeatmapScope } from '../../shared/types';
import type { HeatmapProgress } from '../hooks/useHeatmap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

  // Listen for token-usage-map results; re-scan after apply/sync/remap changes
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
        parent.postMessage({ pluginMessage: { type: 'scan-token-usage' } }, '*');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const triggerUsageScan = useCallback(() => {
    parent.postMessage({ pluginMessage: { type: 'scan-token-usage' } }, '*');
  }, []);

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
    }),
    [
      selectedNodes,
      heatmapResult, heatmapLoading, heatmapError, heatmapProgress,
      heatmapScope, setHeatmapScope, triggerHeatmapScan, cancelHeatmapScan,
      tokenUsageCounts, triggerUsageScan,
    ],
  );

  return (
    <InspectContext.Provider value={value}>
      {children}
    </InspectContext.Provider>
  );
}
