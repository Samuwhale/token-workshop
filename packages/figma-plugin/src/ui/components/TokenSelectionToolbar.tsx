import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useDropdownMenu } from '../hooks/useDropdownMenu';
import type { BatchActionType } from './batch-actions/types';

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
  searchQuery?: string;
}

const menuItemClass =
  'w-full flex items-center gap-2 px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const menuSeparator = 'border-t border-[var(--color-figma-border)] my-1';
const menuPanel =
  'absolute left-0 top-full z-50 mt-1 w-[180px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl';

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
  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-secondary font-medium transition-colors ${
          open
            ? 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]'
            : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
        } disabled:opacity-40 disabled:pointer-events-none`}
      >
        {label}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
          <path d="M1.5 3L4 5.5L6.5 3" />
        </svg>
      </button>
      {open && (
        <div ref={menuRef} className={menuPanel} role="menu">
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
  searchQuery,
}: TokenSelectionToolbarProps) {
  const hasSelection = selectedPaths.size > 0;

  const openAction = useCallback(
    (action: BatchActionType, close: () => void) => {
      close();
      onSetBatchAction(activeBatchAction === action ? null : action);
    },
    [activeBatchAction, onSetBatchAction],
  );

  return (
    <div className="flex items-center gap-1 px-1 py-px border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      {/* Master checkbox + count */}
      <input
        type="checkbox"
        checked={displayedLeafPaths.size > 0 && [...displayedLeafPaths].every(p => selectedPaths.has(p))}
        ref={el => { if (el) el.indeterminate = selectedPaths.size > 0 && selectedPaths.size < displayedLeafPaths.size; }}
        onChange={onSelectAll}
        aria-label="Toggle select all"
        className="shrink-0 accent-[var(--color-figma-accent)]"
      />
      <span className="text-secondary text-[var(--color-figma-text-secondary)] min-w-[3ch] tabular-nums">
        {selectedPaths.size}/{displayedLeafPaths.size}
        {searchQuery ? ` matching "${searchQuery}"` : ''}
      </span>
      {selectedPaths.size === 1 && (
        <span className="text-secondary text-[var(--color-figma-text-tertiary)] pl-1 truncate">
          Shift-click to add a range
        </span>
      )}

      <div className="flex-1" />

      {/* Edit dropdown */}
      {hasSelection && (
        <ToolbarDropdown label="Edit" disabled={!!operationLoading}>
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => openAction('set-description', close)} className={menuItemClass}>
                Set description
              </button>
              <button type="button" role="menuitem" onClick={() => openAction('change-type', close)} className={menuItemClass}>
                Change type
              </button>
              <div className={menuSeparator} />
              {hasColors && (
                <button type="button" role="menuitem" onClick={() => openAction('adjust-colors', close)} className={menuItemClass}>
                  Adjust colors
                </button>
              )}
              {hasNumeric && (
                <button type="button" role="menuitem" onClick={() => openAction('scale-numbers', close)} className={menuItemClass}>
                  Scale numbers
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => openAction('set-value', close)} className={menuItemClass}>
                Set value
              </button>
              <button type="button" role="menuitem" onClick={() => openAction('set-alias', close)} className={menuItemClass}>
                Set alias
              </button>
              <div className={menuSeparator} />
              <button type="button" role="menuitem" onClick={() => openAction('find-replace', close)} className={menuItemClass}>
                Find & replace
              </button>
              <button type="button" role="menuitem" onClick={() => openAction('rewrite-aliases', close)} className={menuItemClass}>
                Rewrite aliases
              </button>
              <div className={menuSeparator} />
              {hasScopableTypes && (
                <button type="button" role="menuitem" onClick={() => openAction('figma-scopes', close)} className={menuItemClass}>
                  Figma scopes
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => openAction('set-extensions', close)} className={menuItemClass}>
                Set extensions
              </button>
              {onCompare && (
                <>
                  <div className={menuSeparator} />
                  <button type="button" role="menuitem" onClick={() => { close(); onCompare(); }} className={menuItemClass}>
                    Compare {selectedPaths.size}
                  </button>
                </>
              )}
            </>
          )}
        </ToolbarDropdown>
      )}

      {/* Copy dropdown */}
      {hasSelection && (
        <ToolbarDropdown label="Copy" disabled={!!operationLoading}>
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => { close(); onCopyJson(); }} className={menuItemClass}>
                <span aria-live="polite">{copyFeedback ? 'Copied!' : 'JSON'}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { close(); onCopyCssVar(); }} className={menuItemClass}>
                <span aria-live="polite">{copyCssFeedback ? 'Copied!' : 'CSS variables'}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { close(); onCopyDtcgRef(); }} className={menuItemClass}>
                <span aria-live="polite" className="font-mono">{copyAliasFeedback ? 'Copied!' : '{alias}'}</span>
              </button>
            </>
          )}
        </ToolbarDropdown>
      )}

      {/* Move dropdown */}
      {hasSelection && (
        <ToolbarDropdown label="Move" disabled={!!operationLoading}>
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => { close(); onMoveToGroup(); }} className={menuItemClass}>
                Move to group…
              </button>
              {collectionIds.length > 1 && (
                <>
                  <button type="button" role="menuitem" onClick={() => { close(); onMoveToCollection(); }} className={menuItemClass}>
                    Move to collection…
                  </button>
                  <button type="button" role="menuitem" onClick={() => { close(); onCopyToCollection(); }} className={menuItemClass}>
                    Copy to collection…
                  </button>
                </>
              )}
              <div className={menuSeparator} />
              <button type="button" role="menuitem" onClick={() => { close(); onLinkToTokens(); }} className={menuItemClass}>
                Promote to alias
              </button>
            </>
          )}
        </ToolbarDropdown>
      )}

      {/* Delete */}
      {hasSelection && (
        <button
          onClick={onRequestBulkDelete}
          disabled={!!operationLoading}
          className="shrink-0 px-1.5 py-0.5 rounded text-secondary font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Delete
        </button>
      )}

      {/* Exit */}
      <button
        onClick={onClearSelection}
        className="shrink-0 p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        aria-label="Clear selection"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  );
}
