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
  example: string;
}

const PLATFORMS: Platform[] = [
  { id: 'css', label: 'CSS', description: 'CSS custom properties', example: '--color-brand: #0066ff;' },
  { id: 'dart', label: 'Dart', description: 'Flutter theme classes', example: 'static const colorBrand = Color(0xFF0066FF);' },
  { id: 'ios-swift', label: 'iOS Swift', description: 'UIKit / SwiftUI extensions', example: 'static let colorBrand = UIColor(...)' },
  { id: 'android', label: 'Android', description: 'XML resources / Compose', example: '<color name="color_brand">#0066FF</color>' },
  { id: 'json', label: 'JSON', description: 'W3C DTCG format', example: '"color-brand": { "$type": "color", "$value": "#0066ff" }' },
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
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // Figma variables export state
  const [figmaLoading, setFigmaLoading] = useState(false);
  const [figmaCollections, setFigmaCollections] = useState<ExportedCollection[]>([]);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [expandedVar, setExpandedVar] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

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
      if (flatFiles.length > 0) setExpandedFile(flatFiles[0].path);
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

  const handleDownloadFile = (file: { path: string; content: string }) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'tokens.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyFile = (file: { path: string; content: string }) => {
    navigator.clipboard.writeText(file.content);
    setCopiedFile(file.path);
    setTimeout(() => setCopiedFile(null), 1500);
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Copied to clipboard' } }, '*');
  };

  const handleCopyAll = () => {
    const json = buildDTCGJson();
    navigator.clipboard.writeText(json);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Copied all variables as DTCG JSON' } }, '*');
  };

  const handleCopyAllPlatformResults = () => {
    const allContent = results.map(f => `/* ${f.platform}: ${f.path} */\n${f.content}`).join('\n\n');
    navigator.clipboard.writeText(allContent);
    parent.postMessage({ pluginMessage: { type: 'notify', message: `Copied ${results.length} file(s) to clipboard` } }, '*');
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
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
        <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
          Connect to server to export tokens
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {error && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        {/* Mode toggle — segmented control with icons */}
        <div className="flex rounded-md bg-[var(--color-figma-bg-secondary)] p-0.5 gap-0.5">
          <button
            onClick={() => setMode('platforms')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
              mode === 'platforms'
                ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
            </svg>
            Platforms
          </button>
          <button
            onClick={() => setMode('figma-variables')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
              mode === 'figma-variables'
                ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Figma Variables
          </button>
        </div>

        {/* Mode description */}
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed -mt-1">
          {mode === 'platforms'
            ? 'Generate platform-specific code files from the token server — CSS variables, Dart, Swift, Android, or W3C JSON.'
            : 'Read local variables from this Figma file, preview them, and copy as DTCG JSON or save to the token server.'}
        </div>

        {/* Platform export mode */}
        {mode === 'platforms' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Target Platforms
                </div>
                <button
                  onClick={() => {
                    if (selected.size === PLATFORMS.length) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(PLATFORMS.map(p => p.id)));
                    }
                  }}
                  className="text-[9px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                >
                  {selected.size === PLATFORMS.length ? 'Deselect all' : `Select all (${PLATFORMS.length})`}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {PLATFORMS.map(platform => {
                  const isSelected = selected.has(platform.id);
                  return (
                    <label
                      key={platform.id}
                      className={`group flex items-start gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
                          : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'bg-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]'
                      }`}>
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePlatform(platform.id)}
                        className="sr-only"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[var(--color-figma-text)]">{platform.label}</div>
                        <div className="text-[9px] text-[var(--color-figma-text-secondary)]">{platform.description}</div>
                        {isSelected && (
                          <div className="mt-1 text-[8px] font-mono text-[var(--color-figma-text-tertiary)] truncate">
                            {platform.example}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {results.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                    Generated Files
                  </div>
                  <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                    {results.length} file{results.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {results.map((file, i) => (
                    <div key={i} className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
                      <button
                        onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[8px] font-medium uppercase shrink-0">
                            {file.platform}
                          </span>
                          <span className="text-[10px] text-[var(--color-figma-text)] font-mono truncate">{file.path}</span>
                        </div>
                        <svg
                          width="8" height="8" viewBox="0 0 8 8"
                          className={`transition-transform shrink-0 ml-2 ${expandedFile === file.path ? 'rotate-90' : ''}`}
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
                          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                              {file.content.split('\n').length} lines
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDownloadFile(file)}
                                className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                                title="Download file"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download
                              </button>
                              <button
                                onClick={() => handleCopyFile(file)}
                                className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                                title="Copy to clipboard"
                              >
                                {copiedFile === file.path ? (
                                  <>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <rect x="9" y="9" width="13" height="13" rx="2" />
                                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                    Copy
                                  </>
                                )}
                              </button>
                            </div>
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
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] animate-spin" aria-hidden="true">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
                  Reading Figma variables...
                </div>
              </div>
            )}

            {!figmaLoading && figmaCollections.length === 0 && (
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
                    Export Figma Variables
                  </div>
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[200px]">
                    Read all local variables from this file, including alias references between variables.
                  </div>
                </div>
                <button
                  onClick={handleExportFigmaVariables}
                  className="px-4 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
                >
                  Read Variables
                </button>
              </div>
            )}

            {!figmaLoading && figmaCollections.length > 0 && (
              <>
                {/* Summary bar */}
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                    {figmaCollections.length} collection{figmaCollections.length !== 1 ? 's' : ''} &middot;{' '}
                    {figmaCollections.reduce((sum, c) => sum + c.variables.length, 0)} variables
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleExportFigmaVariables}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 4v6h-6M1 20v-6h6" />
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                      </svg>
                      Refresh
                    </button>
                    <button
                      onClick={() => { setFigmaCollections([]); }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Clear
                    </button>
                  </div>
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
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
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
                          {/* Mode headers */}
                          {collection.modes.length > 1 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]">
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
              </>
            )}
          </>
        )}
      </div>

      {/* Sticky action footer */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
        {mode === 'platforms' && (
          <button
            onClick={handleExport}
            disabled={selected.size === 0 || exporting}
            className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
          >
            {exporting ? 'Exporting...' : `Export ${selected.size} Platform${selected.size !== 1 ? 's' : ''}`}
          </button>
        )}
        {mode === 'figma-variables' && figmaCollections.length > 0 && (
          <>
            <button
              onClick={handleCopyAll}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/5 transition-colors"
            >
              Copy as DTCG JSON
            </button>
            <button
              onClick={handleSaveToServer}
              disabled={exporting}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
              title="Create or update tokens in your local token server from these Figma variables"
            >
              {exporting ? 'Importing...' : 'Import into Token Server'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
