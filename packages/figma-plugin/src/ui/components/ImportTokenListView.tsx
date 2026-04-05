import { useState } from 'react';
import { useImportPanel } from './ImportPanelContext';
import { type ImportToken } from './importPanelTypes';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';

function resolveAlias(token: ImportToken, tokensByPath: Map<string, ImportToken>, depth = 0): string | null {
  if (depth > 10 || typeof token.$value !== 'string') return null;
  const match = token.$value.match(/^\{(.+)\}$/);
  if (!match) return null;
  const target = tokensByPath.get(match[1]);
  if (!target) return match[1];
  if (typeof target.$value === 'string' && /^\{.+\}$/.test(target.$value)) {
    return resolveAlias(target, tokensByPath, depth + 1) ?? String(target.$value);
  }
  return String(target.$value);
}

function TokenRowWithAlias({ token, tokensByPath }: { token: ImportToken; tokensByPath: Map<string, ImportToken> }) {
  const { selectedTokens, toggleToken } = useImportPanel();

  const isAlias = typeof token.$value === 'string' && /^\{.+\}$/.test(token.$value);
  const aliasTarget = isAlias ? (token.$value as string).slice(1, -1) : null;
  const resolvedValue = isAlias ? resolveAlias(token, tokensByPath) : null;
  const isChained = resolvedValue !== null && resolvedValue !== aliasTarget;

  // For color alias: resolved value may be a hex color
  const resolvedIsColor = resolvedValue !== null && /^#[0-9a-fA-F]{3,8}$/.test(resolvedValue);

  return (
    <label
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        selectedTokens.has(token.path) ? 'bg-[var(--color-figma-accent)]/5' : 'hover:bg-[var(--color-figma-bg-hover)]'
      }`}
    >
      <input
        type="checkbox"
        checked={selectedTokens.has(token.path)}
        onChange={() => toggleToken(token.path)}
        className="accent-[var(--color-figma-accent)]"
      />
      {token.$type === 'color' && typeof token.$value === 'string' && !isAlias && (
        <div
          className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ backgroundColor: token.$value }}
        />
      )}
      {token.$type === 'color' && isAlias && resolvedIsColor && (
        <div
          className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ backgroundColor: resolvedValue! }}
          title={resolvedValue!}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-[var(--color-figma-text)] truncate">{token.path}</div>
        {isAlias && (
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
            → <span className="font-mono">{aliasTarget}</span>
            {isChained && (
              <span className="ml-1 text-[var(--color-figma-text-tertiary,var(--color-figma-text-secondary))]">
                → <span className="font-mono">{resolvedValue}</span>
              </span>
            )}
          </div>
        )}
        {token._warning && (
          <div className="text-[10px] text-[var(--color-figma-warning,#e8a100)] truncate" title={token._warning}>
            ⚠ {token._warning}
          </div>
        )}
      </div>
      <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[token.$type ?? ''] ?? 'token-type-string'}`}>
        {token.$type}
      </span>
    </label>
  );
}

// Re-export for use in test or direct imports if needed
export { TokenRowWithAlias as TokenRow };

export function ImportTokenListView() {
  const {
    tokens,
    selectedTokens,
    typeFilter,
    source,
    skippedEntries,
    skippedExpanded,
    handleBack,
    toggleAll,
    setTypeFilter,
    setSkippedExpanded,
  } = useImportPanel();

  const [searchText, setSearchText] = useState('');

  const tokensByPath = new Map(tokens.map(t => [t.path, t]));

  const typeFilteredTokens = typeFilter ? tokens.filter(t => t.$type === typeFilter) : tokens;

  const lowerSearch = searchText.trim().toLowerCase();
  const filteredTokens = lowerSearch
    ? typeFilteredTokens.filter(t => {
        if (t.path.toLowerCase().includes(lowerSearch)) return true;
        if (typeof t.$value === 'string' && t.$value.toLowerCase().includes(lowerSearch)) return true;
        return false;
      })
    : typeFilteredTokens;

  const types = [...new Set(tokens.map(t => t.$type))].sort();

  return (
    <>
      {/* Back row */}
      <div className="flex items-center gap-2 pb-1 border-b border-[var(--color-figma-border)]">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 5l3 3" />
          </svg>
          Back
        </button>
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto">
          {source === 'json' ? 'JSON File' : source === 'css' ? 'CSS File' : source === 'tailwind' ? 'Tailwind Config' : 'Figma Styles'}
        </span>
      </div>

      {/* Preview header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
          Preview ({selectedTokens.size}/{tokens.length} selected)
        </div>
        <button
          onClick={toggleAll}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
        >
          {selectedTokens.size === tokens.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Skipped entries summary (CSS / Tailwind only) */}
      {skippedEntries.length > 0 && (source === 'css' || source === 'tailwind') && (
        <div className="rounded border border-[var(--color-figma-border)] text-[10px] overflow-hidden">
          <button
            onClick={() => setSkippedExpanded(prev => !prev)}
            className="w-full flex items-center justify-between px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg)] transition-colors text-left"
            aria-expanded={skippedExpanded}
          >
            <span className="text-[var(--color-figma-text-secondary)]">
              <span className="text-[var(--color-figma-text)] font-medium">{tokens.length}</span> imported
              {', '}
              <span className="text-[var(--color-figma-warning,#e8a100)] font-medium">{skippedEntries.length}</span> skipped
            </span>
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={`text-[var(--color-figma-text-secondary)] transition-transform ${skippedExpanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          </button>
          {skippedExpanded && (
            <div className="max-h-36 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
              {skippedEntries.map((entry, i) => (
                <div key={i} className="px-2 py-1.5 flex flex-col gap-0.5">
                  <span className="font-mono text-[var(--color-figma-text)] text-[9px]">{entry.path}</span>
                  <span className="text-[var(--color-figma-text-secondary)] text-[9px]">
                    {entry.reason}
                    {entry.originalExpression && (
                      <> — <code className="font-mono text-[var(--color-figma-text)]">{entry.originalExpression.length > 48 ? entry.originalExpression.slice(0, 48) + '…' : entry.originalExpression}</code></>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Type filter pills */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter(null)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
              typeFilter === null
                ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
                : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'
            }`}
          >
            All
          </button>
          {types.map(type => {
            const count = tokens.filter(t => t.$type === type).length;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(prev => prev === type ? null : type)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  typeFilter === type
                    ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'
                }`}
              >
                {type} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search input */}
      {tokens.length > 10 && (
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)] pointer-events-none"
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Filter tokens…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded focus:outline-none focus:border-[var(--color-figma-accent)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]"
            aria-label="Filter tokens by name or value"
          />
        </div>
      )}

      {/* Path conflict warning banner */}
      {tokens.some(t => t._warning?.startsWith('Path conflict')) && (
        <div className="px-3 py-2 rounded bg-[var(--color-figma-warning,#f59e0b)]/10 border border-[var(--color-figma-warning,#e8a100)]/30 text-[10px] text-[var(--color-figma-warning,#e8a100)]">
          ⚠ Some tokens share the same path after normalization. Conflicting tokens are highlighted below — only the last one with each path will be saved.
        </div>
      )}

      {/* Token list */}
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
        {filteredTokens.length === 0 ? (
          <div className="px-3 py-4 text-center text-[10px] text-[var(--color-figma-text-secondary)]">
            No tokens match "{searchText}"
          </div>
        ) : (
          filteredTokens.map(token => (
            <TokenRowWithAlias key={token.path} token={token} tokensByPath={tokensByPath} />
          ))
        )}
      </div>

      {/* Search result count */}
      {lowerSearch && filteredTokens.length > 0 && filteredTokens.length < typeFilteredTokens.length && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">
          Showing {filteredTokens.length} of {typeFilteredTokens.length} tokens
        </div>
      )}
    </>
  );
}
