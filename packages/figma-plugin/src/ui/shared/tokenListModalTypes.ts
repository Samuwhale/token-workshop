import type { TokenReference, TokenValue } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import type {
  DeleteConfirm,
  GeneratorImpact,
  ModeImpact,
  PromoteRow,
} from "../components/tokenListTypes";
import type { DeleteModalProps } from "../components/token-list/TokenListDeleteModalProps";
import type { RelocateConflictAction } from "../hooks/useTokenRelocate";

export interface VariableDiffFlatEntry {
  path: string;
  $type: string;
  $value: TokenValue | TokenReference;
  collectionId?: string;
  $extensions?: Record<string, unknown>;
  $scopes?: string[];
}

export interface VariableDiffPendingState {
  added: number;
  modified: number;
  unchanged: number;
  flat: VariableDiffFlatEntry[];
}

export interface ExtractAliasTokenDraft {
  path: string;
  $type?: string;
  $value: unknown;
}

export type ExtractAliasMode = "new" | "existing";

export interface RenameDependencyChange {
  path: string;
  collectionId: string;
  tokenPath: string;
  oldValue: string;
  newValue: string;
}

export interface RenameTokenConfirmState {
  oldPath: string;
  newPath: string;
  depCount: number;
  deps: RenameDependencyChange[];
  generatorImpacts: GeneratorImpact[];
  modeImpacts: ModeImpact[];
}

export interface RenameGroupConfirmState {
  oldPath: string;
  newPath: string;
  depCount: number;
  deps: RenameDependencyChange[];
}

export type FindReplaceScope = "active" | "all";
export type FindReplaceTarget = "names" | "values";

export interface FindReplaceRenamePreviewItem {
  oldPath: string;
  newPath: string;
  conflict: boolean;
  collectionId: string;
}

export interface FindReplaceValuePreviewItem {
  path: string;
  collectionId: string;
  oldValue: string;
  newValue: string;
}

export interface FindReplaceAliasImpact {
  tokenCount: number;
}

export interface TokenListModalsState {
  collectionId: string;
  collectionIds: string[];
  allTokensFlat: Record<string, TokenMapEntry>;
  connected: boolean;

  deleteConfirm: DeleteConfirm | null;
  modalProps: DeleteModalProps | null;
  executeDelete: () => void;
  onSetDeleteConfirm: (value: DeleteConfirm | null) => void;

  newGroupDialogParent: string | null;
  newGroupName: string;
  newGroupError: string;
  onSetNewGroupName: (value: string) => void;
  onSetNewGroupError: (value: string) => void;
  handleCreateGroup: (parent: string, name: string) => void;
  onSetNewGroupDialogParent: (value: string | null) => void;

  renameTokenConfirm: RenameTokenConfirmState | null;
  executeTokenRename: (
    oldPath: string,
    newPath: string,
    updateAliases?: boolean,
  ) => void;
  onSetRenameTokenConfirm: (value: RenameTokenConfirmState | null) => void;

  renameGroupConfirm: RenameGroupConfirmState | null;
  executeGroupRename: (
    oldPath: string,
    newPath: string,
    updateAliases?: boolean,
  ) => void;
  onSetRenameGroupConfirm: (value: RenameGroupConfirmState | null) => void;

  varDiffPending: VariableDiffPendingState | null;
  doApplyVariables: (flat: VariableDiffPendingState["flat"]) => void;
  onSetVarDiffPending: (value: VariableDiffPendingState | null) => void;

  extractToken: ExtractAliasTokenDraft | null;
  extractMode: ExtractAliasMode;
  onSetExtractMode: (value: ExtractAliasMode) => void;
  newPrimitivePath: string;
  onSetNewPrimitivePath: (value: string) => void;
  newPrimitiveCollectionId: string;
  onSetNewPrimitiveCollectionId: (value: string) => void;
  existingAlias: string;
  onSetExistingAlias: (value: string) => void;
  existingAliasSearch: string;
  onSetExistingAliasSearch: (value: string) => void;
  extractError: string;
  onSetExtractError: (value: string) => void;
  handleConfirmExtractToAlias: () => void;
  onSetExtractToken: (value: ExtractAliasTokenDraft | null) => void;

  showFindReplace: boolean;
  frFind: string;
  frReplace: string;
  frIsRegex: boolean;
  frScope: FindReplaceScope;
  frTarget: FindReplaceTarget;
  frError: string;
  frBusy: boolean;
  frRegexError: string | null;
  frPreview: FindReplaceRenamePreviewItem[];
  frValuePreview: FindReplaceValuePreviewItem[];
  frConflictCount: number;
  frRenameCount: number;
  frValueCount: number;
  frAliasImpact: FindReplaceAliasImpact;
  frTypeFilter: string;
  frAvailableTypes: string[];
  onSetFrFind: (value: string) => void;
  onSetFrReplace: (value: string) => void;
  onSetFrIsRegex: (value: boolean) => void;
  onSetFrScope: (value: FindReplaceScope) => void;
  onSetFrTarget: (value: FindReplaceTarget) => void;
  onSetFrTypeFilter: (value: string) => void;
  onSetFrError: (value: string) => void;
  onSetShowFindReplace: (value: boolean) => void;
  handleFindReplace: () => void;
  cancelFindReplace: () => void;

  promoteRows: PromoteRow[] | null;
  promoteBusy: boolean;
  onSetPromoteRows: (value: PromoteRow[] | null) => void;
  handleConfirmPromote: () => void;

  movingToken: string | null;
  movingGroup: string | null;
  moveTargetCollectionId: string;
  onSetMoveTargetCollectionId: (value: string) => void;
  onSetMovingToken: (value: string | null) => void;
  onSetMovingGroup: (value: string | null) => void;
  handleConfirmMoveToken: () => void;
  handleConfirmMoveGroup: () => void;
  moveConflict?: TokenMapEntry | null;
  moveConflictAction?: RelocateConflictAction;
  onSetMoveConflictAction?: (value: RelocateConflictAction) => void;
  moveConflictNewPath?: string;
  onSetMoveConflictNewPath?: (value: string) => void;
  moveSourceToken?: TokenMapEntry | null;

  copyingToken: string | null;
  copyingGroup: string | null;
  copyTargetCollectionId: string;
  onSetCopyTargetCollectionId: (value: string) => void;
  onSetCopyingToken: (value: string | null) => void;
  onSetCopyingGroup: (value: string | null) => void;
  handleConfirmCopyToken: () => void;
  handleConfirmCopyGroup: () => void;
  copyConflict?: TokenMapEntry | null;
  copyConflictAction?: RelocateConflictAction;
  onSetCopyConflictAction?: (value: RelocateConflictAction) => void;
  copyConflictNewPath?: string;
  onSetCopyConflictNewPath?: (value: string) => void;
  copySourceToken?: TokenMapEntry | null;

  showMoveToGroup: boolean;
  moveToGroupTarget: string;
  moveToGroupError: string;
  selectedMoveCount: number;
  /** Paths of the tokens currently selected for a move action — used to preview scope. */
  selectedMovePaths: string[];
  /** Maps token paths to their owning collection id — used to detect cross-collection conflicts. */
  pathToCollectionId: Record<string, string>;
  onSetShowMoveToGroup: (value: boolean) => void;
  onSetMoveToGroupTarget: (value: string) => void;
  onSetMoveToGroupError: (value: string) => void;
  handleBatchMoveToGroup: () => void;

  showBatchMoveToCollection: boolean;
  batchMoveToCollectionTarget: string;
  onSetBatchMoveToCollectionTarget: (value: string) => void;
  onSetShowBatchMoveToCollection: (value: boolean) => void;
  handleBatchMoveToCollection: () => void;

  showBatchCopyToCollection: boolean;
  batchCopyToCollectionTarget: string;
  onSetBatchCopyToCollectionTarget: (value: string) => void;
  onSetShowBatchCopyToCollection: (value: boolean) => void;
  handleBatchCopyToCollection: () => void;
}
