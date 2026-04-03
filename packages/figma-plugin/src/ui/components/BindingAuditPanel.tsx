import { HeatmapPanel, type HeatmapResult, type HeatmapScope } from './HeatmapPanel';
import type { BindableProperty, TokenMapEntry } from '../../shared/types';

interface BindingAuditPanelProps {
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
  availableTokens: Record<string, TokenMapEntry>;
  onSelectNode: (nodeId: string) => void;
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
}: BindingAuditPanelProps) {
  return (
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
  );
}
