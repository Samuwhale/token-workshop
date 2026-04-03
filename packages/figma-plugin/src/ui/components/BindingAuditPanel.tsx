import { useState } from 'react';
import { HeatmapPanel, type HeatmapResult, type HeatmapScope } from './HeatmapPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import type { BindableProperty, TokenMapEntry } from '../../shared/types';

type AuditView = 'coverage' | 'suggestions';

interface BindingAuditPanelProps {
  // HeatmapPanel props
  heatmapResult: HeatmapResult | null;
  heatmapLoading: boolean;
  heatmapProgress?: { processed: number; total: number } | null;
  heatmapError?: string | null;
  heatmapScope: HeatmapScope;
  onScopeChange: (scope: HeatmapScope) => void;
  onRescan: (scope?: HeatmapScope) => void;
  onCancel?: () => void;
  onSelectNodes: (ids: string[]) => void;
  onBatchBind?: (nodeIds: string[], tokenPath: string, property: BindableProperty) => void;
  // ConsistencyPanel props
  availableTokens: Record<string, TokenMapEntry>;
  onSelectNode: (nodeId: string) => void;
  // Initial view
  initialView?: AuditView;
}

export function BindingAuditPanel({
  heatmapResult,
  heatmapLoading,
  heatmapProgress,
  heatmapError,
  heatmapScope,
  onScopeChange,
  onRescan,
  onCancel,
  onSelectNodes,
  onBatchBind,
  availableTokens,
  onSelectNode,
  initialView = 'coverage',
}: BindingAuditPanelProps) {
  const [view, setView] = useState<AuditView>(initialView);

  return (
    <div className="flex flex-col h-full">
      {/* Internal view toggle */}
      <div className="flex shrink-0 border-b border-[var(--color-figma-border)] px-3 pt-2 gap-3">
        <button
          onClick={() => setView('coverage')}
          className={`pb-1.5 text-[11px] font-medium border-b-2 transition-colors ${
            view === 'coverage'
              ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-text)]'
              : 'border-transparent text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
          }`}
        >
          Coverage
        </button>
        <button
          onClick={() => setView('suggestions')}
          className={`pb-1.5 text-[11px] font-medium border-b-2 transition-colors ${
            view === 'suggestions'
              ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-text)]'
              : 'border-transparent text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
          }`}
        >
          Suggestions
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {view === 'coverage' ? (
          <HeatmapPanel
            result={heatmapResult}
            loading={heatmapLoading}
            progress={heatmapProgress}
            error={heatmapError}
            scope={heatmapScope}
            onScopeChange={onScopeChange}
            onRescan={onRescan}
            onCancel={onCancel}
            onSelectNodes={onSelectNodes}
            availableTokens={availableTokens}
            onBatchBind={onBatchBind}
          />
        ) : (
          <ConsistencyPanel
            availableTokens={availableTokens}
            onSelectNode={onSelectNode}
          />
        )}
      </div>
    </div>
  );
}
