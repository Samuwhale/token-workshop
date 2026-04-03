import { useState, useCallback, useEffect, useRef } from 'react';
import type { HeatmapResult, HeatmapScope } from '../components/HeatmapPanel';

const SCAN_TIMEOUT_MS = 30_000;

export interface HeatmapProgress {
  processed: number;
  total: number;
}

export function useHeatmap() {
  const [heatmapResult, setHeatmapResult] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapScope, setHeatmapScope] = useState<HeatmapScope>('page');
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
    setHeatmapLoading(false);
    setHeatmapError(null);
    setHeatmapProgress(null);
  }, [clearScanTimeout]);

  const triggerHeatmapScan = useCallback((scope?: HeatmapScope) => {
    const effectiveScope = scope ?? heatmapScope;
    clearScanTimeout();
    setHeatmapLoading(true);
    setHeatmapResult(null);
    setHeatmapError(null);
    setHeatmapProgress(null);
    parent.postMessage({ pluginMessage: { type: 'scan-canvas-heatmap', scope: effectiveScope } }, '*');

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setHeatmapLoading(false);
      setHeatmapError('Scan timed out — the plugin may have lost connection. Try rescanning.');
      setHeatmapProgress(null);
    }, SCAN_TIMEOUT_MS);
  }, [clearScanTimeout, heatmapScope]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'canvas-heatmap-progress') {
        setHeatmapProgress({ processed: msg.processed, total: msg.total });
      } else if (msg?.type === 'canvas-heatmap-result') {
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
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearScanTimeout();
    };
  }, [clearScanTimeout]);

  return { heatmapResult, heatmapLoading, heatmapError, heatmapProgress, heatmapScope, setHeatmapScope, triggerHeatmapScan, cancelHeatmapScan };
}
