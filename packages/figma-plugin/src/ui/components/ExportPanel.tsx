import { useState, useEffect, useRef } from 'react';
import { STORAGE_KEYS, lsGet, lsGetJson, lsRemove } from '../shared/storage';
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from './PanelHelpHint';
import { ConfirmModal } from './ConfirmModal';
import { useDiffState } from '../hooks/useDiffState';
import { useExportPresets, type ExportPreset } from '../hooks/useExportPresets';
import { usePlatformConfig } from '../hooks/usePlatformConfig';
import { useExportResults } from '../hooks/useExportResults';
import { useFigmaVariables } from '../hooks/useFigmaVariables';
import { useTokenSetsContext } from '../contexts/TokenDataContext';
import { useTokensWorkspaceController } from '../contexts/WorkspaceControllerContext';
import { PlatformExportConfig } from './PlatformExportConfig';
import { FigmaVariablesPanel } from './FigmaVariablesPanel';
import { ExportFooter } from './ExportFooter';
import { ExportPreviewModal } from './ExportPreviewModal';
import { GitWorkflowPanel } from './publish/GitWorkflowPanel';
import { Spinner } from './Spinner';
import { FieldMessage } from '../shared/FieldMessage';
import { fieldBorderClass } from '../shared/editorClasses';
import { InlineBanner } from './InlineBanner';

export type ExportMode = 'platforms' | 'figma-variables';

interface ExportPanelProps {
  serverUrl: string;
  connected: boolean;
}

function sanitizeDestinationSetName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_/-]/g, '-').toLowerCase();
}

export function ExportPanel({ serverUrl, connected }: ExportPanelProps) {
  const help = usePanelHelp('export');
  const { sets, addSetToState, refreshTokens } = useTokenSetsContext();
  const { pushUndo } = useTokensWorkspaceController();
  const [mode, setMode] = useState<ExportMode>('platforms');
  const [showRepo, setShowRepo] = useState(false);
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

  const figmaVariables = useFigmaVariables({
    connected,
    serverUrl,
    sets,
    addSetToState,
    refreshTokens,
    pushUndo,
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
      selectedSets: platformConfig.selectedSets === null ? null : [...platformConfig.selectedSets],
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
    platformConfig.setSelectedSets(preset.selectedSets === null ? null : new Set(preset.selectedSets));
    platformConfig.setSelectedTypes(preset.selectedTypes === null ? null : new Set(preset.selectedTypes));
    platformConfig.setPathPrefix(preset.pathPrefix);
    platformConfig.setNestByPlatform(preset.nestByPlatform);
    platformConfig.setZipFilename(preset.zipFilename);
    diffState.setChangesOnly(preset.changesOnly ?? false);
    diffState.setDiffPaths(null);
    diffState.setDiffError(null);
  };

  const handleLoadPresetFiltersOnly = (preset: ExportPreset) => {
    platformConfig.setSelectedSets(preset.selectedSets === null ? null : new Set(preset.selectedSets));
    platformConfig.setSelectedTypes(preset.selectedTypes === null ? null : new Set(preset.selectedTypes));
    platformConfig.setPathPrefix(preset.pathPrefix);
  };

  const handleDeletePreset = (id: string) => {
    presetsState.setPendingDeletePresetId(id);
  };

  const handleConfirmDeletePreset = () => {
    if (presetsState.pendingDeletePresetId) {
      presetsState.setPresets(prev => prev.filter(p => p.id !== presetsState.pendingDeletePresetId));
      presetsState.setPendingDeletePresetId(null);
    }
  };

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

  // Auto-switch to figma-variables mode when disconnected
  const [modeAutoSwitched, setModeAutoSwitched] = useState(false);
  useEffect(() => {
    if (!connected && mode === 'platforms') {
      setMode('figma-variables');
      setModeAutoSwitched(true);
    }
    if (connected && modeAutoSwitched) {
      setModeAutoSwitched(false);
    }
  }, [connected, mode, modeAutoSwitched]);

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
    platformConfig.selectedSets,
    platformConfig.selectedTypes,
    platformConfig.pathPrefix,
    diffState.changesOnly,
    diffState.diffPaths,
    connected,
  ]);

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--color-figma-border)] shrink-0">
          <PanelHelpIcon panelKey="export" title="Export" expanded={help.expanded} onToggle={help.toggle} />
        </div>
        {help.expanded && (
          <PanelHelpBanner
            title="Export"
            description="Export platform-specific token files or inspect Figma variables for import. For commit, push, pull, and merge work, expand the Repository workflow section at the bottom."
            onDismiss={help.dismiss}
          />
        )}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
          {error && (
            <InlineBanner variant="error">
              {error}
            </InlineBanner>
          )}

          {/* Mode toggle */}
          <div className="flex rounded-md bg-[var(--color-figma-bg-secondary)] p-0.5 gap-0.5">
            <button
              onClick={() => setMode('platforms')}
              disabled={!connected}
              title={!connected ? 'Connect to server to use platform export' : undefined}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
                !connected
                  ? 'opacity-40 cursor-not-allowed text-[var(--color-figma-text-tertiary)]'
                  : mode === 'platforms'
                    ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                    : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
              </svg>
              Export
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
              : 'Inspect variables from this Figma file, preview them, and copy as DTCG JSON or save them to the token server.'}
          </div>

          {/* Auto-switch notice */}
          {modeAutoSwitched && (
            <InlineBanner
              variant="warning"
              onDismiss={() => setModeAutoSwitched(false)}
              dismissMode="icon"
            >
              <span className="block">
                Switched to <strong>Figma Variables</strong> — server disconnected. Platforms mode requires a server connection. Reconnect to switch back.
              </span>
            </InlineBanner>
          )}

          {/* Platform export config */}
          {mode === 'platforms' && (
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
              sets={sets}
              connected={connected}
              savePresetInputRef={savePresetInputRef}
            />
          )}

          {/* Figma variables panel */}
          {mode === 'figma-variables' && (
            <FigmaVariablesPanel
              figmaLoading={figmaVariables.figmaLoading}
              figmaCollections={figmaVariables.figmaCollections}
              expandedCollection={figmaVariables.expandedCollection}
              setExpandedCollection={figmaVariables.setExpandedCollection}
              expandedVar={figmaVariables.expandedVar}
              setExpandedVar={figmaVariables.setExpandedVar}
              formatModeValue={figmaVariables.formatModeValue}
              onReload={figmaVariables.handleExportFigmaVariables}
            />
          )}

          {/* Repository workflow — expert entry, collapsed by default */}
          <div className="border-t border-[var(--color-figma-border)] pt-3 -mx-3 px-3">
            <button
              onClick={() => setShowRepo(prev => !prev)}
              disabled={!connected}
              title={!connected ? 'Connect to server to use repository workflow' : undefined}
              className={`w-full flex items-center gap-2 text-[10px] font-medium transition-colors ${
                !connected
                  ? 'opacity-40 cursor-not-allowed text-[var(--color-figma-text-tertiary)]'
                  : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
              }`}
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="currentColor"
                className={`shrink-0 transition-transform text-[var(--color-figma-text-tertiary)] ${showRepo ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 01-9 9" />
              </svg>
              Repository workflow
            </button>
            {showRepo && (
              <div className="mt-3">
                <GitWorkflowPanel serverUrl={serverUrl} connected={connected} />
              </div>
            )}
          </div>
        </div>

        <ExportFooter
          mode={mode}
          connected={connected}
          changesOnly={diffState.changesOnly}
          setChangesOnly={diffState.setChangesOnly}
          diffPaths={diffState.diffPaths}
          diffLoading={diffState.diffLoading}
          isGitRepo={diffState.isGitRepo}
          lastExportTimestamp={diffState.lastExportTimestamp}
          fetchDiff={diffState.fetchDiff}
          fetchDiffSince={diffState.fetchDiffSince}
          results={exportResults.results}
          exporting={exportResults.exporting}
          selected={platformConfig.selected}
          selectedSets={platformConfig.selectedSets}
          zipProgress={exportResults.zipProgress}
          handleExport={exportResults.handleExport}
          handleCopyAllPlatformResults={exportResults.handleCopyAllPlatformResults}
          handleDownloadZip={exportResults.handleDownloadZip}
          figmaLoading={figmaVariables.figmaLoading}
          figmaCollections={figmaVariables.figmaCollections}
          savePhase={figmaVariables.savePhase}
          copiedAll={figmaVariables.copiedAll}
          selectedExportMode={figmaVariables.selectedExportMode}
          setSelectedExportMode={figmaVariables.setSelectedExportMode}
          savePerMode={figmaVariables.savePerMode}
          setSavePerMode={figmaVariables.setSavePerMode}
          handleExportFigmaVariables={figmaVariables.handleExportFigmaVariables}
          handleCopyAll={figmaVariables.handleCopyAll}
          handlePreviewSave={figmaVariables.handlePreviewSave}
        />
      </div>

      {/* Delete preset confirmation */}
      {presetsState.pendingDeletePresetId && presetsState.presets.find(p => p.id === presetsState.pendingDeletePresetId) && (
        <ConfirmModal
          title={`Delete preset "${presetsState.presets.find(p => p.id === presetsState.pendingDeletePresetId)!.name}"?`}
          description="This preset and its platform configuration will be permanently removed."
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDeletePreset}
          onCancel={() => presetsState.setPendingDeletePresetId(null)}
        />
      )}

      {/* Save to server preview confirmation */}
      {figmaVariables.savePhase === 'preview' && (() => {
        const previewRows = figmaVariables.savePreviewRows;
        const saveRun = figmaVariables.saveRun;
        const hasValidationIssues = previewRows.some(item => item.destinationError || item.appendPathError);
        const previewReady = previewRows.length === figmaVariables.savePreviewItems.length;
        const savedCount = previewRows.filter(item => saveRun.itemStatuses[item.itemKey] === 'saved').length;
        const failedCount = previewRows.filter(item => saveRun.itemStatuses[item.itemKey] === 'failed').length;
        const currentSaveItem = saveRun.currentItemKey
          ? previewRows.find(item => item.itemKey === saveRun.currentItemKey) ?? null
          : null;
        const confirmDisabled =
          saveRun.active || figmaVariables.savePreviewRefreshing || !previewReady || hasValidationIssues;
        return (
          <ConfirmModal
            title="Save to Token Server"
            confirmLabel={
              saveRun.active
                ? `Saving ${Math.min(saveRun.completedCount + 1, saveRun.totalCount)} / ${saveRun.totalCount}`
                : !previewReady || figmaVariables.savePreviewRefreshing
                ? 'Refreshing preview...'
                : hasValidationIssues
                  ? 'Resolve issues first'
                  : saveRun.error && savedCount > 0
                    ? 'Retry Remaining Saves'
                  : 'Confirm & Save'
            }
            confirmDisabled={confirmDisabled}
            wide
            onConfirm={figmaVariables.handleConfirmSave}
            onCancel={() => {
              if (saveRun.active) return;
              figmaVariables.resetSavePreview();
            }}
          >
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Preview
                </span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {previewRows.filter(item => !item.destinationExists).length} new &middot;{' '}
                  {previewRows.filter(item => item.destinationExists).length} existing
                  {savedCount > 0 && ` · ${savedCount} saved`}
                  {failedCount > 0 && ` · ${failedCount} failed`}
                </span>
              </div>
              {saveRun.active && (
                <div className="mb-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-medium text-[var(--color-figma-text)]">
                      Writing {Math.min(saveRun.completedCount + 1, saveRun.totalCount)} / {saveRun.totalCount}
                    </span>
                    <span className="truncate text-[var(--color-figma-text-secondary)]">
                      {currentSaveItem
                        ? `${currentSaveItem.collectionName}${currentSaveItem.modeName ? ` · ${currentSaveItem.modeName}` : ''}`
                        : 'Preparing save'}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--color-figma-bg)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all"
                      style={{
                        width: `${saveRun.totalCount === 0
                          ? 0
                          : Math.round(((saveRun.completedCount + (saveRun.currentItemKey ? 1 : 0)) / saveRun.totalCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {!saveRun.active && saveRun.error && (
                <div className="mb-2">
                  <InlineBanner variant="error">
                    <span className="block">
                      {savedCount > 0
                        ? `Saved ${savedCount} of ${previewRows.length} destination sets before the failure below. Saved rows have refreshed counts and each successful write can be undone.`
                        : 'Save failed before any destination set finished.'}
                    </span>
                    <span className="mt-1 block">{saveRun.error}</span>
                  </InlineBanner>
                </div>
              )}
              <datalist id="figma-save-destination-options">
                {sets.map(setName => (
                  <option key={setName} value={setName} />
                ))}
              </datalist>
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
                {figmaVariables.savePreviewRefreshing && (
                  <div className="px-2.5 py-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)]">
                    Recomputing diff counts for the current destination selections…
                  </div>
                )}
                {previewRows.map(item => {
                  const itemStatus = saveRun.itemStatuses[item.itemKey] ?? 'pending';
                  return (
                    <div
                      key={item.itemKey}
                      className={`px-2.5 py-2 rounded-md border ${
                        itemStatus === 'failed' || item.destinationError || item.appendPathError
                          ? 'border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/5'
                          : itemStatus === 'saved'
                            ? 'border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5'
                          : 'border-[var(--color-figma-border)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[var(--color-figma-text)] truncate font-medium">
                              {item.collectionName}
                            </span>
                            {item.modeName && (
                              <span className="px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[8px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] shrink-0">
                                {item.modeName}
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                              item.destinationExists
                                ? 'bg-[var(--color-figma-warning,#f59e0b)]/15 text-[var(--color-figma-warning,#b45309)]'
                                : 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                            }`}>
                              {item.actionLabel}
                            </span>
                            {itemStatus === 'saving' && (
                              <span className="inline-flex items-center gap-1 rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                                <Spinner size="sm" />
                                Saving
                              </span>
                            )}
                            {itemStatus === 'saved' && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-medium uppercase bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]">
                                Saved
                              </span>
                            )}
                            {itemStatus === 'failed' && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-medium uppercase bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]">
                                Failed
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                              {item.varCount} var{item.varCount !== 1 ? 's' : ''}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[8px] font-medium text-[var(--color-figma-accent)]">
                              {item.diff.newCount} new
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-warning,#f59e0b)]/15 text-[8px] font-medium text-[var(--color-figma-warning,#b45309)]">
                              {item.diff.changedCount} changed
                            </span>
                            {item.diff.skippedCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[8px] font-medium text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                                {item.diff.skippedCount} skipped
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[8px] font-medium text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                              {item.diff.unchangedCount} unchanged
                            </span>
                          </div>
                        </div>
                        <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">
                          {item.destinationChanged
                            ? 'Destination changed'
                            : `${item.destinationTokenCount} existing token${item.destinationTokenCount !== 1 ? 's' : ''}`}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <div>
                          <label className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                            Destination set
                          </label>
                          <input
                            type="text"
                            value={item.effectiveDestination}
                            onChange={e => {
                              const value = sanitizeDestinationSetName(e.target.value);
                              figmaVariables.setSaveDestinationMap(prev => ({ ...prev, [item.itemKey]: value }));
                            }}
                            disabled={saveRun.active}
                            list="figma-save-destination-options"
                            className={`mt-1 w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[10px] font-mono text-[var(--color-figma-text)] disabled:opacity-60 ${fieldBorderClass(!!item.destinationError)}`}
                            spellCheck={false}
                            aria-label={`Destination set for ${item.collectionName}${item.modeName ? ` (${item.modeName})` : ''}`}
                          />
                          <FieldMessage
                            error={item.destinationError ?? undefined}
                            info={
                              item.destinationChanged
                                ? 'Diff counts update against the remapped destination'
                                : item.destinationExists
                                  ? 'Writes into an existing set'
                                  : 'Creates a new set on save'
                            }
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                            Merge behavior
                          </label>
                          <select
                            value={item.effectiveMergeStrategy}
                            onChange={e => {
                              figmaVariables.setSaveMergeStrategies(prev => ({
                                ...prev,
                                [item.itemKey]: e.target.value as 'overwrite' | 'merge' | 'skip',
                              }));
                            }}
                            disabled={saveRun.active || !item.destinationExists}
                            className="mt-1 w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text)] disabled:opacity-50"
                            aria-label={`Merge behavior for ${item.collectionName}${item.modeName ? ` (${item.modeName})` : ''}`}
                          >
                            <option value="overwrite">Overwrite changed tokens</option>
                            <option value="merge">Merge and keep untouched tokens</option>
                            <option value="skip">Skip conflicting tokens</option>
                          </select>
                          <FieldMessage
                            info={item.destinationExists ? 'Applies only when the destination already exists' : 'Not needed for a new destination set'}
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                            Append path
                          </label>
                          <input
                            type="text"
                            value={item.effectiveAppendPath}
                            onChange={e => {
                              figmaVariables.setSaveAppendPaths(prev => ({ ...prev, [item.itemKey]: e.target.value }));
                            }}
                            disabled={saveRun.active}
                            placeholder="brand.colors"
                            className={`mt-1 w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[10px] font-mono text-[var(--color-figma-text)] disabled:opacity-60 ${fieldBorderClass(!!item.appendPathError)}`}
                            spellCheck={false}
                            aria-label={`Append path for ${item.collectionName}${item.modeName ? ` (${item.modeName})` : ''}`}
                          />
                          <FieldMessage
                            error={item.appendPathError ?? undefined}
                            info={!item.appendPathError ? 'Optional dot path prefix inside the destination set' : undefined}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ConfirmModal>
        );
      })()}

      {/* Export preview modal */}
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
          selectedSetCount={platformConfig.selectedSets !== null ? platformConfig.selectedSets.size : null}
          onDownloadZip={exportResults.handleDownloadZip}
          onDownloadFile={exportResults.handleDownloadFile}
          onCopyFile={exportResults.handleCopyFile}
          onClose={() => exportResults.setShowExportPreviewModal(false)}
        />
      )}
    </>
  );
}
