import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useDropdownMenu } from '../hooks/useDropdownMenu';
import { useAnchoredFloatingStyle } from '../shared/floatingPosition';
import {
  FLOATING_MENU_ITEM_CLASS,
  FLOATING_MENU_WIDE_CLASS,
} from '../shared/menuClasses';
import type { BatchActionType } from './batch-actions/types';
import { Button } from '../primitives';

export interface TokenSelectionToolbarProps {
  selectedPaths: Set<string>;
  displayedLeafPaths: Set<string>;
  collectionIds: string[];
  operationLoading: string | null;
  activeBatchAction: BatchActionType | null;
  hasColors: boolean;
  hasNumeric: boolean;
  hasScopableTypes: boolean;
  copyFeedback: boolean;
  copyCssFeedback: boolean;
  copyAliasFeedback: boolean;
  onSelectAll: () => void;
  onSetBatchAction: (action: BatchActionType | null) => void;
  onRequestBulkDelete: () => void;
  onClearSelection: () => void;
  onCopyJson: () => void;
  onCopyCssVar: () => void;
  onCopyDtcgRef: () => void;
  onMoveToGroup: () => void;
  onMoveToCollection: () => void;
  onCopyToCollection: () => void;
  onCompare?: () => void;
  onLinkToTokens: () => void;
}

const menuSeparator = 'border-t border-[var(--color-figma-border)] my-1';
const menuPanel = FLOATING_MENU_WIDE_CLASS;

function ToolbarDropdown({
  label,
  children,
  disabled,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
  disabled?: boolean;
}) {
  const { open, menuRef, triggerRef, toggle, close } = useDropdownMenu();
  const menuStyle = useAnchoredFloatingStyle({
    triggerRef,
    open,
    preferredWidth: 220,
    preferredHeight: 320,
    align: 'end',
  });
  return (
    <div className="tm-selection-toolbar__menu relative">
      <Button
        ref={triggerRef}
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        variant="ghost"
        size="sm"
        className="tm-selection-toolbar__action-button justify-between gap-2"
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
          <path d="M1.5 3L4 5.5L6.5 3" />
        </svg>
      </Button>
      {open && (
        <div
          ref={menuRef}
          style={menuStyle ?? { visibility: 'hidden' }}
          className={menuPanel}
          role="menu"
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function TokenSelectionToolbar({
  selectedPaths,
  displayedLeafPaths,
  collectionIds,
  operationLoading,
  activeBatchAction,
  hasColors,
  hasNumeric,
  hasScopableTypes,
  copyFeedback,
  copyCssFeedback,
  copyAliasFeedback,
  onSelectAll,
  onSetBatchAction,
  onRequestBulkDelete,
  onClearSelection,
  onCopyJson,
  onCopyCssVar,
  onCopyDtcgRef,
  onMoveToGroup,
  onMoveToCollection,
  onCopyToCollection,
  onCompare,
  onLinkToTokens,
}: TokenSelectionToolbarProps) {
  const hasSelection = selectedPaths.size > 0;
  const displayedSelectionCount = displayedLeafPaths.size;
  const visibleSelectedCount = [...displayedLeafPaths].filter((path) =>
    selectedPaths.has(path),
  ).length;
  const hasVisibleSelection = visibleSelectedCount > 0;
  const canToggleVisibleSelection = displayedSelectionCount > 0;
  const hiddenSelectionCount = Math.max(
    0,
    selectedPaths.size - visibleSelectedCount,
  );
  const allDisplayedSelected =
    displayedSelectionCount > 0 &&
    [...displayedLeafPaths].every((path) => selectedPaths.has(path));
  const partiallySelected =
    selectedPaths.size > 0 && !allDisplayedSelected;
  const totalSelectedLabel = `${selectedPaths.size} selected total`;
  const visibleSelectedLabel = `${visibleSelectedCount} selected in these results`;
  const selectionSummary =
    displayedSelectionCount === 0
      ? "No visible tokens"
      : visibleSelectedCount === 0
        ? `${displayedSelectionCount} visible token${
            displayedSelectionCount === 1 ? "" : "s"
          }`
        : hiddenSelectionCount > 0
          ? totalSelectedLabel
          : `${visibleSelectedCount} selected`;
  const selectionMetaParts = [
    hiddenSelectionCount > 0 ? visibleSelectedLabel : null,
    hiddenSelectionCount > 0
      ? `${hiddenSelectionCount} selected outside these results`
      : null,
    selectedPaths.size === 1 && hiddenSelectionCount === 0
      ? "Shift-click adds a range"
      : null,
  ].filter(Boolean);
  const selectionMeta =
    selectionMetaParts.length > 0 ? selectionMetaParts.join(" · ") : null;

  const openAction = useCallback(
    (action: BatchActionType, close: () => void) => {
      close();
      onSetBatchAction(activeBatchAction === action ? null : action);
    },
    [activeBatchAction, onSetBatchAction],
  );

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="tm-responsive-toolbar tm-selection-toolbar px-3 py-2">
        <div className="tm-responsive-toolbar__row">
          <div className="tm-responsive-toolbar__leading">
            <label
              className={`tm-selection-toolbar__selection-toggle ${
                hasVisibleSelection ? 'tm-selection-toolbar__selection-toggle--active' : ''
              } ${
                canToggleVisibleSelection
                  ? ''
                  : 'tm-selection-toolbar__selection-toggle--disabled'
              }`}
            >
              <input
                type="checkbox"
                checked={allDisplayedSelected}
                disabled={!canToggleVisibleSelection}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = partiallySelected;
                  }
                }}
                onChange={onSelectAll}
                aria-label="Select or clear all visible tokens"
                className="shrink-0 accent-[var(--color-figma-accent)]"
              />
              <span className="tm-selection-toolbar__selection-copy">
                <span
                  className="tm-selection-toolbar__selection-count text-secondary tabular-nums text-[color:var(--color-figma-text-secondary)]"
                  title={`${selectedPaths.size} selected total`}
                >
                  {selectionSummary}
                </span>
                {selectionMeta ? (
                  <span
                    className="tm-selection-toolbar__selection-meta text-secondary text-[color:var(--color-figma-text-tertiary)]"
                    title={selectionMeta}
                  >
                    {selectionMeta}
                  </span>
                ) : null}
              </span>
            </label>
          </div>
          <div className="tm-responsive-toolbar__actions">
            {hasSelection ? (
              <Button
                onClick={onClearSelection}
                variant="ghost"
                size="sm"
                className="justify-start"
              >
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
                <span className="tm-toolbar-action__label">Clear</span>
              </Button>
            ) : null}
          </div>
        </div>

        {hiddenSelectionCount > 0 ? (
          <div className="tm-responsive-toolbar__row">
            <div className="min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-warning)] px-2.5 py-1.5 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-warning)]">
              Actions apply to all {selectedPaths.size} selected tokens, including {hiddenSelectionCount} outside these results.
            </div>
          </div>
        ) : null}

        {hasSelection ? (
          <div className="tm-responsive-toolbar__row">
            <div className="tm-responsive-toolbar__actions tm-selection-toolbar__bulk-actions">
              <ToolbarDropdown label="Edit" disabled={!!operationLoading}>
                {(close) => (
                  <>
                    <button type="button" role="menuitem" onClick={() => openAction('set-description', close)} className={FLOATING_MENU_ITEM_CLASS}>
                      Set description
                    </button>
                    <button type="button" role="menuitem" onClick={() => openAction('change-type', close)} className={FLOATING_MENU_ITEM_CLASS}>
                      Change type
                    </button>
                    <div className={menuSeparator} />
                    {hasColors && (
                      <button type="button" role="menuitem" onClick={() => openAction('adjust-colors', close)} className={FLOATING_MENU_ITEM_CLASS}>
                        Adjust colors
                      </button>
                    )}
                    {hasNumeric && (
                      <button type="button" role="menuitem" onClick={() => openAction('scale-numbers', close)} className={FLOATING_MENU_ITEM_CLASS}>
                        Scale numbers
                      </button>
                    )}
                    <button type="button" role="menuitem" onClick={() => openAction('set-value', close)} className={FLOATING_MENU_ITEM_CLASS}>
                      Set value
                    </button>
                    <button type="button" role="menuitem" onClick={() => openAction('set-alias', close)} className={FLOATING_MENU_ITEM_CLASS}>
                      Set alias
                    </button>
                    <div className={menuSeparator} />
                    <button type="button" role="menuitem" onClick={() => openAction('find-replace', close)} className={FLOATING_MENU_ITEM_CLASS}>
                      Find & replace
                    </button>
                    <button type="button" role="menuitem" onClick={() => openAction('rewrite-aliases', close)} className={FLOATING_MENU_ITEM_CLASS}>
                      Rewrite aliases
                    </button>
                    <div className={menuSeparator} />
                    {hasScopableTypes && (
                      <button type="button" role="menuitem" onClick={() => openAction('figma-scopes', close)} className={FLOATING_MENU_ITEM_CLASS}>
                        Can apply to
                      </button>
                    )}
                    <button type="button" role="menuitem" onClick={() => openAction('set-extensions', close)} className={FLOATING_MENU_ITEM_CLASS}>
                      Set extensions
                    </button>
                    {onCompare && (
                      <>
                        <div className={menuSeparator} />
                        <button type="button" role="menuitem" onClick={() => { close(); onCompare(); }} className={FLOATING_MENU_ITEM_CLASS}>
                          Compare {selectedPaths.size}
                        </button>
                      </>
                    )}
                  </>
                )}
              </ToolbarDropdown>

              <ToolbarDropdown label="Copy" disabled={!!operationLoading}>
                {(close) => (
                  <>
                    <button type="button" role="menuitem" onClick={() => { close(); onCopyJson(); }} className={FLOATING_MENU_ITEM_CLASS}>
                      <span aria-live="polite">{copyFeedback ? 'Copied!' : 'JSON'}</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { close(); onCopyCssVar(); }} className={FLOATING_MENU_ITEM_CLASS}>
                      <span aria-live="polite">{copyCssFeedback ? 'Copied!' : 'CSS variables'}</span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => { close(); onCopyDtcgRef(); }} className={FLOATING_MENU_ITEM_CLASS}>
                      <span aria-live="polite" className="font-mono">{copyAliasFeedback ? 'Copied!' : '{alias}'}</span>
                    </button>
                  </>
                )}
              </ToolbarDropdown>

              <ToolbarDropdown label="Move" disabled={!!operationLoading}>
                {(close) => (
                  <>
                    <button type="button" role="menuitem" onClick={() => { close(); onMoveToGroup(); }} className={FLOATING_MENU_ITEM_CLASS}>
                      Move to group…
                    </button>
                    {collectionIds.length > 1 && (
                      <>
                        <button type="button" role="menuitem" onClick={() => { close(); onMoveToCollection(); }} className={FLOATING_MENU_ITEM_CLASS}>
                          Move to collection…
                        </button>
                        <button type="button" role="menuitem" onClick={() => { close(); onCopyToCollection(); }} className={FLOATING_MENU_ITEM_CLASS}>
                          Copy to collection…
                        </button>
                      </>
                    )}
                    <div className={menuSeparator} />
                    <button type="button" role="menuitem" onClick={() => { close(); onLinkToTokens(); }} className={FLOATING_MENU_ITEM_CLASS}>
                      Promote to alias
                    </button>
                  </>
                )}
              </ToolbarDropdown>

              <Button
                onClick={onRequestBulkDelete}
                disabled={!!operationLoading}
                variant="ghost"
                size="sm"
                className="tm-selection-toolbar__action-button justify-start text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/10 hover:text-[color:var(--color-figma-text-error)]"
              >
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
