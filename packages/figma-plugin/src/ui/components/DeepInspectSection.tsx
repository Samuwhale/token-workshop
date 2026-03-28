import { useState } from 'react';
import type { BindableProperty, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { ALL_BINDABLE_PROPERTIES, PROPERTY_LABELS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import {
  getCompatibleTokenTypes,
  isTokenScopeCompatible,
} from './selectionInspectorUtils';

interface DeepInspectSectionProps {
  deepChildNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  onNavigateToToken?: (tokenPath: string) => void;
  onRemoveBinding?: (nodeId: string, property: BindableProperty, tokenPath: string) => void;
  onBindToken?: (nodeId: string, property: BindableProperty, tokenPath: string) => void;
}

/** Inline bind panel for a single deep-inspect property row */
function DeepBindPanel({
  childNode,
  prop,
  tokenMap,
  currentBinding,
  onBind,
  onClose,
}: {
  childNode: SelectionNodeInfo;
  prop: BindableProperty;
  tokenMap: Record<string, TokenMapEntry>;
  currentBinding: string;
  onBind: (nodeId: string, prop: BindableProperty, tokenPath: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const compatibleTypes = getCompatibleTokenTypes(prop);
  const candidates = Object.entries(tokenMap)
    .filter(([, entry]) => compatibleTypes.includes(entry.$type))
    .filter(([, entry]) => isTokenScopeCompatible(entry, prop))
    .filter(([path]) => !query || path.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 12);

  return (
    <div className="ml-3 mr-1 mb-1 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-bg)] overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-accent)]/5">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] shrink-0" aria-hidden="true">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
        <span className="text-[9px] text-[var(--color-figma-accent)] font-medium flex-1 truncate">
          {currentBinding ? `Remap ${PROPERTY_LABELS[prop]}` : `Bind ${PROPERTY_LABELS[prop]}`} on {childNode.name}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          title="Cancel"
          aria-label="Cancel"
        >
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="px-2 py-1.5 flex flex-col gap-1">
        <input
          autoFocus
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedIndex(-1); }}
          onKeyDown={e => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, candidates.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
            if (e.key === 'Enter' && candidates.length > 0) {
              const target = selectedIndex >= 0 ? candidates[selectedIndex] : candidates[0];
              if (target) onBind(childNode.id, prop, target[0]);
            }
          }}
          placeholder={`Search ${compatibleTypes.join(' / ')} tokens…`}
          className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[9px] text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)]"
        />
        {candidates.length === 0 ? (
          <div className="text-[9px] text-[var(--color-figma-text-secondary)] py-1 text-center">
            {query ? 'No matching tokens' : `No ${compatibleTypes.join(' or ')} tokens`}
          </div>
        ) : (
          <div className="max-h-[120px] overflow-y-auto flex flex-col gap-px">
            {candidates.map(([path, entry], idx) => {
              let swatchColor: string | null = null;
              if (entry.$type === 'color') {
                const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
                if (typeof r.value === 'string' && r.value.startsWith('#')) swatchColor = r.value;
              }
              const isSelected = idx === selectedIndex;
              const isCurrent = path === currentBinding;
              return (
                <button
                  key={path}
                  onClick={() => onBind(childNode.id, prop, path)}
                  className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left transition-colors ${isSelected ? 'bg-[var(--color-figma-accent)]/15' : 'hover:bg-[var(--color-figma-accent)]/10'} ${isCurrent ? 'opacity-50' : ''}`}
                >
                  {swatchColor ? (
                    <div className="w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: swatchColor }} />
                  ) : (
                    <div className="w-2.5 h-2.5 shrink-0 flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-[var(--color-figma-text-secondary)]/40" />
                    </div>
                  )}
                  <span className={`text-[9px] font-mono truncate flex-1 ${isSelected ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'}`}>
                    {path}
                  </span>
                  {isCurrent && (
                    <span className="text-[7px] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] px-1 py-0.5 rounded shrink-0">current</span>
                  )}
                  <span className="text-[7px] text-[var(--color-figma-text-secondary)] shrink-0">
                    {entry.$type}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DeepInspectSection({ deepChildNodes, tokenMap, onNavigateToToken, onRemoveBinding, onBindToken }: DeepInspectSectionProps) {
  // Track which property on which node has an open bind panel: "nodeId:prop"
  const [activeBindKey, setActiveBindKey] = useState<string | null>(null);

  if (deepChildNodes.length === 0) {
    return (
      <div className="mt-1 pt-1 border-t border-[var(--color-figma-border)]/50 px-3 py-2 text-center">
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No token bindings found in nested layers.</p>
      </div>
    );
  }

  const handleBind = (nodeId: string, prop: BindableProperty, tokenPath: string) => {
    onBindToken?.(nodeId, prop, tokenPath);
    setActiveBindKey(null);
  };

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
            className="px-2 py-1.5 rounded"
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
                const bindKey = `${child.id}:${prop}`;
                const isBindOpen = activeBindKey === bindKey;
                return (
                  <div key={prop}>
                    <div className="flex items-center gap-1 group/row">
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
                      {/* Action buttons — appear on hover */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        {onNavigateToToken && (
                          <button
                            onClick={() => onNavigateToToken(tokenPath)}
                            title="Go to token"
                            aria-label="Go to token"
                            className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                        {onBindToken && (
                          <button
                            onClick={() => setActiveBindKey(isBindOpen ? null : bindKey)}
                            title="Remap to another token"
                            aria-label="Remap to another token"
                            className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                        {onRemoveBinding && (
                          <button
                            onClick={() => onRemoveBinding(child.id, prop, tokenPath)}
                            title="Remove binding"
                            aria-label="Remove binding"
                            className="p-0.5 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Inline bind panel */}
                    {isBindOpen && onBindToken && (
                      <DeepBindPanel
                        childNode={child}
                        prop={prop}
                        tokenMap={tokenMap}
                        currentBinding={tokenPath}
                        onBind={handleBind}
                        onClose={() => setActiveBindKey(null)}
                      />
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
