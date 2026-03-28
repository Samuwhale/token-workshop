import { useState, useEffect } from 'react';

/**
 * Requests available font families from the Figma plugin sandbox.
 * Returns a sorted, deduplicated list of family names.
 * Falls back to an empty array when running outside Figma (standalone).
 */
export function useAvailableFonts(): string[] {
  const [families, setFamilies] = useState<string[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'fonts-loaded' && Array.isArray(msg.families)) {
        setFamilies(msg.families);
      }
    };

    window.addEventListener('message', handler);
    parent.postMessage({ pluginMessage: { type: 'get-available-fonts' } }, '*');

    return () => window.removeEventListener('message', handler);
  }, []);

  return families;
}
