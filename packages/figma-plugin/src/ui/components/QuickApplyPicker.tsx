import { useState, useEffect, useRef, useMemo } from 'react';
import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS, PROPERTY_GROUPS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import { isDimensionLike } from './generators/generatorShared';
import {
  getMergedCapabilities,
  shouldShowGroup,
  getBindingForProperty,
  getCurrentValue,
  getCompatibleTokenTypes,
  getTokenTypeForProperty,
  isTokenScopeCompatible,
  scoreBindCandidate,
  collectSiblingBindings,
  collectBoundPrefixes,
  classifyBindScore,
  CONFIDENCE_LABELS,
  type SuggestionConfidence,
} from './selectionInspectorUtils';
import { swatchBgColor } from '../shared/colorUtils';
import { getRecentTokenPaths, addRecentToken } from '../shared/recentTokens';

// ---------------------------------------------------------------------------
// Fuzzy match (same algorithm as CommandPalette)
// ---------------------------------------------------------------------------

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 2 : 1;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickApplyPickerProps {
  selectedNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  currentCollectionId: string;
  onApply: (tokenPath: string, tokenType: string, targetProperty: BindableProperty, resolvedValue: any) => void;
  onUnbind: (targetProperty: BindableProperty) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all eligible (visible, capability-matching) properties for the selection. */
function getEligibleProperties(nodes: SelectionNodeInfo[]): BindableProperty[] {
  const caps = getMergedCapabilities(nodes);
  const props: BindableProperty[] = [];
  for (const group of PROPERTY_GROUPS) {
    if (!shouldShowGroup(group.condition, caps)) continue;
    for (const prop of group.properties) {
      props.push(prop);
    }
  }
  return props;
}

/** Pick the best initial property tab — prefer unbound properties with a current value. */
function inferPrimaryProperty(
  props: BindableProperty[],
  nodes: SelectionNodeInfo[],
): BindableProperty | null {
  // First pass: unbound with a current value (most likely what the user wants to bind)
  for (const prop of props) {
    const binding = getBindingForProperty(nodes, prop);
    if (!binding) {
      const val = getCurrentValue(nodes, prop);
      if (val !== undefined && val !== null) return prop;
    }
  }
  // Second pass: any unbound property
  for (const prop of props) {
    const binding = getBindingForProperty(nodes, prop);
    if (!binding) return prop;
  }
  // Fallback: first property (allows rebinding)
  return props[0] ?? null;
}

const MAX_CANDIDATES = 15;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickApplyPicker({ selectedNodes, tokenMap, currentCollectionId, onApply, onUnbind, onClose }: QuickApplyPickerProps) {
  const rootNodes = useMemo(() => selectedNodes.filter(n => n.depth === 0), [selectedNodes]);
  const eligibleProps = useMemo(() => getEligibleProperties(rootNodes), [rootNodes]);
  const [activeProp, setActiveProp] = useState<BindableProperty>(() => inferPrimaryProperty(eligibleProps, rootNodes) ?? 'fill');
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setActiveIdx(0); }, [query, activeProp]);

  // Build scored candidates for the active property
  const currentBindingForProp = getBindingForProperty(rootNodes, activeProp);
  const { candidates, totalCount } = useMemo(() => {
    const compatTypes = getCompatibleTokenTypes(activeProp);
    const currentPropValue = getCurrentValue(rootNodes, activeProp);
    const siblingBindings = collectSiblingBindings(rootNodes, activeProp);
    const nodeBoundPrefixes = collectBoundPrefixes(rootNodes);

    const all = Object.entries(tokenMap)
      .filter(([, entry]) => compatTypes.includes(entry.$type))
      .filter(([, entry]) => isTokenScopeCompatible(entry, activeProp))
      .map(([path, entry]) => {
        const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
        const score = scoreBindCandidate(path, entry, activeProp, currentPropValue, r.value, siblingBindings, nodeBoundPrefixes);
        const { confidence, reason } = classifyBindScore(score, path, siblingBindings, currentBindingForProp);
        return { path, entry, score, resolved: r.value, confidence, reason };
      });

    // Apply fuzzy filter if query present
    const filtered = query
      ? all
          .map(c => ({ ...c, fuzzy: fuzzyScore(query, c.path) }))
          .filter(c => c.fuzzy > 0)
          .sort((a, b) => b.fuzzy - a.fuzzy || b.score - a.score)
      : all.sort((a, b) => b.score - a.score);

    return { candidates: filtered.slice(0, MAX_CANDIDATES), totalCount: filtered.length };
  }, [tokenMap, activeProp, rootNodes, query, currentBindingForProp]);

  // Recently-used tokens: filter global recents to those present in the current candidate list
  const { recentCandidates, mainCandidates } = useMemo(() => {
    if (query) return { recentCandidates: [], mainCandidates: candidates };
    const recentPaths = getRecentTokenPaths({ collectionId: currentCollectionId });
    const candidateByPath = new Map(candidates.map(c => [c.path, c]));
    const recent = recentPaths
      .map(p => candidateByPath.get(p))
      .filter((c): c is typeof candidates[0] => c !== undefined)
      .slice(0, 5);
    const recentSet = new Set(recent.map(c => c.path));
    const main = candidates.filter(c => !recentSet.has(c.path));
    return { recentCandidates: recent, mainCandidates: main };
  }, [candidates, currentCollectionId, query]);

  // No longer using simple suggested/all divider — confidence groups handle this

  // Current binding for this property
  const currentBinding = getBindingForProperty(rootNodes, activeProp);

  const handleSelect = (candidate: typeof candidates[0]) => {
    addRecentToken(candidate.path, currentCollectionId);
    onApply(candidate.path, candidate.entry.$type, activeProp, candidate.resolved);
  };

  const handleUnbind = () => {
    onUnbind(activeProp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    // Backspace/Delete with empty query unbinds the current binding
    if ((e.key === 'Backspace' || e.key === 'Delete') && query === '' && currentBinding && currentBinding !== 'mixed') {
      e.preventDefault();
      handleUnbind();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const idx = eligibleProps.indexOf(activeProp);
      const next = e.shiftKey
        ? eligibleProps[(idx - 1 + eligibleProps.length) % eligibleProps.length]
        : eligibleProps[(idx + 1) % eligibleProps.length];
      setActiveProp(next);
      return;
    }
    const allVisible = [...recentCandidates, ...mainCandidates];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, allVisible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = allVisible[activeIdx];
      if (target) handleSelect(target);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = list.querySelectorAll('[data-qa-item]');
    const active = items[activeIdx] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Layer name summary
  const layerSummary = rootNodes.length === 1
    ? rootNodes[0].name
    : `${rootNodes.length} layers`;

  return (
    <div
      className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-start justify-center z-50 pt-12"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-2xl w-full mx-3 flex flex-col"
        style={{ maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Apply token"
      >
        {/* Header: layer name + property tabs */}
        <div className="px-3 pt-2.5 pb-0 border-b border-[var(--color-figma-border)]">
          <div className="flex items-center gap-1.5 mb-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] shrink-0" aria-hidden="true">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="text-body font-medium text-[var(--color-figma-text)] truncate" title={layerSummary}>
              Apply — {layerSummary}
            </span>
            <kbd className="ml-auto text-secondary text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 shrink-0">
              ESC
            </kbd>
          </div>
          {/* Property tab pills */}
          <div className="flex gap-0.5 overflow-x-auto">
            {eligibleProps.map(prop => {
              const isActive = prop === activeProp;
              const binding = getBindingForProperty(rootNodes, prop);
              const isBound = binding && binding !== 'mixed';
              return (
                <button
                  key={prop}
                  onClick={() => setActiveProp(prop)}
                  className={`px-2 py-1 text-secondary font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 font-semibold'
                      : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {PROPERTY_LABELS[prop]}
                  {isBound && (
                    <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] align-middle" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)]">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-secondary)] shrink-0">
            <circle cx="6" cy="6" r="4" />
            <path d="M9 9l3 3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Search ${getTokenTypeForProperty(activeProp)} tokens…`}
            aria-label={`Search tokens for ${PROPERTY_LABELS[activeProp]}`}
            aria-autocomplete="list"
            className="flex-1 bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] text-body text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          {currentBinding && currentBinding !== 'mixed' && (
            <span className="text-secondary text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 rounded px-1.5 py-0.5 shrink-0 font-mono truncate max-w-[120px]" title={currentBinding}>
              {currentBinding}
            </span>
          )}
          {currentBinding && (
            <button
              onClick={handleUnbind}
              title={`Unbind ${PROPERTY_LABELS[activeProp]} (Backspace)`}
              className="shrink-0 flex items-center gap-0.5 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 rounded px-1.5 py-0.5 transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Unbind
            </button>
          )}
        </div>

        {/* Token candidates */}
        <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Token candidates">
          {candidates.length === 0 ? (
            <div className="px-3 py-6 text-center text-body text-[var(--color-figma-text-secondary)]">
              {query ? `No tokens matching "${query}"` : `No ${getTokenTypeForProperty(activeProp)} tokens available`}
            </div>
          ) : (
            <>
              {/* Recently used section */}
              {recentCandidates.length > 0 && (
                <>
                  <div className="text-secondary text-[var(--color-figma-text-secondary)] font-medium px-3 pt-1.5 pb-0.5 flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                    Recent
                  </div>
                  {recentCandidates.map((c, idx) => {
                    const isSelected = idx === activeIdx;
                    const isCurrent = currentBinding === c.path;
                    let colorSwatch: string | null = null;
                    let valueDisplay: string | null = null;
                    if (c.entry.$type === 'color' && typeof c.resolved === 'string' && c.resolved.startsWith('#')) {
                      colorSwatch = c.resolved;
                    } else if ((c.entry.$type === 'dimension' || c.entry.$type === 'number') && c.resolved != null) {
                      valueDisplay = isDimensionLike(c.resolved) ? `${c.resolved.value}${c.resolved.unit}` : String(c.resolved);
                    }
                    return (
                      <button
                        key={c.path}
                        data-qa-item
                        role="option"
                        aria-selected={isSelected}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                          isSelected
                            ? 'bg-[var(--color-figma-accent)] text-white'
                            : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                        } ${isCurrent ? 'opacity-50' : ''}`}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => handleSelect(c)}
                      >
                        {colorSwatch ? (
                          <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: swatchBgColor(colorSwatch) }} />
                        ) : (
                          <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/40' : 'bg-[var(--color-figma-text-secondary)]/30'}`} />
                          </div>
                        )}
                        <span className={`text-body font-mono truncate flex-1 ${isSelected ? 'text-white' : ''}`}>{c.path}</span>
                        {isCurrent && (
                          <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${isSelected ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>current</span>
                        )}
                        {valueDisplay && !isCurrent && (
                          <span className={`text-secondary shrink-0 font-mono ${isSelected ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`}>{valueDisplay}</span>
                        )}
                        <span className={`text-secondary shrink-0 ${isSelected ? 'text-white/60' : 'text-[var(--color-figma-text-secondary)]'}`}>{c.entry.$type}</span>
                      </button>
                    );
                  })}
                  {/* Separator between recent and main — group header will follow */}
                </>
              )}

              {/* Main candidates — grouped by confidence */}
              {(() => {
                let lastConfidence: SuggestionConfidence | null = null;
                return mainCandidates.map((c, idx) => {
                  const globalIdx = recentCandidates.length + idx;
                  const isSelected = globalIdx === activeIdx;
                  const isCurrent = currentBinding === c.path;

                  let colorSwatch: string | null = null;
                  let valueDisplay: string | null = null;
                  if (c.entry.$type === 'color' && typeof c.resolved === 'string' && c.resolved.startsWith('#')) {
                    colorSwatch = c.resolved;
                  } else if ((c.entry.$type === 'dimension' || c.entry.$type === 'number') && c.resolved != null) {
                    valueDisplay = isDimensionLike(c.resolved) ? `${c.resolved.value}${c.resolved.unit}` : String(c.resolved);
                  }

                  const showGroupHeader = !query && c.confidence !== lastConfidence;
                  const isFirstGroup = lastConfidence === null && recentCandidates.length === 0;
                  if (c.confidence !== lastConfidence) lastConfidence = c.confidence;

                  return (
                    <div key={c.path}>
                      {showGroupHeader && (
                        <div className={`text-secondary font-medium px-3 pt-1.5 pb-0.5 ${
                          !isFirstGroup ? 'border-t border-[var(--color-figma-border)]/50 mt-0.5' : ''
                        } ${
                          c.confidence === 'strong' ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)]'
                        }`}>
                          {CONFIDENCE_LABELS[c.confidence]}
                        </div>
                      )}
                      <button
                        data-qa-item
                        role="option"
                        aria-selected={isSelected}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                          isSelected
                            ? 'bg-[var(--color-figma-accent)] text-white'
                            : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                        } ${isCurrent ? 'opacity-50' : ''}`}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        onClick={() => handleSelect(c)}
                      >
                        {colorSwatch ? (
                          <div
                            className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0"
                            style={{ backgroundColor: swatchBgColor(colorSwatch) }}
                          />
                        ) : (
                          <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/40' : 'bg-[var(--color-figma-text-secondary)]/30'}`} />
                          </div>
                        )}
                        <span className={`text-body font-mono truncate flex-1 ${isSelected ? 'text-white' : ''}`}>{c.path}</span>
                        {isCurrent && (
                          <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${isSelected ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                            current
                          </span>
                        )}
                        {!isCurrent && !query && c.confidence !== 'weak' && (
                          <span className={`text-[8px] shrink-0 ${isSelected ? 'text-white/50' : 'text-[var(--color-figma-text-secondary)]'}`}>
                            {c.reason}
                          </span>
                        )}
                        {valueDisplay && !isCurrent && (
                          <span className={`text-secondary shrink-0 font-mono ${isSelected ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`}>
                            {valueDisplay}
                          </span>
                        )}
                        <span className={`text-secondary shrink-0 ${isSelected ? 'text-white/60' : 'text-[var(--color-figma-text-secondary)]'}`}>
                          {c.entry.$type}
                        </span>
                      </button>
                    </div>
                  );
                });
              })()}
              {totalCount > MAX_CANDIDATES && (
                <div className="text-secondary text-[var(--color-figma-text-secondary)] text-center py-1.5 border-t border-[var(--color-figma-border)]">
                  {totalCount - MAX_CANDIDATES} more — type to refine
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] flex gap-3 text-secondary text-[var(--color-figma-text-secondary)]">
          <span>↑↓ navigate</span>
          <span>↵ apply</span>
          <span>Tab switch property</span>
          {currentBinding && <span>⌫ unbind</span>}
          <span>ESC close</span>
        </div>
      </div>
    </div>
  );
}
