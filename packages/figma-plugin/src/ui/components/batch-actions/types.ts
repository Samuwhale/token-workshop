import type { TokenMapEntry } from '../../../shared/types';
import type { UndoSlot } from '../../hooks/useUndo';

export type BatchActionType =
  | 'set-description'
  | 'change-type'
  | 'adjust-colors'
  | 'scale-numbers'
  | 'set-value'
  | 'set-alias'
  | 'find-replace'
  | 'rewrite-aliases'
  | 'figma-scopes'
  | 'set-extensions';

export interface BatchActionProps {
  selectedPaths: Set<string>;
  selectedEntries: Array<{ path: string; entry: TokenMapEntry }>;
  allTokensFlat: Record<string, TokenMapEntry>;
  collectionId: string;
  serverUrl: string;
  connected: boolean;
  onApply: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

