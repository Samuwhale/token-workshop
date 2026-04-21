import type { TokenMapEntry } from '../../../shared/types';
import type { UndoSlot } from '../../hooks/useUndo';
import type { BatchActionType, BatchActionProps } from './types';
import { SetDescriptionAction } from './SetDescriptionAction';
import { ChangeTypeAction } from './ChangeTypeAction';
import { AdjustColorsAction } from './AdjustColorsAction';
import { ScaleNumbersAction } from './ScaleNumbersAction';
import { SetValueAction } from './SetValueAction';
import { SetAliasAction } from './SetAliasAction';
import { FindReplaceAction } from './FindReplaceAction';
import { RewriteAliasesAction } from './RewriteAliasesAction';
import { FigmaScopesAction } from './FigmaScopesAction';
import { SetExtensionsAction } from './SetExtensionsAction';

export interface BatchActionPanelProps {
  action: BatchActionType;
  selectedPaths: Set<string>;
  selectedEntries: Array<{ path: string; entry: TokenMapEntry }>;
  allTokensFlat: Record<string, TokenMapEntry>;
  collectionId: string;
  serverUrl: string;
  connected: boolean;
  onApply: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSelectedPathsChange?: (next: Set<string>) => void;
}

export function BatchActionPanel({
  action,
  selectedPaths,
  selectedEntries,
  allTokensFlat,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
  onSelectedPathsChange,
}: BatchActionPanelProps) {
  const common: BatchActionProps = {
    selectedPaths,
    selectedEntries,
    allTokensFlat,
    collectionId,
    serverUrl,
    connected,
    onApply,
    onPushUndo,
  };

  switch (action) {
    case 'set-description':
      return <SetDescriptionAction {...common} />;
    case 'change-type':
      return <ChangeTypeAction {...common} />;
    case 'adjust-colors':
      return <AdjustColorsAction {...common} />;
    case 'scale-numbers':
      return <ScaleNumbersAction {...common} />;
    case 'set-value':
      return <SetValueAction {...common} />;
    case 'set-alias':
      return <SetAliasAction {...common} />;
    case 'find-replace':
      return <FindReplaceAction {...common} onSelectedPathsChange={onSelectedPathsChange} />;
    case 'rewrite-aliases':
      return <RewriteAliasesAction {...common} />;
    case 'figma-scopes':
      return <FigmaScopesAction {...common} />;
    case 'set-extensions':
      return <SetExtensionsAction {...common} />;
  }
}
