import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Spinner } from './Spinner';
import { normalizeHex, flattenTokenGroup } from '@tokenmanager/core';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { hexToLuminance, wcagContrast, hexToLstar } from '../shared/colorUtils';
import { countLeafNodes, tokenPathToUrlSegment } from '../shared/utils';
import { STORAGE_KEYS, lsGetJson, lsSetJson } from '../shared/storage';
import { LINT_RULE_BY_ID } from '../shared/lintRules';
import { apiFetch } from '../shared/apiFetch';
import type { ValidationIssue } from '../hooks/useValidationCache';

interface SetStats {
  name: string;
  description?: string;
  total: number;
  byType: Record<string, number>;
}

interface AnalyticsPanelProps {
  serverUrl: string;
  connected: boolean;
  tokenUsageCounts?: Record<string, number>;
  onNavigateToToken?: (path: string, set: string) => void;
  onValidationComplete?: (count: number) => void;
  /** Shared validation cache — avoids re-fetching when switching from Health tab */
  validateResults: ValidationIssue[] | null;
  validateLoading: boolean;
  validateError: string | null;
  validatedAt: Date | null;
  resultsStale: boolean;
  onRefreshValidation: () => void;
}



/** Human-friendly labels & tips for built-in validation issues */
const VALIDATION_LABELS: Record<string, { label: string; tip: string }> = {
  'missing-type':       { label: 'Missing type',           tip: 'Add a $type to make the token spec-compliant' },
  'broken-alias':       { label: 'Broken reference',       tip: 'The referenced token doesn\'t exist — update or remove the reference' },
  'circular-reference': { label: 'Circular reference',     tip: 'Break the reference loop so the token can resolve' },
  'max-alias-depth':    { label: 'Deep reference chain',   tip: 'Shorten the chain by pointing closer to the source token' },
  'type-mismatch':      { label: 'Type / value mismatch',  tip: 'The value doesn\'t match the declared $type' },
};

/** Combined lookup: validation rules + lint rules (from shared registry) */
function getRuleLabel(rule: string): { label: string; tip: string } | undefined {
  return VALIDATION_LABELS[rule] ?? (LINT_RULE_BY_ID[rule] ? { label: LINT_RULE_BY_ID[rule].label, tip: LINT_RULE_BY_ID[rule].tip } : undefined);
}

interface DuplicateGroup {
  canonical: string;
  canonicalSet: string;
  tokens: { path: string; setName: string }[];
  colorHex?: string;
}

export function AnalyticsPanel({ serverUrl, connected, tokenUsageCounts, onNavigateToToken, onValidationComplete, validateResults, validateLoading, validateError, validatedAt: validatedAtProp, resultsStale: resultsStaleFromCache, onRefreshValidation }: AnalyticsPanelProps) {
  const [stats, setStats] = useState<SetStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [validationCopied, setValidationCopied] = useState(false);
  const [validationExported, setValidationExported] = useState<'json' | 'csv' | null>(null);
  const [colorTokens, setColorTokens] = useState<{ path: string; hex: string }[]>([]);
  const [showContrastMatrix, setShowContrastMatrix] = useState(false);
  const [contrastPage, setContrastPage] = useState(0);
  const [contrastFailuresOnly, setContrastFailuresOnly] = useState(false);
  const [contrastCopied, setContrastCopied] = useState(false);
  const [contrastGroupFilter, setContrastGroupFilter] = useState<string>('all');
  const [contrastSortMode, setContrastSortMode] = useState<'luminance' | 'failures'>('luminance');
  const [allColorTokens, setAllColorTokens] = useState<{ path: string; set: string; hex: string }[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [deduplicating, setDeduplicating] = useState<string | null>(null); // canonical path being deduplicated
  const [confirmDedup, setConfirmDedup] = useState<{ canonical: string; canonicalSet: string; others: { path: string; setName: string }[] } | null>(null);
  const [bulkDeduplicating, setBulkDeduplicating] = useState(false);
  const [confirmBulkDedup, setConfirmBulkDedup] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showScaleInspector, setShowScaleInspector] = useState(false);
  // resultsStale and validatedAt come from the shared validation cache via props
  const resultsStale = resultsStaleFromCache;
  const validatedAt = validatedAtProp;
  const [collapsedRules, setCollapsedRules] = useState<Set<string>>(new Set());
  const [suppressedKeys, setSuppressedKeys] = useState<Set<string>>(
    () => new Set(lsGetJson<string[]>(STORAGE_KEYS.ANALYTICS_SUPPRESSIONS, []))
  );
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [allTokensUnified, setAllTokensUnified] = useState<Record<string, { $value: unknown; $type: string; set: string }>>({});
  const [showUnused, setShowUnused] = useState(false);
  const [confirmDeleteAllUnused, setConfirmDeleteAllUnused] = useState(false);
  const [deletingUnused, setDeletingUnused] = useState<Set<string>>(new Set()); // 'all' or 'set:path'
  const [fixingKeys, setFixingKeys] = useState<Set<string>>(new Set()); // issue keys currently being fixed

  // Component coverage state
  const [coverageResult, setCoverageResult] = useState<{
    totalComponents: number;
    tokenizedComponents: number;
    untokenized: { id: string; name: string; hardcodedCount: number }[];
    totalUntokenized: number;
  } | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  const coveragePendingRef = useRef<Map<string, (data: any) => void>>(new Map());
  const coverageCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    lsSetJson(STORAGE_KEYS.ANALYTICS_SUPPRESSIONS, [...suppressedKeys]);
  }, [suppressedKeys]);

  // Notify parent of validation issue count whenever results change
  useEffect(() => {
    if (validateResults !== null) {
      onValidationComplete?.(validateResults.length);
    }
  }, [validateResults, onValidationComplete]);

  const runValidate = onRefreshValidation;

  // Listen for component-coverage-result / component-coverage-error from controller
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'component-coverage-result' && msg.correlationId) {
        const resolve = coveragePendingRef.current.get(msg.correlationId);
        if (resolve) {
          coveragePendingRef.current.delete(msg.correlationId);
          resolve(msg);
        }
      } else if (msg?.type === 'component-coverage-error' && msg.correlationId) {
        const resolve = coveragePendingRef.current.get(msg.correlationId);
        if (resolve) {
          coveragePendingRef.current.delete(msg.correlationId);
          // Reject by resolving with an error marker; the caller checks coverageError separately
          resolve({ __error: msg.error });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const runCoverageScan = useCallback(async () => {
    // Cancel any in-progress scan before starting a new one
    coverageCancelRef.current?.();
    setCoverageLoading(true);
    setCoverageResult(null);
    setCoverageError(null);
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const cid = `coverage-${Date.now()}-${Math.random()}`;
        let done = false;
        const finish = (data: any) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          coveragePendingRef.current.delete(cid);
          coverageCancelRef.current = null;
          resolve(data);
        };
        const timeout = setTimeout(() => {
          if (done) return;
          done = true;
          coveragePendingRef.current.delete(cid);
          coverageCancelRef.current = null;
          parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
          reject(new Error('Scan timed out'));
        }, 30000);
        coveragePendingRef.current.set(cid, finish);
        coverageCancelRef.current = () => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          coveragePendingRef.current.delete(cid);
          coverageCancelRef.current = null;
          parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
          reject(new Error('Cancelled'));
        };
        parent.postMessage({ pluginMessage: { type: 'scan-component-coverage', correlationId: cid } }, '*');
      });
      if (result?.__error) {
        setCoverageError(`Scan failed: ${result.__error}`);
      } else {
        setCoverageResult(result);
        setShowCoverage(true);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Cancelled') {
        // User cancelled — clear state silently
        return;
      }
      setCoverageError(err instanceof Error && err.message === 'Scan timed out'
        ? 'Scan timed out. Try selecting fewer components.'
        : 'Scan failed. Make sure the plugin is running on the Figma canvas.');
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);

    const controller = new AbortController();

    const load = async () => {
      const setsData = await apiFetch<{ sets?: string[]; descriptions?: Record<string, string> }>(`${serverUrl}/api/sets`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const sets: string[] = setsData.sets || [];
      const descriptions: Record<string, string> = setsData.descriptions || {};

      // Fetch all sets' flat tokens and collect color tokens
      const allFlatBySet: Record<string, Record<string, { $value: unknown; $type: string }>> = {};
      const allColors: { path: string; hex: string }[] = [];
      const results = await Promise.all(
        sets.map(async (name) => {
          const data = await apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(name)}`, { signal: controller.signal });
          const nestedTokens = data.tokens || {};
          // Flatten nested DTCG group into a path→token map
          const flatMap = flattenTokenGroup(nestedTokens as Parameters<typeof flattenTokenGroup>[0]);
          const flat: Record<string, { $value: unknown; $type: string }> = {};
          for (const [path, token] of flatMap) {
            flat[path] = { $value: token.$value, $type: token.$type || 'unknown' };
          }
          allFlatBySet[name] = flat;
          const { total, byType } = countLeafNodes(nestedTokens);
          for (const [p, t] of Object.entries(flat)) {
            if (t.$type === 'color' && typeof t.$value === 'string' && !t.$value.startsWith('{') && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t.$value)) {
              allColors.push({ path: p, hex: normalizeHex(t.$value) });
            }
          }
          return { name, description: descriptions[name], total, byType };
        })
      );
      if (controller.signal.aborted) return;
      setStats(results);
      setColorTokens(
        allColors
          .sort((a, b) => (hexToLuminance(a.hex) ?? 0) - (hexToLuminance(b.hex) ?? 0))
      );
      setContrastPage(0);

      // Build a unified flat map for alias resolution
      const unifiedFlat: Record<string, { $value: unknown; $type: string; set: string }> = {};
      for (const [s, flat] of Object.entries(allFlatBySet)) {
        for (const [p, t] of Object.entries(flat)) {
          unifiedFlat[p] = { ...t, set: s };
        }
      }
      // Resolve color tokens (follow alias chains, cycle-safe)
      const resolveHex = (path: string, visited = new Set<string>()): string | null => {
        if (visited.has(path)) return null;
        visited.add(path);
        const entry = unifiedFlat[path];
        if (!entry || entry.$type !== 'color') return null;
        const v = entry.$value;
        if (isAlias(v)) {
          return resolveHex(extractAliasPath(v)!, visited);
        }
        return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : null;
      };
      const resolvedColors: { path: string; set: string; hex: string }[] = [];
      for (const [p, e] of Object.entries(unifiedFlat)) {
        if (e.$type === 'color') {
          const hex = resolveHex(p);
          if (hex) resolvedColors.push({ path: p, set: e.set, hex: normalizeHex(hex) });
        }
      }
      setAllColorTokens(resolvedColors);
      setAllTokensUnified(unifiedFlat);

      setLoading(false);
    };

    load().catch((err) => {
      if (err?.name !== 'AbortError') {
        setLoading(false);
        setLoadError(err?.message || 'Failed to load analytics');
      }
    });

    return () => controller.abort();
  }, [serverUrl, connected, reloadKey]);

  // Derive duplicate groups from validation results (no-duplicate-values lint rule).
  // Groups are keyed by canonical path (shortest token in each duplicate set).
  // Must be before early returns to satisfy rules-of-hooks.
  const lintDuplicateGroups = useMemo((): DuplicateGroup[] => {
    if (!validateResults) return [];
    const dupViolations = validateResults.filter(v => v.rule === 'no-duplicate-values' && v.group);
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
  }, [validateResults, allTokensUnified]);

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to view analytics
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Loading analytics...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-error,#e85d4a)] text-[11px]">
        {loadError}
      </div>
    );
  }

  const totalTokens = stats.reduce((sum, s) => sum + s.total, 0);

  // Empty state — no tokens exist yet
  if (totalTokens === 0) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          {/* Icon */}
          <div className="mb-4 w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 5-9" />
            </svg>
          </div>

          <div className="flex flex-col gap-1 mb-4">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">No tokens to analyze</p>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
              Analytics will show token counts, type distribution, color palettes, and validation issues once you have tokens in your project.
            </p>
          </div>

          <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            Create tokens manually or import a tokens.json file to get started.
          </p>
        </div>
      </div>
    );
  }

  const suppressKey = (issue: ValidationIssue) => `${issue.rule}:${issue.setName}:${issue.path}`;

  const applyFix = async (issue: ValidationIssue) => {
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
      await runValidate();
    } catch {
      // silently leave result stale; re-validate button remains
    } finally {
      setFixingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  // no-duplicate-values violations are excluded here — they are displayed in
  // the dedicated Duplicate Values section below with grouping and deduplicate actions.
  const activeIssues = validateResults
    ? validateResults.filter(i => i.rule !== 'no-duplicate-values' && !suppressedKeys.has(suppressKey(i)))
    : null;
  const suppressedIssues = validateResults
    ? validateResults.filter(i => i.rule !== 'no-duplicate-values' && suppressedKeys.has(suppressKey(i)))
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

  // Group filtered issues by rule for collapsible sections
  const issueGroups: { rule: string; label: string; tip: string; severity: 'error' | 'warning' | 'info'; issues: ValidationIssue[] }[] = (() => {
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

  // Detect color scales: groups of color tokens with numeric suffix under same parent
  const colorScales = (() => {
    const parentGroups = new Map<string, { path: string; label: string; hex: string }[]>();
    for (const t of allColorTokens) {
      const parts = t.path.split('.');
      const last = parts[parts.length - 1];
      if (!/^\d+$/.test(last)) continue; // only numeric last segment
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
  })();


  // Compute unused tokens: zero Figma usage count AND not referenced by any other token as an alias
  const unusedTokens = useMemo(() => {
    if (!tokenUsageCounts || Object.keys(allTokensUnified).length === 0) return [];
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
      .filter(([path]) => (tokenUsageCounts[path] ?? 0) === 0 && !referencedPaths.has(path))
      .map(([path, entry]) => ({ path, set: entry.set, $type: entry.$type }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [tokenUsageCounts, allTokensUnified]);

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
      runValidate();
    } catch (err) {
      console.warn('[AnalyticsPanel] deduplicate operation failed:', err);
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
      runValidate();
    } catch (err) {
      console.warn('[AnalyticsPanel] bulk deduplicate failed:', err);
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
      console.warn('[AnalyticsPanel] delete unused token failed:', err);
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
      console.warn('[AnalyticsPanel] delete all unused tokens failed:', err);
    } finally {
      setDeletingUnused(new Set());
    }
  };

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
    <div className="flex flex-col gap-3 p-3">
      {/* Validate header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Token Analytics</span>
        <button
          onClick={runValidate}
          disabled={validateLoading || !connected}
          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
            resultsStale
              ? 'border-[var(--color-figma-warning)] text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10 hover:bg-[var(--color-figma-warning)]/20'
              : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
          } disabled:opacity-40`}
        >
          {validateLoading ? 'Validating…' : resultsStale ? 'Re-validate' : 'Validate All'}
        </button>
      </div>

      {/* Stale results hint */}
      {resultsStale && validateResults !== null && !validateLoading && (
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/5 text-[10px] text-[var(--color-figma-text-secondary)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          Tokens changed since last validation{validatedAt ? ` (${formatValidatedAt(validatedAt)})` : ''} — re-validate to see current results.
        </div>
      )}

      {/* Validation error */}
      {!validateLoading && validateError && (
        <div className="text-[10px] text-[var(--color-figma-error)] px-1 py-1">
          {validateError}
        </div>
      )}

      {/* Validation results */}
      {validateResults !== null && (
        <div className={`rounded border overflow-hidden ${resultsStale ? 'border-[var(--color-figma-border)] opacity-70' : 'border-[var(--color-figma-border)]'}`}>
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
              Validation
              {validatedAt && !resultsStale && (
                <span className="normal-case font-normal tracking-normal text-[var(--color-figma-text-tertiary)]">{formatValidatedAt(validatedAt)}</span>
              )}
              {severityCounts && validateResults.length > 0 && (
                <span className="flex items-center gap-1 normal-case font-normal tracking-normal">
                  {severityCounts.error > 0 && (
                    <span className="text-[var(--color-figma-error)]">{severityCounts.error} error{severityCounts.error !== 1 ? 's' : ''}</span>
                  )}
                  {severityCounts.warning > 0 && (
                    <span className="text-[var(--color-figma-warning)]">{severityCounts.warning} warning{severityCounts.warning !== 1 ? 's' : ''}</span>
                  )}
                  {severityCounts.info > 0 && (
                    <span className="text-[var(--color-figma-accent)]">{severityCounts.info} info</span>
                  )}
                </span>
              )}
              {validateResults.length === 0 && (
                <span className="normal-case font-normal tracking-normal text-[var(--color-figma-success)]">All clear</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const lines: string[] = [`# Validation Report — ${validateResults.length} issue${validateResults.length !== 1 ? 's' : ''}\n`];
                  for (const sev of ['error', 'warning', 'info'] as const) {
                    const group = validateResults.filter(i => i.severity === sev);
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
                title="Copy report as Markdown"
              >
                {validationCopied ? 'Copied!' : 'Copy MD'}
              </button>
              <button
                onClick={() => {
                  const payload = {
                    generatedAt: new Date().toISOString(),
                    total: validateResults.length,
                    counts: { error: severityCounts?.error ?? 0, warning: severityCounts?.warning ?? 0, info: severityCounts?.info ?? 0 },
                    issues: validateResults.map(i => ({
                      severity: i.severity,
                      rule: i.rule,
                      set: i.setName,
                      path: i.path,
                      message: i.message,
                      ...(i.suggestedFix ? { suggestedFix: i.suggestedFix } : {}),
                    })),
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'validation-report.json';
                  a.click();
                  URL.revokeObjectURL(url);
                  setValidationExported('json');
                  setTimeout(() => setValidationExported(null), 1500);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                title="Save report as JSON"
              >
                {validationExported === 'json' ? 'Saved!' : 'JSON'}
              </button>
              <button
                onClick={() => {
                  const header = 'severity,rule,set,path,message,suggestedFix';
                  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
                  const rows = validateResults.map(i =>
                    [i.severity, i.rule, i.setName, i.path, i.message, i.suggestedFix ?? ''].map(escape).join(',')
                  );
                  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'validation-report.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                  setValidationExported('csv');
                  setTimeout(() => setValidationExported(null), 1500);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                title="Save report as CSV"
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
                      ? f === 'error'
                        ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10'
                        : f === 'warning'
                        ? 'border-[var(--color-figma-warning)] text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10'
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
              {validateResults.every(i => i.rule === 'no-duplicate-values') ? (
                <>
                  <div className="text-[16px] mb-1">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                  </div>
                  <div className="text-[11px] font-medium text-[var(--color-figma-text)]">All tokens valid</div>
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">No broken references, type mismatches, or circular references.{lintDuplicateGroups.length > 0 ? ' Duplicate values are shown below.' : ''}</div>
                </>
              ) : (
                <div className="text-[11px] text-[var(--color-figma-text-secondary)]">No issues match this filter</div>
              )}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {issueGroups.map(group => {
                const isCollapsed = collapsedRules.has(group.rule);
                return (
                  <div key={group.rule}>
                    {/* Rule group header */}
                    <div className="group/ruleheader flex items-center bg-[var(--color-figma-bg-secondary)]/50 border-y border-[var(--color-figma-border)]">
                      <button
                        onClick={() => setCollapsedRules(prev => {
                          const next = new Set(prev);
                          if (next.has(group.rule)) next.delete(group.rule); else next.add(group.rule);
                          return next;
                        })}
                        aria-label={isCollapsed ? `Expand ${group.rule}` : `Collapse ${group.rule}`}
                        className="flex-1 flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors min-w-0"
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                        <span className={`text-[10px] px-1 py-0.5 rounded border shrink-0 font-medium ${
                          group.severity === 'error'
                            ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/5'
                            : group.severity === 'warning'
                            ? 'border-[var(--color-figma-warning)] text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10'
                            : 'border-[var(--color-figma-accent)]/50 text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
                        }`}>
                          {group.severity === 'error' ? 'Error' : group.severity === 'warning' ? 'Warn' : 'Info'}
                        </span>
                        <span className="text-[10px] font-medium text-[var(--color-figma-text)] flex-1 text-left">{group.label}</span>
                        <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{group.issues.length}</span>
                      </button>
                      <button
                        onClick={() => setSuppressedKeys(prev => {
                          const next = new Set(prev);
                          group.issues.forEach(issue => next.add(suppressKey(issue)));
                          return next;
                        })}
                        className="opacity-0 group-hover/ruleheader:opacity-100 pointer-events-none group-hover/ruleheader:pointer-events-auto transition-opacity text-[10px] px-2 py-1.5 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] shrink-0 border-l border-[var(--color-figma-border)]"
                        title={`Suppress all ${group.issues.length} ${group.label} findings`}
                      >
                        Suppress all
                      </button>
                    </div>
                    {/* Tip line */}
                    {!isCollapsed && group.tip && (
                      <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]/30 border-b border-[var(--color-figma-border)] flex items-center gap-1">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-50"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                        {group.tip}
                      </div>
                    )}
                    {/* Issue rows */}
                    {!isCollapsed && group.issues.map((issue, i) => (
                      <div key={i} className="group px-3 py-1.5 flex items-center gap-2 border-b border-[var(--color-figma-border)] last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-[10px] text-[var(--color-figma-text)] font-medium font-mono truncate">{issue.path}</span>
                            <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">{issue.setName}</span>
                          </div>
                          <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">{issue.message}</div>
                        </div>
                        <button
                          onClick={() => setSuppressedKeys(prev => {
                            const next = new Set(prev);
                            next.add(suppressKey(issue));
                            return next;
                          })}
                          className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
                          title="Suppress this finding"
                        >
                          Suppress
                        </button>
                        {(issue.suggestedFix === 'add-description' ||
                          ((issue.suggestedFix === 'flatten-alias-chain' || issue.suggestedFix === 'extract-to-alias') && !!issue.suggestion) ||
                          issue.suggestedFix === 'delete-token' ||
                          (issue.suggestedFix === 'rename-token' && !!issue.suggestion) ||
                          (issue.suggestedFix === 'fix-type' && !!issue.suggestion)
                        ) && (
                          <button
                            onClick={() => applyFix(issue)}
                            disabled={fixingKeys.has(suppressKey(issue))}
                            className={`opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[10px] px-1.5 py-0.5 rounded border shrink-0 disabled:opacity-40 disabled:cursor-wait ${
                              issue.suggestedFix === 'delete-token'
                                ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10'
                                : 'border-[var(--color-figma-success,#34a853)] text-[var(--color-figma-success,#34a853)] hover:bg-[var(--color-figma-success,#34a853)]/10'
                            }`}
                            title={
                              issue.suggestedFix === 'add-description' ? 'Add an empty $description field' :
                              issue.suggestedFix === 'flatten-alias-chain' ? `Point directly to ${issue.suggestion}` :
                              issue.suggestedFix === 'extract-to-alias' ? `Alias to ${issue.suggestion}` :
                              issue.suggestedFix === 'delete-token' ? 'Delete this token (the alias target no longer exists)' :
                              issue.suggestedFix === 'rename-token' ? `Rename to ${issue.suggestion}` :
                              `Change $type to "${issue.suggestion}"`
                            }
                          >
                            {fixingKeys.has(suppressKey(issue)) ? '…' :
                              issue.suggestedFix === 'add-description' ? 'Add desc' :
                              issue.suggestedFix === 'flatten-alias-chain' ? 'Flatten' :
                              issue.suggestedFix === 'extract-to-alias' ? 'Make alias' :
                              issue.suggestedFix === 'delete-token' ? 'Delete' :
                              issue.suggestedFix === 'rename-token' ? 'Rename' :
                              `Fix type`}
                          </button>
                        )}
                        {onNavigateToToken && (
                          <button
                            onClick={() => {
                              onNavigateToToken(issue.path, issue.setName);
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
                            title="Go to token"
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
          {/* Suppressed items footer */}
          {suppressedIssues && suppressedIssues.length > 0 && (
            <div className="border-t border-[var(--color-figma-border)]">
              <button
                onClick={() => setShowSuppressed(s => !s)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <span>{suppressedIssues.length} suppressed finding{suppressedIssues.length !== 1 ? 's' : ''}</span>
                <span className="flex items-center gap-1">
                  {showSuppressed ? 'hide' : 'show'}
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showSuppressed ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                </span>
              </button>
              {showSuppressed && (
                <div className="divide-y divide-[var(--color-figma-border)]">
                  {suppressedIssues.map((issue, i) => (
                    <div key={i} className="group px-3 py-1.5 flex items-center gap-2 opacity-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-[10px] text-[var(--color-figma-text)] font-medium font-mono truncate line-through">{issue.path}</span>
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{issue.setName}</span>
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{getRuleLabel(issue.rule)?.label ?? issue.rule}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSuppressedKeys(prev => {
                          const next = new Set(prev);
                          next.delete(suppressKey(issue));
                          return next;
                        })}
                        className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
                        title="Unsuppress this finding"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                  <div className="px-3 py-1.5 flex justify-end">
                    <button
                      onClick={() => setSuppressedKeys(new Set())}
                      className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                    >
                      Clear all suppressions
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Contrast matrix */}
      {colorTokens.length >= 2 && (() => {
        const CONTRAST_PAGE_SIZE = 16;

        // Derive unique groups (first path segment) for group filter
        const availableGroups = Array.from(new Set(colorTokens.map(t => t.path.split('.')[0]))).sort();

        // Filter by selected group
        const filteredTokens = contrastGroupFilter === 'all'
          ? colorTokens
          : colorTokens.filter(t => t.path.split('.')[0] === contrastGroupFilter);

        // Sort: luminance (default, already applied at load time) or by failure count descending
        let displayTokens: { path: string; hex: string }[];
        if (contrastSortMode === 'failures') {
          const failureCounts = new Map<string, number>();
          for (const t of filteredTokens) {
            let cnt = 0;
            for (const other of filteredTokens) {
              if (other.path === t.path) continue;
              const r = wcagContrast(t.hex, other.hex);
              if (r !== null && r < 4.5) cnt++;
            }
            failureCounts.set(t.path, cnt);
          }
          displayTokens = [...filteredTokens].sort((a, b) => (failureCounts.get(b.path) ?? 0) - (failureCounts.get(a.path) ?? 0));
        } else {
          displayTokens = filteredTokens;
        }

        // Build all failing pairs for the failures list and CSV export (from displayTokens)
        const allFailingPairs: { fg: { path: string; hex: string }; bg: { path: string; hex: string }; ratio: number }[] = [];
        for (let i = 0; i < displayTokens.length; i++) {
          for (let j = 0; j < displayTokens.length; j++) {
            if (i === j) continue;
            const r = wcagContrast(displayTokens[i].hex, displayTokens[j].hex);
            if (r !== null && r < 4.5) {
              allFailingPairs.push({ fg: displayTokens[i], bg: displayTokens[j], ratio: r });
            }
          }
        }
        allFailingPairs.sort((a, b) => a.ratio - b.ratio);

        const handleCopyCSV = () => {
          const rows: string[] = ['fg_token,bg_token,contrast_ratio,level'];
          for (const fg of displayTokens) {
            for (const bg of displayTokens) {
              if (fg.path === bg.path) continue;
              const r = wcagContrast(fg.hex, bg.hex);
              const level = r === null ? 'N/A' : r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : 'Fail';
              rows.push(`"${fg.path}","${bg.path}",${r !== null ? r.toFixed(2) : ''},"${level}"`);
            }
          }
          navigator.clipboard.writeText(rows.join('\n')).then(() => {
            setContrastCopied(true);
            setTimeout(() => setContrastCopied(false), 2000);
          });
        };

        const totalPages = Math.ceil(displayTokens.length / CONTRAST_PAGE_SIZE);
        const pageStart = contrastPage * CONTRAST_PAGE_SIZE;
        const pagedTokens = displayTokens.slice(pageStart, pageStart + CONTRAST_PAGE_SIZE);

        return (
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
            <button
              onClick={() => setShowContrastMatrix(v => !v)}
              className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
            >
              <span>Color Contrast Matrix ({contrastGroupFilter === 'all' ? colorTokens.length : displayTokens.length}{contrastGroupFilter !== 'all' ? `/${colorTokens.length}` : ''} tokens)</span>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showContrastMatrix ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
            </button>
            {showContrastMatrix && (
              <div className="overflow-auto max-h-96 p-2">
                {/* Toolbar: failures toggle + CSV export */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    onClick={() => { setContrastFailuresOnly(v => !v); setContrastPage(0); }}
                    className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded border transition-colors ${contrastFailuresOnly ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    Failures only{contrastFailuresOnly && allFailingPairs.length > 0 ? ` (${allFailingPairs.length})` : ''}
                  </button>
                  <button
                    onClick={handleCopyCSV}
                    className="flex items-center gap-1 px-2 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    title={`Copy ${displayTokens.length}×${displayTokens.length} matrix as CSV`}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    {contrastCopied ? 'Copied!' : 'Copy as CSV'}
                  </button>
                </div>

                {/* Group filter + sort controls */}
                {/* Group filter + sort controls */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 px-1">
                  {availableGroups.length > 1 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[8px] text-[var(--color-figma-text-secondary)]">Group:</span>
                      <button
                        onClick={() => { setContrastGroupFilter('all'); setContrastPage(0); }}
                        className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastGroupFilter === 'all' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                      >All</button>
                      {availableGroups.map(g => (
                        <button
                          key={g}
                          onClick={() => { setContrastGroupFilter(g); setContrastPage(0); }}
                          className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastGroupFilter === g ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                        >{g}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[8px] text-[var(--color-figma-text-secondary)]">Sort:</span>
                    <button
                      onClick={() => { setContrastSortMode('luminance'); setContrastPage(0); }}
                      className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastSortMode === 'luminance' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                      title="Sort tokens by luminance (dark to light)"
                    >Luminance</button>
                    <button
                      onClick={() => { setContrastSortMode('failures'); setContrastPage(0); }}
                      className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastSortMode === 'failures' ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                      title="Sort by number of WCAG failures — worst offenders first"
                    >Most failures</button>
                  </div>
                </div>

                {contrastFailuresOnly ? (
                  /* Failures-only flat list */
                  allFailingPairs.length === 0 ? (
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)] text-center py-4">No failing pairs — all combinations pass AA (≥4.5:1)</div>
                  ) : (
                    <table className="text-[8px] border-collapse w-full" aria-label="Failing color contrast pairs">
                      <thead>
                        <tr className="text-[var(--color-figma-text-secondary)]">
                          <th scope="col" className="px-1 py-0.5 text-left font-normal">Foreground</th>
                          <th scope="col" className="px-1 py-0.5 text-left font-normal">Background</th>
                          <th scope="col" className="px-1 py-0.5 text-right font-normal">Ratio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allFailingPairs.map(({ fg, bg, ratio }) => (
                          <tr key={`${fg.path}|${bg.path}`} className="border-t border-[var(--color-figma-border)]">
                            <td className="px-1 py-0.5">
                              <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: fg.hex }} aria-hidden="true" />
                                <span className="text-[var(--color-figma-text-secondary)] truncate max-w-[80px]" title={fg.path}>{fg.path.split('.').pop()}</span>
                              </div>
                            </td>
                            <td className="px-1 py-0.5">
                              <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: bg.hex }} aria-hidden="true" />
                                <span className="text-[var(--color-figma-text-secondary)] truncate max-w-[80px]" title={bg.path}>{bg.path.split('.').pop()}</span>
                              </div>
                            </td>
                            <td className="px-1 py-0.5 text-right">
                              <span className="text-[var(--color-figma-error)]">{ratio.toFixed(1)}:1</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  /* Full grid matrix with pagination */
                  <>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                          Tokens {pageStart + 1}–{Math.min(pageStart + CONTRAST_PAGE_SIZE, displayTokens.length)} of {displayTokens.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setContrastPage(p => Math.max(0, p - 1))}
                            disabled={contrastPage === 0}
                            className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed"
                            aria-label="Previous page"
                          >‹</button>
                          {Array.from({ length: totalPages }, (_, i) => (
                            <button
                              key={i}
                              onClick={() => setContrastPage(i)}
                              className={`px-1.5 py-0.5 text-[9px] rounded border ${i === contrastPage ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                              aria-label={`Page ${i + 1}`}
                              aria-current={i === contrastPage ? 'page' : undefined}
                            >{i + 1}</button>
                          ))}
                          <button
                            onClick={() => setContrastPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={contrastPage === totalPages - 1}
                            className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed"
                            aria-label="Next page"
                          >›</button>
                        </div>
                      </div>
                    )}
                    <table className="text-[8px] border-collapse" aria-label="Color contrast matrix — rows are foreground tokens, columns are background tokens">
                      <thead>
                        <tr>
                          <th scope="col" className="px-1 py-0.5 text-left text-[var(--color-figma-text-secondary)] font-normal sticky left-0 bg-[var(--color-figma-bg)]">FG \ BG</th>
                          {pagedTokens.map(bg => (
                            <th key={bg.path} scope="col" aria-label={bg.path} title={bg.path} className="px-1 py-0.5 text-center font-normal max-w-[40px]">
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
                                <span className="text-[var(--color-figma-text-secondary)] truncate max-w-[60px]" title={fg.path}>{fg.path.split('.').pop()}</span>
                              </div>
                            </th>
                            {pagedTokens.map(bg => {
                              if (fg.path === bg.path) return <td key={bg.path} className="px-1 py-0.5 text-center bg-[var(--color-figma-bg-hover)]" aria-label="same token">—</td>;
                              const r = wcagContrast(fg.hex, bg.hex);
                              const aa = r !== null && r >= 4.5;
                              const aaa = r !== null && r >= 7;
                              const level = aaa ? 'AAA' : aa ? 'AA' : 'Fail';
                              return (
                                <td key={bg.path} title={`${fg.path} on ${bg.path}: ${r?.toFixed(2)}:1`} aria-label={`${fg.path} on ${bg.path}: ${r !== null ? `${r.toFixed(2)}:1 ${level}` : 'unavailable'}`} className={`px-1 py-0.5 text-center ${aaa ? 'bg-[var(--color-figma-success)]/20' : aa ? 'bg-[var(--color-figma-warning)]/10' : 'bg-[var(--color-figma-error)]/10'}`}>
                                  <span className={aaa ? 'text-[var(--color-figma-success)]' : aa ? 'text-[var(--color-figma-warning)]' : 'text-[var(--color-figma-error)]'} aria-hidden="true">
                                    {r !== null ? r.toFixed(1) : '—'}
                                  </span>
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
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30" />Fail</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Duplicate Values — sourced from no-duplicate-values lint rule */}
      {lintDuplicateGroups.length > 0 && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
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
              {/* Bulk promote all duplicates */}
              {lintDuplicateGroups.length > 1 && (
                <div className="p-3 flex flex-col gap-2">
                  {confirmBulkDedup ? (
                    <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5">
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        This will convert <span className="font-medium text-[var(--color-figma-text)]">{totalDuplicateAliases} token{totalDuplicateAliases !== 1 ? 's' : ''}</span> across {lintDuplicateGroups.length} groups into aliases, each pointing to its group's canonical token.
                      </p>
                      <ul className="flex flex-col gap-0.5 pl-2 max-h-[120px] overflow-y-auto">
                        {lintDuplicateGroups.map(group => {
                          const others = group.tokens.filter(t => t.path !== group.canonical);
                          return (
                            <li key={group.canonical} className="text-[10px] text-[var(--color-figma-text-secondary)]">
                              <div className="flex items-center gap-1.5">
                                {group.colorHex && (
                                  <div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: group.colorHex }} />
                                )}
                                <span className="font-mono truncate">{group.canonical}</span>
                                <span className="shrink-0">— {others.length} → alias</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex gap-2 mt-0.5">
                        <button
                          disabled={bulkDeduplicating}
                          onClick={handleBulkDeduplicate}
                          className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                        >
                          {bulkDeduplicating ? 'Promoting…' : `Confirm — promote ${totalDuplicateAliases} to aliases`}
                        </button>
                        <button
                          onClick={() => setConfirmBulkDedup(false)}
                          className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      disabled={bulkDeduplicating}
                      onClick={() => setConfirmBulkDedup(true)}
                      className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                    >
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
                      {group.colorHex && (
                        <div className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: group.colorHex }} />
                      )}
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{group.canonical}</span>
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">— {group.tokens.length} tokens</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {group.tokens.map(t => (
                        <div key={`${t.setName}:${t.path}`} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1">{t.path}</span>
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{t.setName}</span>
                          {t.path === group.canonical && (
                            <span className="text-[8px] text-[var(--color-figma-accent)] shrink-0 font-medium">canonical</span>
                          )}
                          {onNavigateToToken && (
                            <button
                              onClick={() => onNavigateToToken(t.path, t.setName)}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
                              title="Go to token"
                            >
                              Go →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {confirmDedup?.canonical === group.canonical ? (
                      <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5">
                        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                          This will replace {others.length} token{others.length !== 1 ? 's' : ''} with an alias to <span className="font-mono text-[var(--color-figma-text)]">{group.canonical}</span>:
                        </p>
                        <ul className="flex flex-col gap-0.5 pl-2">
                          {others.map(o => (
                            <li key={`${o.setName}:${o.path}`} className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                              {o.path} <span className="text-[10px] text-[var(--color-figma-text-secondary)]">({o.setName})</span> → <span className="text-[var(--color-figma-text)]">{`{${group.canonical}}`}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2 mt-0.5">
                          <button
                            disabled={isDeduplicating}
                            onClick={() => { handleDeduplicate(group.canonical, others); setConfirmDedup(null); }}
                            className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                          >
                            {isDeduplicating ? 'Deduplicating…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmDedup(null)}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        disabled={isDeduplicating}
                        onClick={() => setConfirmDedup({ canonical: group.canonical, canonicalSet: group.canonicalSet, others })}
                        className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                      >
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

      {/* Color Scale Lightness Inspector */}
      {colorScales.length > 0 && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <button
            onClick={() => setShowScaleInspector(v => !v)}
            className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
          >
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
                          <circle
                            cx={p.x} cy={p.y} r={p.isAnom ? 4 : 3}
                            fill={p.isAnom ? '#ef4444' : p.hex}
                            stroke={p.isAnom ? '#ef4444' : 'var(--color-figma-border)'}
                            strokeWidth="1"
                          />
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

      {/* Unused Tokens */}
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
        <button
          onClick={() => setShowUnused(v => !v)}
          className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
        >
          <span className="flex items-center gap-1.5">
            {unusedTokens.length > 0 ? (
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            ) : null}
            Unused Tokens
            {!tokenUsageCounts || Object.keys(tokenUsageCounts).length === 0 ? (
              <span className="normal-case font-normal opacity-60">(requires Figma usage scan)</span>
            ) : (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] font-mono normal-case">{unusedTokens.length}</span>
            )}
          </span>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showUnused ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
        </button>
        {showUnused && (
          <div>
            {!tokenUsageCounts || Object.keys(tokenUsageCounts).length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                No Figma usage data available. Open the Define &gt; Tokens tab to trigger a usage scan, then return here.
              </div>
            ) : unusedTokens.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                No unused tokens found — all tokens are either used in Figma or referenced by other tokens.
              </div>
            ) : (
              <>
                <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between gap-2">
                  <span>{unusedTokens.length} token{unusedTokens.length !== 1 ? 's' : ''} with zero Figma usage and no alias dependents — potential deletion candidates.</span>
                  {!confirmDeleteAllUnused ? (
                    <button
                      onClick={() => setConfirmDeleteAllUnused(true)}
                      className="shrink-0 text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors"
                    >
                      Delete all
                    </button>
                  ) : (
                    <div className="shrink-0 flex items-center gap-1">
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)]">Delete {unusedTokens.length}?</span>
                      <button
                        onClick={handleDeleteAllUnused}
                        disabled={deletingUnused.has('__all__')}
                        className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-figma-error)] text-white hover:opacity-80 disabled:opacity-40 transition-opacity"
                      >
                        {deletingUnused.has('__all__') ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAllUnused(false)}
                        className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div className="divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                  {unusedTokens.map(({ path, set, $type }) => {
                    const key = `${set}:${path}`;
                    const isDeleting = deletingUnused.has(key) || deletingUnused.has('__all__');
                    return (
                      <div key={key} className="group relative flex items-center hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                        <button
                          onClick={() => onNavigateToToken?.(path, set)}
                          disabled={!onNavigateToToken || isDeleting}
                          className="flex-1 flex items-center justify-between px-3 py-1.5 text-left disabled:cursor-default"
                        >
                          <span className={`text-[10px] text-[var(--color-figma-text)] font-mono truncate flex-1 ${isDeleting ? 'opacity-40' : ''}`}>{path}</span>
                          <span className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{$type}</span>
                            <span className="text-[9px] text-[var(--color-figma-text-secondary)]">{set}</span>
                          </span>
                        </button>
                        <button
                          onClick={() => handleDeleteUnusedToken(path, set)}
                          disabled={isDeleting}
                          title="Delete token"
                          className="absolute right-1 top-0 bottom-0 flex items-center px-1.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity disabled:opacity-40"
                          aria-label={`Delete ${path}`}
                        >
                          {isDeleting ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-error)]" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Component Coverage */}
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-figma-bg-secondary)]">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide">Component Coverage</span>
          {coverageLoading ? (
            <button
              onClick={() => coverageCancelRef.current?.()}
              className="text-[10px] px-2 py-0.5 rounded border border-red-400 text-red-600 hover:bg-red-50 transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={runCoverageScan}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Scan
            </button>
          )}
        </div>
        {coverageResult && (
          <>
            <div className="grid grid-cols-4 divide-x divide-[var(--color-figma-border)] border-b border-[var(--color-figma-border)]">
              <div className="px-2 py-3 text-center">
                <div className="text-[16px] font-bold text-[var(--color-figma-text)]">{coverageResult.totalComponents}</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Total</div>
              </div>
              <div className="px-2 py-3 text-center">
                <div className="text-[16px] font-bold text-[var(--color-figma-success)]">{coverageResult.tokenizedComponents}</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Tokenized</div>
              </div>
              <div className="px-2 py-3 text-center">
                <div className="text-[16px] font-bold text-[var(--color-figma-warning)]">{coverageResult.totalUntokenized}</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Untokenized</div>
              </div>
              <div className="px-2 py-3 text-center">
                <div className="text-[16px] font-bold text-[var(--color-figma-text)]">
                  {coverageResult.totalComponents > 0
                    ? Math.round((coverageResult.tokenizedComponents / coverageResult.totalComponents) * 100)
                    : 0}%
                </div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Coverage</div>
              </div>
            </div>
            {coverageResult.totalUntokenized > 0 && (
              <>
                <button
                  onClick={() => setShowCoverage(v => !v)}
                  className="w-full px-3 py-2 flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <span>Untokenized components ({coverageResult.totalUntokenized})</span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showCoverage ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                </button>
                {showCoverage && (
                  <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                    {coverageResult.totalUntokenized > coverageResult.untokenized.length && (
                      <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]">
                        {coverageResult.untokenized.length} of {coverageResult.totalUntokenized} shown
                      </div>
                    )}
                    {coverageResult.untokenized.map(comp => (
                      <button
                        key={comp.id}
                        onClick={() => parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: comp.id } }, '*')}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1">{comp.name}</span>
                        <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 ml-2">{comp.hardcodedCount} hardcoded</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {coverageLoading && (
          <div className="px-3 py-4 flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Scanning components…</span>
          </div>
        )}
        {!coverageLoading && coverageError && (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-error)]">
            {coverageError}
          </div>
        )}
        {!coverageLoading && !coverageResult && !coverageError && (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
            Click "Scan" to check component tokenization on the current Figma page.
          </div>
        )}
      </div>
    </div>
  );
}
