import React, { useState, useRef, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ConfirmModal } from './ConfirmModal';
import { ValuePreview } from './ValuePreview';
import { isAlias } from '../../shared/resolveAlias';
import type { TokenMapEntry } from '../../shared/types';
import type { DeleteConfirm, PromoteRow, AffectedRef, RecipeImpact, ModeImpact } from './tokenListTypes';
import { useTokenListModals } from './TokenListModalsContext';
import { FieldMessage } from '../shared/FieldMessage';
import { NoticePill } from '../shared/noticeSystem';
import { fieldBorderClass } from '../shared/editorClasses';
import type {
  ExtractAliasTokenDraft,
  VariableDiffPendingState,
} from '../shared/tokenListModalTypes';

export interface TokenListModalsProps {
  collectionId: string;
  collectionIds: string[];
  allTokensFlat: Record<string, TokenMapEntry>;
  connected: boolean;

  // Delete confirmation modal
  deleteConfirm: DeleteConfirm | null;
  modalProps: { title: string; description?: string; confirmLabel: string; pathList?: string[]; affectedRefs?: AffectedRef[]; recipeImpacts?: RecipeImpact[]; modeImpacts?: ModeImpact[] } | null;
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
  renameTokenConfirm: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }>; recipeImpacts: RecipeImpact[]; modeImpacts: ModeImpact[] } | null;
  executeTokenRename: (oldPath: string, newPath: string, updateAliases?: boolean) => void;
  onSetRenameTokenConfirm: (v: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }>; recipeImpacts: RecipeImpact[]; modeImpacts: ModeImpact[] } | null) => void;

  // Rename group confirmation modal
  renameGroupConfirm: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }> } | null;
  executeGroupRename: (oldPath: string, newPath: string, updateAliases?: boolean) => void;
  onSetRenameGroupConfirm: (v: { oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }> } | null) => void;

  // Apply as Variables diff preview
  varDiffPending: VariableDiffPendingState | null;
  doApplyVariables: (flat: VariableDiffPendingState['flat']) => void;
  onSetVarDiffPending: (v: VariableDiffPendingState | null) => void;

  // Extract to reference modal
  extractToken: ExtractAliasTokenDraft | null;
  extractMode: 'new' | 'existing';
  onSetExtractMode: (v: 'new' | 'existing') => void;
  newPrimitivePath: string;
  onSetNewPrimitivePath: (v: string) => void;
  newPrimitiveCollectionId: string;
  onSetNewPrimitiveCollectionId: (v: string) => void;
  existingAlias: string;
  onSetExistingAlias: (v: string) => void;
  existingAliasSearch: string;
  onSetExistingAliasSearch: (v: string) => void;
  extractError: string;
  onSetExtractError: (v: string) => void;
  handleConfirmExtractToAlias: () => void;
  onSetExtractToken: (v: ExtractAliasTokenDraft | null) => void;

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
  frPreview: Array<{ oldPath: string; newPath: string; conflict: boolean; collectionId: string }>;
  frValuePreview: Array<{ path: string; collectionId: string; oldValue: string; newValue: string }>;
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

  // Move token to collection modal
  movingToken: string | null;
  movingGroup: string | null;
  moveTargetCollectionId: string;
  onSetMoveTargetCollectionId: (v: string) => void;
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

  // Copy token to collection modal
  copyingToken: string | null;
  copyingGroup: string | null;
  copyTargetCollectionId: string;
  onSetCopyTargetCollectionId: (v: string) => void;
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

  // Batch move selected tokens to another collection
  showBatchMoveToCollection: boolean;
  batchMoveToCollectionTarget: string;
  onSetBatchMoveToCollectionTarget: (v: string) => void;
  onSetShowBatchMoveToCollection: (v: boolean) => void;
  handleBatchMoveToCollection: () => void;

  // Batch copy selected tokens to another collection
  showBatchCopyToCollection: boolean;
  batchCopyToCollectionTarget: string;
  onSetBatchCopyToCollectionTarget: (v: string) => void;
  onSetShowBatchCopyToCollection: (v: boolean) => void;
  handleBatchCopyToCollection: () => void;
}

function RenameConfirmModal({ kind, oldPath, newPath: _newPath, depCount, deps, recipeImpacts, modeImpacts, onConfirm, onCancel }: {
  kind: 'token' | 'group';
  oldPath: string;
  newPath: string;
  depCount: number;
  deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }>;
  recipeImpacts?: RecipeImpact[];
  modeImpacts?: ModeImpact[];
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

  const hasRecipeImpacts = recipeImpacts && recipeImpacts.length > 0;
  const hasModeImpacts = modeImpacts && modeImpacts.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div ref={dialogRef} className="w-[340px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="rename-confirm-dialog-title">
        <div className="px-4 pt-4 pb-3">
          <h3 id="rename-confirm-dialog-title" className="text-[14px] font-semibold text-[var(--color-figma-text)]">
            Rename {kind} &ldquo;{label}&rdquo;?
          </h3>
          {depCount > 0 && (
            <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              {depCount} {noun} will be updated across all collections:
            </p>
          )}
          {deps.length > 0 && (
            <div className="mt-2 max-h-[140px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              {deps.map((dep, i) => (
                <div key={i} className="px-2 py-1.5 text-[10px] font-mono border-b border-[var(--color-figma-border)] last:border-b-0" title={`${dep.collectionId}: ${dep.tokenPath}`}>
                  <div className="text-[var(--color-figma-text-secondary)] truncate">
                    <span className="text-[var(--color-figma-text-tertiary)]">{dep.collectionId}/</span>{dep.tokenPath}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                    <span className="text-[var(--color-figma-text-danger)] line-through truncate max-w-[45%]">{dep.oldValue}</span>
                    <span className="text-[var(--color-figma-text-tertiary)] shrink-0">&rarr;</span>
                    <span className="text-[var(--color-figma-text-success)] truncate max-w-[45%]">{dep.newValue}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasRecipeImpacts && (
            <div className="mt-2">
              <div className="mb-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                Affected recipes ({recipeImpacts.length}) — references will not be auto-updated:
              </div>
              <div className="max-h-[100px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                {recipeImpacts.map((impact, i) => (
                  <div key={i} className="px-2 py-0.5 text-[10px] border-b border-[var(--color-figma-border)] last:border-b-0 truncate" title={`${impact.recipeName} (${impact.role === 'source' ? 'source token' : `config: ${impact.configField}`})`}>
                    <span className="font-medium text-[var(--color-figma-text)]">{impact.recipeName}</span>
                    <span className="text-[var(--color-figma-text-tertiary)] ml-1">
                      ({impact.role === 'source' ? 'source token' : `config: ${impact.configField}`})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hasModeImpacts && (
            <div className="mt-2">
              <div className="mb-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                Affected mode values ({modeImpacts.length}):
              </div>
              <div className="max-h-[100px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                {modeImpacts.map((impact, i) => (
                  <div key={i} className="px-2 py-0.5 text-[10px] font-mono border-b border-[var(--color-figma-border)] last:border-b-0 truncate" title={`${impact.collectionName} / ${impact.optionName}`}>
                    <span className="text-[var(--color-figma-text-tertiary)]">{impact.collectionName} / </span>
                    <span className="text-[var(--color-figma-text)]">{impact.optionName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {depCount === 0 && !hasRecipeImpacts && !hasModeImpacts && (
            <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              No alias references found. The token will be renamed.
            </p>
          )}
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          {depCount > 0 ? (
            <>
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
            </>
          ) : (
            <button
              onClick={() => onConfirm(true)}
              className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
            >
              Rename
            </button>
          )}
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
    collectionIds,
    extractToken,
    extractMode,
    onSetExtractMode,
    newPrimitivePath,
    onSetNewPrimitivePath,
    newPrimitiveCollectionId,
    onSetNewPrimitiveCollectionId,
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
      className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSetExtractToken(null); }}
    >
      <div ref={dialogRef} className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 flex flex-col" style={{ maxHeight: '80vh' }} role="dialog" aria-modal="true" aria-labelledby="extract-to-alias-dialog-title">
        <div className="p-4 border-b border-[var(--color-figma-border)]">
          <div id="extract-to-alias-dialog-title" className="text-[13px] font-medium text-[var(--color-figma-text)]">Link to token</div>
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
                  className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] font-mono ${fieldBorderClass(!!extractError)}`}
                  autoFocus
                  placeholder="e.g. primitives.color.blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Create in collection</label>
                <select
                  value={newPrimitiveCollectionId}
                  onChange={e => onSetNewPrimitiveCollectionId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                >
                  {collectionIds.map(s => <option key={s} value={s}>{s}</option>)}
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

          <FieldMessage error={extractError} />
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

// ---------------------------------------------------------------------------
// Delete impact details — summary line + collapsible sections
// ---------------------------------------------------------------------------

function DeleteImpactDetails({
  pathList,
  affectedRefs,
  recipeImpacts,
  modeImpacts,
}: {
  pathList?: string[];
  affectedRefs?: AffectedRef[];
  recipeImpacts?: RecipeImpact[];
  modeImpacts?: ModeImpact[];
}) {
  const [tokensOpen, setTokensOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [gensOpen, setGensOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);

  const tokenCount = pathList?.length ?? 0;
  const refCount = affectedRefs?.length ?? 0;
  const genCount = recipeImpacts?.length ?? 0;
  const modeImpactCount = modeImpacts?.length ?? 0;

  const hasSideEffects = refCount > 0 || genCount > 0 || modeImpactCount > 0;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Summary line with colored badges */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-figma-text-secondary)]">
        {tokenCount > 0 && (
          <NoticePill severity="error">
            {tokenCount} token{tokenCount !== 1 ? 's' : ''}
          </NoticePill>
        )}
        {hasSideEffects && <span>will affect</span>}
        {refCount > 0 && (
          <NoticePill severity="error">
            {refCount} broken reference{refCount !== 1 ? 's' : ''}
          </NoticePill>
        )}
        {genCount > 0 && (
          <NoticePill severity="warning">
            {genCount} recipe{genCount !== 1 ? 's' : ''}
          </NoticePill>
        )}
        {modeImpactCount > 0 && (
          <NoticePill severity="info" className="border-blue-500/30 bg-blue-500/10 text-blue-600">
            {modeImpactCount} mode value{modeImpactCount !== 1 ? 's' : ''}
          </NoticePill>
        )}
      </div>

      {/* Collapsible: tokens to delete */}
      {tokenCount > 0 && (
        <CollapsibleSection
          open={tokensOpen}
          onToggle={() => setTokensOpen(v => !v)}
          label={`Tokens (${tokenCount})`}
        >
          <div className="max-h-[120px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {pathList!.slice(0, 20).map(p => (
              <div key={p} className="px-2 py-0.5 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={p}>{p}</div>
            ))}
            {tokenCount > 20 && (
              <div className="px-2 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] italic">and {tokenCount - 20} more…</div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Collapsible: broken references */}
      {refCount > 0 && (
        <CollapsibleSection
          open={refsOpen}
          onToggle={() => setRefsOpen(v => !v)}
          label={`Broken references (${refCount})`}
        >
          <div className="max-h-[120px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {affectedRefs!.slice(0, 20).map((ref, i) => (
              <div key={i} className="px-2 py-0.5 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${ref.collectionId}/${ref.path}`}>
                <span className="text-[var(--color-figma-text-tertiary)]">{ref.collectionId}/</span>{ref.path}
              </div>
            ))}
            {refCount > 20 && (
              <div className="px-2 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] italic">and {refCount - 20} more…</div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Collapsible: recipe impacts */}
      {genCount > 0 && (
        <CollapsibleSection
          open={gensOpen}
          onToggle={() => setGensOpen(v => !v)}
          label={`Affected recipes (${genCount})`}
        >
          <div className="max-h-[100px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {recipeImpacts!.map((impact, i) => (
              <div key={i} className="px-2 py-0.5 text-[10px] border-b border-[var(--color-figma-border)] last:border-b-0 truncate">
                <span className="font-medium text-[var(--color-figma-text)]">{impact.recipeName}</span>
                <span className="text-[var(--color-figma-text-tertiary)] ml-1">({impact.role === 'source' ? 'source token' : `config: ${impact.configField}`})</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Collapsible: mode impacts */}
      {modeImpactCount > 0 && (
        <CollapsibleSection
          open={modesOpen}
          onToggle={() => setModesOpen(v => !v)}
          label={`Affected mode values (${modeImpactCount})`}
        >
          <div className="max-h-[100px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {modeImpacts!.map((impact, i) => (
              <div key={i} className="px-2 py-0.5 text-[10px] font-mono border-b border-[var(--color-figma-border)] last:border-b-0 truncate">
                <span className="text-[var(--color-figma-text-tertiary)]">{impact.collectionName} / </span>
                <span className="text-[var(--color-figma-text)]">{impact.optionName}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function CollapsibleSection({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] mb-1"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
            <path d="M2 1l4 3-4 3" />
          </svg>
          {label}
        </button>
      ) : (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">{label}</div>
      )}
      {open && children}
    </div>
  );
}

export function TokenListModals() {
  const {
    collectionId,
    collectionIds,
    allTokensFlat: _allTokensFlat,
    connected: _connected,
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
    extractToken,
    movingGroup,
    moveTargetCollectionId,
    onSetMoveTargetCollectionId,
    onSetMovingGroup,
    handleConfirmMoveGroup,
    copyingGroup,
    copyTargetCollectionId,
    onSetCopyTargetCollectionId,
    onSetCopyingGroup,
    handleConfirmCopyGroup,
    showMoveToGroup,
    moveToGroupTarget,
    moveToGroupError,
    selectedMoveCount,
    onSetShowMoveToGroup,
    onSetMoveToGroupTarget,
    onSetMoveToGroupError,
    handleBatchMoveToGroup,
    showBatchMoveToCollection,
    batchMoveToCollectionTarget,
    onSetBatchMoveToCollectionTarget,
    onSetShowBatchMoveToCollection,
    handleBatchMoveToCollection,
    showBatchCopyToCollection,
    batchCopyToCollectionTarget,
    onSetBatchCopyToCollectionTarget,
    onSetShowBatchCopyToCollection,
    handleBatchCopyToCollection,
  } = useTokenListModals();

  return (
    <>
      {/* Delete confirmation modal */}
      {deleteConfirm && modalProps && (
        <ConfirmModal
          title={modalProps.title}
          description={modalProps.description}
          confirmLabel={modalProps.confirmLabel}
          danger
          wide={!!(modalProps.pathList || modalProps.affectedRefs || modalProps.recipeImpacts?.length || modalProps.modeImpacts?.length)}
          onConfirm={executeDelete}
          onCancel={() => onSetDeleteConfirm(null)}
        >
          <DeleteImpactDetails
            pathList={modalProps.pathList}
            affectedRefs={modalProps.affectedRefs}
            recipeImpacts={modalProps.recipeImpacts}
            modeImpacts={modalProps.modeImpacts}
          />
        </ConfirmModal>
      )}

      {/* New group dialog */}
      {newGroupDialogParent !== null && (
        <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); } }}>
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3" role="dialog" aria-modal="true" aria-labelledby="new-group-dialog-title">
            <div id="new-group-dialog-title" className="text-[13px] font-medium text-[var(--color-figma-text)]">New group</div>
            {newGroupDialogParent && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Inside <span className="font-mono text-[var(--color-figma-text)]">{newGroupDialogParent}</span>
              </div>
            )}
            <input
              type="text"
              placeholder={newGroupDialogParent ? 'subgroup-name' : 'group-name'}
              value={newGroupName}
              onChange={e => {
                const v = e.target.value;
                onSetNewGroupName(v);
                if (v.includes('.')) onSetNewGroupError('Group name cannot contain dots — dots separate path segments');
                else onSetNewGroupError('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateGroup(newGroupDialogParent ?? '', newGroupName);
                if (e.key === 'Escape') { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); }
              }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] ${fieldBorderClass(!!newGroupError)}`}
              aria-label="New group name"
              autoFocus
            />
            <FieldMessage error={newGroupError} />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); }}
                className="px-3 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateGroup(newGroupDialogParent ?? '', newGroupName)}
                disabled={!newGroupName.trim() || !!newGroupError}
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
          recipeImpacts={renameTokenConfirm.recipeImpacts}
          modeImpacts={renameTokenConfirm.modeImpacts}
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

      {/* Extract to reference modal */}
      {extractToken && (
        <ExtractToAliasModal />
      )}

      {/* Long-lived review surfaces now render inline in TokenList to preserve library context. */}

      {/* Move group to collection modal */}
      {movingGroup && (
        <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[13px] font-medium text-[var(--color-figma-text)]">Move group to collection</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{movingGroup}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination collection</label>
              <select
                value={moveTargetCollectionId}
                onChange={e => onSetMoveTargetCollectionId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {collectionIds.filter(s => s !== collectionId).map(s => (
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
                disabled={!moveTargetCollectionId}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy group to collection modal */}
      {copyingGroup && (
        <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[13px] font-medium text-[var(--color-figma-text)]">Copy group to collection</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{copyingGroup}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination collection</label>
              <select
                value={copyTargetCollectionId}
                onChange={e => onSetCopyTargetCollectionId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {collectionIds.filter(s => s !== collectionId).map(s => (
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
                disabled={!copyTargetCollectionId}
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
          className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50"
          onMouseDown={e => { if (e.target === e.currentTarget) { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); } }}
        >
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[13px] font-medium text-[var(--color-figma-text)]">Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''} to group</div>
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
            <FieldMessage error={moveToGroupError} />
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

      {/* Batch move selected tokens to another collection */}
      {showBatchMoveToCollection && (
        <div
          className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              onSetShowBatchMoveToCollection(false);
            }
          }}
        >
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[13px] font-medium text-[var(--color-figma-text)]">Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''} to another collection</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Tokens will be removed from <span className="font-mono text-[var(--color-figma-text)]">{collectionId}</span> and added to the target collection.
            </div>
            <select
              value={batchMoveToCollectionTarget}
              onChange={e => onSetBatchMoveToCollectionTarget(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onSetShowBatchMoveToCollection(false);
              }}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              aria-label="Target collection"
              autoFocus
            >
              {collectionIds.filter(s => s !== collectionId).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetShowBatchMoveToCollection(false)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchMoveToCollection}
                disabled={!batchMoveToCollectionTarget}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch copy selected tokens to another collection */}
      {showBatchCopyToCollection && (
        <div
          className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              onSetShowBatchCopyToCollection(false);
            }
          }}
        >
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[13px] font-medium text-[var(--color-figma-text)]">Copy {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''} to another collection</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Tokens will be duplicated into the target collection. Originals in <span className="font-mono text-[var(--color-figma-text)]">{collectionId}</span> are kept.
            </div>
            <select
              value={batchCopyToCollectionTarget}
              onChange={e => onSetBatchCopyToCollectionTarget(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onSetShowBatchCopyToCollection(false);
              }}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              aria-label="Target collection"
              autoFocus
            >
              {collectionIds.filter(s => s !== collectionId).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetShowBatchCopyToCollection(false)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchCopyToCollection}
                disabled={!batchCopyToCollectionTarget}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
