import { useState } from 'react';
import type { CrossSetRecentsState } from '../hooks/useCrossSetRecents';
import type { StarredTokensState } from '../hooks/useStarredTokens';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { swatchBgColor } from '../shared/colorUtils';
import type { TokenMapEntry } from '../../shared/types';

type Tab = 'recent' | 'starred';

interface RecentsPanelProps {
  crossSetRecents: CrossSetRecentsState;
  starredTokens: StarredTokensState;
  /** Per-set flat token map for showing type/value previews */
  perSetFlat: Record<string, Record<string, TokenMapEntry>> | null | undefined;
  onNavigateToSet: (setName: string, path: string) => void;
  onClose: () => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TokenRow({
  path,
  setName,
  entry,
  onNavigate,
  trailing,
}: {
  path: string;
  setName: string;
  entry: TokenMapEntry | undefined;
  onNavigate: () => void;
  trailing?: React.ReactNode;
}) {
  const tokenType = entry?.$type ?? '';
  const tokenValue = entry?.$value;
  const isColor = tokenType === 'color' && typeof tokenValue === 'string';

  return (
    <div className="group/row flex items-center border-b border-[var(--color-figma-border)]/50">
      <button
        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        onClick={onNavigate}
        title={`${path} (${setName})`}
      >
        {isColor ? (
          <span
            className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
            style={{ background: swatchBgColor(tokenValue as string) }}
            aria-hidden="true"
          />
        ) : (
          <span className="shrink-0 w-3 h-3" aria-hidden="true" />
        )}
        <span className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate">{path}</span>
        {tokenType && (
          <span className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[tokenType] ?? 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
            {tokenType}
          </span>
        )}
      </button>
      {trailing}
    </div>
  );
}

export function RecentsPanel({ crossSetRecents, starredTokens, perSetFlat, onNavigateToSet, onClose }: RecentsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('recent');

  // Group recent entries by set name, preserving most-recent-first order
  const recentsBySet: Array<{ setName: string; entries: typeof crossSetRecents.entries }> = [];
  for (const entry of crossSetRecents.entries) {
    const group = recentsBySet.find(g => g.setName === entry.setName);
    if (group) {
      group.entries.push(entry);
    } else {
      recentsBySet.push({ setName: entry.setName, entries: [entry] });
    }
  }

  // Group starred tokens by set name
  const starredBySet: Array<{ setName: string; tokens: typeof starredTokens.tokens }> = [];
  for (const tok of starredTokens.tokens) {
    const group = starredBySet.find(g => g.setName === tok.setName);
    if (group) {
      group.tokens.push(tok);
    } else {
      starredBySet.push({ setName: tok.setName, tokens: [tok] });
    }
  }

  const getEntry = (path: string, setName: string): TokenMapEntry | undefined =>
    perSetFlat?.[setName]?.[path];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          aria-label="Back"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 2L3.5 5l3 3"/>
          </svg>
          Back
        </button>
        <span className="text-[10px] font-medium text-[var(--color-figma-text)] ml-1">Recents &amp; Favorites</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-figma-border)] shrink-0">
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium transition-colors border-b-2 ${activeTab === 'recent' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)]' : 'border-transparent text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          onClick={() => setActiveTab('recent')}
        >
          {/* Clock icon */}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Recent
          {crossSetRecents.count > 0 && (
            <span className="ml-0.5 min-w-[14px] h-3.5 px-1 rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] text-[8px] flex items-center justify-center">
              {crossSetRecents.count}
            </span>
          )}
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium transition-colors border-b-2 ${activeTab === 'starred' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)]' : 'border-transparent text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          onClick={() => setActiveTab('starred')}
        >
          {/* Star icon */}
          <svg width="10" height="10" viewBox="0 0 24 24" fill={activeTab === 'starred' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Starred
          {starredTokens.count > 0 && (
            <span className="ml-0.5 min-w-[14px] h-3.5 px-1 rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] text-[8px] flex items-center justify-center">
              {starredTokens.count}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'recent' && (
          crossSetRecents.count === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-[var(--color-figma-text-tertiary)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span className="text-[11px] font-medium">No recently edited tokens</span>
              <span className="text-[10px] text-center px-4">Tokens you edit will appear here, across all sets</span>
            </div>
          ) : (
            <div>
              {recentsBySet.map(({ setName, entries }) => (
                <div key={setName}>
                  <div className="px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] sticky top-0 z-10">
                    {setName}
                    <span className="font-normal opacity-60 ml-1">({entries.length})</span>
                  </div>
                  {entries.map(e => (
                    <TokenRow
                      key={e.path}
                      path={e.path}
                      setName={e.setName}
                      entry={getEntry(e.path, e.setName)}
                      onNavigate={() => onNavigateToSet(e.setName, e.path)}
                      trailing={
                        <span className="shrink-0 pr-2 text-[9px] text-[var(--color-figma-text-tertiary)] whitespace-nowrap">
                          {formatRelativeTime(e.ts)}
                        </span>
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'starred' && (
          starredTokens.count === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-[var(--color-figma-text-tertiary)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span className="text-[11px] font-medium">No starred tokens</span>
              <span className="text-[10px] text-center px-4">Star tokens with the ★ button on any token row to add them here</span>
            </div>
          ) : (
            <div>
              {starredBySet.map(({ setName, tokens: setTokens }) => (
                <div key={setName}>
                  <div className="px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] sticky top-0 z-10">
                    {setName}
                    <span className="font-normal opacity-60 ml-1">({setTokens.length})</span>
                  </div>
                  {setTokens.map(t => (
                    <TokenRow
                      key={t.path}
                      path={t.path}
                      setName={t.setName}
                      entry={getEntry(t.path, t.setName)}
                      onNavigate={() => onNavigateToSet(t.setName, t.path)}
                      trailing={
                        <button
                          className="shrink-0 p-1.5 mr-0.5 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] rounded transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                          onClick={e => { e.stopPropagation(); starredTokens.toggleStar(t.path, t.setName); }}
                          title="Unstar token"
                          aria-label="Unstar token"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        </button>
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
