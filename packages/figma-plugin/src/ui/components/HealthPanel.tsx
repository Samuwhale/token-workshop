import { useState, useMemo, useEffect } from 'react';
import type { LintViolation } from '../hooks/useLint';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { HeatmapResult } from './HeatmapPanel';
import type { TokenMapEntry } from '../../shared/types';
import type { ValidationIssue, ValidationSummary } from '../hooks/useValidationCache';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { hexToLuminance } from '../shared/colorUtils';
import { normalizeHex } from '@tokenmanager/core';
import type { ThemeDimension } from '@tokenmanager/core';
import { LINT_RULE_BY_ID } from '../shared/lintRules';
import { UnusedTokensPanel } from './UnusedTokensPanel';
import { DuplicateDetectionPanel } from './DuplicateDetectionPanel';
import { ContrastMatrixPanel } from './ContrastMatrixPanel';
import { LightnessInspectorPanel } from './LightnessInspectorPanel';

type HealthStatus = 'healthy' | 'warning' | 'critical';

interface PriorityIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  count: number;
  ctaLabel: string;
  /** Stable string key describing the action — resolved to a handler in JSX */
  action: 'lint' | 'generators' | 'validation-scroll' | 'duplicates-scroll' | 'canvas' | 'unused-scroll';
}

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

function priorityCategoryClass(severity: PriorityIssue['severity']): string {
  if (severity === 'critical') return 'bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] border-[var(--color-figma-error)]/30';
  if (severity === 'warning') return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
  return 'bg-sky-500/10 text-sky-500 border-sky-500/30';
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4M12 8h.01"/>
    </svg>
  );
}

/** Human-friendly labels for validation rules */
const VALIDATION_LABELS: Record<string, { label: string; tip: string }> = {
  'missing-type':       { label: 'Missing type',          tip: 'Add a $type to make the token spec-compliant' },
  'broken-alias':       { label: 'Broken reference',      tip: "The referenced token doesn't exist — update or remove the reference" },
  'circular-reference': { label: 'Circular reference',    tip: 'Break the reference loop so the token can resolve' },
  'max-alias-depth':    { label: 'Deep reference chain',  tip: 'Shorten the chain by pointing closer to the source token' },
  'type-mismatch':      { label: 'Type / value mismatch', tip: "The value doesn't match the declared $type" },
};

function getRuleLabel(rule: string): { label: string; tip: string } | undefined {
  return VALIDATION_LABELS[rule] ?? (LINT_RULE_BY_ID[rule] ? { label: LINT_RULE_BY_ID[rule].label, tip: LINT_RULE_BY_ID[rule].tip } : undefined);
}

export interface HealthPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  generators: TokenGenerator[];
  lintViolations: LintViolation[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  /** Theme dimensions — enables cross-theme contrast checking in the matrix */
  dimensions?: ThemeDimension[];
  tokenUsageCounts: Record<string, number>;
  heatmapResult: HeatmapResult | null;
  onNavigateTo: (topTab: 'define' | 'apply' | 'ship', subTab?: string) => void;
  onNavigateToToken?: (path: string, set: string) => void;
  onTriggerHeatmap: () => void;
  /** Shared validation cache — avoids re-fetching when switching from Analytics tab */
  validationIssues: ValidationIssue[] | null;
  validationSummary: ValidationSummary | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  onRefreshValidation: () => void;
  onError: (msg: string) => void;
}

export function HealthPanel({
  serverUrl,
  connected,
  activeSet,
  generators,
  lintViolations,
  allTokensFlat,
  pathToSet,
  dimensions = [],
  tokenUsageCounts,
  heatmapResult,
  onNavigateTo,
  onNavigateToToken,
  onTriggerHeatmap,
  validationIssues: validationIssuesProp,
  validationSummary,
  validationLoading,
  validationError,
  validationLastRefreshed,
  validationIsStale,
  onRefreshValidation,
  onError,
}: HealthPanelProps) {
  const validationIssues = validationIssuesProp ?? [];
  const validating = validationLoading;
  const lastRefreshed = validationLastRefreshed;
  const runValidation = onRefreshValidation;

  const [fixingKeys, setFixingKeys] = useState<Set<string>>(new Set());

  // Suppressions
  const [suppressedKeys, setSuppressedKeys] = useState<Set<string>>(new Set());
  const [suppressingKey, setSuppressingKey] = useState<string | null>(null);
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Load suppressions from server on mount / reconnect
  useEffect(() => {
    if (!connected || !serverUrl) return;
    apiFetch<{ suppressions: string[] }>(`${serverUrl}/api/lint/suppressions`)
      .then((data) => {
        if (Array.isArray(data.suppressions)) {
          setSuppressedKeys(new Set(data.suppressions));
        }
      })
      .catch(() => {/* suppressions are best-effort */});
   
  }, [connected, serverUrl]);

  const handleSuppress = async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    if (suppressedKeys.has(key)) return;
    setSuppressingKey(key);
    const next = new Set(suppressedKeys);
    next.add(key);
    setSuppressedKeys(next);
    try {
      await apiFetch(`${serverUrl}/api/lint/suppressions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suppressions: [...next] }),
      });
    } catch {
      setSuppressedKeys(prev => { const r = new Set(prev); r.delete(key); return r; });
      onError('Failed to save suppression');
    } finally {
      setSuppressingKey(null);
    }
  };

  const handleUnsuppress = async (key: string) => {
    setSuppressingKey(key);
    const next = new Set(suppressedKeys);
    next.delete(key);
    setSuppressedKeys(next);
    try {
      await apiFetch(`${serverUrl}/api/lint/suppressions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suppressions: [...next] }),
      });
    } catch {
      setSuppressedKeys(prev => { const r = new Set(prev); r.add(key); return r; });
      onError('Failed to remove suppression');
    } finally {
      setSuppressingKey(null);
    }
  };

  // Dashboard strip — expanded by default so health overview is primary
  const [dashboardExpanded, setDashboardExpanded] = useState(true);

  // Analytics section state
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [collapsedRules, setCollapsedRules] = useState<Set<string>>(new Set());
  const [validationCopied, setValidationCopied] = useState(false);
  const [validationExported, setValidationExported] = useState<'json' | 'csv' | null>(null);

  // reloadKey forces re-computation of allTokensUnified after mutations
  const [reloadKey, setReloadKey] = useState(0);
  void reloadKey; // consumed via allTokensFlat dependency

  // ── Derived data from allTokensFlat ────────────────────────────────────────

  const allTokensUnified = useMemo(() => {
    const result: Record<string, { $value: unknown; $type: string; set: string }> = {};
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      result[path] = { $value: entry.$value, $type: entry.$type, set: pathToSet[path] ?? '' };
    }
    return result;
  }, [allTokensFlat, pathToSet]);

  const resolveColorHex = useMemo(() => {
    return (path: string, visited = new Set<string>()): string | null => {
      if (visited.has(path)) return null;
      visited.add(path);
      const entry = allTokensUnified[path];
      if (!entry || entry.$type !== 'color') return null;
      const v = entry.$value as import('@tokenmanager/core').TokenValue;
      if (isAlias(v)) {
        const aliasPath = extractAliasPath(v);
        return aliasPath ? resolveColorHex(aliasPath, visited) : null;
      }
      return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : null;
    };
   
  }, [allTokensUnified]);

  // Non-alias color tokens sorted by luminance (for ContrastMatrixPanel)
  const colorTokens = useMemo((): { path: string; hex: string }[] => {
    const colors: { path: string; hex: string }[] = [];
    for (const [path, entry] of Object.entries(allTokensUnified)) {
      if (entry.$type !== 'color') continue;
      if (isAlias(entry.$value as import('@tokenmanager/core').TokenValue)) continue;
      const v = entry.$value;
      if (typeof v !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) continue;
      colors.push({ path, hex: normalizeHex(v) });
    }
    return colors.sort((a, b) => (hexToLuminance(a.hex) ?? 0) - (hexToLuminance(b.hex) ?? 0));
  }, [allTokensUnified]);

  // All color tokens with alias resolution (for LightnessInspectorPanel)
  const allColorTokens = useMemo((): { path: string; set: string; hex: string }[] => {
    const colors: { path: string; set: string; hex: string }[] = [];
    for (const [path, entry] of Object.entries(allTokensUnified)) {
      if (entry.$type !== 'color') continue;
      const hex = resolveColorHex(path);
      if (hex) colors.push({ path, set: entry.set, hex: normalizeHex(hex) });
    }
    return colors;
  }, [allTokensUnified, resolveColorHex]);

  // Duplicate groups from validation results (for DuplicateDetectionPanel)
  const lintDuplicateGroups = useMemo(() => {
    if (!validationIssuesProp) return [];
    const dupViolations = validationIssuesProp.filter(v => v.rule === 'no-duplicate-values' && v.group);
    if (dupViolations.length === 0) return [];
    const byCanonical = new Map<string, { setName: string; tokens: { path: string; setName: string }[] }>();
    for (const v of dupViolations) {
      const canonical = v.group!;
      if (!byCanonical.has(canonical)) byCanonical.set(canonical, { setName: '', tokens: [] });
      const entry = byCanonical.get(canonical)!;
      if (!entry.tokens.some(t => t.path === v.path && t.setName === v.setName)) {
        entry.tokens.push({ path: v.path, setName: v.setName });
        if (v.path === canonical) entry.setName = v.setName;
      }
    }
    return [...byCanonical.entries()]
      .filter(([, g]) => g.tokens.length > 1)
      .map(([canonical, { setName, tokens }]) => {
        const tokenEntry = allTokensUnified[canonical];
        const colorHex =
          tokenEntry?.$type === 'color' && typeof tokenEntry.$value === 'string'
            ? tokenEntry.$value
            : undefined;
        return { canonical, canonicalSet: setName, tokens, colorHex };
      })
      .sort((a, b) => b.tokens.length - a.tokens.length);
  }, [validationIssuesProp, allTokensUnified]);

  // Color scales for LightnessInspectorPanel (groups with numeric suffix, ≥3 steps)
  const colorScales = useMemo(() => {
    const parentGroups = new Map<string, { path: string; label: string; hex: string }[]>();
    for (const t of allColorTokens) {
      const parts = t.path.split('.');
      const last = parts[parts.length - 1];
      if (!/^\d+$/.test(last)) continue;
      const parent = parts.slice(0, -1).join('.');
      const list = parentGroups.get(parent) ?? [];
      list.push({ path: t.path, label: last, hex: t.hex });
      parentGroups.set(parent, list);
    }
    return [...parentGroups.entries()]
      .filter(([, steps]) => steps.length >= 3)
      .map(([parent, steps]) => ({
        parent,
        steps: steps.sort((a, b) => Number(a.label) - Number(b.label)),
      }));
  }, [allColorTokens]);

  // Unused tokens (for UnusedTokensPanel)
  const unusedTokens = useMemo(() => {
    if (Object.keys(tokenUsageCounts).length === 0 || Object.keys(allTokensUnified).length === 0) return [];
    const referencedPaths = new Set<string>();
    const collectRefs = (value: unknown) => {
      if (typeof value === 'string') {
        const m = value.match(/^\{([^}]+)\}$/);
        if (m) referencedPaths.add(m[1]);
      } else if (Array.isArray(value)) {
        for (const item of value) collectRefs(item);
      } else if (value && typeof value === 'object') {
        for (const v of Object.values(value as Record<string, unknown>)) collectRefs(v);
      }
    };
    for (const entry of Object.values(allTokensUnified)) collectRefs(entry.$value);
    return Object.entries(allTokensUnified)
      .filter(([path, entry]) =>
        (tokenUsageCounts[path] ?? 0) === 0 &&
        !referencedPaths.has(path) &&
        allTokensFlat[path]?.$lifecycle !== 'deprecated'
      )
      .map(([path, entry]) => ({ path, set: entry.set, $type: entry.$type }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [tokenUsageCounts, allTokensUnified, allTokensFlat]);

  // ── Validation issue filtering ──────────────────────────────────────────────

  const suppressKey = (issue: ValidationIssue) => `${issue.rule}:${issue.setName}:${issue.path}`;

  const activeIssues = validationIssuesProp
    ? validationIssuesProp.filter(i => i.rule !== 'no-duplicate-values' && !suppressedKeys.has(suppressKey(i)))
    : null;

  const filteredIssues = activeIssues
    ? (severityFilter === 'all'
        ? [...activeIssues].sort((a, b) => {
            const order = { error: 0, warning: 1, info: 2 } as const;
            return order[a.severity] - order[b.severity];
          })
        : activeIssues.filter(i => i.severity === severityFilter))
    : null;

  const severityCounts = activeIssues
    ? {
        all: activeIssues.length,
        error: activeIssues.filter(i => i.severity === 'error').length,
        warning: activeIssues.filter(i => i.severity === 'warning').length,
        info: activeIssues.filter(i => i.severity === 'info').length,
      }
    : null;

  const issueGroups = (() => {
    if (!filteredIssues || filteredIssues.length === 0) return [];
    const map = new Map<string, ValidationIssue[]>();
    for (const issue of filteredIssues) {
      const list = map.get(issue.rule) ?? [];
      list.push(issue);
      map.set(issue.rule, list);
    }
    const severityOrder = { error: 0, warning: 1, info: 2 } as const;
    return [...map.entries()]
      .map(([rule, issues]) => {
        const meta = getRuleLabel(rule) ?? { label: rule, tip: '' };
        const worst = issues.reduce((a, b) => severityOrder[a.severity] <= severityOrder[b.severity] ? a : b);
        return { rule, label: meta.label, tip: meta.tip, severity: worst.severity, issues };
      })
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  })();

  // ── Fix / mutate handlers ───────────────────────────────────────────────────

  const applyLintFix = async (violation: LintViolation) => {
    const key = `lint:${violation.rule}:${violation.path}`;
    setFixingKeys(prev => { const next = new Set(prev); next.add(key); return next; });
    try {
      if (violation.suggestedFix === 'rename-token' && violation.suggestion) {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/tokens/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPath: violation.path, newPath: violation.suggestion, updateAliases: true }),
        });
      }
      onRefreshValidation();
    } catch {
      onError('Fix failed — check your connection and try again.');
    } finally {
      setFixingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const applyIssueFix = async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    const tokenUrl = `${serverUrl}/api/tokens/${encodeURIComponent(issue.setName)}/${tokenPathToUrlSegment(issue.path)}`;
    const renameUrl = `${serverUrl}/api/tokens/${encodeURIComponent(issue.setName)}/tokens/rename`;
    setFixingKeys(prev => { const next = new Set(prev); next.add(key); return next; });
    try {
      if (issue.suggestedFix === 'add-description') {
        await apiFetch(tokenUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ $description: '' }) });
      } else if ((issue.suggestedFix === 'flatten-alias-chain' || issue.suggestedFix === 'extract-to-alias') && issue.suggestion) {
        await apiFetch(tokenUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ $value: issue.suggestion }) });
      } else if (issue.suggestedFix === 'delete-token') {
        await apiFetch(tokenUrl, { method: 'DELETE' });
      } else if (issue.suggestedFix === 'rename-token' && issue.suggestion) {
        await apiFetch(renameUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath: issue.path, newPath: issue.suggestion, updateAliases: true }) });
      } else if (issue.suggestedFix === 'fix-type' && issue.suggestion) {
        await apiFetch(tokenUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ $type: issue.suggestion }) });
      }
      await runValidation();
    } catch {
      onError('Fix failed — check your connection and try again.');
    } finally {
      setFixingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  // ── Derived metrics ──────────────────────────────────────────────────────
  const lintErrors = lintViolations.filter(v => v.severity === 'error').length;
  const lintWarnings = lintViolations.filter(v => v.severity === 'warning').length;

  const validationErrors = validationSummary?.errors ?? 0;
  const validationWarnings = validationSummary?.warnings ?? 0;

  const staleGenerators = generators.filter(g => g.isStale);
  const errorGenerators = generators.filter(g => g.lastRunError && !g.lastRunError.blockedBy);
  const blockedGenerators = generators.filter(g => g.lastRunError?.blockedBy);

  const hasUsageData = Object.keys(tokenUsageCounts).length > 0;
  const unusedCount = hasUsageData
    ? Object.keys(allTokensFlat).filter(path => !tokenUsageCounts[path]).length
    : 0;

  const totalDuplicateAliases = lintDuplicateGroups.reduce((sum, g) => sum + g.tokens.length - 1, 0);

  const overallStatus: HealthStatus =
    lintErrors > 0 || validationErrors > 0 || errorGenerators.length > 0 ? 'critical'
    : lintWarnings > 0 || validationWarnings > 0 || staleGenerators.length > 0 || totalDuplicateAliases > 0 || (heatmapResult?.red ?? 0) > 0 ? 'warning'
    : 'healthy';

  const totalIssues =
    lintErrors + lintWarnings +
    staleGenerators.length + errorGenerators.length +
    totalDuplicateAliases +
    (heatmapResult?.red ?? 0);

  const lintStatus: HealthStatus | null =
    lintErrors > 0 ? 'critical' : lintWarnings > 0 ? 'warning' : 'healthy';

  const generatorStatus: HealthStatus | null =
    errorGenerators.length > 0 ? 'critical' : staleGenerators.length > 0 ? 'warning' : 'healthy';

  const canvasStatus: HealthStatus | null = heatmapResult
    ? heatmapResult.red > 0 ? 'warning' : 'healthy'
    : null;

  const canvasCoveragePercent = heatmapResult && heatmapResult.total > 0
    ? Math.round((heatmapResult.green / heatmapResult.total) * 100)
    : null;

  // Comprehensive prioritised issue list — aggregates ALL sources so the panel
  // is useful at a glance without expanding any sub-section.
  const priorityIssues = ((): PriorityIssue[] => {
    const items: PriorityIssue[] = [];

    // ── Critical ──────────────────────────────────────────────────────────────
    if (lintErrors > 0) {
      items.push({
        severity: 'critical',
        category: 'Lint',
        message: `${lintErrors} error${lintErrors !== 1 ? 's' : ''} in current set`,
        count: lintErrors,
        ctaLabel: 'Go to set',
        action: 'lint',
      });
    }

    if (activeIssues) {
      const errorsByRule = new Map<string, number>();
      for (const issue of activeIssues) {
        if (issue.severity === 'error') {
          errorsByRule.set(issue.rule, (errorsByRule.get(issue.rule) ?? 0) + 1);
        }
      }
      for (const [rule, count] of [...errorsByRule.entries()].sort((a, b) => b[1] - a[1])) {
        const meta = getRuleLabel(rule);
        items.push({
          severity: 'critical',
          category: meta?.label ?? rule,
          message: `${count} token${count !== 1 ? 's' : ''} affected`,
          count,
          ctaLabel: 'Fix',
          action: 'validation-scroll',
        });
      }
    }

    if (errorGenerators.length > 0) {
      items.push({
        severity: 'critical',
        category: 'Generators',
        message: `${errorGenerators.length} failed`,
        count: errorGenerators.length,
        ctaLabel: 'View',
        action: 'generators',
      });
    }

    // ── Warning ───────────────────────────────────────────────────────────────
    if (lintWarnings > 0) {
      items.push({
        severity: 'warning',
        category: 'Lint',
        message: `${lintWarnings} warning${lintWarnings !== 1 ? 's' : ''} in current set`,
        count: lintWarnings,
        ctaLabel: 'Go to set',
        action: 'lint',
      });
    }

    if (activeIssues) {
      const warnsByRule = new Map<string, number>();
      for (const issue of activeIssues) {
        if (issue.severity === 'warning') {
          warnsByRule.set(issue.rule, (warnsByRule.get(issue.rule) ?? 0) + 1);
        }
      }
      for (const [rule, count] of [...warnsByRule.entries()].sort((a, b) => b[1] - a[1])) {
        const meta = getRuleLabel(rule);
        items.push({
          severity: 'warning',
          category: meta?.label ?? rule,
          message: `${count} token${count !== 1 ? 's' : ''} affected`,
          count,
          ctaLabel: 'View',
          action: 'validation-scroll',
        });
      }
    }

    if (totalDuplicateAliases > 0) {
      items.push({
        severity: 'warning',
        category: 'Duplicates',
        message: `${totalDuplicateAliases} redundant value${totalDuplicateAliases !== 1 ? 's' : ''}`,
        count: totalDuplicateAliases,
        ctaLabel: 'Fix',
        action: 'duplicates-scroll',
      });
    }

    if (staleGenerators.length > 0) {
      items.push({
        severity: 'warning',
        category: 'Generators',
        message: `${staleGenerators.length} stale`,
        count: staleGenerators.length,
        ctaLabel: 'Run',
        action: 'generators',
      });
    }

    if (heatmapResult && heatmapResult.red > 0) {
      items.push({
        severity: 'warning',
        category: 'Canvas',
        message: `${heatmapResult.red} unbound layer${heatmapResult.red !== 1 ? 's' : ''}`,
        count: heatmapResult.red,
        ctaLabel: 'Audit',
        action: 'canvas',
      });
    }

    // ── Info ──────────────────────────────────────────────────────────────────
    if (hasUsageData && unusedCount > 0) {
      items.push({
        severity: 'info',
        category: 'Unused',
        message: `${unusedCount} unused token${unusedCount !== 1 ? 's' : ''}`,
        count: unusedCount,
        ctaLabel: 'Review',
        action: 'unused-scroll',
      });
    }

    return items;
  })();

  const totalAllIssues =
    priorityIssues.filter(i => i.severity !== 'info').reduce((sum, i) => sum + i.count, 0);

  const resolveIssueAction = (action: PriorityIssue['action']) => {
    switch (action) {
      case 'lint': return () => onNavigateTo('define', 'tokens');
      case 'generators': return () => onNavigateTo('define', 'generators');
      case 'canvas': return () => { onNavigateTo('apply', 'canvas-analysis'); if (!heatmapResult) onTriggerHeatmap(); };
      case 'validation-scroll': return () => document.getElementById('health-validation-section')?.scrollIntoView({ behavior: 'smooth' });
      case 'duplicates-scroll': return () => document.getElementById('health-duplicates-section')?.scrollIntoView({ behavior: 'smooth' });
      case 'unused-scroll': return () => document.getElementById('health-unused-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  function formatValidatedAt(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    return `at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={`shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--color-figma-border)] ${validationIssuesProp !== null ? statusBg(overallStatus) : 'bg-[var(--color-figma-bg-secondary)]'}`}>
        {validationIssuesProp !== null && (
          <span className={statusColor(overallStatus)}>
            <StatusIcon status={overallStatus} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-bold ${validationIssuesProp !== null ? statusColor(overallStatus) : 'text-[var(--color-figma-text)]'}`}>
            {validationIssuesProp === null
              ? 'Token Health'
              : overallStatus === 'healthy'
                ? 'All checks passed'
                : totalIssues > 0
                  ? `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found`
                  : 'Token Health'
            }
          </p>
          {lastRefreshed && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {formatValidatedAt(lastRefreshed)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={runValidation}
            disabled={validating || !connected}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-40 transition-colors"
            aria-label="Refresh validation"
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

      {/* Priority Issues — always visible when connected and validation has run */}
      {connected && validationIssuesProp !== null && priorityIssues.length > 0 && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)]">
          {/* Summary header row */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
              Priority issues
            </span>
            <span className="flex-1" />
            {priorityIssues.filter(i => i.severity === 'critical').length > 0 && (
              <span className="text-[10px] font-bold tabular-nums text-[var(--color-figma-error)]">
                {priorityIssues.filter(i => i.severity === 'critical').reduce((s, i) => s + i.count, 0)} critical
              </span>
            )}
            {priorityIssues.filter(i => i.severity === 'warning').length > 0 && (
              <span className="text-[10px] font-bold tabular-nums text-amber-500">
                {priorityIssues.filter(i => i.severity === 'warning').reduce((s, i) => s + i.count, 0)} warning
              </span>
            )}
            {priorityIssues.filter(i => i.severity === 'info').length > 0 && (
              <span className="text-[10px] tabular-nums text-sky-500">
                {priorityIssues.filter(i => i.severity === 'info').reduce((s, i) => s + i.count, 0)} info
              </span>
            )}
          </div>
          {/* Issue rows — up to 8 visible */}
          {priorityIssues.slice(0, 8).map((issue, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <span className={`shrink-0 ${issue.severity === 'critical' ? 'text-[var(--color-figma-error)]' : issue.severity === 'warning' ? 'text-amber-500' : 'text-sky-500'}`}>
                {issue.severity === 'info' ? <InfoIcon /> : <StatusIcon status={issue.severity} />}
              </span>
              <span className={`shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded border ${priorityCategoryClass(issue.severity)}`}>
                {issue.category}
              </span>
              <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)] truncate min-w-0">
                {issue.message}
              </span>
              <button
                onClick={resolveIssueAction(issue.action)}
                className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] transition-colors whitespace-nowrap"
              >
                {issue.ctaLabel}
              </button>
            </div>
          ))}
          {priorityIssues.length > 8 && (
            <div className="px-3 py-1 border-t border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] opacity-60">
              +{priorityIssues.length - 8} more — see section details below
            </div>
          )}
          {/* All-clear row for non-info issues when only info issues remain */}
          {totalAllIssues === 0 && priorityIssues.length > 0 && (
            <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] flex items-center gap-1.5 text-[var(--color-figma-success,#18a058)]">
              <StatusIcon status="healthy" />
              <span className="text-[10px]">No critical or warning issues</span>
            </div>
          )}
        </div>
      )}

      {/* Section Breakdown — collapsible, shows per-area health cards */}
      {connected && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => setDashboardExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            aria-expanded={dashboardExpanded}
          >
            <span className="flex-1 text-left font-medium text-[var(--color-figma-text-secondary)]">
              Section breakdown
              {validationIssuesProp === null && totalIssues > 0 && (
                <span className={`ml-1.5 ${statusColor(overallStatus)}`}>
                  — {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
                </span>
              )}
              {validationIssuesProp === null && totalIssues === 0 && (
                <span className="ml-1.5 text-[var(--color-figma-text-secondary)] opacity-60">— all clear</span>
              )}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${dashboardExpanded ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="M2 1l4 3-4 3V1z"/>
            </svg>
          </button>
          {dashboardExpanded && (
            <div className="px-3 py-2 overflow-y-auto max-h-52" style={{ scrollbarWidth: 'thin' }}>
              {/* Lint violations */}
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
                  {lintViolations.slice(0, 5).map((v, i) => {
                    const fixKey = `lint:${v.rule}:${v.path}`;
                    return (
                      <li key={i} className="group flex items-start gap-1.5">
                        <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${v.severity === 'error' ? 'bg-[var(--color-figma-error)]' : v.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                        <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono break-all leading-relaxed flex-1 min-w-0">{v.path}</span>
                        {v.suggestedFix === 'rename-token' && v.suggestion && (
                          <button
                            onClick={() => applyLintFix(v)}
                            disabled={fixingKeys.has(fixKey)}
                            className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[9px] px-1 py-0.5 rounded border border-[var(--color-figma-success,#34a853)] text-[var(--color-figma-success,#34a853)] hover:bg-[var(--color-figma-success,#34a853)]/10 shrink-0 disabled:opacity-40 disabled:cursor-wait"
                            title={`Rename to ${v.suggestion}`}
                          >
                            {fixingKeys.has(fixKey) ? '…' : 'Rename'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {lintViolations.length > 5 && (
                    <li className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 pl-3">
                      +{lintViolations.length - 5} more
                    </li>
                  )}
                </ul>
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
                onCta={() => { onNavigateTo('apply', 'canvas-analysis'); if (!heatmapResult) onTriggerHeatmap(); }}
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

              {/* Alias dependencies */}
              <HealthSection
                title="Alias dependencies"
                status="healthy"
                count={0}
                detail="Explore alias chains and find circular or deep references in the Dependencies view"
                ctaLabel="Explore"
                onCta={() => onNavigateTo('apply', 'dependencies')}
              />
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: 'thin' }}>
        {!connected ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Connect to the token server to run validation</p>
          </div>
        ) : (
          <>
            {/* Validation Issues */}
            {validationIssuesProp !== null && (
              <div id="health-validation-section" className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                    Validation Report
                    {validationIsStale && (
                      <span className="text-[var(--color-figma-warning)] normal-case font-normal tracking-normal">stale</span>
                    )}
                    {lastRefreshed && !validationIsStale && (
                      <span className="normal-case font-normal tracking-normal text-[var(--color-figma-text-tertiary)]">{formatValidatedAt(lastRefreshed)}</span>
                    )}
                    {severityCounts && (activeIssues?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1 normal-case font-normal tracking-normal">
                        {severityCounts.error > 0 && <span className="text-[var(--color-figma-error)]">{severityCounts.error} error{severityCounts.error !== 1 ? 's' : ''}</span>}
                        {severityCounts.warning > 0 && <span className="text-[var(--color-figma-warning)]">{severityCounts.warning} warning{severityCounts.warning !== 1 ? 's' : ''}</span>}
                        {severityCounts.info > 0 && <span className="text-[var(--color-figma-accent)]">{severityCounts.info} info</span>}
                      </span>
                    )}
                    {(activeIssues?.length ?? 0) === 0 && (
                      <span className="normal-case font-normal tracking-normal text-[var(--color-figma-success)]">All clear</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const issues = validationIssuesProp ?? [];
                        const lines: string[] = [`# Validation Report — ${issues.length} issue${issues.length !== 1 ? 's' : ''}\n`];
                        for (const sev of ['error', 'warning', 'info'] as const) {
                          const group = issues.filter(i => i.severity === sev);
                          if (group.length === 0) continue;
                          lines.push(`## ${sev.charAt(0).toUpperCase() + sev.slice(1)}s (${group.length})`);
                          for (const issue of group) {
                            lines.push(`- **${issue.path}** (set: ${issue.setName}): ${issue.message}${issue.suggestedFix ? ` — Fix: ${issue.suggestedFix}` : ''}`);
                          }
                          lines.push('');
                        }
                        navigator.clipboard.writeText(lines.join('\n')).then(() => {
                          setValidationCopied(true);
                          setTimeout(() => setValidationCopied(false), 1500);
                        });
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      {validationCopied ? 'Copied!' : 'Copy MD'}
                    </button>
                    <button
                      onClick={() => {
                        const issues = validationIssuesProp ?? [];
                        const payload = { generatedAt: new Date().toISOString(), total: issues.length, issues: issues.map(i => ({ severity: i.severity, rule: i.rule, set: i.setName, path: i.path, message: i.message, ...(i.suggestedFix ? { suggestedFix: i.suggestedFix } : {}) })) };
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'validation-report.json'; a.click();
                        URL.revokeObjectURL(url);
                        setValidationExported('json');
                        setTimeout(() => setValidationExported(null), 1500);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      {validationExported === 'json' ? 'Saved!' : 'JSON'}
                    </button>
                    <button
                      onClick={() => {
                        const issues = validationIssuesProp ?? [];
                        const header = 'severity,rule,set,path,message,suggestedFix';
                        const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
                        const rows = issues.map(i => [i.severity, i.rule, i.setName, i.path, i.message, i.suggestedFix ?? ''].map(escape).join(','));
                        const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'validation-report.csv'; a.click();
                        URL.revokeObjectURL(url);
                        setValidationExported('csv');
                        setTimeout(() => setValidationExported(null), 1500);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      {validationExported === 'csv' ? 'Saved!' : 'CSV'}
                    </button>
                    <span className="w-px h-3 bg-[var(--color-figma-border)]" aria-hidden="true" />
                    {(['all', 'error', 'warning', 'info'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setSeverityFilter(f)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                          severityFilter === f
                            ? f === 'error' ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10'
                            : f === 'warning' ? 'border-[var(--color-figma-warning)] text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10'
                            : 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
                        }`}
                      >
                        {severityCounts && f !== 'all' ? `${f} (${severityCounts[f]})` : f}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredIssues && filteredIssues.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
                      {(activeIssues?.length ?? 0) === 0 ? 'No validation issues found' : 'No issues match this filter'}
                    </div>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {issueGroups.map(group => {
                      const isCollapsed = collapsedRules.has(group.rule);
                      return (
                        <div key={group.rule}>
                          <div className="group/ruleheader flex items-center bg-[var(--color-figma-bg-secondary)]/50 border-y border-[var(--color-figma-border)]">
                            <button
                              onClick={() => setCollapsedRules(prev => {
                                const next = new Set(prev);
                                if (next.has(group.rule)) next.delete(group.rule); else next.add(group.rule);
                                return next;
                              })}
                              className="flex-1 flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors min-w-0"
                            >
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                              <span className={`text-[10px] px-1 py-0.5 rounded border shrink-0 font-medium ${group.severity === 'error' ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/5' : group.severity === 'warning' ? 'border-[var(--color-figma-warning)] text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10' : 'border-[var(--color-figma-accent)]/50 text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'}`}>
                                {group.severity === 'error' ? 'Error' : group.severity === 'warning' ? 'Warn' : 'Info'}
                              </span>
                              <span className="text-[10px] font-medium text-[var(--color-figma-text)] flex-1 text-left">{group.label}</span>
                              <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{group.issues.length}</span>
                            </button>
                          </div>
                          {!isCollapsed && group.tip && (
                            <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]/30 border-b border-[var(--color-figma-border)] flex items-center gap-1">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-50"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                              {group.tip}
                            </div>
                          )}
                          {!isCollapsed && group.issues.map((issue, i) => (
                            <div key={i} className="group px-3 py-1.5 flex items-center gap-2 border-b border-[var(--color-figma-border)] last:border-b-0">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span className="text-[10px] text-[var(--color-figma-text)] font-medium font-mono truncate">{issue.path}</span>
                                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">{issue.setName}</span>
                                </div>
                                <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">{issue.message}</div>
                              </div>
                              {(issue.suggestedFix === 'add-description' ||
                                ((issue.suggestedFix === 'flatten-alias-chain' || issue.suggestedFix === 'extract-to-alias') && !!issue.suggestion) ||
                                issue.suggestedFix === 'delete-token' ||
                                (issue.suggestedFix === 'rename-token' && !!issue.suggestion) ||
                                (issue.suggestedFix === 'fix-type' && !!issue.suggestion)
                              ) && (
                                <button
                                  onClick={() => applyIssueFix(issue)}
                                  disabled={fixingKeys.has(suppressKey(issue))}
                                  className={`opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[10px] px-1.5 py-0.5 rounded border shrink-0 disabled:opacity-40 disabled:cursor-wait ${issue.suggestedFix === 'delete-token' ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10' : 'border-[var(--color-figma-success,#34a853)] text-[var(--color-figma-success,#34a853)] hover:bg-[var(--color-figma-success,#34a853)]/10'}`}
                                >
                                  {fixingKeys.has(suppressKey(issue)) ? '…' :
                                    issue.suggestedFix === 'add-description' ? 'Add desc' :
                                    issue.suggestedFix === 'flatten-alias-chain' ? 'Flatten' :
                                    issue.suggestedFix === 'extract-to-alias' ? 'Make alias' :
                                    issue.suggestedFix === 'delete-token' ? 'Delete' :
                                    issue.suggestedFix === 'rename-token' ? 'Rename' :
                                    'Fix type'}
                                </button>
                              )}
                              <button
                                onClick={() => handleSuppress(issue)}
                                disabled={suppressedKeys.has(suppressKey(issue)) || suppressingKey === suppressKey(issue)}
                                title="Suppress this violation — hide it from the report"
                                className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0 disabled:opacity-40 disabled:cursor-wait"
                              >
                                {suppressingKey === suppressKey(issue) ? '…' : 'Suppress'}
                              </button>
                              {onNavigateToToken && (
                                <button
                                  onClick={() => onNavigateToToken(issue.path, issue.setName)}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
                                >
                                  Go →
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Suppressed Issues */}
            {suppressedKeys.size > 0 && (
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                <button
                  onClick={() => setShowSuppressed(v => !v)}
                  className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
                >
                  <span className="flex items-center gap-1.5">
                    Suppressed Issues
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] font-mono normal-case">{suppressedKeys.size}</span>
                  </span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showSuppressed ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                </button>
                {showSuppressed && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
                      These violations are hidden from the report. Click <strong>Unsuppress</strong> to re-enable.
                    </div>
                    <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                      {[...suppressedKeys].map(key => {
                        const [rule, setName, ...pathParts] = key.split(':');
                        const path = pathParts.join(':');
                        return (
                          <div key={key} className="group flex items-center gap-2 px-3 py-1.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{path}</span>
                                <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">{setName}</span>
                              </div>
                              <div className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-70">{rule}</div>
                            </div>
                            <button
                              onClick={() => handleUnsuppress(key)}
                              disabled={suppressingKey === key}
                              className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-error)] hover:text-[var(--color-figma-error)] shrink-0 disabled:opacity-40 disabled:cursor-wait"
                              title="Remove suppression — show this violation again"
                            >
                              {suppressingKey === key ? '…' : 'Unsuppress'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Unused Tokens */}
            <div id="health-unused-section">
              <UnusedTokensPanel
                serverUrl={serverUrl}
                unusedTokens={unusedTokens}
                hasUsageData={hasUsageData}
                unusedCount={unusedCount}
                onNavigateToToken={onNavigateToToken}
                onError={onError}
                onMutate={() => setReloadKey(k => k + 1)}
              />
            </div>

            {/* Duplicate Detection */}
            <div id="health-duplicates-section">
              <DuplicateDetectionPanel
                serverUrl={serverUrl}
                lintDuplicateGroups={lintDuplicateGroups}
                totalDuplicateAliases={totalDuplicateAliases}
                onNavigateToToken={onNavigateToToken}
                onError={onError}
                onMutate={() => setReloadKey(k => k + 1)}
                onRefreshValidation={onRefreshValidation}
              />
            </div>

            {/* Color Contrast Matrix */}
            <ContrastMatrixPanel
              colorTokens={colorTokens}
              dimensions={dimensions}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />

            {/* Color Scale Lightness Inspector */}
            <LightnessInspectorPanel colorScales={colorScales} />
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
