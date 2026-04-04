import React, { useRef, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { QuickStartDialog } from './QuickStartDialog';
import { ValuePreview } from './ValuePreview';
import { isAlias } from '../../shared/resolveAlias';
import type { TokenMapEntry } from '../../shared/types';
import type { DeleteConfirm, PromoteRow, AffectedRef } from './tokenListTypes';
import { useTokenListModals } from './TokenListModalsContext';

export interface TokenListModalsProps {
  // Quick Start Dialog
  showScaffold: boolean;
  onSetShowScaffold: (v: boolean) => void;
  serverUrl: string;
  setName: string;
  sets: string[];
  onRefresh: () => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  connected: boolean;

  // Delete confirmation modal
  deleteConfirm: DeleteConfirm | null;
  modalProps: { title: string; description?: string; confirmLabel: string; pathList?: string[]; affectedRefs?: AffectedRef[] } | null;
  executeDelete: () => void;
  onSetDeleteConfirm: (v: DeleteConfirm | null) => void;

  // New group dialog
  newGroupDialogParent: string | null;
  newGroupName: string;
  newGroupError: string;
  onSetNewGroupName: (v: string) => void;
  onSetNewGroupError: (v: string) => void;
  handleCreateGroup: (parent: string, name: string) => void;
  onSetNewGroupDialogParent: (v: string | null) => void;

  // Rename token confirmation modal
  renameTokenConfirm: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; setName: string; tokenPath: string; oldValue: string; newValue: string }> } | null;
  executeTokenRename: (oldPath: string, newPath: string, updateAliases?: boolean) => void;
  onSetRenameTokenConfirm: (v: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; setName: string; tokenPath: string; oldValue: string; newValue: string }> } | null) => void;

  // Rename group confirmation modal
  renameGroupConfirm: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; setName: string; tokenPath: string; oldValue: string; newValue: string }> } | null;
  executeGroupRename: (oldPath: string, newPath: string, updateAliases?: boolean) => void;
  onSetRenameGroupConfirm: (v: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; setName: string; tokenPath: string; oldValue: string; newValue: string }> } | null) => void;

  // Apply as Variables diff preview
  varDiffPending: { added: number; modified: number; unchanged: number; flat: any[] } | null;
  doApplyVariables: (flat: any[]) => void;
  onSetVarDiffPending: (v: { added: number; modified: number; unchanged: number; flat: any[] } | null) => void;

  // Extract to reference modal
  extractToken: { path: string; $type?: string; $value: any } | null;
  extractMode: 'new' | 'existing';
  onSetExtractMode: (v: 'new' | 'existing') => void;
  newPrimitivePath: string;
  onSetNewPrimitivePath: (v: string) => void;
  newPrimitiveSet: string;
  onSetNewPrimitiveSet: (v: string) => void;
  existingAlias: string;
  onSetExistingAlias: (v: string) => void;
  existingAliasSearch: string;
  onSetExistingAliasSearch: (v: string) => void;
  extractError: string;
  onSetExtractError: (v: string) => void;
  handleConfirmExtractToAlias: () => void;
  onSetExtractToken: (v: { path: string; $type?: string; $value: any } | null) => void;

  // Find & Replace modal
  showFindReplace: boolean;
  frFind: string;
  frReplace: string;
  frIsRegex: boolean;
  frScope: 'active' | 'all';
  frTarget: 'names' | 'values';
  frError: string;
  frBusy: boolean;
  frRegexError: string | null;
  frPreview: Array<{ oldPath: string; newPath: string; conflict: boolean; setName: string }>;
  frValuePreview: Array<{ path: string; setName: string; oldValue: string; newValue: string }>;
  frConflictCount: number;
  frRenameCount: number;
  frValueCount: number;
  frAliasImpact: { tokenCount: number };
  onSetFrFind: (v: string) => void;
  onSetFrReplace: (v: string) => void;
  onSetFrIsRegex: (v: boolean) => void;
  frTypeFilter: string;
  frAvailableTypes: string[];
  onSetFrScope: (v: 'active' | 'all') => void;
  onSetFrTarget: (v: 'names' | 'values') => void;
  onSetFrTypeFilter: (v: string) => void;
  onSetFrError: (v: string) => void;
  onSetShowFindReplace: (v: boolean) => void;
  handleFindReplace: () => void;
  cancelFindReplace: () => void;

  // Promote to Semantic modal
  promoteRows: PromoteRow[] | null;
  promoteBusy: boolean;
  onSetPromoteRows: (v: PromoteRow[] | null) => void;
  handleConfirmPromote: () => void;

  // Move token to set modal
  movingToken: string | null;
  movingGroup: string | null;
  moveTargetSet: string;
  onSetMoveTargetSet: (v: string) => void;
  onSetMovingToken: (v: string | null) => void;
  onSetMovingGroup: (v: string | null) => void;
  handleConfirmMoveToken: () => void;
  handleConfirmMoveGroup: () => void;
  moveConflict?: TokenMapEntry | null;
  moveConflictAction?: 'overwrite' | 'skip' | 'rename';
  onSetMoveConflictAction?: (v: 'overwrite' | 'skip' | 'rename') => void;
  moveConflictNewPath?: string;
  onSetMoveConflictNewPath?: (v: string) => void;
  // Source token value for conflict diff (incoming value)
  moveSourceToken?: TokenMapEntry | null;

  // Copy token to set modal
  copyingToken: string | null;
  copyingGroup: string | null;
  copyTargetSet: string;
  onSetCopyTargetSet: (v: string) => void;
  onSetCopyingToken: (v: string | null) => void;
  onSetCopyingGroup: (v: string | null) => void;
  handleConfirmCopyToken: () => void;
  handleConfirmCopyGroup: () => void;
  copyConflict?: TokenMapEntry | null;
  copyConflictAction?: 'overwrite' | 'skip' | 'rename';
  onSetCopyConflictAction?: (v: 'overwrite' | 'skip' | 'rename') => void;
  copyConflictNewPath?: string;
  onSetCopyConflictNewPath?: (v: string) => void;
  // Source token value for conflict diff (incoming value)
  copySourceToken?: TokenMapEntry | null;

  // Move selected tokens to group modal
  showMoveToGroup: boolean;
  moveToGroupTarget: string;
  moveToGroupError: string;
  selectedMoveCount: number;
  onSetShowMoveToGroup: (v: boolean) => void;
  onSetMoveToGroupTarget: (v: string) => void;
  onSetMoveToGroupError: (v: string) => void;
  handleBatchMoveToGroup: () => void;
}

function RenameConfirmModal({ kind, oldPath, newPath, depCount, deps, onConfirm, onCancel }: {
  kind: 'token' | 'group';
  oldPath: string;
  newPath: string;
  depCount: number;
  deps: Array<{ path: string; setName: string; tokenPath: string; oldValue: string; newValue: string }>;
  onConfirm: (updateAliases: boolean) => void;
  onCancel: () => void;
}) {
  const label = oldPath.split('.').pop() ?? oldPath;
  const noun = depCount !== 1 ? 'aliases' : 'alias';
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div ref={dialogRef} className="w-[340px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="rename-confirm-dialog-title">
        <div className="px-4 pt-4 pb-3">
          <h3 id="rename-confirm-dialog-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            Rename {kind} &ldquo;{label}&rdquo;?
          </h3>
          <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
            {depCount} {noun} will be updated across all sets:
          </p>
          {deps.length > 0 && (
            <div className="mt-2 max-h-[180px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              {deps.map((dep, i) => (
                <div key={i} className="px-2 py-1.5 text-[10px] font-mono border-b border-[var(--color-figma-border)] last:border-b-0" title={`${dep.setName}: ${dep.tokenPath}`}>
                  <div className="text-[var(--color-figma-text-secondary)] truncate">
                    <span className="text-[var(--color-figma-text-tertiary)]">{dep.setName}/</span>{dep.tokenPath}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[9px]">
                    <span className="text-[var(--color-figma-text-danger)] line-through truncate max-w-[45%]">{dep.oldValue}</span>
                    <span className="text-[var(--color-figma-text-tertiary)] shrink-0">&rarr;</span>
                    <span className="text-[var(--color-figma-text-success)] truncate max-w-[45%]">{dep.newValue}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          <button
            onClick={() => onConfirm(true)}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
          >
            Update {depCount} {noun} and rename
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Rename only (break references)
          </button>
          <button
            onClick={onCancel}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtractToAliasModal() {
  const {
    allTokensFlat,
    sets,
    extractToken,
    extractMode,
    onSetExtractMode,
    newPrimitivePath,
    onSetNewPrimitivePath,
    newPrimitiveSet,
    onSetNewPrimitiveSet,
    existingAlias,
    onSetExistingAlias,
    existingAliasSearch,
    onSetExistingAliasSearch,
    extractError,
    onSetExtractError,
    handleConfirmExtractToAlias,
    onSetExtractToken,
  } = useTokenListModals();

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onSetExtractToken(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSetExtractToken]);

  if (!extractToken) return null;

  const candidateTokens = Object.entries(allTokensFlat)
    .filter(([path, t]) => path !== extractToken.path && t.$type === extractToken.$type && !isAlias(t.$value))
    .filter(([path]) => !existingAliasSearch || path.toLowerCase().includes(existingAliasSearch.toLowerCase()))
    .slice(0, 40);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSetExtractToken(null); }}
    >
      <div ref={dialogRef} className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 flex flex-col" style={{ maxHeight: '80vh' }} role="dialog" aria-modal="true" aria-labelledby="extract-to-alias-dialog-title">
        <div className="p-4 border-b border-[var(--color-figma-border)]">
          <div id="extract-to-alias-dialog-title" className="text-[12px] font-medium text-[var(--color-figma-text)]">Link to token</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 truncate">
            <span className="font-mono text-[var(--color-figma-text)]">{extractToken.path}</span>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => onSetExtractMode('new')}
            className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${extractMode === 'new' ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          >
            Create new primitive
          </button>
          <button
            onClick={() => onSetExtractMode('existing')}
            className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${extractMode === 'existing' ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          >
            Use existing token
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
          {extractMode === 'new' ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">New primitive path</label>
                <input
                  type="text"
                  value={newPrimitivePath}
                  onChange={e => { onSetNewPrimitivePath(e.target.value); onSetExtractError(''); }}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] font-mono"
                  autoFocus
                  placeholder="e.g. primitives.color.blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Create in set</label>
                <select
                  value={newPrimitiveSet}
                  onChange={e => onSetNewPrimitiveSet(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                >
                  {sets.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={existingAliasSearch}
                onChange={e => onSetExistingAliasSearch(e.target.value)}
                placeholder="Search tokens…"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
                aria-label="Search tokens"
                autoFocus
              />
              <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: '160px' }}>
                {candidateTokens.length === 0 ? (
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-2 text-center">
                    No matching {extractToken.$type} tokens found
                  </div>
                ) : candidateTokens.map(([path, t]) => (
                  <button
                    key={path}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { onSetExistingAlias(path); onSetExtractError(''); }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${existingAlias === path ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]' : 'hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]'}`}
                  >
                    <ValuePreview type={t.$type} value={t.$value} />
                    <span className="text-[10px] font-mono flex-1 truncate">{path}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {extractError && (
            <div role="alert" className="text-[10px] text-[var(--color-figma-error)]">{extractError}</div>
          )}
        </div>

        <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
          <button
            onClick={() => onSetExtractToken(null)}
            className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmExtractToAlias}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
            disabled={extractMode === 'existing' && !existingAlias}
          >
            Extract
          </button>
        </div>
      </div>
    </div>
  );
}

export function TokenListModals() {
  const {
    showScaffold,
    onSetShowScaffold,
    serverUrl,
    setName,
    sets,
    onRefresh,
    allTokensFlat,
    connected,
    deleteConfirm,
    modalProps,
    executeDelete,
    onSetDeleteConfirm,
    newGroupDialogParent,
    newGroupName,
    newGroupError,
    onSetNewGroupName,
    onSetNewGroupError,
    handleCreateGroup,
    onSetNewGroupDialogParent,
    renameTokenConfirm,
    executeTokenRename,
    onSetRenameTokenConfirm,
    renameGroupConfirm,
    executeGroupRename,
    onSetRenameGroupConfirm,
    varDiffPending,
    doApplyVariables,
    onSetVarDiffPending,
    extractToken,
    showFindReplace,
    frFind,
    frReplace,
    frIsRegex,
    frScope,
    frTarget,
    frTypeFilter,
    frAvailableTypes,
    frError,
    frBusy,
    frRegexError,
    frPreview,
    frValuePreview,
    frConflictCount,
    frRenameCount,
    frValueCount,
    frAliasImpact,
    onSetFrFind,
    onSetFrReplace,
    onSetFrIsRegex,
    onSetFrScope,
    onSetFrTarget,
    onSetFrTypeFilter,
    onSetFrError,
    onSetShowFindReplace,
    handleFindReplace,
    cancelFindReplace,
    promoteRows,
    promoteBusy,
    onSetPromoteRows,
    handleConfirmPromote,
    movingToken,
    movingGroup,
    moveTargetSet,
    onSetMoveTargetSet,
    onSetMovingToken,
    onSetMovingGroup,
    handleConfirmMoveToken,
    handleConfirmMoveGroup,
    moveConflict,
    moveConflictAction = 'overwrite',
    onSetMoveConflictAction,
    moveConflictNewPath = '',
    onSetMoveConflictNewPath,
    moveSourceToken,
    copyingToken,
    copyingGroup,
    copyTargetSet,
    onSetCopyTargetSet,
    onSetCopyingToken,
    onSetCopyingGroup,
    handleConfirmCopyToken,
    handleConfirmCopyGroup,
    copyConflict,
    copyConflictAction = 'overwrite',
    onSetCopyConflictAction,
    copyConflictNewPath = '',
    onSetCopyConflictNewPath,
    copySourceToken,
    showMoveToGroup,
    moveToGroupTarget,
    moveToGroupError,
    selectedMoveCount,
    onSetShowMoveToGroup,
    onSetMoveToGroupTarget,
    onSetMoveToGroupError,
    handleBatchMoveToGroup,
  } = useTokenListModals();

  return (
    <>
      {/* Quick Start Dialog */}
      {showScaffold && (
        <QuickStartDialog
          serverUrl={serverUrl}
          activeSet={setName}
          allSets={sets}
          onClose={() => onSetShowScaffold(false)}
          onConfirm={() => { onSetShowScaffold(false); onRefresh(); }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && modalProps && (
        <ConfirmModal
          title={modalProps.title}
          description={modalProps.description}
          confirmLabel={modalProps.confirmLabel}
          danger
          wide={!!(modalProps.pathList || modalProps.affectedRefs)}
          onConfirm={executeDelete}
          onCancel={() => onSetDeleteConfirm(null)}
        >
          {modalProps.pathList && modalProps.pathList.length > 0 && (
            <div className="mt-2 max-h-[140px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              {modalProps.pathList.slice(0, 20).map(p => (
                <div key={p} className="px-2 py-0.5 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate hover:text-[var(--color-figma-text)]" title={p}>
                  {p}
                </div>
              ))}
              {modalProps.pathList.length > 20 && (
                <div className="px-2 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] italic">
                  and {modalProps.pathList.length - 20} more…
                </div>
              )}
            </div>
          )}
          {modalProps.affectedRefs && modalProps.affectedRefs.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[10px] text-[var(--color-figma-text-secondary)]">Affected alias references:</div>
              <div className="max-h-[140px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                {modalProps.affectedRefs.slice(0, 20).map((ref, i) => (
                  <div key={i} className="px-2 py-0.5 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate hover:text-[var(--color-figma-text)]" title={`${ref.setName}/${ref.path}`}>
                    <span className="text-[var(--color-figma-text-tertiary)]">{ref.setName}/</span>{ref.path}
                  </div>
                ))}
                {modalProps.affectedRefs.length > 20 && (
                  <div className="px-2 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] italic">
                    and {modalProps.affectedRefs.length - 20} more…
                  </div>
                )}
              </div>
            </div>
          )}
        </ConfirmModal>
      )}

      {/* New group dialog */}
      {newGroupDialogParent !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); } }}>
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3" role="dialog" aria-modal="true" aria-labelledby="new-group-dialog-title">
            <div id="new-group-dialog-title" className="text-[12px] font-medium text-[var(--color-figma-text)]">New group</div>
            {newGroupDialogParent && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Inside <span className="font-mono text-[var(--color-figma-text)]">{newGroupDialogParent}</span>
              </div>
            )}
            <input
              type="text"
              placeholder={newGroupDialogParent ? 'subgroup-name' : 'group-name'}
              value={newGroupName}
              onChange={e => { onSetNewGroupName(e.target.value); onSetNewGroupError(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateGroup(newGroupDialogParent ?? '', newGroupName);
                if (e.key === 'Escape') { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); }
              }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${newGroupError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              aria-label="New group name"
              autoFocus
            />
            {newGroupError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{newGroupError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); }}
                className="px-3 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateGroup(newGroupDialogParent ?? '', newGroupName)}
                disabled={!newGroupName.trim()}
                className="px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename token confirmation modal */}
      {renameTokenConfirm && (
        <RenameConfirmModal
          kind="token"
          oldPath={renameTokenConfirm.oldPath}
          newPath={renameTokenConfirm.newPath}
          depCount={renameTokenConfirm.depCount}
          deps={renameTokenConfirm.deps}
          onConfirm={(updateAliases) => executeTokenRename(renameTokenConfirm.oldPath, renameTokenConfirm.newPath, updateAliases)}
          onCancel={() => onSetRenameTokenConfirm(null)}
        />
      )}

      {/* Rename group confirmation modal */}
      {renameGroupConfirm && (
        <RenameConfirmModal
          kind="group"
          oldPath={renameGroupConfirm.oldPath}
          newPath={renameGroupConfirm.newPath}
          depCount={renameGroupConfirm.depCount}
          deps={renameGroupConfirm.deps}
          onConfirm={(updateAliases) => executeGroupRename(renameGroupConfirm.oldPath, renameGroupConfirm.newPath, updateAliases)}
          onCancel={() => onSetRenameGroupConfirm(null)}
        />
      )}

      {/* Apply as Variables diff preview modal */}
      {varDiffPending && (
        <ConfirmModal
          title="Apply as Figma Variables"
          confirmLabel="Apply"
          onConfirm={() => {
            doApplyVariables(varDiffPending.flat);
            onSetVarDiffPending(null);
          }}
          onCancel={() => onSetVarDiffPending(null)}
        >
          <div className="mt-2 text-[10px] space-y-1 text-[var(--color-figma-text-secondary)]">
            <p>{varDiffPending.flat.length} token{varDiffPending.flat.length !== 1 ? 's' : ''} will be pushed to Figma:</p>
            {(varDiffPending.added > 0 || varDiffPending.modified > 0 || varDiffPending.unchanged > 0) && (
              <div className="mt-1.5 rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)] overflow-hidden">
                {varDiffPending.added > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className="text-[var(--color-figma-success)] font-medium">+{varDiffPending.added}</span>
                    <span>new variable{varDiffPending.added !== 1 ? 's' : ''} will be created</span>
                  </div>
                )}
                {varDiffPending.modified > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className="text-yellow-600 font-medium">~{varDiffPending.modified}</span>
                    <span>existing variable{varDiffPending.modified !== 1 ? 's' : ''} will be updated</span>
                  </div>
                )}
                {varDiffPending.unchanged > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[var(--color-figma-text-tertiary)]">
                    <span>{varDiffPending.unchanged} unchanged</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </ConfirmModal>
      )}

      {/* Extract to reference modal */}
      {extractToken && (
        <ExtractToAliasModal />
      )}

      {/* Find & Replace modal */}
      {showFindReplace && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="p-4 border-b border-[var(--color-figma-border)]">
              <div className="text-[12px] font-medium text-[var(--color-figma-text)]">
                {frTarget === 'values' ? 'Find & Replace Token Values' : 'Find & Replace Token Names'}
              </div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
                {frTarget === 'values'
                  ? frScope === 'active'
                    ? <>Replace token values in <span className="font-mono text-[var(--color-figma-text)]">{setName}</span></>
                    : <>Replace token values across <span className="font-medium text-[var(--color-figma-text)]">all sets</span></>
                  : frScope === 'active'
                    ? <>Replace path segments across all tokens in <span className="font-mono text-[var(--color-figma-text)]">{setName}</span></>
                    : <>Replace path segments across <span className="font-medium text-[var(--color-figma-text)]">all sets</span></>
                }
              </div>
              {/* Target toggle */}
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Find by:</span>
                <button
                  onClick={() => { onSetFrTarget('names'); onSetFrError(''); }}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${frTarget === 'names' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  Names
                </button>
                <button
                  onClick={() => { onSetFrTarget('values'); onSetFrError(''); }}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${frTarget === 'values' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  Values
                </button>
              </div>
              {/* Scope toggle */}
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Scope:</span>
                <button
                  onClick={() => { onSetFrScope('active'); onSetFrError(''); }}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${frScope === 'active' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  Active set
                </button>
                <button
                  onClick={() => { onSetFrScope('all'); onSetFrError(''); }}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${frScope === 'all' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  All sets
                </button>
              </div>
              {/* Type filter */}
              {frAvailableTypes.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Type:</span>
                  <select
                    value={frTypeFilter}
                    onChange={e => { onSetFrTypeFilter(e.target.value); onSetFrError(''); }}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] cursor-pointer"
                  >
                    <option value="all">All types</option>
                    {frAvailableTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Find</label>
                <input
                  type="text"
                  value={frFind}
                  onChange={e => { onSetFrFind(e.target.value); onSetFrError(''); }}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                  autoFocus
                  placeholder={frTarget === 'values'
                    ? (frIsRegex ? 'e.g. ^#[Ff][Ff]' : 'e.g. #FF0000')
                    : (frIsRegex ? 'e.g. ^colors\\.' : 'e.g. colors')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Replace with</label>
                <input
                  type="text"
                  value={frReplace}
                  onChange={e => onSetFrReplace(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                  placeholder={frTarget === 'values'
                    ? (frIsRegex ? 'e.g. #EE' : 'e.g. #EE0000')
                    : (frIsRegex ? 'e.g. palette.' : 'e.g. palette')}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={frIsRegex}
                  onChange={e => { onSetFrIsRegex(e.target.checked); onSetFrError(''); }}
                  className="accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Use regex</span>
              </label>

              {/* Preview */}
              {frFind && frIsRegex && frRegexError && (
                <div role="alert" className="text-[10px] text-[var(--color-figma-error)]">Invalid regex: {frRegexError}</div>
              )}

              {frTarget === 'names' && (() => {
                if (frFind && !frRegexError && frPreview.length === 0) {
                  return <div className="text-[10px] text-[var(--color-figma-text-secondary)] italic">No token paths match{frScope === 'all' ? ' in any set' : ''}.</div>;
                }
                if (frPreview.length === 0) return null;

                const renderRenameItem = (oldPath: string, newPath: string, conflict: boolean, key: string) => {
                  let matchStart = -1, matchLen = 0;
                  if (frIsRegex) {
                    try {
                      const m = new RegExp(frFind).exec(oldPath);
                      if (m) { matchStart = m.index; matchLen = m[0].length; }
                    } catch (e) { console.debug('[TokenListModals] regex compilation failed:', e); }
                  } else {
                    const idx = oldPath.indexOf(frFind);
                    if (idx >= 0) { matchStart = idx; matchLen = frFind.length; }
                  }
                  const hi = matchStart >= 0;
                  const newIdx = (!frIsRegex && hi && frReplace !== '') ? newPath.indexOf(frReplace, matchStart) : -1;
                  return (
                    <div key={key} className={`text-[10px] font-mono rounded px-2 py-1 ${conflict ? 'bg-red-50 border border-red-300 text-red-700' : 'bg-[var(--color-figma-bg-secondary)]'}`}>
                      <div className="truncate text-[var(--color-figma-text-secondary)] line-through">
                        {hi
                          ? <>{oldPath.slice(0, matchStart)}<span className="bg-red-100/80 rounded-sm">{oldPath.slice(matchStart, matchStart + matchLen)}</span>{oldPath.slice(matchStart + matchLen)}</>
                          : oldPath}
                      </div>
                      <div className="truncate text-[var(--color-figma-text)]">
                        {newIdx >= 0
                          ? <>{newPath.slice(0, newIdx)}<span className="bg-green-100/80 rounded-sm">{frReplace}</span>{newPath.slice(newIdx + frReplace.length)}</>
                          : newPath}
                      </div>
                      {conflict && <div className="text-[10px] text-red-600 mt-0.5">⚠ conflicts with existing token — will be skipped</div>}
                    </div>
                  );
                };

                if (frScope === 'active') {
                  return (
                    <div className="flex flex-col gap-0.5">
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
                        {frRenameCount} token{frRenameCount !== 1 ? 's' : ''} will be renamed{frConflictCount > 0 && (
                          <span className="text-amber-600"> — {frConflictCount} skipped (conflict{frConflictCount !== 1 ? 's' : ''})</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '200px' }}>
                        {frPreview.map(({ oldPath, newPath, conflict }) => renderRenameItem(oldPath, newPath, conflict, oldPath))}
                      </div>
                    </div>
                  );
                }

                // All sets mode: group by setName
                const setNames = [...new Set(frPreview.map(r => r.setName))];
                return (
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
                      {frRenameCount} token{frRenameCount !== 1 ? 's' : ''} across {setNames.length} set{setNames.length !== 1 ? 's' : ''} will be renamed{frConflictCount > 0 && (
                        <span className="text-amber-600"> — {frConflictCount} skipped (conflict{frConflictCount !== 1 ? 's' : ''})</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '240px' }}>
                      {setNames.map(sn => {
                        const setRenames = frPreview.filter(r => r.setName === sn);
                        const setRenameCount = setRenames.filter(r => !r.conflict).length;
                        const setConflictCount = setRenames.filter(r => r.conflict).length;
                        return (
                          <div key={sn} className="flex flex-col gap-0.5">
                            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] px-1 flex items-center gap-1">
                              <span className="font-mono text-[var(--color-figma-text)]">{sn}</span>
                              <span>— {setRenameCount} rename{setRenameCount !== 1 ? 's' : ''}{setConflictCount > 0 && <span className="text-amber-600">, {setConflictCount} skipped</span>}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              {setRenames.map(({ oldPath, newPath, conflict }) => renderRenameItem(oldPath, newPath, conflict, `${sn}:${oldPath}`))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {frTarget === 'values' && (() => {
                if (frFind && !frRegexError && frValuePreview.length === 0) {
                  return <div className="text-[10px] text-[var(--color-figma-text-secondary)] italic">No token values match{frScope === 'all' ? ' in any set' : ''}.</div>;
                }
                if (frValuePreview.length === 0) return null;

                const renderValueItem = (path: string, oldValue: string, newValue: string, sn: string, key: string) => {
                  let matchStart = -1, matchLen = 0;
                  if (frIsRegex) {
                    try {
                      const m = new RegExp(frFind).exec(oldValue);
                      if (m) { matchStart = m.index; matchLen = m[0].length; }
                    } catch { /* ignore */ }
                  } else {
                    const idx = oldValue.indexOf(frFind);
                    if (idx >= 0) { matchStart = idx; matchLen = frFind.length; }
                  }
                  const hi = matchStart >= 0;
                  const newIdx = (!frIsRegex && hi && frReplace !== '') ? newValue.indexOf(frReplace, matchStart) : -1;
                  return (
                    <div key={key} className="text-[10px] font-mono rounded px-2 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <div className="truncate text-[var(--color-figma-text-secondary)] text-[9px] mb-0.5">{frScope === 'all' ? `${sn} › ` : ''}{path}</div>
                      <div className="truncate text-[var(--color-figma-text-secondary)] line-through">
                        {hi
                          ? <>{oldValue.slice(0, matchStart)}<span className="bg-red-100/80 rounded-sm">{oldValue.slice(matchStart, matchStart + matchLen)}</span>{oldValue.slice(matchStart + matchLen)}</>
                          : oldValue}
                      </div>
                      <div className="truncate text-[var(--color-figma-text)]">
                        {newIdx >= 0
                          ? <>{newValue.slice(0, newIdx)}<span className="bg-green-100/80 rounded-sm">{frReplace}</span>{newValue.slice(newIdx + frReplace.length)}</>
                          : newValue}
                      </div>
                    </div>
                  );
                };

                if (frScope === 'active') {
                  return (
                    <div className="flex flex-col gap-0.5">
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
                        {frValueCount} token value{frValueCount !== 1 ? 's' : ''} will be updated
                      </div>
                      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '200px' }}>
                        {frValuePreview.map(({ path, oldValue, newValue, setName: sn }) => renderValueItem(path, oldValue, newValue, sn, path))}
                      </div>
                    </div>
                  );
                }

                // All sets mode: group by setName
                const setNames = [...new Set(frValuePreview.map(r => r.setName))];
                return (
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
                      {frValueCount} token value{frValueCount !== 1 ? 's' : ''} across {setNames.length} set{setNames.length !== 1 ? 's' : ''} will be updated
                    </div>
                    <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '240px' }}>
                      {setNames.map(sn => {
                        const setItems = frValuePreview.filter(r => r.setName === sn);
                        return (
                          <div key={sn} className="flex flex-col gap-0.5">
                            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] px-1 flex items-center gap-1">
                              <span className="font-mono text-[var(--color-figma-text)]">{sn}</span>
                              <span>— {setItems.length} update{setItems.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              {setItems.map(({ path, oldValue, newValue }) => renderValueItem(path, oldValue, newValue, sn, `${sn}:${path}`))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {frBusy && (
                <div className="flex items-center gap-2 text-[10px] text-[var(--color-figma-text-secondary)] py-1">
                  <Spinner size="sm" />
                  {frTarget === 'values'
                    ? <>Updating {frValueCount} token value{frValueCount !== 1 ? 's' : ''}…</>
                    : <>Renaming {frRenameCount} token{frRenameCount !== 1 ? 's' : ''}…</>
                  }
                </div>
              )}
              {frError && <div role="alert" className="text-[10px] text-[var(--color-figma-error)]">{frError}</div>}
              {!frError && frTarget === 'names' && frReplace === '' && frPreview.length > 0 && (
                <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  ⚠ Empty replacement will delete the matched segment from token paths. This may break references.
                </div>
              )}
              {!frError && frTarget === 'names' && frAliasImpact.tokenCount > 0 && frRenameCount > 0 && (
                <div className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1.5">
                  ℹ {frAliasImpact.tokenCount} other token{frAliasImpact.tokenCount !== 1 ? 's' : ''} reference{frAliasImpact.tokenCount === 1 ? 's' : ''} the renamed path{frRenameCount !== 1 ? 's' : ''} — {frAliasImpact.tokenCount !== 1 ? 'their' : 'its'} alias values will be updated automatically.
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
              {frBusy ? (
                <button
                  onClick={cancelFindReplace}
                  className="px-3 py-1.5 rounded text-[11px] text-red-500 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  {frTarget === 'values' ? 'Cancel update' : 'Cancel rename'}
                </button>
              ) : (
                <button
                  onClick={() => { onSetShowFindReplace(false); onSetFrFind(''); onSetFrReplace(''); onSetFrIsRegex(false); onSetFrError(''); }}
                  className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Cancel
                </button>
              )}
              {frTarget === 'names' ? (
                <button
                  onClick={handleFindReplace}
                  disabled={!frFind || frBusy || frPreview.length === 0 || frPreview.every(r => r.conflict)}
                  className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
                >
                  {frBusy ? 'Renaming…' : `Rename ${frRenameCount}`}
                </button>
              ) : (
                <button
                  onClick={handleFindReplace}
                  disabled={!frFind || frBusy || frValuePreview.length === 0}
                  className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
                >
                  {frBusy ? 'Updating…' : `Update ${frValueCount}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Promote to Semantic (Convert to Aliases) modal */}
      {promoteRows !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-96 flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="p-4 border-b border-[var(--color-figma-border)]">
              <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Link to tokens</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">Each token will be replaced with a reference to the matched primitive.</div>
            </div>
            <div className="flex flex-col gap-0 overflow-y-auto flex-1">
              {promoteRows.length === 0 && (
                <div className="p-4 text-[11px] text-[var(--color-figma-text-secondary)] italic">No raw-value tokens selected.</div>
              )}
              {promoteRows.map((row, idx) => (
                <div key={row.path} className={`flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] ${!row.proposedAlias ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={row.accepted && row.proposedAlias !== null}
                    disabled={row.proposedAlias === null}
                    onChange={e => onSetPromoteRows(promoteRows && promoteRows.map((r, i) => i === idx ? { ...r, accepted: e.target.checked } : r))}
                    aria-label={`Promote ${row.path} to alias`}
                    className="mt-0.5 accent-[var(--color-figma-accent)] shrink-0"
                  />
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <ValuePreview type={row.$type} value={row.$value} />
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{row.path}</span>
                    </div>
                    {row.proposedAlias ? (
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        → <span className="font-mono text-[var(--color-figma-accent)]">{`{${row.proposedAlias}}`}</span>
                        {row.$type === 'color' && row.deltaE !== undefined && (
                          <span
                            className="ml-1 text-[10px] opacity-60"
                            title={`ΔE=${row.deltaE.toFixed(2)} — color difference score (lower is better)`}
                          >
                            {row.deltaE < 1 ? 'Exact' : row.deltaE < 5 ? 'Close' : 'Approximate'}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)] italic">No matching primitive found</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
              <button
                onClick={() => onSetPromoteRows(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPromote}
                disabled={promoteBusy || promoteRows.every(r => !r.accepted || !r.proposedAlias)}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {promoteBusy ? 'Converting…' : `Convert ${promoteRows.filter(r => r.accepted && r.proposedAlias).length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move token to set modal */}
      {movingToken && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Move token to set</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{movingToken}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination set</label>
              <select
                value={moveTargetSet}
                onChange={e => onSetMoveTargetSet(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {sets.filter(s => s !== setName).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {moveConflict && (
              <div className="flex flex-col gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary,var(--color-figma-bg))] p-2">
                <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-text-warning,#f59e0b)]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Conflict: token exists in target set
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[var(--color-figma-text-secondary)]">Existing</span>
                    <span className="font-mono text-[var(--color-figma-text)] truncate">
                      <ValuePreview value={moveConflict.$value} type={moveConflict.$type} />
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[var(--color-figma-text-secondary)]">Incoming</span>
                    <span className="font-mono text-[var(--color-figma-text)] truncate">
                      {moveSourceToken
                        ? <ValuePreview value={moveSourceToken.$value} type={moveSourceToken.$type} />
                        : <span className="text-[var(--color-figma-text-secondary)]">—</span>}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {(['overwrite', 'skip', 'rename'] as const).map(action => (
                    <button
                      key={action}
                      onClick={() => onSetMoveConflictAction?.(action)}
                      className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                        moveConflictAction === action
                          ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
                          : 'bg-transparent text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {action.charAt(0).toUpperCase() + action.slice(1)}
                    </button>
                  ))}
                </div>
                {moveConflictAction === 'rename' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-[var(--color-figma-text-secondary)]">New path in target set</label>
                    <input
                      type="text"
                      value={moveConflictNewPath}
                      onChange={e => onSetMoveConflictNewPath?.(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                      placeholder="e.g. color.primary.new"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetMovingToken(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMoveToken}
                disabled={!moveTargetSet || (moveConflictAction === 'rename' && !moveConflictNewPath.trim())}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {moveConflict && moveConflictAction === 'skip' ? 'Skip' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy token to set modal */}
      {copyingToken && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Copy token to set</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{copyingToken}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination set</label>
              <select
                value={copyTargetSet}
                onChange={e => onSetCopyTargetSet(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {sets.filter(s => s !== setName).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            {copyConflict && (
              <div className="flex flex-col gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary,var(--color-figma-bg))] p-2">
                <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-text-warning,#f59e0b)]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Conflict: token exists in target set
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[var(--color-figma-text-secondary)]">Existing</span>
                    <span className="font-mono text-[var(--color-figma-text)] truncate">
                      <ValuePreview value={copyConflict.$value} type={copyConflict.$type} />
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[var(--color-figma-text-secondary)]">Incoming</span>
                    <span className="font-mono text-[var(--color-figma-text)] truncate">
                      {copySourceToken
                        ? <ValuePreview value={copySourceToken.$value} type={copySourceToken.$type} />
                        : <span className="text-[var(--color-figma-text-secondary)]">—</span>}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {(['overwrite', 'skip', 'rename'] as const).map(action => (
                    <button
                      key={action}
                      onClick={() => onSetCopyConflictAction?.(action)}
                      className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                        copyConflictAction === action
                          ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
                          : 'bg-transparent text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {action.charAt(0).toUpperCase() + action.slice(1)}
                    </button>
                  ))}
                </div>
                {copyConflictAction === 'rename' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-[var(--color-figma-text-secondary)]">New path in target set</label>
                    <input
                      type="text"
                      value={copyConflictNewPath}
                      onChange={e => onSetCopyConflictNewPath?.(e.target.value)}
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                      placeholder="e.g. color.primary.new"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetCopyingToken(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCopyToken}
                disabled={!copyTargetSet || (copyConflictAction === 'rename' && !copyConflictNewPath.trim())}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {copyConflict && copyConflictAction === 'skip' ? 'Skip' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move group to set modal */}
      {movingGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Move group to set</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{movingGroup}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination set</label>
              <select
                value={moveTargetSet}
                onChange={e => onSetMoveTargetSet(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {sets.filter(s => s !== setName).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetMovingGroup(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMoveGroup}
                disabled={!moveTargetSet}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy group to set modal */}
      {copyingGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Copy group to set</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{copyingGroup}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination set</label>
              <select
                value={copyTargetSet}
                onChange={e => onSetCopyTargetSet(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {sets.filter(s => s !== setName).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetCopyingGroup(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCopyGroup}
                disabled={!copyTargetSet}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move selected tokens to group modal */}
      {showMoveToGroup && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); } }}
        >
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''} to group</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Enter the target group path. Token names are preserved.
            </div>
            <input
              type="text"
              placeholder="e.g. colors.brand"
              value={moveToGroupTarget}
              onChange={e => { onSetMoveToGroupTarget(e.target.value); onSetMoveToGroupError(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && moveToGroupTarget.trim()) handleBatchMoveToGroup();
                if (e.key === 'Escape') { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); }
              }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)] ${moveToGroupError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              aria-label="Target group path"
              autoFocus
            />
            {moveToGroupError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{moveToGroupError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); }}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchMoveToGroup}
                disabled={!moveToGroupTarget.trim()}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
