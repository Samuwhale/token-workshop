import React from 'react';
import type { RefObject } from 'react';
import { Spinner } from './Spinner';
import { PLATFORMS } from '../shared/platforms';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { PlatformConfig } from '../hooks/usePlatformConfig';
import type { DiffState } from '../hooks/useDiffState';
import type { ExportPresetsState, ExportPreset } from '../hooks/useExportPresets';
import type { ExportResultFile } from '../hooks/useExportResults';

const ALL_TOKEN_TYPES = Object.keys(TOKEN_TYPE_BADGE_CLASS);

interface PlatformExportConfigProps {
  platformConfig: PlatformConfig;
  diffState: DiffState;
  presetsState: ExportPresetsState;
  // From useExportResults
  results: ExportResultFile[];
  exporting: boolean;
  previewFileIndex: number;
  setPreviewFileIndex: (i: number) => void;
  copiedFile: string | null;
  handleExport: (showModal?: boolean) => Promise<void>;
  handleDownloadFile: (file: ExportResultFile) => void;
  handleCopyFile: (file: ExportResultFile) => Promise<void>;
  // Cross-hook callbacks from ExportPanel
  onSavePreset: () => void;
  onLoadPreset: (preset: ExportPreset) => void;
  onLoadPresetFiltersOnly: (preset: ExportPreset) => void;
  onDeletePreset: (id: string) => void;
  // Other
  collectionIds: string[];
  connected: boolean;
  savePresetInputRef: RefObject<HTMLInputElement | null>;
}

export function PlatformExportConfig({
  platformConfig,
  diffState,
  presetsState,
  results,
  exporting,
  previewFileIndex,
  setPreviewFileIndex,
  copiedFile,
  handleExport,
  handleDownloadFile,
  handleCopyFile,
  onSavePreset,
  onLoadPreset,
  onLoadPresetFiltersOnly,
  onDeletePreset,
  collectionIds,
  connected,
  savePresetInputRef,
}: PlatformExportConfigProps) {
  const {
    selected, setSelected,
    cssSelector, setCssSelector,
    zipFilename, setZipFilename,
    nestByPlatform, setNestByPlatform,
    selectedCollections, setSelectedCollections,
    selectedTypes, setSelectedTypes,
    pathPrefix, setPathPrefix,
    setsOpen, setSetsOpen,
    typesOpen, setTypesOpen,
    pathPrefixOpen, setPathPrefixOpen,
    cssSelectorOpen, setCssSelectorOpen,
  } = platformConfig;

  const {
    changesOnly, setChangesOnly,
    diffLoading, diffError,
    diffPaths,
    isGitRepo,
    lastExportTimestamp,
    scopeOpen, setScopeOpen,
    fetchDiff, fetchDiffSince, handleSetBaseline,
  } = diffState;

  const {
    presets,
    showSavePreset, setShowSavePreset,
    presetName, setPresetName,
  } = presetsState;

  const toggleCollection = (name: string) => {
    setSelectedCollections(prev => {
      const base = prev ?? new Set(collectionIds);
      const next = new Set(base);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next.size === collectionIds.length ? null : next;
    });
  };

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

  return (
    <>
      {/* Export presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
              Presets
            </div>
            <kbd className="text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 font-mono leading-none" title="Export with preset (command palette)">⌘⇧E</kbd>
          </div>
          <button
            onClick={() => {
              setShowSavePreset(v => !v);
              setPresetName('');
              setTimeout(() => savePresetInputRef.current?.focus(), 0);
            }}
            className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
          >
            Save current
          </button>
        </div>

        {showSavePreset && (
          <div className="flex items-center gap-1.5 mb-2">
            <input
              ref={savePresetInputRef as React.LegacyRef<HTMLInputElement>}
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSavePreset();
                if (e.key === 'Escape') { setShowSavePreset(false); setPresetName(''); }
              }}
              placeholder="Preset name…"
              className="flex-1 px-2 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] font-mono focus:focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
            />
            <button
              onClick={onSavePreset}
              disabled={!presetName.trim()}
              className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              Save
            </button>
            <button
              onClick={() => { setShowSavePreset(false); setPresetName(''); }}
              className="px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              aria-label="Cancel"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {presets.length === 0 && !showSavePreset && (
          <div className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed">
            No presets yet. Configure your export settings and click "Save current" to create one.
          </div>
        )}

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {presets.map(preset => (
              <div key={preset.id} className="flex items-center rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] overflow-hidden">
                <button
                  onClick={() => onLoadPreset(preset)}
                  title="Load full preset — replaces current platform selection and all filters"
                  className="px-2 py-1 text-[10px] text-[var(--color-figma-text)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  {preset.name}
                </button>
                <div className="w-px self-stretch bg-[var(--color-figma-border)]" />
                <button
                  onClick={() => onLoadPresetFiltersOnly(preset)}
                  title="Apply collections, types, and path prefix from this preset — keeps the current platform selection"
                  className="px-1.5 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  aria-label={`Apply filters only from preset ${preset.name}`}
                >
                  Filters
                </button>
                <div className="w-px self-stretch bg-[var(--color-figma-border)]" />
                <button
                  onClick={() => onDeletePreset(preset.id)}
                  title="Delete preset"
                  className="px-1.5 py-1 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Target Platforms */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
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
            className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
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
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)]">{platform.description}</div>
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

      {/* CSS Selector */}
      {selected.has('css') && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setCssSelectorOpen(v => !v)}
              className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform shrink-0 ${cssSelectorOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                <path d="M2 1l4 3-4 3" />
              </svg>
              <span className="font-medium uppercase tracking-wide">CSS Selector</span>
            </button>
            {cssSelectorOpen ? (
              cssSelector !== ':root' && (
                <button
                  onClick={() => setCssSelector(':root')}
                  className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                >
                  Reset to :root
                </button>
              )
            ) : (
              <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] truncate max-w-[120px]">{cssSelector || ':root'}</span>
            )}
          </div>
          {cssSelectorOpen && (
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                value={cssSelector}
                onChange={e => setCssSelector(e.target.value)}
                placeholder=":root"
                spellCheck={false}
                className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] font-mono text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] transition-colors placeholder:text-[var(--color-figma-text-tertiary)]"
              />
              <div className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed">
                Wrap CSS variables with a custom selector — e.g. <span className="font-mono">.light</span>, <span className="font-mono">[data-theme="dark"]</span>, or <span className="font-mono">:root .brand</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collections */}
      {collectionIds.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setSetsOpen(v => !v)}
              className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform shrink-0 ${setsOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                <path d="M2 1l4 3-4 3" />
              </svg>
              <span className="font-medium uppercase tracking-wide">Collections</span>
            </button>
            {setsOpen ? (
              <button
                onClick={() => {
                  if (selectedCollections === null) {
                    setSelectedCollections(new Set());
                  } else {
                    setSelectedCollections(null);
                  }
                }}
                className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
              >
                {selectedCollections === null
                  ? `Deselect all`
                  : `Select all (${collectionIds.length})`}
              </button>
            ) : (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                {selectedCollections === null
                  ? 'All collections'
                  : selectedCollections.size === 0
                    ? <span className="text-[var(--color-figma-warning)]">None selected</span>
                    : `${selectedCollections.size} of ${collectionIds.length}`}
              </span>
            )}
          </div>
          {setsOpen && (
            <div className="flex flex-col gap-1">
              {collectionIds.map((collectionId) => {
                const isSelected =
                  selectedCollections === null ||
                  selectedCollections.has(collectionId);
                return (
                  <label
                    key={collectionId}
                    className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-md border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
                        : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                        : 'border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]'
                    }`}>
                      {isSelected && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCollection(collectionId)}
                      className="sr-only"
                    />
                    <span className="text-[11px] text-[var(--color-figma-text)] font-mono truncate">{collectionId}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Token Types */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => {
              const next = !typesOpen;
              setTypesOpen(next);
              if (next && selectedTypes === null) setSelectedTypes(new Set(ALL_TOKEN_TYPES));
            }}
            className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform shrink-0 ${typesOpen ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="M2 1l4 3-4 3" />
            </svg>
            <span className="font-medium uppercase tracking-wide">Token Types</span>
          </button>
          {typesOpen ? (
            selectedTypes !== null && selectedTypes.size < ALL_TOKEN_TYPES.length && (
              <button
                onClick={() => setSelectedTypes(null)}
                className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
              >
                All types
              </button>
            )
          ) : (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              {selectedTypes === null || selectedTypes.size === ALL_TOKEN_TYPES.length
                ? 'All types'
                : selectedTypes.size === 0
                  ? <span className="text-[var(--color-figma-warning)]">None selected</span>
                  : `${selectedTypes.size} of ${ALL_TOKEN_TYPES.length}`}
            </span>
          )}
        </div>
        {typesOpen && (
          <div className="flex flex-wrap gap-1">
            {ALL_TOKEN_TYPES.map(type => {
              const isChecked = selectedTypes === null || selectedTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => setSelectedTypes(prev => {
                    const next = new Set(prev ?? ALL_TOKEN_TYPES);
                    if (next.has(type)) { next.delete(type); } else { next.add(type); }
                    return next.size === ALL_TOKEN_TYPES.length ? null : next;
                  })}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors border ${
                    isChecked
                      ? 'bg-[var(--color-figma-accent)]/10 border-[var(--color-figma-accent)] text-[var(--color-figma-accent)]'
                      : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] hover:border-[var(--color-figma-text-tertiary)]'
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Path Prefix */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setPathPrefixOpen(v => !v)}
            className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform shrink-0 ${pathPrefixOpen ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="M2 1l4 3-4 3" />
            </svg>
            <span className="font-medium uppercase tracking-wide">Path Prefix</span>
          </button>
          {pathPrefixOpen ? (
            pathPrefix && (
              <button
                onClick={() => setPathPrefix('')}
                className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
              >
                Clear
              </button>
            )
          ) : (
            <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] truncate max-w-[120px]">{pathPrefix || 'None'}</span>
          )}
        </div>
        {pathPrefixOpen && (
          <>
            <input
              type="text"
              value={pathPrefix}
              onChange={e => setPathPrefix(e.target.value)}
              placeholder="e.g. color or spacing.scale"
              spellCheck={false}
              className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] font-mono text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] transition-colors placeholder:text-[var(--color-figma-text-tertiary)]"
            />
            <div className="mt-1 text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed">
              Export only tokens under this path — e.g. <span className="font-mono">color</span> or <span className="font-mono">spacing.scale</span>
            </div>
          </>
        )}
      </div>

      {/* Scope / Changes only */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setScopeOpen(v => !v)}
            className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform shrink-0 ${scopeOpen ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="M2 1l4 3-4 3" />
            </svg>
            <span className="font-medium uppercase tracking-wide">Scope</span>
          </button>
          {!scopeOpen && (
            <span className={`text-[10px] ${changesOnly ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-tertiary)]'}`}>
              {changesOnly ? 'Changes only' : 'All tokens'}
            </span>
          )}
        </div>
        {scopeOpen && (
          <>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={changesOnly}
                onChange={() => {
                  const next = !changesOnly;
                  setChangesOnly(next);
                  if (next && connected && diffPaths === null) {
                    fetchDiff();
                  }
                }}
                className="sr-only"
              />
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                changesOnly
                  ? 'bg-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]'
              }`}>
                {changesOnly && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-[var(--color-figma-text)]">Changes only</span>
                <span className="ml-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {isGitRepo === false
                    ? 'Tokens from files modified since last export'
                    : 'Tokens added or modified since last commit'}
                </span>
              </div>
            </label>

            {changesOnly && (
              <div className="mt-2 pl-6">
                {isGitRepo === false ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--color-figma-text-tertiary)] shrink-0 mt-px">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>Git not available — tracking by file modification time instead.</span>
                    </div>
                    {lastExportTimestamp === null ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                          Set a baseline to track changes. Future exports will include only tokens from files modified after that point.
                        </span>
                        <button
                          onClick={handleSetBaseline}
                          className="self-start px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
                        >
                          Set baseline now
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        {diffLoading ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                            <Spinner size="sm" />
                            Checking for changes…
                          </div>
                        ) : diffError ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-error)]">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="15" y1="9" x2="9" y2="15" />
                              <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            {diffError}
                          </div>
                        ) : diffPaths !== null ? (
                          <div className="flex items-center gap-2 flex-wrap flex-1">
                            {diffPaths.length === 0 ? (
                              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                                No changes since {new Date(lastExportTimestamp).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--color-figma-text)]">
                                <span className="font-medium text-[var(--color-figma-accent)]">{diffPaths.length}</span>
                                {' '}token{diffPaths.length !== 1 ? 's' : ''} modified since {new Date(lastExportTimestamp).toLocaleString()}
                              </span>
                            )}
                            <button
                              onClick={() => fetchDiffSince(lastExportTimestamp)}
                              title="Re-check for changes"
                              className="text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] transition-colors flex items-center gap-1"
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                              </svg>
                              Refresh
                            </button>
                            <button
                              onClick={handleSetBaseline}
                              title="Reset baseline to now"
                              className="text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] transition-colors"
                            >
                              Reset baseline
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Fetching changes…</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {diffLoading ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                        <Spinner size="sm" />
                        Checking for changes…
                      </div>
                    ) : diffError ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-error)]">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        {diffError}
                      </div>
                    ) : diffPaths !== null ? (
                      <div className="flex items-center gap-2 flex-1">
                        {diffPaths.length === 0 ? (
                          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">No uncommitted changes detected</span>
                        ) : (
                          <span className="text-[10px] text-[var(--color-figma-text)]">
                            <span className="font-medium text-[var(--color-figma-accent)]">{diffPaths.length}</span>
                            {' '}token{diffPaths.length !== 1 ? 's' : ''} changed
                          </span>
                        )}
                        <button
                          onClick={fetchDiff}
                          title="Re-check for changes"
                          className="text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] transition-colors flex items-center gap-1"
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Refresh
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Fetching changes…</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ZIP Options (shown after first export) */}
      {results.length > 0 && (
        <div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium mb-2">
            ZIP Options
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Filename</label>
              <div className="flex items-center flex-1 min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden">
                <input
                  type="text"
                  value={zipFilename}
                  onChange={(e) => setZipFilename(e.target.value)}
                  placeholder="tokens"
                  className="flex-1 min-w-0 px-2 py-1 bg-transparent text-[10px] text-[var(--color-figma-text)] font-mono outline-none"
                />
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)] pr-2 shrink-0">.zip</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={nestByPlatform}
                onChange={() => setNestByPlatform(!nestByPlatform)}
                className="sr-only"
              />
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                nestByPlatform
                  ? 'bg-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]'
              }`}>
                {nestByPlatform && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>
              <span className="text-[10px] text-[var(--color-figma-text)]">Nest files by platform folder</span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">e.g. css/variables.css</span>
            </label>
          </div>
        </div>
      )}

      {/* Inline preview */}
      {results.length > 0 && (() => {
        const activeFile = results[previewFileIndex] ?? results[0];
        const lines = activeFile.content.split('\n');
        return (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                Preview
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport()}
                  disabled={selected.size === 0 || !connected || exporting}
                  title="Re-run export with current settings"
                  className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {exporting ? (
                    <Spinner size="sm" />
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  )}
                  Refresh
                </button>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {results.length} file{results.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* File tabs */}
            <div className="flex gap-0.5 overflow-x-auto pb-1 mb-1 scrollbar-thin">
              {results.map((file, i) => (
                <div
                  key={i}
                  className={`group flex items-center rounded-t-md border border-b-0 shrink-0 overflow-hidden transition-colors ${
                    i === previewFileIndex
                      ? 'bg-[var(--color-figma-bg)] border-[var(--color-figma-border)]'
                      : 'bg-transparent border-transparent hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  <button
                    onClick={() => setPreviewFileIndex(i)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-mono whitespace-nowrap transition-colors ${
                      i === previewFileIndex
                        ? 'text-[var(--color-figma-text)]'
                        : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'
                    }`}
                  >
                    <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[8px] font-medium font-sans">
                      {file.platform}
                    </span>
                    {file.path}
                  </button>
                  <button
                    onClick={() => handleCopyFile(file)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-1.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] shrink-0"
                    title={`Copy ${file.path} to clipboard`}
                    aria-label={`Copy ${file.path}`}
                  >
                    {copiedFile === file.path ? (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Code preview */}
            <div className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
              <div className="overflow-auto max-h-64 bg-[var(--color-figma-bg)]">
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((line, lineIdx) => (
                      <tr key={lineIdx} className="hover:bg-[var(--color-figma-bg-hover)]/50">
                        <td className="px-2 py-0 text-[10px] font-mono text-[var(--color-figma-text-tertiary)] text-right select-none w-[1%] whitespace-nowrap border-r border-[var(--color-figma-border)] align-top">
                          {lineIdx + 1}
                        </td>
                        <td className="px-3 py-0 text-[10px] font-mono text-[var(--color-figma-text)] whitespace-pre break-all">
                          {line || '\u00A0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {lines.length} line{lines.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadFile(activeFile)}
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
                    onClick={() => handleCopyFile(activeFile)}
                    className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedFile === activeFile.path ? (
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
          </div>
        );
      })()}
    </>
  );
}
