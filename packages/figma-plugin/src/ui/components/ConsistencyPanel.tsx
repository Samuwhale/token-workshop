import { useState, useEffect, useCallback, useRef } from 'react';
import type { TokenMapEntry, ConsistencyMatch, ConsistencySuggestion } from '../../shared/types';

interface ConsistencyPanelProps {
  availableTokens: Record<string, TokenMapEntry>;
  onSelectNode: (nodeId: string) => void;
}

type ScanScope = 'selection' | 'page' | 'all-pages';

const PROPERTY_LABELS: Record<string, string> = {
  fill: 'Fill',
  stroke: 'Stroke',
  cornerRadius: 'Corner Radius',
  strokeWeight: 'Stroke Weight',
  paddingTop: 'Padding Top',
  paddingRight: 'Padding Right',
  paddingBottom: 'Padding Bottom',
  paddingLeft: 'Padding Left',
  itemSpacing: 'Item Spacing',
  opacity: 'Opacity',
  fontFamily: 'Font Family',
  fontSize: 'Font Size',
  fontWeight: 'Font Weight',
  lineHeight: 'Line Height',
  letterSpacing: 'Letter Spacing',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  FRAME: 'Frame', COMPONENT: 'Component', COMPONENT_SET: 'Cmp set',
  INSTANCE: 'Instance', RECTANGLE: 'Rect', ELLIPSE: 'Ellipse',
  POLYGON: 'Polygon', STAR: 'Star', VECTOR: 'Vector', LINE: 'Line', TEXT: 'Text',
};

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
}: {
  suggestion: ConsistencySuggestion;
  onSnap: (suggestion: ConsistencySuggestion) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isColor = suggestion.tokenType === 'color';
  const propLabel = PROPERTY_LABELS[suggestion.property] ?? suggestion.property;

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
            <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate">{suggestion.tokenPath}</span>
            <span className="text-[9px] px-1 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0">{propLabel}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {formatValue(suggestion.tokenValue, suggestion.property)}
            </span>
            <span className="text-[9px] text-[var(--color-figma-text-secondary)]">·</span>
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              {count} {count === 1 ? 'instance' : 'instances'}
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
          className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Snap all
        </button>
      </div>

      {/* Expanded instance list */}
      {expanded && (
        <div className="border-t border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
          {uniqueMatches.map((match, idx) => (
            <div key={idx} className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--color-figma-bg-hover)]">
              <span className="text-[9px] text-[var(--color-figma-text-secondary)] w-10 shrink-0">
                {NODE_TYPE_LABELS[match.nodeType] ?? match.nodeType}
              </span>
              <button
                onClick={() => onSelectNode(match.nodeId)}
                className="flex-1 min-w-0 text-left text-[10px] text-[var(--color-figma-text)] truncate hover:underline"
                title={match.nodeName}
              >
                {match.nodeName}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {isColor && <ColorSwatch hex={String(match.actualValue)} />}
                <span className="text-[10px] text-amber-600 tabular-nums">
                  {formatValue(match.actualValue, match.property)}
                </span>
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                  <path d="M1 3h6M5 1l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {isColor && <ColorSwatch hex={String(match.tokenValue)} />}
                <span className="text-[10px] text-emerald-600 tabular-nums">
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

const CONSISTENCY_SCAN_TIMEOUT_MS = 60_000;

export function ConsistencyPanel({ availableTokens, onSelectNode }: ConsistencyPanelProps) {
  const [scope, setScope] = useState<ScanScope>('page');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [suggestions, setSuggestions] = useState<ConsistencySuggestion[] | null>(null);
  const [totalNodes, setTotalNodes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snappedKeys, setSnappedKeys] = useState<Set<string>>(new Set());
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearScanTimeout = useCallback(() => {
    if (scanTimeoutRef.current !== null) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    clearScanTimeout();
    parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
    setScanning(false);
    setProgress(null);
  }, [clearScanTimeout]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === 'consistency-scan-progress') {
        setProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === 'consistency-scan-result') {
        clearScanTimeout();
        setScanning(false);
        setProgress(null);
        setSuggestions(msg.suggestions);
        setTotalNodes(msg.totalNodes);
        setError(null);
      } else if (msg.type === 'consistency-scan-error') {
        clearScanTimeout();
        setScanning(false);
        setProgress(null);
        setError(msg.error);
      } else if (msg.type === 'consistency-scan-cancelled') {
        clearScanTimeout();
        setScanning(false);
        setProgress(null);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      clearScanTimeout();
    };
  }, [clearScanTimeout]);

  const handleScan = useCallback(() => {
    clearScanTimeout();
    setScanning(true);
    setProgress(null);
    setSuggestions(null);
    setError(null);
    setSnappedKeys(new Set());

    scanTimeoutRef.current = setTimeout(() => {
      scanTimeoutRef.current = null;
      parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
      setScanning(false);
      setProgress(null);
      setError('Scan timed out. Try a smaller scope (Page instead of All pages).');
    }, CONSISTENCY_SCAN_TIMEOUT_MS);

    // Build a flat resolved token map (color, dimension, number, and all typography types)
    const tokenMap: Record<string, { $value: any; $type: string }> = {};
    for (const [path, entry] of Object.entries(availableTokens)) {
      if (['color', 'dimension', 'number', 'fontWeight', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'].includes(entry.$type)) {
        tokenMap[path] = { $value: entry.$value, $type: entry.$type };
      }
    }

    parent.postMessage({
      pluginMessage: { type: 'scan-consistency', tokenMap, scope },
    }, '*');
  }, [availableTokens, scope, clearScanTimeout]);

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
  }, [availableTokens]);

  const visibleSuggestions = suggestions?.filter(
    s => !snappedKeys.has(`${s.tokenPath}::${s.property}`)
  ) ?? null;

  const hasTokens = Object.keys(availableTokens).length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
        {/* Scope toggle */}
        <div className="flex rounded overflow-hidden border border-[var(--color-figma-border)] text-[10px]">
          {([
            { value: 'page', label: 'Page' },
            { value: 'selection', label: 'Selection' },
            { value: 'all-pages', label: 'All pages' },
          ] as { value: ScanScope; label: string }[]).map(({ value: s, label }) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-2 py-1 transition-colors ${
                scope === s
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {scanning ? (
          <button
            onClick={handleCancel}
            className="ml-auto px-3 py-1 rounded text-[10px] font-medium bg-red-500 text-white hover:opacity-90 transition-opacity"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleScan}
            disabled={!hasTokens}
            className="ml-auto px-3 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Scan
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* No tokens */}
        {!hasTokens && (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No tokens loaded.</p>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">Connect to a server with tokens to use the consistency scanner.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="m-3 p-3 rounded border border-red-300 bg-red-50 text-[10px] text-red-700">
            {error}
          </div>
        )}

        {/* Progress */}
        {scanning && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
            <div className="w-full max-w-48 h-1 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-figma-accent)] transition-all duration-200"
                style={{ width: progress ? `${Math.round((progress.processed / progress.total) * 100)}%` : '0%' }}
              />
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {progress
                ? `Scanning… ${progress.processed} / ${progress.total}`
                : 'Scanning…'}
            </p>
          </div>
        )}

        {/* Initial / idle */}
        {!scanning && suggestions === null && !error && hasTokens && (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
              <path d="M8 11h6M11 8v6" />
            </svg>
            <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Find near-matches</p>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] max-w-48">
              Scans for colors, spacing, typography, and other values that are close to — but not exactly — a design token.
            </p>
          </div>
        )}

        {/* Results */}
        {!scanning && visibleSuggestions !== null && (
          <div className="p-3 flex flex-col gap-2">
            {/* Summary */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {totalNodes} nodes scanned
              </p>
              {visibleSuggestions.length > 0 && (
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {visibleSuggestions.reduce((n, s) => n + s.matches.length, 0)} near-matches
                </p>
              )}
            </div>

            {visibleSuggestions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <p className="text-[11px] font-medium text-[var(--color-figma-text)]">All consistent</p>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  No near-miss token values found{snappedKeys.size > 0 ? ' (or all snapped)' : ''}.
                </p>
              </div>
            ) : (
              visibleSuggestions.map(suggestion => (
                <SuggestionCard
                  key={`${suggestion.tokenPath}::${suggestion.property}`}
                  suggestion={suggestion}
                  onSnap={handleSnap}
                  onSelectNode={onSelectNode}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
