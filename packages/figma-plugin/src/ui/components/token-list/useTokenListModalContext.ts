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
  setName: string;
  sets: string[];
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
  newPrimitiveSet: string;
  setNewPrimitiveSet: (v: string) => void;
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
  moveGroupTargetSet: string;
  moveTokenTargetSet: string;
  setMoveGroupTargetSet: (v: string) => void;
  handleChangeMoveTokenTargetSet: (v: string) => void;
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
  copyGroupTargetSet: string;
  copyTokenTargetSet: string;
  setCopyGroupTargetSet: (v: string) => void;
  handleChangeCopyTokenTargetSet: (v: string) => void;
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
  showBatchMoveToSet: boolean;
  batchMoveToSetTarget: string;
  setBatchMoveToSetTarget: (v: string) => void;
  setShowBatchMoveToSet: (v: boolean) => void;
  handleBatchMoveToSet: () => void;
  showBatchCopyToSet: boolean;
  batchCopyToSetTarget: string;
  setBatchCopyToSetTarget: (v: string) => void;
  setShowBatchCopyToSet: (v: boolean) => void;
  handleBatchCopyToSet: () => void;
}): TokenListModalsState {
  return useMemo<TokenListModalsState>(
    () => ({
      setName: deps.setName,
      sets: deps.sets,
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
      newPrimitiveSet: deps.newPrimitiveSet,
      onSetNewPrimitiveSet: deps.setNewPrimitiveSet,
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
      moveTargetSet: deps.movingGroup
        ? deps.moveGroupTargetSet
        : deps.moveTokenTargetSet,
      onSetMoveTargetSet: deps.movingGroup
        ? deps.setMoveGroupTargetSet
        : deps.handleChangeMoveTokenTargetSet,
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
      copyTargetSet: deps.copyingGroup
        ? deps.copyGroupTargetSet
        : deps.copyTokenTargetSet,
      onSetCopyTargetSet: deps.copyingGroup
        ? deps.setCopyGroupTargetSet
        : deps.handleChangeCopyTokenTargetSet,
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
      showBatchMoveToSet: deps.showBatchMoveToSet,
      batchMoveToSetTarget: deps.batchMoveToSetTarget,
      onSetBatchMoveToSetTarget: deps.setBatchMoveToSetTarget,
      onSetShowBatchMoveToSet: deps.setShowBatchMoveToSet,
      handleBatchMoveToSet: deps.handleBatchMoveToSet,
      showBatchCopyToSet: deps.showBatchCopyToSet,
      batchCopyToSetTarget: deps.batchCopyToSetTarget,
      onSetBatchCopyToSetTarget: deps.setBatchCopyToSetTarget,
      onSetShowBatchCopyToSet: deps.setShowBatchCopyToSet,
      handleBatchCopyToSet: deps.handleBatchCopyToSet,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps object is reconstructed each render; individual fields tracked via object identity
    [deps],
  );
}
