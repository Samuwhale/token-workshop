import type { VariableDiffPendingState, TokenListModalsState } from "../../shared/tokenListModalTypes";

type TokenListModalContextDeps = {
  collectionId: TokenListModalsState["collectionId"];
  collectionIds: TokenListModalsState["collectionIds"];
  allTokensFlat: TokenListModalsState["allTokensFlat"];
  connected: TokenListModalsState["connected"];
  deleteConfirm: TokenListModalsState["deleteConfirm"];
  modalProps: TokenListModalsState["modalProps"];
  executeDelete: TokenListModalsState["executeDelete"];
  setDeleteConfirm: TokenListModalsState["onSetDeleteConfirm"];
  newGroupDialogParent: TokenListModalsState["newGroupDialogParent"];
  newGroupName: TokenListModalsState["newGroupName"];
  newGroupError: TokenListModalsState["newGroupError"];
  setNewGroupName: TokenListModalsState["onSetNewGroupName"];
  setNewGroupError: TokenListModalsState["onSetNewGroupError"];
  handleCreateGroup: TokenListModalsState["handleCreateGroup"];
  setNewGroupDialogParent: TokenListModalsState["onSetNewGroupDialogParent"];
  renameTokenConfirm: TokenListModalsState["renameTokenConfirm"];
  executeTokenRename: TokenListModalsState["executeTokenRename"];
  setRenameTokenConfirm: TokenListModalsState["onSetRenameTokenConfirm"];
  renameGroupConfirm: TokenListModalsState["renameGroupConfirm"];
  executeGroupRename: TokenListModalsState["executeGroupRename"];
  setRenameGroupConfirm: TokenListModalsState["onSetRenameGroupConfirm"];
  varDiffPending: VariableDiffPendingState | null;
  doApplyVariables: TokenListModalsState["doApplyVariables"];
  setVarDiffPending: TokenListModalsState["onSetVarDiffPending"];
  extractToken: TokenListModalsState["extractToken"];
  extractMode: TokenListModalsState["extractMode"];
  setExtractMode: TokenListModalsState["onSetExtractMode"];
  newPrimitivePath: TokenListModalsState["newPrimitivePath"];
  setNewPrimitivePath: TokenListModalsState["onSetNewPrimitivePath"];
  newPrimitiveCollectionId: TokenListModalsState["newPrimitiveCollectionId"];
  setNewPrimitiveCollectionId: TokenListModalsState["onSetNewPrimitiveCollectionId"];
  existingAlias: TokenListModalsState["existingAlias"];
  setExistingAlias: TokenListModalsState["onSetExistingAlias"];
  existingAliasSearch: TokenListModalsState["existingAliasSearch"];
  setExistingAliasSearch: TokenListModalsState["onSetExistingAliasSearch"];
  extractError: TokenListModalsState["extractError"];
  setExtractError: TokenListModalsState["onSetExtractError"];
  handleConfirmExtractToAlias: TokenListModalsState["handleConfirmExtractToAlias"];
  setExtractToken: TokenListModalsState["onSetExtractToken"];
  showFindReplace: TokenListModalsState["showFindReplace"];
  frFind: TokenListModalsState["frFind"];
  frReplace: TokenListModalsState["frReplace"];
  frIsRegex: TokenListModalsState["frIsRegex"];
  frScope: TokenListModalsState["frScope"];
  frTarget: TokenListModalsState["frTarget"];
  frError: TokenListModalsState["frError"];
  frBusy: TokenListModalsState["frBusy"];
  frRegexError: TokenListModalsState["frRegexError"];
  frPreview: TokenListModalsState["frPreview"];
  frValuePreview: TokenListModalsState["frValuePreview"];
  frConflictCount: TokenListModalsState["frConflictCount"];
  frRenameCount: TokenListModalsState["frRenameCount"];
  frValueCount: TokenListModalsState["frValueCount"];
  frAliasImpact: TokenListModalsState["frAliasImpact"];
  frTypeFilter: TokenListModalsState["frTypeFilter"];
  frAvailableTypes: TokenListModalsState["frAvailableTypes"];
  setFrFind: TokenListModalsState["onSetFrFind"];
  setFrReplace: TokenListModalsState["onSetFrReplace"];
  setFrIsRegex: TokenListModalsState["onSetFrIsRegex"];
  setFrScope: TokenListModalsState["onSetFrScope"];
  setFrTarget: TokenListModalsState["onSetFrTarget"];
  setFrTypeFilter: TokenListModalsState["onSetFrTypeFilter"];
  setFrError: TokenListModalsState["onSetFrError"];
  setShowFindReplace: TokenListModalsState["onSetShowFindReplace"];
  handleFindReplace: TokenListModalsState["handleFindReplace"];
  cancelFindReplace: TokenListModalsState["cancelFindReplace"];
  promoteRows: TokenListModalsState["promoteRows"];
  promoteBusy: TokenListModalsState["promoteBusy"];
  setPromoteRows: TokenListModalsState["onSetPromoteRows"];
  handleConfirmPromote: TokenListModalsState["handleConfirmPromote"];
  movingToken: TokenListModalsState["movingToken"];
  movingGroup: TokenListModalsState["movingGroup"];
  moveGroupTargetCollectionId: string;
  moveTokenTargetCollectionId: string;
  setMoveGroupTargetCollectionId: (value: string) => void;
  handleChangeMoveTokenTargetCollection: (value: string) => void;
  setMovingToken: TokenListModalsState["onSetMovingToken"];
  setMovingGroup: TokenListModalsState["onSetMovingGroup"];
  handleConfirmMoveToken: TokenListModalsState["handleConfirmMoveToken"];
  handleConfirmMoveGroup: TokenListModalsState["handleConfirmMoveGroup"];
  moveConflict: Exclude<TokenListModalsState["moveConflict"], undefined>;
  moveConflictAction: Exclude<TokenListModalsState["moveConflictAction"], undefined>;
  setMoveConflictAction: Exclude<TokenListModalsState["onSetMoveConflictAction"], undefined>;
  moveConflictNewPath: string;
  setMoveConflictNewPath: Exclude<TokenListModalsState["onSetMoveConflictNewPath"], undefined>;
  copyingToken: TokenListModalsState["copyingToken"];
  copyingGroup: TokenListModalsState["copyingGroup"];
  copyGroupTargetCollectionId: string;
  copyTokenTargetCollectionId: string;
  setCopyGroupTargetCollectionId: (value: string) => void;
  handleChangeCopyTokenTargetCollection: (value: string) => void;
  setCopyingToken: TokenListModalsState["onSetCopyingToken"];
  setCopyingGroup: TokenListModalsState["onSetCopyingGroup"];
  handleConfirmCopyToken: TokenListModalsState["handleConfirmCopyToken"];
  handleConfirmCopyGroup: TokenListModalsState["handleConfirmCopyGroup"];
  copyConflict: Exclude<TokenListModalsState["copyConflict"], undefined>;
  copyConflictAction: Exclude<TokenListModalsState["copyConflictAction"], undefined>;
  setCopyConflictAction: Exclude<TokenListModalsState["onSetCopyConflictAction"], undefined>;
  copyConflictNewPath: string;
  setCopyConflictNewPath: Exclude<TokenListModalsState["onSetCopyConflictNewPath"], undefined>;
  showMoveToGroup: TokenListModalsState["showMoveToGroup"];
  moveToGroupTarget: TokenListModalsState["moveToGroupTarget"];
  moveToGroupError: TokenListModalsState["moveToGroupError"];
  selectedPaths: Set<string>;
  setShowMoveToGroup: TokenListModalsState["onSetShowMoveToGroup"];
  setMoveToGroupTarget: TokenListModalsState["onSetMoveToGroupTarget"];
  setMoveToGroupError: TokenListModalsState["onSetMoveToGroupError"];
  handleBatchMoveToGroup: TokenListModalsState["handleBatchMoveToGroup"];
  showBatchMoveToCollection: TokenListModalsState["showBatchMoveToCollection"];
  batchMoveToCollectionTarget: TokenListModalsState["batchMoveToCollectionTarget"];
  setBatchMoveToCollectionTarget: TokenListModalsState["onSetBatchMoveToCollectionTarget"];
  setShowBatchMoveToCollection: TokenListModalsState["onSetShowBatchMoveToCollection"];
  handleBatchMoveToCollection: TokenListModalsState["handleBatchMoveToCollection"];
  showBatchCopyToCollection: TokenListModalsState["showBatchCopyToCollection"];
  batchCopyToCollectionTarget: TokenListModalsState["batchCopyToCollectionTarget"];
  setBatchCopyToCollectionTarget: TokenListModalsState["onSetBatchCopyToCollectionTarget"];
  setShowBatchCopyToCollection: TokenListModalsState["onSetShowBatchCopyToCollection"];
  handleBatchCopyToCollection: TokenListModalsState["handleBatchCopyToCollection"];
};

/**
 * Builds the modal context value for TokenListModalsProvider.
 * Extracted to keep the main TokenList orchestrator small.
 */
export function useTokenListModalContext(
  deps: TokenListModalContextDeps,
): TokenListModalsState {
  const moveSourceToken = deps.movingToken
    ? (deps.allTokensFlat[deps.movingToken] ?? null)
    : null;
  const copySourceToken = deps.copyingToken
    ? (deps.allTokensFlat[deps.copyingToken] ?? null)
    : null;

  return {
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
    moveSourceToken,
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
    copySourceToken,
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
  };
}
