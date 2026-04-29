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
import { clampPopoverToViewport } from '../shared/floatingPosition';

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

  const { top, left, width: popoverWidth, maxHeight } = clampPopoverToViewport({
    anchorRect,
    preferredWidth: Math.min(
      Math.max(anchorRect.width + 160, 320),
      520,
    ),
    preferredHeight: 480,
    minVerticalSpace: 220,
  });

  const typeBadgeClass = tokenTypeBadgeClass(tokenType);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded-md shadow-xl flex flex-col"
      style={{
        top,
        left,
        width: popoverWidth,
        maxHeight,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start gap-2 border-b border-[var(--color-figma-border)] px-3 py-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-[color:var(--color-figma-text)] truncate" title={tokenPath}>
            {tokenName}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
            {modeLabel ? (
              <span className="min-w-0 truncate" title={`Mode: ${modeLabel}`}>
                {modeLabel}
              </span>
            ) : null}
            <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${typeBadgeClass}`}>
              {tokenType}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[color:var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
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
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-figma-border)] px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={onOpenFullEditor}
          className="min-w-0 text-secondary text-[color:var(--color-figma-text-tertiary)] transition-colors hover:text-[color:var(--color-figma-text-accent)] hover:underline"
        >
          Open token details →
        </button>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[26px] items-center justify-center rounded px-2 py-1 text-body text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex min-h-[26px] items-center justify-center rounded bg-[var(--color-figma-action-bg)] px-2.5 py-1 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
