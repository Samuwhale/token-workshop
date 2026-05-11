import { useMemo, useState } from 'react';
import { useImportSourceContext } from './ImportPanelContext';
import { type ImportToken } from './importPanelTypes';
import { tokenTypeBadgeClass } from '../../shared/types';
import { SearchField } from '../primitives';
import { SecondaryTakeoverHeader } from './SecondaryTakeoverHeader';

const ALIAS_VALUE_PATTERN = /^\{(.+)\}$/;
const COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

interface AliasResolution {
  value: string | null;
  hasCycle: boolean;
}

function isAliasValue(value: unknown): value is string {
  return typeof value === 'string' && ALIAS_VALUE_PATTERN.test(value);
}

function formatResolvedAliasValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value == null) return null;

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return null;
  }
}

function resolveAliasValue(
  aliasValue: string,
  tokensByPath: Map<string, ImportToken>,
  seenPaths: Set<string>,
): AliasResolution {
  const match = aliasValue.match(ALIAS_VALUE_PATTERN);
  if (!match) return { value: null, hasCycle: false };

  const targetPath = match[1];
  if (seenPaths.has(targetPath)) {
    return { value: null, hasCycle: true };
  }

  const target = tokensByPath.get(targetPath);
  if (!target) return { value: targetPath, hasCycle: false };

  if (isAliasValue(target.$value)) {
    seenPaths.add(targetPath);
    return resolveAliasValue(target.$value, tokensByPath, seenPaths);
  }

  return { value: formatResolvedAliasValue(target.$value), hasCycle: false };
}

function TokenRow({
  token,
  tokensByPath,
  selected,
  onToggle,
}: {
  token: ImportToken;
  tokensByPath: Map<string, ImportToken>;
  selected: boolean;
  onToggle: (path: string) => void;
}) {
  const tokenValue = token.$value;
  const isAlias = isAliasValue(tokenValue);
  const aliasTarget = isAlias ? tokenValue.slice(1, -1) : null;
  const aliasResolution = isAlias
    ? resolveAliasValue(tokenValue, tokensByPath, new Set([token.path]))
    : null;
  const resolvedValue = aliasResolution?.value ?? null;
  const isChained = resolvedValue !== null && resolvedValue !== aliasTarget;
  const resolvedColor =
    resolvedValue !== null && COLOR_HEX_PATTERN.test(resolvedValue)
      ? resolvedValue
      : null;

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(token.path)}
        aria-label={`Include ${token.path}`}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-figma-accent)]"
      />
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
            {aliasResolution?.hasCycle && (
              <span className="ml-1 text-[color:var(--color-figma-text-warning)]">
                Circular alias
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
    toggleAll,
    toggleToken,
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
  const allTokensSelected = selectedTokens.size === tokens.length && tokens.length > 0;

  return (
    <>
      <SecondaryTakeoverHeader
        title="Review tokens"
        onClose={handleBack}
      />

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
          {selectedTokens.size} of {tokens.length} included
        </span>
        <button
          type="button"
          onClick={toggleAll}
          className="shrink-0 rounded px-1.5 py-0.5 text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          {allTokensSelected ? 'Include none' : 'Include all'}
        </button>

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
          filteredTokens.map((token, index) => (
            <TokenRow
              key={`${token.path}-${index}`}
              token={token}
              tokensByPath={tokensByPath}
              selected={selectedTokens.has(token.path)}
              onToggle={toggleToken}
            />
          ))
        )}
      </div>
    </>
  );
}
