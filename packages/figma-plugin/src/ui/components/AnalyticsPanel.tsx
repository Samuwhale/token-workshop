import { useState, useEffect, useCallback, useRef } from 'react';
import { hexToLuminance, wcagContrast, hexToLstar } from '../shared/colorUtils';

interface ValidationIssue {
  rule: string;
  path: string;
  setName: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
}

interface SetStats {
  name: string;
  description?: string;
  total: number;
  byType: Record<string, number>;
}

interface AnalyticsPanelProps {
  serverUrl: string;
  connected: boolean;
  validateKey?: number;
  onNavigateToToken?: (path: string, set: string) => void;
  onValidationComplete?: (count: number) => void;
}

function countLeafNodes(group: Record<string, any>): { total: number; byType: Record<string, number> } {
  let total = 0;
  const byType: Record<string, number> = {};
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && '$value' in value) {
      total++;
      const t = value.$type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
    } else if (value && typeof value === 'object') {
      const sub = countLeafNodes(value);
      total += sub.total;
      for (const [t, c] of Object.entries(sub.byType)) {
        byType[t] = (byType[t] || 0) + c;
      }
    }
  }
  return { total, byType };
}

function normalizeHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length === 4) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return '#' + h;
}

const TYPE_COLORS: Record<string, string> = {
  color:      '#e85d4a',
  dimension:  '#4a9ee8',
  spacing:    '#5bc4a0',
  typography: '#a77de8',
  fontFamily: '#c47de8',
  fontSize:   '#e8a77d',
  fontWeight: '#7de8c4',
  lineHeight: '#e8c47d',
  number:     '#7db8e8',
  string:     '#aae87d',
  shadow:     '#e87dc4',
  border:     '#e8e07d',
};
const TYPE_COLOR_FALLBACK = '#8888aa';

export function AnalyticsPanel({ serverUrl, connected, validateKey, onNavigateToToken, onValidationComplete }: AnalyticsPanelProps) {
  const [stats, setStats] = useState<SetStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [validateResults, setValidateResults] = useState<ValidationIssue[] | null>(null);
  const [validateLoading, setValidateLoading] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [validationCopied, setValidationCopied] = useState(false);
  const [colorTokens, setColorTokens] = useState<{ path: string; hex: string }[]>([]);
  const [showContrastMatrix, setShowContrastMatrix] = useState(false);
  const [allColorTokens, setAllColorTokens] = useState<{ path: string; set: string; hex: string }[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [deduplicating, setDeduplicating] = useState<string | null>(null); // hex key being deduplicated
  const [canonicalPick, setCanonicalPick] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('analytics_canonicalPick');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  }); // hex → chosen canonical path
  const [reloadKey, setReloadKey] = useState(0);
  const [showScaleInspector, setShowScaleInspector] = useState(false);

  // Component coverage state
  const [coverageResult, setCoverageResult] = useState<{
    totalComponents: number;
    tokenizedComponents: number;
    untokenized: { id: string; name: string; hardcodedCount: number }[];
  } | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  const coverageResolveRef = useRef<((data: any) => void) | null>(null);

  useEffect(() => {
    try { localStorage.setItem('analytics_canonicalPick', JSON.stringify(canonicalPick)); } catch { /* quota exceeded */ }
  }, [canonicalPick]);

  const runValidate = useCallback(async () => {
    if (!connected) return;
    setValidateLoading(true);
    setValidateError(null);
    try {
      const res = await fetch(`${serverUrl}/api/tokens/validate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { issues: ValidationIssue[] };
        const issues = data.issues ?? [];
        setValidateResults(issues);
        onValidationComplete?.(issues.length);
      }
    } catch {
      setValidateError('Validation failed — check server connection');
    } finally {
      setValidateLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    if (validateKey && validateKey > 0 && !validateLoading) runValidate();
    // validateLoading intentionally omitted from deps: re-running when loading
    // finishes would trigger a redundant validation on the same validateKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validateKey, runValidate]);

  // Listen for component-coverage-result from controller
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'component-coverage-result' && coverageResolveRef.current) {
        coverageResolveRef.current(msg);
        coverageResolveRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const runCoverageScan = useCallback(async () => {
    setCoverageLoading(true);
    setCoverageResult(null);
    setCoverageError(null);
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          coverageResolveRef.current = null;
          reject(new Error('Scan timed out'));
        }, 30000);
        coverageResolveRef.current = (data) => { clearTimeout(timeout); resolve(data); };
        parent.postMessage({ pluginMessage: { type: 'scan-component-coverage' } }, '*');
      });
      setCoverageResult(result);
      setShowCoverage(true);
    } catch (err) {
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

    const load = async () => {
      const setsRes = await fetch(`${serverUrl}/api/sets`);
      const setsData = await setsRes.json();
      const sets: string[] = setsData.sets || [];
      const descriptions: Record<string, string> = setsData.descriptions || {};

      // Fetch all sets' flat tokens and collect color tokens
      const allFlatBySet: Record<string, Record<string, { $value: unknown; $type: string }>> = {};
      const allColors: { path: string; hex: string }[] = [];
      const results = await Promise.all(
        sets.map(async (name) => {
          const res = await fetch(`${serverUrl}/api/tokens/${name}`);
          const data = await res.json();
          const flat = data.tokens as Record<string, { $value: unknown; $type: string }> || {};
          allFlatBySet[name] = flat;
          const { total, byType } = countLeafNodes(data.tokens || {});
          for (const [p, t] of Object.entries(flat)) {
            if (t.$type === 'color' && typeof t.$value === 'string' && !t.$value.startsWith('{') && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t.$value)) {
              allColors.push({ path: p, hex: t.$value });
            }
          }
          return { name, description: descriptions[name], total, byType };
        })
      );
      setStats(results);
      setColorTokens(
        allColors
          .slice(0, 16) // cap for matrix performance
          .sort((a, b) => (hexToLuminance(a.hex) ?? 0) - (hexToLuminance(b.hex) ?? 0))
      );

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
        if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
          return resolveHex(v.slice(1, -1), visited);
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

      setLoading(false);
    };

    load().catch(() => setLoading(false));
  }, [serverUrl, connected, reloadKey]);

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

  const totalTokens = stats.reduce((sum, s) => sum + s.total, 0);
  const allByType: Record<string, number> = {};
  for (const s of stats) {
    for (const [t, c] of Object.entries(s.byType)) {
      allByType[t] = (allByType[t] || 0) + c;
    }
  }
  const sortedTypes = Object.entries(allByType).sort((a, b) => b[1] - a[1]);

  const filteredIssues = validateResults
    ? (severityFilter === 'all'
        ? [...validateResults].sort((a, b) => {
            const order = { error: 0, warning: 1, info: 2 } as const;
            return order[a.severity] - order[b.severity];
          })
        : validateResults.filter(i => i.severity === severityFilter))
    : null;

  const severityCounts = validateResults
    ? {
        all: validateResults.length,
        error: validateResults.filter(i => i.severity === 'error').length,
        warning: validateResults.filter(i => i.severity === 'warning').length,
        info: validateResults.filter(i => i.severity === 'info').length,
      }
    : null;

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

  // Compute duplicate color groups
  const duplicateGroups = (() => {
    const byHex = new Map<string, { path: string; set: string }[]>();
    for (const t of allColorTokens) {
      const list = byHex.get(t.hex) ?? [];
      list.push({ path: t.path, set: t.set });
      byHex.set(t.hex, list);
    }
    return [...byHex.entries()]
      .filter(([, paths]) => paths.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  })();

  const handleDeduplicate = async (hex: string, canonical: { path: string; set: string }, others: { path: string; set: string }[]) => {
    setDeduplicating(hex);
    try {
      await Promise.all(others.map(({ path, set }) =>
        fetch(`${serverUrl}/api/tokens/${set}/${path}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: `{${canonical.path}}` }),
        })
      ));
      // Refresh data
      setDeduplicating(null);
      setReloadKey(k => k + 1);
    } catch {
      setDeduplicating(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Validate button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Token Analytics</span>
        <button
          onClick={runValidate}
          disabled={validateLoading || !connected}
          className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
        >
          {validateLoading ? 'Validating…' : 'Validate All'}
        </button>
      </div>

      {/* Validation error */}
      {!validateLoading && validateError && (
        <div className="text-[10px] text-[var(--color-figma-error)] px-1 py-1">
          {validateError}
        </div>
      )}

      {/* Validation results */}
      {validateResults !== null && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
              Validation — {validateResults.length} issue{validateResults.length !== 1 ? 's' : ''}
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
                className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                title="Copy report as Markdown"
              >
                {validationCopied ? 'Copied!' : 'Copy MD'}
              </button>
              <span className="w-px h-3 bg-[var(--color-figma-border)]" aria-hidden="true" />
              {(['all', 'error', 'warning', 'info'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setSeverityFilter(f)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                    severityFilter === f
                      ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10'
                      : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
                  }`}
                >
                  {severityCounts && f !== 'all' ? `${f} (${severityCounts[f]})` : f}
                </button>
              ))}
            </div>
          </div>
          {filteredIssues && filteredIssues.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-[var(--color-figma-text-secondary)] text-center">
              {validateResults.length === 0 ? 'No issues found ✓' : 'No issues match filter'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
              {(filteredIssues ?? []).map((issue, i) => (
                <div key={i} className="px-3 py-2 flex items-start gap-2">
                  <span className={`text-[9px] px-1 py-0.5 rounded border shrink-0 mt-0.5 font-medium ${
                    issue.severity === 'error'
                      ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/5'
                      : issue.severity === 'warning'
                      ? 'border-[var(--color-figma-warning)] text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10'
                      : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
                  }`}>
                    {issue.severity === 'error' ? 'Error' : issue.severity === 'warning' ? 'Warn' : 'Info'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[10px] text-[var(--color-figma-text)] font-medium font-mono truncate">{issue.path}</span>
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">{issue.setName}</span>
                    </div>
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">{issue.message}</div>
                    {issue.suggestedFix && (
                      <div className="text-[9px] text-[var(--color-figma-accent)] mt-0.5 flex items-center gap-1">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                        {issue.suggestedFix}
                      </div>
                    )}
                  </div>
                  {onNavigateToToken && (
                    <button
                      onClick={() => onNavigateToToken(issue.path, issue.setName)}
                      className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
                      title="Go to token"
                    >
                      Go →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
        <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
          Summary
        </div>
        <div className="px-3 py-3 flex gap-6">
          <div>
            <div className="text-[20px] font-semibold text-[var(--color-figma-text)]">{totalTokens}</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Total tokens</div>
          </div>
          <div>
            <div className="text-[20px] font-semibold text-[var(--color-figma-text)]">{stats.length}</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Sets</div>
          </div>
          <div>
            <div className="text-[20px] font-semibold text-[var(--color-figma-text)]">{sortedTypes.length}</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Types</div>
          </div>
        </div>
        {sortedTypes.length > 0 && totalTokens > 0 && (
          <div className="px-3 pb-3">
            <div className="h-2 rounded-full overflow-hidden flex gap-px">
              {sortedTypes.map(([type, count]) => (
                <div
                  key={type}
                  style={{ width: `${(count / totalTokens) * 100}%`, backgroundColor: TYPE_COLORS[type] ?? TYPE_COLOR_FALLBACK }}
                  title={`${type}: ${count}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* By type */}
      {sortedTypes.length > 0 && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
            By Type
          </div>
          <div className="divide-y divide-[var(--color-figma-border)]">
            {sortedTypes.map(([type, count]) => (
              <div key={type} className="flex items-center gap-3 px-3 py-2">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-20 truncate">{type}</span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--color-figma-bg-hover)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((count / totalTokens) * 100)}%`,
                      backgroundColor: TYPE_COLORS[type] ?? TYPE_COLOR_FALLBACK,
                    }}
                  />
                </div>
                <span className="text-[11px] font-medium text-[var(--color-figma-text)] w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By set */}
      {stats.length > 0 && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
            By Set
          </div>
          <div className="divide-y divide-[var(--color-figma-border)]">
            {stats.map((s) => (
              <div key={s.name} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{s.name}</span>
                  </div>
                  {s.description && (
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate mb-1">{s.description}</div>
                  )}
                  <div className="h-1.5 rounded-full bg-[var(--color-figma-bg-hover)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--color-figma-accent)]"
                      style={{ width: totalTokens > 0 ? `${Math.round((s.total / totalTokens) * 100)}%` : '0%' }}
                    />
                  </div>
                </div>
                <span className="text-[11px] font-medium text-[var(--color-figma-text)] w-8 text-right flex-shrink-0">{s.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contrast matrix */}
      {colorTokens.length >= 2 && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <button
            onClick={() => setShowContrastMatrix(v => !v)}
            className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
          >
            <span>Color Contrast Matrix ({colorTokens.length} tokens)</span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showContrastMatrix ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
          </button>
          {showContrastMatrix && (
            <div className="overflow-auto max-h-80 p-2">
              <table className="text-[8px] border-collapse">
                <thead>
                  <tr>
                    <th className="px-1 py-0.5 text-left text-[var(--color-figma-text-secondary)] font-normal sticky left-0 bg-[var(--color-figma-bg)]">FG \ BG</th>
                    {colorTokens.map(bg => (
                      <th key={bg.path} title={bg.path} className="px-1 py-0.5 text-center font-normal max-w-[40px]">
                        <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] mx-auto" style={{ background: bg.hex }} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colorTokens.map(fg => (
                    <tr key={fg.path}>
                      <td className="px-1 py-0.5 sticky left-0 bg-[var(--color-figma-bg)]">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: fg.hex }} />
                          <span className="text-[var(--color-figma-text-secondary)] truncate max-w-[60px]" title={fg.path}>{fg.path.split('.').pop()}</span>
                        </div>
                      </td>
                      {colorTokens.map(bg => {
                        if (fg.path === bg.path) return <td key={bg.path} className="px-1 py-0.5 text-center bg-[var(--color-figma-bg-hover)]">—</td>;
                        const r = wcagContrast(fg.hex, bg.hex);
                        const aa = r !== null && r >= 4.5;
                        const aaa = r !== null && r >= 7;
                        return (
                          <td key={bg.path} title={`${fg.path} on ${bg.path}: ${r?.toFixed(2)}:1`} className={`px-1 py-0.5 text-center ${aaa ? 'bg-[var(--color-figma-success)]/20' : aa ? 'bg-[var(--color-figma-warning)]/10' : 'bg-[var(--color-figma-error)]/10'}`}>
                            <span className={aaa ? 'text-[var(--color-figma-success)]' : aa ? 'text-[var(--color-figma-warning)]' : 'text-[var(--color-figma-error)]'}>
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
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-50 border border-yellow-200" />AA (≥4.5:1)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30" />Fail</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Duplicate Colors */}
      {duplicateGroups.length > 0 && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <button
            onClick={() => setShowDuplicates(v => !v)}
            className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
          >
            <span className="flex items-center gap-1.5">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              Duplicate Colors ({duplicateGroups.length} group{duplicateGroups.length !== 1 ? 's' : ''})
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showDuplicates ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
          </button>
          {showDuplicates && (
            <div className="divide-y divide-[var(--color-figma-border)]">
              {duplicateGroups.map(([hex, tokens]) => {
                const canonical = canonicalPick[hex] ?? tokens[0].path;
                const canonicalToken = tokens.find(t => t.path === canonical) ?? tokens[0];
                const others = tokens.filter(t => t.path !== canonical);
                const isDeduplying = deduplicating === hex;
                return (
                  <div key={hex} className="p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: hex }} />
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)]">{hex}</span>
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)]">— {tokens.length} tokens</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {tokens.map(t => (
                        <label key={t.path} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`canonical-${hex}`}
                            value={t.path}
                            checked={canonical === t.path}
                            onChange={() => setCanonicalPick(prev => ({ ...prev, [hex]: t.path }))}
                            className="w-3 h-3"
                          />
                          <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{t.path}</span>
                          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">{t.set}</span>
                          {canonical === t.path && (
                            <span className="text-[8px] text-[var(--color-figma-accent)] shrink-0 font-medium">canonical</span>
                          )}
                        </label>
                      ))}
                    </div>
                    <button
                      disabled={isDeduplying}
                      onClick={() => handleDeduplicate(hex, canonicalToken, others)}
                      className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                    >
                      {isDeduplying ? 'Deduplicating…' : `Deduplicate (${others.length} → alias)`}
                    </button>
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
                      <div className="text-[9px] text-red-500 mt-1">⚠ Uneven lightness steps detected</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Component Coverage */}
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-figma-bg-secondary)]">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide">Component Coverage</span>
          <button
            onClick={runCoverageScan}
            disabled={coverageLoading}
            className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
          >
            {coverageLoading ? 'Scanning…' : 'Scan'}
          </button>
        </div>
        {coverageResult && (
          <>
            <div className="px-3 py-2 flex gap-4 border-b border-[var(--color-figma-border)]">
              <div className="text-center">
                <div className="text-[16px] font-bold text-[var(--color-figma-text)]">{coverageResult.totalComponents}</div>
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Total</div>
              </div>
              <div className="text-center">
                <div className="text-[16px] font-bold text-[var(--color-figma-success)]">{coverageResult.tokenizedComponents}</div>
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Tokenized</div>
              </div>
              <div className="text-center">
                <div className="text-[16px] font-bold text-[var(--color-figma-warning)]">{coverageResult.untokenized.length}</div>
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Untokenized</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-[16px] font-bold text-[var(--color-figma-text)]">
                  {coverageResult.totalComponents > 0
                    ? Math.round((coverageResult.tokenizedComponents / coverageResult.totalComponents) * 100)
                    : 0}%
                </div>
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Coverage</div>
              </div>
            </div>
            {coverageResult.untokenized.length > 0 && (
              <>
                <button
                  onClick={() => setShowCoverage(v => !v)}
                  className="w-full px-3 py-2 flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <span>Untokenized components ({coverageResult.untokenized.length})</span>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showCoverage ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                </button>
                {showCoverage && (
                  <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                    {coverageResult.untokenized.map(comp => (
                      <button
                        key={comp.id}
                        onClick={() => parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: comp.id } }, '*')}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1">{comp.name}</span>
                        <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 ml-2">{comp.hardcodedCount} hardcoded</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
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
