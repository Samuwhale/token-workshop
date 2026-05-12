import { PLUGIN_DATA_NAMESPACE } from './constants.js';

export const ICON_PLUGIN_DATA_KEYS = {
  id: 'iconId',
  path: 'iconPath',
  hash: 'iconHash',
  pageId: 'iconPageId',
} as const;

export interface ManagedIconPluginData {
  id: string;
  path: string;
  hash: string;
}

export function readManagedIconPluginData(
  node: BaseNode,
): ManagedIconPluginData | null {
  const id = node.getSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.id,
  );
  const path = node.getSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.path,
  );
  const hash = node.getSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.hash,
  );

  if (!id && !path && !hash) {
    return null;
  }

  return { id, path, hash };
}

