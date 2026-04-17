import { useMemo } from "react";
import type { TokenListModalsState } from "../TokenListModalsContext";
import type { TokenMapEntry } from "../../../shared/types";
import type { DeleteConfirm } from "../tokenListTypes";
import type { DeleteModalProps } from "./TokenListDeleteModalProps";
import type { VariableDiffPendingState } from "../../shared/tokenListModalTypes";

/**
 * Builds the memoized modal context value for TokenListModalsProvider.
 * Extracted to keep the main TokenList orchestrator small.
 */
export function useTokenListModalContext(deps: {
  collectionId: string;
  collectionIds: string[];
  allTokensFlat: Record<string, TokenMapEntry>;
  connected: boolean;
  deleteConfirm: DeleteConfirm | null;
  modalProps: DeleteModalProps | null;
  executeDelete: () => void;
  setDeleteConfirm: (v: DeleteConfirm | null) => void;
  newGroupDialogParent: string | null;
  newGroupName: string;
  newGroupError: string;
  setNewGroupName: (v: string) => void;
  setNewGroupError: (v: string) => void;
  handleCreateGroup: (...args: any[]) => any;
  setNewGroupDialogParent: (v: string | null) => void;
  renameTokenConfirm: any;
  executeTokenRename: (...args: any[]) => any;
  setRenameTokenConfirm: (v: any) => void;
  renameGroupConfirm: any;
  executeGroupRename: (...args: any[]) => any;
  setRenameGroupConfirm: (v: any) => void;
  varDiffPending: VariableDiffPendingState | null;
  doApplyVariables: (flat: any[]) => void;
  setVarDiffPending: (v: VariableDiffPendingState | null) => void;
  extractToken: any;
  extractMode: any;
  setExtractMode: (v: any) => void;
  newPrimitivePath: string;
  setNewPrimitivePath: (v: string) => void;
  newPrimitiveCollectionId: string;
  setNewPrimitiveCollectionId: (v: string) => void;
  existingAlias: string;
  setExistingAlias: (v: string) => void;
  existingAliasSearch: string;
  setExistingAliasSearch: (v: string) => void;
  extractError: string;
  setExtractError: (v: string) => void;
  handleConfirmExtractToAlias: () => void;
  setExtractToken: (v: any) => void;
  showFindReplace: boolean;
  frFind: string;
  frReplace: string;
  frIsRegex: boolean;
  frScope: any;
  frTarget: any;
  frError: string;
  frBusy: boolean;
  frRegexError: string | null;
  frPreview: any;
  frValuePreview: any;
  frConflictCount: number;
  frRenameCount: number;
  frValueCount: number;
  frAliasImpact: any;
  frTypeFilter: string;
  frAvailableTypes: string[];
  setFrFind: (v: string) => void;
  setFrReplace: (v: string) => void;
  setFrIsRegex: (v: boolean) => void;
  setFrScope: (v: any) => void;
  setFrTarget: (v: any) => void;
  setFrTypeFilter: (v: string) => void;
  setFrError: (v: string) => void;
  setShowFindReplace: (v: boolean) => void;
  handleFindReplace: () => void;
  cancelFindReplace: () => void;
  promoteRows: any;
  promoteBusy: boolean;
  setPromoteRows: (v: any) => void;
  handleConfirmPromote: () => void;
  movingToken: string | null;
  movingGroup: string | null;
  moveGroupTargetCollectionId: string;
  moveTokenTargetCollectionId: string;
  setMoveGroupTargetCollectionId: (v: string) => void;
  handleChangeMoveTokenTargetCollection: (v: string) => void;
  setMovingToken: (v: string | null) => void;
  setMovingGroup: (v: string | null) => void;
  handleConfirmMoveToken: () => void;
  handleConfirmMoveGroup: () => void;
  moveConflict: any;
  moveConflictAction: any;
  setMoveConflictAction: (v: any) => void;
  moveConflictNewPath: string;
  setMoveConflictNewPath: (v: string) => void;
  copyingToken: string | null;
  copyingGroup: string | null;
  copyGroupTargetCollectionId: string;
  copyTokenTargetCollectionId: string;
  setCopyGroupTargetCollectionId: (v: string) => void;
  handleChangeCopyTokenTargetCollection: (v: string) => void;
  setCopyingToken: (v: string | null) => void;
  setCopyingGroup: (v: string | null) => void;
  handleConfirmCopyToken: () => void;
  handleConfirmCopyGroup: () => void;
  copyConflict: any;
  copyConflictAction: any;
  setCopyConflictAction: (v: any) => void;
  copyConflictNewPath: string;
  setCopyConflictNewPath: (v: string) => void;
  showMoveToGroup: boolean;
  moveToGroupTarget: string;
  moveToGroupError: string;
  selectedPaths: Set<string>;
  setShowMoveToGroup: (v: boolean) => void;
  setMoveToGroupTarget: (v: string) => void;
  setMoveToGroupError: (v: string) => void;
  handleBatchMoveToGroup: () => void;
  showBatchMoveToCollection: boolean;
  batchMoveToCollectionTarget: string;
  setBatchMoveToCollectionTarget: (v: string) => void;
  setShowBatchMoveToCollection: (v: boolean) => void;
  handleBatchMoveToCollection: () => void;
  showBatchCopyToCollection: boolean;
  batchCopyToCollectionTarget: string;
  setBatchCopyToCollectionTarget: (v: string) => void;
  setShowBatchCopyToCollection: (v: boolean) => void;
  handleBatchCopyToCollection: () => void;
}): TokenListModalsState {
  return useMemo<TokenListModalsState>(
    () => ({
      collectionId: deps.collectionId,
      collectionIds: deps.collectionIds,
      allTokensFlat: deps.allTokensFlat,
      connected: deps.connected,
      deleteConfirm: deps.deleteConfirm,
      modalProps: deps.modalProps,
      executeDelete: deps.executeDelete,
      onSetDeleteConfirm: deps.setDeleteConfirm,
      newGroupDialogParent: deps.newGroupDialogParent,
      newGroupName: deps.newGroupName,
      newGroupError: deps.newGroupError,
      onSetNewGroupName: deps.setNewGroupName,
      onSetNewGroupError: deps.setNewGroupError,
      handleCreateGroup: deps.handleCreateGroup,
      onSetNewGroupDialogParent: deps.setNewGroupDialogParent,
      renameTokenConfirm: deps.renameTokenConfirm,
      executeTokenRename: deps.executeTokenRename,
      onSetRenameTokenConfirm: deps.setRenameTokenConfirm,
      renameGroupConfirm: deps.renameGroupConfirm,
      executeGroupRename: deps.executeGroupRename,
      onSetRenameGroupConfirm: deps.setRenameGroupConfirm,
      varDiffPending: deps.varDiffPending,
      doApplyVariables: deps.doApplyVariables,
      onSetVarDiffPending: deps.setVarDiffPending,
      extractToken: deps.extractToken,
      extractMode: deps.extractMode,
      onSetExtractMode: deps.setExtractMode,
      newPrimitivePath: deps.newPrimitivePath,
      onSetNewPrimitivePath: deps.setNewPrimitivePath,
      newPrimitiveCollectionId: deps.newPrimitiveCollectionId,
      onSetNewPrimitiveCollectionId: deps.setNewPrimitiveCollectionId,
      existingAlias: deps.existingAlias,
      onSetExistingAlias: deps.setExistingAlias,
      existingAliasSearch: deps.existingAliasSearch,
      onSetExistingAliasSearch: deps.setExistingAliasSearch,
      extractError: deps.extractError,
      onSetExtractError: deps.setExtractError,
      handleConfirmExtractToAlias: deps.handleConfirmExtractToAlias,
      onSetExtractToken: deps.setExtractToken,
      showFindReplace: deps.showFindReplace,
      frFind: deps.frFind,
      frReplace: deps.frReplace,
      frIsRegex: deps.frIsRegex,
      frScope: deps.frScope,
      frTarget: deps.frTarget,
      frError: deps.frError,
      frBusy: deps.frBusy,
      frRegexError: deps.frRegexError,
      frPreview: deps.frPreview,
      frValuePreview: deps.frValuePreview,
      frConflictCount: deps.frConflictCount,
      frRenameCount: deps.frRenameCount,
      frValueCount: deps.frValueCount,
      frAliasImpact: deps.frAliasImpact,
      frTypeFilter: deps.frTypeFilter,
      frAvailableTypes: deps.frAvailableTypes,
      onSetFrFind: deps.setFrFind,
      onSetFrReplace: deps.setFrReplace,
      onSetFrIsRegex: deps.setFrIsRegex,
      onSetFrScope: deps.setFrScope,
      onSetFrTarget: deps.setFrTarget,
      onSetFrTypeFilter: deps.setFrTypeFilter,
      onSetFrError: deps.setFrError,
      onSetShowFindReplace: deps.setShowFindReplace,
      handleFindReplace: deps.handleFindReplace,
      cancelFindReplace: deps.cancelFindReplace,
      promoteRows: deps.promoteRows,
      promoteBusy: deps.promoteBusy,
      onSetPromoteRows: deps.setPromoteRows,
      handleConfirmPromote: deps.handleConfirmPromote,
      movingToken: deps.movingToken,
      movingGroup: deps.movingGroup,
      moveTargetCollectionId: deps.movingGroup
        ? deps.moveGroupTargetCollectionId
        : deps.moveTokenTargetCollectionId,
      onSetMoveTargetCollectionId: deps.movingGroup
        ? deps.setMoveGroupTargetCollectionId
        : deps.handleChangeMoveTokenTargetCollection,
      onSetMovingToken: deps.setMovingToken,
      onSetMovingGroup: deps.setMovingGroup,
      handleConfirmMoveToken: deps.handleConfirmMoveToken,
      handleConfirmMoveGroup: deps.handleConfirmMoveGroup,
      moveConflict: deps.movingToken ? deps.moveConflict : null,
      moveConflictAction: deps.moveConflictAction,
      onSetMoveConflictAction: deps.setMoveConflictAction,
      moveConflictNewPath: deps.moveConflictNewPath,
      onSetMoveConflictNewPath: deps.setMoveConflictNewPath,
      moveSourceToken: deps.movingToken
        ? (deps.allTokensFlat[deps.movingToken] ?? null)
        : null,
      copyingToken: deps.copyingToken,
      copyingGroup: deps.copyingGroup,
      copyTargetCollectionId: deps.copyingGroup
        ? deps.copyGroupTargetCollectionId
        : deps.copyTokenTargetCollectionId,
      onSetCopyTargetCollectionId: deps.copyingGroup
        ? deps.setCopyGroupTargetCollectionId
        : deps.handleChangeCopyTokenTargetCollection,
      onSetCopyingToken: deps.setCopyingToken,
      onSetCopyingGroup: deps.setCopyingGroup,
      handleConfirmCopyToken: deps.handleConfirmCopyToken,
      handleConfirmCopyGroup: deps.handleConfirmCopyGroup,
      copyConflict: deps.copyingToken ? deps.copyConflict : null,
      copyConflictAction: deps.copyConflictAction,
      onSetCopyConflictAction: deps.setCopyConflictAction,
      copyConflictNewPath: deps.copyConflictNewPath,
      onSetCopyConflictNewPath: deps.setCopyConflictNewPath,
      copySourceToken: deps.copyingToken
        ? (deps.allTokensFlat[deps.copyingToken] ?? null)
        : null,
      showMoveToGroup: deps.showMoveToGroup,
      moveToGroupTarget: deps.moveToGroupTarget,
      moveToGroupError: deps.moveToGroupError,
      selectedMoveCount: deps.selectedPaths.size,
      onSetShowMoveToGroup: deps.setShowMoveToGroup,
      onSetMoveToGroupTarget: deps.setMoveToGroupTarget,
      onSetMoveToGroupError: deps.setMoveToGroupError,
      handleBatchMoveToGroup: deps.handleBatchMoveToGroup,
      showBatchMoveToCollection: deps.showBatchMoveToCollection,
      batchMoveToCollectionTarget: deps.batchMoveToCollectionTarget,
      onSetBatchMoveToCollectionTarget: deps.setBatchMoveToCollectionTarget,
      onSetShowBatchMoveToCollection: deps.setShowBatchMoveToCollection,
      handleBatchMoveToCollection: deps.handleBatchMoveToCollection,
      showBatchCopyToCollection: deps.showBatchCopyToCollection,
      batchCopyToCollectionTarget: deps.batchCopyToCollectionTarget,
      onSetBatchCopyToCollectionTarget: deps.setBatchCopyToCollectionTarget,
      onSetShowBatchCopyToCollection: deps.setShowBatchCopyToCollection,
      handleBatchCopyToCollection: deps.handleBatchCopyToCollection,
    }),
    [deps],
  );
}
