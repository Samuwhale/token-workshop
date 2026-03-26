import { useState } from 'react';
import { SyncPanel } from './SyncPanel';
import { ExportPanel } from './ExportPanel';

interface PublishPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
}

type PublishSubTab = 'sync' | 'export';

export function PublishPanel({ serverUrl, connected, activeSet }: PublishPanelProps) {
  const [subTab, setSubTab] = useState<PublishSubTab>('sync');

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
        {([
          { id: 'sync' as const, label: 'Sync to Figma' },
          { id: 'export' as const, label: 'Export' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
              subTab === tab.id
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {subTab === 'sync' && (
          <SyncPanel serverUrl={serverUrl} connected={connected} activeSet={activeSet} />
        )}
        {subTab === 'export' && (
          <ExportPanel serverUrl={serverUrl} connected={connected} />
        )}
      </div>
    </div>
  );
}
