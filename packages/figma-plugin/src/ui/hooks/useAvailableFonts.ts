import { useState, useEffect } from 'react';

/**
 * Requests available font families from the Figma plugin sandbox.
 * Returns families (sorted list) and weightsByFamily (numeric weights per family).
 * Falls back to empty values when running outside Figma (standalone).
 */
export function useAvailableFonts(): { families: string[]; weightsByFamily: Record<string, number[]> } {
  const [families, setFamilies] = useState<string[]>([]);
  const [weightsByFamily, setWeightsByFamily] = useState<Record<string, number[]>>({});

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'fonts-loaded' && Array.isArray(msg.families)) {
        setFamilies(msg.families);
        setWeightsByFamily(msg.weightsByFamily ?? {});
      }
    };

    window.addEventListener('message', handler);
    parent.postMessage({ pluginMessage: { type: 'get-available-fonts' } }, '*');

    return () => window.removeEventListener('message', handler);
  }, []);

  return { families, weightsByFamily };
}
