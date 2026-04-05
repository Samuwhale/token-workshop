import { useState, useEffect, useCallback, useRef } from 'react';
import { STORAGE_KEYS, STORAGE_PREFIXES, lsGet, lsSet, lsGetJson, lsSetJson } from '../shared/storage';
import { apiFetch } from '../shared/apiFetch';
import { PLATFORMS } from '../shared/platforms';
import { useLintConfig } from '../hooks/useLintConfig';
import { LintConfigPanel } from './LintConfigPanel';
import { formatHexAs } from '../shared/colorUtils';
import { dispatchToast } from '../shared/toastBus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Density = 'compact' | 'default' | 'comfortable';
type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'oklch' | 'p3';
export type PreferredCopyFormat = 'css-var' | 'dtcg-ref' | 'scss' | 'raw' | 'json';
type SettingsTab = 'appearance' | 'connection' | 'export' | 'advanced';

// ---------------------------------------------------------------------------
// Settings tab config and search metadata
// ---------------------------------------------------------------------------

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'connection', label: 'Connection' },
  { id: 'export', label: 'Export' },
  { id: 'advanced', label: 'Advanced' },
];

const SECTION_SEARCH_META: { id: string; tab: SettingsTab; title: string; keywords: string[] }[] = [
  { id: 'ui-prefs', tab: 'appearance', title: 'UI Preferences', keywords: ['density', 'compact', 'comfortable', 'color', 'format', 'hex', 'rgb', 'hsl', 'oklch', 'p3', 'copy', 'advanced', 'contrast', 'deprecated', 'display', 'appearance', 'theme'] },
  { id: 'connection', tab: 'connection', title: 'Server Connection', keywords: ['server', 'url', 'connect', 'localhost', 'port', 'disconnect', 'network'] },
  { id: 'export-defaults', tab: 'export', title: 'Export Defaults', keywords: ['platform', 'css', 'selector', 'tailwind', 'scss', 'json', 'export', 'root', 'format'] },
  { id: 'validation', tab: 'export', title: 'Validation', keywords: ['lint', 'rules', 'validate', 'check', 'errors', 'warnings', 'config'] },
  { id: 'guided-setup', tab: 'advanced', title: 'Guided Setup', keywords: ['guided', 'setup', 'onboarding', 'wizard', 'welcome', 'restart', 'first run', 'quickstart'] },
  { id: 'undo', tab: 'advanced', title: 'Undo History', keywords: ['undo', 'history', 'steps', 'max', 'redo'] },
  { id: 'backup', tab: 'advanced', title: 'Backup & Restore', keywords: ['backup', 'restore', 'import', 'export', 'json', 'file', 'transfer'] },
  { id: 'danger', tab: 'advanced', title: 'Danger Zone', keywords: ['clear', 'delete', 'reset', 'danger', 'data', 'remove'] },
];

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

function Section({ title, children, defaultOpen = true, danger = false, tabBadge }: { title: string; children: React.ReactNode; defaultOpen?: boolean; danger?: boolean; tabBadge?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded border overflow-hidden ${danger ? 'border-[var(--color-figma-error)] opacity-80' : 'border-[var(--color-figma-border)]'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] ${danger ? 'text-[var(--color-figma-error)]' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium uppercase tracking-wide ${danger ? '' : 'text-[var(--color-figma-text-secondary)]'}`}>{title}</span>
          {tabBadge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-medium uppercase tracking-wide">
              {tabBadge}
            </span>
          )}
        </div>
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
  // Guided setup
  onRestartGuidedSetup: () => void;
  // Close
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Import diff helpers
// ---------------------------------------------------------------------------

type ImportDiffEntry = { key: string; label: string; oldValue: string | null; newValue: string; status: 'added' | 'changed' };

/** Exact localStorage keys that are allowed to be imported. */
const IMPORTABLE_EXACT_KEYS = new Set<string>([
  STORAGE_KEYS.DENSITY,
  STORAGE_KEYS.COLOR_FORMAT,
  STORAGE_KEYS.PREFERRED_COPY_FORMAT,
  STORAGE_KEYS.ADVANCED_MODE,
  STORAGE_KEYS.CONTRAST_BG,
  STORAGE_KEYS.HIDE_DEPRECATED,
  STORAGE_KEYS.SERVER_URL,
  STORAGE_KEYS.EXPORT_PLATFORMS,
  STORAGE_KEYS.EXPORT_CSS_SELECTOR,
  STORAGE_KEYS.EXPORT_ZIP_FILENAME,
  STORAGE_KEYS.EXPORT_NEST_PLATFORM,
  STORAGE_KEYS.EXPORT_PATH_PREFIX,
  STORAGE_KEYS.EXPORT_TYPES,
  STORAGE_KEYS.EXPORT_CHANGES_ONLY,
  STORAGE_KEYS.EXPORT_PRESETS,
  STORAGE_KEYS.UNDO_MAX_HISTORY,
]);

/** Returns true only for keys that the export produces and safe to import. */
function isAllowedImportKey(key: string): boolean {
  if (IMPORTABLE_EXACT_KEYS.has(key)) return true;
  if (key.startsWith(STORAGE_PREFIXES.TOKEN_SORT)) return true;
  if (key.startsWith(STORAGE_PREFIXES.TOKEN_TYPE_FILTER)) return true;
  if (key.startsWith('tm_pinned:')) return true;
  if (key.startsWith('tm_view-mode:')) return true;
  return false;
}

const IMPORT_KEY_LABELS: Record<string, string> = {
  [STORAGE_KEYS.DENSITY]:              'UI density',
  [STORAGE_KEYS.COLOR_FORMAT]:         'Color format',
  [STORAGE_KEYS.PREFERRED_COPY_FORMAT]: 'Preferred copy format',
  [STORAGE_KEYS.ADVANCED_MODE]:        'Advanced mode',
  [STORAGE_KEYS.CONTRAST_BG]:          'Contrast background',
  [STORAGE_KEYS.HIDE_DEPRECATED]:      'Hide deprecated tokens',
  [STORAGE_KEYS.SERVER_URL]:           'Server URL',
  [STORAGE_KEYS.EXPORT_PLATFORMS]:     'Export platforms',
  [STORAGE_KEYS.EXPORT_CSS_SELECTOR]:  'CSS selector',
  [STORAGE_KEYS.EXPORT_ZIP_FILENAME]:  'ZIP filename',
  [STORAGE_KEYS.EXPORT_NEST_PLATFORM]: 'Nest by platform',
  [STORAGE_KEYS.EXPORT_PATH_PREFIX]:   'Export path prefix',
  [STORAGE_KEYS.EXPORT_TYPES]:         'Export token types',
  [STORAGE_KEYS.EXPORT_CHANGES_ONLY]:  'Export changes only',
  [STORAGE_KEYS.EXPORT_PRESETS]:       'Export presets',
  [STORAGE_KEYS.UNDO_MAX_HISTORY]:     'Max undo steps',
};

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
  onRestartGuidedSetup,
  onClose,
}: SettingsPanelProps) {
  // ---- Lint / Validation config ----
  const { config: lintConfig, saving: lintSaving, updateRule: lintUpdateRule, applyConfig: lintApplyConfig, resetToDefaults: lintResetDefaults } = useLintConfig(serverUrl, connected);

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
  const [preferredCopyFormat, setPreferredCopyFormat] = useState<PreferredCopyFormat>(() => {
    const saved = lsGet(STORAGE_KEYS.PREFERRED_COPY_FORMAT);
    if (saved === 'dtcg-ref' || saved === 'scss' || saved === 'raw' || saved === 'json') return saved as PreferredCopyFormat;
    return 'css-var';
  });
  const [contrastBg, setContrastBg] = useState<string>(() => lsGet(STORAGE_KEYS.CONTRAST_BG, ''));
  const [hideDeprecated, setHideDeprecated] = useState<boolean>(() => lsGet(STORAGE_KEYS.HIDE_DEPRECATED) === 'true');

  // ---- Tab navigation & search ----
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const saved = lsGet(STORAGE_KEYS.SETTINGS_ACTIVE_TAB);
    return (saved === 'appearance' || saved === 'connection' || saved === 'export' || saved === 'advanced') ? saved : 'appearance';
  });
  const [searchQuery, setSearchQuery] = useState('');

  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    lsSet(STORAGE_KEYS.SETTINGS_ACTIVE_TAB, tab);
  }, []);

  /** Returns true when the section should be visible given search query or active tab. */
  const showSection = useCallback((id: string): boolean => {
    const q = searchQuery.toLowerCase().trim();
    const meta = SECTION_SEARCH_META.find(s => s.id === id);
    if (!meta) return false;
    if (!q) return meta.tab === activeTab;
    return meta.title.toLowerCase().includes(q) || meta.keywords.some(k => k.includes(q));
  }, [searchQuery, activeTab]);

  const matchingSections = searchQuery.trim()
    ? SECTION_SEARCH_META.filter(s => showSection(s.id))
    : [];

  // ---- Backup & Restore ----
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Pending import diff — set after parsing file, cleared on apply/cancel
  const [pendingImport, setPendingImport] = useState<{ data: Record<string, string>; diff: ImportDiffEntry[] } | null>(null);
  // Two-step confirmation: first click reveals warning, second click applies
  const [confirmingReload, setConfirmingReload] = useState(false);

  const handleExportSettings = useCallback(() => {
    // Keys that represent user-configurable preferences (not navigation or ephemeral state)
    const preferenceKeys: string[] = [
      STORAGE_KEYS.DENSITY,
      STORAGE_KEYS.COLOR_FORMAT,
      STORAGE_KEYS.PREFERRED_COPY_FORMAT,
      STORAGE_KEYS.ADVANCED_MODE,
      STORAGE_KEYS.CONTRAST_BG,
      STORAGE_KEYS.HIDE_DEPRECATED,
      STORAGE_KEYS.SERVER_URL,
      STORAGE_KEYS.EXPORT_PLATFORMS,
      STORAGE_KEYS.EXPORT_CSS_SELECTOR,
      STORAGE_KEYS.EXPORT_ZIP_FILENAME,
      STORAGE_KEYS.EXPORT_NEST_PLATFORM,
      STORAGE_KEYS.EXPORT_PATH_PREFIX,
      STORAGE_KEYS.EXPORT_TYPES,
      STORAGE_KEYS.EXPORT_CHANGES_ONLY,
      STORAGE_KEYS.EXPORT_PRESETS,
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
          k.startsWith('tm_pinned:') ||
          k.startsWith('tm_view-mode:')
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
    dispatchToast('Settings exported — tokenmanager-settings.json downloaded', 'success');
  }, []);

  const handleImportFile = useCallback((file: File) => {
    setImportError(null);
    setImportSuccess(false);
    setPendingImport(null);
    setImportLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImportLoading(false);
      try {
        const raw = e.target?.result;
        if (typeof raw !== 'string') throw new Error('Could not read file');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Invalid settings file: expected a JSON object');
        }
        // Collect valid (non-metadata, string-valued, whitelisted) entries
        const data: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (key.startsWith('_')) continue;
          if (typeof value !== 'string') continue;
          if (!isAllowedImportKey(key)) continue;
          data[key] = value;
        }
        if (Object.keys(data).length === 0) throw new Error('No settings found in file');

        // Build diff: only entries that differ from current localStorage
        const diff: ImportDiffEntry[] = [];
        for (const [key, newValue] of Object.entries(data)) {
          const oldValue = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
          if (oldValue === newValue) continue; // unchanged
          let label = IMPORT_KEY_LABELS[key];
          if (!label) {
            if (key.startsWith(STORAGE_PREFIXES.TOKEN_SORT)) label = `Sort: ${key.slice(STORAGE_PREFIXES.TOKEN_SORT.length)}`;
            else if (key.startsWith(STORAGE_PREFIXES.TOKEN_TYPE_FILTER)) label = `Filter: ${key.slice(STORAGE_PREFIXES.TOKEN_TYPE_FILTER.length)}`;
            else if (key.startsWith('tm_pinned:')) label = `Pinned: ${key.slice('tm_pinned:'.length)}`;
            else if (key.startsWith('tm_view-mode:')) label = `View mode: ${key.slice('tm_view-mode:'.length)}`;
            else label = key;
          }
          // For presets, show a human-friendly count instead of raw JSON
          let displayOld = oldValue;
          let displayNew = newValue;
          if (key === STORAGE_KEYS.EXPORT_PRESETS) {
            const summarize = (v: string | null) => {
              if (v === null) return null;
              try { const arr = JSON.parse(v); return Array.isArray(arr) ? `${arr.length} preset${arr.length !== 1 ? 's' : ''}` : v; } catch { return v; }
            };
            displayOld = summarize(oldValue);
            displayNew = summarize(newValue) ?? newValue;
          }
          diff.push({ key, label, oldValue: displayOld, newValue: displayNew, status: oldValue === null ? 'added' : 'changed' });
        }

        if (diff.length === 0) {
          setImportError('No changes — the imported settings match your current configuration.');
          return;
        }
        setPendingImport({ data, diff });
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to import settings');
      }
    };
    reader.onerror = () => { setImportLoading(false); setImportError('Failed to read file'); };
    reader.readAsText(file);
  }, []);

  const handleApplyImport = useCallback(() => {
    if (!pendingImport) return;
    if (!confirmingReload) {
      // First click: show the warning and ask user to confirm
      setConfirmingReload(true);
      return;
    }
    // Second click: confirmed — apply and reload
    let applied = 0;
    for (const [key, value] of Object.entries(pendingImport.data)) {
      if (!isAllowedImportKey(key)) continue; // defense-in-depth: skip any non-whitelisted keys
      try { localStorage.setItem(key, value); applied++; } catch { /* quota */ }
    }
    if (applied === 0) { setImportError('Failed to write settings'); setConfirmingReload(false); return; }
    setPendingImport(null);
    setImportSuccess(true);
    dispatchToast(`Settings imported — ${applied} setting${applied !== 1 ? 's' : ''} applied`, 'success');
    setTimeout(() => { window.location.reload(); }, 800);
  }, [pendingImport, confirmingReload]);

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

  const handlePreferredCopyFormatChange = (f: PreferredCopyFormat) => {
    setPreferredCopyFormat(f);
    lsSet(STORAGE_KEYS.PREFERRED_COPY_FORMAT, f);
    dispatchSettingsChanged(STORAGE_KEYS.PREFERRED_COPY_FORMAT);
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

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="relative">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)] pointer-events-none" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="w-full pl-7 pr-6 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] placeholder:text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab bar — hidden when searching */}
      {!searchQuery && (
        <div className="flex border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]" role="tablist" aria-label="Settings categories">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-[var(--color-figma-accent)] shadow-[inset_0_-2px_0_var(--color-figma-accent)]'
                  : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">

          {/* Search empty state */}
          {searchQuery && matchingSections.length === 0 && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center py-4">
              No settings match &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {/* ---- UI Preferences ---- */}
          {showSection('ui-prefs') && <Section title="UI Preferences" tabBadge={searchQuery ? 'Appearance' : undefined}>
            {/* Density */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-figma-text)]">Density</span>
                  {density !== 'default' && (
                    <button
                      onClick={() => handleDensityChange('default')}
                      className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-figma-text)]">Color format</span>
                  {colorFormat !== 'hex' && (
                    <button
                      onClick={() => handleColorFormatChange('hex')}
                      className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
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
            {/* Sample output preview */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-tertiary,var(--color-figma-bg-secondary))] border border-[var(--color-figma-border)]">
              <div className="w-3 h-3 rounded-sm flex-shrink-0 border border-[var(--color-figma-border)]" style={{ backgroundColor: '#3B82F6' }} />
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-shrink-0">Sample:</span>
              <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate select-all">{formatHexAs('#3B82F6', colorFormat)}</span>
            </div>

            {/* Preferred copy format */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--color-figma-text)]">Preferred copy format</span>
                  {preferredCopyFormat !== 'css-var' && (
                    <button
                      onClick={() => handlePreferredCopyFormatChange('css-var')}
                      className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Format used by ⌘⇧C shortcut</span>
              </div>
              <SegmentedControl
                options={[
                  { value: 'css-var' as PreferredCopyFormat, label: 'CSS' },
                  { value: 'dtcg-ref' as PreferredCopyFormat, label: '{ref}' },
                  { value: 'scss' as PreferredCopyFormat, label: '$scss' },
                  { value: 'raw' as PreferredCopyFormat, label: 'Value' },
                  { value: 'json' as PreferredCopyFormat, label: 'DTCG' },
                ]}
                value={preferredCopyFormat}
                onChange={handlePreferredCopyFormatChange}
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
                  className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] font-mono"
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
          </Section>}

          {/* ---- Server Connection ---- */}
          {showSection('connection') && <Section title="Server Connection" tabBadge={searchQuery ? 'Connection' : undefined}>
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
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
            />
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Run <span className="font-mono">npm start</span> in the TokenManager directory, then press Enter or click Connect.
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
                <ul className="text-[var(--color-figma-text-secondary)] leading-relaxed list-disc list-inside space-y-0.5">
                  <li>Run <span className="font-mono">npm start</span> in the TokenManager directory</li>
                  <li>Check the URL matches your server (default: port 9400)</li>
                  <li>Make sure no firewall is blocking localhost</li>
                </ul>
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
                {checking ? 'Connecting\u2026' : 'Connect'}
              </button>
            </div>
          </Section>}

          {/* ---- Export Defaults ---- */}
          {showSection('export-defaults') && <Section title="Export Defaults" defaultOpen={true} tabBadge={searchQuery ? 'Export' : undefined}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--color-figma-text)]">Default platforms</span>
                {!(exportPlatforms.size === 1 && exportPlatforms.has('css')) && (
                  <button
                    onClick={() => {
                      const defaultPlatforms = new Set(['css']);
                      setExportPlatforms(defaultPlatforms);
                      lsSetJson(STORAGE_KEYS.EXPORT_PLATFORMS, ['css']);
                    }}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                  >
                    Reset to default
                  </button>
                )}
              </div>
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
                className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] font-mono"
              />
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
                CSS selector wrapping exported custom properties (default: <code className="font-mono">:root</code>).
              </p>
            </div>
          </Section>}

          {/* ---- Guided Setup ---- */}
          {showSection('guided-setup') && <Section title="Guided Setup" defaultOpen={false} tabBadge={searchQuery ? 'Advanced' : undefined}>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Re-run the guided setup wizard to connect to the local server, create your first token set, and map semantic tokens.
            </p>
            <button
              onClick={onRestartGuidedSetup}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              Restart guided setup
            </button>
          </Section>}

          {/* ---- Undo History ---- */}
          {showSection('undo') && <Section title="Undo History" defaultOpen={true} tabBadge={searchQuery ? 'Advanced' : undefined}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] block">Max undo steps</span>
                {undoMaxHistory !== 20 && (
                  <button
                    onClick={() => { setUndoMaxHistory(20); lsSetJson(STORAGE_KEYS.UNDO_MAX_HISTORY, 20); }}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                  >
                    Reset to 20
                  </button>
                )}
              </div>
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
                className="w-16 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] text-right focus-visible:border-[var(--color-figma-accent)]"
              />
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Number of undo actions to keep in history (1–200). Default is 20.
            </p>
          </Section>}

          {/* ---- Backup & Restore ---- */}
          {showSection('backup') && <Section title="Backup & Restore" defaultOpen={false} tabBadge={searchQuery ? 'Advanced' : undefined}>
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
                disabled={importLoading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {importLoading ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden="true">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                )}
                {importLoading ? 'Parsing…' : 'Import settings'}
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
            {pendingImport && (
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                <div className="flex items-center justify-between px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    Preview changes ({pendingImport.diff.length} setting{pendingImport.diff.length !== 1 ? 's' : ''})
                  </span>
                  <button
                    onClick={() => { setPendingImport(null); setConfirmingReload(false); }}
                    className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                    aria-label="Dismiss preview"
                  >
                    ✕
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                  {pendingImport.diff.map(entry => (
                    <div key={entry.key} className="px-2 py-1.5 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-medium px-1 rounded ${entry.status === 'added' ? 'bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]' : 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'}`}>
                          {entry.status === 'added' ? 'NEW' : 'CHANGED'}
                        </span>
                        <span className="text-[10px] text-[var(--color-figma-text)] font-medium truncate">{entry.label}</span>
                      </div>
                      {entry.status === 'changed' && entry.oldValue !== null && (
                        <span className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono truncate pl-0.5">
                          <span className="text-[var(--color-figma-error)]">−</span> {entry.oldValue}
                        </span>
                      )}
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono truncate pl-0.5">
                        <span className="text-[var(--color-figma-success)]">+</span> {entry.newValue}
                      </span>
                    </div>
                  ))}
                </div>
                {confirmingReload && (
                  <div className="px-2 py-2 border-t border-[var(--color-figma-border)] bg-[#FFF3CD]/30 dark:bg-amber-900/20 flex items-start gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px text-amber-500" aria-hidden="true">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
                      The plugin will reload immediately. Any unsaved token edits, in-progress theme changes, or expanded panel state will be lost.
                    </p>
                  </div>
                )}
                <div className="flex gap-2 p-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                  <button
                    onClick={() => { if (confirmingReload) { setConfirmingReload(false); } else { setPendingImport(null); } }}
                    className="flex-1 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    {confirmingReload ? 'Back' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleApplyImport}
                    className={`flex-1 px-3 py-1.5 rounded text-white text-[11px] font-medium transition-colors ${confirmingReload ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent-hover)]'}`}
                  >
                    {confirmingReload ? 'Confirm & reload' : 'Apply & reload'}
                  </button>
                </div>
              </div>
            )}
          </Section>}

          {/* ---- Validation ---- */}
          {showSection('validation') && <Section title="Validation" defaultOpen={false} tabBadge={searchQuery ? 'Export' : undefined}>
            {!connected ? (
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Connect to the local server to configure lint rules.
              </p>
            ) : !lintConfig ? (
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] animate-pulse">Loading lint config…</p>
            ) : (
              <LintConfigPanel
                config={lintConfig}
                saving={lintSaving}
                onUpdateRule={lintUpdateRule}
                onApplyConfig={lintApplyConfig}
                onReset={lintResetDefaults}
                onLintRefresh={() => {}}
              />
            )}
          </Section>}

          {/* ---- Danger Zone ---- */}
          {showSection('danger') && <Section title="Danger Zone" defaultOpen={false} danger tabBadge={searchQuery ? 'Advanced' : undefined}>
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
          </Section>}

        </div>
      </div>
    </>
  );
}
