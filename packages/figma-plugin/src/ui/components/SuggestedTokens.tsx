import { useState } from 'react';
import type { BindableProperty, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';
import { swatchBgColor } from '../shared/colorUtils';
import { lsGet, lsSet } from '../shared/storage';
import type { SuggestedToken } from './selectionInspectorUtils';
import { groupSuggestionsByConfidence, CONFIDENCE_LABELS } from './selectionInspectorUtils';

const LS_KEY = 'suggested-tokens-collapsed';
const LS_SHOW_ALL_KEY = 'suggested-tokens-show-all';

function formatValue(entry: TokenMapEntry, resolvedValue: any): string {
  if (entry.$type === 'color' && typeof resolvedValue === 'string') {
    return resolvedValue;
  }
  if ((entry.$type === 'dimension' || entry.$type === 'number') && resolvedValue != null) {
    if (typeof resolvedValue === 'object' && resolvedValue.value != null) {
      return `${resolvedValue.value}${resolvedValue.unit || ''}`;
    }
    if (typeof resolvedValue === 'number') {
      return String(Math.round(resolvedValue * 100) / 100);
    }
  }
  if (typeof resolvedValue === 'boolean') return String(resolvedValue);
  if (typeof resolvedValue === 'string') return resolvedValue;
  return '';
}

interface SuggestedTokensProps {
  suggestions: SuggestedToken[];
  onApply: (tokenPath: string, property: BindableProperty) => void;
  onNavigateToToken?: (tokenPath: string) => void;
  title?: string;
  showHeader?: boolean;
}

export function SuggestedTokens({
  suggestions,
  onApply,
  onNavigateToToken,
  title = 'Best matches',
  showHeader = true,
}: SuggestedTokensProps) {
  const [collapsed, setCollapsed] = useState(() => lsGet(LS_KEY) === 'true');
  const [showAll, setShowAll] = useState(() => lsGet(LS_SHOW_ALL_KEY) === 'true');

  if (suggestions.length === 0) return null;

  const toggle = () => {
    setCollapsed(prev => {
      lsSet(LS_KEY, String(!prev));
      return !prev;
    });
  };

  const groups = groupSuggestionsByConfidence(suggestions);
  const hasWeakGroup = groups.some(g => g.confidence === 'weak');
  const credibleGroups = groups.filter(g => g.confidence !== 'weak');
  const weakGroup = groups.find(g => g.confidence === 'weak');
  const visibleGroups = showAll ? groups : credibleGroups;

  return (
    <div className={showHeader ? 'border-b border-[var(--color-figma-border)]' : ''}>
      {showHeader && (
        <button
          onClick={toggle}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          aria-expanded={!collapsed}
        >
          <svg
            width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
            className={`text-[var(--color-figma-text-secondary)] transition-transform shrink-0 ${collapsed ? '' : 'rotate-90'}`}
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
            {title}
          </span>
          <span className="text-[9px] bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] px-1.5 py-0.5 rounded-full font-medium">
            {suggestions.length}
          </span>
        </button>
      )}

      {(!showHeader || !collapsed) && (
        <div className="px-1 pb-1.5">
          {visibleGroups.map((group, groupIdx) => (
            <div key={group.confidence}>
              {/* Group header — only when multiple groups are visible */}
              {visibleGroups.length > 1 && (
                <div className={`text-[8px] text-[var(--color-figma-text-secondary)] px-1.5 pt-1 pb-0.5 ${
                  groupIdx > 0 ? 'border-t border-[var(--color-figma-border)]/50 mt-0.5' : ''
                }`}>
                  {CONFIDENCE_LABELS[group.confidence]}
                </div>
              )}

              {group.items.map((s) => {
                const isColor = s.entry.$type === 'color' && typeof s.resolvedValue === 'string';
                const valueStr = formatValue(s.entry, s.resolvedValue);
                const propLabel = PROPERTY_LABELS[s.bestProperty];

                return (
                  <div
                    key={s.path}
                    className="group relative flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    {/* Color swatch or type icon */}
                    {isColor ? (
                      <div
                        className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                        style={{ backgroundColor: swatchBgColor(s.resolvedValue) }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-sm bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center">
                        <span className="text-[7px] text-[var(--color-figma-text-secondary)] font-bold leading-none">
                          {s.entry.$type.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Token path + metadata */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => onNavigateToToken?.(s.path)}
                        className="block text-[10px] text-[var(--color-figma-text)] truncate font-mono w-full text-left hover:underline"
                        title={`${s.path} — ${valueStr}`}
                      >
                        {s.path}
                      </button>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[8px] text-[var(--color-figma-text-secondary)]">
                          {propLabel}
                        </span>
                        <span className="text-[8px] text-[var(--color-figma-text-secondary)] opacity-50">·</span>
                        <span className={`text-[8px] ${
                          s.confidence === 'strong'
                            ? 'text-[var(--color-figma-accent)]'
                            : 'text-[var(--color-figma-text-secondary)]'
                        }`}>
                          {s.reason}
                        </span>
                        {valueStr && (
                          <>
                            <span className="text-[8px] text-[var(--color-figma-text-secondary)] opacity-50">·</span>
                            <span className="text-[8px] text-[var(--color-figma-text-secondary)] font-mono truncate max-w-[60px]">
                              {valueStr}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Apply button — always faintly visible, full opacity on hover */}
                    <div className="absolute right-1 top-0 bottom-0 flex items-center">
                      <button
                        onClick={() => onApply(s.path, s.bestProperty)}
                        className="opacity-40 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover,var(--color-figma-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-figma-accent)]"
                        title={`Apply "${s.path}" to ${propLabel}`}
                        aria-label={`Apply ${s.path} to ${propLabel}`}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Show all tokens expansion */}
          {hasWeakGroup && !showAll && (
            <button
              onClick={() => {
                setShowAll(true);
                lsSet(LS_SHOW_ALL_KEY, 'true');
              }}
              className="w-full text-[9px] text-[var(--color-figma-accent)] text-center py-1.5 border-t border-[var(--color-figma-border)]/50 mt-0.5 hover:bg-[var(--color-figma-accent)]/5 transition-colors"
            >
              Show {weakGroup!.items.length} more
            </button>
          )}
          {hasWeakGroup && showAll && weakGroup && weakGroup.items.length > 0 && (
            <button
              onClick={() => {
                setShowAll(false);
                lsSet(LS_SHOW_ALL_KEY, 'false');
              }}
              className="w-full text-[9px] text-[var(--color-figma-text-secondary)] text-center py-1 border-t border-[var(--color-figma-border)]/50 mt-0.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Hide weak
            </button>
          )}
        </div>
      )}
    </div>
  );
}
