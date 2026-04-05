import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TokenGenerator, GeneratorTemplate, GeneratorType } from '../hooks/useGenerators';
import type { UndoSlot } from '../hooks/useUndo';
import type { TokenMapEntry } from '../../shared/types';
import { NodeGraphCanvas } from './nodeGraph/NodeGraphCanvas';
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from './PanelHelpHint';
import { apiFetch } from '../shared/apiFetch';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';
import { GRAPH_TEMPLATES, templateIdForTokenType } from './graph-templates';
import type { GraphTemplate } from './graph-templates';
import { TemplatePicker } from './TemplatePicker';
import { GeneratorPipelineCard, getGeneratorTypeLabel } from './GeneratorPipelineCard';
import { Spinner } from './Spinner';
import { SkeletonGeneratorCard } from './Skeleton';

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

function exportGraphAsSVG(generators: TokenGenerator[], activeSet: string): void {
  const boxW = 130;
  const boxH = 28;
  const boxR = 5;
  const arrowW = 28;
  const padX = 20;
  const padY = 20;
  const titleH = 32;
  const rowGap = 10;
  const svgW = padX * 2 + boxW * 3 + arrowW * 2;
  const svgH = padY + titleH + generators.length * (boxH + rowGap) - (generators.length > 0 ? rowGap : 0) + padY;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '\u2026' : s);

  const box = (bx: number, by: number, label: string, accent = false) =>
    `<rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="${accent ? '#eff6ff' : '#f9fafb'}" stroke="${accent ? '#93c5fd' : '#e5e7eb'}" stroke-width="1"/>` +
    `<text x="${bx + boxW / 2}" y="${by + boxH / 2 + 4}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" fill="${accent ? '#1d4ed8' : '#374151'}">${esc(trunc(label, 18))}</text>`;

  const arrow = (ax: number, ay: number) =>
    `<line x1="${ax}" y1="${ay}" x2="${ax + arrowW - 5}" y2="${ay}" stroke="#9ca3af" stroke-width="1.5"/>` +
    `<polygon points="${ax + arrowW - 5},${ay - 3} ${ax + arrowW},${ay} ${ax + arrowW - 5},${ay + 3}" fill="#9ca3af"/>`;

  let rows = '';
  generators.forEach((gen, i) => {
    const y = padY + titleH + i * (boxH + rowGap);
    const mid = y + boxH / 2;
    const bx1 = padX;
    const bx2 = padX + boxW + arrowW;
    const bx3 = padX + boxW * 2 + arrowW * 2;
    const sourceLabel = gen.sourceToken || 'standalone';
    const genLabel = trunc(gen.name || getGeneratorTypeLabel(gen.type), 18);
    const targetLabel = `${gen.targetGroup}.*`;
    rows += box(bx1, y, sourceLabel) + arrow(bx1 + boxW, mid) + box(bx2, y, genLabel, true) + arrow(bx2 + boxW, mid) + box(bx3, y, targetLabel);
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    `<rect width="${svgW}" height="${svgH}" fill="white"/>`,
    `<text x="${padX}" y="${padY + 18}" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#111827">${esc(activeSet)} \u2014 Generator graph</text>`,
    rows,
    '</svg>',
  ].join('\n');

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${activeSet}-graph.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface GraphPanelProps {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  generators: TokenGenerator[];
  loading?: boolean;
  connected: boolean;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onApplyTemplate?: (templateId: string) => void;
  pendingTemplateId?: string | null;
  pendingGroupPath?: string | null;
  pendingGroupTokenType?: string | null;
  onClearPendingGroup?: () => void;
  focusGeneratorId?: string | null;
  onClearFocusGenerator?: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  /** When true, automatically opens the template picker on mount (used when navigating from ThemeManager). */
  openTemplatePicker?: boolean;
}

export function GraphPanel({
  serverUrl,
  activeSet,
  allSets,
  generators,
  loading = false,
  connected,
  onRefresh,
  onPushUndo,
  onApplyTemplate,
  pendingTemplateId,
  pendingGroupPath,
  pendingGroupTokenType,
  onClearPendingGroup,
  focusGeneratorId,
  onClearFocusGenerator,
  allTokensFlat,
  openTemplatePicker,
}: GraphPanelProps) {
  const help = usePanelHelp('generators');
  const setGenerators = generators.filter(g => g.targetSet === activeSet);
  const focusRef = useRef<HTMLDivElement>(null);

  const initialTemplate = pendingGroupPath
    ? (GRAPH_TEMPLATES.find(t => t.id === templateIdForTokenType(pendingGroupTokenType)) ?? GRAPH_TEMPLATES[0] ?? null)
    : pendingTemplateId
      ? (GRAPH_TEMPLATES.find(t => t.id === pendingTemplateId) ?? null)
      : null;

  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(initialTemplate);
  const [browsingTemplates, setBrowsingTemplates] = useState(false);
  const [justApplied, setJustApplied] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<GeneratorType | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [highlightedGeneratorId, setHighlightedGeneratorId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [runAllResult, setRunAllResult] = useState<{ count: number; tokenCount: number } | null>(null);
  const [runAllError, setRunAllError] = useState<string | null>(null);
  const [runningStale, setRunningStale] = useState(false);
  const [runStaleResult, setRunStaleResult] = useState<{ count: number; tokenCount: number } | null>(null);
  const [runStaleError, setRunStaleError] = useState<string | null>(null);

  // Auto-dismiss run result toasts
  useEffect(() => {
    if (!runAllResult) return;
    const t = setTimeout(() => setRunAllResult(null), 4000);
    return () => clearTimeout(t);
  }, [runAllResult]);
  useEffect(() => {
    if (!runAllError) return;
    const t = setTimeout(() => setRunAllError(null), 8000);
    return () => clearTimeout(t);
  }, [runAllError]);
  useEffect(() => {
    if (!runStaleResult) return;
    const t = setTimeout(() => setRunStaleResult(null), 4000);
    return () => clearTimeout(t);
  }, [runStaleResult]);
  useEffect(() => {
    if (!runStaleError) return;
    const t = setTimeout(() => setRunStaleError(null), 8000);
    return () => clearTimeout(t);
  }, [runStaleError]);

  // Auto-open template picker when navigating from ThemeManager "Generate tokens" action
  useEffect(() => {
    if (!openTemplatePicker) return;
    setBrowsingTemplates(true);
    setSelectedTemplate(null);
    onClearPendingGroup?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTemplatePicker]);

  // Scroll to and highlight a focused generator (from token badge click)
  useEffect(() => {
    if (!focusGeneratorId) return;
    setHighlightedGeneratorId(focusGeneratorId);
    setViewMode('list'); // list view supports scroll-to-card
    onClearFocusGenerator?.();
    // Scroll after render
    requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Clear highlight after 2s
    const timer = setTimeout(() => setHighlightedGeneratorId(null), 2000);
    return () => clearTimeout(timer);
  }, [focusGeneratorId, onClearFocusGenerator]);

  const handleSelectTemplate = (template: GraphTemplate) => {
    setSelectedTemplate(template);
    setJustApplied(null);
  };

  const handleApplied = useCallback(() => {
    setJustApplied(selectedTemplate?.label ?? null);
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    if (onApplyTemplate) onApplyTemplate('');
    if (onClearPendingGroup) onClearPendingGroup();
    onRefresh();
  }, [selectedTemplate, onApplyTemplate, onClearPendingGroup, onRefresh]);

  const handleBack = () => {
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    setSearchQuery('');
    if (onApplyTemplate) onApplyTemplate('');
    if (onClearPendingGroup) onClearPendingGroup();
  };

  const handleRunAll = async () => {
    setRunningAll(true);
    setRunAllResult(null);
    setRunAllError(null);
    let successCount = 0;
    let totalTokens = 0;
    const errors: string[] = [];
    for (const gen of setGenerators) {
      try {
        const res = await apiFetch<{ count: number }>(`${serverUrl}/api/generators/${gen.id}/run`, { method: 'POST' });
        successCount++;
        totalTokens += res.count ?? 0;
      } catch {
        errors.push(gen.name);
      }
    }
    setRunningAll(false);
    if (errors.length === 0) {
      setRunAllResult({ count: successCount, tokenCount: totalTokens });
    } else {
      setRunAllError(`${errors.length} generator${errors.length !== 1 ? 's' : ''} failed: ${errors.join(', ')}`);
    }
    onRefresh();
  };

  const staleGenerators = setGenerators.filter(g => g.isStale);

  // Unique source token paths for all stale generators (for tooltip + info strip)
  const staleSourceTokens = useMemo(() => {
    const tokens = new Set<string>();
    for (const g of staleGenerators) {
      if (g.sourceToken) tokens.add(g.sourceToken);
    }
    return Array.from(tokens);
  }, [staleGenerators]);

  const handleRunStale = async () => {
    setRunningStale(true);
    setRunStaleResult(null);
    setRunStaleError(null);
    let successCount = 0;
    let totalTokens = 0;
    const errors: string[] = [];
    for (const gen of staleGenerators) {
      try {
        const res = await apiFetch<{ count: number }>(`${serverUrl}/api/generators/${gen.id}/run`, { method: 'POST' });
        successCount++;
        totalTokens += res.count ?? 0;
      } catch {
        errors.push(gen.name);
      }
    }
    setRunningStale(false);
    if (errors.length === 0) {
      setRunStaleResult({ count: successCount, tokenCount: totalTokens });
    } else {
      setRunStaleError(`${errors.length} generator${errors.length !== 1 ? 's' : ''} failed: ${errors.join(', ')}`);
    }
    onRefresh();
  };

  // Memoize template object so TokenGeneratorDialog receives a stable prop reference.
  const generatorTemplate = useMemo<GeneratorTemplate | undefined>(() => {
    if (!selectedTemplate) return undefined;
    return {
      id: selectedTemplate.id,
      label: selectedTemplate.label,
      description: selectedTemplate.description,
      defaultPrefix: selectedTemplate.defaultPrefix,
      generatorType: selectedTemplate.generatorType,
      config: selectedTemplate.config,
      requiresSource: selectedTemplate.requiresSource,
    };
  }, [selectedTemplate]);

  // Stable callback — must be at hook scope, not inside the conditional render branch.
  const handleTemplateSaved = useCallback(async (info?: { targetGroup: string }) => {
    if (!selectedTemplate) return;
    const targetGroup = info?.targetGroup ?? selectedTemplate.defaultPrefix;
    for (const layer of selectedTemplate.semanticLayers) {
      for (const mapping of layer.mappings) {
        const fullPath = `${layer.prefix}.${mapping.semantic}`;
        const tokenBody = {
          $type: mapping.type,
          $value: `{${targetGroup}.${mapping.step}}`,
          $description: `Semantic alias for ${targetGroup}.${mapping.step}`,
        };
        try {
          await apiFetch(
            `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${fullPath}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tokenBody) },
          );
        } catch (postErr: any) {
          if (postErr?.status !== 409) {
            try {
              await apiFetch(
                `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${fullPath}`,
                { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tokenBody) },
              );
            } catch {
              // best-effort — skip conflicts silently
            }
          }
        }
      }
    }
    handleApplied();
  }, [selectedTemplate, serverUrl, activeSet, handleApplied]);

  const q = searchQuery.trim().toLowerCase();
  const filteredGenerators = setGenerators.filter(g => {
    if (typeFilter && g.type !== typeFilter) return false;
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.sourceToken ?? '').toLowerCase().includes(q) ||
      g.targetGroup.toLowerCase().includes(q) ||
      getGeneratorTypeLabel(g.type).toLowerCase().includes(q)
    );
  });

  // Types present in the current set — used for filter pills
  const presentTypes = useMemo<GeneratorType[]>(() => {
    const seen = new Set<GeneratorType>();
    for (const g of setGenerators) seen.add(g.type);
    return Array.from(seen).sort((a, b) =>
      getGeneratorTypeLabel(a).localeCompare(getGeneratorTypeLabel(b)),
    );
  }, [setGenerators]);
  const filteredTemplates = q
    ? GRAPH_TEMPLATES.filter(t =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.whenToUse.toLowerCase().includes(q) ||
        t.generatorType.toLowerCase().includes(q),
      )
    : GRAPH_TEMPLATES;

  // Template configuration — open full TokenGeneratorDialog pre-filled from template.
  // generatorTemplate and handleTemplateSaved are memoized at hook scope above.
  if (selectedTemplate) {
    return (
      <TokenGeneratorDialog
        serverUrl={serverUrl}
        allSets={allSets}
        activeSet={activeSet}
        template={generatorTemplate}
        sourceTokenPath={pendingGroupPath ?? undefined}
        sourceTokenType={pendingGroupTokenType ?? undefined}
        onBack={handleBack}
        onClose={handleBack}
        onSaved={handleTemplateSaved}
        onInterceptSemanticMapping={() => {}}
        onPushUndo={onPushUndo}
      />
    );
  }

  // Pipeline view — generators exist (and not browsing templates)
  if (setGenerators.length > 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-3 py-2.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div>
              <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Graph</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {(q || typeFilter)
                ? <>{filteredGenerators.length} of {setGenerators.length} generator{setGenerators.length !== 1 ? 's' : ''}</>
                : <>{setGenerators.length} generator{setGenerators.length !== 1 ? 's' : ''} in <span className="font-mono">{activeSet}</span></>
              }
              </div>
            </div>
            <PanelHelpIcon panelKey="generators" title="Generators" expanded={help.expanded} onToggle={help.toggle} />
          </div>
          <div className="flex items-center gap-1.5">
            {/* View mode toggle */}
            <div className="flex items-center rounded border border-[var(--color-figma-border)] overflow-hidden">
              <button
                onClick={() => setViewMode('graph')}
                className={`p-1 transition-colors ${viewMode === 'graph' ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'}`}
                title="Node graph view"
                aria-label="Node graph view"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="14" width="6" height="6" rx="1" />
                  <rect x="16" y="4" width="6" height="6" rx="1" />
                  <rect x="16" y="14" width="6" height="6" rx="1" />
                  <path d="M8 17h2a2 2 0 002-2V9a2 2 0 012-2h2" />
                  <path d="M12 17h4" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1 transition-colors ${viewMode === 'list' ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'}`}
                title="List view"
                aria-label="List view"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => exportGraphAsSVG(setGenerators, activeSet)}
              className="p-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title="Export graph as SVG"
              aria-label="Export graph as SVG"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            {staleGenerators.length > 0 && (
              <button
                onClick={handleRunStale}
                disabled={!connected || runningStale || runningAll}
                className="text-[10px] px-2 py-1 rounded border border-yellow-400/60 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-400/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                title={`Re-run ${staleGenerators.length} stale generator${staleGenerators.length !== 1 ? 's' : ''} — generated tokens are out of date because ${staleSourceTokens.length > 0 ? `${staleSourceTokens.length === 1 ? 'this source token has' : 'these source tokens have'} changed: ${staleSourceTokens.join(', ')}` : 'source tokens changed since last run'}`}
              >
                {runningStale
                  ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden="true">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      Running…
                    </>
                  )
                  : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 9v4M12 17h.01" />
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      Re-run stale ({staleGenerators.length})
                    </>
                  )
                }
              </button>
            )}
            <button
              onClick={handleRunAll}
              disabled={!connected || runningAll || runningStale}
              className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              title={`Re-run all ${setGenerators.length} generator${setGenerators.length !== 1 ? 's' : ''} in this set`}
            >
              {runningAll
                ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden="true">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Running…
                  </>
                )
                : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Run all
                  </>
                )
              }
            </button>
            <button
              onClick={() => setBrowsingTemplates(true)}
              disabled={!connected}
              className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Add another template"
            >
              + Template
            </button>
          </div>
        </div>
        {help.expanded && (
          <PanelHelpBanner
            title="Generators"
            description="Turn a single source token into a whole token group automatically — color ramps, spacing scales, type scales, and more. Pick a template to get started, then customize the parameters."
            onDismiss={help.dismiss}
          />
        )}

        {staleGenerators.length > 0 && (
          <div className="mx-3 mt-2 px-2.5 py-2 rounded bg-yellow-400/10 border border-yellow-400/30 text-[10px] text-yellow-700 dark:text-yellow-400 flex items-start gap-1.5 shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              {staleGenerators.length === 1 ? '1 generator is' : `${staleGenerators.length} generators are`} out of date —{' '}
              {staleSourceTokens.length > 0
                ? <><strong>{staleSourceTokens.join(', ')}</strong> {staleSourceTokens.length === 1 ? 'has' : 'have'} changed since last run</>
                : <>source tokens changed since last run</>
              }. Use <strong>Re-run stale</strong> to refresh.
            </span>
          </div>
        )}

        {justApplied && (
          <div className="mx-3 mt-2 px-2.5 py-2 rounded bg-[var(--color-figma-success,#22c55e)]/10 border border-[var(--color-figma-success,#22c55e)]/20 text-[10px] text-[var(--color-figma-success,#16a34a)] flex items-center gap-1.5 shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span><strong>{justApplied}</strong> applied — tokens are generating</span>
          </div>
        )}

        {runAllResult && (
          <div className="mx-3 mt-2 px-2.5 py-2 rounded bg-[var(--color-figma-success,#22c55e)]/10 border border-[var(--color-figma-success,#22c55e)]/20 text-[10px] text-[var(--color-figma-success,#16a34a)] flex items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>
                Ran {runAllResult.count} generator{runAllResult.count !== 1 ? 's' : ''}
                {runAllResult.tokenCount > 0 && <> — {runAllResult.tokenCount} token{runAllResult.tokenCount !== 1 ? 's' : ''} updated</>}
              </span>
            </div>
            <button onClick={() => setRunAllResult(null)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {runAllError && (
          <div className="mx-3 mt-2 px-2.5 py-2 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-600 dark:text-red-400 flex items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              <span>{runAllError}</span>
            </div>
            <button onClick={() => setRunAllError(null)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {runStaleResult && (
          <div className="mx-3 mt-2 px-2.5 py-2 rounded bg-yellow-400/10 border border-yellow-400/30 text-[10px] text-yellow-700 dark:text-yellow-400 flex items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>
                Re-ran {runStaleResult.count} stale generator{runStaleResult.count !== 1 ? 's' : ''}
                {runStaleResult.tokenCount > 0 && <> — {runStaleResult.tokenCount} token{runStaleResult.tokenCount !== 1 ? 's' : ''} updated</>}
              </span>
            </div>
            <button onClick={() => setRunStaleResult(null)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {runStaleError && (
          <div className="mx-3 mt-2 px-2.5 py-2 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-600 dark:text-red-400 flex items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              <span>{runStaleError}</span>
            </div>
            <button onClick={() => setRunStaleError(null)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Search bar (shown in both views) */}
        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <div className="relative">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={viewMode === 'graph' ? 'Search generators — highlights and zooms to matches…' : 'Search generators…'}
              aria-label="Search generators"
              className="w-full pl-6 pr-6 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
                aria-label="Clear search"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Type filter pills — shown only when multiple types exist */}
        {presentTypes.length > 1 && (
          <div className="px-3 pb-2 shrink-0 flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setTypeFilter(null)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${typeFilter === null ? 'bg-[var(--color-figma-accent)]/10 border-[var(--color-figma-accent)]/40 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              aria-pressed={typeFilter === null}
            >
              All
            </button>
            {presentTypes.map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${typeFilter === type ? 'bg-[var(--color-figma-accent)]/10 border-[var(--color-figma-accent)]/40 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                aria-pressed={typeFilter === type}
              >
                {getGeneratorTypeLabel(type)}
              </button>
            ))}
          </div>
        )}

        {/* Node graph view */}
        {viewMode === 'graph' && (
          <NodeGraphCanvas
            generators={filteredGenerators}
            activeSet={activeSet}
            serverUrl={serverUrl}
            onRefresh={onRefresh}
            onPushUndo={onPushUndo}
            searchQuery={searchQuery}
          />
        )}

        {/* List view */}
        {viewMode === 'list' && (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {filteredGenerators.length > 0
              ? filteredGenerators.map(gen => (
                  <GeneratorPipelineCard key={gen.id} generator={gen} isFocused={gen.id === highlightedGeneratorId} focusRef={focusRef} serverUrl={serverUrl} allSets={allSets} activeSet={activeSet} onRefresh={onRefresh} allTokensFlat={allTokensFlat} onPushUndo={onPushUndo} />
                ))
              : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-[11px] text-[var(--color-figma-text-secondary)] mb-1">No generators match</p>
                  <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                    Try a different search term
                  </p>
                </div>
              )
            }
          </div>
        )}
      </div>
    );
  }

  // Loading state — generators haven't loaded yet
  if (loading && setGenerators.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-3 overflow-y-auto" aria-label="Loading generators…" aria-busy="true">
        <SkeletonGeneratorCard />
        <SkeletonGeneratorCard />
        <SkeletonGeneratorCard />
      </div>
    );
  }

  // True empty state — no generators exist and not browsing templates
  if (setGenerators.length === 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          {/* Icon */}
          <div className="mb-4 w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <circle cx="5" cy="12" r="3" />
              <path d="M8 12h3" />
              <rect x="11" y="9" width="6" height="6" rx="1" />
              <path d="M17 12h3" />
              <circle cx="22" cy="12" r="1" />
            </svg>
          </div>

          <div className="flex flex-col gap-1 mb-4">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">No generators yet</p>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
              Generators turn a source token into a whole token group — color scales, spacing scales, type scales, contrast pairs, and semantic aliases.
            </p>
          </div>

          {/* What generators produce */}
          <div className="w-full mb-5 grid grid-cols-2 gap-1.5">
            {[
              { label: 'Color scales', icon: <><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,80%)' }} /><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,55%)' }} /><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,30%)' }} /></> },
              { label: 'Spacing scales', icon: <><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '4px', opacity: 0.5 }} /><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '8px', opacity: 0.7 }} /><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '14px' }} /></> },
              { label: 'Type scales', icon: <div className="flex items-baseline gap-0.5"><span className="text-[7px] font-medium text-[var(--color-figma-text-secondary)]">A</span><span className="text-[10px] font-medium text-[var(--color-figma-text)]">A</span><span className="text-[11px] font-medium text-[var(--color-figma-accent)]">A</span></div> },
              { label: 'Semantic aliases', icon: <><span className="text-[8px] font-mono text-[var(--color-figma-accent)]">500</span><svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)]"><path d="M2 1l4 3-4 3V1z" /></svg><span className="text-[8px] font-mono text-[var(--color-figma-text-secondary)]">btn</span></> },
            ].map(({ label, icon }) => (
              <div key={label} className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                <div className="flex items-center gap-0.5 w-8 justify-center shrink-0">{icon}</div>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setBrowsingTemplates(true)}
            disabled={!connected}
            className="px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add your first generator
          </button>

          {!connected && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-2">
              Connect to the server first
            </p>
          )}
        </div>
      </div>
    );
  }

  // Template browsing — no generators yet or user clicked "+ Template"
  return (
    <TemplatePicker
      templates={filteredTemplates}
      connected={connected}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelectTemplate={handleSelectTemplate}
      browsingTemplates={browsingTemplates}
      onBack={handleBack}
      activeSet={activeSet}
      justApplied={justApplied}
    />
  );
}
