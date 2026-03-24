import React, { useState, useEffect } from 'react';

interface SetStats {
  name: string;
  total: number;
  byType: Record<string, number>;
}

interface AnalyticsPanelProps {
  serverUrl: string;
  connected: boolean;
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

export function AnalyticsPanel({ serverUrl, connected }: AnalyticsPanelProps) {
  const [stats, setStats] = useState<SetStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    setLoading(true);

    const load = async () => {
      const setsRes = await fetch(`${serverUrl}/api/sets`);
      const setsData = await setsRes.json();
      const sets: string[] = setsData.sets || [];

      const results = await Promise.all(
        sets.map(async (name) => {
          const res = await fetch(`${serverUrl}/api/tokens/${name}`);
          const data = await res.json();
          const { total, byType } = countLeafNodes(data.tokens || {});
          return { name, total, byType };
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

  return (
    <div className="flex flex-col gap-3 p-3">
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
                <div
                  className="flex-1 h-1.5 rounded-full bg-[var(--color-figma-bg-hover)] overflow-hidden"
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-figma-accent)]"
                    style={{ width: totalTokens > 0 ? `${Math.round((s.total / totalTokens) * 100)}%` : '0%' }}
                  />
                </div>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-20 text-right truncate">{s.name}</span>
                <span className="text-[11px] font-medium text-[var(--color-figma-text)] w-8 text-right">{s.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
