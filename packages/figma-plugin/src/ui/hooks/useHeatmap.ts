import { useState, useCallback, useEffect, useRef } from 'react';
import type { HeatmapResult } from '../components/HeatmapPanel';
import type { ScanScope } from '../../shared/types';
import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';

const SCAN_TIMEOUT_MS = 30_000;

export interface HeatmapProgress {
  processed: number;
  total: number;
}

export function useHeatmap() {
  const [heatmapResult, setHeatmapResult] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapScope, setScanScope] = useState<ScanScope>('page');
  const [heatmapProgress, setHeatmapProgress] = useState<HeatmapProgress | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScanTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancelHeatmapScan = useCallback(() => {
    clearScanTimeout();
    postPluginMessage({ type: 'cancel-scan' });
    setHeatmapLoading(false);
    setHeatmapError(null);
    setHeatmapProgress(null);
  }, [clearScanTimeout]);

  const triggerHeatmapScan = useCallback((scope?: ScanScope) => {
    const effectiveScope = scope ?? heatmapScope;
    clearScanTimeout();
    setHeatmapLoading(true);
    setHeatmapResult(null);
    setHeatmapError(null);
    setHeatmapProgress(null);
    postPluginMessage({ type: 'scan-canvas-heatmap', scope: effectiveScope });

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      postPluginMessage({ type: 'cancel-scan' });
      setHeatmapLoading(false);
      setHeatmapError('Scan timed out — the plugin may have lost connection. Try rescanning.');
      setHeatmapProgress(null);
    }, SCAN_TIMEOUT_MS);
  }, [clearScanTimeout, heatmapScope]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{
        type?: string;
        processed?: number;
        total?: number;
        green?: number;
        yellow?: number;
        red?: number;
        nodes?: HeatmapResult['nodes'];
        error?: string;
      }>(e);
      if (
        msg?.type === 'canvas-heatmap-progress' &&
        typeof msg.processed === 'number' &&
        typeof msg.total === 'number'
      ) {
        setHeatmapProgress({ processed: msg.processed, total: msg.total });
      } else if (
        msg?.type === 'canvas-heatmap-result' &&
        typeof msg.total === 'number' &&
        typeof msg.green === 'number' &&
        typeof msg.yellow === 'number' &&
        typeof msg.red === 'number' &&
        Array.isArray(msg.nodes)
      ) {
        clearScanTimeout();
        setHeatmapProgress(null);
        setHeatmapResult({
          total: msg.total,
          green: msg.green,
          yellow: msg.yellow,
          red: msg.red,
          nodes: msg.nodes,
        });
        setHeatmapLoading(false);
        setHeatmapError(null);
      } else if (msg?.type === 'canvas-heatmap-error') {
        clearScanTimeout();
        setHeatmapProgress(null);
        setHeatmapLoading(false);
        setHeatmapError(`Scan failed: ${msg.error}`);
      } else if (msg?.type === 'canvas-heatmap-cancelled') {
        clearScanTimeout();
        setHeatmapProgress(null);
        setHeatmapLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearScanTimeout();
    };
  }, [clearScanTimeout]);

  return { heatmapResult, heatmapLoading, heatmapError, heatmapProgress, heatmapScope, setScanScope, triggerHeatmapScan, cancelHeatmapScan };
}
