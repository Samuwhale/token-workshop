import React, { useState, useEffect, useCallback } from 'react';

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

export function AnalyticsPanel({ serverUrl, connected, validateKey, onNavigateToToken }: AnalyticsPanelProps) {
  const [stats, setStats] = useState<SetStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [validateResults, setValidateResults] = useState<ValidationIssue[] | null>(null);
  const [validateLoading, setValidateLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const runValidate = useCallback(async () => {
    if (!connected) return;
    setValidateLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/tokens/validate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { issues: ValidationIssue[] };
        setValidateResults(data.issues ?? []);
      }
    } catch {
      setValidateResults([]);
    } finally {
      setValidateLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    if (validateKey && validateKey > 0) runValidate();
  }, [validateKey, runValidate]);

  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    setLoading(true);

    const load = async () => {
      const setsRes = await fetch(`${serverUrl}/api/sets`);
      const setsData = await setsRes.json();
      const sets: string[] = setsData.sets || [];
      const descriptions: Record<string, string> = setsData.descriptions || {};

      const results = await Promise.all(
        sets.map(async (name) => {
          const res = await fetch(`${serverUrl}/api/tokens/${name}`);
          const data = await res.json();
          const { total, byType } = countLeafNodes(data.tokens || {});
          return { name, description: descriptions[name], total, byType };
        })
      );
      setStats(results);
      setLoading(false);
    };

    load().catch(() => setLoading(false));
  }, [serverUrl, connected]);

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
    ? (severityFilter === 'all' ? validateResults : validateResults.filter(i => i.severity === severityFilter))
    : null;

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

      {/* Validation results */}
      {validateResults !== null && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
              Validation — {validateResults.length} issue{validateResults.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-1">
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
                  {f}
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
                  <span className={`text-[9px] px-1 py-0.5 rounded border shrink-0 mt-0.5 ${
                    issue.severity === 'error'
                      ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)]'
                      : issue.severity === 'warning'
                      ? 'border-yellow-500 text-yellow-700'
                      : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
                  }`}>
                    {issue.severity === 'error' ? '✕' : issue.severity === 'warning' ? '⚠' : 'ℹ'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[var(--color-figma-text)] font-medium truncate">{issue.path}</div>
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)] truncate">{issue.message}</div>
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)] opacity-70">set: {issue.setName}</div>
                  </div>
                  {onNavigateToToken && (
                    <button
                      onClick={() => onNavigateToToken(issue.path, issue.setName)}
                      className="text-[9px] text-[var(--color-figma-accent)] hover:underline shrink-0"
                    >
                      Jump
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
                <div
                  className="flex-1 h-1.5 rounded-full bg-[var(--color-figma-bg-hover)] overflow-hidden"
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-figma-accent)]"
                    style={{ width: `${Math.round((count / totalTokens) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-20 text-right truncate">{type}</span>
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
    </div>
  );
}
