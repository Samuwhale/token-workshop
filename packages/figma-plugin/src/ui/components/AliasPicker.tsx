import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';

export function resolveAliasChain(
  ref: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  visited = new Set<string>()
): { path: string; value: any; type: string }[] {
  const path = extractAliasPath(ref) ?? ref;
  if (visited.has(path)) return [];
  visited.add(path);
  const entry = allTokensFlat[path];
  if (!entry) return [{ path, value: undefined, type: 'unknown' }];
  const v = entry.$value;
  const current = { path, value: v, type: entry.$type as string };
  if (isAlias(v)) {
    return [current, ...resolveAliasChain(v, allTokensFlat, visited)];
  }
  return [current];
}

interface AliasPickerProps {
  aliasMode: boolean;
  reference: string;
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  onToggleAlias: () => void;
  onReferenceChange: (ref: string) => void;
  showAutocomplete: boolean;
  onShowAutocompleteChange: (show: boolean) => void;
  aliasHasCycle: string[] | null;
  refInputRef: React.RefObject<HTMLInputElement>;
}

export function AliasPicker({
  aliasMode, reference, tokenType,
  allTokensFlat, pathToCollectionId,
  onToggleAlias, onReferenceChange,
  showAutocomplete, onShowAutocompleteChange,
  aliasHasCycle, refInputRef,
}: AliasPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex shrink-0 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 p-0.5">
          <button
            type="button"
            onClick={() => {
              if (aliasMode) onToggleAlias();
            }}
            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              !aliasMode
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            Direct
          </button>
          <button
            type="button"
            onClick={() => {
              if (!aliasMode) onToggleAlias();
            }}
            title="Switch to reference mode (⌘L)"
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              aliasMode
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            Reference
            <kbd className="font-sans text-[10px] opacity-70">⌘L</kbd>
          </button>
        </div>
      </div>
      {aliasMode && (
        <div className="flex flex-col gap-2">
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
              className="w-full rounded-md border border-[var(--color-figma-accent)]/45 bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/50"
            />
            {showAutocomplete && (
              <AliasAutocomplete
                query={reference.includes('{') ? reference.slice(reference.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
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
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Type <code className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-0.5 font-mono">{'{'}</code> to search for a token reference.
            </p>
          )}
          {!showAutocomplete && aliasHasCycle && (
            <p className="text-[10px] text-[var(--color-figma-error)]">
              Circular reference: <span className="font-mono">{aliasHasCycle.join(' \u2192 ')}</span>
            </p>
          )}
          {!showAutocomplete && !aliasHasCycle && isAlias(reference) && (() => {
            const chain = resolveAliasChain(reference, allTokensFlat);
            const lastHop = chain[chain.length - 1];
            if (chain.length > 0 && lastHop.value === undefined) {
              const brokenPath = lastHop.path;
              const priorPaths = chain.slice(0, -1).map(h => h.path);
              return (
                <p className="text-[10px] text-[var(--color-figma-error)]">
                  Token not found: <span className="font-mono">{brokenPath}</span>
                  {priorPaths.length > 0 && (
                    <span className="opacity-70"> (via {priorPaths.join(' \u2192 ')})</span>
                  )}
                </p>
              );
            }
            return null;
          })()}
        </div>
      )}
      {aliasMode && !aliasHasCycle && isAlias(reference) && (() => {
        const chain = resolveAliasChain(reference, allTokensFlat);
        if (chain.length === 0) return null;
        return (
          <div className="mt-2 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 px-2 py-1.5 flex flex-col gap-1">
            <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Resolves to</span>
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
    </div>
  );
}
