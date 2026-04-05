import { useState, useCallback } from 'react';
import type { TokenMapEntry, BindableProperty, HeatmapScope } from '../../shared/types';
import { HeatmapPanel } from './HeatmapPanel';
import type { HeatmapResult } from './HeatmapPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { useHeatmapContext } from '../contexts/InspectContext';

type CanvasTab = 'coverage' | 'suggestions';

const SCOPE_OPTIONS: { value: HeatmapScope; label: string }[] = [
  { value: 'page', label: 'Current page' },
  { value: 'selection', label: 'Selection' },
  { value: 'all-pages', label: 'All pages' },
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
  const [activeTab, setActiveTab] = useState<CanvasTab>(initialTab);

  const {
    heatmapScope,
    setHeatmapScope,
    triggerHeatmapScan,
    cancelHeatmapScan,
  } = useHeatmapContext();

  // Shared scope change handler: update context scope (used by heatmap) and
  // automatically trigger a new heatmap scan when the user explicitly changes scope
  // while coverage results are already visible.
  const handleScopeChange = useCallback((newScope: HeatmapScope) => {
    setHeatmapScope(newScope);
  }, [setHeatmapScope]);

  return (
    <div className="flex flex-col h-full">
      {/* Shared toolbar: scope selector + tab switcher */}
      <div className="flex items-center gap-0 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
        {/* Scope selector */}
        <div className="flex items-center gap-1.5 mr-3">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Scope:</span>
          <select
            value={heatmapScope}
            onChange={e => handleScopeChange(e.target.value as HeatmapScope)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus:focus-visible:border-[var(--color-figma-accent)]"
            aria-label="Scan scope"
          >
            {SCOPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Tab switcher */}
        <div className="ml-auto flex rounded overflow-hidden border border-[var(--color-figma-border)] text-[10px]">
          {([
            { id: 'coverage' as CanvasTab, label: 'Coverage' },
            { id: 'suggestions' as CanvasTab, label: 'Suggestions' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
              aria-pressed={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — both panels are mounted to preserve their state */}
      <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'coverage' ? '' : 'hidden'}`}>
        <HeatmapPanel
          result={heatmapResult}
          loading={heatmapLoading}
          progress={heatmapProgress}
          error={heatmapError}
          scope={heatmapScope}
          onScopeChange={setHeatmapScope}
          onRescan={triggerHeatmapScan}
          onCancel={cancelHeatmapScan}
          onSelectNodes={onSelectNodes}
          onBatchBind={onBatchBind}
          availableTokens={availableTokens}
          hideScopeSelector
        />
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'suggestions' ? '' : 'hidden'}`}>
        <ConsistencyPanel
          availableTokens={availableTokens}
          onSelectNode={onSelectNode}
          scope={heatmapScope as 'selection' | 'page' | 'all-pages'}
          onScopeChange={handleScopeChange}
        />
      </div>
    </div>
  );
}
