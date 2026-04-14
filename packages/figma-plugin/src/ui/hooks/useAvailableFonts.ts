import { useState, useEffect } from 'react';
import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';

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
      const msg = getPluginMessageFromEvent<{
        type?: string;
        families?: string[];
        weightsByFamily?: Record<string, number[]>;
      }>(event);
      if (msg?.type === 'fonts-loaded' && Array.isArray(msg.families)) {
        setFamilies(msg.families);
        setWeightsByFamily(msg.weightsByFamily ?? {});
      }
    };

    window.addEventListener('message', handler);
    postPluginMessage({ type: 'get-available-fonts' });

    return () => window.removeEventListener('message', handler);
  }, []);

  return { families, weightsByFamily };
}
