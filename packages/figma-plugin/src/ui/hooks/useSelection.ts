import { useState, useEffect, useCallback } from 'react';
import type { SelectionNodeInfo } from '../../shared/types';
import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';

export function useSelection() {
  const [selectedNodes, setSelectedNodes] = useState<SelectionNodeInfo[]>([]);
  const [selectionLoading, setSelectionLoading] = useState(true);

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = getPluginMessageFromEvent<{ type?: string; nodes?: SelectionNodeInfo[] }>(event);
    if (!msg) return;
    if (msg.type === 'selection') {
      setSelectedNodes(msg.nodes || []);
      setSelectionLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectionLoading(true);
    window.addEventListener('message', handleMessage);
    // Request initial selection
    const didPost = postPluginMessage({ type: 'get-selection' });
    if (!didPost) {
      setSelectionLoading(false);
    }
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  return { selectedNodes, selectionLoading };
}
