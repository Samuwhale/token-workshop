import { useState, useEffect } from 'react';

interface ImportPanelProps {
  serverUrl: string;
  connected: boolean;
  onImported: () => void;
}

interface ImportToken {
  path: string;
  $type: string;
  $value: any;
  collection?: string;
}

export function ImportPanel({ serverUrl, connected, onImported }: ImportPanelProps) {
  const [tokens, setTokens] = useState<ImportToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSet, setTargetSet] = useState('imported');
  const [sets, setSets] = useState<string[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<'variables' | 'styles' | null>(null);

  // Fetch available sets
  useEffect(() => {
    if (!connected) return;
    fetch(`${serverUrl}/api/sets`)
      .then(res => res.json())
      .then(data => setSets(data.sets || []))
      .catch(() => {});
  }, [serverUrl, connected]);

  // Listen for messages from sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'variables-read') {
        setTokens(msg.tokens || []);
        setSelectedTokens(new Set((msg.tokens || []).map((t: ImportToken) => t.path)));
        setLoading(false);
      }
      if (msg.type === 'styles-read') {
        setTokens(msg.tokens || []);
        setSelectedTokens(new Set((msg.tokens || []).map((t: ImportToken) => t.path)));
        setLoading(false);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleReadVariables = () => {
    setSource('variables');
    setLoading(true);
    setTokens([]);
    setError(null);
    parent.postMessage({ pluginMessage: { type: 'read-variables' } }, '*');
  };

  const handleReadStyles = () => {
    setSource('styles');
    setLoading(true);
    setTokens([]);
    setError(null);
    parent.postMessage({ pluginMessage: { type: 'read-styles' } }, '*');
  };

  const toggleToken = (path: string) => {
    setSelectedTokens(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTokens.size === tokens.length) {
      setSelectedTokens(new Set());
    } else {
      setSelectedTokens(new Set(tokens.map(t => t.path)));
    }
  };

  const handleImport = async () => {
    if (!connected || selectedTokens.size === 0) return;
    setImporting(true);
    setError(null);

    try {
      const tokensToImport = tokens.filter(t => selectedTokens.has(t.path));

      // Ensure the set exists
      await fetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: targetSet }),
      });

      // Create each token individually
      let imported = 0;
      for (const token of tokensToImport) {
        const res = await fetch(`${serverUrl}/api/tokens/${targetSet}/${token.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: token.$type, $value: token.$value }),
        });
        // 409 means token already exists — update instead
        if (res.status === 409) {
          await fetch(`${serverUrl}/api/tokens/${targetSet}/${token.path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: token.$type, $value: token.$value }),
          });
        }
        imported++;
      }

      parent.postMessage({ pluginMessage: { type: 'notify', message: `Imported ${imported} tokens to "${targetSet}"` } }, '*');
      onImported();
      setTokens([]);
      setSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setImporting(false);
    }
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to import tokens
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
            {error}
          </div>
        )}

        {/* Source selection */}
        {tokens.length === 0 && !loading && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1">
              Import Source
            </div>
            <button
              onClick={handleReadVariables}
              className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="w-8 h-8 rounded bg-[var(--color-figma-accent)]/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Figma Variables</div>
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Read all local variable collections</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
            <button
              onClick={handleReadStyles}
              className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <div className="w-8 h-8 rounded bg-[#9b59b6]/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9b59b6" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Figma Styles</div>
                <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Read paint, text, and effect styles</div>
              </div>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8 text-[var(--color-figma-text-secondary)] text-[11px]">
            Reading from Figma...
          </div>
        )}

        {/* Preview */}
        {tokens.length > 0 && !loading && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                Preview ({selectedTokens.size}/{tokens.length} selected)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={toggleAll}
                  className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                >
                  {selectedTokens.size === tokens.length ? 'Deselect all' : 'Select all'}
                </button>
                <button
                  onClick={() => { setTokens([]); setSource(null); }}
                  className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline"
                >
                  Back
                </button>
              </div>
            </div>

            {/* Target set */}
            <div>
              <div className="text-[9px] text-[var(--color-figma-text-secondary)] mb-1">Target token set</div>
              <div className="flex gap-2">
                <select
                  value={sets.includes(targetSet) ? targetSet : '__new__'}
                  onChange={e => {
                    if (e.target.value === '__new__') {
                      const name = prompt('New set name:');
                      if (name) setTargetSet(name);
                    } else {
                      setTargetSet(e.target.value);
                    }
                  }}
                  className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none"
                >
                  {sets.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  {!sets.includes(targetSet) && targetSet && (
                    <option value={targetSet}>{targetSet} (new)</option>
                  )}
                  <option value="__new__">+ New set...</option>
                </select>
              </div>
            </div>

            {/* Token list */}
            <div className="rounded border border-[var(--color-figma-border)] overflow-hidden divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
              {tokens.map(token => (
                <label
                  key={token.path}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    selectedTokens.has(token.path) ? 'bg-[var(--color-figma-accent)]/5' : 'hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTokens.has(token.path)}
                    onChange={() => toggleToken(token.path)}
                    className="accent-[var(--color-figma-accent)]"
                  />
                  {token.$type === 'color' && typeof token.$value === 'string' && (
                    <div
                      className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                      style={{ backgroundColor: token.$value }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[var(--color-figma-text)] truncate">{token.path}</div>
                  </div>
                  <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase shrink-0 token-type-${token.$type}`}>
                    {token.$type}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Import button */}
      {tokens.length > 0 && !loading && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <button
            onClick={handleImport}
            disabled={selectedTokens.size === 0 || importing}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            {importing
              ? 'Importing...'
              : `Import ${selectedTokens.size} Token${selectedTokens.size !== 1 ? 's' : ''} to "${targetSet}"`}
          </button>
        </div>
      )}
    </div>
  );
}
