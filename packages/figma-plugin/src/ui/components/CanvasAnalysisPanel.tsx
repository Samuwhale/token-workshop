import { useEffect, useRef } from 'react';
import type { TokenMapEntry, BindableProperty } from '../../shared/types';
import { HeatmapPanel } from './HeatmapPanel';
import type { HeatmapResult } from './HeatmapPanel';
import { ConsistencyPanel } from './ConsistencyPanel';
import { ComponentCoveragePanel } from './ComponentCoveragePanel';
import { ScanScopeSelector } from './ScanScopeSelector';
import { useHeatmapContext } from '../contexts/InspectContext';

type CanvasTab = 'coverage' | 'suggestions' | 'components';

const CLEANUP_SECTIONS: Array<{
  id: CanvasTab;
  step: string;
  label: string;
  title: string;
  description: string;
  panelHeightClassName: string;
}> = [
  {
    id: 'coverage',
    step: 'Step 1',
    label: 'Scan coverage',
    title: 'Scan the canvas and inspect untokenized layers',
    description: 'Run the heatmap first to find red and yellow layers, select the affected nodes, and quick-bind tokens before you review deeper cleanup work.',
    panelHeightClassName: 'h-[420px]',
  },
  {
    id: 'suggestions',
    step: 'Step 2',
    label: 'Review suggestions',
    title: 'Snap near-matches to the right tokens',
    description: 'Use token suggestions to convert hardcoded colors, spacing, and typography values without leaving the cleanup flow.',
    panelHeightClassName: 'h-[400px]',
  },
  {
    id: 'components',
    step: 'Step 3',
    label: 'Fix components',
    title: 'Clean up untokenized components',
    description: 'Check which components still rely on hardcoded values so you can select them in Figma and finish the remaining tokenization work.',
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
  const sectionRefs = {
    coverage: coverageSectionRef,
    suggestions: suggestionsSectionRef,
    components: componentsSectionRef,
  };

  const {
    heatmapScope,
    setHeatmapScope,
    triggerHeatmapScan,
    cancelHeatmapScan,
  } = useHeatmapContext();

  const scrollToSection = (section: CanvasTab) => {
    sectionRefs[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (initialTab === 'coverage') {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      scrollToSection(initialTab);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialTab]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-[var(--color-figma-border)] shrink-0 bg-[var(--color-figma-bg)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
              Canvas cleanup
            </p>
            <h2 className="mt-1 text-[13px] font-semibold text-[var(--color-figma-text)]">
              Scan, inspect, suggest, and fix in one pass
            </h2>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Start with coverage to find problem layers, move into token suggestions for fast fixes, then finish with untokenized components that still need manual cleanup.
            </p>
          </div>
          <div className="shrink-0">
            <ScanScopeSelector value={heatmapScope} onChange={setHeatmapScope} showLabel />
            <p className="mt-1 text-right text-[9px] text-[var(--color-figma-text-tertiary)]">
              Scope applies to coverage and suggestions.
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0 bg-[var(--color-figma-bg-secondary)]">
        <div className="flex flex-wrap gap-1.5">
          {CLEANUP_SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className="px-2.5 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              {section.step} · {section.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: 'thin' }}>
        <div className="flex flex-col gap-4">
          {CLEANUP_SECTIONS.map(section => (
            <section
              key={section.id}
              ref={sectionRefs[section.id]}
              className="rounded-xl border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--color-figma-bg-secondary)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                    {section.step}
                  </span>
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    {section.label}
                  </span>
                </div>
                <h3 className="mt-2 text-[12px] font-semibold text-[var(--color-figma-text)]">
                  {section.title}
                </h3>
                <p className="mt-1 max-w-[520px] text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                  {section.description}
                </p>
              </div>

              <div className={`${section.panelHeightClassName} min-h-[320px] overflow-hidden`}>
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
                  />
                )}
                {section.id === 'suggestions' && (
                  <ConsistencyPanel
                    availableTokens={availableTokens}
                    onSelectNode={onSelectNode}
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
    </div>
  );
}
