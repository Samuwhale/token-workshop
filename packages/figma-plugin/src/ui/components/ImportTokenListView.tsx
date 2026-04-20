import { useState } from 'react';
import { useImportSourceContext } from './ImportPanelContext';
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

function TokenRow({ token, tokensByPath }: { token: ImportToken; tokensByPath: Map<string, ImportToken> }) {
  const isAlias = typeof token.$value === 'string' && /^\{.+\}$/.test(token.$value);
  const aliasTarget = isAlias ? (token.$value as string).slice(1, -1) : null;
  const resolvedValue = isAlias ? resolveAlias(token, tokensByPath) : null;
  const isChained = resolvedValue !== null && resolvedValue !== aliasTarget;
  const resolvedIsColor = resolvedValue !== null && /^#[0-9a-fA-F]{3,8}$/.test(resolvedValue);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors">
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
            {token._warning}
          </div>
        )}
      </div>
      <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[token.$type ?? ''] ?? 'token-type-string'}`}>
        {token.$type}
      </span>
    </div>
  );
}

export { TokenRow };

export function ImportTokenListView() {
  const {
    tokens,
    selectedTokens,
    typeFilter,
    skippedEntries,
    fileImportValidation,
    source,
    handleBack,
    setTypeFilter,
  } = useImportSourceContext();

  const [searchText, setSearchText] = useState('');

  const validation = fileImportValidation?.source === source ? fileImportValidation : null;
  const skippedCount = validation?.skippedCount ?? skippedEntries.length;

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
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors self-start"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 5l3 3" />
        </svg>
        Back
      </button>

      {skippedCount > 0 && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
          <span className="text-[var(--color-figma-warning,#e8a100)]">{skippedCount} skipped</span> during parse
        </div>
      )}

      {tokens.some(t => t._warning?.startsWith('Duplicate path')) && (
        <div className="px-2 py-1 rounded bg-[var(--color-figma-warning,#f59e0b)]/10 border border-[var(--color-figma-warning,#e8a100)]/30 text-[10px] text-[var(--color-figma-warning,#e8a100)]">
          Duplicate paths found — only the last per path will be saved.
        </div>
      )}

      {/* Toolbar: count + type filter + search */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
          {selectedTokens.size} token{selectedTokens.size !== 1 ? 's' : ''}
        </span>

        {types.length > 1 && (
          <select
            value={typeFilter ?? ''}
            onChange={e => setTypeFilter(e.target.value || null)}
            className="text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)] min-w-0"
          >
            <option value="">All types</option>
            {types.map(type => (
              <option key={type} value={type ?? ''}>
                {type} ({tokens.filter(t => t.$type === type).length})
              </option>
            ))}
          </select>
        )}

        {tokens.length > 10 && (
          <input
            type="search"
            placeholder="Filter…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded focus:outline-none focus:border-[var(--color-figma-accent)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]"
            aria-label="Filter tokens by name or value"
          />
        )}
      </div>

      {/* Token list */}
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
        {filteredTokens.length === 0 ? (
          <div className="px-3 py-4 text-center text-[10px] text-[var(--color-figma-text-secondary)]">
            No tokens match "{searchText}"
          </div>
        ) : (
          filteredTokens.map(token => (
            <TokenRow key={token.path} token={token} tokensByPath={tokensByPath} />
          ))
        )}
      </div>
    </>
  );
}
