import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

const MAX_WIDTH = 900;
const MAX_HEIGHT = 900;

export function useWindowExpand() {
  const [isExpanded, setIsExpanded] = useState(() => lsGet(STORAGE_KEYS.EXPANDED) === '1');
  const toggleExpand = useCallback(() => {
    const next = !isExpanded;
    setIsExpanded(next);
    lsSet(STORAGE_KEYS.EXPANDED, next ? '1' : '0');
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
