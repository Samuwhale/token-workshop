import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { Check, Clock3, Copy, Download, RefreshCw, X } from 'lucide-react';
import { Spinner } from './Spinner';
import { PLATFORMS } from '../shared/platforms';
import { ALL_TOKEN_TYPES } from '../../shared/types';
import type { PlatformConfig } from '../hooks/usePlatformConfig';
import type { DiffState } from '../hooks/useDiffState';
import type {
  ExportPresetsState,
  ExportPreset,
} from '../hooks/useExportPresets';
import type { ExportResultFile } from '../hooks/useExportResults';
import { CheckboxRow, DisclosureRow } from '../primitives';
import { exportFileId, splitExportFilePath } from '../shared/exportFileHelpers';

const textActionClass =
  'inline-flex items-center gap-1 rounded px-1 py-0.5 text-secondary text-[color:var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text-accent)]';

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
        type="button"
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
        type="button"
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
          <Check size={9} strokeWidth={2.5} aria-hidden />
        ) : (
          <Copy size={9} strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

interface ChangeScopeStatusProps {
  diffLoading: boolean;
  diffError: string | null;
  diffPaths: string[] | null;
  isGitRepo: boolean | undefined;
  lastExportTimestamp: number | null;
  fetchDiff: () => Promise<void>;
  fetchDiffSince: (timestamp: number) => Promise<void>;
  handleSetBaseline: () => void;
}

function ChangeScopeStatus({
  diffLoading,
  diffError,
  diffPaths,
  isGitRepo,
  lastExportTimestamp,
  fetchDiff,
  fetchDiffSince,
  handleSetBaseline,
}: ChangeScopeStatusProps) {
  if (isGitRepo === false && lastExportTimestamp === null) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Set a baseline to mark the current library as unchanged.
        </span>
        <button
          type="button"
          onClick={handleSetBaseline}
          className="self-start rounded bg-[var(--color-figma-action-bg)] px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)]"
        >
          Set baseline
        </button>
      </div>
    );
  }

  if (diffLoading) {
    return (
      <div className="flex items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
        <Spinner size="sm" />
        Checking changes...
      </div>
    );
  }

  if (diffError) {
    return (
      <div className="text-secondary text-[color:var(--color-figma-text-error)]">
        {diffError}
      </div>
    );
  }

  if (diffPaths === null) {
    return (
      <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
        Fetching changes...
      </span>
    );
  }

  const hasChanges = diffPaths.length > 0;
  const emptyMessage =
    isGitRepo === false && lastExportTimestamp !== null
      ? `No changes since ${new Date(lastExportTimestamp).toLocaleString()}`
      : 'No uncommitted token changes';

  return (
    <div className="flex flex-wrap items-center gap-2 text-secondary">
      <span
        className={
          hasChanges
            ? 'text-[color:var(--color-figma-text)]'
            : 'text-[color:var(--color-figma-text-tertiary)]'
        }
      >
        {hasChanges
          ? `${diffPaths.length} token${diffPaths.length === 1 ? '' : 's'} changed`
          : emptyMessage}
      </span>
      <button
        type="button"
        onClick={() => {
          if (isGitRepo === false && lastExportTimestamp !== null) {
            void fetchDiffSince(lastExportTimestamp);
          } else {
            void fetchDiff();
          }
        }}
        className={textActionClass}
      >
        Refresh
      </button>
      {isGitRepo === false ? (
        <button
          type="button"
          onClick={handleSetBaseline}
          className={textActionClass}
        >
          Reset baseline to now
        </button>
      ) : null}
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
    selected,
    setSelected,
    cssSelector,
    setCssSelector,
    zipFilename,
    setZipFilename,
    nestByPlatform,
    setNestByPlatform,
    selectedCollections,
    setSelectedCollections,
    selectedTypes,
    setSelectedTypes,
    pathPrefix,
    setPathPrefix,
    collectionsOpen,
    setCollectionsOpen,
    typesOpen,
    setTypesOpen,
    pathPrefixOpen,
    setPathPrefixOpen,
    cssSelectorOpen,
    setCssSelectorOpen,
  } = platformConfig;

  const {
    changesOnly,
    setChangesOnly,
    diffLoading,
    diffError,
    diffPaths,
    isGitRepo,
    lastExportTimestamp,
    scopeOpen,
    setScopeOpen,
    fetchDiff,
    fetchDiffSince,
    handleSetBaseline,
  } = diffState;

  const {
    presets,
    showSavePreset,
    setShowSavePreset,
    presetName,
    setPresetName,
  } = presetsState;
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (showSavePreset) setPresetsOpen(true);
  }, [showSavePreset]);

  const toggleCollection = (name: string) => {
    setSelectedCollections((prev) => {
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
    setSelected((prev) => {
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

  const toggleAllPlatforms = () => {
    setSelected(
      selected.size === PLATFORMS.length
        ? new Set()
        : new Set(PLATFORMS.map((platform) => platform.id)),
    );
  };

  const toggleAllCollections = () => {
    setSelectedCollections(selectedCollections === null ? new Set() : null);
  };

  const openTypesSection = () => {
    const nextOpen = !typesOpen;
    setTypesOpen(nextOpen);
    if (nextOpen && selectedTypes === null) {
      setSelectedTypes(new Set(ALL_TOKEN_TYPES));
    }
  };

  const toggleTokenType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev ?? ALL_TOKEN_TYPES);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next.size === ALL_TOKEN_TYPES.length ? null : next;
    });
  };

  const cancelPresetSave = () => {
    setShowSavePreset(false);
    setPresetName('');
  };

  const toggleChangesOnly = () => {
    const nextChangesOnly = !changesOnly;
    setChangesOnly(nextChangesOnly);
    if (nextChangesOnly && connected && diffPaths === null) {
      void fetchDiff();
    }
  };
  const showCollections = collectionIds.length > 1 || selected.has('json');
  const advancedSummary =
    [
      selected.has('css') ? `CSS ${cssSelector || ':root'}` : null,
      showCollections && selectedCollections !== null
        ? `${selectedCollections.size} collection${selectedCollections.size === 1 ? '' : 's'}`
        : null,
      selectedTypes !== null && selectedTypes.size !== ALL_TOKEN_TYPES.length
        ? `${selectedTypes.size} type${selectedTypes.size === 1 ? '' : 's'}`
        : null,
      pathPrefix ? `Path ${pathPrefix}` : null,
      changesOnly ? 'Changes only' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Defaults';
  const selectedPlatformLabels = PLATFORMS.filter((platform) =>
    selected.has(platform.id),
  ).map((platform) => platform.label);
  const platformSummary =
    selectedPlatformLabels.length === 0
      ? 'No files selected'
      : selectedPlatformLabels.length === PLATFORMS.length
        ? 'All file formats'
        : selectedPlatformLabels.join(', ');

  const intentButtonClass =
    'rounded px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]';

  return (
    <>
      <div>
        <div className="mb-1">
          <div className="text-body font-semibold text-[color:var(--color-figma-text)]">
            Export intent
          </div>
          <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
            Start with the handoff you need, then refine the file settings
            below.
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() =>
              applyPlatformIntent(['css', 'typescript', 'tailwind'])
            }
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
                type="button"
                onClick={toggleAllPlatforms}
                className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
              >
                {selected.size === PLATFORMS.length
                  ? 'Deselect all'
                  : `Select all (${PLATFORMS.length})`}
              </button>
            ) : undefined
          }
          className="mb-1"
        />
        {platformsOpen ? (
          <div className="flex flex-col gap-0.5 pl-4">
            {PLATFORMS.map((platform) => {
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

      <div>
        <DisclosureRow
          title="Scope"
          summary={changesOnly ? 'Changed tokens only' : 'All tokens'}
          open={scopeOpen}
          onToggle={() => setScopeOpen((v) => !v)}
          className="mb-1"
        />
        {scopeOpen && (
          <>
            <CheckboxRow
              checked={changesOnly}
              onChange={toggleChangesOnly}
              title="Changed tokens only"
              description={
                isGitRepo === false
                  ? 'Export tokens changed since the current baseline. Each successful export resets the baseline to now.'
                  : 'Export tokens added or modified since the last commit.'
              }
              className="px-0"
            />

            {changesOnly && (
              <div className="mt-2 pl-6">
                {isGitRepo === false ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                      <Clock3
                        size={10}
                        strokeWidth={2}
                        aria-hidden
                        className="mt-px shrink-0 text-[color:var(--color-figma-text-tertiary)]"
                      />
                      <span>
                        Git not available; changes are tracked by file
                        modification time.
                      </span>
                    </div>
                    <ChangeScopeStatus
                      diffLoading={diffLoading}
                      diffError={diffError}
                      diffPaths={diffPaths}
                      isGitRepo={isGitRepo}
                      lastExportTimestamp={lastExportTimestamp}
                      fetchDiff={fetchDiff}
                      fetchDiffSince={fetchDiffSince}
                      handleSetBaseline={handleSetBaseline}
                    />
                  </div>
                ) : (
                  <ChangeScopeStatus
                    diffLoading={diffLoading}
                    diffError={diffError}
                    diffPaths={diffPaths}
                    isGitRepo={isGitRepo}
                    lastExportTimestamp={lastExportTimestamp}
                    fetchDiff={fetchDiff}
                    fetchDiffSince={fetchDiffSince}
                    handleSetBaseline={handleSetBaseline}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Export presets */}
      <div className="pt-1">
        <DisclosureRow
          title="Saved presets"
          summary={presets.length > 0 ? `${presets.length}` : 'None yet'}
          open={presetsOpen}
          onToggle={() => setPresetsOpen((v) => !v)}
          action={
            <button
              type="button"
              onClick={() => {
                setPresetsOpen(true);
                setShowSavePreset((v) => !v);
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
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSavePreset();
                    if (e.key === 'Escape') cancelPresetSave();
                  }}
                  placeholder="Preset name…"
                  className="flex-1 px-2 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-secondary text-[color:var(--color-figma-text)] font-mono focus:focus-visible:border-[var(--color-figma-accent)] placeholder:text-[color:var(--color-figma-text-tertiary)]"
                />
                <button
                  type="button"
                  onClick={onSavePreset}
                  disabled={!presetName.trim()}
                  className="px-2 py-1 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-secondary font-medium disabled:opacity-40 hover:bg-[var(--color-figma-action-bg-hover)] transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelPresetSave}
                  className="px-1.5 py-1 rounded text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  aria-label="Cancel"
                >
                  <X size={10} strokeWidth={2} aria-hidden />
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
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onLoadPreset(preset)}
                      title={`Load full preset "${preset.name}" — replaces current platform selection and all filters`}
                      className="min-w-0 flex-1 truncate px-1 py-1 text-left text-secondary text-[color:var(--color-figma-text)] hover:text-[color:var(--color-figma-text-accent)] transition-colors"
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onLoadPresetFiltersOnly(preset)}
                      title="Apply collections, types, and path prefix from this preset — keeps the current platform selection"
                      className="px-1.5 py-1 text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)] transition-colors"
                      aria-label={`Apply filters only from preset ${preset.name}`}
                    >
                      Filters
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePreset(preset.id)}
                      title="Delete preset"
                      className="px-1.5 py-1 text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-error)] transition-colors"
                      aria-label={`Delete preset ${preset.name}`}
                    >
                      <X size={8} strokeWidth={2} aria-hidden />
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
          onToggle={() => setAdvancedOpen((v) => !v)}
          className="mb-1"
        />
        {advancedOpen ? (
          <div className="flex flex-col gap-3 pl-4">
            {selected.has('css') && (
              <div>
                <DisclosureRow
                  title="CSS selector"
                  summary={
                    <span className="font-mono">{cssSelector || ':root'}</span>
                  }
                  open={cssSelectorOpen}
                  onToggle={() => setCssSelectorOpen((v) => !v)}
                  action={
                    cssSelectorOpen && cssSelector !== ':root' ? (
                      <button
                        type="button"
                        onClick={() => setCssSelector(':root')}
                        className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        Reset
                      </button>
                    ) : undefined
                  }
                  className="mb-1"
                />
                {cssSelectorOpen ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="text"
                      value={cssSelector}
                      onChange={(e) => setCssSelector(e.target.value)}
                      placeholder=":root"
                      spellCheck={false}
                      className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-body font-mono text-[color:var(--color-figma-text)] transition-colors placeholder:text-[color:var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
                    />
                    <div className="text-secondary leading-relaxed text-[color:var(--color-figma-text-tertiary)]">
                      Wrap CSS variables with a custom selector, such as{' '}
                      <span className="font-mono">.light</span>,{' '}
                      <span className="font-mono">[data-theme="dark"]</span>, or{' '}
                      <span className="font-mono">:root .brand</span>.
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {showCollections && (
              <div>
                <DisclosureRow
                  title="Collections"
                  summary={
                    selectedCollections === null ? (
                      'All collections'
                    ) : selectedCollections.size === 0 ? (
                      <span className="text-[color:var(--color-figma-text-warning)]">
                        None selected
                      </span>
                    ) : (
                      `${selectedCollections.size} of ${collectionIds.length}`
                    )
                  }
                  open={collectionsOpen}
                  onToggle={() => setCollectionsOpen((v) => !v)}
                  action={
                    collectionsOpen ? (
                      <button
                        type="button"
                        onClick={toggleAllCollections}
                        className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        {selectedCollections === null
                          ? 'Deselect all'
                          : `Select all (${collectionIds.length})`}
                      </button>
                    ) : undefined
                  }
                  className="mb-1"
                />
                {collectionsOpen ? (
                  <div className="flex flex-col gap-0.5">
                    {collectionIds.map((collectionId) => {
                      const isSelected =
                        selectedCollections === null ||
                        selectedCollections.has(collectionId);
                      const collectionLabel =
                        collectionLabels[collectionId] || collectionId;
                      const showCollectionId = collectionLabel !== collectionId;
                      return (
                        <CheckboxRow
                          key={collectionId}
                          checked={isSelected}
                          onChange={() => toggleCollection(collectionId)}
                          title={
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate">
                                {collectionLabel}
                              </span>
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
                ) : null}
              </div>
            )}

            <div>
              <DisclosureRow
                title="Token types"
                summary={
                  selectedTypes === null ||
                  selectedTypes.size === ALL_TOKEN_TYPES.length ? (
                    'All types'
                  ) : selectedTypes.size === 0 ? (
                    <span className="text-[color:var(--color-figma-text-warning)]">
                      None selected
                    </span>
                  ) : (
                    `${selectedTypes.size} of ${ALL_TOKEN_TYPES.length}`
                  )
                }
                open={typesOpen}
                onToggle={openTypesSection}
                action={
                  typesOpen &&
                  selectedTypes !== null &&
                  selectedTypes.size < ALL_TOKEN_TYPES.length ? (
                    <button
                      type="button"
                      onClick={() => setSelectedTypes(null)}
                      className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      All types
                    </button>
                  ) : undefined
                }
                className="mb-1"
              />
              {typesOpen ? (
                <div className="flex flex-wrap gap-1">
                  {ALL_TOKEN_TYPES.map((type) => {
                    const isChecked =
                      selectedTypes === null || selectedTypes.has(type);
                    return (
                      <button
                        type="button"
                        key={type}
                        onClick={() => toggleTokenType(type)}
                        className={`rounded border px-2 py-0.5 font-mono text-secondary transition-colors ${
                          isChecked
                            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]'
                            : 'border-[var(--color-figma-border)] text-[color:var(--color-figma-text-tertiary)] hover:border-[var(--color-figma-text-tertiary)]'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div>
              <DisclosureRow
                title="Path prefix"
                summary={
                  <span className="font-mono">{pathPrefix || 'None'}</span>
                }
                open={pathPrefixOpen}
                onToggle={() => setPathPrefixOpen((v) => !v)}
                action={
                  pathPrefixOpen && pathPrefix ? (
                    <button
                      type="button"
                      onClick={() => setPathPrefix('')}
                      className="rounded px-2 py-1 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Clear
                    </button>
                  ) : undefined
                }
                className="mb-1"
              />
              {pathPrefixOpen ? (
                <>
                  <input
                    type="text"
                    value={pathPrefix}
                    onChange={(e) => setPathPrefix(e.target.value)}
                    placeholder="e.g. color or spacing.scale"
                    spellCheck={false}
                    className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-body font-mono text-[color:var(--color-figma-text)] transition-colors placeholder:text-[color:var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
                  />
                  <div className="mt-1 text-secondary leading-relaxed text-[color:var(--color-figma-text-tertiary)]">
                    Export only tokens under this path, such as{' '}
                    <span className="font-mono">color</span> or{' '}
                    <span className="font-mono">spacing.scale</span>.
                  </div>
                </>
              ) : null}
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
              <label className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">
                Filename
              </label>
              <div className="flex items-center flex-1 min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden">
                <input
                  type="text"
                  value={zipFilename}
                  onChange={(e) => setZipFilename(e.target.value)}
                  placeholder="tokens"
                  className="flex-1 min-w-0 px-2 py-1 bg-transparent text-secondary text-[color:var(--color-figma-text)] font-mono outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
                />
                <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] pr-2 shrink-0">
                  .zip
                </span>
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
      {results.length > 0 &&
        (() => {
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
                    type="button"
                    onClick={() => handleExport()}
                    disabled={selected.size === 0 || !connected || exporting}
                    title="Re-run export with current settings"
                    className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-accent-hover)] transition-colors disabled:opacity-40"
                  >
                    {exporting ? (
                      <Spinner size="sm" />
                    ) : (
                      <RefreshCw size={10} strokeWidth={2} aria-hidden />
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
                        <tr
                          key={lineIdx}
                          className="hover:bg-[var(--color-figma-bg-hover)]/50"
                        >
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
                      type="button"
                      onClick={() => handleDownloadFile(activeFile)}
                      className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] transition-colors"
                      title="Download file"
                    >
                      <Download size={10} strokeWidth={2} aria-hidden />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyFile(activeFile)}
                      className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-accent-hover)] transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedFile === exportFileId(activeFile) ? (
                        <>
                          <Check size={10} strokeWidth={2} aria-hidden />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={10} strokeWidth={2} aria-hidden />
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
