import { useState, useEffect, useRef, useMemo } from 'react';
import { Clock, X, Zap } from 'lucide-react';
import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS, PROPERTY_GROUPS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import {
  getMergedCapabilities,
  shouldShowGroup,
  getBindingForProperty,
  getBindingCollectionForProperty,
  getCurrentValue,
  getCompatibleTokenTypes,
  getTokenTypeForProperty,
  isTokenScopeCompatible,
  scoreBindCandidate,
  collectSiblingBindings,
  collectBoundPrefixes,
  classifyBindScore,
  groupSuggestionsByConfidence,
  CONFIDENCE_LABELS,
  type SuggestionConfidence,
} from './selectionInspectorUtils';
import { swatchBgColor } from '../shared/colorUtils';
import { getRecentTokenPaths, addRecentToken } from '../shared/recentTokens';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { getCollectionDisplayName } from '../shared/libraryCollections';
import { Button, SearchField } from '../primitives';

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
  tokenMapsByCollection: Record<string, Record<string, TokenMapEntry>>;
  currentCollectionId: string;
  collectionIds: string[];
  collectionDisplayNames?: Record<string, string>;
  onApply: (
    tokenPath: string,
    tokenType: string,
    targetProperty: BindableProperty,
    resolvedValue: unknown,
    collectionId: string,
  ) => void;
  onClose: () => void;
}

interface QuickApplyCandidate {
  path: string;
  collectionId: string;
  collectionLabel: string;
  entry: TokenMapEntry;
  score: number;
  rankScore: number;
  resolved: unknown;
  resolutionError?: string;
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
const RECENT_CANDIDATE_LIMIT = 5;
const EMPTY_TOKEN_MAP: Record<string, TokenMapEntry> = {};
const ALL_COLLECTIONS_ID = "__token-workshop-all-collections__";

function scoreCandidateSearchRank(
  query: string,
  candidate: Pick<QuickApplyCandidate, "path" | "score">,
): number {
  const queryScore = fuzzyScore(query, candidate.path);
  if (queryScore < 0) return -1;
  return queryScore * 100 + candidate.score;
}

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

function buildQuickApplyCandidates({
  activeProp,
  currentBinding,
  query,
  rootNodes,
  tokenMap,
  collectionId,
  collectionLabel,
}: {
  activeProp: BindableProperty;
  currentBinding: string | null | "mixed";
  query: string;
  rootNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  collectionId: string;
  collectionLabel: string;
}): { candidates: QuickApplyCandidate[]; totalCount: number } {
  const compatibleTypes = getCompatibleTokenTypes(activeProp);
  const currentPropValue = getCurrentValue(rootNodes, activeProp);
  const siblingBindings = collectSiblingBindings(rootNodes, activeProp);
  const nodeBoundPrefixes = collectBoundPrefixes(rootNodes);

  const allCandidates = Object.entries(tokenMap)
    .filter(([, entry]) => compatibleTypes.includes(entry.$type))
    .filter(([, entry]) => isTokenScopeCompatible(entry, activeProp))
    .map(([path, entry]) => {
      const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
      const score = scoreBindCandidate(
        path,
        entry,
        activeProp,
        currentPropValue,
        resolved.value,
        siblingBindings,
        nodeBoundPrefixes,
      );
      const { confidence, reason } = classifyBindScore(
        score,
        path,
        siblingBindings,
        currentBinding,
      );

      return {
        path,
        collectionId,
        collectionLabel,
        entry,
        score,
        rankScore: score,
        resolved: resolved.value,
        resolutionError: resolved.error,
        confidence,
        reason,
      };
    });

  const filtered = query
    ? allCandidates
        .map((candidate) => ({
          ...candidate,
          rankScore: scoreCandidateSearchRank(query, candidate),
        }))
        .filter((candidate) => candidate.rankScore >= 0)
        .sort((a, b) => b.rankScore - a.rankScore || b.score - a.score)
    : allCandidates.sort((a, b) => b.rankScore - a.rankScore);

  return {
    candidates: filtered.slice(0, MAX_CANDIDATES),
    totalCount: filtered.length,
  };
}

function splitRecentCandidates({
  activeCollectionId,
  candidates,
  query,
}: {
  activeCollectionId: string;
  candidates: QuickApplyCandidate[];
  query: string;
}): { recentCandidates: QuickApplyCandidate[]; mainCandidates: QuickApplyCandidate[] } {
  if (query || activeCollectionId === ALL_COLLECTIONS_ID) {
    return { recentCandidates: [], mainCandidates: candidates };
  }

  const candidateByPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  const recentCandidates = getRecentTokenPaths({ collectionId: activeCollectionId })
    .map((path) => candidateByPath.get(path))
    .filter((candidate): candidate is QuickApplyCandidate => candidate !== undefined)
    .slice(0, RECENT_CANDIDATE_LIMIT);
  const recentPaths = new Set(recentCandidates.map((candidate) => candidate.path));
  const mainCandidates = candidates.filter((candidate) => !recentPaths.has(candidate.path));

  return { recentCandidates, mainCandidates };
}

function QuickApplyCandidateRow({
  candidate,
  isCurrent,
  isSelected,
  onHover,
  onSelect,
  showReason = false,
  showCollection = false,
}: {
  candidate: QuickApplyCandidate;
  isCurrent: boolean;
  isSelected: boolean;
  onHover: () => void;
  onSelect: () => void;
  showReason?: boolean;
  showCollection?: boolean;
}) {
  const { colorSwatch, valueDisplay } = getCandidatePresentation(candidate);
  const disabled = isCurrent || Boolean(candidate.resolutionError);
  const statusLabel = candidate.resolutionError
    ? "Broken reference"
    : isCurrent
      ? "current"
      : null;

  return (
    <button
      type="button"
      data-qa-item
      role="option"
      tabIndex={-1}
      aria-selected={isSelected}
      aria-disabled={disabled}
      disabled={disabled}
      title={candidate.resolutionError}
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
        isSelected
          ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]'
          : 'text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
      } ${disabled ? 'cursor-default opacity-65' : ''}`}
      onMouseEnter={onHover}
      onClick={disabled ? undefined : onSelect}
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
      {statusLabel && (
        <span className={`text-[var(--font-size-xs)] px-1 py-0.5 rounded shrink-0 ${isSelected ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
          {statusLabel}
        </span>
      )}
      {!disabled && showReason && isSelected && (
        <span className={`text-[var(--font-size-xs)] shrink-0 ${isSelected ? 'text-white/50' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
          {candidate.reason}
        </span>
      )}
      {valueDisplay && !disabled && (
        <span className={`text-secondary shrink-0 font-mono ${isSelected ? 'text-white/70' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
          {valueDisplay}
        </span>
      )}
      {showCollection && (
        <span
          className={`min-w-[72px] max-w-[140px] shrink truncate text-secondary ${isSelected ? 'text-white/70' : 'text-[color:var(--color-figma-text-secondary)]'}`}
          title={candidate.collectionLabel}
        >
          {candidate.collectionLabel}
        </span>
      )}
      <span className={`text-secondary shrink-0 ${isSelected ? 'text-white/60' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
        {candidate.entry.$type}
      </span>
    </button>
  );
}

function QuickApplyEmptyResults({
  activeCollectionLabel,
  activePropLabel,
  canSearchAllCollections,
  query,
  onClearSearch,
  onSearchAllCollections,
}: {
  activeCollectionLabel: string;
  activePropLabel: string;
  canSearchAllCollections: boolean;
  query: string;
  onClearSearch: () => void;
  onSearchAllCollections: () => void;
}) {
  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
      <div>
        <p className="m-0 text-body font-medium text-[color:var(--color-figma-text)]">
          No matching tokens
        </p>
        <p className="m-0 mt-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
          {hasQuery
            ? `No result for "${query.trim()}" in ${activeCollectionLabel}.`
            : `No ${activePropLabel.toLowerCase()} tokens in ${activeCollectionLabel}.`}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {canSearchAllCollections ? (
          <Button
            type="button"
            onClick={onSearchAllCollections}
            variant="secondary"
            size="sm"
          >
            Search all collections
          </Button>
        ) : null}
        {hasQuery ? (
          <Button
            type="button"
            onClick={onClearSearch}
            variant={canSearchAllCollections ? "ghost" : "secondary"}
            size="sm"
          >
            Clear search
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickApplyPicker({
  selectedNodes,
  tokenMapsByCollection,
  currentCollectionId,
  collectionIds,
  collectionDisplayNames,
  onApply,
  onClose,
}: QuickApplyPickerProps) {
  const rootNodes = useMemo(
    () => selectedNodes.filter((node) => (node.depth ?? 0) === 0),
    [selectedNodes],
  );
  const eligibleProps = useMemo(() => getEligibleProperties(rootNodes), [rootNodes]);
  const [activeProp, setActiveProp] = useState<BindableProperty>(() => inferPrimaryProperty(eligibleProps, rootNodes) ?? 'fill');
  const currentBinding = getBindingForProperty(rootNodes, activeProp);
  const currentBindingCollection = getBindingCollectionForProperty(rootNodes, activeProp);
  const initialCollectionScope =
    currentBindingCollection && currentBindingCollection !== 'mixed'
      ? currentBindingCollection
      : currentCollectionId || collectionIds[0] || "";
  const [activeCollectionId, setActiveCollectionId] = useState(
    initialCollectionScope,
  );
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, { initialFocusRef: inputRef });

  useEffect(() => {
    const preferredCollectionId =
      currentBindingCollection && currentBindingCollection !== 'mixed'
        ? currentBindingCollection
        : currentCollectionId || collectionIds[0] || "";
    setActiveCollectionId((current) => {
      if (current === ALL_COLLECTIONS_ID || current === preferredCollectionId) {
        return current;
      }
      if (
        !current ||
        !collectionIds.includes(current) ||
        (currentBindingCollection &&
          currentBindingCollection !== 'mixed' &&
          current !== currentBindingCollection)
      ) {
        return preferredCollectionId;
      }
      return current;
    });
  }, [collectionIds, currentBindingCollection, currentCollectionId]);

  const availableCollectionIds = useMemo(() => {
    const ids = collectionIds.filter((collectionId) =>
      tokenMapsByCollection[collectionId],
    );
    if (ids.includes(activeCollectionId)) {
      return ids;
    }
    return activeCollectionId && activeCollectionId !== ALL_COLLECTIONS_ID
      ? [activeCollectionId, ...ids]
      : ids;
  }, [activeCollectionId, collectionIds, tokenMapsByCollection]);
  const collectionScopeIds = useMemo(
    () => {
      if (availableCollectionIds.length <= 1) {
        return availableCollectionIds;
      }
      const orderedCollectionIds = [
        ...(currentCollectionId &&
        availableCollectionIds.includes(currentCollectionId)
          ? [currentCollectionId]
          : []),
        ...availableCollectionIds.filter(
          (collectionId) => collectionId !== currentCollectionId,
        ),
      ];
      return [...orderedCollectionIds, ALL_COLLECTIONS_ID];
    },
    [availableCollectionIds, currentCollectionId],
  );
  const searchAllCollections = activeCollectionId === ALL_COLLECTIONS_ID;
  const tokenMap = useMemo(
    () => tokenMapsByCollection[activeCollectionId] ?? EMPTY_TOKEN_MAP,
    [activeCollectionId, tokenMapsByCollection],
  );
  const activeCollectionLabel = searchAllCollections
    ? "All collections"
    : getCollectionDisplayName(activeCollectionId, collectionDisplayNames);
  const collectionTokenCount = searchAllCollections
    ? availableCollectionIds.reduce(
        (count, collectionId) =>
          count + Object.keys(tokenMapsByCollection[collectionId] ?? {}).length,
        0,
      )
    : Object.keys(tokenMap).length;
  const collectionHasTokens = collectionTokenCount > 0;
  const activePropLabel = PROPERTY_LABELS[activeProp];

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
  }, [query, activeProp, activeCollectionId]);

  // Build scored candidates for the active property
  const currentBindingForProp = getBindingForProperty(rootNodes, activeProp);
  const { candidates, totalCount } = useMemo(() => {
    if (!searchAllCollections) {
      return buildQuickApplyCandidates({
        activeProp,
        currentBinding: currentBindingForProp,
        query,
        rootNodes,
        tokenMap,
        collectionId: activeCollectionId,
        collectionLabel: activeCollectionLabel,
      });
    }

    const scopedResults = availableCollectionIds.map((collectionId) =>
      buildQuickApplyCandidates({
        activeProp,
        currentBinding: currentBindingForProp,
        query,
        rootNodes,
        tokenMap: tokenMapsByCollection[collectionId] ?? EMPTY_TOKEN_MAP,
        collectionId,
        collectionLabel: getCollectionDisplayName(collectionId, collectionDisplayNames),
      }),
    );
    const mergedCandidates = scopedResults
      .flatMap((result) => result.candidates)
      .sort((a, b) => b.rankScore - a.rankScore || b.score - a.score)
      .slice(0, MAX_CANDIDATES);

    return {
      candidates: mergedCandidates,
      totalCount: scopedResults.reduce((count, result) => count + result.totalCount, 0),
    };
  }, [
    activeCollectionId,
    activeCollectionLabel,
    activeProp,
    availableCollectionIds,
    collectionDisplayNames,
    currentBindingForProp,
    query,
    rootNodes,
    searchAllCollections,
    tokenMap,
    tokenMapsByCollection,
  ]);

  // Recently-used tokens: filter global recents to those present in the current candidate list
  const { recentCandidates, mainCandidates } = useMemo(
    () => splitRecentCandidates({ activeCollectionId, candidates, query }),
    [activeCollectionId, candidates, query],
  );
  const confidenceGroups = useMemo(
    () => groupSuggestionsByConfidence(mainCandidates),
    [mainCandidates],
  );

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
  const hasSingleCurrentBinding = currentBinding !== null && currentBinding !== 'mixed';
  const isCurrentCandidate = (candidate: QuickApplyCandidate): boolean =>
    currentBinding === candidate.path &&
    (currentBindingCollection && currentBindingCollection !== 'mixed'
      ? candidate.collectionId === currentBindingCollection
      : !searchAllCollections || candidate.collectionId === currentCollectionId);

  const handleSelect = (candidate: QuickApplyCandidate) => {
    if (isCurrentCandidate(candidate)) return;
    if (candidate.resolutionError) return;
    addRecentToken(candidate.path, candidate.collectionId);
    onApply(
      candidate.path,
      candidate.entry.$type,
      activeProp,
      candidate.resolved,
      candidate.collectionId,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
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

  const handlePropertyTabKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    prop: BindableProperty,
  ) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const idx = eligibleProps.indexOf(prop);
    const nextIndex =
      event.key === 'ArrowLeft'
        ? (idx - 1 + eligibleProps.length) % eligibleProps.length
        : (idx + 1) % eligibleProps.length;
    const nextProp = eligibleProps[nextIndex];
    setActiveProp(nextProp);
    requestAnimationFrame(() => {
      const tab = dialogRef.current?.querySelector<HTMLButtonElement>(
        `[data-quick-apply-property="${nextProp}"]`,
      );
      tab?.focus();
    });
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
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
            <label className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0">Collection</span>
              {collectionScopeIds.length > 1 ? (
                <select
                  value={activeCollectionId}
                  onChange={(event) => {
                    setActiveCollectionId(event.target.value);
                    setQuery("");
                    setActiveIdx(0);
                    window.setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="min-w-0 max-w-[180px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-secondary font-medium text-[color:var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                  title="Choose where Quick Apply searches"
                >
                  {collectionScopeIds.map((collectionId) => (
                    <option key={collectionId} value={collectionId}>
                      {collectionId === ALL_COLLECTIONS_ID
                        ? "All collections"
                        : collectionId === currentCollectionId
                          ? `Current: ${getCollectionDisplayName(collectionId, collectionDisplayNames)}`
                        : getCollectionDisplayName(collectionId, collectionDisplayNames)}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className="min-w-0 truncate font-medium text-[color:var(--color-figma-text)]"
                  title={activeCollectionLabel}
                >
                  {activeCollectionLabel}
                </span>
              )}
            </label>
            {!collectionHasTokens ? (
              <span className="text-[color:var(--color-figma-text-tertiary)]">
                {searchAllCollections ? "No tokens in the library" : "No tokens in this collection"}
              </span>
            ) : null}
          </div>
          <div
            role="tablist"
            aria-label="Apply property"
            className="flex gap-0.5 overflow-x-auto"
          >
            {eligibleProps.map(prop => {
              const isActive = prop === activeProp;
              const binding = getBindingForProperty(rootNodes, prop);
              const isBound = binding && binding !== 'mixed';
              return (
                <button
                  type="button"
                  key={prop}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="quick-apply-token-candidates"
                  tabIndex={isActive ? 0 : -1}
                  data-quick-apply-property={prop}
                  onClick={() => setActiveProp(prop)}
                  onKeyDown={(event) => handlePropertyTabKeyDown(event, prop)}
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

        <div className="flex flex-col gap-1.5 border-b border-[var(--color-figma-border)] px-3 py-2">
          <SearchField
            ref={inputRef}
            size="sm"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Search ${getTokenTypeForProperty(activeProp)} tokens…`}
            aria-label={`Search tokens for ${activePropLabel}`}
            aria-autocomplete="list"
            aria-controls="quick-apply-token-candidates"
            onClear={() => {
              setQuery("");
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="bg-[var(--color-figma-bg)]"
          />
          {hasSingleCurrentBinding && (
            <div
              className="min-w-0 truncate text-secondary text-[color:var(--color-figma-text-secondary)]"
              title={currentBinding}
            >
              Current {activePropLabel.toLowerCase()}:{" "}
              <span className="font-mono text-[color:var(--color-figma-text-accent)]">
                {currentBinding}
              </span>
            </div>
          )}
        </div>

        <div
          id="quick-apply-token-candidates"
          ref={listRef}
          className="overflow-y-auto flex-1"
          role="listbox"
          aria-label="Token candidates"
        >
          {candidates.length === 0 ? (
            <QuickApplyEmptyResults
              activeCollectionLabel={activeCollectionLabel}
              activePropLabel={activePropLabel}
              canSearchAllCollections={
                !searchAllCollections && availableCollectionIds.length > 1
              }
              query={query}
              onClearSearch={() => {
                setQuery("");
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
              onSearchAllCollections={() => {
                setActiveCollectionId(ALL_COLLECTIONS_ID);
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
            />
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
                    const isCurrent = isCurrentCandidate(c);
                    return (
                      <QuickApplyCandidateRow
                        key={`${c.collectionId}:${c.path}`}
                        candidate={c}
                        isCurrent={isCurrent}
                        isSelected={isSelected}
                        onHover={() => setActiveIdx(idx)}
                        onSelect={() => handleSelect(c)}
                        showCollection={searchAllCollections}
                      />
                    );
                  })}
                  {/* Separator between recent and main — group header will follow */}
                </>
              )}

              {/* Main candidates — grouped by confidence */}
              {query
                ? mainCandidates.map((candidate, index) => {
                    const globalIdx = recentCandidates.length + index;
                    return (
                      <QuickApplyCandidateRow
                        key={`${candidate.collectionId}:${candidate.path}`}
                        candidate={candidate}
                        isCurrent={isCurrentCandidate(candidate)}
                        isSelected={globalIdx === activeIdx}
                        onHover={() => setActiveIdx(globalIdx)}
                        onSelect={() => handleSelect(candidate)}
                        showCollection={searchAllCollections}
                      />
                    );
                  })
                : confidenceGroups.map((group, groupIndex) => {
                    const itemsBeforeGroup = confidenceGroups
                      .slice(0, groupIndex)
                      .reduce((count, previousGroup) => count + previousGroup.items.length, 0);
                    const isFirstGroup = groupIndex === 0 && recentCandidates.length === 0;

                    return (
                      <div key={group.confidence}>
                        <div className={`text-secondary font-medium px-3 pt-1.5 pb-0.5 ${
                          !isFirstGroup ? 'border-t border-[var(--color-figma-border)]/50 mt-0.5' : ''
                        } ${
                          group.confidence === 'strong' ? 'text-[color:var(--color-figma-text-accent)]' : 'text-[color:var(--color-figma-text-secondary)]'
                        }`}>
                          {CONFIDENCE_LABELS[group.confidence]}
                        </div>
                        {group.items.map((candidate, index) => {
                          const globalIdx =
                            recentCandidates.length + itemsBeforeGroup + index;
                          return (
                            <QuickApplyCandidateRow
                              key={`${candidate.collectionId}:${candidate.path}`}
                              candidate={candidate}
                              isCurrent={isCurrentCandidate(candidate)}
                              isSelected={globalIdx === activeIdx}
                              onHover={() => setActiveIdx(globalIdx)}
                              onSelect={() => handleSelect(candidate)}
                              showReason={group.confidence !== 'weak'}
                              showCollection={searchAllCollections}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
              {totalCount > MAX_CANDIDATES && (
                <div className="text-secondary text-[color:var(--color-figma-text-secondary)] text-center py-1.5 border-t border-[var(--color-figma-border)]">
                  {totalCount - MAX_CANDIDATES} more — type to refine
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
