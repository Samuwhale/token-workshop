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

type CanvasTab = 'coverage' | 'suggestions' | 'components';

const CLEANUP_SECTIONS: Array<{
  id: CanvasTab;
  label: string;
  panelHeightClassName: string;
}> = [
  {
    id: 'coverage',
    label: 'Coverage',
    panelHeightClassName: 'h-[420px]',
  },
  {
    id: 'suggestions',
    label: 'Suggestions',
    panelHeightClassName: 'h-[400px]',
  },
  {
    id: 'components',
    label: 'Components',
    panelHeightClassName: 'h-[360px]',
  },
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
  const coverageSectionRef = useRef<HTMLDivElement>(null);
  const suggestionsSectionRef = useRef<HTMLDivElement>(null);
  const componentsSectionRef = useRef<HTMLDivElement>(null);

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

  const scrollToSection = useCallback((section: CanvasTab) => {
    if (section === 'coverage') {
      coverageSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (section === 'suggestions') {
      suggestionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    componentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (initialTab === 'coverage') {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      scrollToSection(initialTab);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialTab, scrollToSection]);

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
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0 bg-[var(--color-figma-bg)] flex items-center gap-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {CLEANUP_SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className="px-2.5 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              {section.label}
            </button>
          ))}
        </div>
        <div className="shrink-0">
          <ScanScopeSelector value={heatmapScope} onChange={setHeatmapScope} showLabel />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'thin' }}>
        <div className="flex flex-col gap-3">
          {CLEANUP_SECTIONS.map(section => (
            <section
              key={section.id}
              ref={
                section.id === 'coverage'
                  ? coverageSectionRef
                  : section.id === 'suggestions'
                    ? suggestionsSectionRef
                    : componentsSectionRef
              }
              className="rounded-xl border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                <h3 className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                  {section.label}
                </h3>
              </div>

              <div className={`${section.panelHeightClassName} overflow-hidden`}>
                {section.id === 'coverage' && (
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
                {section.id === 'suggestions' && (
                  <ConsistencyPanel
                    availableTokens={availableTokens}
                    onSelectNode={onSelectNode}
                    onCreateToken={handleOpenConsistencyCreate}
                    resolvedMatchKeys={resolvedConsistencyMatchKeys}
                    scope={heatmapScope}
                  />
                )}
                {section.id === 'components' && (
                  <ComponentCoveragePanel />
                )}
              </div>
            </section>
          ))}
        </div>
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
