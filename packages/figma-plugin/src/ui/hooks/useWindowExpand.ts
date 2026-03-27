import { useState, useCallback, useEffect } from 'react';

const MAX_WIDTH = 900;
const MAX_HEIGHT = 900;

export function useWindowExpand() {
  const [isExpanded, setIsExpanded] = useState(() => {
    try { return localStorage.getItem('tm_expanded') === '1'; } catch { return false; }
  });
  const toggleExpand = useCallback(() => {
    const next = !isExpanded;
    setIsExpanded(next);
    try { localStorage.setItem('tm_expanded', next ? '1' : '0'); } catch {}
    parent.postMessage({ pluginMessage: { type: 'resize', width: next ? MAX_WIDTH : 400, height: next ? MAX_HEIGHT : 600 } }, '*');
  }, [isExpanded]);
  useEffect(() => {
    if (isExpanded) {
      parent.postMessage({ pluginMessage: { type: 'resize', width: MAX_WIDTH, height: MAX_HEIGHT } }, '*');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isExpanded, toggleExpand };
}
