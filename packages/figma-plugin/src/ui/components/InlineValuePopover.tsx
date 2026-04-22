/**
 * InlineValuePopover — lightweight token-details value editing.
 *
 * Opens when a user clicks a value cell in the token list or presses Enter
 * on a focused row. Reuses the same mode-row editing affordances as the
 * shared token details surface while staying limited to value editing only.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { tokenTypeBadgeClass } from '../../shared/types';
import { TokenDetailsModeRow } from './token-details/TokenDetailsModeRow';

export interface InlineValuePopoverProps {
  tokenPath: string;
  tokenName: string;
  tokenType: string;
  currentValue: unknown;
  /** Mode label shown in the header; omit for single-mode collections. */
  modeLabel?: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  /** Bounding rect of the clicked cell — used to position the popover. */
  anchorRect: DOMRect;
  onSave: (
    newValue: unknown,
    previousState: { type?: string; value: unknown },
  ) => void;
  onOpenFullEditor: () => void;
  onClose: () => void;
  /** Tab navigation between adjacent value cells within the same row. */
  onTab?: (direction: 1 | -1) => void;
}

export function InlineValuePopover({
  tokenPath,
  tokenName,
  tokenType,
  currentValue,
  modeLabel,
  allTokensFlat,
  pathToCollectionId = {},
  anchorRect,
  onSave,
  onOpenFullEditor,
  onClose,
  onTab,
}: InlineValuePopoverProps) {
  const [draftValue, setDraftValue] = useState(currentValue);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click. Small delay so the triggering click doesn't immediately close us.
  useEffect(() => {
    const timer = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, 100);
    return () => clearTimeout(timer);
  }, [onClose]);

  const handleSave = useCallback(() => {
    onSave(draftValue, { type: tokenType, value: currentValue });
  }, [currentValue, draftValue, onSave, tokenType]);

  // Popover-level keyboard: Escape cancels, Enter saves (unless in textarea), Tab navigates.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const inTextarea = target?.tagName === 'TEXTAREA';
      if (e.key === 'Enter' && !inTextarea) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        return;
      }
      if (e.key === 'Tab' && onTab) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        onTab(e.shiftKey ? -1 : 1);
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [handleSave, onClose, onTab]);

  // Compute popover position: prefer below the cell, flip above if needed.
  const POPOVER_WIDTH = 320;
  const POPOVER_MAX_HEIGHT = 480;
  const MARGIN = 8;

  const left = Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - MARGIN);
  const spaceBelow = window.innerHeight - anchorRect.bottom - MARGIN;
  const spaceAbove = anchorRect.top - MARGIN;
  const top = spaceBelow >= Math.min(POPOVER_MAX_HEIGHT, 200)
    ? anchorRect.bottom + 2
    : spaceAbove >= Math.min(POPOVER_MAX_HEIGHT, 200)
      ? anchorRect.top - Math.min(POPOVER_MAX_HEIGHT, spaceAbove) - 2
      : anchorRect.bottom + 2;

  const typeBadgeClass = tokenTypeBadgeClass(tokenType);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded-md shadow-xl flex flex-col"
      style={{
        top,
        left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
        <span className="text-body text-[var(--color-figma-text)] font-medium truncate min-w-0" title={tokenPath}>
          {tokenName}
        </span>
        {modeLabel && (
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] shrink-0 truncate max-w-[80px]" title={`Mode: ${modeLabel}`}>
            {modeLabel}
          </span>
        )}
        <span className="flex-1" />
        <span className={`px-1.5 py-0.5 rounded text-secondary font-medium shrink-0 ${typeBadgeClass}`}>
          {tokenType}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        <div className="rounded-md border border-[var(--color-figma-border)]/65 divide-y divide-[var(--color-figma-border)]/50">
          <TokenDetailsModeRow
            modeName={modeLabel ?? tokenName}
            tokenType={tokenType}
            value={draftValue}
            editable
            onChange={setDraftValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            showModeLabel={Boolean(modeLabel)}
            autoFocus
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--color-figma-border)] shrink-0">
        <button
          type="button"
          onClick={onOpenFullEditor}
          className="text-secondary text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] hover:underline mr-auto transition-colors"
        >
          Open token details →
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-2.5 py-1 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
