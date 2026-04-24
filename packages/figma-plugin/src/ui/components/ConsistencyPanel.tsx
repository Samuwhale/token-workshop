import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TokenMapEntry, ConsistencyMatch, ConsistencySuggestion, ScanScope } from '../../shared/types';
import { useUsageContext } from '../contexts/InspectContext';
import { ConfirmModal } from './ConfirmModal';
import { stableStringify } from '../shared/utils';
import { lsGetJson, lsSetJson, STORAGE_KEYS } from '../shared/storage';
interface ConsistencyPanelProps {
  availableTokens: Record<string, TokenMapEntry>;
  onSelectNode: (nodeId: string) => void;
  onCreateToken?: (request: { suggestion: ConsistencySuggestion; match: ConsistencyMatch }) => void;
  resolvedMatchKeys?: Set<string>;
  scope: ScanScope;
}
type SuggestionCategory = 'color' | 'dimension' | 'typography' | 'other';

const NODE_TYPE_LABELS: Record<string, string> = {
  FRAME: 'Frame', COMPONENT: 'Component', COMPONENT_SET: 'Cmp set',
  INSTANCE: 'Instance', RECTANGLE: 'Rect', ELLIPSE: 'Ellipse',
  POLYGON: 'Polygon', STAR: 'Star', VECTOR: 'Vector', LINE: 'Line', TEXT: 'Text',
};

const TYPOGRAPHY_TYPES = new Set(['fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'typography']);
const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  color: 'Colors',
  dimension: 'Dimensions',
  typography: 'Typography',
  other: 'Other',
};
const CATEGORY_ORDER: SuggestionCategory[] = ['color', 'dimension', 'typography', 'other'];

function getSuggestionCategory(s: ConsistencySuggestion): SuggestionCategory {
  if (s.tokenType === 'color') return 'color';
  if (TYPOGRAPHY_TYPES.has(s.tokenType)) return 'typography';
  if (s.tokenType === 'dimension' || s.tokenType === 'number') return 'dimension';
  return 'other';
}

function ColorSwatch({ hex }: { hex: string }) {
  // Only render swatch for #RRGGBB / #RRGGBBAA
  const clean = hex.startsWith('#') ? hex : null;
  if (!clean) return null;
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
      style={{ backgroundColor: clean.slice(0, 7) }}
      aria-hidden="true"
    />
  );
}

function formatValue(value: string | number, property: string): string {
  if (property === 'opacity' && typeof value === 'number') {
    return `${Math.round(value * 100)}%`;
  }
  if (typeof value === 'number') return `${value}px`;
  return String(value);
}

function SuggestionCard({
  suggestion,
  onSnap,
  onSelectNode,
  onReject,
  onCreateMatch,
  rejected,
}: {
  suggestion: ConsistencySuggestion;
  onSnap: (suggestion: ConsistencySuggestion) => void;
  onSelectNode: (nodeId: string) => void;
  onReject: (suggestion: ConsistencySuggestion) => void;
  onCreateMatch?: (suggestion: ConsistencySuggestion, match: ConsistencyMatch) => void;
  rejected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isColor = suggestion.tokenType === 'color';
  // Deduplicate by nodeId+property (same node can appear once per property match)
  const uniqueMatches = suggestion.matches;
  const count = uniqueMatches.length;

  return (
    <div className="border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        {isColor && <ColorSwatch hex={String(suggestion.tokenValue)} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-secondary font-medium text-[var(--color-figma-text)] truncate">{suggestion.tokenPath}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-secondary text-[var(--color-figma-text-secondary)]">
              {formatValue(suggestion.tokenValue as string | number, suggestion.property)}
            </span>
            <span className="text-secondary text-[var(--color-figma-text-secondary)]">·</span>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              {count}×
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                className={`inline ml-0.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
          </div>
        </div>
        <button
          onClick={() => onSnap(suggestion)}
          title={`Snap all ${count} instance${count !== 1 ? 's' : ''} to ${suggestion.tokenPath}`}
          className="shrink-0 px-2 py-0.5 rounded text-secondary font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Snap all
        </button>
        <button
          onClick={() => {
            setExpanded(true);
            onReject(suggestion);
          }}
          className={`shrink-0 px-2 py-0.5 rounded text-secondary font-medium border transition-colors ${
            rejected
              ? 'border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
              : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          Not close enough
        </button>
      </div>

      {/* Expanded instance list */}
      {expanded && (
        <div className="mt-1">
          {rejected && (
            <div className="px-2 py-1.5 text-secondary text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]">
              Create a token from the actual value for any layer below.
            </div>
          )}
          {uniqueMatches.map((match: ConsistencyMatch) => (
            <div key={getMatchKey(match)} className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--color-figma-bg-hover)]">
              <span className="text-secondary text-[var(--color-figma-text-secondary)] w-10 shrink-0">
                {NODE_TYPE_LABELS[match.nodeType] ?? match.nodeType}
              </span>
              <button
                onClick={() => onSelectNode(match.nodeId)}
                className="flex-1 min-w-0 text-left text-secondary text-[var(--color-figma-text)] truncate hover:underline"
                title={match.nodeName}
              >
                {match.nodeName}
              </button>
              {rejected && onCreateMatch && (
                <button
                  onClick={() => onCreateMatch(suggestion, match)}
                  className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-secondary font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Create token
                </button>
              )}
              <div className="flex items-center gap-1 shrink-0">
                {isColor && <ColorSwatch hex={String(match.actualValue)} />}
                <span className="text-secondary text-[var(--color-figma-warning)] tabular-nums">
                  {formatValue(match.actualValue, match.property)}
                </span>
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                  <path d="M1 3h6M5 1l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {isColor && <ColorSwatch hex={String(match.tokenValue)} />}
                <span className="text-secondary text-[var(--color-figma-success)] tabular-nums">
                  {formatValue(match.tokenValue, match.property)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getSuggestionKey(suggestion: ConsistencySuggestion): string {
  return `${suggestion.tokenPath}::${suggestion.property}`;
}

function getMatchKey(match: ConsistencyMatch): string {
  return `${match.nodeId}::${match.property}::${stableStringify(match.actualValue)}`;
}

export function ConsistencyPanel({
  availableTokens,
  onSelectNode,
  onCreateToken,
  resolvedMatchKeys = new Set<string>(),
  scope,
}: ConsistencyPanelProps) {
  // Pending bulk snap: the suggestions array to confirm, or null when modal is closed
  const [snapConfirm, setSnapConfirm] = useState<ConsistencySuggestion[] | null>(null);
  const [rejectedSuggestionKeys, setRejectedSuggestionKeys] = useState<Set<string>>(
    () => new Set(lsGetJson<string[]>(STORAGE_KEYS.CONSISTENCY_REJECTED, [])),
  );

  useEffect(() => {
    lsSetJson(STORAGE_KEYS.CONSISTENCY_REJECTED, [...rejectedSuggestionKeys]);
  }, [rejectedSuggestionKeys]);

  // Scan results and loading state are lifted to InspectContext so they survive
  // tab switches without requiring a re-scan.
  const {
    consistencyResult: suggestions,
    consistencyLoading: scanning,
    consistencyError: error,
    consistencyProgress: progress,
    consistencyTotalNodes: totalNodes,
    consistencySnappedKeys: snappedKeys,
    setConsistencySnappedKeys: setSnappedKeys,
    triggerConsistencyScan,
    cancelConsistencyScan,
  } = useUsageContext();

  const handleCancel = useCallback(() => {
    cancelConsistencyScan();
  }, [cancelConsistencyScan]);

  const handleScan = useCallback(() => {
    // Build a flat resolved token map (color, dimension, number, and all typography types)
    const tokenMap: Record<string, { $value: unknown; $type: string }> = {};
    for (const [path, entry] of Object.entries(availableTokens)) {
      if (['color', 'dimension', 'number', 'fontWeight', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'].includes(entry.$type)) {
        tokenMap[path] = { $value: entry.$value, $type: entry.$type };
      }
    }
    triggerConsistencyScan(tokenMap, scope);
  }, [availableTokens, scope, triggerConsistencyScan]);

  const handleSnap = useCallback((suggestion: ConsistencySuggestion) => {
    const entry = availableTokens[suggestion.tokenPath];
    if (!entry) return;
    const nodeIds = suggestion.matches.map(m => m.nodeId);
    // Reuse batch-bind-heatmap-nodes which selects nodes and applies the token
    parent.postMessage({
      pluginMessage: {
        type: 'batch-bind-heatmap-nodes',
        nodeIds,
        tokenPath: suggestion.tokenPath,
        tokenType: suggestion.tokenType,
        targetProperty: suggestion.property,
        resolvedValue: entry.$value,
      },
    }, '*');
    const key = `${suggestion.tokenPath}::${suggestion.property}`;
    setSnappedKeys(prev => new Set([...prev, key]));
  }, [availableTokens, setSnappedKeys]);

  const handleSnapMultiple = useCallback((toSnap: ConsistencySuggestion[]) => {
    for (const suggestion of toSnap) {
      const entry = availableTokens[suggestion.tokenPath];
      if (!entry) continue;
      const nodeIds = suggestion.matches.map(m => m.nodeId);
      parent.postMessage({
        pluginMessage: {
          type: 'batch-bind-heatmap-nodes',
          nodeIds,
          tokenPath: suggestion.tokenPath,
          tokenType: suggestion.tokenType,
          targetProperty: suggestion.property,
          resolvedValue: entry.$value,
          skipNavigation: true,
        },
      }, '*');
    }
    setSnappedKeys(prev => {
      const next = new Set(prev);
      for (const s of toSnap) next.add(`${s.tokenPath}::${s.property}`);
      return next;
    });
    setSnapConfirm(null);
  }, [availableTokens, setSnappedKeys]);

  const visibleSuggestions = suggestions?.map((suggestion) => ({
    ...suggestion,
    matches: suggestion.matches.filter((match) => !resolvedMatchKeys.has(getMatchKey(match))),
  })).filter(
    suggestion => suggestion.matches.length > 0 && !snappedKeys.has(getSuggestionKey(suggestion))
  ) ?? null;

  // Group visible suggestions by category for display and per-category snap buttons
  const groupedSuggestions = useMemo(() => {
    if (!visibleSuggestions) return null;
    const groups = new Map<SuggestionCategory, ConsistencySuggestion[]>();
    for (const s of visibleSuggestions) {
      const cat = getSuggestionCategory(s);
      const arr = groups.get(cat) ?? [];
      arr.push(s);
      groups.set(cat, arr);
    }
    return groups;
  }, [visibleSuggestions]);

  const handleRejectSuggestion = useCallback((suggestion: ConsistencySuggestion) => {
    const suggestionKey = getSuggestionKey(suggestion);
    setRejectedSuggestionKeys((prev) => new Set(prev).add(suggestionKey));
  }, []);

  const hasMultipleCategories = groupedSuggestions ? groupedSuggestions.size > 1 : false;

  // Build grouped preview rows for the confirm modal
  const snapConfirmPreview = useMemo(() => {
    if (!snapConfirm) return null;
    const catMap = new Map<SuggestionCategory, { tokenCount: number; instanceCount: number }>();
    for (const s of snapConfirm) {
      const cat = getSuggestionCategory(s);
      const existing = catMap.get(cat) ?? { tokenCount: 0, instanceCount: 0 };
      catMap.set(cat, {
        tokenCount: existing.tokenCount + 1,
        instanceCount: existing.instanceCount + s.matches.length,
      });
    }
    return CATEGORY_ORDER
      .filter(cat => catMap.has(cat))
      .map(cat => ({ label: CATEGORY_LABELS[cat], ...catMap.get(cat)! }));
  }, [snapConfirm]);

  const hasTokens = Object.keys(availableTokens).length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0">
        {scanning ? (
          <button
            onClick={handleCancel}
            className="ml-auto px-3 py-1 rounded text-secondary font-medium bg-[var(--color-figma-error)] text-white hover:opacity-90 transition-opacity"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleScan}
            disabled={!hasTokens}
            className="ml-auto px-3 py-1 rounded text-secondary font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Scan
          </button>
        )}
      </div>
      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* No tokens */}
        {!hasTokens && (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-3 text-center">
            <p className="text-body text-[var(--color-figma-text-secondary)]">No tokens loaded.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="m-3 p-3 rounded border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 text-secondary text-[var(--color-figma-error)]">
            {error}
          </div>
        )}

        {/* Progress */}
        {scanning && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-3">
            <div className="w-full max-w-48 h-1 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-figma-accent)] transition-all duration-200"
                style={{ width: progress ? `${Math.round((progress.processed / progress.total) * 100)}%` : '0%' }}
              />
            </div>
            <p className="text-secondary text-[var(--color-figma-text-secondary)]">
              {progress
                ? `Scanning… ${progress.processed} / ${progress.total}`
                : 'Scanning…'}
            </p>
          </div>
        )}

        {/* Initial / idle */}
        {!scanning && suggestions === null && !error && hasTokens && (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-3 text-center">
            <p className="text-body text-[var(--color-figma-text-secondary)]">
              Scan for near-matches.
            </p>
          </div>
        )}

        {/* Results */}
        {!scanning && visibleSuggestions !== null && groupedSuggestions !== null && (
          <div className="p-3 flex flex-col gap-2">
            {/* Summary row */}
            <div className="flex items-center justify-between">
              <p className="text-secondary text-[var(--color-figma-text-secondary)]">
                {totalNodes} nodes scanned
              </p>
              {visibleSuggestions.length > 0 && (
                <div className="flex items-center gap-2">
                  <p className="text-secondary text-[var(--color-figma-text-secondary)]">
                    {visibleSuggestions.reduce((n, s) => n + s.matches.length, 0)} near-matches
                  </p>
                  <button
                    onClick={() => setSnapConfirm(visibleSuggestions)}
                    className="px-2 py-0.5 rounded text-secondary font-medium border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    Snap all {visibleSuggestions.length}
                  </button>
                </div>
              )}
            </div>

            {visibleSuggestions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-3 text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)]" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <p className="text-body font-medium text-[var(--color-figma-text)]">All consistent</p>
                <p className="text-secondary text-[var(--color-figma-text-secondary)]">
                  {snappedKeys.size > 0 ? 'All snapped.' : 'No near-matches found.'}
                </p>
              </div>
            ) : hasMultipleCategories ? (
              // Grouped by category with per-category snap buttons
              CATEGORY_ORDER.filter(cat => groupedSuggestions.has(cat)).map(cat => {
                const catSuggestions = groupedSuggestions.get(cat)!;
                const catInstanceCount = catSuggestions.reduce((n, s) => n + s.matches.length, 0);
                return (
                  <div key={cat} className="flex flex-col gap-2">
                    {/* Category header */}
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                        {CATEGORY_LABELS[cat]}
                        <span className="ml-1 font-normal text-secondary">
                          ({catInstanceCount})
                        </span>
                      </p>
                      <button
                        onClick={() => setSnapConfirm(catSuggestions)}
                        className="px-1.5 py-0.5 rounded text-secondary font-medium border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                      >
                        Snap {catSuggestions.length} in {CATEGORY_LABELS[cat]}
                      </button>
                    </div>
                    {catSuggestions.map(suggestion => (
                      <SuggestionCard
                        key={getSuggestionKey(suggestion)}
                        suggestion={suggestion}
                        onSnap={handleSnap}
                        onSelectNode={onSelectNode}
                        onReject={handleRejectSuggestion}
                        rejected={rejectedSuggestionKeys.has(getSuggestionKey(suggestion))}
                        onCreateMatch={onCreateToken ? (nextSuggestion, match) => onCreateToken({ suggestion: nextSuggestion, match }) : undefined}
                      />
                    ))}
                  </div>
                );
              })
            ) : (
              visibleSuggestions.map(suggestion => (
                <SuggestionCard
                  key={getSuggestionKey(suggestion)}
                  suggestion={suggestion}
                  onSnap={handleSnap}
                  onSelectNode={onSelectNode}
                  onReject={handleRejectSuggestion}
                  rejected={rejectedSuggestionKeys.has(getSuggestionKey(suggestion))}
                  onCreateMatch={onCreateToken ? (nextSuggestion, match) => onCreateToken({ suggestion: nextSuggestion, match }) : undefined}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Bulk snap confirmation modal */}
      {snapConfirm !== null && snapConfirmPreview !== null && (
        <ConfirmModal
          title={`Snap ${snapConfirm.length} suggestion${snapConfirm.length !== 1 ? 's' : ''}?`}
          confirmLabel={`Snap ${snapConfirm.length}`}
          wide={snapConfirmPreview.length > 1}
          onConfirm={() => handleSnapMultiple(snapConfirm)}
          onCancel={() => setSnapConfirm(null)}
        >
          <div className="mt-2 space-y-1">
            {snapConfirmPreview.map(row => (
              <div key={row.label} className="flex items-center justify-between text-body">
                <span className="text-[var(--color-figma-text)]">{row.label}</span>
                <span className="text-[var(--color-figma-text-secondary)]">
                  {row.tokenCount} token{row.tokenCount !== 1 ? 's' : ''},{' '}
                  {row.instanceCount} instance{row.instanceCount !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}
