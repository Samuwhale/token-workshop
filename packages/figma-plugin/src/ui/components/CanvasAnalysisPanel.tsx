import { useState } from 'react';
import type { TokenMapEntry, BindableProperty, ScanScope } from '../../shared/types';
import { HeatmapPanel } from './HeatmapPanel';
import type { HeatmapResult } from './HeatmapPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { ComponentCoveragePanel } from './ComponentCoveragePanel';
import { ScanScopeSelector } from './ScanScopeSelector';
import { useHeatmapContext } from '../contexts/InspectContext';

type CanvasTab = 'coverage' | 'suggestions' | 'components';

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
    setScanScope,
    triggerHeatmapScan,
    cancelHeatmapScan,
  } = useHeatmapContext();

  return (
    <div className="flex flex-col h-full">
      {/* Shared toolbar: scope selector + tab switcher */}
      <div className="flex items-center gap-0 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
        {/* Scope selector — only relevant for coverage/suggestions tabs */}
        {activeTab !== 'components' && (
          <div className="mr-3">
            <ScanScopeSelector value={heatmapScope} onChange={setScanScope} showLabel />
          </div>
        )}

        {/* Tab switcher */}
        <div className="ml-auto flex rounded overflow-hidden border border-[var(--color-figma-border)] text-[10px]">
          {([
            { id: 'coverage' as CanvasTab, label: 'Coverage' },
            { id: 'suggestions' as CanvasTab, label: 'Suggestions' },
            { id: 'components' as CanvasTab, label: 'Components' },
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

      {/* Tab content — all panels are mounted to preserve their state */}
      <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'coverage' ? '' : 'hidden'}`}>
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
        />
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'suggestions' ? '' : 'hidden'}`}>
        <ConsistencyPanel
          availableTokens={availableTokens}
          onSelectNode={onSelectNode}
          scope={heatmapScope}
        />
      </div>

      <div className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'components' ? '' : 'hidden'}`}>
        <ComponentCoveragePanel />
      </div>
    </div>
  );
}
