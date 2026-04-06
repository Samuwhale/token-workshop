import { useState, useEffect } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { RemapAutocompleteInput } from './RemapAutocompleteInput';

interface RemapBindingsPanelProps {
  tokenMap: Record<string, TokenMapEntry>;
  initialMissingTokens?: string[];
  onClose: () => void;
}

export function RemapBindingsPanel({ tokenMap, initialMissingTokens, onClose: _onClose }: RemapBindingsPanelProps) {
  const [remapRows, setRemapRows] = useState<{ from: string; to: string }[]>(() => {
    const prefill = initialMissingTokens;
    return prefill && prefill.length > 0
      ? prefill.map(p => ({ from: p, to: '' }))
      : [{ from: '', to: '' }];
  });
  const [remapScope, setRemapScope] = useState<'selection' | 'page'>('page');
  const [remapRunning, setRemapRunning] = useState(false);
  const [remapProgress, setRemapProgress] = useState<{ processed: number; total: number } | null>(null);
  const [remapResult, setRemapResult] = useState<{ updatedBindings: number; updatedNodes: number } | null>(null);
  const [remapError, setRemapError] = useState<string | null>(null);

  // Listen for remap-progress and remap-complete messages from the plugin controller
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'remap-progress') {
        setRemapProgress({ processed: msg.processed, total: msg.total });
      } else if (msg?.type === 'remap-complete') {
        setRemapRunning(false);
        setRemapProgress(null);
        if (msg.error) {
          setRemapError(msg.error);
          setRemapResult(null);
        } else {
          setRemapResult({ updatedBindings: msg.updatedBindings, updatedNodes: msg.updatedNodes });
          setRemapError(null);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleRemap = () => {
    const validEntries: Record<string, string> = {};
    for (const row of remapRows) {
      if (row.from.trim() && row.to.trim() && row.from.trim() !== row.to.trim()) {
        validEntries[row.from.trim()] = row.to.trim();
      }
    }
    if (Object.keys(validEntries).length === 0) return;
    setRemapRunning(true);
    setRemapResult(null);
    setRemapError(null);
    parent.postMessage({ pluginMessage: { type: 'remap-bindings', remapMap: validEntries, scope: remapScope } }, '*');
  };

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 shrink-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-[var(--color-figma-text)] uppercase tracking-wide">Remap Bindings</span>
        <div className="flex items-center gap-1">
          {/* Scope toggle */}
          <button
            onClick={() => setRemapScope(s => s === 'selection' ? 'page' : 'selection')}
            className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg)] transition-colors"
            title="Toggle scope between selection (including children) and entire page"
          >
            {remapScope === 'selection' ? 'Selection' : 'Page'}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5 leading-relaxed">
        Find-and-replace token paths — enter the old path on the left and the replacement on the right, then click Remap.
      </p>

      {/* Mapping rows */}
      <div className="flex flex-col gap-1 mb-1.5">
        {remapRows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <RemapAutocompleteInput
              value={row.from}
              onChange={v => setRemapRows(rows => rows.map((r, i) => i === idx ? { ...r, from: v } : r))}
              placeholder="old.token.path"
              tokenMap={tokenMap}
            />
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <RemapAutocompleteInput
              value={row.to}
              onChange={v => setRemapRows(rows => rows.map((r, i) => i === idx ? { ...r, to: v } : r))}
              placeholder="new.token.path"
              tokenMap={tokenMap}
            />
            {remapRows.length > 1 && (
              <button
                onClick={() => setRemapRows(rows => rows.filter((_, i) => i !== idx))}
                className="shrink-0 p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error,#f56565)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                title="Remove row"
                aria-label="Remove row"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setRemapRows(rows => [...rows, { from: '', to: '' }])}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
        >
          + Add row
        </button>
        <div className="flex items-center gap-1.5">
          {remapRunning && remapProgress && (
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]" aria-live="polite">
              {remapProgress.processed}/{remapProgress.total} layers
            </span>
          )}
          {remapError && !remapRunning && (
            <span className="text-[10px] text-[var(--color-figma-error)]" title={remapError}>
              Error: {remapError.length > 40 ? remapError.slice(0, 40) + '…' : remapError}
            </span>
          )}
          {!remapError && !remapRunning && remapResult && (
            <span className={`text-[10px] ${remapResult.updatedBindings > 0 ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
              {remapResult.updatedBindings > 0
                ? `${remapResult.updatedBindings} binding${remapResult.updatedBindings !== 1 ? 's' : ''} remapped`
                : 'No matches found'}
            </span>
          )}
          <button
            onClick={handleRemap}
            disabled={remapRunning || remapRows.every(r => !r.from.trim() || !r.to.trim())}
            className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
          >
            {remapRunning ? 'Remapping…' : 'Remap'}
          </button>
        </div>
      </div>
    </div>
  );
}
