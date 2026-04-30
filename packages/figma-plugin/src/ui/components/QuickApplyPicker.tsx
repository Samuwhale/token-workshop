import { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, Search, X, Zap } from 'lucide-react';
import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS, PROPERTY_GROUPS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
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
import { useFocusTrap } from '../hooks/useFocusTrap';
import { fuzzyScore } from '../shared/fuzzyMatch';

function isDimensionLike(value: unknown): value is { value: number; unit: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "unit" in value &&
    typeof (value as { value?: unknown }).value === "number" &&
    typeof (value as { unit?: unknown }).unit === "string"
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickApplyPickerProps {
  selectedNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  currentCollectionId: string;
  onApply: (
    tokenPath: string,
    tokenType: string,
    targetProperty: BindableProperty,
    resolvedValue: unknown,
  ) => void;
  onUnbind: (targetProperty: BindableProperty) => void;
  onClose: () => void;
}

interface QuickApplyCandidate {
  path: string;
  entry: TokenMapEntry;
  score: number;
  resolved: unknown;
  confidence: SuggestionConfidence;
  reason: string;
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

function getCandidatePresentation(candidate: QuickApplyCandidate): {
  colorSwatch: string | null;
  valueDisplay: string | null;
} {
  if (
    candidate.entry.$type === 'color' &&
    typeof candidate.resolved === 'string' &&
    candidate.resolved.startsWith('#')
  ) {
    return { colorSwatch: candidate.resolved, valueDisplay: null };
  }
  if (
    (candidate.entry.$type === 'dimension' || candidate.entry.$type === 'number') &&
    candidate.resolved != null
  ) {
    const valueDisplay = isDimensionLike(candidate.resolved)
      ? `${candidate.resolved.value}${candidate.resolved.unit}`
      : String(candidate.resolved);
    return { colorSwatch: null, valueDisplay };
  }
  return { colorSwatch: null, valueDisplay: null };
}

function QuickApplyCandidateRow({
  candidate,
  isCurrent,
  isSelected,
  onHover,
  onSelect,
  showReason = false,
}: {
  candidate: QuickApplyCandidate;
  isCurrent: boolean;
  isSelected: boolean;
  onHover: () => void;
  onSelect: () => void;
  showReason?: boolean;
}) {
  const { colorSwatch, valueDisplay } = getCandidatePresentation(candidate);

  return (
    <button
      type="button"
      data-qa-item
      role="option"
      aria-selected={isSelected}
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
        isSelected
          ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]'
          : 'text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
      } ${isCurrent ? 'opacity-50' : ''}`}
      onMouseEnter={onHover}
      onClick={onSelect}
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
      <span className={`text-body font-mono truncate flex-1 ${isSelected ? 'text-white' : ''}`}>
        {candidate.path}
      </span>
      {isCurrent && (
        <span className={`text-[var(--font-size-xs)] px-1 py-0.5 rounded shrink-0 ${isSelected ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
          current
        </span>
      )}
      {!isCurrent && showReason && (
        <span className={`text-[var(--font-size-xs)] shrink-0 ${isSelected ? 'text-white/50' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
          {candidate.reason}
        </span>
      )}
      {valueDisplay && !isCurrent && (
        <span className={`text-secondary shrink-0 font-mono ${isSelected ? 'text-white/70' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
          {valueDisplay}
        </span>
      )}
      <span className={`text-secondary shrink-0 ${isSelected ? 'text-white/60' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
        {candidate.entry.$type}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickApplyPicker({ selectedNodes, tokenMap, currentCollectionId, onApply, onUnbind, onClose }: QuickApplyPickerProps) {
  const rootNodes = useMemo(() => selectedNodes.filter(n => n.depth === 0), [selectedNodes]);
  const eligibleProps = useMemo(() => getEligibleProperties(rootNodes), [rootNodes]);
  const [activeProp, setActiveProp] = useState<BindableProperty>(() => inferPrimaryProperty(eligibleProps, rootNodes) ?? 'fill');
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [ignoreScope, setIgnoreScope] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, { initialFocusRef: inputRef });

  useEffect(() => {
    if (eligibleProps.includes(activeProp)) {
      return;
    }
    const nextProp = inferPrimaryProperty(eligibleProps, rootNodes);
    if (nextProp) {
      setActiveProp(nextProp);
    }
  }, [activeProp, eligibleProps, rootNodes]);

  useEffect(() => {
    setActiveIdx(0);
    setIgnoreScope(false);
  }, [query, activeProp]);

  // Build scored candidates for the active property
  const currentBindingForProp = getBindingForProperty(rootNodes, activeProp);
  const { candidates, totalCount, hiddenByScope } = useMemo(() => {
    const compatTypes = getCompatibleTokenTypes(activeProp);
    const currentPropValue = getCurrentValue(rootNodes, activeProp);
    const siblingBindings = collectSiblingBindings(rootNodes, activeProp);
    const nodeBoundPrefixes = collectBoundPrefixes(rootNodes);

    const typeCompatible = Object.entries(tokenMap)
      .filter(([, entry]) => compatTypes.includes(entry.$type));
    const scopeCompatible = typeCompatible
      .filter(([, entry]) => isTokenScopeCompatible(entry, activeProp));

    const all: QuickApplyCandidate[] = (ignoreScope ? typeCompatible : scopeCompatible)
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
          .filter(c => c.fuzzy >= 0)
          .sort((a, b) => b.fuzzy - a.fuzzy || b.score - a.score)
          .map((candidateWithFuzzy) => ({
            path: candidateWithFuzzy.path,
            entry: candidateWithFuzzy.entry,
            score: candidateWithFuzzy.score,
            resolved: candidateWithFuzzy.resolved,
            confidence: candidateWithFuzzy.confidence,
            reason: candidateWithFuzzy.reason,
          }))
      : all.sort((a, b) => b.score - a.score);

    return {
      candidates: filtered.slice(0, MAX_CANDIDATES),
      totalCount: filtered.length,
      hiddenByScope: Math.max(0, typeCompatible.length - scopeCompatible.length),
    };
  }, [tokenMap, activeProp, rootNodes, query, currentBindingForProp, ignoreScope]);

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

  const visibleCandidates = useMemo(
    () => [...recentCandidates, ...mainCandidates],
    [mainCandidates, recentCandidates],
  );

  useEffect(() => {
    setActiveIdx((idx) => {
      if (visibleCandidates.length === 0) return 0;
      return Math.min(idx, visibleCandidates.length - 1);
    });
  }, [visibleCandidates.length]);

  // Current binding for this property
  const currentBinding = getBindingForProperty(rootNodes, activeProp);
  const hasSingleCurrentBinding = currentBinding !== null && currentBinding !== 'mixed';

  const handleSelect = (candidate: QuickApplyCandidate) => {
    addRecentToken(candidate.path, currentCollectionId);
    onApply(candidate.path, candidate.entry.$type, activeProp, candidate.resolved);
  };

  const handleUnbind = () => {
    onUnbind(activeProp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    // Backspace/Delete with empty query unbinds the current binding
    if ((e.key === 'Backspace' || e.key === 'Delete') && query === '' && hasSingleCurrentBinding) {
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
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => visibleCandidates.length === 0 ? 0 : Math.min(i + 1, visibleCandidates.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = visibleCandidates[activeIdx];
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

  if (rootNodes.length === 0 || eligibleProps.length === 0) {
    return (
      <div
        className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-start justify-center z-50 pt-12"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          className="mx-3 flex w-full max-w-[320px] flex-col rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-dialog)]"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Apply token"
        >
          <div className="border-b border-[var(--color-figma-border)] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-body font-medium text-[color:var(--color-figma-text)]">
                Apply token
              </span>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                aria-label="Close"
              >
                <X size={12} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
          <div className="px-3 py-4 text-center">
            <p className="m-0 text-body font-medium text-[color:var(--color-figma-text)]">
              {rootNodes.length === 0
                ? "Select a layer to apply tokens"
                : "No applicable properties"}
            </p>
            <p className="m-0 mt-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
              {rootNodes.length === 0
                ? "Quick Apply binds tokens to the current Figma selection."
                : "Choose a layer with fill, stroke, text, size, or effect properties."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-start justify-center z-50 pt-12"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="mx-3 flex w-full max-w-[560px] flex-col rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-dialog)]"
        style={{ maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Apply token"
      >
        {/* Header: layer name + property tabs */}
        <div className="px-3 pt-2.5 pb-0 border-b border-[var(--color-figma-border)]">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap
              size={12}
              strokeWidth={2}
              className="shrink-0 text-[color:var(--color-figma-text-accent)]"
              aria-hidden
            />
            <span className="text-body font-medium text-[color:var(--color-figma-text)] truncate" title={layerSummary}>
              Apply token to {layerSummary}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
              aria-label="Close"
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className="mb-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
            Searching <span className="font-mono text-[color:var(--color-figma-text)]">{currentCollectionId}</span>
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
                      ? 'text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10 font-semibold'
                      : 'text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
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
          <Search
            size={12}
            strokeWidth={1.5}
            className="shrink-0 text-[color:var(--color-figma-text-secondary)]"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Search ${getTokenTypeForProperty(activeProp)} tokens…`}
            aria-label={`Search tokens for ${PROPERTY_LABELS[activeProp]}`}
            aria-autocomplete="list"
            className="flex-1 bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] text-body text-[color:var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          {hasSingleCurrentBinding && (
            <span className="text-secondary text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10 rounded px-1.5 py-0.5 shrink-0 font-mono truncate max-w-[120px]" title={currentBinding}>
              {currentBinding}
            </span>
          )}
          {hasSingleCurrentBinding && (
            <button
              onClick={handleUnbind}
              title={`Unbind ${PROPERTY_LABELS[activeProp]}`}
              className="shrink-0 flex items-center gap-0.5 text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/10 rounded px-1.5 py-0.5 transition-colors"
            >
              <X size={8} strokeWidth={2.5} aria-hidden />
              Unbind
            </button>
          )}
        </div>

        {/* Token candidates */}
        <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Token candidates">
          {candidates.length === 0 ? (
            <div className="px-3 py-6 text-center text-body text-[color:var(--color-figma-text-secondary)]">
              {query ? `No tokens matching "${query}"` : `No ${getTokenTypeForProperty(activeProp)} tokens available`}
            </div>
          ) : (
            <>
              {/* Recently used section */}
              {recentCandidates.length > 0 && (
                <>
                  <div className="text-secondary text-[color:var(--color-figma-text-secondary)] font-medium px-3 pt-1.5 pb-0.5 flex items-center gap-1">
                    <Clock size={8} strokeWidth={1.5} aria-hidden />
                    Recent
                  </div>
                  {recentCandidates.map((c, idx) => {
                    const isSelected = idx === activeIdx;
                    const isCurrent = currentBinding === c.path;
                    return (
                      <QuickApplyCandidateRow
                        key={c.path}
                        candidate={c}
                        isCurrent={isCurrent}
                        isSelected={isSelected}
                        onHover={() => setActiveIdx(idx)}
                        onSelect={() => handleSelect(c)}
                      />
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

                  const showGroupHeader = !query && c.confidence !== lastConfidence;
                  const isFirstGroup = lastConfidence === null && recentCandidates.length === 0;
                  if (c.confidence !== lastConfidence) lastConfidence = c.confidence;

                  return (
                    <div key={c.path}>
                      {showGroupHeader && (
                        <div className={`text-secondary font-medium px-3 pt-1.5 pb-0.5 ${
                          !isFirstGroup ? 'border-t border-[var(--color-figma-border)]/50 mt-0.5' : ''
                        } ${
                          c.confidence === 'strong' ? 'text-[color:var(--color-figma-text-accent)]' : 'text-[color:var(--color-figma-text-secondary)]'
                        }`}>
                          {CONFIDENCE_LABELS[c.confidence]}
                        </div>
                      )}
                      <QuickApplyCandidateRow
                        candidate={c}
                        isCurrent={isCurrent}
                        isSelected={isSelected}
                        onHover={() => setActiveIdx(globalIdx)}
                        onSelect={() => handleSelect(c)}
                        showReason={!query && c.confidence !== 'weak'}
                      />
                    </div>
                  );
                });
              })()}
              {totalCount > MAX_CANDIDATES && (
                <div className="text-secondary text-[color:var(--color-figma-text-secondary)] text-center py-1.5 border-t border-[var(--color-figma-border)]">
                  {totalCount - MAX_CANDIDATES} more — type to refine
                </div>
              )}
            </>
          )}
        </div>
        {hiddenByScope > 0 && (
          <div className="border-t border-[var(--color-figma-border)] px-3 py-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
            {ignoreScope ? (
              <>
                Showing compatible and incompatible tokens{" "}
                <button
                  type="button"
                  onClick={() => setIgnoreScope(false)}
                  className="text-[color:var(--color-figma-text-accent)] hover:underline"
                >
                  Hide incompatible
                </button>
              </>
            ) : (
              <>
                {hiddenByScope} incompatible with this selection{" "}
                <button
                  type="button"
                  onClick={() => setIgnoreScope(true)}
                  className="text-[color:var(--color-figma-text-accent)] hover:underline"
                >
                  Show anyway
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
