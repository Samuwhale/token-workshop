import { useState, useRef, useEffect } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';

interface TokenRefInputProps {
  /** Label shown above the field */
  label: string;
  /** Currently linked token path, or undefined if not linked */
  tokenRef: string | undefined;
  /** The current literal value as a display string (used as secondary hint) */
  valueLabel: string;
  /** Token type to filter autocomplete by ('number', 'color', etc.) */
  filterType?: string;
  allTokensFlat: Record<string, TokenMapEntry> | undefined;
  pathToCollectionId?: Record<string, string>;
  /** Called when user selects a token to link */
  onLink: (tokenPath: string, resolvedValue: unknown) => void;
  /** Called when user removes the token link */
  onUnlink: () => void;
  /** The field UI rendered when NOT linked to a token */
  children: React.ReactNode;
}

/**
 * Wraps a config field row with a "link to token" affordance.
 *
 * When unlinked: renders `children` (the normal field UI) plus a small chain icon
 * button in the label area that opens a token picker dropdown.
 *
 * When linked: shows a token badge (path + resolved value) replacing the field
 * UI, with an unlink button to restore direct editing.
 */
export function TokenRefInput({
  label,
  tokenRef,
  valueLabel,
  filterType,
  allTokensFlat,
  pathToCollectionId,
  onLink,
  onUnlink,
  children,
}: TokenRefInputProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const openPicker = () => {
    setQuery('');
    setShowPicker(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (path: string) => {
    setShowPicker(false);
    if (!allTokensFlat) return;
    const entry = allTokensFlat[path];
    if (!entry) return;
    // Resolve alias chains to get the final value
    let resolvedValue = entry.$value;
    if (isAlias(resolvedValue)) {
      const result = resolveTokenValue(resolvedValue, entry.$type, allTokensFlat);
      if (result.value != null) resolvedValue = result.value;
    }
    onLink(path, resolvedValue);
  };

  // Get the resolved value of the currently linked token for display
  const linkedEntry = tokenRef && allTokensFlat ? allTokensFlat[tokenRef] : undefined;
  const linkedResolvedValue = (() => {
    if (!linkedEntry || !allTokensFlat) return undefined;
    let v = linkedEntry.$value;
    if (isAlias(v)) {
      const result = resolveTokenValue(v, linkedEntry.$type, allTokensFlat);
      if (result.value != null) v = result.value;
    }
    return v;
  })();
  const linkedValueLabel = linkedResolvedValue != null
    ? (typeof linkedResolvedValue === 'object'
        ? JSON.stringify(linkedResolvedValue)
        : String(linkedResolvedValue))
    : valueLabel;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label row with link/unlink button */}
      <div className="flex items-center gap-1.5">
        <label className="flex-1 text-secondary text-[var(--color-figma-text-secondary)]">
          {label}
        </label>
        {allTokensFlat && !tokenRef && (
          <button
            type="button"
            onClick={openPicker}
            title="Link to a token"
            aria-label="Link to a token"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            <span>Link token</span>
          </button>
        )}
      </div>

      {/* Linked state: show token badge instead of field UI */}
      {tokenRef ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)]/40 min-w-0">
          {/* Color swatch if it's a color value */}
          {linkedEntry?.$type === 'color' && typeof linkedResolvedValue === 'string' && (
            <div
              className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: linkedResolvedValue }}
            />
          )}
          <span className="flex-1 text-secondary font-mono text-[var(--color-figma-accent)] truncate" title={tokenRef}>
            {tokenRef}
          </span>
          {linkedValueLabel && (
            <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0 font-mono">
              {linkedValueLabel}
            </span>
          )}
          <button
            type="button"
            onClick={onUnlink}
            title="Unlink token — edit value directly"
            aria-label="Unlink token"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-secondary font-medium text-[var(--color-figma-accent)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              <line x1="4" y1="4" x2="20" y2="20"/>
            </svg>
            <span>Unlink</span>
          </button>
        </div>
      ) : (
        children
      )}

      {/* Token picker dropdown */}
      {showPicker && allTokensFlat && (
        <div ref={wrapperRef} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setShowPicker(false); }}
            placeholder="Search tokens…"
            aria-label="Search tokens to link"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-body font-mono outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
          />
          <AliasAutocomplete
            query={query}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            filterType={filterType}
            onSelect={handleSelect}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
}
