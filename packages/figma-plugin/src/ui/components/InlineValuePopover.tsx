/**
 * InlineValuePopover — compact value/reference editing from the token table.
 *
 * This is intentionally separate from TokenDetailsModeRow. The table needs a
 * fast editor that fits inside a small popover; full structured editors live in
 * token details where there is enough room to work deliberately.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { resolveCollectionIdForPath } from '@token-workshop/core';
import type { TokenMapEntry } from '../../shared/types';
import { tokenTypeBadgeClass } from '../../shared/types';
import { extractAliasPath, isAlias } from '../../shared/resolveAlias';
import {
  clampPopoverToViewport,
  useAnchoredFloatingStyle,
} from '../shared/floatingPosition';
import { stableStringify } from '../shared/utils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { parseInlineValue } from './tokenListHelpers';
import { getDefaultValue } from './tokenListUtils';
import { AliasAutocomplete } from './AliasAutocomplete';
import { ValuePreview } from './ValuePreview';
import {
  Button,
  SegmentedControl,
  TextArea,
  TextInput,
} from '../primitives';

export interface InlineValuePopoverProps {
  tokenPath: string;
  tokenName: string;
  tokenType: string;
  currentValue: unknown;
  /** Mode label shown in the header; omit for single-mode collections. */
  modeLabel?: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  preferredCollectionId?: string;
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

const STRUCTURED_LITERAL_TYPES = new Set([
  'typography',
  'shadow',
  'border',
  'gradient',
  'transition',
  'composition',
]);

function getCurrentSource(value: unknown): 'value' | 'reference' {
  return typeof value === 'string' && isAlias(value) ? 'reference' : 'value';
}

function formatQuickLiteralValue(tokenType: string, value: unknown): string {
  if (typeof value === 'string' && isAlias(value)) {
    return '';
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (tokenType === 'dimension' || tokenType === 'duration') {
    return formatTokenValueForDisplay(tokenType, value, { emptyPlaceholder: '' });
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    return stableStringify(value);
  }
  return String(value);
}

function formatQuickSummary(tokenType: string, value: unknown): string {
  return formatTokenValueForDisplay(tokenType, value, {
    emptyPlaceholder: 'Not set',
  });
}

function getParseError(tokenType: string): string {
  if (tokenType === 'boolean') return 'Use true or false.';
  if (tokenType === 'number' || tokenType === 'fontWeight') {
    return 'Enter a number.';
  }
  if (tokenType === 'dimension') return 'Enter a size like 16px or 1rem.';
  if (tokenType === 'duration') return 'Enter a time like 200ms or 0.2s.';
  return 'Enter a valid value.';
}

export function InlineValuePopover({
  tokenPath,
  tokenName,
  tokenType,
  currentValue,
  modeLabel,
  allTokensFlat,
  pathToCollectionId = {},
  collectionIdsByPath = {},
  preferredCollectionId,
  anchorRect,
  onSave,
  onOpenFullEditor,
  onClose,
  onTab,
}: InlineValuePopoverProps) {
  const currentSource = getCurrentSource(currentValue);
  const initialLiteralText = useMemo(
    () => formatQuickLiteralValue(tokenType, currentValue),
    [currentValue, tokenType],
  );
  const initialAliasQuery = useMemo(
    () =>
      typeof currentValue === 'string' && isAlias(currentValue)
        ? extractAliasPath(currentValue) ?? ''
        : '',
    [currentValue],
  );
  const [source, setSource] = useState<'value' | 'reference'>(currentSource);
  const [literalText, setLiteralText] = useState(initialLiteralText);
  const [aliasQuery, setAliasQuery] = useState(initialAliasQuery);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousLiteralTextRef = useRef(initialLiteralText);
  const popoverRef = useRef<HTMLDivElement>(null);
  const literalInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const aliasInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextSource = getCurrentSource(currentValue);
    const nextLiteral = formatQuickLiteralValue(tokenType, currentValue);
    const nextAlias =
      typeof currentValue === 'string' && isAlias(currentValue)
        ? extractAliasPath(currentValue) ?? ''
        : '';

    setSource(nextSource);
    setLiteralText(nextLiteral);
    setAliasQuery(nextAlias);
    setAutocompleteOpen(false);
    setError(null);
    previousLiteralTextRef.current = nextLiteral;
  }, [currentValue, modeLabel, tokenPath, tokenType]);

  // Close on outside click. Small delay so the triggering click doesn't immediately close us.
  useEffect(() => {
    let removeListener: (() => void) | null = null;
    const timer = setTimeout(() => {
      const handleClick = (e: MouseEvent) => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handleClick);
      removeListener = () => document.removeEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      removeListener?.();
    };
  }, [onClose]);

  const structuredLiteral = STRUCTURED_LITERAL_TYPES.has(tokenType);
  const displaySummary = formatQuickSummary(tokenType, currentValue);

  const commitSave = useCallback((): boolean => {
    if (source === 'reference') {
      const path = aliasQuery.trim();
      if (!path) {
        setError('Enter a token path.');
        aliasInputRef.current?.focus();
        return false;
      }
      const aliasResolution = resolveCollectionIdForPath({
        path,
        pathToCollectionId,
        collectionIdsByPath,
        preferredCollectionId,
      });
      if (aliasResolution.reason === 'missing') {
        setError('No token at this path.');
        aliasInputRef.current?.focus();
        return false;
      }
      if (aliasResolution.reason === 'ambiguous') {
        setError('Path exists in multiple collections.');
        aliasInputRef.current?.focus();
        return false;
      }
      onSave(`{${path}}`, { type: tokenType, value: currentValue });
      return true;
    }

    if (structuredLiteral) {
      onSave(currentValue, { type: tokenType, value: currentValue });
      return true;
    }

    const parsed = parseInlineValue(tokenType, literalText);
    if (parsed === null) {
      setError(getParseError(tokenType));
      literalInputRef.current?.focus();
      return false;
    }
    onSave(parsed, { type: tokenType, value: currentValue });
    return true;
  }, [
    aliasQuery,
    collectionIdsByPath,
    currentValue,
    literalText,
    onSave,
    pathToCollectionId,
    preferredCollectionId,
    source,
    structuredLiteral,
    tokenType,
  ]);

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
      const inAliasInput = target?.closest('.tm-token-mode-row__alias-input');
      if (e.key === 'Enter' && inAliasInput) {
        return;
      }
      if (e.key === 'Enter' && !inTextarea) {
        e.preventDefault();
        e.stopPropagation();
        commitSave();
        return;
      }
      if (e.key === 'Tab' && onTab) {
        e.preventDefault();
        e.stopPropagation();
        if (commitSave()) {
          onTab(e.shiftKey ? -1 : 1);
        }
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [commitSave, onClose, onTab]);

  const suggestionsOpen = source === 'reference' && autocompleteOpen;
  const { top, left, width: popoverWidth, maxHeight } = clampPopoverToViewport({
    anchorRect,
    preferredWidth: Math.min(
      Math.max(anchorRect.width + 120, 300),
      400,
    ),
    preferredHeight: 340,
    minVerticalSpace: 180,
  });
  const autocompleteFloatingStyle = useAnchoredFloatingStyle({
    triggerRef: aliasInputRef,
    open: suggestionsOpen,
    preferredWidth: Math.max(260, popoverWidth - 24),
    preferredHeight: 260,
    minVerticalSpace: 180,
  });

  const typeBadgeClass = tokenTypeBadgeClass(tokenType);
  const showMultilineLiteral =
    tokenType === 'string' && literalText.length > 48;
  const modeCaption = modeLabel ? `${modeLabel} mode` : 'Mode value';
  const errorId = 'inline-value-popover-error';
  const switchSource = (nextSource: 'value' | 'reference') => {
    setError(null);
    if (nextSource === source) return;
    if (nextSource === 'reference') {
      previousLiteralTextRef.current = literalText;
      setAliasQuery(currentSource === 'reference' ? initialAliasQuery : '');
      setAutocompleteOpen(true);
    } else {
      const restoredLiteral = previousLiteralTextRef.current;
      setLiteralText(
        restoredLiteral === ''
          ? formatQuickLiteralValue(tokenType, getDefaultValue(tokenType))
          : restoredLiteral,
      );
      setAutocompleteOpen(false);
    }
    setSource(nextSource);
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 flex flex-col rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-popover)]"
      style={{
        top,
        left,
        width: popoverWidth,
        maxHeight,
      }}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-start gap-2 border-b border-[var(--color-figma-border)] px-3 py-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-[color:var(--color-figma-text)] truncate" title={tokenPath}>
            {tokenName}
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
            {modeLabel ? (
              <span className="min-w-0 truncate" title={`Mode: ${modeLabel}`}>
                {modeCaption}
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

      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
        <div className="flex flex-col gap-2">
          <SegmentedControl
            value={source}
            options={[
              { value: 'value', label: 'Value' },
              { value: 'reference', label: 'Token' },
            ]}
            onChange={switchSource}
            ariaLabel={`${modeLabel ?? tokenName} value source`}
            size="compact"
          />

          {source === 'reference' ? (
            <div className="relative flex flex-col gap-1.5">
              <TextInput
                ref={aliasInputRef}
                size="sm"
                value={aliasQuery}
                onChange={(event) => {
                  setAliasQuery(event.target.value);
                  setError(null);
                  setAutocompleteOpen(true);
                }}
                onFocus={() => setAutocompleteOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setAutocompleteOpen(false);
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (commitSave()) onClose();
                  }
                }}
                placeholder="token.path"
                aria-label="Reference token path"
                aria-describedby={error ? errorId : undefined}
                invalid={Boolean(error)}
                className="tm-token-mode-row__alias-input font-mono"
                autoFocus
              />
              {autocompleteOpen ? (
                <AliasAutocomplete
                  query={aliasQuery}
                  allTokensFlat={allTokensFlat}
                  pathToCollectionId={pathToCollectionId}
                  preferredCollectionId={preferredCollectionId}
                  collectionDisplayNames={undefined}
                  previewModeName={modeLabel}
                  filterType={tokenType}
                  floatingStyle={autocompleteFloatingStyle}
                  onSelect={(path) => {
                    setAliasQuery(path);
                    setAutocompleteOpen(false);
                    setError(null);
                  }}
                  onClose={() => setAutocompleteOpen(false)}
                />
              ) : null}
            </div>
          ) : structuredLiteral ? (
            <div className="flex min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--surface-muted)] px-2 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <ValuePreview type={tokenType} value={currentValue} size={16} />
                <span className="min-w-0 flex-1 truncate font-mono text-body text-[color:var(--color-figma-text)]" title={displaySummary}>
                  {displaySummary}
                </span>
              </div>
            </div>
          ) : showMultilineLiteral ? (
            <TextArea
              ref={(node) => {
                literalInputRef.current = node;
              }}
              size="sm"
              rows={3}
              value={literalText}
              onChange={(event) => {
                setLiteralText(event.target.value);
                setError(null);
              }}
              autoFocus
              aria-label="Token value"
              aria-describedby={error ? errorId : undefined}
              invalid={Boolean(error)}
              className="font-mono"
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <ValuePreview type={tokenType} value={currentValue} size={16} />
              <TextInput
                ref={(node) => {
                  literalInputRef.current = node;
                }}
                size="sm"
                value={literalText}
                onChange={(event) => {
                  setLiteralText(event.target.value);
                  setError(null);
                }}
                autoFocus
                aria-label="Token value"
                aria-describedby={error ? errorId : undefined}
                invalid={Boolean(error)}
                className="font-mono"
              />
            </div>
          )}

          {error ? (
            <p
              id={errorId}
              className="text-secondary text-[color:var(--color-figma-text-error)]"
              role="status"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-figma-border)] px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={onOpenFullEditor}
          className="min-w-0 text-secondary text-[color:var(--color-figma-text-tertiary)] transition-colors hover:text-[color:var(--color-figma-text-accent)] hover:underline"
        >
          Open details
        </button>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (commitSave()) onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
