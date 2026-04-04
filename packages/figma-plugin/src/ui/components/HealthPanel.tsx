import { useState } from 'react';
import type { LintViolation } from '../hooks/useLint';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { HeatmapResult } from './HeatmapPanel';
import type { TokenMapEntry } from '../../shared/types';
import type { ValidationIssue, ValidationSummary } from '../hooks/useValidationCache';

type HealthStatus = 'healthy' | 'warning' | 'critical';

interface HealthSectionProps {
  title: string;
  status: HealthStatus | null;
  count: number;
  detail: string;
  children?: React.ReactNode;
  ctaLabel: string;
  onCta: () => void;
}

function statusColor(status: HealthStatus | null): string {
  if (status === 'critical') return 'text-[var(--color-figma-error)]';
  if (status === 'warning') return 'text-amber-500';
  return 'text-[var(--color-figma-success,#18a058)]';
}

function statusBg(status: HealthStatus | null): string {
  if (status === 'critical') return 'bg-[var(--color-figma-error)]/10 border-[var(--color-figma-error)]/20';
  if (status === 'warning') return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-emerald-500/10 border-emerald-500/20';
}

function statusDot(status: HealthStatus | null): string {
  if (status === 'critical') return 'bg-[var(--color-figma-error)]';
  if (status === 'warning') return 'bg-amber-500';
  return 'bg-emerald-500';
}

function StatusIcon({ status }: { status: HealthStatus | null }) {
  if (status === 'critical') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/>
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  );
}

function HealthSection({ title, status, count, detail, children, ctaLabel, onCta }: HealthSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = !!children;
  return (
    <div className={`rounded border ${statusBg(status)} mb-2`}>
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className={`mt-0.5 shrink-0 ${statusColor(status)}`}>
          <StatusIcon status={status} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">{title}</span>
            {count > 0 && (
              <span className={`text-[10px] font-bold tabular-nums ${statusColor(status)}`}>{count}</span>
            )}
          </div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">{detail}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasChildren && count > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                <path d="M2 1l4 3-4 3V1z"/>
              </svg>
            </button>
          )}
          <button
            onClick={onCta}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] transition-colors whitespace-nowrap"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
      {hasChildren && expanded && count > 0 && (
        <div className="px-3 pb-2.5 border-t border-[var(--color-figma-border)]/50">
          <div className="mt-2">{children}</div>
        </div>
      )}
    </div>
  );
}

export interface HealthPanelProps {
  serverUrl: string;
  connected: boolean;
  generators: TokenGenerator[];
  lintViolations: LintViolation[];
  allTokensFlat: Record<string, TokenMapEntry>;
  tokenUsageCounts: Record<string, number>;
  heatmapResult: HeatmapResult | null;
  onNavigateTo: (topTab: 'define' | 'apply' | 'ship', subTab?: string) => void;
  onTriggerHeatmap: () => void;
  /** Shared validation cache — avoids re-fetching when switching from Analytics tab */
  validationIssues: ValidationIssue[] | null;
  validationSummary: ValidationSummary | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  onRefreshValidation: () => void;
}

export function HealthPanel({
  connected,
  generators,
  lintViolations,
  allTokensFlat,
  tokenUsageCounts,
  heatmapResult,
  onNavigateTo,
  onTriggerHeatmap,
  validationIssues: validationIssuesProp,
  validationSummary,
  validationLoading,
  validationError,
  validationLastRefreshed,
  onRefreshValidation,
}: HealthPanelProps) {
  const validationIssues = validationIssuesProp ?? [];
  const validating = validationLoading;
  const lastRefreshed = validationLastRefreshed;
  const runValidation = onRefreshValidation;

  // ── Derived metrics ──────────────────────────────────────────────────────
  const lintErrors = lintViolations.filter(v => v.severity === 'error').length;
  const lintWarnings = lintViolations.filter(v => v.severity === 'warning').length;

  const validationErrors = validationSummary?.errors ?? 0;
  const validationWarnings = validationSummary?.warnings ?? 0;

  const brokenAliases = validationIssues.filter(i => i.rule === 'broken-alias');
  const circularRefs = validationIssues.filter(i => i.rule === 'circular-reference');
  const criticalValidation = brokenAliases.length + circularRefs.length;

  const staleGenerators = generators.filter(g => g.isStale);
  const errorGenerators = generators.filter(g => g.lastRunError && !g.lastRunError.blockedBy);
  const blockedGenerators = generators.filter(g => g.lastRunError?.blockedBy);

  const totalTokens = Object.keys(allTokensFlat).length;
  const hasUsageData = Object.keys(tokenUsageCounts).length > 0;
  const unusedTokens = hasUsageData
    ? Object.keys(allTokensFlat).filter(path => !tokenUsageCounts[path]).length
    : 0;

  // ── Overall health ────────────────────────────────────────────────────────
  const overallStatus: HealthStatus =
    lintErrors > 0 || validationErrors > 0 || errorGenerators.length > 0 ? 'critical'
    : lintWarnings > 0 || validationWarnings > 0 || staleGenerators.length > 0 ? 'warning'
    : 'healthy';

  const totalIssues =
    lintErrors + lintWarnings + validationErrors + validationWarnings +
    staleGenerators.length + errorGenerators.length;

  // ── Lint section status ────────────────────────────────────────────────────
  const lintStatus: HealthStatus | null =
    lintErrors > 0 ? 'critical' : lintWarnings > 0 ? 'warning' : 'healthy';

  // ── Validation section status ─────────────────────────────────────────────
  const validationStatus: HealthStatus | null =
    validationErrors > 0 ? 'critical' : validationWarnings > 0 ? 'warning' : 'healthy';

  // ── Generator section status ──────────────────────────────────────────────
  const generatorStatus: HealthStatus | null =
    errorGenerators.length > 0 ? 'critical' : staleGenerators.length > 0 ? 'warning' : 'healthy';

  // ── Canvas section status ─────────────────────────────────────────────────
  const canvasStatus: HealthStatus | null = heatmapResult
    ? heatmapResult.red > 0 ? 'warning' : 'healthy'
    : null;

  const canvasCoveragePercent = heatmapResult && heatmapResult.total > 0
    ? Math.round((heatmapResult.green / heatmapResult.total) * 100)
    : null;

  const relativeTime = lastRefreshed
    ? (() => {
        const s = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
        if (s < 60) return 'just now';
        const m = Math.floor(s / 60);
        return `${m}m ago`;
      })()
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={`shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--color-figma-border)] ${statusBg(overallStatus)}`}>
        <span className={statusColor(overallStatus)}>
          <StatusIcon status={overallStatus} />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-bold ${statusColor(overallStatus)}`}>
            {overallStatus === 'healthy' ? 'Token health is good' : overallStatus === 'warning' ? 'Warnings detected' : 'Issues need attention'}
          </p>
          {totalIssues > 0 && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {totalIssues} issue{totalIssues !== 1 ? 's' : ''} across {
                [
                  (lintErrors + lintWarnings) > 0 && 'lint',
                  (validationErrors + validationWarnings) > 0 && 'validation',
                  (staleGenerators.length + errorGenerators.length) > 0 && 'generators',
                ].filter(Boolean).join(', ')
              }
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {relativeTime && (
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-70">
              {relativeTime}
            </span>
          )}
          <button
            onClick={runValidation}
            disabled={validating || !connected}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-40 transition-colors"
            aria-label="Refresh health data"
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              className={validating ? 'animate-spin' : ''}
            >
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            {validating ? 'Checking…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'thin' }}>
        {!connected ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Connect to the token server to run health checks</p>
          </div>
        ) : (
          <>
            {/* Lint violations — per-set, current set */}
            <HealthSection
              title="Lint violations"
              status={lintStatus}
              count={lintErrors + lintWarnings}
              detail={
                lintErrors + lintWarnings === 0
                  ? 'No lint issues in the current set'
                  : `${lintErrors > 0 ? `${lintErrors} error${lintErrors !== 1 ? 's' : ''}` : ''}${lintErrors > 0 && lintWarnings > 0 ? ', ' : ''}${lintWarnings > 0 ? `${lintWarnings} warning${lintWarnings !== 1 ? 's' : ''}` : ''} in the current set`
              }
              ctaLabel={lintErrors + lintWarnings > 0 ? 'Jump to issues' : 'View set'}
              onCta={() => onNavigateTo('define', 'tokens')}
            >
              <ul className="space-y-1">
                {lintViolations.slice(0, 5).map((v, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${v.severity === 'error' ? 'bg-[var(--color-figma-error)]' : v.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono break-all leading-relaxed">{v.path}</span>
                  </li>
                ))}
                {lintViolations.length > 5 && (
                  <li className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 pl-3">
                    +{lintViolations.length - 5} more
                  </li>
                )}
              </ul>
            </HealthSection>

            {/* Cross-set validation */}
            <HealthSection
              title="Cross-set validation"
              status={validationError ? 'warning' : validationStatus}
              count={criticalValidation + validationWarnings}
              detail={
                validationError ? validationError
                : validating ? 'Running validation…'
                : criticalValidation === 0 && validationWarnings === 0
                  ? `${validationIssues.length === 0 ? 'No issues' : 'No critical issues'} across all sets`
                  : `${brokenAliases.length > 0 ? `${brokenAliases.length} broken alias${brokenAliases.length !== 1 ? 'es' : ''}` : ''}${brokenAliases.length > 0 && circularRefs.length > 0 ? ', ' : ''}${circularRefs.length > 0 ? `${circularRefs.length} circular ref${circularRefs.length !== 1 ? 's' : ''}` : ''}${validationWarnings > 0 ? `, ${validationWarnings} warning${validationWarnings !== 1 ? 's' : ''}` : ''}`
              }
              ctaLabel="Full report"
              onCta={() => onNavigateTo('ship', 'validation')}
            >
              {brokenAliases.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-semibold text-[var(--color-figma-error)] mb-1">Broken aliases</p>
                  <ul className="space-y-0.5">
                    {brokenAliases.slice(0, 4).map((issue, i) => (
                      <li key={i} className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono break-all leading-relaxed">
                        {issue.setName}/{issue.path}
                      </li>
                    ))}
                    {brokenAliases.length > 4 && (
                      <li className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60">
                        +{brokenAliases.length - 4} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {circularRefs.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-amber-500 mb-1">Circular references</p>
                  <ul className="space-y-0.5">
                    {circularRefs.slice(0, 3).map((issue, i) => (
                      <li key={i} className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono break-all leading-relaxed">
                        {issue.setName}/{issue.path}
                      </li>
                    ))}
                    {circularRefs.length > 3 && (
                      <li className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60">
                        +{circularRefs.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </HealthSection>

            {/* Generator health */}
            <HealthSection
              title="Generator health"
              status={generators.length === 0 ? null : generatorStatus}
              count={errorGenerators.length + blockedGenerators.length + staleGenerators.length}
              detail={
                generators.length === 0
                  ? 'No generators configured'
                  : errorGenerators.length + staleGenerators.length === 0
                    ? `${generators.length} generator${generators.length !== 1 ? 's' : ''} up to date`
                    : [
                        errorGenerators.length > 0 && `${errorGenerators.length} failed`,
                        blockedGenerators.length > 0 && `${blockedGenerators.length} blocked`,
                        staleGenerators.length > 0 && `${staleGenerators.length} stale`,
                      ].filter(Boolean).join(', ')
              }
              ctaLabel="Manage"
              onCta={() => onNavigateTo('define', 'generators')}
            >
              {errorGenerators.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-semibold text-[var(--color-figma-error)] mb-1">Failed generators</p>
                  <ul className="space-y-1">
                    {errorGenerators.map((g, i) => (
                      <li key={i} className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                        <span className="font-medium">{g.name}</span>
                        {g.lastRunError && (
                          <span className="block opacity-70 font-mono text-[9px] truncate">{g.lastRunError.message}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {staleGenerators.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-amber-500 mb-1">Stale generators</p>
                  <ul className="space-y-0.5">
                    {staleGenerators.map((g, i) => (
                      <li key={i} className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        {g.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </HealthSection>

            {/* Canvas coverage */}
            <HealthSection
              title="Canvas coverage"
              status={canvasStatus}
              count={heatmapResult ? heatmapResult.red + heatmapResult.yellow : 0}
              detail={
                !heatmapResult
                  ? 'Run a canvas audit to see token binding coverage'
                  : heatmapResult.total === 0
                    ? 'No checkable layers on canvas'
                    : `${canvasCoveragePercent}% fully bound · ${heatmapResult.green} green, ${heatmapResult.yellow} partial, ${heatmapResult.red} unbound`
              }
              ctaLabel={heatmapResult ? 'Full audit' : 'Scan canvas'}
              onCta={() => { onNavigateTo('apply', 'canvas-audit'); if (!heatmapResult) onTriggerHeatmap(); }}
            >
              {heatmapResult && (
                <div className="flex gap-2">
                  {(['green', 'yellow', 'red'] as const).map(color => (
                    <div key={color} className="flex-1 text-center">
                      <div className={`text-[11px] font-bold tabular-nums ${color === 'green' ? 'text-emerald-500' : color === 'yellow' ? 'text-amber-500' : 'text-[var(--color-figma-error)]'}`}>
                        {heatmapResult[color]}
                      </div>
                      <div className="text-[9px] text-[var(--color-figma-text-secondary)] capitalize">{color === 'green' ? 'Bound' : color === 'yellow' ? 'Partial' : 'Unbound'}</div>
                    </div>
                  ))}
                </div>
              )}
            </HealthSection>

            {/* Unused tokens */}
            {hasUsageData && totalTokens > 0 && (
              <HealthSection
                title="Canvas-unused tokens"
                status={unusedTokens > 0 ? 'warning' : 'healthy'}
                count={unusedTokens}
                detail={
                  unusedTokens === 0
                    ? `All ${totalTokens} tokens are applied to the canvas`
                    : `${unusedTokens} of ${totalTokens} tokens not applied to any canvas layer`
                }
                ctaLabel="Review"
                onCta={() => onNavigateTo('ship', 'validation')}
              >
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                  Unused tokens may be legitimate (utility tokens, future tokens) — review in Validation to suppress as needed.
                </p>
              </HealthSection>
            )}

            {/* Alias dependency health */}
            <HealthSection
              title="Alias dependencies"
              status="healthy"
              count={0}
              detail={`Explore alias chains and find circular or deep references in the Dependencies view`}
              ctaLabel="Explore"
              onCta={() => onNavigateTo('apply', 'dependencies')}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Computes a single health issue count for use in status badges outside the panel. */
export function computeHealthIssueCount(
  lintViolations: LintViolation[],
  generators: TokenGenerator[],
): number {
  const lintCount = lintViolations.filter(v => v.severity === 'error' || v.severity === 'warning').length;
  const genIssues = generators.filter(g => g.isStale || g.lastRunError).length;
  return lintCount + genIssues;
}
