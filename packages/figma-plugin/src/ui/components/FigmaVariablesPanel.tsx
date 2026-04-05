import type { Dispatch, SetStateAction } from 'react';
import { Spinner } from './Spinner';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { ExportedCollection, ExportedModeValue } from '../hooks/useFigmaVariables';

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
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
          {figmaCollections.length} collection{figmaCollections.length !== 1 ? 's' : ''} &middot;{' '}
          {figmaCollections.reduce((sum, c) => sum + c.variables.length, 0)} variables
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

      {/* Collection list */}
      <div className="flex flex-col gap-1.5">
        {figmaCollections.map(collection => (
          <div key={collection.name} className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
            <button
              onClick={() => setExpandedCollection(
                expandedCollection === collection.name ? null : collection.name
              )}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg
                  width="8" height="8" viewBox="0 0 8 8"
                  className={`transition-transform shrink-0 ${expandedCollection === collection.name ? 'rotate-90' : ''}`}
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

            {expandedCollection === collection.name && (
              <div className="border-t border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                {collection.modes.length > 1 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]">
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Modes:</div>
                    {collection.modes.map(m => (
                      <span key={m} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] text-[8px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                        {m}
                      </span>
                    ))}
                  </div>
                )}

                {collection.variables.map(variable => {
                  const varKey = `${collection.name}/${variable.path}`;
                  return (
                    <div key={variable.path}>
                      <button
                        onClick={() => setExpandedVar(expandedVar === varKey ? null : varKey)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        {variable.$type === 'color' && (() => {
                          const defaultVal = variable.modeValues[collection.modes[0]];
                          if (!defaultVal.isAlias && typeof defaultVal.resolvedValue === 'string') {
                            return (
                              <div
                                className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                                style={{ backgroundColor: defaultVal.resolvedValue }}
                              />
                            );
                          }
                          return null;
                        })()}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="text-[10px] text-[var(--color-figma-text)] truncate">
                            {variable.path}
                          </div>
                        </div>
                        {(() => {
                          const defaultVal = variable.modeValues[collection.modes[0]];
                          if (defaultVal.isAlias) {
                            return (
                              <span className="px-1 py-0.5 rounded text-[8px] font-medium bg-[#e67e22]/10 text-[#e67e22] shrink-0">
                                REF
                              </span>
                            );
                          }
                          return null;
                        })()}
                        <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[variable.$type ?? ''] ?? 'token-type-string'}`}>
                          {variable.$type}
                        </span>
                      </button>

                      {expandedVar === varKey && (
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
        ))}
      </div>
    </>
  );
}
