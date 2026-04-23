import { useState, useCallback } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { dispatchToast } from '../shared/toastBus';
import type { HistoryPanelProps, HistoryView } from './history/types';
import { defaultSnapshotLabel } from './history/types';
import { FeedbackPlaceholder } from './FeedbackPlaceholder';
import { PanelContentHeader } from './PanelContentHeader';
import { HistoryRecentView } from './history/HistoryRecentView';
import { HistorySavedView } from './history/HistorySavedView';

export function HistoryPanel({
  serverUrl,
  connected,
  workingCollectionId,
  scope,
  onScopeChange,
  collectionIds = [],
  onPushUndo,
  onRefreshTokens,
  recentOperations,
  totalOperations,
  hasMoreOperations,
  onLoadMoreOperations,
  onRollback,
  undoDescriptions,
  redoableOpIds,
  onServerRedo,
  executeUndo,
}: HistoryPanelProps) {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const activeCollectionFilter =
    scope.mode === 'current' ? scope.collectionId ?? workingCollectionId : '';

  const handleClearFilters = useCallback(() => {
    onScopeChange({
      ...scope,
      mode: 'all',
      collectionId: null,
      tokenPath: null,
    });
  }, [onScopeChange, scope]);

  const handleSaveSnapshot = useCallback(async () => {
    const label = saveLabel.trim() || `Snapshot ${new Date().toLocaleString()}`;
    setSaving(true);
    try {
      await apiFetch(`${serverUrl}/api/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      setSaveLabel('');
      setShowSaveInput(false);
      dispatchToast(`Checkpoint "${label}" saved`, 'success', {
        destination: { kind: "workspace", topTab: "library", subTab: "history" },
      });
    } catch (err) {
      dispatchToast((err as Error).message || 'Failed to save checkpoint', 'error', {
        destination: { kind: "workspace", topTab: "library", subTab: "history" },
      });
    } finally {
      setSaving(false);
    }
  }, [serverUrl, saveLabel]);

  if (!connected) {
    return (
      <FeedbackPlaceholder
        variant="disconnected"
        title="Connect to the token server"
        description="Connect to access history, rollback, and checkpoints."
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelContentHeader
        primaryAction={showSaveInput ? null : {
          label: 'Save checkpoint',
          onClick: () => {
            const lastOp = recentOperations?.[0];
            setSaveLabel(defaultSnapshotLabel(lastOp?.description));
            setShowSaveInput(true);
          },
        }}
      />

      {showSaveInput && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <input
            className="flex-1 min-w-0 px-2 py-1 text-secondary rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:border-[var(--color-figma-accent)]"
            placeholder="Checkpoint label"
            value={saveLabel}
            onChange={e => setSaveLabel(e.target.value)}
            aria-label="Checkpoint label"
            onKeyDown={e => { if (e.key === 'Enter') handleSaveSnapshot(); if (e.key === 'Escape') { setShowSaveInput(false); setSaveLabel(''); } }}
            autoFocus
          />
          <button
            onClick={handleSaveSnapshot}
            disabled={saving}
            className="shrink-0 px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-secondary font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setShowSaveInput(false); setSaveLabel(''); }}
            className="shrink-0 px-2 py-1 rounded text-secondary text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <div
        role="tablist"
        aria-label="History views"
        className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-[var(--color-figma-border)]"
        onKeyDown={(e) => {
          const views: HistoryView[] = ['recent', 'saved'];
          const currentIndex = views.indexOf(scope.view);
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = views[(currentIndex + 1) % views.length];
            onScopeChange({ ...scope, view: next });
            document.getElementById(`history-tab-${next}`)?.focus();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = views[(currentIndex - 1 + views.length) % views.length];
            onScopeChange({ ...scope, view: next });
            document.getElementById(`history-tab-${next}`)?.focus();
          } else if (e.key === 'Home') {
            e.preventDefault();
            onScopeChange({ ...scope, view: views[0] });
            document.getElementById(`history-tab-${views[0]}`)?.focus();
          } else if (e.key === 'End') {
            e.preventDefault();
            const last = views[views.length - 1];
            onScopeChange({ ...scope, view: last });
            document.getElementById(`history-tab-${last}`)?.focus();
          }
        }}
      >
        {(['recent', 'saved'] as const).map((view) => (
          <button
            key={view}
            role="tab"
            id={`history-tab-${view}`}
            aria-selected={scope.view === view}
            aria-controls={`history-tabpanel-${view}`}
            tabIndex={scope.view === view ? 0 : -1}
            onClick={() => onScopeChange({ ...scope, view })}
            className={`flex-1 text-center text-secondary font-medium py-1 rounded transition-colors ${
              scope.view === view
                ? 'bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            {view === 'recent' ? 'Recent' : 'Saved'}
          </button>
        ))}
      </div>

      <div className="shrink-0 flex items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="inline-flex rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-0.5">
          {([
            { value: 'all', label: 'All collections' },
            { value: 'current', label: 'Current collection' },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onScopeChange({
                  ...scope,
                  mode: option.value,
                  collectionId:
                    option.value === 'current'
                      ? scope.collectionId ?? workingCollectionId
                      : null,
                })
              }
              className={`rounded px-2 py-1 text-secondary transition-colors ${
                scope.mode === option.value
                  ? 'bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]'
                  : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {scope.mode === 'current' ? (
          <select
            id="history-collection-filter"
            value={activeCollectionFilter}
            onChange={(event) =>
              onScopeChange({
                ...scope,
                mode: 'current',
                collectionId: event.target.value,
              })
            }
            className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)]"
          >
            {collectionIds.map((collectionId) => (
              <option key={collectionId} value={collectionId}>
                {collectionId}
              </option>
            ))}
          </select>
        ) : (
          <div className="min-w-0 flex-1 text-secondary text-[var(--color-figma-text-secondary)]">
            Library-wide history
          </div>
        )}
      </div>

      <div
        role="tabpanel"
        id={`history-tabpanel-${scope.view}`}
        aria-labelledby={`history-tab-${scope.view}`}
        tabIndex={0}
        className="flex-1 min-h-0 overflow-hidden"
      >
        {scope.view === 'recent' ? (
          <HistoryRecentView
            serverUrl={serverUrl}
            collectionFilter={activeCollectionFilter || null}
            filterTokenPath={scope.tokenPath}
            scopeMode={scope.mode}
            onClearFilter={handleClearFilters}
            recentOperations={recentOperations}
            totalOperations={totalOperations}
            hasMoreOperations={hasMoreOperations}
            onLoadMoreOperations={onLoadMoreOperations}
            onRollback={onRollback}
            undoDescriptions={undoDescriptions}
            redoableOpIds={redoableOpIds}
            onServerRedo={onServerRedo}
            executeUndo={executeUndo}
          />
        ) : (
          <HistorySavedView
            serverUrl={serverUrl}
            connected={connected}
            onPushUndo={onPushUndo}
            onRefreshTokens={onRefreshTokens}
            collectionFilter={activeCollectionFilter || undefined}
            filterTokenPath={scope.tokenPath ?? undefined}
          />
        )}
      </div>
    </div>
  );
}
