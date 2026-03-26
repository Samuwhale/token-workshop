import { useState, useEffect } from 'react';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';

interface ExportPanelProps {
  serverUrl: string;
  connected: boolean;
}

interface Platform {
  id: string;
  label: string;
  description: string;
}

const PLATFORMS: Platform[] = [
  { id: 'css', label: 'CSS', description: 'CSS custom properties' },
  { id: 'dart', label: 'Dart', description: 'Flutter theme classes' },
  { id: 'ios-swift', label: 'iOS Swift', description: 'UIKit / SwiftUI extensions' },
  { id: 'android', label: 'Android', description: 'XML resources / Compose' },
  { id: 'json', label: 'JSON', description: 'W3C DTCG format' },
];

interface ExportedModeValue {
  resolvedValue: any;
  reference?: string;
  isAlias: boolean;
}

interface ExportedVariable {
  name: string;
  path: string;
  resolvedType: string;
  $type: string;
  description?: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  modeValues: Record<string, ExportedModeValue>;
}

interface ExportedCollection {
  name: string;
  modes: string[];
  variables: ExportedVariable[];
}

type ExportMode = 'platforms' | 'figma-variables';

export function ExportPanel({ serverUrl, connected }: ExportPanelProps) {
  const [mode, setMode] = useState<ExportMode>('platforms');
  const [selected, setSelected] = useState<Set<string>>(new Set(['css']));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ platform: string; path: string; content: string }[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  // Figma variables export state
  const [figmaLoading, setFigmaLoading] = useState(false);
  const [figmaCollections, setFigmaCollections] = useState<ExportedCollection[]>([]);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [expandedVar, setExpandedVar] = useState<string | null>(null);

  // Listen for messages from the plugin sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'all-variables-exported') {
        setFigmaCollections(msg.collections || []);
        setFigmaLoading(false);
        if (msg.collections?.length > 0) {
          setExpandedCollection(msg.collections[0].name);
        }
      }
      if (msg.type === 'error' && figmaLoading) {
        setError(msg.message);
        setFigmaLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [figmaLoading]);

  const togglePlatform = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.size === 0 || !connected) return;
    setExporting(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch(`${serverUrl}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: Array.from(selected) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const data = await res.json();
      const flatFiles: { platform: string; path: string; content: string }[] = [];
      for (const result of data.results || []) {
        for (const file of result.files || []) {
          flatFiles.push({ platform: result.platform, path: file.path, content: file.content });
        }
      }
      setResults(flatFiles);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Exported ${flatFiles.length} file(s)` } }, '*');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setExporting(false);
    }
  };

  const handleExportFigmaVariables = () => {
    setFigmaLoading(true);
    setFigmaCollections([]);
    setError(null);
    parent.postMessage({ pluginMessage: { type: 'export-all-variables' } }, '*');
  };

  const buildDTCGJson = (): string => {
    const output: Record<string, any> = {};

    for (const collection of figmaCollections) {
      const collectionObj: Record<string, any> = {};

      for (const variable of collection.variables) {
        const parts = variable.path.split('.');
        let current = collectionObj;

        // Create nested structure
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        const lastKey = parts[parts.length - 1];

        if (collection.modes.length === 1) {
          // Single mode — flat token
          const modeVal = variable.modeValues[collection.modes[0]];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;
          current[lastKey] = token;
        } else {
          // Multi-mode — include $extensions with mode values
          const defaultMode = collection.modes[0];
          const defaultVal = variable.modeValues[defaultMode];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: defaultVal.isAlias ? defaultVal.reference : defaultVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;

          const modeExtensions: Record<string, any> = {};
          for (const modeName of collection.modes) {
            const modeVal = variable.modeValues[modeName];
            modeExtensions[modeName] = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
          }
          token.$extensions = {
            'com.figma': {
              collection: collection.name,
              hiddenFromPublishing: variable.hiddenFromPublishing,
              scopes: variable.scopes,
              modes: modeExtensions,
            },
          };

          current[lastKey] = token;
        }
      }

      output[collection.name] = collectionObj;
    }

    return JSON.stringify(output, null, 2);
  };

  const handleCopyAll = () => {
    const json = buildDTCGJson();
    navigator.clipboard.writeText(json);
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Copied all variables as DTCG JSON' } }, '*');
  };

  const handleSaveToServer = async () => {
    if (!connected) return;
    setExporting(true);
    setError(null);

    try {
      for (const collection of figmaCollections) {
        const setName = collection.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

        // Ensure set exists
        await fetch(`${serverUrl}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: setName }),
        });

        // Create/update each variable as a token
        for (const variable of collection.variables) {
          const defaultMode = collection.modes[0];
          const defaultVal = variable.modeValues[defaultMode];
          const $value = defaultVal.isAlias ? defaultVal.reference : defaultVal.resolvedValue;

          const token: Record<string, any> = {
            $type: variable.$type,
            $value,
          };
          if (variable.description) token.$description = variable.description;

          // Add mode extensions for multi-mode collections
          if (collection.modes.length > 1) {
            const modeExtensions: Record<string, any> = {};
            for (const modeName of collection.modes) {
              const modeVal = variable.modeValues[modeName];
              modeExtensions[modeName] = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
            }
            token.$extensions = {
              'com.figma': {
                collection: collection.name,
                hiddenFromPublishing: variable.hiddenFromPublishing,
                scopes: variable.scopes,
                modes: modeExtensions,
              },
            };
          }

          const res = await fetch(`${serverUrl}/api/tokens/${setName}/${variable.path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(token),
          });
          if (res.status === 409) {
            const patchRes = await fetch(`${serverUrl}/api/tokens/${setName}/${variable.path}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(token),
            });
            if (!patchRes.ok) throw new Error(`Failed to update token ${variable.path}: ${patchRes.statusText}`);
          } else if (!res.ok) {
            throw new Error(`Failed to create token ${variable.path}: ${res.statusText}`);
          }
        }
      }

      const totalVars = figmaCollections.reduce((sum, c) => sum + c.variables.length, 0);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Saved ${totalVars} variables to server` } }, '*');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setExporting(false);
    }
  };

  const formatValue = (modeVal: ExportedModeValue): string => {
    if (modeVal.isAlias) return modeVal.reference || '';
    if (modeVal.resolvedValue === null || modeVal.resolvedValue === undefined) return 'null';
    return String(modeVal.resolvedValue);
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to export tokens
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
            {error}
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex rounded border border-[var(--color-figma-border)] overflow-hidden">
          <button
            onClick={() => setMode('platforms')}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${
              mode === 'platforms'
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            Export to Platforms
          </button>
          <button
            onClick={() => setMode('figma-variables')}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${
              mode === 'figma-variables'
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            Export Figma Variables
          </button>
        </div>

        {/* Platform export mode */}
        {mode === 'platforms' && (
          <>
            <div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-2">
                Select Platforms
              </div>
              <div className="flex flex-col gap-1">
                {PLATFORMS.map(platform => (
                  <label
                    key={platform.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded border cursor-pointer transition-colors ${
                      selected.has(platform.id)
                        ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
                        : 'border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(platform.id)}
                      onChange={() => togglePlatform(platform.id)}
                      className="accent-[var(--color-figma-accent)]"
                    />
                    <div className="flex-1">
                      <div className="text-[11px] font-medium text-[var(--color-figma-text)]">{platform.label}</div>
                      <div className="text-[9px] text-[var(--color-figma-text-secondary)]">{platform.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {results.length > 0 && (
              <div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-2">
                  Generated Files
                </div>
                <div className="flex flex-col gap-1">
                  {results.map((file, i) => (
                    <div key={i} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                      <button
                        onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[8px] font-medium uppercase">
                            {file.platform}
                          </span>
                          <span className="text-[11px] text-[var(--color-figma-text)]">{file.path}</span>
                        </div>
                        <svg
                          width="8" height="8" viewBox="0 0 8 8"
                          className={`transition-transform ${expandedFile === file.path ? 'rotate-90' : ''}`}
                          fill="currentColor"
                        >
                          <path d="M2 1l4 3-4 3V1z" />
                        </svg>
                      </button>
                      {expandedFile === file.path && (
                        <div className="border-t border-[var(--color-figma-border)]">
                          <pre className="p-3 text-[10px] font-mono text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] overflow-auto max-h-48 whitespace-pre-wrap break-all">
                            {file.content}
                          </pre>
                          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(file.content);
                                parent.postMessage({ pluginMessage: { type: 'notify', message: 'Copied to clipboard' } }, '*');
                              }}
                              className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                            >
                              Copy to clipboard
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Figma variables export mode */}
        {mode === 'figma-variables' && (
          <>
            {figmaLoading && (
              <div className="flex items-center justify-center py-8 text-[var(--color-figma-text-secondary)] text-[11px]">
                Reading Figma variables...
              </div>
            )}

            {!figmaLoading && figmaCollections.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="text-[11px] text-[var(--color-figma-text-secondary)] text-center">
                  Export all local variables from this Figma file,<br />
                  including alias references between variables.
                </div>
                <button
                  onClick={handleExportFigmaVariables}
                  className="px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
                >
                  Read Figma Variables
                </button>
              </div>
            )}

            {!figmaLoading && figmaCollections.length > 0 && (
              <>
                {/* Summary */}
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  {figmaCollections.length} Collection{figmaCollections.length !== 1 ? 's' : ''} &middot;{' '}
                  {figmaCollections.reduce((sum, c) => sum + c.variables.length, 0)} Variables
                </div>

                {/* Collection list */}
                <div className="flex flex-col gap-1">
                  {figmaCollections.map(collection => (
                    <div key={collection.name} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                      <button
                        onClick={() => setExpandedCollection(
                          expandedCollection === collection.name ? null : collection.name
                        )}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-[var(--color-figma-text)]">
                            {collection.name}
                          </span>
                          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                            {collection.variables.length} var{collection.variables.length !== 1 ? 's' : ''}
                            {collection.modes.length > 1 && ` \u00b7 ${collection.modes.length} modes`}
                          </span>
                        </div>
                        <svg
                          width="8" height="8" viewBox="0 0 8 8"
                          className={`transition-transform ${expandedCollection === collection.name ? 'rotate-90' : ''}`}
                          fill="currentColor"
                        >
                          <path d="M2 1l4 3-4 3V1z" />
                        </svg>
                      </button>

                      {expandedCollection === collection.name && (
                        <div className="border-t border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                          {/* Mode headers */}
                          {collection.modes.length > 1 && (
                            <div className="flex gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]">
                              <div className="text-[9px] text-[var(--color-figma-text-secondary)] font-medium">Modes:</div>
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
                                      <div className="text-[9px] text-[var(--color-figma-text-secondary)] mb-1.5 italic">
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
                                                {formatValue(modeVal)}
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

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={handleExportFigmaVariables}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => { setFigmaCollections([]); }}
                    className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
        {mode === 'platforms' && (
          <button
            onClick={handleExport}
            disabled={selected.size === 0 || exporting}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            {exporting ? 'Exporting...' : `Export ${selected.size} Platform${selected.size !== 1 ? 's' : ''}`}
          </button>
        )}
        {mode === 'figma-variables' && figmaCollections.length > 0 && (
          <>
            <button
              onClick={handleCopyAll}
              className="w-full px-3 py-2 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/5"
            >
              Copy as DTCG JSON
            </button>
            <button
              onClick={handleSaveToServer}
              disabled={exporting}
              className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
            >
              {exporting ? 'Saving...' : 'Save to Token Server'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
