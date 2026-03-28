import { useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';

export function resolveAliasChain(
  ref: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  visited = new Set<string>()
): { path: string; value: any; type: string }[] {
  const path = ref.startsWith('{') && ref.endsWith('}') ? ref.slice(1, -1) : ref;
  if (visited.has(path)) return [];
  visited.add(path);
  const entry = allTokensFlat[path];
  if (!entry) return [{ path, value: undefined, type: 'unknown' }];
  const v = entry.$value;
  const current = { path, value: v, type: entry.$type as string };
  if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
    return [current, ...resolveAliasChain(v, allTokensFlat, visited)];
  }
  return [current];
}

interface AliasPickerProps {
  aliasMode: boolean;
  reference: string;
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  onToggleAlias: () => void;
  onReferenceChange: (ref: string) => void;
  showAutocomplete: boolean;
  onShowAutocompleteChange: (show: boolean) => void;
  aliasHasCycle: string[] | null;
  refInputRef: React.RefObject<HTMLInputElement>;
}

export function AliasPicker({
  aliasMode, reference, tokenType,
  allTokensFlat, pathToSet,
  onToggleAlias, onReferenceChange,
  showAutocomplete, onShowAutocompleteChange,
  aliasHasCycle, refInputRef,
}: AliasPickerProps) {
  const [showChainPopover, setShowChainPopover] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
          Reference
        </label>
        <button
          onClick={onToggleAlias}
          title={aliasMode ? 'Switch to direct value (\u2318L)' : 'Switch to reference mode (\u2318L)'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${aliasMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
          </svg>
          Reference mode
          <kbd className="ml-1 text-[10px] opacity-60 font-sans">⌘L</kbd>
        </button>
      </div>
      {aliasMode && (
        <>
        <div className="relative">
          <input
            ref={refInputRef}
            type="text"
            value={reference}
            onChange={e => {
              const v = e.target.value;
              onReferenceChange(v);
              const hasOpen = v.includes('{') && !v.endsWith('}');
              onShowAutocompleteChange(hasOpen);
            }}
            onFocus={() => {
              if (reference.includes('{') && !reference.endsWith('}')) {
                onShowAutocompleteChange(true);
              }
            }}
            onBlur={() => setTimeout(() => onShowAutocompleteChange(false), 150)}
            onKeyDown={e => {
              if (e.key === '{') onShowAutocompleteChange(true);
            }}
            placeholder="{color.primary.500}"
            aria-label="Token reference"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-[11px] outline-none placeholder:text-[var(--color-figma-text-secondary)]/50"
          />
          {showAutocomplete && (
            <AliasAutocomplete
              query={reference.includes('{') ? reference.slice(reference.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              filterType={tokenType}
              onSelect={path => {
                onReferenceChange(`{${path}}`);
                onShowAutocompleteChange(false);
              }}
              onClose={() => onShowAutocompleteChange(false)}
            />
          )}
        </div>
        {!showAutocomplete && !reference && (
          <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            Type <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">{'{'}</code> to search and select a token
          </p>
        )}
        {!showAutocomplete && aliasHasCycle && (
          <p className="mt-0.5 text-[10px] text-[var(--color-figma-error)]">
            Circular reference: <span className="font-mono">{aliasHasCycle.join(' \u2192 ')}</span>
          </p>
        )}
        {!showAutocomplete && !aliasHasCycle && reference.startsWith('{') && reference.endsWith('}') && (() => {
          const chain = resolveAliasChain(reference, allTokensFlat);
          const lastHop = chain[chain.length - 1];
          if (chain.length > 0 && lastHop.value === undefined) {
            const brokenPath = lastHop.path;
            const priorPaths = chain.slice(0, -1).map(h => h.path);
            return (
              <p className="mt-0.5 text-[10px] text-[var(--color-figma-error)]">
                Token not found: <span className="font-mono">{brokenPath}</span>
                {priorPaths.length > 0 && (
                  <span className="opacity-70"> (via {priorPaths.join(' \u2192 ')})</span>
                )}
              </p>
            );
          }
          return null;
        })()}
        </>
      )}
      {aliasMode && !aliasHasCycle && reference.startsWith('{') && reference.endsWith('}') && (() => {
        const chain = resolveAliasChain(reference, allTokensFlat);
        if (chain.length === 0) return null;
        return (
          <div className="mt-2 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 px-2 py-1.5 flex flex-col gap-1">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide font-medium">Resolves to</span>
            {chain.map((hop, i) => {
              const resolvedColor = hop.type === 'color' && typeof hop.value === 'string' && !hop.value.startsWith('{') ? hop.value : null;
              const isLast = i === chain.length - 1;
              return (
                <div key={hop.path} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{'\u21b3'}</span>}
                  {resolvedColor && (
                    <div
                      className="w-3 h-3 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)] shrink-0"
                      style={{ backgroundColor: resolvedColor }}
                      aria-hidden="true"
                    />
                  )}
                  <span className={`text-[10px] font-mono truncate ${isLast ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                    {hop.path}
                  </span>
                  {isLast && hop.value === undefined && (
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--color-figma-error)]">not found</span>
                  )}
                  {isLast && hop.value !== undefined && typeof hop.value !== 'object' && !String(hop.value).startsWith('{') && !resolvedColor && (
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--color-figma-text-secondary)] truncate max-w-[80px]" title={String(hop.value)}>
                      {String(hop.value)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
      {!aliasMode && reference && (() => {
        const chain = reference.startsWith('{') && reference.endsWith('}') ? resolveAliasChain(reference, allTokensFlat) : [];
        return (
          <div className="relative mt-1"
            onMouseEnter={() => setShowChainPopover(true)}
            onMouseLeave={() => setShowChainPopover(false)}
          >
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-accent)]/10 border border-[var(--color-figma-accent)]/30 cursor-default">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
              </svg>
              <span className="text-[10px] text-[var(--color-figma-accent)] font-mono truncate">{reference}</span>
            </div>
            {showChainPopover && chain.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg px-2.5 py-2 min-w-[180px] max-w-[260px]">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide font-medium mb-1.5">Resolution chain</div>
                <div className="flex flex-col gap-1">
                  {chain.map((hop, i) => {
                    const resolvedColor = hop.type === 'color' && typeof hop.value === 'string' && !hop.value.startsWith('{') ? hop.value : null;
                    const isLast = i === chain.length - 1;
                    return (
                      <div key={hop.path} className="flex items-center gap-1.5 min-w-0">
                        {i > 0 && (
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{'\u2192'}</span>
                        )}
                        {resolvedColor && (
                          <div
                            className="w-3 h-3 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)] shrink-0"
                            style={{ backgroundColor: resolvedColor }}
                            aria-hidden="true"
                          />
                        )}
                        <span className={`text-[10px] font-mono truncate ${isLast ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                          {isLast && hop.value !== undefined && typeof hop.value !== 'object' && !String(hop.value).startsWith('{') && !resolvedColor
                            ? String(hop.value)
                            : hop.path}
                        </span>
                        {isLast && hop.value === undefined && (
                          <span className="ml-auto shrink-0 text-[10px] text-[var(--color-figma-error)]">not found</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
