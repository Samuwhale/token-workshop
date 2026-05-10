import { useState } from 'react';
import type { BindableProperty, TokenMapEntry } from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';
import { swatchBgColor } from '../shared/colorUtils';
import { lsGet, lsSet } from '../shared/storage';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import type { SuggestedToken } from './selectionInspectorUtils';
import { groupSuggestionsByConfidence, CONFIDENCE_LABELS } from './selectionInspectorUtils';

const LS_KEY = 'suggested-tokens-collapsed';
const LS_SHOW_ALL_KEY = 'suggested-tokens-show-all';
const LS_SHOW_SCOPE_HIDDEN_KEY = 'suggested-tokens-show-scope-hidden';

function formatValue(entry: TokenMapEntry, resolvedValue: unknown): string {
  return formatTokenValueForDisplay(entry.$type, resolvedValue, {
    emptyPlaceholder: '',
  });
}

function formatBatchPlan(
  items: SuggestedTokenApplyItem[],
): string {
  const labels = items.map((item) => PROPERTY_LABELS[item.property]);
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;
}

interface SuggestedTokenApplyItem {
  tokenPath: string;
  property: BindableProperty;
  collectionId?: string;
}

interface SuggestedTokensProps {
  suggestions: SuggestedToken[];
  onApply: (
    tokenPath: string,
    property: BindableProperty,
    collectionId?: string,
  ) => void;
  onApplyBatch?: (items: SuggestedTokenApplyItem[]) => void;
  onNavigateToToken?: (tokenPath: string, collectionId?: string) => void;
  title?: string;
  showHeader?: boolean;
}

export function SuggestedTokens({
  suggestions,
  onApply,
  onApplyBatch,
  onNavigateToToken,
  title = 'Best matches',
  showHeader = true,
}: SuggestedTokensProps) {
  const [collapsed, setCollapsed] = useState(() => lsGet(LS_KEY) === 'true');
  const [showAll, setShowAll] = useState(() => lsGet(LS_SHOW_ALL_KEY) === 'true');
  const [showScopeHidden, setShowScopeHidden] = useState(
    () => lsGet(LS_SHOW_SCOPE_HIDDEN_KEY) === 'true',
  );

  const scopeHiddenCount = suggestions.filter(s => s.scopeHidden).length;
  const filteredSuggestions = showScopeHidden
    ? suggestions
    : suggestions.filter(s => !s.scopeHidden);

  if (filteredSuggestions.length === 0 && scopeHiddenCount === 0) return null;

  const toggle = () => {
    setCollapsed(prev => {
      lsSet(LS_KEY, String(!prev));
      return !prev;
    });
  };

  const groups = groupSuggestionsByConfidence(filteredSuggestions);
  const hasWeakGroup = groups.some(g => g.confidence === 'weak');
  const credibleGroups = groups.filter(g => g.confidence !== 'weak');
  const weakGroup = groups.find(g => g.confidence === 'weak');
  const visibleGroups = showAll ? groups : credibleGroups;

  // Batch apply: one strong suggestion per distinct property (already sorted by score).
  // Never batch-apply scope-hidden tokens — Figma will reject the bind.
  const strongBatch: SuggestedTokenApplyItem[] = [];
  const seenBatchProps = new Set<BindableProperty>();
  for (const suggestion of filteredSuggestions) {
    if (suggestion.scopeHidden) continue;
    if (suggestion.confidence !== 'strong') continue;
    if (seenBatchProps.has(suggestion.bestProperty)) continue;
    seenBatchProps.add(suggestion.bestProperty);
    strongBatch.push({
      tokenPath: suggestion.path,
      property: suggestion.bestProperty,
      collectionId: suggestion.collectionId,
    });
  }
  const showApplyAll = onApplyBatch !== undefined && strongBatch.length >= 2;

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
            className={`text-[color:var(--color-figma-text-secondary)] transition-transform shrink-0 ${collapsed ? '' : 'rotate-90'}`}
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <span className="text-secondary font-semibold uppercase tracking-wide text-[color:var(--color-figma-text-secondary)]">
            {title}
          </span>
          <span className="text-secondary bg-[var(--color-figma-accent)]/15 text-[color:var(--color-figma-text-accent)] px-1.5 py-0.5 rounded-full font-medium">
            {filteredSuggestions.length}
          </span>
        </button>
      )}

      {(!showHeader || !collapsed) && (
        <div className="px-1 pb-1.5">
          {showApplyAll && (
            <div className="flex items-center gap-2 px-1.5 pt-1 pb-0.5">
              <span
                className="min-w-0 flex-1 truncate text-secondary text-[color:var(--color-figma-text-secondary)]"
                title={strongBatch
                  .map((item) => `${PROPERTY_LABELS[item.property]}: ${item.tokenPath}`)
                  .join(", ")}
              >
                Strong matches: {formatBatchPlan(strongBatch)}
              </span>
              <button
                onClick={() => onApplyBatch?.(strongBatch)}
                className="shrink-0 text-secondary font-medium text-[color:var(--color-figma-text-accent)] hover:underline"
                title={`Apply ${strongBatch.length} best matches across properties`}
              >
                Bind {strongBatch.length}
              </button>
            </div>
          )}
          {visibleGroups.map((group, groupIdx) => (
            <div key={group.confidence}>
              {/* Group header — only when multiple groups are visible */}
              {visibleGroups.length > 1 && (
                <div className={`text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] px-1.5 pt-1 pb-0.5 ${
                  groupIdx > 0 ? 'border-t border-[var(--color-figma-border)]/50 mt-0.5' : ''
                }`}>
                  {CONFIDENCE_LABELS[group.confidence]}
                </div>
              )}

              {group.items.map((s) => {
                const colorValue = typeof s.resolvedValue === 'string' ? s.resolvedValue : null;
                const isColor = s.entry.$type === 'color' && colorValue !== null;
                const valueStr = formatValue(s.entry, s.resolvedValue);
                const propLabel = PROPERTY_LABELS[s.bestProperty];

                return (
                  <div
                    key={`${s.collectionId ?? ""}:${s.path}`}
                    className={`group relative flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--color-figma-bg-hover)] transition-colors ${
                      s.scopeHidden ? 'opacity-50' : ''
                    }`}
                    title={s.scopeHidden
                      ? `This token can't apply to ${PROPERTY_LABELS[s.bestProperty]}. Applying may fail.`
                      : undefined}
                  >
                    {/* Color swatch or type icon */}
                    {isColor ? (
                      <div
                        className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                        style={{ backgroundColor: swatchBgColor(colorValue) }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-sm bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center">
                        <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] font-bold leading-none">
                          {s.entry.$type.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Token path + metadata */}
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => onNavigateToToken?.(s.path, s.collectionId)}
                        className="block text-secondary text-[color:var(--color-figma-text)] truncate font-mono w-full text-left hover:underline"
                        title={`${s.path} — ${valueStr}`}
                      >
                        {s.path}
                      </button>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)]">
                          {propLabel}
                        </span>
                        <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] opacity-50">·</span>
                        <span className={`text-[var(--font-size-xs)] ${
                          s.confidence === 'strong'
                            ? 'text-[color:var(--color-figma-text-accent)]'
                            : 'text-[color:var(--color-figma-text-secondary)]'
                        }`}>
                          {s.reason}
                        </span>
                        {valueStr && (
                          <>
                            <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] opacity-50">·</span>
                            <span
                              className="min-w-0 max-w-[40%] text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] font-mono truncate"
                              title={valueStr}
                            >
                              {valueStr}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Apply button — always faintly visible, full opacity on hover */}
                    <button
                      onClick={() => onApply(s.path, s.bestProperty, s.collectionId)}
                      className="shrink-0 opacity-40 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] font-medium hover:bg-[var(--color-figma-accent-hover,var(--color-figma-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-figma-accent)]"
                      title={`Apply "${s.path}" to ${propLabel}`}
                      aria-label={`Apply ${s.path} to ${propLabel}`}
                    >
                      Apply
                    </button>
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
              className="w-full text-secondary text-[color:var(--color-figma-text-accent)] text-center py-1.5 border-t border-[var(--color-figma-border)]/50 mt-0.5 hover:bg-[var(--color-figma-accent)]/5 transition-colors"
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
              className="w-full text-secondary text-[color:var(--color-figma-text-secondary)] text-center py-1 border-t border-[var(--color-figma-border)]/50 mt-0.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Hide weak
            </button>
          )}

          {scopeHiddenCount > 0 && !showScopeHidden && (
            <button
              onClick={() => {
                setShowScopeHidden(true);
                lsSet(LS_SHOW_SCOPE_HIDDEN_KEY, 'true');
              }}
              className="w-full text-secondary text-[color:var(--color-figma-text-tertiary)] text-center py-1 border-t border-[var(--color-figma-border)]/50 mt-0.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title="These tokens match the search but are not compatible with the target field."
            >
              {scopeHiddenCount === 1
                ? '1 incompatible match hidden'
                : `${scopeHiddenCount} incompatible matches hidden`}
            </button>
          )}
          {scopeHiddenCount > 0 && showScopeHidden && (
            <button
              onClick={() => {
                setShowScopeHidden(false);
                lsSet(LS_SHOW_SCOPE_HIDDEN_KEY, 'false');
              }}
              className="w-full text-secondary text-[color:var(--color-figma-text-tertiary)] text-center py-1 border-t border-[var(--color-figma-border)]/50 mt-0.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Hide incompatible
            </button>
          )}
        </div>
      )}
    </div>
  );
}
