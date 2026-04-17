import { useState, useRef, useLayoutEffect, type ReactNode } from 'react';
import { NoticeInlineAlert } from '../shared/noticeSystem';
import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import { isDimensionLike } from './recipes/recipeShared';
import { nodeParentPath } from './tokenListUtils';
import { getErrorMessage } from '../shared/utils';
import { getRecentTokens, addRecentToken } from '../shared/recentTokens';
import {
  applyTokenMutationSuccess,
  createToken,
  createTokenValueBody,
  isTokenMutationConflictError,
  updateToken,
} from '../shared/tokenMutations';
import {
  getBindingForProperty,
  getCurrentValue,
  formatCurrentValue,
  getTokenTypeForProperty,
  getCompatibleTokenTypes,
  getTokenValueFromProp,
  formatTokenValuePreview,
  resolveBindingDisplay,
  isTokenScopeCompatible,
  getDefaultScopesForProperty,
  scoreBindCandidate,
  collectSiblingBindings,
  collectBoundPrefixes,
  getMixedBindingValues,
} from './selectionInspectorUtils';

interface PropertyRowProps {
  prop: BindableProperty;
  rootNodes: SelectionNodeInfo[];
  selectedNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  connected: boolean;
  currentCollectionId: string;
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
  bindingError: string | null;
  onNavigateToToken?: (tokenPath: string) => void;
  newTokenName: string;
  onNewTokenNameChange: (name: string) => void;
}

const ACTION_BUTTON_BASE_CLASS =
  'inline-flex min-h-[24px] items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]';

const ACTION_BUTTON_TONE_CLASS = {
  default:
    'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-accent)]/10 hover:text-[var(--color-figma-text)]',
  primary:
    'border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20',
  danger:
    'border-[var(--color-figma-error,#f56565)]/25 bg-[var(--color-figma-error,#f56565)]/10 text-[var(--color-figma-error,#f56565)] hover:bg-[var(--color-figma-error,#f56565)]/20',
} as const;

interface PropertyActionButtonProps {
  label: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: keyof typeof ACTION_BUTTON_TONE_CLASS;
}

function PropertyActionButton({
  label,
  title,
  icon,
  onClick,
  tone = 'default',
}: PropertyActionButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`${ACTION_BUTTON_BASE_CLASS} ${ACTION_BUTTON_TONE_CLASS[tone]}`}
    >
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function PropertyRow({
  prop,
  rootNodes,
  selectedNodes,
  tokenMap,
  connected,
  currentCollectionId,
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
  const hasExtractableValue = value !== undefined && value !== null && connected && isUnbound && currentCollectionId && !isThisPropActive;
  const canBind = !isBound && connected && hasAnyTokens && !isThisPropActive;
  const canChangeBind = isBound && connected && hasAnyTokens && !isThisPropActive;
  const rowStateClass = isThisPropActive
    ? 'border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5'
    : isBound
      ? 'border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/5 hover:bg-[var(--color-figma-accent)]/10'
      : 'border-transparent hover:border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]';
  const statusBadgeClass = bindingFromProp === prop
    ? 'bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)]'
    : creatingFromProp === prop
      ? 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]'
      : lastBoundProp === prop
        ? 'bg-[var(--color-figma-success,#18a058)]/12 text-[var(--color-figma-success,#18a058)]'
        : isBound
          ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
          : isMixed
            ? 'bg-[var(--color-figma-warning,#f5a623)]/15 text-[var(--color-figma-warning,#f5a623)]'
            : 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]';
  const statusLabel = bindingFromProp === prop
    ? 'Picking'
    : creatingFromProp === prop
      ? 'Creating'
      : lastBoundProp === prop
        ? 'Bound'
        : isBound
          ? 'Bound'
          : isMixed
            ? 'Mixed'
            : '';
  const showActionRail = canBind || canChangeBind || hasExtractableValue || isBound || isMixed;

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
    if (creatingFromProp !== prop || !newTokenName.trim() || !connected || !currentCollectionId) return;
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

    setCreating(true);
    try {
      await createToken(serverUrl, currentCollectionId, tokenPath, createTokenValueBody({
        type: tokenType,
        value: tokenValue,
        defaultScopes: getDefaultScopesForProperty(prop),
      }));
      await applyTokenMutationSuccess({
        onAfterSave: () => onTokenCreated(tokenPath, prop, tokenType, tokenValue),
        successMessage: `Token "${tokenPath}" created`,
      });
      setCreateError('');
      setConflictExists(false);
    } catch (err) {
      if (isTokenMutationConflictError(err)) {
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
    if (creatingFromProp !== prop || !newTokenName.trim() || !connected || !currentCollectionId) return;
    const currentValue = getCurrentValue(selectedNodes, prop);
    const tokenType = getTokenTypeForProperty(prop);
    const tokenValue = getTokenValueFromProp(prop, currentValue);
    const tokenPath = newTokenName.trim();

    setCreating(true);
    try {
      await updateToken(serverUrl, currentCollectionId, tokenPath, createTokenValueBody({
        type: tokenType,
        value: tokenValue,
        defaultScopes: getDefaultScopesForProperty(prop),
      }));
      await applyTokenMutationSuccess({
        onAfterSave: () => onTokenCreated(tokenPath, prop, tokenType, tokenValue),
        successMessage: `Token "${tokenPath}" overwritten`,
      });
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
        className={`group/proprow rounded-md border px-2 py-1.5 transition-colors ${rowStateClass}`}
      >
        <div className="flex items-start gap-2">
          {/* Color swatch */}
          {swatchColor ? (
            <div
              className="mt-0.5 w-4 h-4 rounded border border-[var(--color-figma-border)] ring-1 ring-white/50 ring-inset shrink-0"
              style={{ backgroundColor: swatchColor }}
            />
          ) : (
            <div className="w-4 h-4 shrink-0" />
          )}

          {/* Property name + value */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--color-figma-text)] font-medium truncate">
                    {PROPERTY_LABELS[prop]}
                  </span>
                </div>
                <div className="mt-0.5 min-w-0">
                  {isBound ? (
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate block" title={resolvedDisplay ?? undefined}>
                      {resolvedDisplay ?? formatCurrentValue(prop, value)}
                    </span>
                  ) : isMixed ? (
                    <span className="text-[10px] text-[var(--color-figma-warning,#f5a623)] block">
                      Different bindings across {rootNodes.length} selected {rootNodes.length === 1 ? 'layer' : 'layers'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate block">
                      {formatCurrentValue(prop, value)}
                    </span>
                  )}
                </div>
              </div>
              {statusLabel && (
                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-medium ${statusBadgeClass}`}>
                  {statusLabel}
                </span>
              )}
            </div>
            {isBound && (
              <div className="flex items-center gap-1 mt-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                {onNavigateToToken ? (
                  <button
                    onClick={() => onNavigateToToken(binding as string)}
                    className="text-[10px] text-[var(--color-figma-accent)] font-mono truncate hover:underline text-left"
                    title={`Go to ${binding as string}`}
                  >
                    {binding as string}
                  </button>
                ) : (
                  <span className="text-[10px] text-[var(--color-figma-accent)] font-mono truncate" title={binding as string}>
                    {binding as string}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {showActionRail && (
          <div className={`mt-2 flex flex-wrap items-center gap-1 pl-6 transition-opacity ${isThisPropActive ? '' : 'opacity-0 group-hover/proprow:opacity-100'}`}>
            {canBind && (
              <PropertyActionButton
                label={isMixed ? 'Bind token' : 'Bind'}
                title={`Search for a token to bind to ${PROPERTY_LABELS[prop]}`}
                tone="primary"
                onClick={() => onOpenBind(prop)}
                icon={
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                }
              />
            )}
            {canChangeBind && (
              <PropertyActionButton
                label="Replace"
                title="Replace with another token"
                tone="primary"
                onClick={() => onOpenBind(prop)}
                icon={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                }
              />
            )}
            {hasExtractableValue && (
              <PropertyActionButton
                label="Create from value"
                title="Create token from this value"
                onClick={() => onOpenCreate(prop)}
                icon={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                }
              />
            )}
            {isBound && (
              <PropertyActionButton
                label="Remove"
                title="Remove binding"
                tone="danger"
                onClick={() => onRemoveBinding(prop)}
                icon={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                }
              />
            )}
            {isMixed && (
              <PropertyActionButton
                label={showMixedDetail ? 'Hide details' : 'Review mixed'}
                title="Show bindings across layers"
                onClick={() => setShowMixedDetail(v => !v)}
                icon={
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="currentColor"
                    className={`transition-transform ${showMixedDetail ? 'rotate-90' : ''}`}
                  >
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                }
              />
            )}
          </div>
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
        <NoticeInlineAlert severity="error" onDismiss={() => onDismissBindingError(prop)} className="mx-2 mb-1">
          {bindingError}
        </NoticeInlineAlert>
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
              {isBound ? 'Remap' : 'Bind'} {PROPERTY_LABELS[prop]}
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
              placeholder="Search tokens\u2026"
              aria-autocomplete="list"
              aria-controls="bind-candidates-listbox"
              aria-activedescendant={bindSelectedIndex >= 0 ? `bind-option-${[...recentBindCandidates, ...mainBindCandidates][bindSelectedIndex]?.[0]}` : undefined}
              aria-label="Search token candidates"
              className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
            />
            {bindCandidates.length === 0 && recentBindCandidates.length === 0 ? (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-1 text-center">
                {bindQuery ? 'No matching tokens' : `No ${compatibleTypesForBind.join(' or ')} tokens in set`}
              </div>
            ) : (
              <div id="bind-candidates-listbox" role="listbox" aria-label="Token candidates" className="max-h-[156px] overflow-y-auto flex flex-col gap-px">
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
                          id={`bind-option-${path}`}
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
                        id={`bind-option-${path}`}
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
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Token path (set: {currentCollectionId})</label>
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
