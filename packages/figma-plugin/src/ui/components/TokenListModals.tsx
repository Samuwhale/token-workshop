import React from 'react';
import { ConfirmModal } from './ConfirmModal';
import { QuickStartDialog } from './QuickStartDialog';
import { ValuePreview } from './ValuePreview';
import { isAlias } from '../../shared/resolveAlias';
import type { TokenMapEntry } from '../../shared/types';
import type { DeleteConfirm, PromoteRow } from './tokenListTypes';

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
  modalProps: { title: string; description?: string; confirmLabel: string } | null;
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
  renameTokenConfirm: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; setName: string }> } | null;
  executeTokenRename: (oldPath: string, newPath: string) => void;
  onSetRenameTokenConfirm: (v: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; setName: string }> } | null) => void;

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
  frError: string;
  frBusy: boolean;
  frRegexError: string | null;
  frPreview: Array<{ oldPath: string; newPath: string; conflict: boolean }>;
  onSetFrFind: (v: string) => void;
  onSetFrReplace: (v: string) => void;
  onSetFrIsRegex: (v: boolean) => void;
  onSetFrError: (v: string) => void;
  onSetShowFindReplace: (v: boolean) => void;
  handleFindReplace: () => void;

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
}

export function TokenListModals(props: TokenListModalsProps) {
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
    varDiffPending,
    doApplyVariables,
    onSetVarDiffPending,
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
    showFindReplace,
    frFind,
    frReplace,
    frIsRegex,
    frError,
    frBusy,
    frRegexError,
    frPreview,
    onSetFrFind,
    onSetFrReplace,
    onSetFrIsRegex,
    onSetFrError,
    onSetShowFindReplace,
    handleFindReplace,
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
  } = props;

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
          onConfirm={executeDelete}
          onCancel={() => onSetDeleteConfirm(null)}
        />
      )}

      {/* New group dialog */}
      {newGroupDialogParent !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">New group</div>
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
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${newGroupError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              autoFocus
            />
            {newGroupError && <p className="text-[10px] text-[var(--color-figma-error)]">{newGroupError}</p>}
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
        <ConfirmModal
          title={`Rename "${renameTokenConfirm.oldPath.split('.').pop()}"?`}
          description={`${renameTokenConfirm.depCount} token${renameTokenConfirm.depCount !== 1 ? 's' : ''} reference this token. All references will be updated to "${renameTokenConfirm.newPath}".`}
          confirmLabel="Rename and update references"
          onConfirm={() => executeTokenRename(renameTokenConfirm.oldPath, renameTokenConfirm.newPath)}
          onCancel={() => onSetRenameTokenConfirm(null)}
        >
          {renameTokenConfirm.deps.length > 0 && (
            <div className="mt-2 max-h-[120px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              {renameTokenConfirm.deps.map((dep, i) => (
                <div key={i} className="px-2 py-1 text-[10px] font-mono text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] last:border-b-0 truncate" title={`${dep.setName}: ${dep.path}`}>
                  <span className="text-[var(--color-figma-text-tertiary)]">{dep.setName}/</span>{dep.path}
                </div>
              ))}
            </div>
          )}
        </ConfirmModal>
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
      {extractToken && (() => {
        const candidateTokens = Object.entries(allTokensFlat)
          .filter(([path, t]) => path !== extractToken.path && t.$type === extractToken.$type && !isAlias(t.$value))
          .filter(([path]) => !existingAliasSearch || path.toLowerCase().includes(existingAliasSearch.toLowerCase()))
          .slice(0, 40);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 flex flex-col" style={{ maxHeight: '80vh' }}>
              <div className="p-4 border-b border-[var(--color-figma-border)]">
                <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Link to token</div>
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
                        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono"
                        autoFocus
                        placeholder="e.g. primitives.color.blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Create in set</label>
                      <select
                        value={newPrimitiveSet}
                        onChange={e => onSetNewPrimitiveSet(e.target.value)}
                        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
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
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
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
                  <div className="text-[10px] text-[var(--color-figma-error)]">{extractError}</div>
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
      })()}

      {/* Find & Replace modal */}
      {showFindReplace && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="p-4 border-b border-[var(--color-figma-border)]">
              <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Find &amp; Replace Token Names</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">Replace path segments across all tokens in <span className="font-mono text-[var(--color-figma-text)]">{setName}</span></div>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Find</label>
                <input
                  type="text"
                  value={frFind}
                  onChange={e => { onSetFrFind(e.target.value); onSetFrError(''); }}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
                  autoFocus
                  placeholder={frIsRegex ? 'e.g. ^colors\\.' : 'e.g. colors'}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Replace with</label>
                <input
                  type="text"
                  value={frReplace}
                  onChange={e => onSetFrReplace(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
                  placeholder={frIsRegex ? 'e.g. palette.' : 'e.g. palette'}
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
                <div className="text-[10px] text-[var(--color-figma-error)]">Invalid regex: {frRegexError}</div>
              )}
              {frFind && !frRegexError && frPreview.length === 0 && (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] italic">No token paths match.</div>
              )}
              {frPreview.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">{frPreview.length} token{frPreview.length !== 1 ? 's' : ''} will change:</div>
                  <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '200px' }}>
                    {frPreview.map(({ oldPath, newPath, conflict }) => {
                      // Locate the matched segment in oldPath for highlighting
                      let matchStart = -1, matchLen = 0;
                      if (frIsRegex) {
                        try {
                          const m = new RegExp(frFind).exec(oldPath);
                          if (m) { matchStart = m.index; matchLen = m[0].length; }
                        } catch {}
                      } else {
                        const idx = oldPath.indexOf(frFind);
                        if (idx >= 0) { matchStart = idx; matchLen = frFind.length; }
                      }
                      const hi = matchStart >= 0;
                      // For non-regex, also locate frReplace in newPath for green highlight
                      const newIdx = (!frIsRegex && hi && frReplace !== '') ? newPath.indexOf(frReplace, matchStart) : -1;
                      return (
                        <div key={oldPath} className={`text-[10px] font-mono rounded px-2 py-1 ${conflict ? 'bg-red-50 border border-red-300 text-red-700' : 'bg-[var(--color-figma-bg-secondary)]'}`}>
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
                          {conflict && <div className="text-[9px] text-red-600 mt-0.5">⚠ conflicts with existing token — will be skipped</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {frError && <div className="text-[10px] text-[var(--color-figma-error)]">{frError}</div>}
              {!frError && frReplace === '' && frPreview.length > 0 && (
                <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  ⚠ Empty replacement will delete the matched segment from token paths. This may break references.
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
              <button
                onClick={() => { onSetShowFindReplace(false); onSetFrFind(''); onSetFrReplace(''); onSetFrIsRegex(false); onSetFrError(''); }}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFindReplace}
                disabled={!frFind || frBusy || frPreview.length === 0 || frPreview.every(r => r.conflict)}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {frBusy ? 'Renaming…' : `Rename ${frPreview.filter(r => !r.conflict).length}`}
              </button>
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
                            className="ml-1 text-[9px] opacity-60"
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
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Move token to set</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{movingToken}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination set</label>
              <select
                value={moveTargetSet}
                onChange={e => onSetMoveTargetSet(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              >
                {sets.filter(s => s !== setName).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetMovingToken(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMoveToken}
                disabled={!moveTargetSet}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Move
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
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
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
    </>
  );
}
