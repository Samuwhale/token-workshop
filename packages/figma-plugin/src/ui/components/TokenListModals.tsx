import React, { useState, useRef, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ConfirmModal } from './ConfirmModal';
import { ValuePreview } from './ValuePreview';
import { extractAliasPath, isAlias } from '../../shared/resolveAlias';
import type { AffectedRef, ModeImpact } from './tokenListTypes';
import { useTokenListModals } from './TokenListModalsContext';
import { FieldMessage } from '../shared/FieldMessage';
import { LONG_TEXT_CLASSES } from '../shared/longTextStyles';
import { NoticePill } from '../shared/noticeSystem';
import { fieldBorderClass } from '../shared/editorClasses';

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function normalizeGroupPathPreview(parent: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return parent;
  return (parent ? `${parent}.${trimmed}` : trimmed)
    .split('.')
    .map((segment) => segment.trim())
    .join('.');
}

function getGroupPathInputError(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.split('.').some((segment) => segment.trim().length === 0)
    ? 'Remove empty path segments'
    : '';
}

function ModalFrame({
  dialogRef,
  title,
  titleId,
  onClose,
  wide = false,
  meta,
  afterHeader,
  children,
  footer,
  panelClassName,
  bodyClassName,
  footerClassName,
}: {
  dialogRef?: React.Ref<HTMLDivElement>;
  title: React.ReactNode;
  titleId: string;
  onClose: () => void;
  wide?: boolean;
  meta?: React.ReactNode;
  afterHeader?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  return (
    <div
      className="tm-modal-shell"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={joinClasses(
          'tm-modal-panel',
          wide && 'tm-modal-panel--wide',
          panelClassName,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tm-modal-header">
          <h3 id={titleId} className="tm-dialog-title">
            {title}
          </h3>
          {meta ? <div className="tm-modal-meta">{meta}</div> : null}
        </div>
        {afterHeader}
        <div className={joinClasses('tm-modal-body', bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <div className={joinClasses('tm-modal-footer', footerClassName)}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RenameConfirmModal({ kind, oldPath, newPath, depCount, deps, modeImpacts, onConfirm, onCancel }: {
  kind: 'token' | 'group';
  oldPath: string;
  newPath: string;
  depCount: number;
  deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }>;
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

  const modeCount = modeImpacts?.length ?? 0;
  const hasImpacts = depCount > 0 || modeCount > 0;

  const summary = (() => {
    if (!hasImpacts) return `No references found. The ${kind} will be renamed.`;
    const parts: string[] = [];
    if (depCount > 0) parts.push(`${depCount} ${depCount === 1 ? 'alias reference' : 'alias references'}`);
    if (modeCount > 0) parts.push(`${modeCount} ${modeCount === 1 ? 'mode value' : 'mode values'}`);
    const main = parts.length > 0
      ? `Updates ${parts.join(' and ')}.`
      : `Renames this ${kind}.`;
    return main;
  })();

  return (
    <ModalFrame
      dialogRef={dialogRef}
      titleId="rename-confirm-dialog-title"
      title={`Rename ${kind} “${label}”?`}
      onClose={onCancel}
      wide={hasImpacts}
      meta={
        <div className="flex flex-col gap-2">
          <p className={LONG_TEXT_CLASSES.monoPrimary}>
            {oldPath}
            <span className="mx-1 text-[color:var(--color-figma-text-tertiary)]">
              &rarr;
            </span>
            {newPath}
          </p>
          <p className="text-body leading-relaxed text-[color:var(--color-figma-text-secondary)]">
            {summary}
          </p>
        </div>
      }
      footerClassName={depCount > 0 ? 'items-start' : undefined}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)]"
          >
            Rename
          </button>
          {depCount > 0 ? (
            <button
              type="button"
              onClick={() => onConfirm(false)}
              className="w-full rounded px-3 py-1.5 text-left text-body text-[color:var(--color-figma-text-error)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Rename without updating references
            </button>
          ) : null}
        </>
      }
    >
      {hasImpacts ? (
        <>
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="text-secondary text-[color:var(--color-figma-text-tertiary)] transition-colors hover:text-[color:var(--color-figma-text-secondary)] hover:underline"
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? 'Hide details' : 'View details'}
          </button>
          {detailsOpen ? (
            <div className="flex flex-col gap-2 text-secondary">
              {deps.length > 0 ? (
                <div>
                  <div className="mb-1 text-[color:var(--color-figma-text-secondary)]">
                    Alias references
                  </div>
                  <ul className="max-h-[120px] overflow-y-auto rounded bg-[var(--color-figma-bg-secondary)] p-2">
                    {deps.map((dep, index) => (
                      <li key={index} className={LONG_TEXT_CLASSES.monoSecondary}>
                        <span className="text-[color:var(--color-figma-text-tertiary)]">
                          {dep.collectionId}/
                        </span>
                        {dep.tokenPath}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {modeCount > 0 ? (
                <div>
                  <div className="mb-1 text-[color:var(--color-figma-text-secondary)]">
                    Mode values
                  </div>
                  <ul className="max-h-[96px] overflow-y-auto rounded bg-[var(--color-figma-bg-secondary)] p-2">
                    {modeImpacts!.map((impact, index) => (
                      <li key={index} className={LONG_TEXT_CLASSES.monoSecondary}>
                        <span className="text-[color:var(--color-figma-text-tertiary)]">
                          {impact.collectionName} /{' '}
                        </span>
                        <span className="text-[color:var(--color-figma-text)]">
                          {impact.optionName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </ModalFrame>
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
    <ModalFrame
      dialogRef={dialogRef}
      titleId="extract-to-alias-dialog-title"
      title="Link to token"
      onClose={() => onSetExtractToken(null)}
      wide
      meta={<span className={LONG_TEXT_CLASSES.monoPrimary}>{extractToken.path}</span>}
      afterHeader={
        <div className="tm-modal-tablist border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => onSetExtractMode('new')}
            className={joinClasses(
              'tm-modal-tab',
              extractMode === 'new' && 'tm-modal-tab--active',
            )}
          >
            Create new primitive
          </button>
          <button
            onClick={() => onSetExtractMode('existing')}
            className={joinClasses(
              'tm-modal-tab',
              extractMode === 'existing' && 'tm-modal-tab--active',
            )}
          >
            Use existing token
          </button>
        </div>
      }
      footer={
        <>
          <button
            type="button"
            onClick={() => onSetExtractToken(null)}
            className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmExtractToAlias}
            className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
            disabled={extractMode === 'existing' && !existingAlias}
          >
            Extract
          </button>
        </>
      }
    >
        <div className="flex flex-col gap-3">
          {extractMode === 'new' ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-secondary text-[color:var(--color-figma-text-secondary)]">New primitive path</label>
                <input
                  type="text"
                  value={newPrimitivePath}
                  onChange={e => { onSetNewPrimitivePath(e.target.value); onSetExtractError(''); }}
                  className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[color:var(--color-figma-text)] text-body font-mono ${fieldBorderClass(!!extractError)}`}
                  autoFocus
                  placeholder="e.g. primitives.color.blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-secondary text-[color:var(--color-figma-text-secondary)]">Create in collection</label>
                <select
                  value={newPrimitiveCollectionId}
                  onChange={e => onSetNewPrimitiveCollectionId(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
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
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
                aria-label="Search tokens"
                autoFocus
              />
              <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: '160px' }}>
                {candidateTokens.length === 0 ? (
                  <div className="text-secondary text-[color:var(--color-figma-text-secondary)] py-2 text-center">
                    No matching {extractToken.$type} tokens found
                  </div>
                ) : candidateTokens.map(([path, t]) => (
                  <button
                    key={path}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { onSetExistingAlias(path); onSetExtractError(''); }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${existingAlias === path ? 'bg-[var(--color-figma-accent)]/15 text-[color:var(--color-figma-text-accent)]' : 'hover:bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]'}`}
                  >
                    <ValuePreview type={t.$type} value={t.$value} />
                    <span className={`flex-1 ${LONG_TEXT_CLASSES.mono}`}>{path}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <FieldMessage error={extractError} />
        </div>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Delete impact details — summary line + collapsible sections
// ---------------------------------------------------------------------------

function DeleteImpactDetails({
  pathList,
  affectedRefs,
  modeImpacts,
}: {
  pathList?: string[];
  affectedRefs?: AffectedRef[];
  modeImpacts?: ModeImpact[];
}) {
  const [tokensOpen, setTokensOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [modesOpen, setModesOpen] = useState(false);

  const tokenCount = pathList?.length ?? 0;
  const refCount = affectedRefs?.length ?? 0;
  const modeImpactCount = modeImpacts?.length ?? 0;

  const hasSideEffects = refCount > 0 || modeImpactCount > 0;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Summary line with colored badges */}
      <div className="flex flex-wrap items-center gap-1.5 text-body text-[color:var(--color-figma-text-secondary)]">
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
        {modeImpactCount > 0 && (
          <NoticePill severity="info" className="border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]">
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
              <div key={p} className={`px-2 py-0.5 text-secondary ${LONG_TEXT_CLASSES.monoSecondary}`} title={p}>{p}</div>
            ))}
            {tokenCount > 20 && (
              <div className="px-2 py-0.5 text-secondary text-[color:var(--color-figma-text-secondary)] italic">and {tokenCount - 20} more…</div>
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
              <div key={i} className={`px-2 py-0.5 text-secondary ${LONG_TEXT_CLASSES.monoSecondary}`} title={`${ref.collectionId}/${ref.path}`}>
                <span className="text-[color:var(--color-figma-text-tertiary)]">{ref.collectionId}/</span>{ref.path}
              </div>
            ))}
            {refCount > 20 && (
              <div className="px-2 py-0.5 text-secondary text-[color:var(--color-figma-text-secondary)] italic">and {refCount - 20} more…</div>
            )}
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
              <div key={i} className={`px-2 py-0.5 text-secondary border-b border-[var(--color-figma-border)] last:border-b-0 ${LONG_TEXT_CLASSES.monoSecondary}`}>
                <span className="text-[color:var(--color-figma-text-tertiary)]">{impact.collectionName} / </span>
                <span className="text-[color:var(--color-figma-text)]">{impact.optionName}</span>
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
          className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] mb-1"
        >
          <svg width="10" height="10" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
            <path d="M2 1l4 3-4 3" />
          </svg>
          {label}
        </button>
      ) : (
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)] mb-1">{label}</div>
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
  outboundAliasNote,
}: {
  fromCollection: string;
  fromGroup: string | null;
  paths: string[];
  toLabel: string | null;
  conflictCount: number;
  outboundAliasNote?: string | null;
}) {
  const sampleCount = 3;
  const samples = paths.slice(0, sampleCount).map(shortName);
  const remaining = Math.max(0, paths.length - sampleCount);
  const rowClass = "grid grid-cols-[56px_1fr] items-baseline gap-x-2 gap-y-1";
  const labelClass = "text-secondary text-[color:var(--color-figma-text-tertiary)]";
  const valueClass = "text-body text-[color:var(--color-figma-text)] min-w-0";
  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
      <div className={rowClass}>
        <span className={labelClass}>From</span>
        <span className={`${valueClass} ${LONG_TEXT_CLASSES.mono}`}>
          {fromCollection}
          {fromGroup ? (
            <>
              <span className="text-[color:var(--color-figma-text-tertiary)]"> / </span>
              {fromGroup}
            </>
          ) : null}
        </span>
        <span className={labelClass}>Moving</span>
        <span className={`${valueClass} min-w-0`}>
          <span className={LONG_TEXT_CLASSES.mono}>
            {samples.join(", ")}
          </span>
          {remaining > 0 && (
            <span className="text-[color:var(--color-figma-text-tertiary)]">
              {" "}and {remaining} more
            </span>
          )}
        </span>
        <span className={labelClass}>To</span>
        <span className={`${valueClass} ${LONG_TEXT_CLASSES.mono}`}>
          {toLabel ? (
            toLabel
          ) : (
            <span className="text-[color:var(--color-figma-text-tertiary)] italic font-sans">
              Choose a target…
            </span>
          )}
        </span>
      </div>
      {conflictCount > 0 && (
        <div className="text-secondary text-[color:var(--color-figma-text-warning)]">
          {conflictCount} token{conflictCount === 1 ? "" : "s"} will overwrite existing values
        </div>
      )}
      {outboundAliasNote && (
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          {outboundAliasNote}
        </div>
      )}
    </div>
  );
}

function computeGroupScope(
  groupPath: string,
  sourceTokens: Record<string, { $value: unknown }>,
): { paths: string[]; outboundAliasCount: number } {
  const prefix = `${groupPath}.`;
  const paths: string[] = [];
  const inGroup = new Set<string>();
  for (const path of Object.keys(sourceTokens)) {
    if (path === groupPath || path.startsWith(prefix)) {
      paths.push(path);
      inGroup.add(path);
    }
  }
  let outboundAliasCount = 0;
  for (const path of paths) {
    const entry = sourceTokens[path] as { $value: unknown } | undefined;
    if (!entry) continue;
    const aliasTarget = extractAliasPath(
      entry.$value as Parameters<typeof extractAliasPath>[0],
    );
    if (aliasTarget && !inGroup.has(aliasTarget)) {
      outboundAliasCount += 1;
    }
  }
  return { paths, outboundAliasCount };
}

export function TokenListModals() {
  const {
    collectionId,
    collectionIds,
    allTokensFlat: _allTokensFlat,
    perCollectionFlat,
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
  const newGroupParent = newGroupDialogParent ?? '';
  const newGroupPathPreview = normalizeGroupPathPreview(
    newGroupParent,
    newGroupName,
  );

  return (
    <>
      {/* Delete confirmation modal */}
      {deleteConfirm && modalProps && (
        <ConfirmModal
          title={modalProps.title}
          description={modalProps.description}
          confirmLabel={modalProps.confirmLabel}
          danger
          wide={!!(modalProps.pathList || modalProps.affectedRefs || modalProps.modeImpacts?.length)}
          onConfirm={executeDelete}
          onCancel={() => onSetDeleteConfirm(null)}
        >
          <DeleteImpactDetails
            pathList={modalProps.pathList}
            affectedRefs={modalProps.affectedRefs}
            modeImpacts={modalProps.modeImpacts}
          />
        </ConfirmModal>
      )}

      {/* New group dialog */}
      {newGroupDialogParent !== null && (
        <ModalFrame
          titleId="new-group-dialog-title"
          title="New group"
          onClose={() => {
            onSetNewGroupDialogParent(null);
            onSetNewGroupName('');
            onSetNewGroupError('');
          }}
          meta={
            <span>
              In <span className={LONG_TEXT_CLASSES.monoPrimary}>{collectionId}</span>
              {newGroupDialogParent ? (
                <>
                  {" / "}
                  <span className={LONG_TEXT_CLASSES.monoPrimary}>
                    {newGroupDialogParent}
                  </span>
                </>
              ) : null}
            </span>
          }
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  onSetNewGroupDialogParent(null);
                  onSetNewGroupName('');
                  onSetNewGroupError('');
                }}
                className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCreateGroup(newGroupParent, newGroupName)}
                disabled={!newGroupName.trim() || !!newGroupError}
                className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
              >
                Create
              </button>
            </>
          }
        >
            <input
              type="text"
              placeholder={newGroupDialogParent ? 'subgroup or nested.path' : 'group or nested.path'}
              value={newGroupName}
              onChange={e => {
                const v = e.target.value;
                onSetNewGroupName(v);
                onSetNewGroupError(getGroupPathInputError(v));
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateGroup(newGroupParent, newGroupName);
                if (e.key === 'Escape') { onSetNewGroupDialogParent(null); onSetNewGroupName(''); onSetNewGroupError(''); }
              }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[color:var(--color-figma-text)] text-body ${fieldBorderClass(!!newGroupError)}`}
              aria-label="New group name"
              autoFocus
            />
            {newGroupName.trim() && !newGroupError ? (
              <p className="mt-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
                Creates{' '}
                <span className={LONG_TEXT_CLASSES.monoPrimary}>
                  {newGroupPathPreview}
                </span>
              </p>
            ) : null}
            <FieldMessage error={newGroupError} />
        </ModalFrame>
      )}

      {/* Rename token confirmation modal */}
      {renameTokenConfirm && (
        <RenameConfirmModal
          kind="token"
          oldPath={renameTokenConfirm.oldPath}
          newPath={renameTokenConfirm.newPath}
          depCount={renameTokenConfirm.depCount}
          deps={renameTokenConfirm.deps}
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
      {movingGroup && (() => {
        const sourceTokens = perCollectionFlat[collectionId] ?? {};
        const { paths, outboundAliasCount } = computeGroupScope(movingGroup, sourceTokens);
        const targetTokens = moveTargetCollectionId
          ? perCollectionFlat[moveTargetCollectionId] ?? {}
          : null;
        const conflictCount = targetTokens
          ? paths.reduce((count, p) => (targetTokens[p] ? count + 1 : count), 0)
          : 0;
        const outboundAliasNote = outboundAliasCount > 0
          ? `${outboundAliasCount} alias${outboundAliasCount === 1 ? "" : "es"} inside this group will become cross-collection references to ${collectionId}.`
          : null;
        return (
          <ModalFrame
            titleId="move-group-dialog-title"
            title="Move group to collection"
            onClose={() => onSetMovingGroup(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => onSetMovingGroup(null)}
                  className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMoveGroup}
                  disabled={!moveTargetCollectionId}
                  className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
                >
                  Move
                </button>
              </>
            }
          >
              <MoveScopePreview
                fromCollection={collectionId}
                fromGroup={movingGroup}
                paths={paths}
                toLabel={moveTargetCollectionId || null}
                conflictCount={conflictCount}
                outboundAliasNote={outboundAliasNote}
              />
              <select
                value={moveTargetCollectionId}
                onChange={e => onSetMoveTargetCollectionId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
                aria-label="Target collection"
                autoFocus
              >
                <option value="">Choose a collection…</option>
                {collectionIds.filter(s => s !== collectionId).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
          </ModalFrame>
        );
      })()}

      {/* Copy group to collection modal */}
      {copyingGroup && (() => {
        const sourceTokens = perCollectionFlat[collectionId] ?? {};
        const { paths, outboundAliasCount } = computeGroupScope(copyingGroup, sourceTokens);
        const targetTokens = copyTargetCollectionId
          ? perCollectionFlat[copyTargetCollectionId] ?? {}
          : null;
        const conflictCount = targetTokens
          ? paths.reduce((count, p) => (targetTokens[p] ? count + 1 : count), 0)
          : 0;
        const aliasPart = outboundAliasCount > 0
          ? ` ${outboundAliasCount} alias${outboundAliasCount === 1 ? "" : "es"} inside the copy will still reference ${collectionId}.`
          : "";
        const outboundAliasNote = `Originals stay in ${collectionId}.${aliasPart}`;
        return (
          <ModalFrame
            titleId="copy-group-dialog-title"
            title="Copy group to collection"
            onClose={() => onSetCopyingGroup(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => onSetCopyingGroup(null)}
                  className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCopyGroup}
                  disabled={!copyTargetCollectionId}
                  className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
                >
                  Copy
                </button>
              </>
            }
          >
              <MoveScopePreview
                fromCollection={collectionId}
                fromGroup={copyingGroup}
                paths={paths}
                toLabel={copyTargetCollectionId || null}
                conflictCount={conflictCount}
                outboundAliasNote={outboundAliasNote}
              />
              <select
                value={copyTargetCollectionId}
                onChange={e => onSetCopyTargetCollectionId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
                aria-label="Target collection"
                autoFocus
              >
                <option value="">Choose a collection…</option>
                {collectionIds.filter(s => s !== collectionId).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
          </ModalFrame>
        );
      })()}

      {/* Move selected tokens to group modal */}
      {showMoveToGroup && (() => {
        const fromGroup = sharedGroupPrefix(selectedMovePaths);
        const trimmedTarget = moveToGroupTarget.trim();
        const targetGroup = trimmedTarget.replace(/\.+$/, "");
        const toLabel = trimmedTarget
          ? `${collectionId}${targetGroup ? ` / ${targetGroup}` : ""}`
          : null;
        const sourceTokens = perCollectionFlat[collectionId] ?? {};
        const conflictCount = trimmedTarget
          ? selectedMovePaths.reduce((count, path) => {
              const name = shortName(path);
              const newPath = targetGroup ? `${targetGroup}.${name}` : name;
              if (newPath === path) return count;
              return sourceTokens[newPath] ? count + 1 : count;
            }, 0)
          : 0;
        return (
          <ModalFrame
            titleId="move-to-group-dialog-title"
            title={`Move ${selectedMoveCount} token${selectedMoveCount !== 1 ? 's' : ''} to group`}
            onClose={() => { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); }}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => { onSetShowMoveToGroup(false); onSetMoveToGroupError(''); }}
                  className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBatchMoveToGroup}
                  disabled={!moveToGroupTarget.trim()}
                  className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
                >
                  Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''}
                </button>
              </>
            }
          >
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
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[color:var(--color-figma-text)] text-body font-mono focus-visible:border-[var(--color-figma-accent)] ${moveToGroupError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                aria-label="Target group path"
                autoFocus
              />
              <FieldMessage error={moveToGroupError} />
          </ModalFrame>
        );
      })()}

      {/* Batch move selected tokens to another collection */}
      {showBatchMoveToCollection && (() => {
        const fromGroup = sharedGroupPrefix(selectedMovePaths);
        const targetTokens = batchMoveToCollectionTarget
          ? perCollectionFlat[batchMoveToCollectionTarget] ?? {}
          : null;
        const conflictCount = targetTokens
          ? selectedMovePaths.reduce(
              (count, path) => (targetTokens[path] ? count + 1 : count),
              0,
            )
          : 0;
        return (
          <ModalFrame
            titleId="batch-move-collection-dialog-title"
            title={`Move ${selectedMoveCount} token${selectedMoveCount !== 1 ? 's' : ''} to another collection`}
            onClose={() => onSetShowBatchMoveToCollection(false)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => onSetShowBatchMoveToCollection(false)}
                  className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBatchMoveToCollection}
                  disabled={!batchMoveToCollectionTarget}
                  className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
                >
                  Move {selectedMoveCount} token{selectedMoveCount !== 1 ? 's' : ''}
                </button>
              </>
            }
          >
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
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
                aria-label="Target collection"
                autoFocus
              >
                <option value="">Choose a collection…</option>
                {collectionIds.filter(s => s !== collectionId).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
          </ModalFrame>
        );
      })()}

      {/* Batch copy selected tokens to another collection */}
      {showBatchCopyToCollection && (
        <ModalFrame
          titleId="batch-copy-collection-dialog-title"
          title={`Copy ${selectedMoveCount} token${selectedMoveCount !== 1 ? 's' : ''} to another collection`}
          onClose={() => onSetShowBatchCopyToCollection(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => onSetShowBatchCopyToCollection(false)}
                className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBatchCopyToCollection}
                disabled={!batchCopyToCollectionTarget}
                className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
              >
                Copy
              </button>
            </>
          }
        >
            <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
              Tokens will be duplicated into the target collection. Originals in <span className="font-mono text-[color:var(--color-figma-text)]">{collectionId}</span> are kept.
            </div>
            <select
              value={batchCopyToCollectionTarget}
              onChange={e => onSetBatchCopyToCollectionTarget(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') onSetShowBatchCopyToCollection(false);
              }}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
              aria-label="Target collection"
              autoFocus
            >
              {collectionIds.filter(s => s !== collectionId).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
        </ModalFrame>
      )}
    </>
  );
}
