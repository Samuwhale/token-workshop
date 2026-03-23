import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TokenList } from './components/TokenList';
import { TokenEditor } from './components/TokenEditor';
import { ThemeManager } from './components/ThemeManager';
import { SyncPanel } from './components/SyncPanel';
import { ExportPanel } from './components/ExportPanel';
import { ImportPanel } from './components/ImportPanel';
import { SelectionInspector } from './components/SelectionInspector';
import { useServerConnection } from './hooks/useServerConnection';
import { useTokens, fetchAllTokensFlat } from './hooks/useTokens';
import { useSelection } from './hooks/useSelection';
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

type Tab = 'tokens' | 'themes' | 'sync' | 'export' | 'import';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tokens');
  const [editingToken, setEditingToken] = useState<{ path: string; set: string } | null>(null);
  const { connected, serverUrl } = useServerConnection();
  const { sets, activeSet, setActiveSet, tokens, refreshTokens } = useTokens(serverUrl, connected);
  const { selectedNodes } = useSelection();
  const { syncing, syncProgress, syncResult, sync } = useSyncBindings(serverUrl, connected);
  const [allTokensFlat, setAllTokensFlat] = useState<Record<string, TokenMapEntry>>({});

  useEffect(() => {
    if (connected) {
      fetchAllTokensFlat(serverUrl).then(raw => setAllTokensFlat(resolveAllAliases(raw)));
    }
  }, [connected, serverUrl, tokens]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tokens', label: 'Tokens' },
    { id: 'themes', label: 'Themes' },
    { id: 'sync', label: 'Sync' },
    { id: 'export', label: 'Export' },
    { id: 'import', label: 'Import' },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Connection status */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] ${connected ? 'bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]' : 'bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]'}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[var(--color-figma-success)]' : 'bg-[var(--color-figma-error)]'}`} />
        {connected ? 'Connected to server' : 'Server offline \u2014 read-only mode'}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-figma-border)]">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-2 py-2 text-[11px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)]'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Set selector (for tokens tab) */}
      {activeTab === 'tokens' && sets.length > 0 && (
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
          {activeTab === 'tokens' && !editingToken && (
            <TokenList
              tokens={tokens}
              setName={activeSet}
              serverUrl={serverUrl}
              connected={connected}
              selectedNodes={selectedNodes}
              allTokensFlat={allTokensFlat}
              onEdit={(path) => setEditingToken({ path, set: activeSet })}
              onRefresh={refreshTokens}
            />
          )}
          {activeTab === 'tokens' && editingToken && (
            <TokenEditor
              tokenPath={editingToken.path}
              setName={editingToken.set}
              serverUrl={serverUrl}
              onBack={() => { setEditingToken(null); refreshTokens(); }}
            />
          )}
          {activeTab === 'themes' && (
            <ThemeManager serverUrl={serverUrl} connected={connected} />
          )}
          {activeTab === 'sync' && (
            <SyncPanel serverUrl={serverUrl} connected={connected} />
          )}
          {activeTab === 'export' && (
            <ExportPanel serverUrl={serverUrl} connected={connected} />
          )}
          {activeTab === 'import' && (
            <ImportPanel
              serverUrl={serverUrl}
              connected={connected}
              onImported={refreshTokens}
            />
          )}
        </div>
        {activeTab === 'tokens' && (
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
    </div>
  );
}
