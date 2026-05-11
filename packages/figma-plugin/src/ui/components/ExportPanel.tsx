import { useState, useEffect, useMemo, useRef } from 'react';
import { STORAGE_KEYS, lsGet, lsGetJson, lsRemove } from '../shared/storage';
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from './PanelHelpHint';
import { ConfirmModal } from './ConfirmModal';
import { useDiffState } from '../hooks/useDiffState';
import { useExportPresets, type ExportPreset } from '../hooks/useExportPresets';
import { usePlatformConfig } from '../hooks/usePlatformConfig';
import { useExportResults } from '../hooks/useExportResults';
import { useCollectionStateContext } from '../contexts/TokenDataContext';
import { PlatformExportConfig } from './PlatformExportConfig';
import { ExportFooter } from './ExportFooter';
import { ExportPreviewModal } from './ExportPreviewModal';
import { InlineBanner } from './InlineBanner';
import { SecondaryPanel } from './SecondaryPanel';

interface ExportPanelProps {
  serverUrl: string;
  connected: boolean;
}

export function ExportPanel({ serverUrl, connected }: ExportPanelProps) {
  const help = usePanelHelp();
  const {
    collections,
  } = useCollectionStateContext();
  const collectionIds = useMemo(
    () => collections.map((collection) => collection.id),
    [collections],
  );
  const collectionLabels = useMemo(
    () =>
      Object.fromEntries(
        collections.map((collection) => [
          collection.id,
          collection.publishRouting?.collectionName?.trim() || collection.id,
        ]),
      ),
    [collections],
  );
  const [error, setError] = useState<string | null>(null);

  const platformConfig = usePlatformConfig();
  const diffState = useDiffState({ serverUrl, connected });
  const presetsState = useExportPresets();

  const exportResults = useExportResults({
    connected,
    serverUrl,
    platformConfig,
    diffState: {
      changesOnly: diffState.changesOnly,
      diffPaths: diffState.diffPaths,
      setDiffPaths: diffState.setDiffPaths,
      diffLoading: diffState.diffLoading,
      setDiffLoading: diffState.setDiffLoading,
      isGitRepo: diffState.isGitRepo,
      setIsGitRepo: diffState.setIsGitRepo,
      lastExportTimestamp: diffState.lastExportTimestamp,
      setLastExportTimestamp: diffState.setLastExportTimestamp,
    },
    setError,
  });

  // Preset cross-hook callbacks (read from platformConfig, write to presetsState/diffState)
  const savePresetInputRef = useRef<HTMLInputElement>(null);

  const handleSavePreset = () => {
    const name = presetsState.presetName.trim();
    if (!name) return;
    const preset: ExportPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      platforms: [...platformConfig.selected],
      cssSelector: platformConfig.cssSelector,
      selectedCollections:
        platformConfig.selectedCollections === null
          ? null
          : [...platformConfig.selectedCollections],
      selectedTypes: platformConfig.selectedTypes === null ? null : [...platformConfig.selectedTypes],
      pathPrefix: platformConfig.pathPrefix,
      nestByPlatform: platformConfig.nestByPlatform,
      zipFilename: platformConfig.zipFilename,
      changesOnly: diffState.changesOnly,
    };
    presetsState.setPresets(prev => [...prev, preset]);
    presetsState.setPresetName('');
    presetsState.setShowSavePreset(false);
  };

  const handleLoadPreset = (preset: ExportPreset) => {
    platformConfig.setSelected(new Set(preset.platforms));
    platformConfig.setCssSelector(preset.cssSelector);
    platformConfig.setSelectedCollections(
      preset.selectedCollections === null
        ? null
        : new Set(preset.selectedCollections),
    );
    platformConfig.setSelectedTypes(preset.selectedTypes === null ? null : new Set(preset.selectedTypes));
    platformConfig.setPathPrefix(preset.pathPrefix);
    platformConfig.setNestByPlatform(preset.nestByPlatform);
    platformConfig.setZipFilename(preset.zipFilename);
    diffState.setChangesOnly(preset.changesOnly ?? false);
    diffState.setDiffPaths(null);
    diffState.setDiffError(null);
  };

  const handleLoadPresetFiltersOnly = (preset: ExportPreset) => {
    platformConfig.setSelectedCollections(
      preset.selectedCollections === null
        ? null
        : new Set(preset.selectedCollections),
    );
    platformConfig.setSelectedTypes(preset.selectedTypes === null ? null : new Set(preset.selectedTypes));
    platformConfig.setPathPrefix(preset.pathPrefix);
  };

  const handleDeletePreset = (id: string) => {
    presetsState.setPendingDeletePresetId(id);
  };

  const handleConfirmDeletePreset = () => {
    const presetId = presetsState.pendingDeletePresetId;
    if (!presetId) return;
    presetsState.setPresets(prev => prev.filter(p => p.id !== presetId));
    presetsState.setPendingDeletePresetId(null);
  };

  const pendingDeletePreset = presetsState.pendingDeletePresetId
    ? presetsState.presets.find(
        (preset) => preset.id === presetsState.pendingDeletePresetId,
      ) ?? null
    : null;

  // Apply a preset dispatched from the command palette (⌘⇧E → palette → preset command)
  const handleLoadPresetRef = useRef(handleLoadPreset);
  handleLoadPresetRef.current = handleLoadPreset;
  useEffect(() => {
    const onApply = () => {
      const id = lsGet(STORAGE_KEYS.EXPORT_PRESET_APPLY);
      if (!id) return;
      lsRemove(STORAGE_KEYS.EXPORT_PRESET_APPLY);
      const preset = lsGetJson<ExportPreset[]>(STORAGE_KEYS.EXPORT_PRESETS, []).find(p => p.id === id);
      if (preset) handleLoadPresetRef.current(preset);
    };
    window.addEventListener('applyExportPreset', onApply);
    onApply();
    return () => window.removeEventListener('applyExportPreset', onApply);
  }, []);

  // Debounced live preview: re-run export when settings change and results are already showing
  const livePreviewFnRef = useRef<() => void>(() => {});
  livePreviewFnRef.current = exportResults.handleExport;
  const livePreviewHasResultsRef = useRef(false);
  livePreviewHasResultsRef.current = exportResults.results.length > 0;
  useEffect(() => {
    if (!livePreviewHasResultsRef.current || !connected) return;
    const timer = setTimeout(() => livePreviewFnRef.current(), 250);
    return () => clearTimeout(timer);
  }, [  
    platformConfig.selected,
    platformConfig.cssSelector,
    platformConfig.selectedCollections,
    platformConfig.selectedTypes,
    platformConfig.pathPrefix,
    diffState.changesOnly,
    diffState.diffPaths,
    connected,
  ]);

  return (
    <>
      <SecondaryPanel
        title="Export files"
        className="h-full"
        bodyClassName="gap-3"
        actions={
          <PanelHelpIcon
            title="Export"
            expanded={help.expanded}
            onToggle={help.toggle}
          />
        }
        beforeBody={
          help.expanded ? (
            <PanelHelpBanner
              title="Export"
              description="Choose file formats and scope."
              onDismiss={help.dismiss}
            />
          ) : null
        }
        footer={
          <ExportFooter
            mode="platforms"
            connected={connected}
            changesOnly={diffState.changesOnly}
            diffPaths={diffState.diffPaths}
            diffLoading={diffState.diffLoading}
            isGitRepo={diffState.isGitRepo}
            lastExportTimestamp={diffState.lastExportTimestamp}
            results={exportResults.results}
            exporting={exportResults.exporting}
            selected={platformConfig.selected}
            selectedCollections={platformConfig.selectedCollections}
            zipProgress={exportResults.zipProgress}
            handleExport={exportResults.handleExport}
            handleCopyAllPlatformResults={exportResults.handleCopyAllPlatformResults}
            handleDownloadZip={exportResults.handleDownloadZip}
          />
        }
      >
        {error && (
          <InlineBanner variant="error">
            {error}
          </InlineBanner>
        )}

        <PlatformExportConfig
          platformConfig={platformConfig}
          diffState={diffState}
          presetsState={presetsState}
          results={exportResults.results}
          exporting={exportResults.exporting}
          previewFileIndex={exportResults.previewFileIndex}
          setPreviewFileIndex={exportResults.setPreviewFileIndex}
          copiedFile={exportResults.copiedFile}
          handleExport={exportResults.handleExport}
          handleDownloadFile={exportResults.handleDownloadFile}
          handleCopyFile={exportResults.handleCopyFile}
          onSavePreset={handleSavePreset}
          onLoadPreset={handleLoadPreset}
          onLoadPresetFiltersOnly={handleLoadPresetFiltersOnly}
          onDeletePreset={handleDeletePreset}
          collectionIds={collectionIds}
          collectionLabels={collectionLabels}
          connected={connected}
          savePresetInputRef={savePresetInputRef}
        />
      </SecondaryPanel>

      {pendingDeletePreset && (
        <ConfirmModal
          title={`Delete preset "${pendingDeletePreset.name}"?`}
          description="This preset will be permanently removed."
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDeletePreset}
          onCancel={() => presetsState.setPendingDeletePresetId(null)}
        />
      )}

      {exportResults.showExportPreviewModal && exportResults.results.length > 0 && (
        <ExportPreviewModal
          results={exportResults.results}
          fileIndex={exportResults.previewModalFileIndex}
          onFileSelect={exportResults.setPreviewModalFileIndex}
          zipProgress={exportResults.zipProgress}
          zipFilename={platformConfig.zipFilename}
          nestByPlatform={platformConfig.nestByPlatform}
          copiedFile={exportResults.copiedFile}
          changesOnly={diffState.changesOnly}
          changedTokenCount={diffState.changesOnly && diffState.diffPaths !== null ? diffState.diffPaths.length : null}
          selectedCollectionCount={
            platformConfig.selectedCollections !== null
              ? platformConfig.selectedCollections.size
              : null
          }
          onDownloadZip={exportResults.handleDownloadZip}
          onDownloadFile={exportResults.handleDownloadFile}
          onCopyFile={exportResults.handleCopyFile}
          onClose={() => exportResults.setShowExportPreviewModal(false)}
        />
      )}
    </>
  );
}
