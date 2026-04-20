import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  TokenMapEntry,
  BindableProperty,
  ResolvedTokenValue,
  ConsistencyMatch,
  ConsistencySuggestion,
} from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';
import { HeatmapPanel } from './HeatmapPanel';
import type { HeatmapNode, HeatmapResult } from './HeatmapPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { ComponentCoveragePanel } from './ComponentCoveragePanel';
import { ScanScopeSelector } from './ScanScopeSelector';
import { useHeatmapContext } from '../contexts/InspectContext';
import { useConnectionContext } from '../contexts/ConnectionContext';
import { useCollectionStateContext } from '../contexts/TokenDataContext';
import { stableStringify } from '../shared/utils';
import {
  getCompatibleTokenTypes,
  getTokenTypeForProperty,
  isTokenScopeCompatible,
  suggestTokenPath,
} from './selectionInspectorUtils';
import {
  CanvasCreateTokenDialog,
  type CanvasCreateDraft,
  type CanvasCreateDraftOption,
} from './CanvasCreateTokenDialog';
import { lsGet, lsSet, STORAGE_KEYS } from '../shared/storage';

type CanvasTab = 'coverage' | 'suggestions' | 'components';

const TABS: Array<{ id: CanvasTab; label: string }> = [
  { id: 'coverage', label: 'Coverage' },
  { id: 'suggestions', label: 'Suggestions' },
  { id: 'components', label: 'Components' },
];

interface CanvasAnalysisPanelProps {
  availableTokens: Record<string, TokenMapEntry>;
  heatmapResult: HeatmapResult | null;
  heatmapLoading: boolean;
  heatmapProgress: { processed: number; total: number } | null;
  heatmapError: string | null;
  onSelectNodes: (ids: string[]) => void;
  onBatchBind: (nodeIds: string[], tokenPath: string, property: BindableProperty) => void;
  onSelectNode: (nodeId: string) => void;
  /** Initial sub-tab to show. Defaults to 'coverage'. */
  initialTab?: CanvasTab;
}

function buildConsistencyMatchKey(match: ConsistencyMatch): string {
  return `${match.nodeId}::${match.property}::${stableStringify(match.actualValue)}`;
}

function formatCreatePreview(tokenType: string, value: ResolvedTokenValue): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (tokenType === 'dimension' && value && typeof value === 'object' && !Array.isArray(value) && 'value' in value && 'unit' in value) {
    const dimension = value as { value: number; unit: string };
    return `${dimension.value}${dimension.unit}`;
  }
  return stableStringify(value);
}

function normalizeConsistencyTokenValue(
  suggestion: ConsistencySuggestion,
  match: ConsistencyMatch,
): ResolvedTokenValue | null {
  if (suggestion.tokenType === 'color' && typeof match.actualValue === 'string') {
    return match.actualValue;
  }
  if (suggestion.tokenType === 'dimension' && typeof match.actualValue === 'number') {
    return {
      value: Math.round(match.actualValue * 100) / 100,
      unit: 'px',
    };
  }
  if (
    (suggestion.tokenType === 'number' || suggestion.tokenType === 'fontWeight') &&
    typeof match.actualValue === 'number'
  ) {
    return match.actualValue;
  }
  if (suggestion.tokenType === 'fontFamily' && typeof match.actualValue === 'string') {
    return match.actualValue;
  }
  return null;
}

export function CanvasAnalysisPanel({
  availableTokens,
  heatmapResult,
  heatmapLoading,
  heatmapProgress,
  heatmapError,
  onSelectNodes,
  onBatchBind,
  onSelectNode,
  initialTab = 'coverage',
}: CanvasAnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<CanvasTab>(
    () => (lsGet(STORAGE_KEYS.CANVAS_SCAN_TAB) as CanvasTab | null) ?? initialTab,
  );

  const switchTab = useCallback((tab: CanvasTab) => {
    setActiveTab(tab);
    lsSet(STORAGE_KEYS.CANVAS_SCAN_TAB, tab);
  }, []);

  // Honor initialTab prop changes (e.g. deep-link from another panel)
  const prevInitialTabRef = useRef(initialTab);
  useEffect(() => {
    if (initialTab !== prevInitialTabRef.current) {
      prevInitialTabRef.current = initialTab;
      switchTab(initialTab);
    }
  }, [initialTab, switchTab]);

  const { connected, serverUrl } = useConnectionContext();
  const {
    collections,
    currentCollectionId,
    refreshCollections: refreshTokens,
  } = useCollectionStateContext();
  const sets = collections.map((collection) => collection.id);
  const {
    heatmapScope,
    setHeatmapScope,
    triggerHeatmapScan,
    cancelHeatmapScan,
  } = useHeatmapContext();
  const [createDraft, setCreateDraft] = useState<CanvasCreateDraft | null>(null);
  const [resolvedConsistencyMatchKeys, setResolvedConsistencyMatchKeys] = useState<Set<string>>(new Set());

  const findExactMatchesForBindableValue = useCallback((
    property: BindableProperty,
    tokenValue: ResolvedTokenValue,
  ) => {
    const compatibleTypes = new Set(getCompatibleTokenTypes(property));
    const targetValue = stableStringify(tokenValue);
    return Object.entries(availableTokens)
      .filter(([, entry]) => compatibleTypes.has(entry.$type))
      .filter(([, entry]) => isTokenScopeCompatible(entry, property))
      .filter(([, entry]) => stableStringify(entry.$value) === targetValue)
      .map(([path]) => path);
  }, [availableTokens]);

  const buildHeatmapCreateOptions = useCallback((node: HeatmapNode): CanvasCreateDraftOption[] => {
    return (node.missingValueEntries ?? [])
      .filter((entry): entry is NonNullable<HeatmapNode['missingValueEntries']>[number] => entry.value !== null && entry.value !== undefined)
      .map((entry) => {
        const tokenType = getTokenTypeForProperty(entry.property);
        return {
          property: entry.property,
          propertyLabel: PROPERTY_LABELS[entry.property] ?? entry.property,
          tokenType,
          tokenValue: entry.value,
          previewValue: formatCreatePreview(tokenType, entry.value),
          nodeIds: [node.id],
          layerLabel: node.name,
          suggestedPath: suggestTokenPath(entry.property, node.name),
        };
      })
      .filter((option) => findExactMatchesForBindableValue(option.property as BindableProperty, option.tokenValue).length === 0);
  }, [findExactMatchesForBindableValue]);

  const canCreateHeatmapToken = useCallback((node: HeatmapNode) => {
    return buildHeatmapCreateOptions(node).length > 0;
  }, [buildHeatmapCreateOptions]);

  const handleOpenHeatmapCreate = useCallback((node: HeatmapNode) => {
    const options = buildHeatmapCreateOptions(node);
    if (options.length === 0) {
      return;
    }
    setCreateDraft({
      source: 'heatmap',
      title: `Create token for ${node.name}`,
      description: 'Create a token from this value and bind it to the layer.',
      options,
    });
  }, [buildHeatmapCreateOptions]);

  const handleOpenConsistencyCreate = useCallback((request: {
    suggestion: ConsistencySuggestion;
    match: ConsistencyMatch;
  }) => {
    const tokenValue = normalizeConsistencyTokenValue(request.suggestion, request.match);
    if (tokenValue === null) {
      return;
    }

    setCreateDraft({
      source: 'consistency',
      title: `Create token for ${request.match.nodeName}`,
      description: 'Create a new token from the canvas value and bind it.',
      options: [
        {
          property: request.match.property,
          propertyLabel: PROPERTY_LABELS[request.match.property as BindableProperty] ?? request.match.property,
          tokenType: request.suggestion.tokenType,
          tokenValue,
          previewValue: formatCreatePreview(request.suggestion.tokenType, tokenValue),
          nodeIds: [request.match.nodeId],
          layerLabel: request.match.nodeName,
          suggestedPath: isBindablePropertyName(request.match.property)
            ? suggestTokenPath(request.match.property, request.match.nodeName)
            : `${request.suggestion.tokenType}.${request.match.nodeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layer'}`,
          resolutionKeys: [buildConsistencyMatchKey(request.match)],
        },
      ],
    });
  }, []);

  const handleCreateSuccess = useCallback(async (result: {
    source: CanvasCreateDraft['source'];
    tokenPath: string;
    option: CanvasCreateDraftOption;
  }) => {
    refreshTokens();
    parent.postMessage(
      {
        pluginMessage: {
          type: 'apply-to-nodes',
          nodeIds: result.option.nodeIds,
          tokenPath: result.tokenPath,
          tokenType: result.option.tokenType,
          targetProperty: result.option.property,
          resolvedValue: result.option.tokenValue,
        },
      },
      '*',
    );

    if (result.source === 'heatmap') {
      triggerHeatmapScan();
      return;
    }

    if (result.option.resolutionKeys && result.option.resolutionKeys.length > 0) {
      setResolvedConsistencyMatchKeys((prev) => {
        const next = new Set(prev);
        result.option.resolutionKeys?.forEach((key) => next.add(key));
        return next;
      });
    }
  }, [refreshTokens, triggerHeatmapScan]);

  return (
    <div className="flex flex-col h-full">
      {/* Scan scope — persistent control above tabs, affects all sections */}
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0 bg-[var(--color-figma-bg)] flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Scope</span>
        <div className="flex-1">
          <ScanScopeSelector value={heatmapScope} onChange={setHeatmapScope} showLabel={false} />
        </div>
        <button
          onClick={() => triggerHeatmapScan()}
          disabled={heatmapLoading}
          className="shrink-0 px-2.5 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {heatmapLoading ? 'Scanning…' : 'Scan'}
        </button>
        {heatmapLoading && (
          <button
            onClick={cancelHeatmapScan}
            className="shrink-0 px-2 py-1 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-figma-border)] shrink-0 bg-[var(--color-figma-bg)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)] -mb-px'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — flex-1 so it fills remaining height without fixed px */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'coverage' && (
          <HeatmapPanel
            result={heatmapResult}
            loading={heatmapLoading}
            progress={heatmapProgress}
            error={heatmapError}
            scope={heatmapScope}
            onRescan={triggerHeatmapScan}
            onCancel={cancelHeatmapScan}
            onSelectNodes={onSelectNodes}
            onBatchBind={onBatchBind}
            availableTokens={availableTokens}
            canCreateToken={canCreateHeatmapToken}
            onCreateToken={handleOpenHeatmapCreate}
          />
        )}
        {activeTab === 'suggestions' && (
          <ConsistencyPanel
            availableTokens={availableTokens}
            onSelectNode={onSelectNode}
            onCreateToken={handleOpenConsistencyCreate}
            resolvedMatchKeys={resolvedConsistencyMatchKeys}
            scope={heatmapScope}
          />
        )}
        {activeTab === 'components' && (
          <ComponentCoveragePanel />
        )}
      </div>

      {createDraft && (
        <CanvasCreateTokenDialog
          draft={createDraft}
          connected={connected}
          serverUrl={serverUrl}
          currentCollectionId={currentCollectionId}
          collectionIds={sets}
          onClose={() => setCreateDraft(null)}
          onCreated={handleCreateSuccess}
        />
      )}
    </div>
  );
}

function isBindablePropertyName(value: string): value is BindableProperty {
  return Object.prototype.hasOwnProperty.call(PROPERTY_LABELS, value);
}
