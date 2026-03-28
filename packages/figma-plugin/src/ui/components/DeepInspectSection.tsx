import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { ALL_BINDABLE_PROPERTIES, PROPERTY_LABELS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';

interface DeepInspectSectionProps {
  deepChildNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  onNavigateToToken?: (tokenPath: string) => void;
}

export function DeepInspectSection({ deepChildNodes, tokenMap, onNavigateToToken }: DeepInspectSectionProps) {
  if (deepChildNodes.length === 0) {
    return (
      <div className="mt-1 pt-1 border-t border-[var(--color-figma-border)]/50 px-3 py-2 text-center">
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No token bindings found in nested layers.</p>
      </div>
    );
  }

  return (
    <div className="mt-1 pt-1 border-t border-[var(--color-figma-border)]/50">
      <div className="px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] font-semibold uppercase tracking-wide flex items-center gap-1">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <path d="M9 22V12h6v10" />
        </svg>
        Nested Layers ({deepChildNodes.length})
      </div>
      {deepChildNodes.map(child => {
        const boundProps = ALL_BINDABLE_PROPERTIES.filter(p => child.bindings[p]) as BindableProperty[];
        if (boundProps.length === 0) return null;
        const indent = Math.min((child.depth ?? 1) - 1, 3);
        return (
          <div
            key={child.id}
            className="group px-2 py-1.5 hover:bg-[var(--color-figma-bg-hover)] rounded"
            style={{ paddingLeft: `${8 + indent * 10}px` }}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] shrink-0" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate flex-1" title={child.name}>
                {child.name}
              </span>
              <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0 uppercase tracking-wide">
                {child.type}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 pl-3">
              {boundProps.map(prop => {
                const tokenPath = child.bindings[prop];
                const entry = tokenMap[tokenPath];
                let swatchColor: string | null = null;
                if (entry?.$type === 'color') {
                  const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
                  if (typeof r.value === 'string' && r.value.startsWith('#')) swatchColor = r.value;
                }
                return (
                  <div key={prop} className="flex items-center gap-1">
                    {swatchColor ? (
                      <div className="w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: swatchColor }} />
                    ) : (
                      <div className="w-2.5 h-2.5 shrink-0" />
                    )}
                    <span className="text-[8px] text-[var(--color-figma-text-secondary)] w-[60px] shrink-0 truncate">
                      {PROPERTY_LABELS[prop]}
                    </span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] shrink-0" aria-hidden="true">
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                    <span className="text-[8px] text-[var(--color-figma-accent)] font-mono truncate flex-1" title={tokenPath}>
                      {tokenPath}
                    </span>
                    {onNavigateToToken && (
                      <button
                        onClick={() => onNavigateToToken(tokenPath)}
                        title="Go to token"
                        aria-label="Go to token"
                        className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
