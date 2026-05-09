import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { Spinner } from './Spinner';
import { PLATFORMS } from '../shared/platforms';
import { ALL_TOKEN_TYPES } from '../../shared/types';
import type { PlatformConfig } from '../hooks/usePlatformConfig';
import type { DiffState } from '../hooks/useDiffState';
import type { ExportPresetsState, ExportPreset } from '../hooks/useExportPresets';
import type { ExportResultFile } from '../hooks/useExportResults';
import { CheckboxRow, DisclosureRow } from '../primitives';
import { exportFileId, splitExportFilePath } from '../shared/exportFileHelpers';

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
  collectionLabels?: Record<string, string>;
  connected: boolean;
  savePresetInputRef: RefObject<HTMLInputElement>;
}

interface ExportPreviewFileTabProps {
  file: ExportResultFile;
  selected: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}

function ExportPreviewFileTab({
  file,
  selected,
  copied,
  onSelect,
  onCopy,
}: ExportPreviewFileTabProps) {
  const { fileName, directory } = splitExportFilePath(file.path);

  return (
    <div
      className={`group flex shrink-0 items-stretch overflow-hidden rounded-t-md border border-b-0 transition-colors ${
        selected
          ? 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]'
          : 'border-transparent bg-transparent hover:bg-[var(--color-figma-bg-hover)]'
      }`}
    >
      <button
        onClick={onSelect}
        title={file.path}
        className={`flex min-w-[172px] flex-col items-start gap-0.5 px-2 py-1.5 text-secondary transition-colors ${
          selected
            ? 'text-[color:var(--color-figma-text)]'
            : 'text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-secondary)]'
        }`}
      >
        <span className="shrink-0 rounded bg-[var(--color-figma-accent)]/10 px-1 py-0.5 font-sans text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-accent)]">
          {file.platform}
        </span>
        <span className="block max-w-[220px] text-left font-mono leading-snug [overflow-wrap:anywhere]">
          {fileName}
        </span>
        {directory ? (
          <span className="block max-w-[220px] text-left text-[var(--font-size-xs)] leading-snug text-[color:var(--color-figma-text-tertiary)] [overflow-wrap:anywhere]">
            {directory}
          </span>
        ) : null}
      </button>
      <button
        onClick={onCopy}
        className={`shrink-0 px-1.5 py-1.5 text-[color:var(--color-figma-text-tertiary)] transition-colors hover:text-[color:var(--color-figma-text-accent)] ${
          selected
            ? 'opacity-100'
            : 'opacity-70 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
        title={`Copy ${file.path} to clipboard`}
        aria-label={`Copy ${file.path}`}
      >
        {copied ? (
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
  );
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
  collectionLabels = {},
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
    collectionsOpen, setCollectionsOpen,
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
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (showSavePreset) setPresetsOpen(true);
  }, [showSavePreset]);

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

  const applyPlatformIntent = (ids: string[]) => {
    setSelected(new Set(ids));
  };

  const useChangedTokensIntent = () => {
    const nextChangesOnly = !changesOnly;
    setChangesOnly(nextChangesOnly);
    if (nextChangesOnly && connected && diffPaths === null) {
      fetchDiff();
    }
  };
  const showCollections = collectionIds.length > 1 || selected.has('json');
  const advancedSummary = [
    selected.has('css') ? `CSS ${cssSelector || ':root'}` : null,
    showCollections && selectedCollections !== null
      ? `${selectedCollections.size} collection${selectedCollections.size === 1 ? '' : 's'}`
      : null,
    selectedTypes !== null && selectedTypes.size !== ALL_TOKEN_TYPES.length
      ? `${selectedTypes.size} type${selectedTypes.size === 1 ? '' : 's'}`
      : null,
    pathPrefix ? `Path ${pathPrefix}` : null,
    changesOnly ? 'Changes only' : null,
  ].filter(Boolean).join(' · ') || 'Defaults';
  const selectedPlatformLabels = PLATFORMS
    .filter((platform) => selected.has(platform.id))
    .map((platform) => platform.label);
  const platformSummary =
    selectedPlatformLabels.length === 0
      ? 'No files selected'
      : selectedPlatformLabels.length === PLATFORMS.length
        ? 'All file formats'
        : selectedPlatformLabels.join(', ');

  const intentButtonClass =
    "rounded px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]";

  return (
    <>
      <div>
        <div className="mb-1">
          <div className="text-body font-semibold text-[color:var(--color-figma-text)]">
            Export intent
          </div>
          <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
            Start with the handoff you need, then refine the file settings below.
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => applyPlatformIntent(['css', 'typescript', 'tailwind'])}
            className={intentButtonClass}
          >
            Web
          </button>
          <button
            type="button"
            onClick={() => applyPlatformIntent(['ios-swift'])}
            className={intentButtonClass}
          >
            iOS
          </button>
          <button
            type="button"
            onClick={() => applyPlatformIntent(['android'])}
            className={intentButtonClass}
          >
            Android
          </button>
          <button
            type="button"
            onClick={() => applyPlatformIntent(['json'])}
            className={intentButtonClass}
          >
            Token file
          </button>
          <button
            type="button"
            onClick={useChangedTokensIntent}
            className={`${intentButtonClass} ${
              changesOnly
                ? 'bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]'
                : ''
            }`}
            aria-pressed={changesOnly}
          >
            Changed tokens
          </button>
        </div>
      </div>

      <div>
        <DisclosureRow
          title="File formats"
          summary={platformSummary}
          open={platformsOpen}
          onToggle={() => setPlatformsOpen((open) => !open)}
          action={
            platformsOpen ? (
              <button
                onClick={() => {
                  if (selected.size === PLATFORMS.length) {
                    setSelected(new Set());
                  } else {
                    setSelected(new Set(PLATFORMS.map((p) => p.id)));
                  }
                }}
                className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
              >
                {selected.size === PLATFORMS.length ? 'Deselect all' : `Select all (${PLATFORMS.length})`}
              </button>
            ) : undefined
          }
          className="mb-1"
        />
        {platformsOpen ? (
          <div className="flex flex-col gap-0.5 pl-4">
            {PLATFORMS.map(platform => {
              const isSelected = selected.has(platform.id);
              return (
                <CheckboxRow
                  key={platform.id}
                  checked={isSelected}
                  onChange={() => togglePlatform(platform.id)}
                  title={platform.label}
                  description={platform.description}
                >
                  {isSelected ? (
                    <span className="block min-w-0 break-all font-mono text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-tertiary)]">
                      {platform.example}
                    </span>
                  ) : null}
                </CheckboxRow>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Export presets */}
      <div className="pt-1">
        <DisclosureRow
          title="Saved presets"
          summary={presets.length > 0 ? `${presets.length}` : 'None yet'}
          open={presetsOpen}
          onToggle={() => setPresetsOpen(v => !v)}
          action={
            <button
              onClick={() => {
                setPresetsOpen(true);
                setShowSavePreset(v => !v);
                setPresetName('');
                setTimeout(() => savePresetInputRef.current?.focus(), 0);
              }}
              className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
            >
              Save current
            </button>
          }
        />

        {presetsOpen && (
          <div className="mt-2 flex flex-col gap-2">
            {showSavePreset && (
              <div className="flex items-center gap-1.5">
                <input
                  ref={savePresetInputRef}
                  type="text"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onSavePreset();
                    if (e.key === 'Escape') { setShowSavePreset(false); setPresetName(''); }
                  }}
                  placeholder="Preset name…"
                  className="flex-1 px-2 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-secondary text-[color:var(--color-figma-text)] font-mono focus:focus-visible:border-[var(--color-figma-accent)] placeholder:text-[color:var(--color-figma-text-tertiary)]"
                />
                <button
                  onClick={onSavePreset}
                  disabled={!presetName.trim()}
                  className="px-2 py-1 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-secondary font-medium disabled:opacity-40 hover:bg-[var(--color-figma-action-bg-hover)] transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => { setShowSavePreset(false); setPresetName(''); }}
                  className="px-1.5 py-1 rounded text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
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
              <div className="text-secondary text-[color:var(--color-figma-text-tertiary)] leading-relaxed">
                Save the current setup when you have a repeat export.
              </div>
            )}

            {presets.length > 0 && (
              <div className="flex flex-col gap-1">
                {presets.map(preset => (
                  <div key={preset.id} className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                    <button
                      onClick={() => onLoadPreset(preset)}
                      title={`Load full preset "${preset.name}" — replaces current platform selection and all filters`}
                      className="min-w-0 flex-1 truncate px-1 py-1 text-left text-secondary text-[color:var(--color-figma-text)] hover:text-[color:var(--color-figma-text-accent)] transition-colors"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => onLoadPresetFiltersOnly(preset)}
                      title="Apply collections, types, and path prefix from this preset — keeps the current platform selection"
                      className="px-1.5 py-1 text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)] transition-colors"
                      aria-label={`Apply filters only from preset ${preset.name}`}
                    >
                      Filters
                    </button>
                    <button
                      onClick={() => onDeletePreset(preset.id)}
                      title="Delete preset"
                      className="px-1.5 py-1 text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-error)] transition-colors"
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
        )}
      </div>

      <div>
        <DisclosureRow
          title="Advanced file settings"
          summary={advancedSummary}
          open={advancedOpen}
          onToggle={() => setAdvancedOpen(v => !v)}
          className="mb-1"
        />
        {advancedOpen ? (
          <div className="flex flex-col gap-3 pl-4">
            {/* CSS Selector */}
            {selected.has('css') && (
              <div>
          <DisclosureRow
            title="CSS selector"
            summary={<span className="font-mono">{cssSelector || ':root'}</span>}
            open={cssSelectorOpen}
            onToggle={() => setCssSelectorOpen(v => !v)}
            action={cssSelectorOpen && cssSelector !== ':root' ? (
              <button
                onClick={() => setCssSelector(':root')}
                className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Reset
              </button>
            ) : undefined}
            className="mb-1"
          />
          {cssSelectorOpen && (
            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                value={cssSelector}
                onChange={e => setCssSelector(e.target.value)}
                placeholder=":root"
                spellCheck={false}
                className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-body font-mono text-[color:var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] transition-colors placeholder:text-[color:var(--color-figma-text-tertiary)]"
              />
              <div className="text-secondary text-[color:var(--color-figma-text-tertiary)] leading-relaxed">
                Wrap CSS variables with a custom selector — e.g. <span className="font-mono">.light</span>, <span className="font-mono">[data-theme="dark"]</span>, or <span className="font-mono">:root .brand</span>
              </div>
            </div>
          )}
              </div>
            )}

            {/* Collections */}
            {showCollections && (
              <div>
          <DisclosureRow
            title="Collections"
            summary={
              selectedCollections === null
                ? 'All collections'
                : selectedCollections.size === 0
                  ? <span className="text-[color:var(--color-figma-text-warning)]">None selected</span>
                  : `${selectedCollections.size} of ${collectionIds.length}`
            }
            open={collectionsOpen}
            onToggle={() => setCollectionsOpen(v => !v)}
            action={collectionsOpen ? (
              <button
                onClick={() => {
                  if (selectedCollections === null) {
                    setSelectedCollections(new Set());
                  } else {
                    setSelectedCollections(null);
                  }
                }}
                className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                {selectedCollections === null
                  ? `Deselect all`
                  : `Select all (${collectionIds.length})`}
              </button>
            ) : undefined}
            className="mb-1"
          />
          {collectionsOpen && (
            <div className="flex flex-col gap-0.5">
              {collectionIds.map((collectionId) => {
                const isSelected =
                  selectedCollections === null ||
                  selectedCollections.has(collectionId);
                const collectionLabel = collectionLabels[collectionId] || collectionId;
                const showCollectionId = collectionLabel !== collectionId;
                return (
                  <CheckboxRow
                    key={collectionId}
                    checked={isSelected}
                    onChange={() => toggleCollection(collectionId)}
                    title={
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate">{collectionLabel}</span>
                        {showCollectionId ? (
                          <span className="truncate font-mono text-tertiary text-[color:var(--color-figma-text-tertiary)]">
                            {collectionId}
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                );
              })}
            </div>
          )}
              </div>
            )}

            {/* Token Types */}
            <div>
        <DisclosureRow
          title="Token types"
          summary={
            selectedTypes === null || selectedTypes.size === ALL_TOKEN_TYPES.length
              ? 'All types'
              : selectedTypes.size === 0
                ? <span className="text-[color:var(--color-figma-text-warning)]">None selected</span>
                : `${selectedTypes.size} of ${ALL_TOKEN_TYPES.length}`
          }
          open={typesOpen}
          onToggle={() => {
            const next = !typesOpen;
            setTypesOpen(next);
            if (next && selectedTypes === null) setSelectedTypes(new Set(ALL_TOKEN_TYPES));
          }}
          action={typesOpen && selectedTypes !== null && selectedTypes.size < ALL_TOKEN_TYPES.length ? (
            <button
              onClick={() => setSelectedTypes(null)}
              className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              All types
            </button>
          ) : undefined}
          className="mb-1"
        />
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
                  className={`px-2 py-0.5 rounded text-secondary font-mono transition-colors border ${
                    isChecked
                      ? 'bg-[var(--color-figma-accent)]/10 border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)]'
                      : 'border-[var(--color-figma-border)] text-[color:var(--color-figma-text-tertiary)] hover:border-[var(--color-figma-text-tertiary)]'
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
        <DisclosureRow
          title="Path prefix"
          summary={<span className="font-mono">{pathPrefix || 'None'}</span>}
          open={pathPrefixOpen}
          onToggle={() => setPathPrefixOpen(v => !v)}
          action={pathPrefixOpen && pathPrefix ? (
            <button
              onClick={() => setPathPrefix('')}
              className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Clear
            </button>
          ) : undefined}
          className="mb-1"
        />
        {pathPrefixOpen && (
          <>
            <input
              type="text"
              value={pathPrefix}
              onChange={e => setPathPrefix(e.target.value)}
              placeholder="e.g. color or spacing.scale"
              spellCheck={false}
              className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-body font-mono text-[color:var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] transition-colors placeholder:text-[color:var(--color-figma-text-tertiary)]"
            />
            <div className="mt-1 text-secondary text-[color:var(--color-figma-text-tertiary)] leading-relaxed">
              Export only tokens under this path — e.g. <span className="font-mono">color</span> or <span className="font-mono">spacing.scale</span>
            </div>
          </>
        )}
            </div>

            {/* Scope / Changes only */}
            <div>
        <DisclosureRow
          title="Scope"
          summary={changesOnly ? 'Changes only' : 'All tokens'}
          open={scopeOpen}
          onToggle={() => setScopeOpen(v => !v)}
          className="mb-1"
        />
        {scopeOpen && (
          <>
            <CheckboxRow
              checked={changesOnly}
              onChange={() => {
                  const next = !changesOnly;
                  setChangesOnly(next);
                  if (next && connected && diffPaths === null) {
                    fetchDiff();
                  }
                }}
              title="Changes only"
              description={
                isGitRepo === false
                    ? 'Tokens from files modified since last export'
                    : 'Tokens added or modified since last commit'
              }
            />

            {changesOnly && (
              <div className="mt-2 pl-6">
                {isGitRepo === false ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[color:var(--color-figma-text-tertiary)] shrink-0 mt-px">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>Git not available — tracking by file modification time instead.</span>
                    </div>
                    {lastExportTimestamp === null ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                          Set a baseline to track changes. Future exports will include only tokens from files modified after that point.
                        </span>
                        <button
                          onClick={handleSetBaseline}
                          className="self-start px-2 py-1 rounded text-secondary font-medium bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)] transition-colors"
                        >
                          Set baseline now
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        {diffLoading ? (
                          <div className="flex items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                            <Spinner size="sm" />
                            Checking for changes…
                          </div>
                        ) : diffError ? (
                          <div className="flex items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-error)]">
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
                              <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                                No changes since {new Date(lastExportTimestamp).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-secondary text-[color:var(--color-figma-text)]">
                                <span className="font-medium text-[color:var(--color-figma-text-accent)]">{diffPaths.length}</span>
                                {' '}token{diffPaths.length !== 1 ? 's' : ''} modified since {new Date(lastExportTimestamp).toLocaleString()}
                              </span>
                            )}
                            <button
                              onClick={() => fetchDiffSince(lastExportTimestamp)}
                              title="Re-check for changes"
                              className="text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)] transition-colors flex items-center gap-1"
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
                              className="text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)] transition-colors"
                            >
                              Reset baseline
                            </button>
                          </div>
                        ) : (
                          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">Fetching changes…</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {diffLoading ? (
                      <div className="flex items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                        <Spinner size="sm" />
                        Checking for changes…
                      </div>
                    ) : diffError ? (
                      <div className="flex items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-error)]">
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
                          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">No uncommitted changes detected</span>
                        ) : (
                          <span className="text-secondary text-[color:var(--color-figma-text)]">
                            <span className="font-medium text-[color:var(--color-figma-text-accent)]">{diffPaths.length}</span>
                            {' '}token{diffPaths.length !== 1 ? 's' : ''} changed
                          </span>
                        )}
                        <button
                          onClick={fetchDiff}
                          title="Re-check for changes"
                          className="text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)] transition-colors flex items-center gap-1"
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Refresh
                        </button>
                      </div>
                    ) : (
                      <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">Fetching changes…</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ZIP Options (shown after first export) */}
      {results.length > 0 && (
        <div>
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)] font-medium mb-2">
            ZIP Options
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Filename</label>
              <div className="flex items-center flex-1 min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden">
                <input
                  type="text"
                  value={zipFilename}
                  onChange={(e) => setZipFilename(e.target.value)}
                  placeholder="tokens"
                  className="flex-1 min-w-0 px-2 py-1 bg-transparent text-secondary text-[color:var(--color-figma-text)] font-mono outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
                />
                <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] pr-2 shrink-0">.zip</span>
              </div>
            </div>
            <CheckboxRow
              checked={nestByPlatform}
              onChange={() => setNestByPlatform(!nestByPlatform)}
              title="Nest files by platform folder"
              description="e.g. css/variables.css"
              className="px-0"
            />
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
              <div className="text-secondary text-[color:var(--color-figma-text-secondary)] font-medium">
                Preview
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport()}
                  disabled={selected.size === 0 || !connected || exporting}
                  title="Re-run export with current settings"
                  className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-accent-hover)] transition-colors disabled:opacity-40"
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
                <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                  {results.length} file{results.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* File tabs */}
            <div className="flex gap-0.5 overflow-x-auto pb-1 mb-1 scrollbar-thin">
              {results.map((file, i) => (
                <ExportPreviewFileTab
                  key={exportFileId(file)}
                  file={file}
                  selected={i === previewFileIndex}
                  copied={copiedFile === exportFileId(file)}
                  onSelect={() => setPreviewFileIndex(i)}
                  onCopy={() => handleCopyFile(file)}
                />
              ))}
            </div>

            {/* Code preview */}
            <div className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
              <div className="overflow-auto max-h-64 bg-[var(--color-figma-bg)]">
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((line, lineIdx) => (
                      <tr key={lineIdx} className="hover:bg-[var(--color-figma-bg-hover)]/50">
                        <td className="px-2 py-0 text-secondary font-mono text-[color:var(--color-figma-text-tertiary)] text-right select-none w-[1%] whitespace-nowrap border-r border-[var(--color-figma-border)] align-top">
                          {lineIdx + 1}
                        </td>
                        <td className="px-3 py-0 text-secondary font-mono text-[color:var(--color-figma-text)] whitespace-pre break-all">
                          {line || '\u00A0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                  {lines.length} line{lines.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadFile(activeFile)}
                    className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] transition-colors"
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
                    className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-accent-hover)] transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedFile === exportFileId(activeFile) ? (
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
