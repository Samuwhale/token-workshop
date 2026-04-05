import { useState, useRef, useLayoutEffect } from 'react';
import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import { isDimensionLike } from './generators/generatorShared';
import { nodeParentPath } from './tokenListUtils';
import { getErrorMessage, tokenPathToUrlSegment } from '../shared/utils';
import { getRecentTokens, addRecentToken } from '../shared/recentTokens';
import { apiFetch, ApiError } from '../shared/apiFetch';
import type { UndoSlot } from '../hooks/useUndo';
import {
  getBindingForProperty,
  getCurrentValue,
  formatCurrentValue,
  getTokenTypeForProperty,
  getCompatibleTokenTypes,
  getTokenValueFromProp,
  formatTokenValuePreview,
  resolveBindingDisplay,
  buildRemoveBindingUndo,
  isTokenScopeCompatible,
  getDefaultScopesForProperty,
  scoreBindCandidate,
  collectSiblingBindings,
  collectBoundPrefixes,
  getMixedBindingValues,
  SUGGESTED_NAMES,
  suggestTokenPath,
} from './selectionInspectorUtils';

interface PropertyRowProps {
  prop: BindableProperty;
  rootNodes: SelectionNodeInfo[];
  selectedNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  connected: boolean;
  activeSet: string;
  serverUrl: string;
  hasAnyTokens: boolean;
  creatingFromProp: BindableProperty | null;
  bindingFromProp: BindableProperty | null;
  lastBoundProp: BindableProperty | null;
  onOpenCreate: (prop: BindableProperty) => void;
  onOpenBind: (prop: BindableProperty) => void;
  onCancelCreate: () => void;
  onCancelBind: () => void;
  onBindToken: (prop: BindableProperty, tokenPath: string) => void;
  onTokenCreated: (tokenPath: string, prop: BindableProperty, tokenType: string, tokenValue: any) => void;
  onRemoveBinding: (prop: BindableProperty) => void;
  onDismissBindingError: (prop: BindableProperty) => void;
  /** Inline error message from the plugin sandbox when binding fails */
  bindingError: string | null;
  onNavigateToToken?: (tokenPath: string) => void;
  /** Controlled state for inline create */
  newTokenName: string;
  onNewTokenNameChange: (name: string) => void;
}

export function PropertyRow({
  prop,
  rootNodes,
  selectedNodes,
  tokenMap,
  connected,
  activeSet,
  serverUrl,
  hasAnyTokens,
  creatingFromProp,
  bindingFromProp,
  lastBoundProp,
  onOpenCreate,
  onOpenBind,
  onCancelCreate,
  onCancelBind,
  onBindToken,
  onTokenCreated,
  onRemoveBinding,
  onDismissBindingError,
  bindingError,
  onNavigateToToken,
  newTokenName,
  onNewTokenNameChange,
}: PropertyRowProps) {
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [conflictExists, setConflictExists] = useState(false);
  const [bindQuery, setBindQuery] = useState('');
  const [bindSelectedIndex, setBindSelectedIndex] = useState(-1);
  const [bindShowAll, setBindShowAll] = useState(false);
  const [showMixedDetail, setShowMixedDetail] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const binding = getBindingForProperty(rootNodes, prop);
  const value = getCurrentValue(rootNodes, prop);

  const isBound = binding && binding !== 'mixed';
  const isMixed = binding === 'mixed';
  const isUnbound = !binding || isMixed;
  const isThisPropActive = creatingFromProp === prop || bindingFromProp === prop;
  const hasExtractableValue = value !== undefined && value !== null && connected && isUnbound && activeSet && !isThisPropActive;
  const canBind = !isBound && connected && hasAnyTokens && !isThisPropActive;
  const canChangeBind = isBound && connected && hasAnyTokens && !isThisPropActive;

  // Resolve binding display
  const { resolvedDisplay, resolvedColor } = isBound
    ? resolveBindingDisplay(binding as string, tokenMap)
    : { resolvedDisplay: null, resolvedColor: null };

  const swatchColor = resolvedColor ?? ((prop === 'fill' || prop === 'stroke') && typeof value === 'string' && value.startsWith('#') ? value : null);

  // Bind candidates with contextual scoring
  const compatibleTypesForBind = bindingFromProp === prop ? getCompatibleTokenTypes(prop) : [];
  const currentPropValue = bindingFromProp === prop ? getCurrentValue(rootNodes, prop) : undefined;
  const siblingBindings = bindingFromProp === prop ? collectSiblingBindings(rootNodes, prop) : new Set<string>();
  const nodeBoundPrefixes = bindingFromProp === prop ? collectBoundPrefixes(rootNodes) : new Set<string>();

  const bindCandidatesAll = bindingFromProp === prop
    ? Object.entries(tokenMap)
        .filter(([, entry]) => compatibleTypesForBind.includes(entry.$type))
        .filter(([, entry]) => isTokenScopeCompatible(entry, prop))
        .filter(([path]) => !bindQuery || path.toLowerCase().includes(bindQuery.toLowerCase()))
        .map(([path, entry]) => {
          const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
          const score = scoreBindCandidate(path, entry, prop, currentPropValue, r.value, siblingBindings, nodeBoundPrefixes);
          return [path, entry, score] as [string, TokenMapEntry, number];
        })
        .sort((a, b) => b[2] - a[2])
    : [];
  const BIND_PAGE_SIZE = 12;
  const bindTotalCount = bindCandidatesAll.length;
  const bindHasMore = !bindShowAll && bindTotalCount > BIND_PAGE_SIZE;
  const bindCandidates = bindShowAll ? bindCandidatesAll : bindCandidatesAll.slice(0, BIND_PAGE_SIZE);
  // Recently-used section: filter global recents to compatible tokens visible in the bind panel
  const recentBindCandidates = (bindingFromProp === prop && !bindQuery)
    ? (() => {
        const recentPaths = getRecentTokens();
        const allPaths = new Set(bindCandidatesAll.map(([p]) => p));
        const allByPath = new Map(bindCandidatesAll.map(([p, e, s]) => [p, [p, e, s] as [string, TokenMapEntry, number]]));
        return recentPaths
          .filter(p => allPaths.has(p))
          .slice(0, 5)
          .map(p => allByPath.get(p)!);
      })()
    : [];
  const recentBindPathSet = new Set(recentBindCandidates.map(([p]) => p));
  const mainBindCandidates = bindCandidates.filter(([p]) => !recentBindPathSet.has(p));

  // Determine if we should show a "Suggested" divider — top candidates scored > 0
  const suggestedCount = mainBindCandidates.filter(([, , s]) => s > 0).length;
  const showSuggestedDivider = suggestedCount > 0 && suggestedCount < mainBindCandidates.length && !bindQuery;

  const handleBindToken = (p: string) => {
    addRecentToken(p);
    onBindToken(prop, p);
  };

  // Reset bind query when opening bind panel
  const prevBindingFromProp = useRef<BindableProperty | null>(null);
  if (bindingFromProp === prop && prevBindingFromProp.current !== prop) {
    const currentBinding = getBindingForProperty(rootNodes, prop);
    if (currentBinding && currentBinding !== 'mixed') {
      const leafName = tokenMap[currentBinding]?.$name;
      setBindQuery(leafName ? nodeParentPath(currentBinding, leafName) : '');
    } else {
      setBindQuery('');
    }
    setBindSelectedIndex(-1);
    setBindShowAll(false);
  }
  prevBindingFromProp.current = bindingFromProp;

  useLayoutEffect(() => {
    if (creatingFromProp === prop && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [creatingFromProp, prop]);

  const handleCreateToken = async () => {
    if (creatingFromProp !== prop || !newTokenName.trim() || !connected || !activeSet) return;
    const pathTrimmed = newTokenName.trim();
    if (!/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(pathTrimmed)) {
      setCreateError('Path must be dot-separated segments of letters, numbers, - and _');
      setConflictExists(false);
      return;
    }
    const currentValue = getCurrentValue(selectedNodes, prop);
    const tokenType = getTokenTypeForProperty(prop);
    const tokenValue = getTokenValueFromProp(prop, currentValue);
    const tokenPath = newTokenName.trim();
    const encodedTokenPath = tokenPathToUrlSegment(tokenPath);

    setCreating(true);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${encodedTokenPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: tokenType,
          $value: tokenValue,
          $extensions: { 'com.figma.scopes': getDefaultScopesForProperty(prop) },
        }),
      });
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Token "${tokenPath}" created` } }, '*');
      onTokenCreated(tokenPath, prop, tokenType, tokenValue);
      setCreateError('');
      setConflictExists(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictExists(true);
        setCreateError('');
      } else {
        setConflictExists(false);
        setCreateError(getErrorMessage(err, 'Network request failed'));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleOverwriteToken = async () => {
    if (creatingFromProp !== prop || !newTokenName.trim() || !connected || !activeSet) return;
    const currentValue = getCurrentValue(selectedNodes, prop);
    const tokenType = getTokenTypeForProperty(prop);
    const tokenValue = getTokenValueFromProp(prop, currentValue);
    const tokenPath = newTokenName.trim();
    const encodedTokenPath = tokenPathToUrlSegment(tokenPath);

    setCreating(true);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${encodedTokenPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: tokenType,
          $value: tokenValue,
          $extensions: { 'com.figma.scopes': getDefaultScopesForProperty(prop) },
        }),
      });
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Token "${tokenPath}" overwritten` } }, '*');
      onTokenCreated(tokenPath, prop, tokenType, tokenValue);
      setCreateError('');
      setConflictExists(false);
    } catch (err) {
      setConflictExists(false);
      setCreateError(getErrorMessage(err, 'Failed to overwrite token'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Property row */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded group transition-colors ${
          isBound
            ? 'bg-[var(--color-figma-accent)]/5 hover:bg-[var(--color-figma-accent)]/10'
            : isThisPropActive
            ? 'bg-[var(--color-figma-bg-hover)]'
            : 'hover:bg-[var(--color-figma-bg-hover)]'
        }`}
      >
        {/* Color swatch */}
        {swatchColor ? (
          <div
            className="w-4 h-4 rounded border border-[var(--color-figma-border)] ring-1 ring-white/50 ring-inset shrink-0"
            style={{ backgroundColor: swatchColor }}
          />
        ) : (
          <div className="w-4 h-4 shrink-0" />
        )}

        {/* Property name + value */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-figma-text)] font-medium w-[72px] shrink-0 truncate">
              {PROPERTY_LABELS[prop]}
            </span>
            {isBound ? (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate" title={resolvedDisplay ?? undefined}>
                {resolvedDisplay ?? formatCurrentValue(prop, value)}
              </span>
            ) : isMixed ? (
              <button
                onClick={() => setShowMixedDetail(v => !v)}
                title="Click to see distinct bindings across selected layers"
                className="flex items-center gap-0.5 text-[10px] text-[var(--color-figma-warning,#f5a623)] italic hover:underline"
              >
                Mixed
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className={`shrink-0 transition-transform ${showMixedDetail ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
              </button>
            ) : (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
                {formatCurrentValue(prop, value)}
              </span>
            )}
          </div>
          {isBound && (
            <div className="flex items-center gap-1 mt-0.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
              <span className="text-[10px] text-[var(--color-figma-accent)] font-mono truncate" title={binding as string}>
                {binding as string}
              </span>
            </div>
          )}
        </div>

        {/* Actions — post-bind flash, always-visible bind chip, or hover-only controls */}
        {lastBoundProp === prop ? (
          <div className="flex items-center gap-1 shrink-0 text-[10px] text-[var(--color-figma-success,#18a058)]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Bound
          </div>
        ) : (
        <>
          {/* Always-visible search-to-bind chip for unbound properties */}
          {canBind && (
            <button
              onClick={() => onOpenBind(prop)}
              title={`Search for a token to bind to ${PROPERTY_LABELS[prop]}`}
              aria-label={`Search for token to bind to ${PROPERTY_LABELS[prop]}`}
              className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/5 transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              bind
            </button>
          )}
          {/* Hover-only controls: navigate, remove, remap, create */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            {isBound && onNavigateToToken && (
              <button
                onClick={() => onNavigateToToken(binding as string)}
                title="Go to token"
                aria-label="Go to token"
                className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {isBound && (
              <button
                onClick={() => onRemoveBinding(prop)}
                title="Remove binding"
                aria-label="Remove binding"
                className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            {canChangeBind && (
              <button
                onClick={() => onOpenBind(prop)}
                title="Remap to another token"
                aria-label="Remap to another token"
                className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            {hasExtractableValue && (
              <button
                onClick={() => onOpenCreate(prop)}
                title="Create token from this value"
                aria-label="Create token from this value"
                className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
          </div>
        </>
        )}
      </div>

      {/* Mixed binding detail */}
      {isMixed && showMixedDetail && (() => {
        const mixedValues = getMixedBindingValues(rootNodes, prop);
        return (
          <div className="mx-2 mb-1 rounded border border-[var(--color-figma-warning,#f5a623)]/30 bg-[var(--color-figma-bg)] overflow-hidden">
            <div className="px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-warning,#f5a623)]/5">
              <span className="text-[9px] text-[var(--color-figma-warning,#f5a623)] font-medium">
                Distinct bindings across {rootNodes.length} layers
              </span>
            </div>
            <div className="flex flex-col divide-y divide-[var(--color-figma-border)]/30">
              {mixedValues.map(({ binding: b, count }) => {
                const display = b ? resolveBindingDisplay(b, tokenMap) : null;
                const swatchC = display?.resolvedColor ?? null;
                return (
                  <div key={b ?? '__unbound__'} className="flex items-center gap-1.5 px-2 py-1">
                    {swatchC ? (
                      <div
                        className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                        style={{ backgroundColor: swatchC }}
                      />
                    ) : (
                      <div className="w-3 h-3 shrink-0" />
                    )}
                    <span className={`text-[10px] font-mono truncate flex-1 ${b ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)] italic'}`}>
                      {b ?? 'unbound'}
                    </span>
                    <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">
                      {count} {count === 1 ? 'layer' : 'layers'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Binding error feedback */}
      {bindingError && (
        <div className="mx-2 mb-1 flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-error,#f56565)]/10 border border-[var(--color-figma-error,#f56565)]/20" role="alert">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px text-[var(--color-figma-error,#f56565)]" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
          <span className="text-[10px] text-[var(--color-figma-error,#f56565)] flex-1 leading-snug">{bindingError}</span>
          <button
            onClick={() => onDismissBindingError(prop)}
            className="p-0.5 rounded text-[var(--color-figma-error,#f56565)] hover:bg-[var(--color-figma-error,#f56565)]/20 transition-colors shrink-0"
            title="Dismiss"
            aria-label="Dismiss error"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Inline: bind existing token */}
      {bindingFromProp === prop && (
        <div className="mx-2 mb-1.5 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-bg)] overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-accent)]/5">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] shrink-0" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            <span className="text-[10px] text-[var(--color-figma-accent)] font-medium flex-1">
              {isBound ? `Remap ${PROPERTY_LABELS[prop]}` : `Bind ${PROPERTY_LABELS[prop]}`}
            </span>
            <button
              onClick={onCancelBind}
              className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title="Cancel"
              aria-label="Cancel"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {isBound && binding && binding !== 'mixed' && (
            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-bg-secondary)]">
              {swatchColor && (
                <div className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: swatchColor }} />
              )}
              <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1" title={binding as string}>{binding as string}</span>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] shrink-0" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span className="text-[8px] text-[var(--color-figma-text-secondary)] italic shrink-0">pick replacement</span>
            </div>
          )}
          <div className="px-2 py-1.5 flex flex-col gap-1">
            <input
              autoFocus
              value={bindQuery}
              onChange={e => { setBindQuery(e.target.value); setBindSelectedIndex(-1); setBindShowAll(false); }}
              onKeyDown={e => {
                if (e.key === 'Escape') { onCancelBind(); return; }
                const allVisible = [...recentBindCandidates, ...mainBindCandidates];
                if (e.key === 'ArrowDown') { e.preventDefault(); setBindSelectedIndex(i => Math.min(i + 1, allVisible.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setBindSelectedIndex(i => Math.max(i - 1, 0)); return; }
                if (e.key === 'Enter' && allVisible.length > 0) {
                  const target = bindSelectedIndex >= 0 ? allVisible[bindSelectedIndex] : allVisible[0];
                  if (target) handleBindToken(target[0]);
                }
              }}
              placeholder={`Search ${compatibleTypesForBind.join(' / ')} tokens…`}
              aria-autocomplete="list"
              aria-label="Search token candidates"
              className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
            />
            {bindCandidates.length === 0 && recentBindCandidates.length === 0 ? (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-1 text-center">
                {bindQuery ? 'No matching tokens' : `No ${compatibleTypesForBind.join(' or ')} tokens in set`}
              </div>
            ) : (
              <div role="listbox" aria-label="Token candidates" className="max-h-[156px] overflow-y-auto flex flex-col gap-px">
                {/* Recently used section */}
                {recentBindCandidates.length > 0 && (
                  <>
                    <div className="text-[8px] text-[var(--color-figma-text-secondary)] font-medium px-1.5 pt-0.5 pb-0.5 flex items-center gap-1">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                      </svg>
                      Recently used
                    </div>
                    {recentBindCandidates.map(([path, entry], idx) => {
                      const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
                      let resolvedColorSwatch: string | null = null;
                      let resolvedValueDisplay: string | null = null;
                      if (entry.$type === 'color') {
                        if (typeof r.value === 'string' && r.value.startsWith('#')) resolvedColorSwatch = r.value;
                      } else if ((entry.$type === 'dimension' || entry.$type === 'number') && r.value != null) {
                        resolvedValueDisplay = isDimensionLike(r.value) ? `${r.value.value}${r.value.unit}` : String(r.value);
                      }
                      const isSelected = idx === bindSelectedIndex;
                      const isCurrent = isBound && path === binding;
                      return (
                        <button
                          key={path}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleBindToken(path)}
                          className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors group/item ${isSelected ? 'bg-[var(--color-figma-accent)]/15' : 'hover:bg-[var(--color-figma-accent)]/10'} ${isCurrent ? 'opacity-50' : ''}`}
                        >
                          {resolvedColorSwatch ? (
                            <div className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: resolvedColorSwatch }} />
                          ) : (
                            <div className="w-3 h-3 shrink-0 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-text-secondary)]/40" />
                            </div>
                          )}
                          <span className={`text-[10px] font-mono truncate flex-1 ${isSelected ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)] group-hover/item:text-[var(--color-figma-accent)]'}`}>{path}</span>
                          {isCurrent && <span className="text-[7px] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] px-1 py-0.5 rounded shrink-0">current</span>}
                          {resolvedValueDisplay && !isCurrent && <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0 font-mono">{resolvedValueDisplay}</span>}
                          <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">{entry.$type}</span>
                        </button>
                      );
                    })}
                    {mainBindCandidates.length > 0 && (
                      <div className="text-[8px] text-[var(--color-figma-text-secondary)] px-1.5 pt-1 pb-0.5 border-t border-[var(--color-figma-border)]/50 mt-0.5">
                        {showSuggestedDivider ? 'Suggested' : 'All tokens'}
                      </div>
                    )}
                  </>
                )}

                {/* Main candidates */}
                {mainBindCandidates.map(([path, entry, score], idx) => {
                  const globalIdx = recentBindCandidates.length + idx;
                  let resolvedColorSwatch: string | null = null;
                  let resolvedValueDisplay: string | null = null;
                  const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
                  if (entry.$type === 'color') {
                    if (typeof r.value === 'string' && r.value.startsWith('#')) resolvedColorSwatch = r.value;
                  } else if ((entry.$type === 'dimension' || entry.$type === 'number') && r.value != null) {
                    resolvedValueDisplay = isDimensionLike(r.value) ? `${r.value.value}${r.value.unit}` : String(r.value);
                  }
                  const isSelected = globalIdx === bindSelectedIndex;
                  const isCurrent = isBound && path === binding;
                  const showSuggestedHeader = showSuggestedDivider && idx === 0 && recentBindCandidates.length === 0;
                  const showOthersHeader = showSuggestedDivider && score === 0 && (idx === 0 || mainBindCandidates[idx - 1][2] > 0);
                  return (
                    <div key={path}>
                      {showSuggestedHeader && (
                        <div className="text-[8px] text-[var(--color-figma-accent)] font-medium px-1.5 pt-0.5 pb-0.5 flex items-center gap-1">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z" />
                          </svg>
                          Suggested
                        </div>
                      )}
                      {showOthersHeader && (
                        <div className="text-[8px] text-[var(--color-figma-text-secondary)] px-1.5 pt-1 pb-0.5 border-t border-[var(--color-figma-border)]/50 mt-0.5">
                          All tokens
                        </div>
                      )}
                      <button
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleBindToken(path)}
                        className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors group/item ${isSelected ? 'bg-[var(--color-figma-accent)]/15' : 'hover:bg-[var(--color-figma-accent)]/10'} ${isCurrent ? 'opacity-50' : ''}`}
                      >
                        {resolvedColorSwatch ? (
                          <div
                            className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                            style={{ backgroundColor: resolvedColorSwatch }}
                          />
                        ) : (
                          <div className="w-3 h-3 shrink-0 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-text-secondary)]/40" />
                          </div>
                        )}
                        <span className={`text-[10px] font-mono truncate flex-1 ${isSelected ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)] group-hover/item:text-[var(--color-figma-accent)]'}`}>
                          {path}
                        </span>
                        {isCurrent && (
                          <span className="text-[7px] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] px-1 py-0.5 rounded shrink-0">current</span>
                        )}
                        {resolvedValueDisplay && !isCurrent && (
                          <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0 font-mono">
                            {resolvedValueDisplay}
                          </span>
                        )}
                        <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
                          {entry.$type}
                        </span>
                      </button>
                    </div>
                  );
                })}
                {bindHasMore && (
                  <button
                    onClick={() => setBindShowAll(true)}
                    className="w-full text-[10px] text-[var(--color-figma-accent)] text-center py-1 border-t border-[var(--color-figma-border)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                  >
                    Show all {bindTotalCount} tokens
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline: create token from value */}
      {creatingFromProp === prop && (
        <div className="mx-2 mb-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-bg-secondary)]">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] shrink-0" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="text-[10px] text-[var(--color-figma-text)] font-medium flex-1">
              Create token from {PROPERTY_LABELS[prop]}
            </span>
            <button
              onClick={onCancelCreate}
              className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title="Cancel"
              aria-label="Cancel"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-2 py-1.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Value:</span>
              {(prop === 'fill' || prop === 'stroke') &&
               typeof getCurrentValue(rootNodes, prop) === 'string' &&
               getCurrentValue(rootNodes, prop).startsWith('#') && (
                <div
                  className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                  style={{ backgroundColor: getCurrentValue(rootNodes, prop) }}
                />
              )}
              <span className="text-[10px] text-[var(--color-figma-text)] font-mono truncate">
                {formatTokenValuePreview(prop, getCurrentValue(rootNodes, prop))}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Token path (set: {activeSet})</label>
              <input
                ref={nameInputRef}
                value={newTokenName}
                onChange={e => { onNewTokenNameChange(e.target.value); setCreateError(''); setConflictExists(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateToken();
                  if (e.key === 'Escape') onCancelCreate();
                }}
                placeholder="group.token-name"
                className={`w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)] ${createError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              />
              {conflictExists && (
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-[var(--color-figma-text-secondary)]">Token already exists.</span>
                  <button
                    onClick={handleOverwriteToken}
                    disabled={creating}
                    className="text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
                  >
                    Overwrite?
                  </button>
                </div>
              )}
              {!conflictExists && createError && <div className="text-[10px] text-[var(--color-figma-error)]">{createError}</div>}
            </div>
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={onCancelCreate}
                className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateToken}
                disabled={!newTokenName.trim() || creating}
                className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create & bind'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
