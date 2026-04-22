import React, { useState, useRef, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ConfirmModal } from './ConfirmModal';
import { ValuePreview } from './ValuePreview';
import { isAlias } from '../../shared/resolveAlias';
import type { AffectedRef, GeneratorImpact, ModeImpact } from './tokenListTypes';
import { useTokenListModals } from './TokenListModalsContext';
import { FieldMessage } from '../shared/FieldMessage';
import { NoticePill } from '../shared/noticeSystem';
import { fieldBorderClass } from '../shared/editorClasses';

function RenameConfirmModal({ kind, oldPath, newPath, depCount, deps, generatorImpacts, modeImpacts, onConfirm, onCancel }: {
  kind: 'token' | 'group';
  oldPath: string;
  newPath: string;
  depCount: number;
  deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }>;
  generatorImpacts?: GeneratorImpact[];
  modeImpacts?: ModeImpact[];
  onConfirm: (updateAliases: boolean) => void;
  onCancel: () => void;
}) {
  const label = oldPath.split('.').pop() ?? oldPath;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const generatorCount = generatorImpacts?.length ?? 0;
  const modeCount = modeImpacts?.length ?? 0;
  const hasImpacts = depCount > 0 || generatorCount > 0 || modeCount > 0;

  const summary = (() => {
    if (!hasImpacts) return `No references found. The ${kind} will be renamed.`;
    const parts: string[] = [];
    if (depCount > 0) parts.push(`${depCount} ${depCount === 1 ? 'alias reference' : 'alias references'}`);
    if (modeCount > 0) parts.push(`${modeCount} ${modeCount === 1 ? 'mode value' : 'mode values'}`);
    const main = parts.length > 0
      ? `Updates ${parts.join(' and ')}.`
      : `Renames this ${kind}.`;
    const trailing = generatorCount > 0
      ? ` ${generatorCount} generated ${generatorCount === 1 ? 'group' : 'groups'} reference this ${kind} and won't auto-update.`
      : '';
    return main + trailing;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div ref={dialogRef} className="w-[340px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="rename-confirm-dialog-title">
        <div className="px-4 pt-4 pb-3">
          <h3 id="rename-confirm-dialog-title" className="text-heading font-semibold text-[var(--color-figma-text)]">
            Rename {kind} &ldquo;{label}&rdquo;?
          </h3>
          <p className="mt-1.5 text-body text-[var(--color-figma-text-secondary)] leading-relaxed">
            <span className="font-mono text-[var(--color-figma-text)]">{oldPath}</span>
            <span className="mx-1 text-[var(--color-figma-text-tertiary)]">&rarr;</span>
            <span className="font-mono text-[var(--color-figma-text)]">{newPath}</span>
          </p>
          <p className="mt-2 text-body text-[var(--color-figma-text-secondary)] leading-relaxed">
            {summary}
          </p>
          {hasImpacts && (
            <>
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="mt-1.5 text-secondary text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] underline-offset-2 hover:underline transition-colors"
                aria-expanded={detailsOpen}
              >
                {detailsOpen ? 'Hide details' : 'View details'}
              </button>
              {detailsOpen && (
                <div className="mt-2 flex flex-col gap-2 text-secondary">
                  {deps.length > 0 && (
                    <div>
                      <div className="mb-1 text-[var(--color-figma-text-secondary)]">Alias references</div>
                      <ul className="max-h-[120px] overflow-y-auto flex flex-col gap-1 font-mono">
                        {deps.map((dep, i) => (
                          <li key={i} className="text-[var(--color-figma-text-secondary)] truncate" title={`${dep.collectionId}: ${dep.tokenPath}`}>
                            <span className="text-[var(--color-figma-text-tertiary)]">{dep.collectionId}/</span>{dep.tokenPath}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {modeCount > 0 && (
                    <div>
                      <div className="mb-1 text-[var(--color-figma-text-secondary)]">Mode values</div>
                      <ul className="max-h-[80px] overflow-y-auto flex flex-col gap-0.5 font-mono">
                        {modeImpacts!.map((impact, i) => (
                          <li key={i} className="truncate" title={`${impact.collectionName} / ${impact.optionName}`}>
                            <span className="text-[var(--color-figma-text-tertiary)]">{impact.collectionName} / </span>
                            <span className="text-[var(--color-figma-text)]">{impact.optionName}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {generatorCount > 0 && (
                    <div>
                      <div className="mb-1 text-[var(--color-figma-text-secondary)]">Generated groups (won&rsquo;t auto-update)</div>
                      <ul className="max-h-[80px] overflow-y-auto flex flex-col gap-0.5">
                        {generatorImpacts!.map((impact, i) => (
                          <li key={i} className="truncate" title={`${impact.generatorName} (${impact.role === 'source' ? 'source token' : `config: ${impact.configField}`})`}>
                            <span className="text-[var(--color-figma-text)]">{impact.generatorName}</span>
                            <span className="text-[var(--color-figma-text-tertiary)] ml-1">
                              ({impact.role === 'source' ? 'source token' : `config: ${impact.configField}`})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          <button
            onClick={() => onConfirm(true)}
            className="w-full px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
          >
            Rename
          </button>
          <div className="flex items-center justify-between gap-2 text-secondary">
            <button
              onClick={onCancel}
              className="px-2 py-1 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
            >
              Cancel
            </button>
            {depCount > 0 && (
              <button
                onClick={() => onConfirm(false)}
                className="px-2 py-1 rounded text-[var(--color-figma-text-danger)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Rename without updating references
              </button>
            )}
          </div>
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
          <div id="extract-to-alias-dialog-title" className="tm-dialog-title">Link to token</div>
          <div className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5 truncate">
            <span className="font-mono text-[var(--color-figma-text)]">{extractToken.path}</span>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => onSetExtractMode('new')}
            className={`flex-1 py-1.5 text-secondary font-medium transition-colors ${extractMode === 'new' ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          >
            Create new primitive
          </button>
          <button
            onClick={() => onSetExtractMode('existing')}
            className={`flex-1 py-1.5 text-secondary font-medium transition-colors ${extractMode === 'existing' ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          >
            Use existing token
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
          {extractMode === 'new' ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-secondary text-[var(--color-figma-text-secondary)]">New primitive path</label>
                <input
                  type="text"
                  value={newPrimitivePath}
                  onChange={e => { onSetNewPrimitivePath(e.target.value); onSetExtractError(''); }}
                  className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-body font-mono ${fieldBorderClass(!!extractError)}`}
                  autoFocus
                  placeholder="e.g. primitives.color.blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-secondary text-[var(--color-figma-text-secondary)]">Create in collection</label>
                <select
                  value={newPrimitiveCollectionId}
                  onChange={e => onSetNewPrimitiveCollectionId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
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
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
                aria-label="Search tokens"
                autoFocus
              />
              <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: '160px' }}>
                {candidateTokens.length === 0 ? (
                  <div className="text-secondary text-[var(--color-figma-text-secondary)] py-2 text-center">
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
                    <span className="text-secondary font-mono flex-1 truncate">{path}</span>
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
            className="px-3 py-1.5 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmExtractToAlias}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
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
  generatorImpacts,
  modeImpacts,
}: {
  pathList?: string[];
  affectedRefs?: AffectedRef[];
  generatorImpacts?: GeneratorImpact[];
  modeImpacts?: ModeImpact[];
}) {
  const [tokensOpen, setTokensOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [gensOpen, setGensOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);

  const tokenCount = pathList?.length ?? 0;
  const refCount = affectedRefs?.length ?? 0;
  const genCount = generatorImpacts?.length ?? 0;
  const modeImpactCount = modeImpacts?.length ?? 0;

  const hasSideEffects = refCount > 0 || genCount > 0 || modeImpactCount > 0;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Summary line with colored badges */}
      <div className="flex flex-wrap items-center gap-1.5 text-body text-[var(--color-figma-text-secondary)]">
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
            {genCount} generated group{genCount !== 1 ? 's' : ''}
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
              <div key={p} className="px-2 py-0.5 text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate" title={p}>{p}</div>
            ))}
            {tokenCount > 20 && (
              <div className="px-2 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] italic">and {tokenCount - 20} more…</div>
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
              <div key={i} className="px-2 py-0.5 text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${ref.collectionId}/${ref.path}`}>
                <span className="text-[var(--color-figma-text-tertiary)]">{ref.collectionId}/</span>{ref.path}
              </div>
            ))}
            {refCount > 20 && (
              <div className="px-2 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] italic">and {refCount - 20} more…</div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Collapsible: generator impacts */}
      {genCount > 0 && (
        <CollapsibleSection
          open={gensOpen}
          onToggle={() => setGensOpen(v => !v)}
          label={`Affected generated groups (${genCount})`}
        >
          <div className="max-h-[100px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {generatorImpacts!.map((impact, i) => (
              <div key={i} className="px-2 py-0.5 text-secondary border-b border-[var(--color-figma-border)] last:border-b-0 truncate">
                <span className="font-medium text-[var(--color-figma-text)]">{impact.generatorName}</span>
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
              <div key={i} className="px-2 py-0.5 text-secondary font-mono border-b border-[var(--color-figma-border)] last:border-b-0 truncate">
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
          className="flex items-center gap-1 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] mb-1"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
            <path d="M2 1l4 3-4 3" />
          </svg>
          {label}
        </button>
      ) : (
        <div className="text-secondary text-[var(--color-figma-text-secondary)] mb-1">{label}</div>
      )}
      {open && children}
    </div>
  );
}

function shortName(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? path : path.slice(idx + 1);
}

function sharedGroupPrefix(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const first = paths[0];
  const firstDot = first.lastIndexOf(".");
  if (firstDot === -1) return null;
  const prefix = first.slice(0, firstDot);
  for (let i = 1; i < paths.length; i++) {
    const dot = paths[i].lastIndexOf(".");
    if (dot === -1 || paths[i].slice(0, dot) !== prefix) return null;
  }
  return prefix;
}

function MoveScopePreview({
  fromCollection,
  fromGroup,
  paths,
  toLabel,
  conflictCount,
}: {
  fromCollection: string;
  fromGroup: string | null;
  paths: string[];
  toLabel: string | null;
  conflictCount: number;
}) {
  const sampleCount = 3;
  const samples = paths.slice(0, sampleCount).map(shortName);
  const remaining = Math.max(0, paths.length - sampleCount);
  const rowClass = "grid grid-cols-[56px_1fr] items-baseline gap-x-2 gap-y-1";
  const labelClass = "text-secondary text-[var(--color-figma-text-tertiary)]";
  const valueClass = "text-body text-[var(--color-figma-text)] min-w-0";
  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
      <div className={rowClass}>
        <span className={labelClass}>From</span>
        <span className={`${valueClass} truncate font-mono`} title={fromCollection}>
          {fromCollection}
          {fromGroup ? (
            <>
              <span className="text-[var(--color-figma-text-tertiary)]"> / </span>
              {fromGroup}
            </>
          ) : null}
        </span>
        <span className={labelClass}>Moving</span>
        <span className={`${valueClass} min-w-0`}>
          <span className="truncate font-mono">
            {samples.join(", ")}
          </span>
          {remaining > 0 && (
            <span className="text-[var(--color-figma-text-tertiary)]">
              {" "}and {remaining} more
            </span>
          )}
        </span>
        <span className={labelClass}>To</span>
        <span className={`${valueClass} truncate font-mono`} title={toLabel ?? ""}>
          {toLabel ? (
            toLabel
          ) : (
            <span className="text-[var(--color-figma-text-tertiary)] italic font-sans">
              Choose a target…
            </span>
          )}
        </span>
      </div>
      {conflictCount > 0 && (
        <div className="text-secondary text-[var(--color-figma-warning,#f59e0b)]">
          {conflictCount} token{conflictCount === 1 ? "" : "s"} will overwrite existing values
        </div>
      )}
    </div>
  );
}

export function TokenListModals() {
  const {
    collectionId,
    collectionIds,
    allTokensFlat,
    pathToCollectionId,
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
    selectedMovePaths,
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
          wide={!!(modalProps.pathList || modalProps.affectedRefs || modalProps.generatorImpacts?.length || modalProps.modeImpacts?.length)}
          onConfirm={executeDelete}
          onCancel={() => onSetDeleteConfirm(null)}
        >
          <DeleteImpactDetails
            pathList={modalProps.pathList}
            affectedRefs={modalProps.affectedRefs}
            generatorImpacts={modalProps.generatorImpacts}
            modeImpacts={modalProps.modeImpacts}
          />
        </ConfirmModal>
      )}

      {/* New group dialog */}
      {newGroupDialogParent !== null && (
        <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); } }}>
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3" role="dialog" aria-modal="true" aria-labelledby="new-group-dialog-title">
            <div id="new-group-dialog-title" className="tm-dialog-title">New group</div>
            {newGroupDialogParent && (
              <div className="text-secondary text-[var(--color-figma-text-secondary)]">
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
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-body ${fieldBorderClass(!!newGroupError)}`}
              aria-label="New group name"
              autoFocus
            />
            <FieldMessage error={newGroupError} />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); }}
                className="px-3 py-1 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateGroup(newGroupDialogParent ?? '', newGroupName)}
                disabled={!newGroupName.trim() || !!newGroupError}
                className="px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white text-secondary font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
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
          generatorImpacts={renameTokenConfirm.generatorImpacts}
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
            <div className="tm-dialog-title">Move group to collection</div>
            <div className="text-secondary text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{movingGroup}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-secondary text-[var(--color-figma-text-secondary)]">Destination collection</label>
              <select
                value={moveTargetCollectionId}
                onChange={e => onSetMoveTargetCollectionId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
              >
                {collectionIds.filter(s => s !== collectionId).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetMovingGroup(null)}
                className="px-3 py-1.5 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMoveGroup}
                disabled={!moveTargetCollectionId}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
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
            <div className="tm-dialog-title">Copy group to collection</div>
            <div className="text-secondary text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{copyingGroup}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-secondary text-[var(--color-figma-text-secondary)]">Destination collection</label>
              <select
                value={copyTargetCollectionId}
                onChange={e => onSetCopyTargetCollectionId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
              >
                {collectionIds.filter(s => s !== collectionId).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onSetCopyingGroup(null)}
                className="px-3 py-1.5 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCopyGroup}
                disabled={!copyTargetCollectionId}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move selected tokens to group modal */}
      {showMoveToGroup && (() => {
        const fromGroup = sharedGroupPrefix(selectedMovePaths);
        const trimmedTarget = moveToGroupTarget.trim();
        const targetGroup = trimmedTarget.replace(/\.+$/, "");
        const toLabel = trimmedTarget
          ? `${collectionId}${targetGroup ? ` / ${targetGroup}` : ""}`
          : null;
        const conflictCount = trimmedTarget
          ? selectedMovePaths.reduce((count, path) => {
              const name = shortName(path);
              const newPath = targetGroup ? `${targetGroup}.${name}` : name;
              if (newPath === path) return count;
              return allTokensFlat[newPath] &&
                pathToCollectionId[newPath] === collectionId
                ? count + 1
                : count;
            }, 0)
          : 0;
        return (
          <div
            className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50"
            onMouseDown={e => { if (e.target === e.currentTarget) { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); } }}
          >
            <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 p-4 flex flex-col gap-3">
              <div className="tm-dialog-title">Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''} to group</div>
              <MoveScopePreview
                fromCollection={collectionId}
                fromGroup={fromGroup}
                paths={selectedMovePaths}
                toLabel={toLabel}
                conflictCount={conflictCount}
              />
              <input
                type="text"
                placeholder="e.g. colors.brand"
                value={moveToGroupTarget}
                onChange={e => { onSetMoveToGroupTarget(e.target.value); onSetMoveToGroupError(''); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && moveToGroupTarget.trim()) handleBatchMoveToGroup();
                  if (e.key === 'Escape') { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); }
                }}
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-body font-mono focus-visible:border-[var(--color-figma-accent)] ${moveToGroupError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                aria-label="Target group path"
                autoFocus
              />
              <FieldMessage error={moveToGroupError} />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); }}
                  className="px-3 py-1.5 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBatchMoveToGroup}
                  disabled={!moveToGroupTarget.trim()}
                  className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
                >
                  Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Batch move selected tokens to another collection */}
      {showBatchMoveToCollection && (() => {
        const fromGroup = sharedGroupPrefix(selectedMovePaths);
        const conflictCount = batchMoveToCollectionTarget
          ? selectedMovePaths.reduce((count, path) => (
              allTokensFlat[path] &&
              pathToCollectionId[path] === batchMoveToCollectionTarget
                ? count + 1
                : count
            ), 0)
          : 0;
        return (
          <div
            className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50"
            onMouseDown={e => {
              if (e.target === e.currentTarget) {
                onSetShowBatchMoveToCollection(false);
              }
            }}
          >
            <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 p-4 flex flex-col gap-3">
              <div className="tm-dialog-title">Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''} to another collection</div>
              <MoveScopePreview
                fromCollection={collectionId}
                fromGroup={fromGroup}
                paths={selectedMovePaths}
                toLabel={batchMoveToCollectionTarget || null}
                conflictCount={conflictCount}
              />
              <select
                value={batchMoveToCollectionTarget}
                onChange={e => onSetBatchMoveToCollectionTarget(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') onSetShowBatchMoveToCollection(false);
                }}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
                aria-label="Target collection"
                autoFocus
              >
                <option value="">Choose a collection…</option>
                {collectionIds.filter(s => s !== collectionId).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => onSetShowBatchMoveToCollection(false)}
                  className="px-3 py-1.5 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBatchMoveToCollection}
                  disabled={!batchMoveToCollectionTarget}
                  className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
                >
                  Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
            <div className="tm-dialog-title">Copy {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''} to another collection</div>
            <div className="text-secondary text-[var(--color-figma-text-secondary)]">
              Tokens will be duplicated into the target collection. Originals in <span className="font-mono text-[var(--color-figma-text)]">{collectionId}</span> are kept.
            </div>
            <select
              value={batchCopyToCollectionTarget}
              onChange={e => onSetBatchCopyToCollectionTarget(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onSetShowBatchCopyToCollection(false);
              }}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
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
                className="px-3 py-1.5 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchCopyToCollection}
                disabled={!batchCopyToCollectionTarget}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
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
