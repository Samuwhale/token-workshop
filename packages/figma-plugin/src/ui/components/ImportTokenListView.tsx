import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useImportSourceContext } from './ImportPanelContext';
import { type ImportToken } from './importPanelTypes';
import { tokenTypeBadgeClass } from '../../shared/types';
import { SearchField } from '../primitives';

const ALIAS_VALUE_PATTERN = /^\{(.+)\}$/;
const COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

function isAliasValue(value: unknown): value is string {
  return typeof value === 'string' && ALIAS_VALUE_PATTERN.test(value);
}

function resolveAlias(token: ImportToken, tokensByPath: Map<string, ImportToken>, depth = 0): string | null {
  if (depth > 10 || typeof token.$value !== 'string') return null;
  const match = token.$value.match(ALIAS_VALUE_PATTERN);
  if (!match) return null;
  const target = tokensByPath.get(match[1]);
  if (!target) return match[1];
  if (isAliasValue(target.$value)) {
    return resolveAlias(target, tokensByPath, depth + 1) ?? String(target.$value);
  }
  return String(target.$value);
}

function TokenRow({ token, tokensByPath }: { token: ImportToken; tokensByPath: Map<string, ImportToken> }) {
  const tokenValue = token.$value;
  const isAlias = isAliasValue(tokenValue);
  const aliasTarget = isAlias ? tokenValue.slice(1, -1) : null;
  const resolvedValue = isAlias ? resolveAlias(token, tokensByPath) : null;
  const isChained = resolvedValue !== null && resolvedValue !== aliasTarget;
  const resolvedColor =
    resolvedValue !== null && COLOR_HEX_PATTERN.test(resolvedValue)
      ? resolvedValue
      : null;

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors">
      {token.$type === 'color' && typeof tokenValue === 'string' && !isAlias && (
        <div
          className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ backgroundColor: tokenValue }}
        />
      )}
      {token.$type === 'color' && isAlias && resolvedColor !== null && (
        <div
          className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ backgroundColor: resolvedColor }}
          title={resolvedColor}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-secondary text-[color:var(--color-figma-text)] break-all">{token.path}</div>
        {isAlias && (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)] break-all">
            → <span className="font-mono">{aliasTarget}</span>
            {isChained && (
              <span className="ml-1 text-[color:var(--color-figma-text-tertiary,var(--color-figma-text-secondary))]">
                → <span className="font-mono">{resolvedValue}</span>
              </span>
            )}
          </div>
        )}
        {token._warning && (
          <div className="text-secondary text-[color:var(--color-figma-text-warning)] break-words" title={token._warning}>
            {token._warning}
          </div>
        )}
      </div>
      <span className={`px-1 py-0.5 rounded text-[var(--font-size-xs)] font-medium uppercase shrink-0 ${tokenTypeBadgeClass(token.$type)}`}>
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
  const duplicatePathWarnings = useMemo(
    () => tokens.filter((token) => token._warning?.startsWith('Duplicate path')),
    [tokens],
  );
  const skippedPreview = useMemo(() => skippedEntries.slice(0, 4), [skippedEntries]);
  const hiddenSkippedCount = Math.max(0, skippedEntries.length - skippedPreview.length);

  const tokensByPath = useMemo(
    () => new Map(tokens.map((token) => [token.path, token])),
    [tokens],
  );

  const typeFilteredTokens = useMemo(
    () => (typeFilter ? tokens.filter((token) => token.$type === typeFilter) : tokens),
    [tokens, typeFilter],
  );

  const lowerSearch = searchText.trim().toLowerCase();
  const filteredTokens = useMemo(
    () =>
      lowerSearch
        ? typeFilteredTokens.filter((token) => {
            if (token.path.toLowerCase().includes(lowerSearch)) return true;
            if (typeof token.$value === 'string' && token.$value.toLowerCase().includes(lowerSearch)) return true;
            return false;
          })
        : typeFilteredTokens,
    [lowerSearch, typeFilteredTokens],
  );

  const types = useMemo(
    () => [...new Set(tokens.map((token) => token.$type))].sort(),
    [tokens],
  );
  const tokenCountByType = useMemo(() => {
    const countByType = new Map<ImportToken['$type'], number>();
    for (const token of tokens) {
      countByType.set(token.$type, (countByType.get(token.$type) ?? 0) + 1);
    }
    return countByType;
  }, [tokens]);

  return (
    <>
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] transition-colors self-start"
      >
        <ChevronLeft size={12} strokeWidth={1.75} aria-hidden />
        Back
      </button>

      {skippedCount > 0 && (
        <details className="rounded bg-[var(--color-figma-warning)]/8 px-2.5 py-1.5 text-secondary text-[color:var(--color-figma-text-warning)]">
          <summary className="cursor-pointer font-medium">
            Review {skippedCount} value{skippedCount === 1 ? '' : 's'} not imported
          </summary>
          <div className="mt-1.5 flex flex-col gap-1 text-[color:var(--color-figma-text-secondary)]">
            <p className="m-0">
              These entries could not become tokens. Fix the source file, then import again.
            </p>
            {skippedPreview.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {skippedPreview.map((entry, index) => (
                  <li key={`${entry.path ?? 'entry'}-${index}`} className="break-words">
                    <span className="font-mono text-[color:var(--color-figma-text)]">
                      {entry.path || 'Unnamed entry'}
                    </span>
                    {entry.reason ? ` — ${entry.reason}` : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {hiddenSkippedCount > 0 ? (
              <p className="m-0 text-[color:var(--color-figma-text-tertiary)]">
                {hiddenSkippedCount} more not shown.
              </p>
            ) : null}
          </div>
        </details>
      )}

      {duplicatePathWarnings.length > 0 && (
        <div className="px-2 py-1 rounded bg-[var(--color-figma-warning)]/10 border border-[var(--color-figma-warning)]/30 text-secondary text-[color:var(--color-figma-text-warning)]">
          Resolve duplicate paths before importing. {duplicatePathWarnings.length} token{duplicatePathWarnings.length === 1 ? '' : 's'} share a path, and only the last value for each path will be saved.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
          {selectedTokens.size} token{selectedTokens.size !== 1 ? 's' : ''}
        </span>

        {types.length > 1 && (
          <select
            value={typeFilter ?? ''}
            onChange={e => setTypeFilter(e.target.value || null)}
            className="min-w-0 flex-[1_1_120px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-secondary text-[color:var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
          >
            <option value="">All types</option>
            {types.map(type => (
              <option key={type} value={type}>
                {type} ({tokenCountByType.get(type) ?? 0})
              </option>
            ))}
          </select>
        )}

        {tokens.length > 10 && (
          <SearchField
            size="sm"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onClear={() => setSearchText('')}
            placeholder="Filter by name or value"
            aria-label="Filter tokens by name or value"
            containerClassName="min-w-0 flex-[999_1_180px]"
          />
        )}
      </div>

      <div className="overflow-hidden rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
        {filteredTokens.length === 0 ? (
          <div className="px-3 py-4 text-center text-secondary text-[color:var(--color-figma-text-secondary)]">
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
