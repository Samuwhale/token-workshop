import React, { useState, useEffect, useCallback } from 'react';
import { ConfirmModal } from './ConfirmModal';

interface Theme {
  name: string;
  sets: Record<string, 'enabled' | 'disabled' | 'source'>;
}

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
}

export function ThemeManager({ serverUrl, connected }: ThemeManagerProps) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchThemes = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    try {
      const [themesRes, setsRes] = await Promise.all([
        fetch(`${serverUrl}/api/themes`),
        fetch(`${serverUrl}/api/sets`),
      ]);
      const themesData = await themesRes.json();
      const setsData = await setsRes.json();
      setThemes(themesData.themes || []);
      setSets(setsData.sets || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  const handleCreate = async () => {
    if (!newThemeName || !connected) return;
    try {
      const defaultSets: Record<string, string> = {};
      sets.forEach(s => { defaultSets[s] = 'disabled'; });
      await fetch(`${serverUrl}/api/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newThemeName, sets: defaultSets }),
      });
      setNewThemeName('');
      setShowCreate(false);
      fetchThemes();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = (name: string) => {
    setDeleteConfirm(name);
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const name = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await fetch(`${serverUrl}/api/themes/${encodeURIComponent(name)}`, { method: 'DELETE' });
      fetchThemes();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleToggleSet = async (themeName: string, setName: string, currentState: string) => {
    const states: string[] = ['disabled', 'enabled', 'source'];
    const nextIndex = (states.indexOf(currentState) + 1) % states.length;
    const nextState = states[nextIndex];

    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;

    const updatedSets = { ...theme.sets, [setName]: nextState };
    try {
      await fetch(`${serverUrl}/api/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: themeName, sets: updatedSets }),
      });
      fetchThemes();
    } catch (err) {
      setError(String(err));
    }
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to manage themes
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Loading themes...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {themes.length === 0 && !showCreate ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--color-figma-text-secondary)]">
            <p className="text-[12px]">No themes configured</p>
            <p className="text-[10px] mt-1">Themes control which token sets are active</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {themes.map(theme => (
              <div key={theme.name} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                {/* Theme header */}
                <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[11px] font-medium">{theme.name}</span>
                  <button
                    onClick={() => handleDelete(theme.name)}
                    className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] text-[10px]"
                    title="Delete theme"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>

                {/* Token set matrix */}
                <div className="divide-y divide-[var(--color-figma-border)]">
                  {sets.map(setName => {
                    const state = theme.sets[setName] || 'disabled';
                    return (
                      <div
                        key={setName}
                        className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] cursor-pointer"
                        onClick={() => handleToggleSet(theme.name, setName, state)}
                      >
                        <span className="text-[11px] text-[var(--color-figma-text)]">{setName}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          state === 'source'
                            ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]'
                            : state === 'enabled'
                            ? 'bg-[var(--color-figma-success)]/20 text-[var(--color-figma-success)]'
                            : 'bg-[var(--color-figma-border)]/30 text-[var(--color-figma-text-secondary)]'
                        }`}>
                          {state}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create theme */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        {showCreate ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newThemeName}
              onChange={e => setNewThemeName(e.target.value)}
              placeholder="Theme name (e.g. light, dark)"
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newThemeName}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewThemeName(''); }}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
          >
            + New Theme
          </button>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title={`Delete theme "${deleteConfirm}"?`}
          description="This will permanently remove the theme configuration."
          confirmLabel="Delete"
          danger
          onConfirm={executeDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
