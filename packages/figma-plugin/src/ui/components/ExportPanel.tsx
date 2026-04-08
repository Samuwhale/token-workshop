import { useState, useEffect, useRef } from 'react';
import { STORAGE_KEYS, lsGetJson } from '../shared/storage';
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from './PanelHelpHint';
import { ConfirmModal } from './ConfirmModal';
import { useDiffState } from '../hooks/useDiffState';
import { useExportPresets, type ExportPreset } from '../hooks/useExportPresets';
import { usePlatformConfig } from '../hooks/usePlatformConfig';
import { useExportResults } from '../hooks/useExportResults';
import { useFigmaVariables } from '../hooks/useFigmaVariables';
import { useTokenSetsContext } from '../contexts/TokenDataContext';
import { PlatformExportConfig } from './PlatformExportConfig';
import { FigmaVariablesPanel } from './FigmaVariablesPanel';
import { ExportFooter } from './ExportFooter';
import { ExportPreviewModal } from './ExportPreviewModal';
import { GitWorkflowPanel } from './publish/GitWorkflowPanel';

export type ExportMode = 'platforms' | 'figma-variables' | 'repository';

interface ExportPanelProps {
  serverUrl: string;
  connected: boolean;
}

export function ExportPanel({ serverUrl, connected }: ExportPanelProps) {
  const help = usePanelHelp('export');
  const { sets, addSetToState } = useTokenSetsContext();
  const [mode, setMode] = useState<ExportMode>('platforms');
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
      const id = localStorage.getItem(STORAGE_KEYS.EXPORT_PRESET_APPLY);
      if (!id) return;
      localStorage.removeItem(STORAGE_KEYS.EXPORT_PRESET_APPLY);
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
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

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
            title="Repo / Handoff"
            description="Generate platform-specific handoff files, inspect Figma variables for import, or switch into repository actions when downstream delivery needs saved files and branch coordination."
            onDismiss={help.dismiss}
          />
        )}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
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
              Handoff files
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
            <button
              onClick={() => setMode('repository')}
              disabled={!connected}
              title={!connected ? 'Connect to server to use repository workflow' : undefined}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
                !connected
                  ? 'opacity-40 cursor-not-allowed text-[var(--color-figma-text-tertiary)]'
                  : mode === 'repository'
                    ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                    : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 01-9 9" />
              </svg>
              Repository
            </button>
          </div>

          {/* Mode description */}
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed -mt-1">
            {mode === 'platforms'
              ? 'Generate platform-specific code files from the token server — CSS variables, Dart, Swift, Android, or W3C JSON.'
              : mode === 'figma-variables'
                ? 'Inspect variables from this Figma file, preview them, and copy as DTCG JSON or save them to the token server.'
                : 'Inspect repository status, reconcile incoming or outgoing token changes, and save branch-ready handoff updates.'}
          </div>

          {/* Auto-switch notice */}
          {modeAutoSwitched && (
            <div role="status" className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-text-secondary)] text-[10px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px text-[var(--color-figma-warning)]" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="flex-1">
                Switched to <strong>Figma Variables</strong> — server disconnected. Platforms mode requires a server connection. Reconnect to switch back.
              </span>
              <button
                onClick={() => setModeAutoSwitched(false)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
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

          {mode === 'repository' && (
            <GitWorkflowPanel serverUrl={serverUrl} connected={connected} />
          )}
        </div>

        {mode !== 'repository' && (
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
        )}
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
        const effectiveItems = figmaVariables.savePreviewItems.map(item => ({
          ...item,
          effectiveSlug: figmaVariables.slugRenames[item.itemKey] ?? item.slug,
        }));
        const slugCounts = new Map<string, number>();
        for (const item of effectiveItems) {
          slugCounts.set(item.effectiveSlug, (slugCounts.get(item.effectiveSlug) ?? 0) + 1);
        }
        const hasConflicts = [...slugCounts.values()].some(c => c > 1);
        return (
          <ConfirmModal
            title="Save to Token Server"
            confirmLabel={hasConflicts ? 'Resolve conflicts first' : 'Confirm & Save'}
            confirmDisabled={hasConflicts}
            wide
            onConfirm={figmaVariables.handleConfirmSave}
            onCancel={() => {
              figmaVariables.setSavePhase('idle');
              figmaVariables.setSavePreviewItems([]);
              figmaVariables.setSlugRenames({});
            }}
          >
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Preview
                </span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {figmaVariables.savePreviewItems.filter(i => i.action === 'create').length} new &middot;{' '}
                  {figmaVariables.savePreviewItems.filter(i => i.action === 'overwrite').length} overwrite
                </span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
                {effectiveItems.map(item => {
                  const isConflict = (slugCounts.get(item.effectiveSlug) ?? 0) > 1;
                  return (
                    <div
                      key={item.itemKey}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-md border ${isConflict ? 'border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/5' : 'border-[var(--color-figma-border)]'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[var(--color-figma-text)] truncate font-medium">
                            {item.collectionName}
                          </span>
                          {item.modeName && (
                            <span className="px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[8px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] shrink-0">
                              {item.modeName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] shrink-0" aria-hidden="true">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          {isConflict ? (
                            <input
                              type="text"
                              value={item.effectiveSlug}
                              onChange={e => {
                                const val = e.target.value.replace(/[^a-zA-Z0-9_/-]/g, '-').toLowerCase();
                                figmaVariables.setSlugRenames(prev => ({ ...prev, [item.itemKey]: val }));
                              }}
                              className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-figma-error)]/60 bg-[var(--color-figma-bg)] text-[10px] font-mono text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] transition-colors"
                              spellCheck={false}
                              aria-label={`Set name for ${item.collectionName}${item.modeName ? ` (${item.modeName})` : ''}`}
                            />
                          ) : (
                            <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                              {item.effectiveSlug}
                            </span>
                          )}
                        </div>
                        {isConflict && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-error)] shrink-0" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span className="text-[9px] text-[var(--color-figma-error)]">Slug conflict — rename to continue</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                          {item.varCount} var{item.varCount !== 1 ? 's' : ''}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                          item.action === 'overwrite'
                            ? 'bg-[var(--color-figma-warning,#f59e0b)]/15 text-[var(--color-figma-warning,#b45309)]'
                            : 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                        }`}>
                          {item.action === 'overwrite' ? 'Overwrite' : 'Create'}
                        </span>
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
          onDownloadZip={exportResults.handleDownloadZip}
          onDownloadFile={exportResults.handleDownloadFile}
          onCopyFile={exportResults.handleCopyFile}
          onClose={() => exportResults.setShowExportPreviewModal(false)}
        />
      )}
    </>
  );
}
