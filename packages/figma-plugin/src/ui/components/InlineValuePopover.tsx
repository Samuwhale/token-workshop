/**
 * InlineValuePopover — unified quick editor for every editable token type.
 *
 * Opens when a user clicks a value cell in the token list or presses Enter
 * on a focused row. Uses the same per-type editors as the full TokenEditor
 * (ColorEditor, DimensionEditor, BooleanEditor, etc.) so the quick path is
 * no longer limited to plain text inputs. The popover stays lightweight: one
 * mode at a time, escape hatch to the full editor, no metadata editing.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias } from '../../shared/resolveAlias';
import { AliasAutocomplete } from './AliasAutocomplete';
import {
  ColorEditor,
  DimensionEditor,
  NumberEditor,
  StringEditor,
  BooleanEditor,
  FontFamilyEditor,
  FontWeightEditor,
  DurationEditor,
  AssetEditor,
  TypographyEditor,
  ShadowEditor,
  BorderEditor,
  GradientEditor,
  CompositionEditor,
  CubicBezierEditor,
  TransitionEditor,
  StrokeStyleEditor,
  FontStyleEditor,
  TextDecorationEditor,
  TextTransformEditor,
  PercentageEditor,
  LinkEditor,
  LetterSpacingEditor,
  LineHeightEditor,
  CustomEditor,
} from './ValueEditors';
import { tokenTypeBadgeClass } from '../../shared/types';

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

// ---------------------------------------------------------------------------
// Editor switcher — picks the right sub-editor for the token type
// ---------------------------------------------------------------------------
function TypeEditor({
  type,
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
}: {
  type: string;
  value: unknown;
  onChange: (v: unknown) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
}) {
  switch (type) {
    case 'color':
      return <ColorEditor value={value} onChange={onChange} autoFocus allTokensFlat={allTokensFlat} />;
    case 'dimension':
      return <DimensionEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} autoFocus />;
    case 'number':
      return <NumberEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} autoFocus />;
    case 'string':
      return <StringEditor value={value} onChange={onChange} autoFocus />;
    case 'boolean':
      return <BooleanEditor value={value} onChange={onChange} />;
    case 'fontFamily':
      return <FontFamilyEditor value={value} onChange={onChange} autoFocus />;
    case 'fontWeight':
      return <FontWeightEditor value={value} onChange={onChange} />;
    case 'duration':
      return <DurationEditor value={value} onChange={onChange} autoFocus />;
    case 'asset':
      return <AssetEditor value={value} onChange={onChange} />;
    case 'shadow':
      return <ShadowEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} />;
    case 'border':
      return <BorderEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} />;
    case 'typography':
      return <TypographyEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} />;
    case 'gradient':
      return <GradientEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} />;
    case 'composition':
      return <CompositionEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} />;
    case 'cubicBezier':
      return <CubicBezierEditor value={value} onChange={onChange} />;
    case 'transition':
      return <TransitionEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} />;
    case 'strokeStyle':
      return <StrokeStyleEditor value={value} onChange={onChange} />;
    case 'fontStyle':
      return <FontStyleEditor value={value} onChange={onChange} />;
    case 'textDecoration':
      return <TextDecorationEditor value={value} onChange={onChange} />;
    case 'textTransform':
      return <TextTransformEditor value={value} onChange={onChange} />;
    case 'percentage':
      return <PercentageEditor value={value} onChange={onChange} />;
    case 'link':
      return <LinkEditor value={value} onChange={onChange} />;
    case 'letterSpacing':
      return <LetterSpacingEditor value={value} onChange={onChange} />;
    case 'lineHeight':
      return <LineHeightEditor value={value} onChange={onChange} />;
    case 'custom':
      return <CustomEditor value={value} onChange={onChange} />;
    default:
      return (
        <p className="text-body text-[var(--color-figma-text-secondary)] py-2">
          No quick editor for type <code className="font-mono">{type}</code>. Use the full editor.
        </p>
      );
  }
}

// ---------------------------------------------------------------------------
// Alias editor mode — autocomplete search inside the popover
// ---------------------------------------------------------------------------
function AliasEditor({
  tokenType,
  aliasQuery,
  setAliasQuery,
  allTokensFlat,
  pathToCollectionId,
  onSelect,
}: {
  tokenType: string;
  aliasQuery: string;
  setAliasQuery: (q: string) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <input
        autoFocus
        type="text"
        value={aliasQuery}
        onChange={e => setAliasQuery(e.target.value)}
        className="w-full border border-[var(--color-figma-border)] rounded px-2 py-1 text-body bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
        placeholder="Search tokens…"
        onKeyDown={e => { if (e.key === 'Escape') e.stopPropagation(); }}
      />
      <AliasAutocomplete
        query={aliasQuery}
        allTokensFlat={allTokensFlat}
        pathToCollectionId={pathToCollectionId}
        filterType={tokenType || undefined}
        onSelect={onSelect}
        onClose={() => {}}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineValuePopover
// ---------------------------------------------------------------------------
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
  const isCurrentAlias = isAlias(currentValue as import('@tokenmanager/core').TokenValue | undefined);

  const [aliasMode, setAliasMode] = useState(isCurrentAlias);
  const [draftValue, setDraftValue] = useState(currentValue);
  const [aliasQuery, setAliasQuery] = useState('');
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

  const handleAliasSelect = useCallback((path: string) => {
    onSave(`{${path}}`, { type: tokenType, value: currentValue });
  }, [currentValue, onSave, tokenType]);

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
      if (e.key === 'Enter' && !inTextarea && !aliasMode) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        return;
      }
      if (e.key === 'Tab' && onTab) {
        e.preventDefault();
        e.stopPropagation();
        if (!aliasMode) handleSave();
        else onClose();
        onTab(e.shiftKey ? -1 : 1);
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [aliasMode, handleSave, onClose, onTab]);

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
          title={aliasMode ? 'Switch to direct value' : 'Link to token (alias)'}
          onClick={() => {
            if (aliasMode) {
              setAliasMode(false);
              setDraftValue(
                currentValue && !isAlias(currentValue as import('@tokenmanager/core').TokenValue | undefined)
                  ? (currentValue as import('@tokenmanager/core').TokenValue)
                  : undefined,
              );
            } else {
              setAliasMode(true);
              setAliasQuery('');
            }
          }}
          className={`shrink-0 px-1.5 py-0.5 rounded text-secondary font-medium transition-colors ${
            aliasMode
              ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/25'
              : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          {aliasMode ? 'alias' : '→ alias'}
        </button>
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
        {aliasMode ? (
          <AliasEditor
            tokenType={tokenType}
            aliasQuery={aliasQuery}
            setAliasQuery={setAliasQuery}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            onSelect={handleAliasSelect}
          />
        ) : (
          <TypeEditor
            type={tokenType}
            value={draftValue}
            onChange={setDraftValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
      </div>

      {/* Footer */}
      {!aliasMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--color-figma-border)] shrink-0">
          <button
            type="button"
            onClick={onOpenFullEditor}
            className="text-secondary text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] hover:underline mr-auto transition-colors"
          >
            Open full editor →
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
      )}
    </div>
  );
}
