import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { TokenList } from './components/TokenList';
import { TokenEditor } from './components/TokenEditor';
import { ThemeManager } from './components/ThemeManager';
import { SyncPanel } from './components/SyncPanel';
import { ExportPanel } from './components/ExportPanel';
import { ImportPanel } from './components/ImportPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { SelectionInspector } from './components/SelectionInspector';
import { UndoToast } from './components/UndoToast';
import { ConfirmModal } from './components/ConfirmModal';
import { EmptyState } from './components/EmptyState';
import { useServerConnection } from './hooks/useServerConnection';
import { useTokens, fetchAllTokensFlat, fetchAllTokensFlatWithSets } from './hooks/useTokens';
import { useSelection } from './hooks/useSelection';
import { useUndo } from './hooks/useUndo';
import type { SyncCompleteMessage, TokenMapEntry } from '../shared/types';
import { resolveAllAliases } from '../shared/resolveAlias';

function useSyncBindings(serverUrl: string, connected: boolean) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<SyncCompleteMessage | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === 'sync-progress') {
        setProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === 'sync-complete') {
        setSyncing(false);
        setProgress(null);
        setResult(msg as SyncCompleteMessage);
        clearTimer.current = setTimeout(() => setResult(null), 3000);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const sync = useCallback(async (scope: 'page' | 'selection') => {
    if (!connected || syncing) return;
    setSyncing(true);
    setResult(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const tokenMap = resolveAllAliases(rawMap);
      parent.postMessage({ pluginMessage: { type: 'sync-bindings', tokenMap, scope } }, '*');
    } catch (err) {
      console.error('Failed to fetch tokens for sync:', err);
      setSyncing(false);
    }
  }, [serverUrl, connected, syncing]);

  return { syncing, syncProgress: progress, syncResult: result, sync };
}

type Tab = 'tokens' | 'themes' | 'sync' | 'analytics';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'themes', label: 'Themes' },
  { id: 'sync', label: 'Sync' },
  { id: 'analytics', label: 'Analytics' },
];

type OverflowPanel = 'import' | 'export' | 'settings' | null;

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [overflowPanel, setOverflowPanel] = useState<OverflowPanel>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<{ path: string; set: string } | null>(null);
  const { connected, serverUrl, updateServerUrl } = useServerConnection();
  const { sets, activeSet, setActiveSet, tokens, setTokenCounts, setDescriptions, refreshTokens } = useTokens(serverUrl, connected);
  const { selectedNodes } = useSelection();
  const { syncing, syncProgress, syncResult, sync } = useSyncBindings(serverUrl, connected);
  const [allTokensFlat, setAllTokensFlat] = useState<Record<string, TokenMapEntry>>({});
  const [pathToSet, setPathToSet] = useState<Record<string, string>>({});
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const { toastVisible, slot: undoSlot, pushUndo, executeUndo, dismissToast } = useUndo();
  const menuRef = useRef<HTMLDivElement>(null);

  // Set context menu state
  const [tabMenuOpen, setTabMenuOpen] = useState<string | null>(null);
  const [tabMenuPos, setTabMenuPos] = useState({ x: 0, y: 0 });
  const tabMenuRef = useRef<HTMLDivElement>(null);

  // Empty state create flow
  const [createFromEmpty, setCreateFromEmpty] = useState(false);

  // Reset createFromEmpty when switching sets
  const prevActiveSet = useRef(activeSet);
  if (prevActiveSet.current !== activeSet) {
    prevActiveSet.current = activeSet;
    if (createFromEmpty) setCreateFromEmpty(false);
  }

  // Set metadata editing state
  const [editingMetadataSet, setEditingMetadataSet] = useState<string | null>(null);
  const [metadataDescription, setMetadataDescription] = useState('');

  // Delete state
  const [deletingSet, setDeletingSet] = useState<string | null>(null);

  // Rename state
  const [renamingSet, setRenamingSet] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (connected) {
      fetchAllTokensFlatWithSets(serverUrl).then(({ flat, pathToSet: pts }) => {
        setAllTokensFlat(resolveAllAliases(flat));
        setPathToSet(pts);
      });
    }
  }, [connected, serverUrl, tokens]);

  // Apply pending highlight after switching sets
  useEffect(() => {
    if (pendingHighlight && pathToSet[pendingHighlight] === activeSet) {
      setHighlightedToken(pendingHighlight);
      setPendingHighlight(null);
    }
  }, [tokens, pendingHighlight, activeSet, pathToSet]);

  const handleNavigateToAlias = useCallback((aliasPath: string) => {
    if (pathToSet[aliasPath]) {
      const targetSet = pathToSet[aliasPath];
      if (targetSet === activeSet) {
        setHighlightedToken(aliasPath);
      } else {
        setPendingHighlight(aliasPath);
        setActiveSet(targetSet);
      }
    }
  }, [pathToSet, activeSet, setActiveSet]);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Close set context menu on outside click
  useEffect(() => {
    if (!tabMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (tabMenuRef.current && !tabMenuRef.current.contains(e.target as Node)) {
        setTabMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tabMenuOpen]);

  // Focus rename input when it appears
  useLayoutEffect(() => {
    if (renamingSet && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSet]);

  const openSetMenu = (setName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTabMenuOpen(setName);
    setTabMenuPos({ x: e.clientX, y: e.clientY });
  };

  const startRename = (setName: string) => {
    setTabMenuOpen(null);
    setRenamingSet(setName);
    setRenameValue(setName);
    setRenameError('');
  };

  const cancelRename = () => {
    setRenamingSet(null);
    setRenameError('');
  };

  const handleRenameConfirm = async () => {
    if (!renamingSet) return;
    const newName = renameValue.trim();
    if (!newName || newName === renamingSet) { cancelRename(); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
      setRenameError('Only letters, numbers, - and _');
      return;
    }
    if (!connected) { cancelRename(); return; }
    try {
      const res = await fetch(`${serverUrl}/api/sets/${renamingSet}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      if (!res.ok) {
        const data = await res.json();
        setRenameError(data.error || 'Rename failed');
        return;
      }
      if (activeSet === renamingSet) setActiveSet(newName);
      cancelRename();
      refreshTokens();
    } catch {
      setRenameError('Rename failed');
    }
  };

  const handleDeleteSet = async () => {
    if (!deletingSet || !connected) return;
    await fetch(`${serverUrl}/api/sets/${deletingSet}`, { method: 'DELETE' });
    if (activeSet === deletingSet) {
      const remaining = sets.filter(s => s !== deletingSet);
      setActiveSet(remaining[0] ?? '');
    }
    setDeletingSet(null);
    refreshTokens();
  };

  const handleDuplicateSet = async (setName: string) => {
    setTabMenuOpen(null);
    if (!connected) return;
    let newName = `${setName}-copy`;
    let i = 2;
    while (sets.includes(newName)) {
      newName = `${setName}-copy-${i++}`;
    }
    const res = await fetch(`${serverUrl}/api/sets/${setName}`);
    const data = await res.json();
    await fetch(`${serverUrl}/api/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, tokens: data.tokens }),
    });
    refreshTokens();
  };

  const openSetMetadata = (setName: string) => {
    setTabMenuOpen(null);
    setEditingMetadataSet(setName);
    setMetadataDescription(setDescriptions[setName] || '');
  };

  const handleSaveMetadata = async () => {
    if (!editingMetadataSet || !connected) { setEditingMetadataSet(null); return; }
    await fetch(`${serverUrl}/api/sets/${editingMetadataSet}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: metadataDescription }),
    });
    setEditingMetadataSet(null);
    refreshTokens();
  };

  const openOverflowPanel = (panel: OverflowPanel) => {
    setMenuOpen(false);
    setOverflowPanel(panel);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Connection status */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] ${connected ? 'bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]' : 'bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]'}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[var(--color-figma-success)]' : 'bg-[var(--color-figma-error)]'}`} />
        {connected ? 'Connected to server' : 'Server offline \u2014 read-only mode'}
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setOverflowPanel(null); }}
            className={`px-3 py-2 text-[11px] font-medium transition-colors rounded-sm mx-0.5 my-1 ${
              activeTab === tab.id && overflowPanel === null
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {tab.label}
          </button>
        ))}

        {/* Overflow menu */}
        <div className="ml-auto relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className={`flex items-center justify-center w-7 h-7 mr-1 my-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors ${menuOpen ? 'bg-[var(--color-figma-bg-hover)]' : ''}`}
            title="More actions"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="6" cy="2" r="1.2" />
              <circle cx="6" cy="6" r="1.2" />
              <circle cx="6" cy="10" r="1.2" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-1 top-full mt-0.5 w-40 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50">
              <button
                onClick={() => openOverflowPanel('import')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Import
              </button>
              <button
                onClick={() => openOverflowPanel('export')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Export
              </button>
              <div className="border-t border-[var(--color-figma-border)]" />
              <button
                onClick={() => openOverflowPanel('settings')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Server Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Set selector (for tokens tab) */}
      {activeTab === 'tokens' && overflowPanel === null && sets.length > 0 && (
        <div className="flex gap-1 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] overflow-x-auto">
          {sets.map(set => {
            const isActive = activeSet === set;
            const isRenaming = renamingSet === set;
            return (
              <div key={set} className="relative flex group/settab">
                {isRenaming ? (
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => { setRenameValue(e.target.value); setRenameError(''); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameConfirm();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={cancelRename}
                        className="px-2 py-1 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] outline-none w-28"
                        placeholder={set}
                      />
                    </div>
                    {renameError && (
                      <span className="text-[9px] text-red-500 mt-0.5 px-1">{renameError}</span>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveSet(set)}
                      onContextMenu={e => openSetMenu(set, e)}
                      title={setDescriptions[set] || undefined}
                      className={`flex items-center pl-2 pr-1 py-1 rounded-l text-[10px] whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[var(--color-figma-accent)] text-white'
                          : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {set}
                      {setTokenCounts[set] !== undefined && (
                        <span className={`ml-1.5 ${isActive ? 'text-white/70' : 'text-[var(--color-figma-text-tertiary)]'}`}>
                          {setTokenCounts[set]}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={e => openSetMenu(set, e)}
                      onContextMenu={e => openSetMenu(set, e)}
                      title="Set options"
                      className={`flex items-center justify-center px-1 py-1 rounded-r text-[10px] transition-colors opacity-0 group-hover/settab:opacity-100 ${
                        isActive
                          ? 'opacity-100 bg-[var(--color-figma-accent)] text-white/80 hover:text-white hover:bg-[var(--color-figma-accent-hover)]'
                          : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                        <circle cx="4" cy="1" r="0.9" />
                        <circle cx="4" cy="4" r="0.9" />
                        <circle cx="4" cy="7" r="0.9" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Set context menu */}
          {tabMenuOpen && (
            <div
              ref={tabMenuRef}
              className="fixed rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[168px]"
              style={{ top: tabMenuPos.y, left: tabMenuPos.x }}
            >
              <button
                onMouseDown={e => e.preventDefault()}
                disabled
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text-tertiary)] opacity-40 cursor-not-allowed"
              >
                Generate Semantic Tokens
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                disabled
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text-tertiary)] opacity-40 cursor-not-allowed"
              >
                Generate Dark Theme
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                disabled
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text-tertiary)] opacity-40 cursor-not-allowed"
              >
                Adopt Figma File
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => openSetMetadata(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Set Metadata
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => startRename(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Rename
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleDuplicateSet(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Duplicate
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setDeletingSet(tabMenuOpen); setTabMenuOpen(null); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Delete
              </button>
            </div>
          )}

          <button
            onClick={() => {
              const name = prompt('New set name:');
              if (name && connected) {
                fetch(`${serverUrl}/api/sets`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name }),
                }).then(() => refreshTokens());
              }
            }}
            className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            + Add Set
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {/* Overflow panels */}
          {overflowPanel === 'import' && (
            <ImportPanel
              serverUrl={serverUrl}
              connected={connected}
              onImported={refreshTokens}
            />
          )}
          {overflowPanel === 'export' && (
            <ExportPanel serverUrl={serverUrl} connected={connected} />
          )}
          {overflowPanel === 'settings' && (
            <div className="flex flex-col gap-3 p-3">
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Server URL
                </div>
                <div className="p-3 flex flex-col gap-2">
                  <input
                    type="text"
                    value={serverUrlInput}
                    onChange={e => setServerUrlInput(e.target.value)}
                    placeholder="http://localhost:9400"
                    className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                  />
                  <button
                    onClick={() => updateServerUrl(serverUrlInput.trim() || 'http://localhost:9400')}
                    className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main tab panels */}
          {overflowPanel === null && activeTab === 'tokens' && !editingToken && tokens.length === 0 && !createFromEmpty && (
            <EmptyState
              connected={connected}
              onCreateToken={() => setCreateFromEmpty(true)}
              onPasteJSON={() => openOverflowPanel('import')}
            />
          )}
          {overflowPanel === null && activeTab === 'tokens' && !editingToken && (tokens.length > 0 || createFromEmpty) && (
            <TokenList
              tokens={tokens}
              setName={activeSet}
              sets={sets}
              serverUrl={serverUrl}
              connected={connected}
              selectedNodes={selectedNodes}
              allTokensFlat={allTokensFlat}
              onEdit={(path) => setEditingToken({ path, set: activeSet })}
              onRefresh={refreshTokens}
              onPushUndo={pushUndo}
              defaultCreateOpen={createFromEmpty}
              highlightedToken={highlightedToken}
              onNavigateToAlias={handleNavigateToAlias}
              onClearHighlight={() => setHighlightedToken(null)}
            />
          )}
          {overflowPanel === null && activeTab === 'tokens' && editingToken && (
            <TokenEditor
              tokenPath={editingToken.path}
              setName={editingToken.set}
              serverUrl={serverUrl}
              onBack={() => { setEditingToken(null); refreshTokens(); }}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />
          )}
          {overflowPanel === null && activeTab === 'themes' && (
            <ThemeManager serverUrl={serverUrl} connected={connected} />
          )}
          {overflowPanel === null && activeTab === 'sync' && (
            <SyncPanel serverUrl={serverUrl} connected={connected} />
          )}
          {overflowPanel === null && activeTab === 'analytics' && (
            <AnalyticsPanel serverUrl={serverUrl} connected={connected} />
          )}
        </div>
        {overflowPanel === null && activeTab === 'tokens' && (
          <SelectionInspector
            selectedNodes={selectedNodes}
            tokenMap={allTokensFlat}
            onSync={sync}
            syncing={syncing}
            syncProgress={syncProgress}
            syncResult={syncResult}
            connected={connected}
            activeSet={activeSet}
            serverUrl={serverUrl}
            onTokenCreated={refreshTokens}
          />
        )}
      </div>

      {/* Set metadata editor */}
      {editingMetadataSet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">
              Set Metadata — {editingMetadataSet}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Description</label>
              <textarea
                autoFocus
                value={metadataDescription}
                onChange={e => setMetadataDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setEditingMetadataSet(null); }}
                rows={3}
                placeholder="What is this token set for?"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingMetadataSet(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMetadata}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete set confirmation */}
      {deletingSet && (
        <ConfirmModal
          title={`Delete "${deletingSet}"?`}
          description="All tokens in this set will be permanently deleted."
          confirmLabel="Delete set"
          danger
          onConfirm={handleDeleteSet}
          onCancel={() => setDeletingSet(null)}
        />
      )}

      {/* Undo toast */}
      {toastVisible && undoSlot && (
        <UndoToast
          description={undoSlot.description}
          onUndo={executeUndo}
          onDismiss={dismissToast}
        />
      )}
    </div>
  );
}
