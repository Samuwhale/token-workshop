/**
 * InspectContext — split into three focused sub-contexts to minimise cascade
 * re-renders from high-frequency events:
 *
 *   SelectionContext  — Figma canvas selection (fires on every click in Figma)
 *   HeatmapContext    — heatmap scan state and progress
 *                       (progress events fire frequently during a scan)
 *   UsageContext      — token usage counts + consistency scan state
 *                       (consistency progress fires frequently during a scan)
 *
 * After the split, a heatmap progress tick only re-renders HeatmapPanel;
 * a consistency progress tick only re-renders ConsistencyPanel; and a
 * Figma canvas selection change only re-renders components that read
 * `selectedNodes`.
 *
 * `InspectProvider` is a thin wrapper that stacks all three providers.
 *
 * Note: The effect that triggers `scan-token-usage` based on active tab
 * and current token count stays in App.tsx because it depends on navigation
 * state. Call `inspect.triggerUsageScan()` from that effect.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { useSelection } from '../hooks/useSelection';
import { useHeatmap } from '../hooks/useHeatmap';
import type { HeatmapResult } from '../components/HeatmapPanel';
import type { SelectionNodeInfo, ScanScope, ConsistencySuggestion } from '../../shared/types';
import type { HeatmapProgress } from '../hooks/useHeatmap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CONSISTENCY_SCAN_TIMEOUT_MS = 60_000;

export interface SelectionContextValue {
  selectedNodes: SelectionNodeInfo[];
  selectionLoading: boolean;
}

export interface HeatmapContextValue {
  heatmapResult: HeatmapResult | null;
  heatmapLoading: boolean;
  heatmapError: string | null;
  heatmapProgress: HeatmapProgress | null;
  heatmapScope: ScanScope;
  setHeatmapScope: (scope: ScanScope) => void;
  triggerHeatmapScan: (scope?: ScanScope) => void;
  cancelHeatmapScan: () => void;
}

export interface UsageContextValue {
  tokenUsageCounts: Record<string, number>;
  /** Imperatively trigger a scan-token-usage postMessage. Called from App.tsx
   *  when the active tab/token state indicates a scan is needed. */
  triggerUsageScan: () => void;
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

// ---------------------------------------------------------------------------
// Contexts and hooks
// ---------------------------------------------------------------------------

const SelectionContext = createContext<SelectionContextValue | null>(null);
const HeatmapContext = createContext<HeatmapContextValue | null>(null);
const UsageContext = createContext<UsageContextValue | null>(null);

export function useSelectionContext(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelectionContext must be used inside InspectProvider');
  return ctx;
}

export function useHeatmapContext(): HeatmapContextValue {
  const ctx = useContext(HeatmapContext);
  if (!ctx) throw new Error('useHeatmapContext must be used inside InspectProvider');
  return ctx;
}

export function useUsageContext(): UsageContextValue {
  const ctx = useContext(UsageContext);
  if (!ctx) throw new Error('useUsageContext must be used inside InspectProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function SelectionProvider({ children }: { children: ReactNode }) {
  const { selectedNodes, selectionLoading } = useSelection();
  const value = useMemo<SelectionContextValue>(
    () => ({ selectedNodes, selectionLoading }),
    [selectedNodes, selectionLoading],
  );
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

function HeatmapProvider({ children }: { children: ReactNode }) {
  const {
    heatmapResult, heatmapLoading, heatmapError, heatmapProgress,
    heatmapScope, setScanScope, triggerHeatmapScan, cancelHeatmapScan,
  } = useHeatmap();

  const value = useMemo<HeatmapContextValue>(
    () => ({
      heatmapResult, heatmapLoading, heatmapError, heatmapProgress,
      heatmapScope, setHeatmapScope: setScanScope, triggerHeatmapScan, cancelHeatmapScan,
    }),
    [
      heatmapResult, heatmapLoading, heatmapError, heatmapProgress,
      heatmapScope, setScanScope, triggerHeatmapScan, cancelHeatmapScan,
    ],
  );

  return (
    <HeatmapContext.Provider value={value}>
      {children}
    </HeatmapContext.Provider>
  );
}

function UsageProvider({ children }: { children: ReactNode }) {
  const [tokenUsageCounts, setTokenUsageCounts] = useState<Record<string, number>>({});

  const scanDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const value = useMemo<UsageContextValue>(
    () => ({
      tokenUsageCounts, triggerUsageScan,
      consistencyResult, consistencyLoading, consistencyError, consistencyProgress,
      consistencyTotalNodes, consistencySnappedKeys, setConsistencySnappedKeys,
      triggerConsistencyScan, cancelConsistencyScan,
    }),
    [
      tokenUsageCounts, triggerUsageScan,
      consistencyResult, consistencyLoading, consistencyError, consistencyProgress,
      consistencyTotalNodes, consistencySnappedKeys,
      setConsistencySnappedKeys, triggerConsistencyScan, cancelConsistencyScan,
    ],
  );

  return (
    <UsageContext.Provider value={value}>
      {children}
    </UsageContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Public wrapper — stacks the three providers
// ---------------------------------------------------------------------------

export function InspectProvider({ children }: { children: ReactNode }) {
  return (
    <SelectionProvider>
      <HeatmapProvider>
        <UsageProvider>
          {children}
        </UsageProvider>
      </HeatmapProvider>
    </SelectionProvider>
  );
}
