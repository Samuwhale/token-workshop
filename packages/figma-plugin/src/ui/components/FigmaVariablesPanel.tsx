import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Spinner } from './Spinner';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { ExportedCollection, ExportedModeValue, ExportedVariable } from '../hooks/useFigmaVariables';

interface FigmaVariablesPanelProps {
  figmaLoading: boolean;
  figmaCollections: ExportedCollection[];
  expandedCollection: string | null;
  setExpandedCollection: Dispatch<SetStateAction<string | null>>;
  expandedVar: string | null;
  setExpandedVar: Dispatch<SetStateAction<string | null>>;
  formatModeValue: (modeVal: ExportedModeValue) => string;
  onReload: () => void;
}

type AliasFilter = 'all' | 'aliases' | 'literals';

const ALL_FILTER = 'all';
const NO_SCOPE_FILTER = '__none__';

function buildVariableKey(collectionName: string, variablePath: string): string {
  return `${collectionName}/${variablePath}`;
}

function hasAliasValue(variable: ExportedVariable): boolean {
  return Object.values(variable.modeValues).some(modeValue => modeValue.isAlias);
}

function matchesAliasFilter(variable: ExportedVariable, aliasFilter: AliasFilter): boolean {
  if (aliasFilter === 'all') return true;
  const hasAlias = hasAliasValue(variable);
  return aliasFilter === 'aliases' ? hasAlias : !hasAlias;
}

function matchesScopeFilter(variable: ExportedVariable, scopeFilter: string): boolean {
  if (scopeFilter === ALL_FILTER) return true;
  if (scopeFilter === NO_SCOPE_FILTER) return variable.scopes.length === 0;
  return variable.scopes.includes(scopeFilter);
}

function matchesSearchQuery(
  collectionName: string,
  variable: ExportedVariable,
  query: string,
  formatModeValue: (modeVal: ExportedModeValue) => string,
): boolean {
  if (!query) return true;

  const searchTokens = [
    collectionName,
    variable.path,
    variable.description ?? '',
    variable.$type,
    ...variable.scopes,
    ...Object.values(variable.modeValues).flatMap(modeValue => (
      modeValue.isAlias
        ? [modeValue.reference ?? '']
        : [formatModeValue(modeValue)]
    )),
  ];

  return searchTokens.some(value => value.toLowerCase().includes(query));
}

function mergeIntoSet(previous: Set<string>, values: Iterable<string>): Set<string> {
  const next = new Set(previous);
  for (const value of values) {
    next.add(value);
  }
  return next;
}

function removeFromSet(previous: Set<string>, values: Iterable<string>): Set<string> {
  const next = new Set(previous);
  for (const value of values) {
    next.delete(value);
  }
  return next;
}

export function FigmaVariablesPanel({
  figmaLoading,
  figmaCollections,
  expandedCollection,
  setExpandedCollection,
  expandedVar,
  setExpandedVar,
  formatModeValue,
  onReload,
}: FigmaVariablesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [aliasFilter, setAliasFilter] = useState<AliasFilter>('all');
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [scopeFilter, setScopeFilter] = useState(ALL_FILTER);
  const [multiExpandedCollections, setMultiExpandedCollections] = useState<Set<string>>(() => new Set());
  const [multiExpandedVariables, setMultiExpandedVariables] = useState<Set<string>>(() => new Set());

  const totalCollections = figmaCollections.length;
  const totalVariables = useMemo(
    () => figmaCollections.reduce((sum, collection) => sum + collection.variables.length, 0),
    [figmaCollections],
  );

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const collection of figmaCollections) {
      for (const variable of collection.variables) {
        if (variable.$type) {
          types.add(variable.$type);
        }
      }
    }
    return [...types].sort((left, right) => left.localeCompare(right));
  }, [figmaCollections]);

  const availableScopes = useMemo(() => {
    const scopes = new Set<string>();
    let includesUnscopedVariables = false;

    for (const collection of figmaCollections) {
      for (const variable of collection.variables) {
        if (variable.scopes.length === 0) {
          includesUnscopedVariables = true;
          continue;
        }
        for (const scope of variable.scopes) {
          scopes.add(scope);
        }
      }
    }

    return {
      scopes: [...scopes].sort((left, right) => left.localeCompare(right)),
      includesUnscopedVariables,
    };
  }, [figmaCollections]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredCollections = useMemo(() => (
    figmaCollections.flatMap<ExportedCollection>((collection) => {
      const collectionMatchesSearch = normalizedSearchQuery.length > 0
        && collection.name.toLowerCase().includes(normalizedSearchQuery);

      const filteredVariables = collection.variables.filter(variable => {
        if (!matchesAliasFilter(variable, aliasFilter)) return false;
        if (typeFilter !== ALL_FILTER && variable.$type !== typeFilter) return false;
        if (!matchesScopeFilter(variable, scopeFilter)) return false;
        if (collectionMatchesSearch) return true;
        return matchesSearchQuery(collection.name, variable, normalizedSearchQuery, formatModeValue);
      });

      if (filteredVariables.length === 0) {
        return [];
      }

      return [
        {
          ...collection,
          variables: filteredVariables,
        },
      ];
    })
  ), [aliasFilter, figmaCollections, formatModeValue, normalizedSearchQuery, scopeFilter, typeFilter]);

  const visibleCollectionNames = useMemo(
    () => filteredCollections.map(collection => collection.name),
    [filteredCollections],
  );

  const visibleVariableKeys = useMemo(
    () => filteredCollections.flatMap(collection => (
      collection.variables.map(variable => buildVariableKey(collection.name, variable.path))
    )),
    [filteredCollections],
  );

  const visibleVariablesCount = useMemo(
    () => filteredCollections.reduce((sum, collection) => sum + collection.variables.length, 0),
    [filteredCollections],
  );

  const expandedCollectionNames = useMemo(() => {
    const next = new Set(multiExpandedCollections);
    if (expandedCollection) {
      next.add(expandedCollection);
    }
    return next;
  }, [expandedCollection, multiExpandedCollections]);

  const expandedVariableKeys = useMemo(() => {
    const next = new Set(multiExpandedVariables);
    if (expandedVar) {
      next.add(expandedVar);
    }
    return next;
  }, [expandedVar, multiExpandedVariables]);

  const filtersActive = normalizedSearchQuery.length > 0
    || aliasFilter !== 'all'
    || typeFilter !== ALL_FILTER
    || scopeFilter !== ALL_FILTER;

  useEffect(() => {
    const validCollections = new Set(figmaCollections.map(collection => collection.name));
    const validVariableKeys = new Set(
      figmaCollections.flatMap(collection => (
        collection.variables.map(variable => buildVariableKey(collection.name, variable.path))
      )),
    );

    setMultiExpandedCollections(previous => {
      const next = new Set([...previous].filter(collectionName => validCollections.has(collectionName)));
      return next.size === previous.size ? previous : next;
    });

    setMultiExpandedVariables(previous => {
      const next = new Set([...previous].filter(variableKey => validVariableKeys.has(variableKey)));
      return next.size === previous.size ? previous : next;
    });
  }, [figmaCollections]);

  const handleToggleCollection = (collectionName: string): void => {
    const isExpanded = expandedCollectionNames.has(collectionName);

    setMultiExpandedCollections(previous => {
      const next = new Set(previous);
      if (isExpanded) {
        next.delete(collectionName);
      } else {
        next.add(collectionName);
      }
      return next;
    });

    if (isExpanded) {
      if (expandedCollection === collectionName) {
        setExpandedCollection(null);
      }
      return;
    }

    setExpandedCollection(collectionName);
  };

  const handleToggleVariable = (variableKey: string): void => {
    const isExpanded = expandedVariableKeys.has(variableKey);

    setMultiExpandedVariables(previous => {
      const next = new Set(previous);
      if (isExpanded) {
        next.delete(variableKey);
      } else {
        next.add(variableKey);
      }
      return next;
    });

    if (isExpanded) {
      if (expandedVar === variableKey) {
        setExpandedVar(null);
      }
      return;
    }

    setExpandedVar(variableKey);
  };

  const handleExpandCollections = (): void => {
    setMultiExpandedCollections(previous => mergeIntoSet(previous, visibleCollectionNames));
  };

  const handleCollapseCollections = (): void => {
    setMultiExpandedCollections(previous => removeFromSet(previous, visibleCollectionNames));
    if (expandedCollection && visibleCollectionNames.includes(expandedCollection)) {
      setExpandedCollection(null);
    }
  };

  const handleExpandVariables = (): void => {
    setMultiExpandedCollections(previous => mergeIntoSet(previous, visibleCollectionNames));
    setMultiExpandedVariables(previous => mergeIntoSet(previous, visibleVariableKeys));
  };

  const handleCollapseVariables = (): void => {
    setMultiExpandedVariables(previous => removeFromSet(previous, visibleVariableKeys));
    if (expandedVar && visibleVariableKeys.includes(expandedVar)) {
      setExpandedVar(null);
    }
  };

  const handleClearFilters = (): void => {
    setSearchQuery('');
    setAliasFilter('all');
    setTypeFilter(ALL_FILTER);
    setScopeFilter(ALL_FILTER);
  };

  if (figmaLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Spinner size="xl" className="text-[var(--color-figma-accent)]" />
        <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
          Reading Figma variables...
        </div>
      </div>
    );
  }

  if (figmaCollections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-figma-bg-secondary)] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <div className="text-center">
          <div className="text-[11px] text-[var(--color-figma-text)] font-medium mb-1">
            Read Variables from this File
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[200px]">
            Reads all local variable collections and references. Then copy as DTCG JSON or save directly to your token server.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
          Showing {filteredCollections.length} / {totalCollections} collection{totalCollections !== 1 ? 's' : ''} &middot; {visibleVariablesCount} / {totalVariables} variable{totalVariables !== 1 ? 's' : ''}
        </div>
        <button
          onClick={onReload}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Reload
        </button>
      </div>

      <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="flex-1 min-w-0">
            <span className="sr-only">Search variables</span>
            <div className="flex items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] shrink-0" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search collections, variables, aliases, values..."
                className="w-full min-w-0 bg-transparent text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none"
              />
            </div>
          </label>
          {filtersActive && (
            <button
              onClick={handleClearFilters}
              className="shrink-0 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[112px]">
            <select
              value={aliasFilter}
              onChange={event => setAliasFilter(event.target.value as AliasFilter)}
              className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
            >
              <option value="all">All variables</option>
              <option value="aliases">Aliases only</option>
              <option value="literals">Resolved values only</option>
            </select>
          </div>

          <div className="flex-1 min-w-[112px]">
            <select
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value)}
              className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
            >
              <option value={ALL_FILTER}>All types</option>
              {availableTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[112px]">
            <select
              value={scopeFilter}
              onChange={event => setScopeFilter(event.target.value)}
              className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
            >
              <option value={ALL_FILTER}>All scopes</option>
              {availableScopes.includesUnscopedVariables && (
                <option value={NO_SCOPE_FILTER}>No scope</option>
              )}
              {availableScopes.scopes.map(scope => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExpandCollections}
            disabled={visibleCollectionNames.length === 0}
            className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Expand collections
          </button>
          <button
            onClick={handleCollapseCollections}
            disabled={visibleCollectionNames.length === 0}
            className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Collapse collections
          </button>
          <button
            onClick={handleExpandVariables}
            disabled={visibleVariableKeys.length === 0}
            className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Expand variables
          </button>
          <button
            onClick={handleCollapseVariables}
            disabled={visibleVariableKeys.length === 0}
            className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Collapse variables
          </button>
        </div>
      </div>

      {filteredCollections.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-figma-border)] px-4 py-6 text-center">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
            No variables match the current search and filters.
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Adjust the alias, type, or scope filters to widen the result set.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filteredCollections.map(collection => {
            const isCollectionExpanded = expandedCollectionNames.has(collection.name);

            return (
              <div key={collection.name} className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
                <button
                  onClick={() => handleToggleCollection(collection.name)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      className={`transition-transform shrink-0 ${isCollectionExpanded ? 'rotate-90' : ''}`}
                      fill="currentColor"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">
                      {collection.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                      {collection.variables.length} var{collection.variables.length !== 1 ? 's' : ''}
                    </span>
                    {collection.modes.length > 1 && (
                      <span className="px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[8px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                        {collection.modes.length} modes
                      </span>
                    )}
                  </div>
                </button>

                {isCollectionExpanded && (
                  <div className="border-t border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                    {collection.modes.length > 1 && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]">
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Modes:</div>
                        {collection.modes.map(modeName => (
                          <span key={modeName} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] text-[8px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                            {modeName}
                          </span>
                        ))}
                      </div>
                    )}

                    {collection.variables.map(variable => {
                      const variableKey = buildVariableKey(collection.name, variable.path);
                      const isVariableExpanded = expandedVariableKeys.has(variableKey);
                      const defaultVal = variable.modeValues[collection.modes[0]];
                      const variableHasAlias = hasAliasValue(variable);

                      return (
                        <div key={variable.path}>
                          <button
                            onClick={() => handleToggleVariable(variableKey)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          >
                            {variable.$type === 'color' && defaultVal && !defaultVal.isAlias && typeof defaultVal.resolvedValue === 'string' && (
                              <div
                                className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                                style={{ backgroundColor: defaultVal.resolvedValue }}
                              />
                            )}
                            <div className="flex-1 min-w-0 text-left">
                              <div className="text-[10px] text-[var(--color-figma-text)] truncate">
                                {variable.path}
                              </div>
                            </div>
                            {variableHasAlias && (
                              <span className="px-1 py-0.5 rounded text-[8px] font-medium bg-[#e67e22]/10 text-[#e67e22] shrink-0">
                                REF
                              </span>
                            )}
                            <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[variable.$type ?? ''] ?? 'token-type-string'}`}>
                              {variable.$type}
                            </span>
                          </button>

                          {isVariableExpanded && (
                            <div className="px-3 py-2 bg-[var(--color-figma-bg)] border-t border-[var(--color-figma-border)]">
                              {variable.description && (
                                <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5 italic">
                                  {variable.description}
                                </div>
                              )}
                              <div className="flex flex-col gap-1">
                                {collection.modes.map(modeName => {
                                  const modeVal = variable.modeValues[modeName];
                                  return (
                                    <div key={modeName} className="flex items-center gap-2">
                                      {collection.modes.length > 1 && (
                                        <span className="text-[8px] text-[var(--color-figma-text-secondary)] font-medium w-12 shrink-0 truncate">
                                          {modeName}:
                                        </span>
                                      )}
                                      {modeVal.isAlias ? (
                                        <span className="text-[10px] font-mono text-[#e67e22]">
                                          {modeVal.reference}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-mono text-[var(--color-figma-text)]">
                                          {formatModeValue(modeVal)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {variable.scopes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {variable.scopes.map(scope => (
                                    <span key={scope} className="px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[7px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                                      {scope}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
