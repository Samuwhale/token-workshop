import { useState, useEffect, useCallback } from 'react';
import type { SelectionNodeInfo } from '../../shared/types';

export function useSelection() {
  const [selectedNodes, setSelectedNodes] = useState<SelectionNodeInfo[]>([]);
  const [selectionLoading, setSelectionLoading] = useState(true);

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;
    if (msg.type === 'selection') {
      setSelectedNodes(msg.nodes || []);
      setSelectionLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    // Request initial selection
    parent.postMessage({ pluginMessage: { type: 'get-selection' } }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return { selectedNodes, selectionLoading };
}
