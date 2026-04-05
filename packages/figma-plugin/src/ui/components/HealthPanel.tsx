import { useState, useMemo } from 'react';
import type { LintViolation } from '../hooks/useLint';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { HeatmapResult } from './HeatmapPanel';
import type { TokenMapEntry } from '../../shared/types';
import type { ValidationIssue, ValidationSummary } from '../hooks/useValidationCache';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { hexToLuminance, wcagContrast, hexToLstar } from '../shared/colorUtils';
import { normalizeHex } from '@tokenmanager/core';
import type { ThemeDimension } from '@tokenmanager/core';
import { LINT_RULE_BY_ID } from '../shared/lintRules';
import { ConfirmModal } from './ConfirmModal';
import { resolveThemeOption } from '../shared/comparisonUtils';

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
// statusDot is kept for completeness
void statusDot;

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

interface DuplicateGroup {
  canonical: string;
  canonicalSet: string;
  tokens: { path: string; setName: string }[];
  colorHex?: string;
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

  // Dashboard strip (health summary cards) — expanded by default so health overview is primary
  const [dashboardExpanded, setDashboardExpanded] = useState(true);

  // ── Analytics section state ─────────────────────────────────────────────────
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [collapsedRules, setCollapsedRules] = useState<Set<string>>(new Set());
  const [validationCopied, setValidationCopied] = useState(false);
  const [validationExported, setValidationExported] = useState<'json' | 'csv' | null>(null);

  // Contrast matrix
  const [showContrastMatrix, setShowContrastMatrix] = useState(false);
  const [contrastPage, setContrastPage] = useState(0);
  const [contrastFailuresOnly, setContrastFailuresOnly] = useState(false);
  const [contrastCopied, setContrastCopied] = useState(false);
  const [contrastGroupFilter, setContrastGroupFilter] = useState<string>('all');
  const [contrastSortMode, setContrastSortMode] = useState<'luminance' | 'failures'>('luminance');
  // Multi-theme contrast: null = all options selected (default)
  const [contrastMultiTheme, setContrastMultiTheme] = useState(false);
  const [contrastThemeFilter, setContrastThemeFilter] = useState<Set<string> | null>(null);

  // Duplicates
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [deduplicating, setDeduplicating] = useState<string | null>(null);
  const [confirmDedup, setConfirmDedup] = useState<{ canonical: string; canonicalSet: string; others: { path: string; setName: string }[] } | null>(null);
  const [bulkDeduplicating, setBulkDeduplicating] = useState(false);
  const [confirmBulkDedup, setConfirmBulkDedup] = useState(false);

  // Lightness inspector
  const [showScaleInspector, setShowScaleInspector] = useState(false);

  // Unused tokens
  const [showUnused, setShowUnused] = useState(false);
  const [confirmDeleteAllUnused, setConfirmDeleteAllUnused] = useState(false);
  const [confirmDeleteUnusedToken, setConfirmDeleteUnusedToken] = useState<{ path: string; set: string } | null>(null);
  const [confirmDeprecateAllUnused, setConfirmDeprecateAllUnused] = useState(false);
  const [confirmDeprecateUnusedToken, setConfirmDeprecateUnusedToken] = useState<{ path: string; set: string } | null>(null);
  const [deletingUnused, setDeletingUnused] = useState<Set<string>>(new Set());
  const [deprecatingUnused, setDeprecatingUnused] = useState<Set<string>>(new Set());
  // reloadKey forces re-computation after mutations
  const [reloadKey, setReloadKey] = useState(0);
  void reloadKey; // consumed via allTokensFlat dependency

  // ── Derived data from allTokensFlat ────────────────────────────────────────

  // Build allTokensUnified: adds set info from pathToSet
  const allTokensUnified = useMemo(() => {
    const result: Record<string, { $value: unknown; $type: string; set: string }> = {};
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      result[path] = { $value: entry.$value, $type: entry.$type, set: pathToSet[path] ?? '' };
    }
    return result;
  }, [allTokensFlat, pathToSet]);

  // Resolve color hex from allTokensUnified (follow alias chains)
  const resolveColorHex = useMemo(() => {
    return (path: string, visited = new Set<string>()): string | null => {
      if (visited.has(path)) return null;
      visited.add(path);
      const entry = allTokensUnified[path];
      if (!entry || entry.$type !== 'color') return null;
      const v = entry.$value;
      if (isAlias(v)) {
        const aliasPath = extractAliasPath(v);
        return aliasPath ? resolveColorHex(aliasPath, visited) : null;
      }
      return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTokensUnified]);

  // Resolved color tokens for contrast matrix (non-alias only, sorted by luminance)
  const colorTokens = useMemo((): { path: string; hex: string }[] => {
    const colors: { path: string; hex: string }[] = [];
    for (const [path, entry] of Object.entries(allTokensUnified)) {
      if (entry.$type !== 'color') continue;
      if (isAlias(entry.$value)) continue;
      const v = entry.$value;
      if (typeof v !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) continue;
      colors.push({ path, hex: normalizeHex(v) });
    }
    return colors.sort((a, b) => (hexToLuminance(a.hex) ?? 0) - (hexToLuminance(b.hex) ?? 0));
  }, [allTokensUnified]);

  // ── Multi-theme contrast support ──────────────────────────────────────────

  // All sets referenced in any theme option (used as the "themed" boundary layer)
  const themedSetsForContrast = useMemo(() => {
    if (dimensions.length === 0) return undefined;
    const sets = new Set<string>();
    for (const dim of dimensions) {
      for (const opt of dim.options) {
        for (const setName of Object.keys(opt.sets)) sets.add(setName);
      }
    }
    return sets.size > 0 ? sets : undefined;
  }, [dimensions]);

  // All available theme option keys: `${dimId}:${optionName}`
  const allThemeOptionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const dim of dimensions) {
      for (const opt of dim.options) keys.add(`${dim.id}:${opt.name}`);
    }
    return keys;
  }, [dimensions]);

  // Effective set of selected theme keys (null => all selected)
  const activeContrastThemeKeys = contrastThemeFilter ?? allThemeOptionKeys;

  // Resolved token flat map per active theme option — only when multi-theme mode is on
  const perThemeResolved = useMemo(() => {
    if (!contrastMultiTheme || dimensions.length === 0) return null;
    const result = new Map<string, Record<string, TokenMapEntry>>();
    for (const dim of dimensions) {
      for (const opt of dim.options) {
        const key = `${dim.id}:${opt.name}`;
        if (!activeContrastThemeKeys.has(key)) continue;
        result.set(key, resolveThemeOption(opt, allTokensFlat, pathToSet, themedSetsForContrast));
      }
    }
    return result.size > 0 ? result : null;
  // activeContrastThemeKeys is derived from state+memo; include its deps directly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrastMultiTheme, dimensions, allTokensFlat, pathToSet, themedSetsForContrast, contrastThemeFilter, allThemeOptionKeys]);

  // In multi-theme mode: Map<path, Map<themeKey, hex>> for all color tokens that
  // resolve in at least one selected theme. Sorted by average luminance.
  const multiThemeColorTokens = useMemo((): { path: string; hexByTheme: Map<string, string> }[] | null => {
    if (!perThemeResolved) return null;
    const hexByThemePerPath = new Map<string, Map<string, string>>();
    const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    for (const [themeKey, resolved] of perThemeResolved) {
      for (const [path, entry] of Object.entries(resolved)) {
        if (entry.$type !== 'color') continue;
        const v = entry.$value;
        if (typeof v !== 'string' || !HEX_RE.test(v)) continue;
        let themeMap = hexByThemePerPath.get(path);
        if (!themeMap) { themeMap = new Map(); hexByThemePerPath.set(path, themeMap); }
        themeMap.set(themeKey, normalizeHex(v));
      }
    }
    const result = [...hexByThemePerPath.entries()].map(([path, hexByTheme]) => ({ path, hexByTheme }));
    // Sort by average luminance across themes
    result.sort((a, b) => {
      const avgLum = (t: typeof a) => {
        let sum = 0; let cnt = 0;
        for (const hex of t.hexByTheme.values()) { const l = hexToLuminance(hex); if (l !== null) { sum += l; cnt++; } }
        return cnt > 0 ? sum / cnt : 0;
      };
      return avgLum(a) - avgLum(b);
    });
    return result;
  }, [perThemeResolved]);

  // All color tokens with alias resolution (for lightness inspector)
  const allColorTokens = useMemo((): { path: string; set: string; hex: string }[] => {
    const colors: { path: string; set: string; hex: string }[] = [];
    for (const [path, entry] of Object.entries(allTokensUnified)) {
      if (entry.$type !== 'color') continue;
      const hex = resolveColorHex(path);
      if (hex) colors.push({ path, set: entry.set, hex: normalizeHex(hex) });
    }
    return colors;
  }, [allTokensUnified, resolveColorHex]);

  // Duplicate groups from validation results
  const lintDuplicateGroups = useMemo((): DuplicateGroup[] => {
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

  // Color scales for lightness inspector (groups with numeric suffix, ≥3 steps)
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

  // Unused tokens (zero Figma usage AND not referenced as an alias)
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

  // For simplicity in HealthPanel, we show all issues without suppression management
  // (suppression is still available in the full validation view via the tokens tab filter)
  const activeIssues = validationIssuesProp
    ? validationIssuesProp.filter(i => i.rule !== 'no-duplicate-values')
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

  const applyValidationFix = async (issue: ValidationIssue) => {
    const key = `${issue.rule}:${issue.setName}:${issue.path}`;
    const tokenUrl = `${serverUrl}/api/tokens/${encodeURIComponent(issue.setName)}/${tokenPathToUrlSegment(issue.path)}`;
    setFixingKeys(prev => { const next = new Set(prev); next.add(key); return next; });
    try {
      if (issue.suggestedFix === 'delete-token') {
        await apiFetch(tokenUrl, { method: 'DELETE' });
      }
      onRefreshValidation();
    } catch {
      onError('Fix failed — check your connection and try again.');
    } finally {
      setFixingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

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

  const handleDeduplicate = async (canonical: string, others: { path: string; setName: string }[]) => {
    setDeduplicating(canonical);
    try {
      await Promise.all(others.map(({ path, setName }) =>
        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(path)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: `{${canonical}}` }),
        })
      ));
      setDeduplicating(null);
      setReloadKey(k => k + 1);
      runValidation();
    } catch (err) {
      console.warn('[HealthPanel] deduplicate failed:', err);
      onError('Deduplicate failed — check your connection and try again.');
      setDeduplicating(null);
    }
  };

  const handleBulkDeduplicate = async () => {
    setBulkDeduplicating(true);
    try {
      const patches: Promise<unknown>[] = [];
      for (const group of lintDuplicateGroups) {
        const others = group.tokens.filter(t => t.path !== group.canonical);
        for (const { path, setName } of others) {
          patches.push(
            apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(path)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $value: `{${group.canonical}}` }),
            })
          );
        }
      }
      await Promise.all(patches);
      setBulkDeduplicating(false);
      setConfirmBulkDedup(false);
      setReloadKey(k => k + 1);
      runValidation();
    } catch (err) {
      console.warn('[HealthPanel] bulk deduplicate failed:', err);
      onError('Bulk deduplicate failed — some tokens may not have been updated.');
      setBulkDeduplicating(false);
    }
  };

  const handleDeleteUnusedToken = async (path: string, set: string) => {
    const key = `${set}:${path}`;
    setDeletingUnused(prev => new Set([...prev, key]));
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, { method: 'DELETE' });
      setReloadKey(k => k + 1);
    } catch (err) {
      console.warn('[HealthPanel] delete unused token failed:', err);
      onError('Delete failed — check your connection and try again.');
    } finally {
      setDeletingUnused(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const handleDeleteAllUnused = async () => {
    setDeletingUnused(new Set(['__all__']));
    try {
      await Promise.all(unusedTokens.map(({ path, set }) =>
        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, { method: 'DELETE' })
      ));
      setConfirmDeleteAllUnused(false);
      setReloadKey(k => k + 1);
    } catch (err) {
      console.warn('[HealthPanel] delete all unused tokens failed:', err);
      onError('Delete failed — some tokens may not have been removed.');
    } finally {
      setDeletingUnused(new Set());
    }
  };

  const handleDeprecateUnusedToken = async (path: string, set: string) => {
    const key = `${set}:${path}`;
    setDeprecatingUnused(prev => new Set([...prev, key]));
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $extensions: { tokenmanager: { lifecycle: 'deprecated' } } }),
      });
      setReloadKey(k => k + 1);
    } catch (err) {
      console.warn('[HealthPanel] deprecate unused token failed:', err);
      onError('Deprecate failed — check your connection and try again.');
    } finally {
      setDeprecatingUnused(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const handleDeprecateAllUnused = async () => {
    setDeprecatingUnused(new Set(['__all__']));
    try {
      await Promise.all(unusedTokens.map(({ path, set }) =>
        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $extensions: { tokenmanager: { lifecycle: 'deprecated' } } }),
        })
      ));
      setConfirmDeprecateAllUnused(false);
      setReloadKey(k => k + 1);
    } catch (err) {
      console.warn('[HealthPanel] deprecate all unused tokens failed:', err);
      onError('Deprecate failed — some tokens may not have been updated.');
    } finally {
      setDeprecatingUnused(new Set());
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

  // ── Overall health ────────────────────────────────────────────────────────
  const overallStatus: HealthStatus =
    lintErrors > 0 || validationErrors > 0 || errorGenerators.length > 0 ? 'critical'
    : lintWarnings > 0 || validationWarnings > 0 || staleGenerators.length > 0 ? 'warning'
    : 'healthy';

  // Issues shown in the health dashboard strip (lint + generators; validation is in the full report below)
  const totalIssues =
    lintErrors + lintWarnings +
    staleGenerators.length + errorGenerators.length;

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

  const totalDuplicateAliases = lintDuplicateGroups.reduce((sum, g) => sum + g.tokens.length - 1, 0);

  function formatValidatedAt(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    return `at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — health-focused */}
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

      {/* Health Dashboard Strip — collapsible summary of lint, generators, canvas, dependencies */}
      {connected && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => setDashboardExpanded(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            aria-expanded={dashboardExpanded}
          >
            <span className={statusColor(overallStatus)}>
              <StatusIcon status={overallStatus} />
            </span>
            <span className="flex-1 text-left font-medium text-[var(--color-figma-text-secondary)]">
              Health summary
              {totalIssues > 0 && (
                <span className={`ml-1.5 ${statusColor(overallStatus)}`}>
                  — {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
                </span>
              )}
              {totalIssues === 0 && (
                <span className="ml-1.5 text-[var(--color-figma-text-secondary)] opacity-60">— all clear</span>
              )}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${dashboardExpanded ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="M2 1l4 3-4 3V1z"/>
            </svg>
          </button>
          {dashboardExpanded && (
            <div className="px-3 py-2 overflow-y-auto max-h-52" style={{ scrollbarWidth: 'thin' }}>
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
                onCta={() => { onNavigateTo('apply', 'coverage'); if (!heatmapResult) onTriggerHeatmap(); }}
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
                detail={`Explore alias chains and find circular or deep references in the Dependencies view`}
                ctaLabel="Explore"
                onCta={() => onNavigateTo('apply', 'dependencies')}
              />
            </div>
          )}
        </div>
      )}

      {/* Body — validation report and analysis as primary content */}
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
            {/* Validation Issues (primary content) */}
            {validationIssuesProp !== null && (
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
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

            {/* Unused Tokens */}
            <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
              <button
                onClick={() => setShowUnused(v => !v)}
                className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
              >
                <span className="flex items-center gap-1.5">
                  {unusedTokens.length > 0 && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                  Unused Tokens
                  {!hasUsageData ? (
                    <span className="normal-case font-normal opacity-60">(requires Figma usage scan)</span>
                  ) : (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] font-mono normal-case">{unusedCount}</span>
                  )}
                </span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showUnused ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
              </button>
              {showUnused && (
                <div>
                  {!hasUsageData ? (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                      No Figma usage data. Go to Define &gt; Tokens to trigger a usage scan, then return here.
                    </div>
                  ) : unusedTokens.length === 0 ? (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                      No unused tokens — all tokens are either used in Figma or referenced by other tokens.
                    </div>
                  ) : (
                    <>
                      <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between gap-2">
                        <span>{unusedTokens.length} token{unusedTokens.length !== 1 ? 's' : ''} with zero Figma usage and no alias dependents.</span>
                        <div className="shrink-0 flex items-center gap-1">
                          {confirmDeprecateAllUnused ? (
                            <>
                              <span className="text-[9px] text-[var(--color-figma-text-secondary)]">Deprecate {unusedTokens.length}?</span>
                              <button onClick={handleDeprecateAllUnused} disabled={deprecatingUnused.has('__all__')} className="text-[9px] px-2 py-0.5 rounded bg-gray-500 text-white hover:opacity-80 disabled:opacity-40 transition-opacity">
                                {deprecatingUnused.has('__all__') ? 'Marking…' : 'Confirm'}
                              </button>
                              <button onClick={() => setConfirmDeprecateAllUnused(false)} className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                                Cancel
                              </button>
                            </>
                          ) : confirmDeleteAllUnused ? (
                            <>
                              <span className="text-[9px] text-[var(--color-figma-text-secondary)]">Delete {unusedTokens.length}?</span>
                              <button onClick={handleDeleteAllUnused} disabled={deletingUnused.has('__all__')} className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-figma-error)] text-white hover:opacity-80 disabled:opacity-40 transition-opacity">
                                {deletingUnused.has('__all__') ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button onClick={() => setConfirmDeleteAllUnused(false)} className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setConfirmDeprecateAllUnused(true)} className="text-[9px] px-2 py-0.5 rounded border border-gray-400/40 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                                Deprecate all
                              </button>
                              <button onClick={() => setConfirmDeleteAllUnused(true)} className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors">
                                Delete all
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                        {unusedTokens.map(({ path, set, $type }) => {
                          const key = `${set}:${path}`;
                          const isDeleting = deletingUnused.has(key) || deletingUnused.has('__all__');
                          const isDeprecating = deprecatingUnused.has(key) || deprecatingUnused.has('__all__');
                          const isBusy = isDeleting || isDeprecating;
                          return (
                            <div key={key} className="group relative flex items-center hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                              <button
                                onClick={() => onNavigateToToken?.(path, set)}
                                disabled={!onNavigateToToken || isBusy}
                                className="flex-1 flex items-center justify-between px-3 py-1.5 text-left disabled:cursor-default"
                              >
                                <span className={`text-[10px] text-[var(--color-figma-text)] font-mono truncate flex-1 ${isBusy ? 'opacity-40' : ''}`}>{path}</span>
                                <span className="flex items-center gap-2 shrink-0 ml-2">
                                  <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{$type}</span>
                                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">{set}</span>
                                </span>
                              </button>
                              <div className="absolute right-1 top-0 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                                {isBusy ? (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setConfirmDeprecateUnusedToken({ path, set })}
                                      className="px-1.5 py-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                      aria-label={`Deprecate ${path}`}
                                      title="Mark as deprecated"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z"/><path d="M4.9 4.9l14.2 14.2"/></svg>
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteUnusedToken({ path, set })}
                                      className="px-1.5 py-1 rounded transition-colors"
                                      aria-label={`Delete ${path}`}
                                      title="Delete token"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-error)]" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Duplicate Values */}
            {lintDuplicateGroups.length > 0 && (
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                <button
                  onClick={() => setShowDuplicates(v => !v)}
                  className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
                >
                  <span className="flex items-center gap-1.5">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                    Duplicate Values ({lintDuplicateGroups.length} group{lintDuplicateGroups.length !== 1 ? 's' : ''})
                  </span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showDuplicates ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                </button>
                {showDuplicates && (
                  <div className="divide-y divide-[var(--color-figma-border)]">
                    {lintDuplicateGroups.length > 1 && (
                      <div className="p-3 flex flex-col gap-2">
                        {confirmBulkDedup ? (
                          <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5">
                            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                              This will convert <span className="font-medium text-[var(--color-figma-text)]">{totalDuplicateAliases} token{totalDuplicateAliases !== 1 ? 's' : ''}</span> across {lintDuplicateGroups.length} groups into aliases.
                            </p>
                            <div className="flex gap-2 mt-0.5">
                              <button disabled={bulkDeduplicating} onClick={handleBulkDeduplicate} className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                                {bulkDeduplicating ? 'Promoting…' : `Confirm — promote ${totalDuplicateAliases} to aliases`}
                              </button>
                              <button onClick={() => setConfirmBulkDedup(false)} className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button disabled={bulkDeduplicating} onClick={() => setConfirmBulkDedup(true)} className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                            {bulkDeduplicating ? 'Promoting…' : `Promote all duplicates to aliases (${totalDuplicateAliases} tokens → ${lintDuplicateGroups.length} canonicals)`}
                          </button>
                        )}
                      </div>
                    )}
                    {lintDuplicateGroups.map(group => {
                      const others = group.tokens.filter(t => t.path !== group.canonical);
                      const isDeduplicating = deduplicating === group.canonical;
                      return (
                        <div key={group.canonical} className="p-3 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            {group.colorHex && <div className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: group.colorHex }} />}
                            <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{group.canonical}</span>
                            <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">— {group.tokens.length} tokens</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {group.tokens.map(t => (
                              <div key={`${t.setName}:${t.path}`} className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1">{t.path}</span>
                                <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{t.setName}</span>
                                {t.path === group.canonical && <span className="text-[8px] text-[var(--color-figma-accent)] shrink-0 font-medium">canonical</span>}
                                {onNavigateToToken && (
                                  <button onClick={() => onNavigateToToken(t.path, t.setName)} className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0">
                                    Go →
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {confirmDedup?.canonical === group.canonical ? (
                            <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5">
                              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                                Replace {others.length} token{others.length !== 1 ? 's' : ''} with an alias to <span className="font-mono text-[var(--color-figma-text)]">{group.canonical}</span>?
                              </p>
                              <div className="flex gap-2 mt-0.5">
                                <button disabled={isDeduplicating} onClick={() => { handleDeduplicate(group.canonical, others); setConfirmDedup(null); }} className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                                  {isDeduplicating ? 'Deduplicating…' : 'Confirm'}
                                </button>
                                <button onClick={() => setConfirmDedup(null)} className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button disabled={isDeduplicating} onClick={() => setConfirmDedup({ canonical: group.canonical, canonicalSet: group.canonicalSet, others })} className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                              {isDeduplicating ? 'Deduplicating…' : `Deduplicate (${others.length} → reference)`}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Color Contrast Matrix */}
            {colorTokens.length >= 2 && (() => {
              const CONTRAST_PAGE_SIZE = 16;
              // Whether cross-theme checking is possible (need at least one dimension with 2+ options)
              const hasMultiThemeOptions = dimensions.some(d => d.options.length >= 2);
              // In multi-theme mode, use resolved theme tokens; otherwise use single-view colorTokens
              const isMultiMode = contrastMultiTheme && multiThemeColorTokens !== null && multiThemeColorTokens.length >= 2;

              // Human-readable label for a theme key (`${dimId}:${optName}`)
              const themeKeyLabel = (key: string): string => {
                const [dimId, optName] = key.split(':');
                const dim = dimensions.find(d => d.id === dimId);
                return dimensions.length > 1 && dim ? `${dim.name}: ${optName}` : (optName ?? key);
              };

              // Source token list for filtering/sorting: unified shape { path, hex, hexByTheme? }
              type MatrixToken = { path: string; hex: string; hexByTheme?: Map<string, string> };
              const sourceTokens: MatrixToken[] = isMultiMode
                ? multiThemeColorTokens!.map(t => {
                    // Representative swatch hex = average-luminance theme's hex (first as fallback)
                    const firstHex = t.hexByTheme.values().next().value as string ?? '#000000';
                    return { path: t.path, hex: firstHex, hexByTheme: t.hexByTheme };
                  })
                : colorTokens;

              const availableGroups = Array.from(new Set(sourceTokens.map(t => t.path.split('.')[0]))).sort();
              const filteredTokens = contrastGroupFilter === 'all' ? sourceTokens : sourceTokens.filter(t => t.path.split('.')[0] === contrastGroupFilter);

              // Cell contrast: in multi-theme mode returns min ratio across themes + per-theme detail
              const getCellContrast = (fg: MatrixToken, bg: MatrixToken): {
                ratio: number | null;
                tooltip: string;
                failingThemeCount: number;
                totalThemeCount: number;
              } => {
                if (isMultiMode && fg.hexByTheme && bg.hexByTheme && perThemeResolved) {
                  const perTheme: { label: string; ratio: number | null }[] = [];
                  for (const themeKey of perThemeResolved.keys()) {
                    const fgHex = fg.hexByTheme.get(themeKey);
                    const bgHex = bg.hexByTheme.get(themeKey);
                    perTheme.push({ label: themeKeyLabel(themeKey), ratio: fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null });
                  }
                  const valid = perTheme.filter((t): t is { label: string; ratio: number } => t.ratio !== null);
                  const minRatio = valid.length > 0 ? Math.min(...valid.map(t => t.ratio)) : null;
                  const failCount = valid.filter(t => t.ratio < 4.5).length;
                  const tooltip = perTheme.map(t => `${t.label}: ${t.ratio !== null ? t.ratio.toFixed(1) + ':1' : 'N/A'}`).join(' | ');
                  return { ratio: minRatio, tooltip, failingThemeCount: failCount, totalThemeCount: valid.length };
                }
                const r = wcagContrast(fg.hex, bg.hex);
                return { ratio: r, tooltip: `${fg.path} on ${bg.path}: ${r?.toFixed(2)}:1`, failingThemeCount: 0, totalThemeCount: 0 };
              };

              let displayTokens: MatrixToken[];
              if (contrastSortMode === 'failures') {
                const failureCounts = new Map<string, number>();
                for (const t of filteredTokens) {
                  let cnt = 0;
                  for (const other of filteredTokens) {
                    if (other.path === t.path) continue;
                    const { ratio } = getCellContrast(t, other);
                    if (ratio !== null && ratio < 4.5) cnt++;
                  }
                  failureCounts.set(t.path, cnt);
                }
                displayTokens = [...filteredTokens].sort((a, b) => (failureCounts.get(b.path) ?? 0) - (failureCounts.get(a.path) ?? 0));
              } else {
                displayTokens = filteredTokens;
              }

              type FailPair = { fg: MatrixToken; bg: MatrixToken; ratio: number; failingThemeCount: number; totalThemeCount: number };
              const allFailingPairs: FailPair[] = [];
              for (let i = 0; i < displayTokens.length; i++) {
                for (let j = 0; j < displayTokens.length; j++) {
                  if (i === j) continue;
                  const { ratio, failingThemeCount, totalThemeCount } = getCellContrast(displayTokens[i], displayTokens[j]);
                  if (ratio !== null && ratio < 4.5) allFailingPairs.push({ fg: displayTokens[i], bg: displayTokens[j], ratio, failingThemeCount, totalThemeCount });
                }
              }
              allFailingPairs.sort((a, b) => a.ratio - b.ratio);
              const totalPages = Math.ceil(displayTokens.length / CONTRAST_PAGE_SIZE);
              const pageStart = contrastPage * CONTRAST_PAGE_SIZE;
              const pagedTokens = displayTokens.slice(pageStart, pageStart + CONTRAST_PAGE_SIZE);

              return (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                  <button onClick={() => setShowContrastMatrix(v => !v)} className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                    <span>Color Contrast Matrix ({contrastGroupFilter === 'all' ? sourceTokens.length : displayTokens.length} tokens{isMultiMode ? ` · ${activeContrastThemeKeys.size} theme${activeContrastThemeKeys.size !== 1 ? 's' : ''}` : ''})</span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showContrastMatrix ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                  </button>
                  {showContrastMatrix && (
                    <div className="overflow-auto max-h-96 p-2">
                      {/* Cross-theme toggle — only shown when theme dimensions exist */}
                      {hasMultiThemeOptions && (
                        <div className="flex items-center gap-2 mb-2 px-1 pb-2 border-b border-[var(--color-figma-border)]">
                          <button
                            onClick={() => { setContrastMultiTheme(v => !v); setContrastPage(0); setContrastThemeFilter(null); }}
                            className={`flex items-center gap-1.5 px-2 py-0.5 text-[9px] rounded border transition-colors ${contrastMultiTheme ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                            title="Check contrast across multiple theme options simultaneously — shows worst-case ratio"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="7"/><circle cx="15" cy="12" r="7"/></svg>
                            Cross-theme
                          </button>
                          {contrastMultiTheme && (
                            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                              {dimensions.map(dim => dim.options.length >= 2 ? (
                                <div key={dim.id} className="flex items-center gap-1 flex-wrap">
                                  {dimensions.length > 1 && <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{dim.name}:</span>}
                                  {dim.options.map(opt => {
                                    const key = `${dim.id}:${opt.name}`;
                                    const isActive = activeContrastThemeKeys.has(key);
                                    return (
                                      <button
                                        key={key}
                                        onClick={() => {
                                          setContrastPage(0);
                                          setContrastThemeFilter(prev => {
                                            const current = prev ?? allThemeOptionKeys;
                                            const next = new Set(current);
                                            if (next.has(key)) {
                                              if (next.size > 1) next.delete(key); // keep at least one
                                            } else {
                                              next.add(key);
                                            }
                                            return next;
                                          });
                                        }}
                                        className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${isActive ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                                      >
                                        {opt.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null)}
                            </div>
                          )}
                        </div>
                      )}
                      {contrastMultiTheme && multiThemeColorTokens === null && (
                        <div className="text-[9px] text-[var(--color-figma-text-secondary)] px-1 mb-2">Resolving theme tokens…</div>
                      )}
                      <div className="flex items-center justify-between mb-2 px-1">
                        <button onClick={() => { setContrastFailuresOnly(v => !v); setContrastPage(0); }} className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded border transition-colors ${contrastFailuresOnly ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                          Failures only{contrastFailuresOnly && allFailingPairs.length > 0 ? ` (${allFailingPairs.length})` : ''}
                        </button>
                        <button onClick={() => {
                          const rows: string[] = isMultiMode
                            ? ['fg_token,bg_token,theme,contrast_ratio,level']
                            : ['fg_token,bg_token,contrast_ratio,level'];
                          for (const fg of displayTokens) {
                            for (const bg of displayTokens) {
                              if (fg.path === bg.path) continue;
                              if (isMultiMode && fg.hexByTheme && bg.hexByTheme && perThemeResolved) {
                                for (const themeKey of perThemeResolved.keys()) {
                                  const fgHex = fg.hexByTheme.get(themeKey);
                                  const bgHex = bg.hexByTheme.get(themeKey);
                                  const r = fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null;
                                  const level = r === null ? 'N/A' : r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : 'Fail';
                                  rows.push(`"${fg.path}","${bg.path}","${themeKeyLabel(themeKey)}",${r !== null ? r.toFixed(2) : ''},"${level}"`);
                                }
                              } else {
                                const r = wcagContrast(fg.hex, bg.hex);
                                const level = r === null ? 'N/A' : r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : 'Fail';
                                rows.push(`"${fg.path}","${bg.path}",${r !== null ? r.toFixed(2) : ''},"${level}"`);
                              }
                            }
                          }
                          navigator.clipboard.writeText(rows.join('\n')).then(() => { setContrastCopied(true); setTimeout(() => setContrastCopied(false), 2000); });
                        }} className="flex items-center gap-1 px-2 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          {contrastCopied ? 'Copied!' : 'Copy as CSV'}
                        </button>
                      </div>
                      {availableGroups.length > 1 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 px-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[8px] text-[var(--color-figma-text-secondary)]">Group:</span>
                            <button onClick={() => { setContrastGroupFilter('all'); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastGroupFilter === 'all' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>All</button>
                            {availableGroups.map(g => (
                              <button key={g} onClick={() => { setContrastGroupFilter(g); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastGroupFilter === g ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>{g}</button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-[8px] text-[var(--color-figma-text-secondary)]">Sort:</span>
                            <button onClick={() => { setContrastSortMode('luminance'); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastSortMode === 'luminance' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>Luminance</button>
                            <button onClick={() => { setContrastSortMode('failures'); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastSortMode === 'failures' ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>Most failures</button>
                          </div>
                        </div>
                      )}
                      {contrastFailuresOnly ? (
                        allFailingPairs.length === 0 ? (
                          <div className="text-[9px] text-[var(--color-figma-text-secondary)] text-center py-4">No failing pairs — all combinations pass AA (≥4.5:1)</div>
                        ) : (
                          <table className="text-[8px] border-collapse w-full" aria-label="Failing color contrast pairs">
                            <thead>
                              <tr className="text-[var(--color-figma-text-secondary)]">
                                <th scope="col" className="px-1 py-0.5 text-left font-normal">Foreground</th>
                                <th scope="col" className="px-1 py-0.5 text-left font-normal">Background</th>
                                <th scope="col" className="px-1 py-0.5 text-right font-normal">Worst ratio</th>
                                {isMultiMode && <th scope="col" className="px-1 py-0.5 text-right font-normal">Fails in</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {allFailingPairs.map(({ fg, bg, ratio, failingThemeCount, totalThemeCount }) => (
                                <tr key={`${fg.path}|${bg.path}`} className="border-t border-[var(--color-figma-border)]">
                                  <td className="px-1 py-0.5"><div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: fg.hex }} /><span className="text-[var(--color-figma-text-secondary)] truncate max-w-[80px]">{fg.path.split('.').pop()}</span></div></td>
                                  <td className="px-1 py-0.5"><div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: bg.hex }} /><span className="text-[var(--color-figma-text-secondary)] truncate max-w-[80px]">{bg.path.split('.').pop()}</span></div></td>
                                  <td className="px-1 py-0.5 text-right"><span className="text-[var(--color-figma-error)]">{ratio.toFixed(1)}:1</span></td>
                                  {isMultiMode && <td className="px-1 py-0.5 text-right text-[var(--color-figma-text-secondary)]">{failingThemeCount}/{totalThemeCount}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      ) : (
                        <>
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mb-2 px-1">
                              <span className="text-[9px] text-[var(--color-figma-text-secondary)]">Tokens {pageStart + 1}–{Math.min(pageStart + CONTRAST_PAGE_SIZE, displayTokens.length)} of {displayTokens.length}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => setContrastPage(p => Math.max(0, p - 1))} disabled={contrastPage === 0} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed" aria-label="Previous page">‹</button>
                                {Array.from({ length: totalPages }, (_, i) => (
                                  <button key={i} onClick={() => setContrastPage(i)} className={`px-1.5 py-0.5 text-[9px] rounded border ${i === contrastPage ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]'}`} aria-label={`Page ${i + 1}`}>{i + 1}</button>
                                ))}
                                <button onClick={() => setContrastPage(p => Math.min(totalPages - 1, p + 1))} disabled={contrastPage === totalPages - 1} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed" aria-label="Next page">›</button>
                              </div>
                            </div>
                          )}
                          <table className="text-[8px] border-collapse" aria-label="Color contrast matrix">
                            <thead>
                              <tr>
                                <th scope="col" className="px-1 py-0.5 text-left text-[var(--color-figma-text-secondary)] font-normal sticky left-0 bg-[var(--color-figma-bg)]">FG \ BG</th>
                                {pagedTokens.map(bg => (
                                  <th key={bg.path} scope="col" title={bg.path} className="px-1 py-0.5 text-center font-normal max-w-[40px]">
                                    <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] mx-auto" style={{ background: bg.hex }} aria-hidden="true" />
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {pagedTokens.map(fg => (
                                <tr key={fg.path}>
                                  <th scope="row" className="px-1 py-0.5 sticky left-0 bg-[var(--color-figma-bg)] font-normal">
                                    <div className="flex items-center gap-1">
                                      <div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: fg.hex }} aria-hidden="true" />
                                      <span className="text-[var(--color-figma-text-secondary)] truncate max-w-[60px]">{fg.path.split('.').pop()}</span>
                                    </div>
                                  </th>
                                  {pagedTokens.map(bg => {
                                    if (fg.path === bg.path) return <td key={bg.path} className="px-1 py-0.5 text-center bg-[var(--color-figma-bg-hover)]" aria-label="same token">—</td>;
                                    const { ratio: r, tooltip, failingThemeCount, totalThemeCount } = getCellContrast(fg, bg);
                                    const aa = r !== null && r >= 4.5;
                                    const aaa = r !== null && r >= 7;
                                    // In multi-theme mode, mark cells that pass overall but fail in some themes
                                    const partialFail = isMultiMode && aa && failingThemeCount > 0;
                                    return (
                                      <td key={bg.path} title={tooltip} className={`px-1 py-0.5 text-center ${aaa ? 'bg-[var(--color-figma-success)]/20' : aa ? (partialFail ? 'bg-amber-500/20' : 'bg-[var(--color-figma-warning)]/10') : 'bg-[var(--color-figma-error)]/10'}`}>
                                        <span className={aaa ? 'text-[var(--color-figma-success)]' : aa ? (partialFail ? 'text-amber-500' : 'text-[var(--color-figma-warning)]') : 'text-[var(--color-figma-error)]'} aria-hidden="true">
                                          {r !== null ? r.toFixed(1) : '—'}
                                        </span>
                                        {isMultiMode && !aaa && failingThemeCount > 0 && totalThemeCount > 0 && (
                                          <span className="block text-[6px] leading-none mt-0.5 text-[var(--color-figma-text-secondary)]">{failingThemeCount}/{totalThemeCount}</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex gap-3 mt-2 px-1 text-[8px] text-[var(--color-figma-text-secondary)]">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-success)]/20 border border-[var(--color-figma-success)]/40" />AAA (≥7:1)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-warning)]/10 border border-[var(--color-figma-warning)]/40" />AA (≥4.5:1)</span>
                            {isMultiMode && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/20 border border-amber-500/40" />AA in some themes</span>}
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30" />Fail</span>
                          </div>
                          {isMultiMode && (
                            <p className="mt-1 px-1 text-[8px] text-[var(--color-figma-text-secondary)]">Ratio shown is the worst case across selected themes. Hover a cell to see per-theme breakdown.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Color Scale Lightness Inspector */}
            {colorScales.length > 0 && (
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                <button onClick={() => setShowScaleInspector(v => !v)} className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  <span>Color Scale Lightness ({colorScales.length} scale{colorScales.length !== 1 ? 's' : ''})</span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showScaleInspector ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                </button>
                {showScaleInspector && (
                  <div className="divide-y divide-[var(--color-figma-border)] p-3 flex flex-col gap-4">
                    {colorScales.map(({ parent, steps }) => {
                      const lValues = steps.map(s => ({ label: s.label, hex: s.hex, l: hexToLstar(s.hex) ?? 0 }));
                      const lMin = Math.min(...lValues.map(v => v.l));
                      const lMax = Math.max(...lValues.map(v => v.l));
                      const range = lMax - lMin || 1;
                      const gaps = lValues.slice(1).map((v, i) => Math.abs(v.l - lValues[i].l));
                      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                      const W = 200, H = 40;
                      const pts = lValues.map((v, i) => {
                        const x = (i / (lValues.length - 1)) * W;
                        const y = H - ((v.l - lMin) / range) * H;
                        return { x, y, l: v.l, label: v.label, hex: v.hex, isAnom: i > 0 && Math.abs(v.l - lValues[i - 1].l) > avgGap * 2 };
                      });
                      const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
                      return (
                        <div key={parent}>
                          <div className="text-[10px] font-medium text-[var(--color-figma-text)] mb-2">{parent}</div>
                          <svg width={W} height={H + 16} className="overflow-visible">
                            <polyline points={polyline} fill="none" stroke="var(--color-figma-accent)" strokeWidth="1.5" />
                            {pts.map((p, i) => (
                              <g key={i}>
                                <circle cx={p.x} cy={p.y} r={p.isAnom ? 4 : 3} fill={p.isAnom ? '#ef4444' : p.hex} stroke={p.isAnom ? '#ef4444' : 'var(--color-figma-border)'} strokeWidth="1" />
                                <text x={p.x} y={H + 12} textAnchor="middle" fontSize="7" fill="var(--color-figma-text-secondary)">{p.label}</text>
                              </g>
                            ))}
                          </svg>
                          {pts.some(p => p.isAnom) && (
                            <div className="text-[10px] text-[var(--color-figma-warning)] mt-1 flex items-center gap-1">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                              Uneven lightness steps detected
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {confirmDeleteUnusedToken && (
      <ConfirmModal
        title="Delete unused token?"
        description={`"${confirmDeleteUnusedToken.path}" (${confirmDeleteUnusedToken.set}) will be permanently deleted.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          const { path, set } = confirmDeleteUnusedToken;
          setConfirmDeleteUnusedToken(null);
          await handleDeleteUnusedToken(path, set);
        }}
        onCancel={() => setConfirmDeleteUnusedToken(null)}
      />
    )}
    {confirmDeprecateUnusedToken && (
      <ConfirmModal
        title="Deprecate unused token?"
        description={`"${confirmDeprecateUnusedToken.path}" will be marked as deprecated. It will no longer appear in this list and can be deleted later.`}
        confirmLabel="Deprecate"
        onConfirm={async () => {
          const { path, set } = confirmDeprecateUnusedToken;
          setConfirmDeprecateUnusedToken(null);
          await handleDeprecateUnusedToken(path, set);
        }}
        onCancel={() => setConfirmDeprecateUnusedToken(null)}
      />
    )}
    </>
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
