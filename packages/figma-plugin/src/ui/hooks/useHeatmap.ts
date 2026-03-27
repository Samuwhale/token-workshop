import { useState, useCallback, useEffect } from 'react';
import type { HeatmapResult } from '../components/HeatmapPanel';

export function useHeatmap() {
  const [heatmapResult, setHeatmapResult] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  const triggerHeatmapScan = useCallback(() => {
    setHeatmapLoading(true);
    setHeatmapResult(null);
    parent.postMessage({ pluginMessage: { type: 'scan-canvas-heatmap' } }, '*');
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'canvas-heatmap-result') {
        setHeatmapResult({
          total: msg.total,
          green: msg.green,
          yellow: msg.yellow,
          red: msg.red,
          nodes: msg.nodes,
        });
        setHeatmapLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return { heatmapResult, heatmapLoading, triggerHeatmapScan };
}
