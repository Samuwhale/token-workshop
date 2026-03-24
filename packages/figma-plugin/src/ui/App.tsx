import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TokenList } from './components/TokenList';
import { TokenEditor } from './components/TokenEditor';
import { ThemeManager } from './components/ThemeManager';
import { SyncPanel } from './components/SyncPanel';
import { ExportPanel } from './components/ExportPanel';
import { ImportPanel } from './components/ImportPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { SelectionInspector } from './components/SelectionInspector';
import { UndoToast } from './components/UndoToast';
import { useServerConnection } from './hooks/useServerConnection';
import { useTokens, fetchAllTokensFlat } from './hooks/useTokens';
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
  const { sets, activeSet, setActiveSet, tokens, setTokenCounts, refreshTokens } = useTokens(serverUrl, connected);
  const { selectedNodes } = useSelection();
  const { syncing, syncProgress, syncResult, sync } = useSyncBindings(serverUrl, connected);
  const [allTokensFlat, setAllTokensFlat] = useState<Record<string, TokenMapEntry>>({});
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const { toastVisible, slot: undoSlot, pushUndo, executeUndo, dismissToast } = useUndo();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connected) {
      fetchAllTokensFlat(serverUrl).then(raw => setAllTokensFlat(resolveAllAliases(raw)));
    }
  }, [connected, serverUrl, tokens]);

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
          {sets.map(set => (
            <button
              key={set}
              onClick={() => setActiveSet(set)}
              className={`px-2 py-1 rounded text-[10px] whitespace-nowrap transition-colors ${
                activeSet === set
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {set}
              {setTokenCounts[set] !== undefined && (
                <span className={`ml-1.5 ${activeSet === set ? 'text-white/70' : 'text-[var(--color-figma-text-tertiary)]'}`}>
                  {setTokenCounts[set]}
                </span>
              )}
            </button>
          ))}
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
          {overflowPanel === null && activeTab === 'tokens' && !editingToken && (
            <TokenList
              tokens={tokens}
              setName={activeSet}
              serverUrl={serverUrl}
              connected={connected}
              selectedNodes={selectedNodes}
              allTokensFlat={allTokensFlat}
              onEdit={(path) => setEditingToken({ path, set: activeSet })}
              onRefresh={refreshTokens}
              onPushUndo={pushUndo}
            />
          )}
          {overflowPanel === null && activeTab === 'tokens' && editingToken && (
            <TokenEditor
              tokenPath={editingToken.path}
              setName={editingToken.set}
              serverUrl={serverUrl}
              onBack={() => { setEditingToken(null); refreshTokens(); }}
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
          />
        )}
      </div>

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
