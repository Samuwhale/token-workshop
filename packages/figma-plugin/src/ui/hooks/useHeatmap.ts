import { useState, useCallback, useEffect, useRef } from 'react';
import type { HeatmapResult } from '../components/HeatmapPanel';
import type { ScanScope } from '../../shared/types';
import { getPluginMessageFromEvent, getPluginMessageHost, postPluginMessage } from '../../shared/utils';

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
  const activeRequestIdRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);

  const postHeatmapMessage = useCallback((message: Record<string, unknown>) => {
    const host = getPluginMessageHost();
    if (!host) {
      return false;
    }
    try {
      host.postMessage({ pluginMessage: message }, '*');
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearScanTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancelHeatmapScan = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    activeRequestIdRef.current = null;
    clearScanTimeout();
    if (requestId) {
      postHeatmapMessage({ type: 'cancel-scan', requestId });
    } else {
      postPluginMessage({ type: 'cancel-scan' });
    }
    setHeatmapLoading(false);
    setHeatmapError(null);
    setHeatmapProgress(null);
  }, [clearScanTimeout, postHeatmapMessage]);

  const triggerHeatmapScan = useCallback((scope?: ScanScope) => {
    const effectiveScope = scope ?? heatmapScope;
    clearScanTimeout();
    const requestId = `heatmap-${Date.now()}-${requestSequenceRef.current++}`;
    activeRequestIdRef.current = requestId;
    setHeatmapLoading(true);
    setHeatmapResult(null);
    setHeatmapError(null);
    setHeatmapProgress(null);
    if (!postHeatmapMessage({ type: 'scan-canvas-heatmap', scope: effectiveScope, requestId })) {
      activeRequestIdRef.current = null;
      setHeatmapLoading(false);
      setHeatmapError('Scan failed — the plugin host is unavailable.');
      return;
    }

    timeoutRef.current = setTimeout(() => {
      if (activeRequestIdRef.current !== requestId) {
        return;
      }
      timeoutRef.current = null;
      activeRequestIdRef.current = null;
      postHeatmapMessage({ type: 'cancel-scan', requestId });
      setHeatmapLoading(false);
      setHeatmapError('Scan timed out — the plugin may have lost connection. Try rescanning.');
      setHeatmapProgress(null);
    }, SCAN_TIMEOUT_MS);
  }, [clearScanTimeout, heatmapScope, postHeatmapMessage]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{
        type?: string;
        requestId?: string;
        processed?: number;
        total?: number;
        green?: number;
        yellow?: number;
        red?: number;
        nodes?: HeatmapResult['nodes'];
        error?: string;
      }>(e);
      if (!msg?.type?.startsWith('canvas-heatmap-')) {
        return;
      }
      if (!msg.requestId || msg.requestId !== activeRequestIdRef.current) {
        return;
      }
      if (
        msg.type === 'canvas-heatmap-progress' &&
        typeof msg.processed === 'number' &&
        typeof msg.total === 'number'
      ) {
        setHeatmapProgress({ processed: msg.processed, total: msg.total });
      } else if (
        msg.type === 'canvas-heatmap-result' &&
        typeof msg.total === 'number' &&
        typeof msg.green === 'number' &&
        typeof msg.yellow === 'number' &&
        typeof msg.red === 'number' &&
        Array.isArray(msg.nodes)
      ) {
        activeRequestIdRef.current = null;
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
      } else if (msg.type === 'canvas-heatmap-error') {
        activeRequestIdRef.current = null;
        clearScanTimeout();
        setHeatmapProgress(null);
        setHeatmapLoading(false);
        setHeatmapError(`Scan failed: ${msg.error}`);
      } else if (msg.type === 'canvas-heatmap-cancelled') {
        activeRequestIdRef.current = null;
        clearScanTimeout();
        setHeatmapProgress(null);
        setHeatmapLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (activeRequestIdRef.current) {
        postHeatmapMessage({ type: 'cancel-scan', requestId: activeRequestIdRef.current });
        activeRequestIdRef.current = null;
      }
      clearScanTimeout();
    };
  }, [clearScanTimeout, postHeatmapMessage]);

  return { heatmapResult, heatmapLoading, heatmapError, heatmapProgress, heatmapScope, setScanScope, triggerHeatmapScan, cancelHeatmapScan };
}
