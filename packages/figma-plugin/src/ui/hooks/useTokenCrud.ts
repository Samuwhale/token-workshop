import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import type { TokenGenerator } from './useGenerators';
import type { TokenCollection } from '@tokenmanager/core';
import { useTokenRelocate } from './useTokenRelocate';
import { useTokenRename } from './useTokenRename';
import { useTokenDelete } from './useTokenDelete';
import { useTokenDuplicate } from './useTokenDuplicate';
import { useTokenSave } from './useTokenSave';

export interface UseTokenCrudParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  collectionIds: string[];
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  generators?: TokenGenerator[];
  collections?: TokenCollection[];
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshGeneratedGroups?: () => void;
  onSetOperationLoading: (msg: string | null) => void;
  onSetLocallyDeletedPaths: (paths: Set<string>) => void;
  onDeletePaths?: (paths: string[], collectionId: string) => void;
  onRecordTouch: (path: string) => void;
  onRenamePath: (oldPath: string, newPath: string) => void;
  onMovePath?: (
    oldPath: string,
    newPath: string,
    sourceCollectionId: string,
    targetCollectionId: string,
  ) => void;
  onClearSelection: () => void;
  onError?: (msg: string) => void;
}

export function useTokenCrud(params: UseTokenCrudParams) {
  const {
    connected, serverUrl, collectionId, collectionIds, tokens, allTokensFlat, perCollectionFlat,
    generators, collections,
    onRefresh, onPushUndo, onRefreshGeneratedGroups, onSetOperationLoading,
    onSetLocallyDeletedPaths, onDeletePaths, onRecordTouch, onRenamePath,
    onMovePath, onClearSelection, onError,
  } = params;

  const relocate = {
    move: useTokenRelocate({ mode: 'move', connected, serverUrl, collectionId, collectionIds, perCollectionFlat, onRefresh, onMovePath, onSetOperationLoading, onError }),
    copy: useTokenRelocate({ mode: 'copy', connected, serverUrl, collectionId, collectionIds, perCollectionFlat, onRefresh, onError }),
  };

  const rename = useTokenRename({ connected, serverUrl, collectionId, generators, collections, perCollectionFlat, allTokensFlat, onRefresh, onPushUndo, onRenamePath, onSetOperationLoading, onError });

  const del = useTokenDelete({ connected, serverUrl, collectionId, tokens, allTokensFlat, perCollectionFlat, generators, collections, onRefresh, onPushUndo, onSetOperationLoading, onSetLocallyDeletedPaths, onDeletePaths, onClearSelection, onError });

  const dup = useTokenDuplicate({ connected, serverUrl, collectionId, tokens, allTokensFlat, onRefresh, onRecordTouch, onSetOperationLoading, onNewPath: rename.setPendingRenameToken, onError });

  const save = useTokenSave({ connected, serverUrl, collectionId, allTokensFlat, perCollectionFlat, generators, onRefresh, onPushUndo, onRecordTouch, onRefreshGeneratedGroups, onError });

  return {
    // Rename state + callbacks
    renameTokenConfirm: rename.renameTokenConfirm,
    setRenameTokenConfirm: rename.setRenameTokenConfirm,
    pendingRenameToken: rename.pendingRenameToken,
    setPendingRenameToken: rename.setPendingRenameToken,
    executeTokenRename: rename.executeTokenRename,
    handleRenameToken: rename.handleRenameToken,
    // Delete state + callbacks
    deleteConfirm: del.deleteConfirm,
    setDeleteConfirm: del.setDeleteConfirm,
    deleteError: del.deleteError,
    setDeleteError: del.setDeleteError,
    requestDeleteToken: del.requestDeleteToken,
    requestDeleteGroup: del.requestDeleteGroup,
    requestBulkDelete: del.requestBulkDelete,
    executeDelete: del.executeDelete,
    // Duplicate
    handleDuplicateToken: dup.handleDuplicateToken,
    // Save callbacks
    handleInlineSave: save.handleInlineSave,
    handleDescriptionSave: save.handleDescriptionSave,
    handleMultiModeInlineSave: save.handleMultiModeInlineSave,
    handleSaveGeneratedException: save.handleSaveGeneratedException,
    handleDetachFromGenerator: save.handleDetachFromGenerator,
    // Move state + callbacks
    movingToken: relocate.move.relocatingToken,
    setMovingToken: relocate.move.setRelocatingToken,
    moveTokenTargetCollectionId: relocate.move.targetCollectionId,
    setMoveTokenTargetCollectionId: relocate.move.setTargetCollectionId,
    moveFromCollectionId: relocate.move.sourceCollectionId,
    moveConflict: relocate.move.conflict,
    moveConflictAction: relocate.move.conflictAction,
    setMoveConflictAction: relocate.move.setConflictAction,
    moveConflictNewPath: relocate.move.conflictNewPath,
    setMoveConflictNewPath: relocate.move.setConflictNewPath,
    handleRequestMoveToken: relocate.move.handleRequest,
    handleConfirmMoveToken: relocate.move.handleConfirm,
    handleChangeMoveTokenTargetCollection: relocate.move.handleChangeTargetCollection,
    // Copy state + callbacks
    copyingToken: relocate.copy.relocatingToken,
    setCopyingToken: relocate.copy.setRelocatingToken,
    copyTokenTargetCollectionId: relocate.copy.targetCollectionId,
    setCopyTokenTargetCollectionId: relocate.copy.setTargetCollectionId,
    copyFromCollectionId: relocate.copy.sourceCollectionId,
    copyConflict: relocate.copy.conflict,
    copyConflictAction: relocate.copy.conflictAction,
    setCopyConflictAction: relocate.copy.setConflictAction,
    copyConflictNewPath: relocate.copy.conflictNewPath,
    setCopyConflictNewPath: relocate.copy.setConflictNewPath,
    handleRequestCopyToken: relocate.copy.handleRequest,
    handleConfirmCopyToken: relocate.copy.handleConfirm,
    handleChangeCopyTokenTargetCollection: relocate.copy.handleChangeTargetCollection,
  };
}
