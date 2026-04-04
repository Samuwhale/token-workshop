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

function TokenRow({ token }: { token: ImportToken }) {
  const { selectedTokens, toggleToken } = useImportPanel();

  const tokensByPath = new Map<string, ImportToken>(); // not needed for display; resolved on render
  const isAlias = typeof token.$value === 'string' && /^\{.+\}$/.test(token.$value);
  const aliasTarget = isAlias ? (token.$value as string).slice(1, -1) : null;

  return (
    <label
      title={isAlias && aliasTarget ? `→ ${aliasTarget}` : undefined}
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
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-[var(--color-figma-text)] truncate">{token.path}</div>
        {isAlias && (
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
            → <span className="font-mono">{aliasTarget}</span>
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

// Needed to suppress unused var warning — resolveAlias used for full alias tooltip
function TokenRowWithAlias({ token, tokensByPath }: { token: ImportToken; tokensByPath: Map<string, ImportToken> }) {
  const { selectedTokens, toggleToken } = useImportPanel();

  const isAlias = typeof token.$value === 'string' && /^\{.+\}$/.test(token.$value);
  const aliasTarget = isAlias ? (token.$value as string).slice(1, -1) : null;
  const resolvedValue = isAlias ? resolveAlias(token, tokensByPath) : null;
  const tooltipText = isAlias
    ? resolvedValue && resolvedValue !== aliasTarget
      ? `→ ${aliasTarget}\nResolved: ${resolvedValue}`
      : `→ ${aliasTarget}`
    : undefined;

  return (
    <label
      title={tooltipText}
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
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-[var(--color-figma-text)] truncate">{token.path}</div>
        {isAlias && (
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
            → <span className="font-mono">{aliasTarget}</span>
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
export { TokenRow };

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

  const tokensByPath = new Map(tokens.map(t => [t.path, t]));
  const filteredTokens = typeFilter ? tokens.filter(t => t.$type === typeFilter) : tokens;
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

      {/* Path conflict warning banner */}
      {tokens.some(t => t._warning?.startsWith('Path conflict')) && (
        <div className="px-3 py-2 rounded bg-[var(--color-figma-warning,#f59e0b)]/10 border border-[var(--color-figma-warning,#e8a100)]/30 text-[10px] text-[var(--color-figma-warning,#e8a100)]">
          ⚠ Some tokens share the same path after normalization. Conflicting tokens are highlighted below — only the last one with each path will be saved.
        </div>
      )}

      {/* Token list */}
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
        {filteredTokens.map(token => (
          <TokenRowWithAlias key={token.path} token={token} tokensByPath={tokensByPath} />
        ))}
      </div>
    </>
  );
}
