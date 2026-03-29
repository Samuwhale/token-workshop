import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS, STORAGE_PREFIXES, lsGet, lsSet, lsGetJson, lsSetJson } from '../shared/storage';
import { apiFetch } from '../shared/apiFetch';
import { PLATFORMS } from '../shared/platforms';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Density = 'compact' | 'default' | 'comfortable';
type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'oklch' | 'p3';

// ---------------------------------------------------------------------------
// Custom event for cross-component settings sync
// ---------------------------------------------------------------------------

/** Dispatch when a setting changes so other components can re-read from localStorage. */
export function dispatchSettingsChanged(key: string): void {
  window.dispatchEvent(new CustomEvent('tm-settings-changed', { detail: { key } }));
}

/** Hook to listen for settings changes on a specific key. Returns a counter that increments on each change. */
export function useSettingsListener(key: string): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === key) setRev(n => n + 1);
    };
    window.addEventListener('tm-settings-changed', handler);
    return () => window.removeEventListener('tm-settings-changed', handler);
  }, [key]);
  return rev;
}


// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

function Section({ title, children, defaultOpen = true, danger = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean; danger?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded border overflow-hidden ${danger ? 'border-[var(--color-figma-error)] opacity-80' : 'border-[var(--color-figma-border)]'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] ${danger ? 'text-[var(--color-figma-error)]' : ''}`}
      >
        <span className={`text-[10px] font-medium uppercase tracking-wide ${danger ? '' : 'text-[var(--color-figma-text-secondary)]'}`}>{title}</span>
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
          className={`text-[var(--color-figma-text-secondary)] transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      {open && <div className="p-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative shrink-0 w-7 h-4 rounded-full transition-colors ${checked ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-3' : ''}`} />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-[var(--color-figma-text)] block">{label}</span>
        {description && <span className="text-[10px] text-[var(--color-figma-text-secondary)] block leading-relaxed">{description}</span>}
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded border border-[var(--color-figma-border)] overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-1 text-[10px] font-medium transition-colors ${
            value === opt.value
              ? 'bg-[var(--color-figma-accent)] text-white'
              : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SettingsPanelProps {
  // Server connection
  serverUrl: string;
  connected: boolean;
  checking: boolean;
  serverUrlInput: string;
  setServerUrlInput: (v: string) => void;
  connectResult: 'ok' | 'fail' | null;
  setConnectResult: (v: 'ok' | 'fail' | null) => void;
  updateServerUrlAndConnect: (url: string) => Promise<boolean>;
  // Advanced mode
  advancedModeOverride: boolean;
  setAdvancedModeOverride: (v: boolean) => void;
  // Undo
  undoMaxHistory: number;
  setUndoMaxHistory: (v: number) => void;
  // Danger zone
  showClearConfirm: boolean;
  setShowClearConfirm: (v: boolean) => void;
  clearConfirmText: string;
  setClearConfirmText: (v: string) => void;
  onClearAll: () => void;
  clearing: boolean;
  // Close
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsPanel({
  serverUrl,
  connected,
  checking,
  serverUrlInput,
  setServerUrlInput,
  connectResult,
  setConnectResult,
  updateServerUrlAndConnect,
  advancedModeOverride,
  setAdvancedModeOverride,
  undoMaxHistory,
  setUndoMaxHistory,
  showClearConfirm,
  setShowClearConfirm,
  clearConfirmText,
  setClearConfirmText,
  onClearAll,
  clearing,
  onClose,
}: SettingsPanelProps) {
  // ---- UI Preferences (local state from localStorage) ----
  const [density, setDensity] = useState<Density>(() => {
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    return (stored === 'compact' || stored === 'comfortable') ? stored : 'default';
  });
  const [colorFormat, setColorFormat] = useState<ColorFormat>(() => {
    const saved = lsGet(STORAGE_KEYS.COLOR_FORMAT);
    if (saved === 'rgb' || saved === 'hsl' || saved === 'oklch' || saved === 'p3') return saved;
    return 'hex';
  });
  const [contrastBg, setContrastBg] = useState<string>(() => lsGet(STORAGE_KEYS.CONTRAST_BG, ''));
  const [hideDeprecated, setHideDeprecated] = useState<boolean>(() => lsGet(STORAGE_KEYS.HIDE_DEPRECATED) === 'true');

  // ---- Backup & Restore ----
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const handleExportSettings = useCallback(() => {
    // Keys that represent user-configurable preferences (not navigation or ephemeral state)
    const preferenceKeys: string[] = [
      STORAGE_KEYS.DENSITY,
      STORAGE_KEYS.COLOR_FORMAT,
      STORAGE_KEYS.ADVANCED_MODE,
      STORAGE_KEYS.CONTRAST_BG,
      STORAGE_KEYS.HIDE_DEPRECATED,
      STORAGE_KEYS.SERVER_URL,
      STORAGE_KEYS.EXPORT_PLATFORMS,
      STORAGE_KEYS.EXPORT_CSS_SELECTOR,
      STORAGE_KEYS.EXPORT_ZIP_FILENAME,
      STORAGE_KEYS.EXPORT_NEST_PLATFORM,
      STORAGE_KEYS.UNDO_MAX_HISTORY,
    ];

    const out: Record<string, string> = {};

    // Fixed preference keys
    for (const key of preferenceKeys) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) out[key] = val;
      } catch { /* ignore */ }
    }

    // Dynamic per-set keys: token-sort:*, token-type-filter:*, tm_pinned:*
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.startsWith(STORAGE_PREFIXES.TOKEN_SORT) ||
          k.startsWith(STORAGE_PREFIXES.TOKEN_TYPE_FILTER) ||
          k.startsWith('tm_pinned:')
        ) {
          const v = localStorage.getItem(k);
          if (v !== null) out[k] = v;
        }
      }
    } catch { /* ignore */ }

    const payload = JSON.stringify({ _schemaVersion: 1, _exportedAt: new Date().toISOString(), ...out }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tokenmanager-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportFile = useCallback((file: File) => {
    setImportError(null);
    setImportSuccess(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target?.result;
        if (typeof raw !== 'string') throw new Error('Could not read file');
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          throw new Error('Invalid settings file: expected a JSON object');
        }
        let applied = 0;
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('_')) continue; // skip metadata fields
          if (typeof value !== 'string') continue; // all localStorage values are strings
          try {
            localStorage.setItem(key, value);
            applied++;
          } catch { /* ignore quota errors */ }
        }
        if (applied === 0) throw new Error('No settings found in file');
        setImportSuccess(true);
        // Reload after a short delay so the success message is visible
        setTimeout(() => { window.location.reload(); }, 800);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to import settings');
      }
    };
    reader.onerror = () => setImportError('Failed to read file');
    reader.readAsText(file);
  }, []);

  // ---- Export defaults (local state from localStorage) ----
  const [exportPlatforms, setExportPlatforms] = useState<Set<string>>(() => {
    const parsed = lsGetJson<string[]>(STORAGE_KEYS.EXPORT_PLATFORMS, []);
    return Array.isArray(parsed) && parsed.length > 0 ? new Set(parsed) : new Set(['css']);
  });
  const [cssSelector, setCssSelector] = useState<string>(() => lsGet(STORAGE_KEYS.EXPORT_CSS_SELECTOR, ':root') ?? ':root');

  // ---- Handlers ----
  const handleDensityChange = (d: Density) => {
    setDensity(d);
    lsSet(STORAGE_KEYS.DENSITY, d);
    dispatchSettingsChanged(STORAGE_KEYS.DENSITY);
  };

  const handleColorFormatChange = (f: ColorFormat) => {
    setColorFormat(f);
    lsSet(STORAGE_KEYS.COLOR_FORMAT, f);
    dispatchSettingsChanged(STORAGE_KEYS.COLOR_FORMAT);
  };

  const handleContrastBgChange = (v: string) => {
    setContrastBg(v);
    lsSet(STORAGE_KEYS.CONTRAST_BG, v);
    dispatchSettingsChanged(STORAGE_KEYS.CONTRAST_BG);
  };

  const handleHideDeprecatedChange = (v: boolean) => {
    setHideDeprecated(v);
    lsSet(STORAGE_KEYS.HIDE_DEPRECATED, v ? 'true' : 'false');
    dispatchSettingsChanged(STORAGE_KEYS.HIDE_DEPRECATED);
  };

  const handleAdvancedModeChange = (v: boolean) => {
    setAdvancedModeOverride(v);
    lsSet(STORAGE_KEYS.ADVANCED_MODE, v ? 'true' : 'false');
  };

  const handleExportPlatformToggle = (platformId: string) => {
    setExportPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platformId)) next.delete(platformId);
      else next.add(platformId);
      lsSetJson(STORAGE_KEYS.EXPORT_PLATFORMS, [...next]);
      return next;
    });
  };

  const handleCssSelectorChange = (v: string) => {
    setCssSelector(v);
    lsSet(STORAGE_KEYS.EXPORT_CSS_SELECTOR, v);
  };

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          aria-label="Back"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 2L3.5 5l3 3"/>
          </svg>
          Back
        </button>
        <span className="text-[10px] font-medium text-[var(--color-figma-text)] ml-1">Settings</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">

          {/* ---- UI Preferences ---- */}
          <Section title="UI Preferences">
            {/* Density */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[var(--color-figma-text)] block">Density</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Row height in token lists</span>
              </div>
              <SegmentedControl
                options={[
                  { value: 'compact' as Density, label: 'Compact' },
                  { value: 'default' as Density, label: 'Default' },
                  { value: 'comfortable' as Density, label: 'Comfy' },
                ]}
                value={density}
                onChange={handleDensityChange}
              />
            </div>

            {/* Color format */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[var(--color-figma-text)] block">Color format</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Default display format for color values</span>
              </div>
              <SegmentedControl
                options={[
                  { value: 'hex' as ColorFormat, label: 'HEX' },
                  { value: 'rgb' as ColorFormat, label: 'RGB' },
                  { value: 'hsl' as ColorFormat, label: 'HSL' },
                  { value: 'oklch' as ColorFormat, label: 'OKLCH' },
                  { value: 'p3' as ColorFormat, label: 'P3' },
                ]}
                value={colorFormat}
                onChange={handleColorFormatChange}
              />
            </div>

            {/* Advanced mode */}
            <Toggle
              checked={advancedModeOverride}
              onChange={handleAdvancedModeChange}
              label="Advanced mode"
              description="Always show set tabs and advanced controls, even for small projects"
            />

            {/* Contrast background */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--color-figma-text)]">Contrast background</span>
                {contrastBg && (
                  <button
                    onClick={() => handleContrastBgChange('')}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={contrastBg || '#ffffff'}
                  onChange={e => handleContrastBgChange(e.target.value)}
                  className="w-6 h-6 rounded border border-[var(--color-figma-border)] cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={contrastBg}
                  onChange={e => handleContrastBgChange(e.target.value)}
                  placeholder="e.g. #ffffff"
                  className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono"
                />
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
                Default background color for WCAG contrast ratio checks in color pickers.
              </p>
            </div>

            {/* Hide deprecated */}
            <Toggle
              checked={hideDeprecated}
              onChange={handleHideDeprecatedChange}
              label="Hide deprecated tokens"
              description="Filter out tokens marked as deprecated from the token list"
            />
          </Section>

          {/* ---- Server Connection ---- */}
          <Section title="Server Connection">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Local server URL</label>
              <span className={`flex items-center gap-1 text-[10px] font-medium ${connected ? 'text-[var(--color-figma-success)]' : checking ? 'text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-error)]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${connected ? 'bg-[var(--color-figma-success)]' : checking ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' : 'bg-[var(--color-figma-error)]'}`} />
                {connected ? 'Connected' : checking ? 'Checking\u2026' : 'Disconnected'}
              </span>
            </div>
            <input
              type="text"
              value={serverUrlInput}
              onChange={e => { setServerUrlInput(e.target.value); setConnectResult(null); }}
              onFocus={e => e.target.select()}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  const url = serverUrlInput.trim() || 'http://localhost:9400';
                  const ok = await updateServerUrlAndConnect(url);
                  setConnectResult(ok ? 'ok' : 'fail');
                }
              }}
              placeholder="http://localhost:9400"
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
            />
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Press <kbd className="font-mono bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-0.5">Enter</kbd> to connect, or click Save &amp; Connect below.
            </p>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Run <span className="font-mono">npm start</span> in the TokenManager directory first.
            </p>
            {connectResult === 'ok' && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-success)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
                Connected successfully
              </div>
            )}
            {connectResult === 'fail' && (
              <div className="text-[10px] text-[var(--color-figma-error)]">
                <div className="flex items-center gap-1.5 font-medium mb-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  Cannot reach server
                </div>
                <p className="text-[var(--color-figma-text-secondary)] leading-relaxed">
                  Check the URL above, then make sure the server is running (<span className="font-mono">npm start</span>).
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const defaultUrl = 'http://localhost:9400';
                  setServerUrlInput(defaultUrl);
                  setConnectResult(null);
                  const ok = await updateServerUrlAndConnect(defaultUrl);
                  setConnectResult(ok ? 'ok' : 'fail');
                }}
                disabled={checking}
                title="Reset server URL to http://localhost:9400"
                className="px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Reset to default
              </button>
              <button
                onClick={async () => {
                  const url = serverUrlInput.trim() || 'http://localhost:9400';
                  const ok = await updateServerUrlAndConnect(url);
                  setConnectResult(ok ? 'ok' : 'fail');
                }}
                disabled={checking}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-opacity"
              >
                {checking ? 'Connecting\u2026' : 'Save & Connect'}
              </button>
            </div>
          </Section>

          {/* ---- Export Defaults ---- */}
          <Section title="Export Defaults" defaultOpen={false}>
            <div>
              <span className="text-[11px] text-[var(--color-figma-text)] block mb-1">Default platforms</span>
              <div className="flex flex-wrap gap-1">
                {PLATFORMS.map(platform => (
                  <button
                    key={platform.id}
                    onClick={() => handleExportPlatformToggle(platform.id)}
                    className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                      exportPlatforms.has(platform.id)
                        ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
                        : 'text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)]'
                    }`}
                    title={platform.description}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--color-figma-text)]">CSS selector</span>
                {cssSelector !== ':root' && (
                  <button
                    onClick={() => handleCssSelectorChange(':root')}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                  >
                    Reset to :root
                  </button>
                )}
              </div>
              <input
                type="text"
                value={cssSelector}
                onChange={e => handleCssSelectorChange(e.target.value)}
                placeholder=":root"
                className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono"
              />
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
                CSS selector wrapping exported custom properties (default: <code className="font-mono">:root</code>).
              </p>
            </div>
          </Section>

          {/* ---- Undo History ---- */}
          <Section title="Undo History" defaultOpen={false}>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Max undo steps</span>
              <input
                type="number"
                min={1}
                max={200}
                value={undoMaxHistory}
                onChange={e => {
                  const v = Math.max(1, Math.min(200, Math.round(Number(e.target.value) || 20)));
                  setUndoMaxHistory(v);
                  lsSetJson(STORAGE_KEYS.UNDO_MAX_HISTORY, v);
                }}
                className="w-16 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] text-right outline-none focus:border-[var(--color-figma-accent)]"
              />
            </label>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Number of undo actions to keep in history (1–200). Default is 20.
            </p>
          </Section>

          {/* ---- Backup & Restore ---- */}
          <Section title="Backup & Restore" defaultOpen={false}>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Export your UI preferences, export defaults, server URL, and per-set sort/filter settings to a JSON file.
              Import on another machine or after clearing browser data to restore configuration.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleExportSettings}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                Export settings
              </button>
              <button
                onClick={() => { setImportError(null); setImportSuccess(false); importFileRef.current?.click(); }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
                Import settings
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = '';
                }}
              />
            </div>
            {importSuccess && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-success)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
                Settings imported — reloading…
              </div>
            )}
            {importError && (
              <p className="text-[10px] text-[var(--color-figma-error)]">{importError}</p>
            )}
          </Section>

          {/* ---- Danger Zone ---- */}
          <Section title="Danger Zone" defaultOpen={false} danger>
            {!showClearConfirm ? (
              <>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Permanently deletes all tokens, themes, and sets. This cannot be undone.
                </p>
                <button
                  onClick={() => { setShowClearConfirm(true); setClearConfirmText(''); }}
                  className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-error)] text-[var(--color-figma-error)] text-[11px] font-medium hover:bg-[var(--color-figma-error)] hover:text-white transition-colors"
                >
                  Clear all data\u2026
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Type <span className="font-mono font-bold text-[var(--color-figma-error)]">DELETE</span> to confirm.
                </p>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={e => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                  aria-label="Type DELETE to confirm"
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-error)] text-[var(--color-figma-text)] text-[11px] outline-none font-mono"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowClearConfirm(false); setClearConfirmText(''); }}
                    className="flex-1 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onClearAll}
                    disabled={clearConfirmText !== 'DELETE' || clearing}
                    className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-error)] text-white text-[11px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                  >
                    {clearing ? 'Clearing\u2026' : 'Clear all data'}
                  </button>
                </div>
              </>
            )}
          </Section>

        </div>
      </div>
    </>
  );
}
