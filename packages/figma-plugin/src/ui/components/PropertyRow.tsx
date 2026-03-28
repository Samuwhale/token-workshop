import { useState, useRef, useLayoutEffect } from 'react';
import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import { isDimensionLike } from './generators/generatorShared';
import { nodeParentPath } from './tokenListUtils';
import { getErrorMessage } from '../shared/utils';
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
  onNavigateToToken,
  newTokenName,
  onNewTokenNameChange,
}: PropertyRowProps) {
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [bindQuery, setBindQuery] = useState('');
  const [bindSelectedIndex, setBindSelectedIndex] = useState(-1);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const binding = getBindingForProperty(rootNodes, prop);
  const value = getCurrentValue(rootNodes, prop);

  const isBound = binding && binding !== 'mixed';
  const isMixed = binding === 'mixed';
  const isUnbound = !binding || isMixed;
  const isThisPropActive = creatingFromProp === prop || bindingFromProp === prop;
  const hasExtractableValue = value !== undefined && value !== null && connected && isUnbound && activeSet && !isThisPropActive;
  const canBind = !isBound && !isMixed && connected && hasAnyTokens && !isThisPropActive;
  const canChangeBind = isBound && connected && hasAnyTokens && !isThisPropActive;

  // Resolve binding display
  const { resolvedDisplay, resolvedColor } = isBound
    ? resolveBindingDisplay(binding as string, tokenMap)
    : { resolvedDisplay: null, resolvedColor: null };

  const swatchColor = resolvedColor ?? ((prop === 'fill' || prop === 'stroke') && typeof value === 'string' && value.startsWith('#') ? value : null);

  // Bind candidates
  const compatibleTypesForBind = bindingFromProp === prop ? getCompatibleTokenTypes(prop) : [];
  const bindCandidatesAll = bindingFromProp === prop
    ? Object.entries(tokenMap)
        .filter(([, entry]) => compatibleTypesForBind.includes(entry.$type))
        .filter(([, entry]) => entry.$lifecycle !== 'deprecated')
        .filter(([path]) => !bindQuery || path.toLowerCase().includes(bindQuery.toLowerCase()))
    : [];
  const bindCandidates = bindCandidatesAll.slice(0, 12);
  const bindTotalCount = bindCandidatesAll.length;
  const bindHasMore = bindTotalCount > 12;

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
      return;
    }
    const currentValue = getCurrentValue(selectedNodes, prop);
    const tokenType = getTokenTypeForProperty(prop);
    const tokenValue = getTokenValueFromProp(prop, currentValue);
    const tokenPath = newTokenName.trim();
    const encodedTokenPath = tokenPath.split('.').map(encodeURIComponent).join('/');

    setCreating(true);
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${encodedTokenPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $type: tokenType, $value: tokenValue }),
      });
      if (res.ok) {
        onTokenCreated(tokenPath, prop, tokenType, tokenValue);
        setCreateError('');
      } else {
        let detail = `Server error (${res.status})`;
        try {
          const body = await res.json();
          if (body.error) detail = body.error;
        } catch { /* use default detail */ }
        setCreateError(detail);
      }
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Network request failed'));
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
              <span className="text-[10px] text-[var(--color-figma-warning,#f5a623)] italic">Mixed</span>
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
              <span className="text-[9px] text-[var(--color-figma-accent)] font-mono truncate" title={binding as string}>
                {binding as string}
              </span>
            </div>
          )}
        </div>

        {/* Actions — post-bind flash or faint buttons */}
        {lastBoundProp === prop ? (
          <div className="flex items-center gap-1 shrink-0 text-[9px] text-[var(--color-figma-success,#18a058)]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Bound
          </div>
        ) : (
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
          {canBind && (
            <button
              onClick={() => onOpenBind(prop)}
              title="Bind existing token"
              aria-label="Bind existing token"
              className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
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
        )}
      </div>

      {/* Inline: bind existing token */}
      {bindingFromProp === prop && (
        <div className="mx-2 mb-1.5 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-bg)] overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-accent)]/5">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] shrink-0" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            <span className="text-[9px] text-[var(--color-figma-accent)] font-medium flex-1">
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
              <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate flex-1" title={binding as string}>{binding as string}</span>
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
              onChange={e => { setBindQuery(e.target.value); setBindSelectedIndex(-1); }}
              onKeyDown={e => {
                if (e.key === 'Escape') { onCancelBind(); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setBindSelectedIndex(i => Math.min(i + 1, bindCandidates.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setBindSelectedIndex(i => Math.max(i - 1, 0)); return; }
                if (e.key === 'Enter' && bindCandidates.length > 0) {
                  const target = bindSelectedIndex >= 0 ? bindCandidates[bindSelectedIndex] : bindCandidates[0];
                  if (target) onBindToken(prop, target[0]);
                }
              }}
              placeholder={`Search ${compatibleTypesForBind.join(' / ')} tokens…`}
              className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)]"
            />
            {bindCandidates.length === 0 ? (
              <div className="text-[9px] text-[var(--color-figma-text-secondary)] py-1 text-center">
                {bindQuery ? 'No matching tokens' : `No ${compatibleTypesForBind.join(' or ')} tokens in set`}
              </div>
            ) : (
              <div className="max-h-[156px] overflow-y-auto flex flex-col gap-px">
                {bindCandidates.map(([path, entry], idx) => {
                  let resolvedColorSwatch: string | null = null;
                  let resolvedValueDisplay: string | null = null;
                  const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
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
                      onClick={() => onBindToken(prop, path)}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors group/item ${isSelected ? 'bg-[var(--color-figma-accent)]/15' : 'hover:bg-[var(--color-figma-accent)]/10'} ${isCurrent ? 'opacity-50' : ''}`}
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
                      <span className={`text-[9px] font-mono truncate flex-1 ${isSelected ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)] group-hover/item:text-[var(--color-figma-accent)]'}`}>
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
                  );
                })}
                {bindHasMore && (
                  <div className="text-[9px] text-[var(--color-figma-text-secondary)] text-center py-1 border-t border-[var(--color-figma-border)]">
                    {bindTotalCount - 12} more — type to refine
                  </div>
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
            <span className="text-[9px] text-[var(--color-figma-text)] font-medium flex-1">
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
              <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Value:</span>
              {(prop === 'fill' || prop === 'stroke') &&
               typeof getCurrentValue(rootNodes, prop) === 'string' &&
               getCurrentValue(rootNodes, prop).startsWith('#') && (
                <div
                  className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                  style={{ backgroundColor: getCurrentValue(rootNodes, prop) }}
                />
              )}
              <span className="text-[9px] text-[var(--color-figma-text)] font-mono truncate">
                {formatTokenValuePreview(prop, getCurrentValue(rootNodes, prop))}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] text-[var(--color-figma-text-secondary)]">Token path (set: {activeSet})</label>
              <input
                ref={nameInputRef}
                value={newTokenName}
                onChange={e => { onNewTokenNameChange(e.target.value); setCreateError(''); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateToken();
                  if (e.key === 'Escape') onCancelCreate();
                }}
                placeholder="group.token-name"
                className={`w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] ${createError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              />
              {createError && <div className="text-[9px] text-[var(--color-figma-error)]">{createError}</div>}
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
