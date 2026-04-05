import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import type { TokenGenerator } from './useGenerators';
import type { ThemeDimension } from '@tokenmanager/core';
import { useTokenRelocate } from './useTokenRelocate';
import { useTokenRename } from './useTokenRename';
import { useTokenDelete } from './useTokenDelete';
import { useTokenDuplicate } from './useTokenDuplicate';
import { useTokenSave } from './useTokenSave';

export interface UseTokenCrudParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  sets: string[];
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  generators?: TokenGenerator[];
  dimensions?: ThemeDimension[];
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshGenerators?: () => void;
  onSetOperationLoading: (msg: string | null) => void;
  onSetLocallyDeletedPaths: (paths: Set<string>) => void;
  onRecordTouch: (path: string) => void;
  onRenamePath: (oldPath: string, newPath: string) => void;
  onClearSelection: () => void;
  onError?: (msg: string) => void;
}

export function useTokenCrud(params: UseTokenCrudParams) {
  const {
    connected, serverUrl, setName, sets, tokens, allTokensFlat, perSetFlat,
    generators, dimensions,
    onRefresh, onPushUndo, onRefreshGenerators, onSetOperationLoading,
    onSetLocallyDeletedPaths, onRecordTouch, onRenamePath, onClearSelection, onError,
  } = params;

  const relocate = {
    move: useTokenRelocate({ mode: 'move', connected, serverUrl, setName, sets, perSetFlat, onRefresh, onSetOperationLoading, onError }),
    copy: useTokenRelocate({ mode: 'copy', connected, serverUrl, setName, sets, perSetFlat, onRefresh, onError }),
  };

  const rename = useTokenRename({ connected, serverUrl, setName, generators, dimensions, perSetFlat, allTokensFlat, onRefresh, onPushUndo, onRenamePath, onSetOperationLoading, onError });

  const del = useTokenDelete({ connected, serverUrl, setName, tokens, allTokensFlat, perSetFlat, generators, dimensions, onRefresh, onPushUndo, onSetOperationLoading, onSetLocallyDeletedPaths, onClearSelection, onError });

  const dup = useTokenDuplicate({ connected, serverUrl, setName, tokens, allTokensFlat, onRefresh, onRecordTouch, onSetOperationLoading, onNewPath: rename.setPendingRenameToken, onError });

  const save = useTokenSave({ connected, serverUrl, setName, allTokensFlat, perSetFlat, onRefresh, onPushUndo, onRecordTouch, onRefreshGenerators, onError });

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
    handleDetachFromGenerator: save.handleDetachFromGenerator,
    // Move state + callbacks
    movingToken: relocate.move.relocatingToken,
    setMovingToken: relocate.move.setRelocatingToken,
    moveTokenTargetSet: relocate.move.targetSet,
    setMoveTokenTargetSet: relocate.move.setTargetSet,
    moveFromSet: relocate.move.fromSet,
    moveConflict: relocate.move.conflict,
    moveConflictAction: relocate.move.conflictAction,
    setMoveConflictAction: relocate.move.setConflictAction,
    moveConflictNewPath: relocate.move.conflictNewPath,
    setMoveConflictNewPath: relocate.move.setConflictNewPath,
    handleRequestMoveToken: relocate.move.handleRequest,
    handleConfirmMoveToken: relocate.move.handleConfirm,
    handleChangeMoveTokenTargetSet: relocate.move.handleChangeTargetSet,
    // Copy state + callbacks
    copyingToken: relocate.copy.relocatingToken,
    setCopyingToken: relocate.copy.setRelocatingToken,
    copyTokenTargetSet: relocate.copy.targetSet,
    setCopyTokenTargetSet: relocate.copy.setTargetSet,
    copyFromSet: relocate.copy.fromSet,
    copyConflict: relocate.copy.conflict,
    copyConflictAction: relocate.copy.conflictAction,
    setCopyConflictAction: relocate.copy.setConflictAction,
    copyConflictNewPath: relocate.copy.conflictNewPath,
    setCopyConflictNewPath: relocate.copy.setConflictNewPath,
    handleRequestCopyToken: relocate.copy.handleRequest,
    handleConfirmCopyToken: relocate.copy.handleConfirm,
    handleChangeCopyTokenTargetSet: relocate.copy.handleChangeTargetSet,
  };
}
