import { useState } from 'react';
import { HeatmapPanel } from './HeatmapPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { ComponentCoveragePanel } from './ComponentCoveragePanel';
import type { HeatmapResult, HeatmapScope } from './HeatmapPanel';
import type { BindableProperty, TokenMapEntry } from '../../shared/types';

export type { HeatmapResult, HeatmapScope };

type AuditTab = 'coverage' | 'consistency' | 'components';

interface CanvasAuditPanelProps {
  // HeatmapPanel props
  result: HeatmapResult | null;
  loading: boolean;
  progress?: { processed: number; total: number } | null;
  error?: string | null;
  scope: HeatmapScope;
  onScopeChange: (scope: HeatmapScope) => void;
  onRescan: (scope?: HeatmapScope) => void;
  onCancel?: () => void;
  onSelectNodes: (ids: string[]) => void;
  onBatchBind?: (nodeIds: string[], tokenPath: string, property: BindableProperty) => void;
  // Shared
  availableTokens: Record<string, TokenMapEntry>;
  // ConsistencyPanel props
  onSelectNode: (nodeId: string) => void;
  // Initial tab (so command palette can deep-link)
  initialTab?: AuditTab;
}

const AUDIT_TABS: { id: AuditTab; label: string }[] = [
  { id: 'coverage', label: 'Coverage' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'components', label: 'Components' },
];

export function CanvasAuditPanel({
  result,
  loading,
  progress,
  error,
  scope,
  onScopeChange,
  onRescan,
  onCancel,
  onSelectNodes,
  onBatchBind,
  availableTokens,
  onSelectNode,
  initialTab = 'coverage',
}: CanvasAuditPanelProps) {
  const [activeTab, setActiveTab] = useState<AuditTab>(initialTab);

  return (
    <div className="flex flex-col h-full">
      {/* Internal tab bar */}
      <div className="flex items-center gap-0 border-b border-[var(--color-figma-border)] shrink-0 bg-[var(--color-figma-bg-secondary)]">
        {AUDIT_TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-[10px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)]'
                : 'border-transparent text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'coverage' && (
          <HeatmapPanel
            result={result}
            loading={loading}
            progress={progress}
            error={error}
            scope={scope}
            onScopeChange={onScopeChange}
            onRescan={onRescan}
            onCancel={onCancel}
            onSelectNodes={onSelectNodes}
            onBatchBind={onBatchBind}
            availableTokens={availableTokens}
          />
        )}
        {activeTab === 'consistency' && (
          <ConsistencyPanel
            availableTokens={availableTokens}
            onSelectNode={onSelectNode}
          />
        )}
        {activeTab === 'components' && (
          <ComponentCoveragePanel />
        )}
      </div>
    </div>
  );
}
