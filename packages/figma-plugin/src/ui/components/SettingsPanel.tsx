import { useState, useEffect, useCallback, useRef } from "react";
import {
  STORAGE_KEYS,
  STORAGE_PREFIXES,
  lsGet,
  lsSet,
  lsGetJson,
  lsSetJson,
  lsRemove,
  lsClearByPrefix,
} from "../shared/storage";
import { apiFetch } from "../shared/apiFetch";
import { PLATFORMS } from "../shared/platforms";
import { useLintConfig } from "../hooks/useLintConfig";
import { LintConfigPanel } from "./LintConfigPanel";
import { formatHexAs } from "../shared/colorUtils";
import { dispatchToast } from "../shared/toastBus";
import { shellControlClass } from "../shared/shellControlStyles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Density = "compact" | "comfortable";
type ColorFormat = "hex" | "rgb" | "hsl" | "oklch" | "p3";
export type PreferredCopyFormat =
  | "css-var"
  | "dtcg-ref"
  | "scss"
  | "raw"
  | "json";
type SettingsTab = "preferences" | "advanced";

// ---------------------------------------------------------------------------
// Settings tab config and search metadata
// ---------------------------------------------------------------------------

const SETTINGS_TABS: { id: SettingsTab; label: string; description: string }[] =
  [
    {
      id: "preferences",
      label: "Preferences",
      description:
        "Day-to-day defaults for browsing, viewing, and copying tokens.",
    },
    {
      id: "advanced",
      label: "Advanced",
      description:
        "Setup, recovery, debugging, and destructive controls used only when needed.",
    },
  ];

const SECTION_SEARCH_META: {
  id: string;
  tab: SettingsTab;
  title: string;
  keywords: string[];
}[] = [
  {
    id: "workspace-behavior",
    tab: "preferences",
    title: "Workspace behavior",
    keywords: [
      "preferences",
      "density",
      "compact",
      "comfortable",
      "deprecated",
      "workspace",
      "daily",
      "browse",
      "appearance",
      "visibility",
    ],
  },
  {
    id: "color-copy-defaults",
    tab: "preferences",
    title: "Color and copy defaults",
    keywords: [
      "preferences",
      "color",
      "format",
      "hex",
      "rgb",
      "hsl",
      "oklch",
      "p3",
      "copy",
      "contrast",
      "shortcut",
      "display",
      "clipboard",
    ],
  },
  {
    id: "connection",
    tab: "advanced",
    title: "Local server connection",
    keywords: [
      "advanced",
      "server",
      "url",
      "connect",
      "localhost",
      "port",
      "disconnect",
      "network",
      "sync",
      "api",
      "setup",
      "troubleshoot",
    ],
  },
  {
    id: "export-defaults",
    tab: "advanced",
    title: "Export defaults",
    keywords: [
      "advanced",
      "platform",
      "css",
      "selector",
      "tailwind",
      "scss",
      "json",
      "export",
      "root",
      "format",
      "handoff",
      "setup",
    ],
  },
  {
    id: "validation",
    tab: "advanced",
    title: "Validation rules",
    keywords: [
      "advanced",
      "lint",
      "rules",
      "validate",
      "check",
      "errors",
      "warnings",
      "config",
      "quality",
      "debug",
      "diagnostics",
    ],
  },
  {
    id: "guided-setup",
    tab: "advanced",
    title: "Guided setup",
    keywords: [
      "advanced",
      "guided",
      "setup",
      "onboarding",
      "wizard",
      "welcome",
      "restart",
      "first run",
      "quickstart",
      "recover",
    ],
  },
  {
    id: "undo",
    tab: "advanced",
    title: "Undo history",
    keywords: [
      "advanced",
      "undo",
      "history",
      "steps",
      "max",
      "redo",
      "recovery",
    ],
  },
  {
    id: "backup",
    tab: "advanced",
    title: "Backup and restore",
    keywords: [
      "advanced",
      "backup",
      "restore",
      "import",
      "export",
      "json",
      "file",
      "transfer",
      "recovery",
    ],
  },
  {
    id: "danger",
    tab: "advanced",
    title: "Danger zone",
    keywords: [
      "advanced",
      "clear",
      "delete",
      "reset",
      "danger",
      "data",
      "remove",
      "destructive",
    ],
  },
];

const ADVANCED_SUMMARY_ITEMS = [
  "Local server setup",
  "Export defaults",
  "Validation and diagnostics",
  "Recovery and restart helpers",
  "Destructive reset",
] as const;

// ---------------------------------------------------------------------------
// Custom event for cross-component settings sync
// ---------------------------------------------------------------------------

/** Dispatch when a setting changes so other components can re-read from localStorage. */
export function dispatchSettingsChanged(key: string): void {
  window.dispatchEvent(
    new CustomEvent("tm-settings-changed", { detail: { key } }),
  );
}

/** Hook to listen for settings changes on a specific key. Returns a counter that increments on each change. */
export function useSettingsListener(key: string): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === key) setRev((n) => n + 1);
    };
    window.addEventListener("tm-settings-changed", handler);
    return () => window.removeEventListener("tm-settings-changed", handler);
  }, [key]);
  return rev;
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  defaultOpen = true,
  danger = false,
  tabBadge,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  danger?: boolean;
  tabBadge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded border overflow-hidden ${danger ? "border-[var(--color-figma-error)] opacity-80" : "border-[var(--color-figma-border)]"}`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-left transition-[background-color,color,box-shadow,transform] duration-150 ease-out outline-none hover:bg-[var(--color-figma-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30 active:translate-y-px ${open ? "bg-[var(--color-figma-bg)]" : ""} ${danger ? "text-[var(--color-figma-error)]" : ""}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium uppercase tracking-wide ${danger ? "" : "text-[var(--color-figma-text-secondary)]"}`}
          >
            {title}
          </span>
          {tabBadge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-medium uppercase tracking-wide">
              {tabBadge}
            </span>
          )}
        </div>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="currentColor"
          className={`text-[var(--color-figma-text-secondary)] transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      {open && <div className="p-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function GroupIntro({
  title,
  description,
  note,
  tone = "default",
}: {
  title: string;
  description: string;
  note?: string;
  tone?: "default" | "danger";
}) {
  const isDanger = tone === "danger";
  return (
    <div
      className={`rounded border px-3 py-2.5 ${isDanger ? "border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/5" : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-medium text-[var(--color-figma-text)]">
            {title}
          </h2>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
            {description}
          </p>
        </div>
        {note && (
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${isDanger ? "border-[var(--color-figma-error)]/30 text-[var(--color-figma-error)]" : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]"}`}
          >
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative shrink-0 w-7 h-4 rounded-full transition-colors ${checked ? "bg-[var(--color-figma-accent)]" : "bg-[var(--color-figma-border)]"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? "translate-x-3" : ""}`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-[var(--color-figma-text)] block">
          {label}
        </span>
        {description && (
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] block leading-relaxed">
            {description}
          </span>
        )}
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={shellControlClass({
            active: value === opt.value,
            size: "sm",
            shape: "rounded",
          })}
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
  updateServerUrlAndConnect: (url: string) => Promise<boolean>;
  // Guided setup
  onRestartGuidedSetup: () => void;
  /** Called after deleting workspace data so the caller can navigate + refresh. */
  onClearAllComplete?: () => void;
  // Close
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Import diff helpers
// ---------------------------------------------------------------------------

type ImportDiffEntry = {
  key: string;
  label: string;
  oldValue: string | null;
  newValue: string;
  status: "added" | "changed";
};

/** Exact localStorage keys that are allowed to be imported. */
const IMPORTABLE_EXACT_KEYS = new Set<string>([
  STORAGE_KEYS.DENSITY,
  STORAGE_KEYS.COLOR_FORMAT,
  STORAGE_KEYS.PREFERRED_COPY_FORMAT,
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
  STORAGE_KEYS.TOKEN_STATS_BAR_OPEN,
]);

/** Returns true only for keys that the export produces and safe to import. */
function isAllowedImportKey(key: string): boolean {
  if (IMPORTABLE_EXACT_KEYS.has(key)) return true;
  if (key.startsWith(STORAGE_PREFIXES.TOKEN_SORT)) return true;
  if (key.startsWith(STORAGE_PREFIXES.TOKEN_TYPE_FILTER)) return true;
  if (key.startsWith("tm_pinned:")) return true;
  if (key.startsWith("tm_view-mode:")) return true;
  if (key.startsWith(STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES)) return true;
  return false;
}

const IMPORT_KEY_LABELS: Record<string, string> = {
  [STORAGE_KEYS.DENSITY]: "UI density",
  [STORAGE_KEYS.COLOR_FORMAT]: "Color format",
  [STORAGE_KEYS.PREFERRED_COPY_FORMAT]: "Preferred copy format",
  [STORAGE_KEYS.CONTRAST_BG]: "Contrast background",
  [STORAGE_KEYS.HIDE_DEPRECATED]: "Hide deprecated tokens",
  [STORAGE_KEYS.SERVER_URL]: "Server URL",
  [STORAGE_KEYS.EXPORT_PLATFORMS]: "Export platforms",
  [STORAGE_KEYS.EXPORT_CSS_SELECTOR]: "CSS selector",
  [STORAGE_KEYS.EXPORT_ZIP_FILENAME]: "ZIP filename",
  [STORAGE_KEYS.EXPORT_NEST_PLATFORM]: "Nest by platform",
  [STORAGE_KEYS.EXPORT_PATH_PREFIX]: "Export path prefix",
  [STORAGE_KEYS.EXPORT_TYPES]: "Export token types",
  [STORAGE_KEYS.EXPORT_CHANGES_ONLY]: "Export changes only",
  [STORAGE_KEYS.EXPORT_PRESETS]: "Export presets",
  [STORAGE_KEYS.UNDO_MAX_HISTORY]: "Max undo steps",
  [STORAGE_KEYS.TOKEN_STATS_BAR_OPEN]: "Token stats bar",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SettingsPanel({
  serverUrl,
  connected,
  checking,
  updateServerUrlAndConnect,
  onRestartGuidedSetup,
  onClearAllComplete,
  onClose,
}: SettingsPanelProps) {
  // --- Connection state (owned here, not lifted) ---
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [connectResult, setConnectResult] = useState<"ok" | "fail" | null>(
    null,
  );
  // --- Undo history (owned here; dispatches event so App.tsx re-reads) ---
  const [undoMaxHistory, setUndoMaxHistoryState] = useState(() =>
    lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20),
  );
  const setUndoMaxHistory = (v: number) => {
    setUndoMaxHistoryState(v);
    lsSetJson(STORAGE_KEYS.UNDO_MAX_HISTORY, v);
    dispatchSettingsChanged(STORAGE_KEYS.UNDO_MAX_HISTORY);
  };
  // --- Danger zone state (owned here) ---
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);

  const handleClearAll = async () => {
    if (clearConfirmText !== "DELETE") return;
    setClearing(true);
    try {
      await apiFetch(`${serverUrl}/api/data`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
    } catch (err) {
      console.warn("[SettingsPanel] clear all data request failed:", err);
    }
    for (const key of [
      STORAGE_KEYS.ACTIVE_SET,
      STORAGE_KEYS.ANALYTICS_CANONICAL,
      STORAGE_KEYS.THEME_CARD_ORDER,
      STORAGE_KEYS.IMPORT_TARGET_SET,
      STORAGE_KEYS.ACTIVE_TOP_TAB,
      STORAGE_KEYS.ACTIVE_SUB_TAB_DEFINE,
      STORAGE_KEYS.ACTIVE_SUB_TAB_APPLY,
      STORAGE_KEYS.ACTIVE_SUB_TAB_SHIP,
      STORAGE_KEYS.ACTIVE_RESOLVER,
      STORAGE_KEYS.RESOLVER_INPUT,
    ]) {
      lsRemove(key);
    }
    lsClearByPrefix(
      STORAGE_PREFIXES.TOKEN_SORT,
      STORAGE_PREFIXES.TOKEN_TYPE_FILTER,
    );
    setClearing(false);
    setShowClearConfirm(false);
    setClearConfirmText("");
    onClearAllComplete?.();
  };
  // ---- Lint / Validation config ----
  const {
    config: lintConfig,
    saving: lintSaving,
    updateRule: lintUpdateRule,
    applyConfig: lintApplyConfig,
    resetToDefaults: lintResetDefaults,
  } = useLintConfig(serverUrl, connected);

  // ---- UI Preferences (local state from localStorage) ----
  const [density, setDensity] = useState<Density>(() => {
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    return stored === "compact" ? "compact" : "comfortable";
  });
  const [colorFormat, setColorFormat] = useState<ColorFormat>(() => {
    const saved = lsGet(STORAGE_KEYS.COLOR_FORMAT);
    if (
      saved === "rgb" ||
      saved === "hsl" ||
      saved === "oklch" ||
      saved === "p3"
    )
      return saved;
    return "hex";
  });
  const [preferredCopyFormat, setPreferredCopyFormat] =
    useState<PreferredCopyFormat>(() => {
      const saved = lsGet(STORAGE_KEYS.PREFERRED_COPY_FORMAT);
      if (
        saved === "dtcg-ref" ||
        saved === "scss" ||
        saved === "raw" ||
        saved === "json"
      )
        return saved as PreferredCopyFormat;
      return "css-var";
    });
  const [contrastBg, setContrastBg] = useState<string>(() =>
    lsGet(STORAGE_KEYS.CONTRAST_BG, ""),
  );
  const [hideDeprecated, setHideDeprecated] = useState<boolean>(
    () => lsGet(STORAGE_KEYS.HIDE_DEPRECATED) === "true",
  );

  // ---- Tab navigation & search ----
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const saved = lsGet(STORAGE_KEYS.SETTINGS_ACTIVE_TAB);
    if (
      saved === "advanced" ||
      saved === "advanced-recovery" ||
      saved === "connection" ||
      saved === "export"
    ) {
      return "advanced";
    }
    return "preferences";
  });
  const [searchQuery, setSearchQuery] = useState("");

  const activeTabMeta =
    SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0];

  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    lsSet(STORAGE_KEYS.SETTINGS_ACTIVE_TAB, tab);
  }, []);

  /** Returns true when the section should be visible given search query or active tab. */
  const showSection = useCallback(
    (id: string): boolean => {
      const q = searchQuery.toLowerCase().trim();
      const meta = SECTION_SEARCH_META.find((s) => s.id === id);
      if (!meta) return false;
      if (!q) return meta.tab === activeTab;
      return (
        meta.title.toLowerCase().includes(q) ||
        meta.keywords.some((k) => k.includes(q))
      );
    },
    [searchQuery, activeTab],
  );

  const matchingSections = searchQuery.trim()
    ? SECTION_SEARCH_META.filter((s) => showSection(s.id))
    : [];

  // ---- Backup & Restore ----
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Pending import diff — set after parsing file, cleared on apply/cancel
  const [pendingImport, setPendingImport] = useState<{
    data: Record<string, string>;
    diff: ImportDiffEntry[];
  } | null>(null);

  const handleExportSettings = useCallback(() => {
    // Keys that represent user-configurable preferences (not navigation or ephemeral state)
    const preferenceKeys: string[] = [
      STORAGE_KEYS.DENSITY,
      STORAGE_KEYS.COLOR_FORMAT,
      STORAGE_KEYS.PREFERRED_COPY_FORMAT,
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
      STORAGE_KEYS.TOKEN_STATS_BAR_OPEN,
    ];

    const out: Record<string, string> = {};

    // Fixed preference keys
    for (const key of preferenceKeys) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) out[key] = val;
      } catch {
        /* ignore */
      }
    }

    // Dynamic per-set keys: token-sort:*, token-type-filter:*, tm_pinned:*
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.startsWith(STORAGE_PREFIXES.TOKEN_SORT) ||
          k.startsWith(STORAGE_PREFIXES.TOKEN_TYPE_FILTER) ||
          k.startsWith("tm_pinned:") ||
          k.startsWith("tm_view-mode:") ||
          k.startsWith(STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES)
        ) {
          const v = localStorage.getItem(k);
          if (v !== null) out[k] = v;
        }
      }
    } catch {
      /* ignore */
    }

    const payload = JSON.stringify(
      { _schemaVersion: 1, _exportedAt: new Date().toISOString(), ...out },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tokenmanager-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    dispatchToast(
      "Preferences backup exported — tokenmanager-settings.json downloaded",
      "success",
    );
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
        if (typeof raw !== "string") throw new Error("Could not read file");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("Invalid settings file: expected a JSON object");
        }
        // Collect valid (non-metadata, string-valued, whitelisted) entries
        const data: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (key.startsWith("_")) continue;
          if (typeof value !== "string") continue;
          if (!isAllowedImportKey(key)) continue;
          data[key] = value;
        }
        if (Object.keys(data).length === 0)
          throw new Error("No preferences found in backup file");

        // Build diff: only entries that differ from current localStorage
        const diff: ImportDiffEntry[] = [];
        for (const [key, newValue] of Object.entries(data)) {
          const oldValue = (() => {
            try {
              return localStorage.getItem(key);
            } catch {
              return null;
            }
          })();
          if (oldValue === newValue) continue; // unchanged
          let label = IMPORT_KEY_LABELS[key];
          if (!label) {
            if (key.startsWith(STORAGE_PREFIXES.TOKEN_SORT))
              label = `Sort: ${key.slice(STORAGE_PREFIXES.TOKEN_SORT.length)}`;
            else if (key.startsWith(STORAGE_PREFIXES.TOKEN_TYPE_FILTER))
              label = `Filter: ${key.slice(STORAGE_PREFIXES.TOKEN_TYPE_FILTER.length)}`;
            else if (key.startsWith("tm_pinned:"))
              label = `Pinned: ${key.slice("tm_pinned:".length)}`;
            else if (key.startsWith("tm_view-mode:"))
              label = `View mode: ${key.slice("tm_view-mode:".length)}`;
            else if (
              key.startsWith(STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES)
            )
              label = `Resolved values: ${key.slice(STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES.length)}`;
            else label = key;
          }
          // For presets, show a human-friendly count instead of raw JSON
          let displayOld = oldValue;
          let displayNew = newValue;
          if (key === STORAGE_KEYS.EXPORT_PRESETS) {
            const summarize = (v: string | null) => {
              if (v === null) return null;
              try {
                const arr = JSON.parse(v);
                return Array.isArray(arr)
                  ? `${arr.length} preset${arr.length !== 1 ? "s" : ""}`
                  : v;
              } catch {
                return v;
              }
            };
            displayOld = summarize(oldValue);
            displayNew = summarize(newValue) ?? newValue;
          }
          diff.push({
            key,
            label,
            oldValue: displayOld,
            newValue: displayNew,
            status: oldValue === null ? "added" : "changed",
          });
        }

        if (diff.length === 0) {
          setImportError(
            "No changes — this backup already matches your current preferences.",
          );
          return;
        }
        setPendingImport({ data, diff });
      } catch (err) {
        setImportError(
          err instanceof Error
            ? err.message
            : "Failed to restore preferences backup",
        );
      }
    };
    reader.onerror = () => {
      setImportLoading(false);
      setImportError("Failed to read file");
    };
    reader.readAsText(file);
  }, []);

  const handleApplyImport = useCallback(() => {
    if (!pendingImport) return;
    let applied = 0;
    for (const [key, value] of Object.entries(pendingImport.data)) {
      if (!isAllowedImportKey(key)) continue; // defense-in-depth: skip any non-whitelisted keys
      try {
        localStorage.setItem(key, value);
        applied++;
      } catch {
        /* quota */
      }
    }
    if (applied === 0) {
      setImportError("Failed to write settings");
      return;
    }
    setPendingImport(null);
    setImportSuccess(true);
    dispatchToast(
      `Preferences restored — ${applied} setting${applied !== 1 ? "s" : ""} applied`,
      "success",
    );
    setTimeout(() => {
      window.location.reload();
    }, 800);
  }, [pendingImport]);

  // ---- Export defaults (local state from localStorage) ----
  const [exportPlatforms, setExportPlatforms] = useState<Set<string>>(() => {
    const parsed = lsGetJson<string[]>(STORAGE_KEYS.EXPORT_PLATFORMS, []);
    return Array.isArray(parsed) && parsed.length > 0
      ? new Set(parsed)
      : new Set(["css"]);
  });
  const [cssSelector, setCssSelector] = useState<string>(
    () => lsGet(STORAGE_KEYS.EXPORT_CSS_SELECTOR, ":root") ?? ":root",
  );

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
    lsSet(STORAGE_KEYS.HIDE_DEPRECATED, v ? "true" : "false");
    dispatchSettingsChanged(STORAGE_KEYS.HIDE_DEPRECATED);
  };

  const handleExportPlatformToggle = (platformId: string) => {
    setExportPlatforms((prev) => {
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
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6.5 2L3.5 5l3 3" />
          </svg>
          Back
        </button>
        <span className="text-[10px] font-medium text-[var(--color-figma-text)] ml-1">
          Settings
        </span>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="relative">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)] pointer-events-none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="w-full pl-7 pr-6 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] placeholder:text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)] outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab bar — hidden when searching */}
      {!searchQuery && (
        <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
          <div
            className="flex items-center gap-1 rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1"
            role="tablist"
            aria-label="Settings categories"
          >
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`${shellControlClass({ active: activeTab === tab.id, size: "sm", shape: "rounded" })} flex-1 leading-tight`}
              >
                {tab.label}
              </button>
            ))}
          </div>
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

          {!searchQuery && (
            <GroupIntro
              title={activeTabMeta.label}
              description={activeTabMeta.description}
              note={activeTab === "advanced" ? "Use when needed" : "Common"}
            />
          )}

          {!searchQuery && activeTab === "advanced" && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-3">
              <div className="flex items-start gap-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-0.5 shrink-0 text-amber-600"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[11px] font-medium text-[var(--color-figma-text)]">
                      Advanced operations
                    </h2>
                    <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Deliberate use
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    Open this area when you are setting up a machine,
                    troubleshooting the local server, recovering preferences, or
                    making a deliberate workspace reset. Several actions here
                    reload the plugin or permanently affect local data.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ADVANCED_SUMMARY_ITEMS.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {showSection("workspace-behavior") && (
            <Section
              title="Workspace behavior"
              tabBadge={searchQuery ? "Preferences" : undefined}
            >
              <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                These defaults shape the day-to-day browsing experience in
                TokenManager. Change them when you want the library to feel
                denser or quieter while reviewing tokens.
              </p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--color-figma-text)]">
                      Density
                    </span>
                    {density !== "comfortable" && (
                      <button
                        onClick={() => handleDensityChange("comfortable")}
                        className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Controls row height in token lists and inspectors
                  </span>
                </div>
                <SegmentedControl
                  options={[
                    { value: "compact" as Density, label: "Compact" },
                    { value: "comfortable" as Density, label: "Comfortable" },
                  ]}
                  value={density}
                  onChange={handleDensityChange}
                />
              </div>
              <Toggle
                checked={hideDeprecated}
                onChange={handleHideDeprecatedChange}
                label="Hide deprecated tokens"
                description="Keeps superseded tokens out of the main list so active options stay easier to scan."
              />
            </Section>
          )}

          {showSection("color-copy-defaults") && (
            <Section
              title="Color and copy defaults"
              tabBadge={searchQuery ? "Preferences" : undefined}
            >
              <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Use these when you want copied values and color previews to
                match the format your team reaches for most often.
              </p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--color-figma-text)]">
                      Color format
                    </span>
                    {colorFormat !== "hex" && (
                      <button
                        onClick={() => handleColorFormatChange("hex")}
                        className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Default display format for color values across the UI
                  </span>
                </div>
                <SegmentedControl
                  options={[
                    { value: "hex" as ColorFormat, label: "HEX" },
                    { value: "rgb" as ColorFormat, label: "RGB" },
                    { value: "hsl" as ColorFormat, label: "HSL" },
                    { value: "oklch" as ColorFormat, label: "OKLCH" },
                    { value: "p3" as ColorFormat, label: "P3" },
                  ]}
                  value={colorFormat}
                  onChange={handleColorFormatChange}
                />
              </div>
              <div className="flex items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-tertiary,var(--color-figma-bg-secondary))] px-2 py-1.5">
                <div
                  className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-figma-border)]"
                  style={{ backgroundColor: "#3B82F6" }}
                />
                <span className="shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Sample
                </span>
                <span className="truncate select-all font-mono text-[10px] text-[var(--color-figma-text)]">
                  {formatHexAs("#3B82F6", colorFormat)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--color-figma-text)]">
                      Preferred copy format
                    </span>
                    {preferredCopyFormat !== "css-var" && (
                      <button
                        onClick={() =>
                          handlePreferredCopyFormatChange("css-var")
                        }
                        className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Default output for the copy shortcut and quick copy actions
                  </span>
                </div>
                <SegmentedControl
                  options={[
                    { value: "css-var" as PreferredCopyFormat, label: "CSS" },
                    {
                      value: "dtcg-ref" as PreferredCopyFormat,
                      label: "{ref}",
                    },
                    { value: "scss" as PreferredCopyFormat, label: "$scss" },
                    { value: "raw" as PreferredCopyFormat, label: "Value" },
                    { value: "json" as PreferredCopyFormat, label: "DTCG" },
                  ]}
                  value={preferredCopyFormat}
                  onChange={handlePreferredCopyFormatChange}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-figma-text)]">
                    Contrast background
                  </span>
                  {contrastBg && (
                    <button
                      onClick={() => handleContrastBgChange("")}
                      className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={contrastBg || "#ffffff"}
                    onChange={(e) => handleContrastBgChange(e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded border border-[var(--color-figma-border)] p-0"
                  />
                  <input
                    type="text"
                    value={contrastBg}
                    onChange={(e) => handleContrastBgChange(e.target.value)}
                    placeholder="e.g. #ffffff"
                    className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 font-mono text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                  />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                  Used only for contrast checks in color pickers and previews.
                  Leave empty to use the plugin default background.
                </p>
              </div>
            </Section>
          )}

          {showSection("connection") && (
            <Section
              title="Local server connection"
              defaultOpen={!searchQuery && activeTab === "advanced"}
              tabBadge={searchQuery ? "Advanced" : undefined}
            >
              <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Only adjust this when the plugin should read token files from
                your machine, sync changes back to disk, or run server-backed
                tooling such as lint configuration.
              </p>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Server URL
                </label>
                <span
                  className={`flex items-center gap-1 text-[10px] font-medium ${connected ? "text-[var(--color-figma-success)]" : checking ? "text-[var(--color-figma-text-secondary)]" : "text-[var(--color-figma-error)]"}`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-[var(--color-figma-success)]" : checking ? "bg-[var(--color-figma-text-secondary)] animate-pulse" : "bg-[var(--color-figma-error)]"}`}
                  />
                  {connected
                    ? "Connected"
                    : checking
                      ? "Checking\u2026"
                      : "Disconnected"}
                </span>
              </div>
              <input
                type="text"
                value={serverUrlInput}
                onChange={(e) => {
                  setServerUrlInput(e.target.value);
                  setConnectResult(null);
                }}
                onFocus={(e) => e.target.select()}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    const url =
                      serverUrlInput.trim() || "http://localhost:9400";
                    const ok = await updateServerUrlAndConnect(url);
                    setConnectResult(ok ? "ok" : "fail");
                  }
                }}
                placeholder="http://localhost:9400"
                className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
              />
              <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Run <span className="font-mono">npm start</span> in the
                TokenManager directory, then connect here. The default local
                server is{" "}
                <span className="font-mono">http://localhost:9400</span>.
              </p>
              {connectResult === "ok" && (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-success)]">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Connected successfully
                </div>
              )}
              {connectResult === "fail" && (
                <div className="text-[10px] text-[var(--color-figma-error)]">
                  <div className="mb-0.5 flex items-center gap-1.5 font-medium">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    Cannot reach server
                  </div>
                  <ul className="list-inside list-disc space-y-0.5 leading-relaxed text-[var(--color-figma-text-secondary)]">
                    <li>
                      Run <span className="font-mono">npm start</span> in the
                      TokenManager directory
                    </li>
                    <li>Check the URL matches your server address and port</li>
                    <li>Make sure nothing is blocking localhost traffic</li>
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const defaultUrl = "http://localhost:9400";
                    setServerUrlInput(defaultUrl);
                    setConnectResult(null);
                    const ok = await updateServerUrlAndConnect(defaultUrl);
                    setConnectResult(ok ? "ok" : "fail");
                  }}
                  disabled={checking}
                  title="Reset server URL to http://localhost:9400"
                  className="whitespace-nowrap rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
                >
                  Reset to default
                </button>
                <button
                  onClick={async () => {
                    const url =
                      serverUrlInput.trim() || "http://localhost:9400";
                    const ok = await updateServerUrlAndConnect(url);
                    setConnectResult(ok ? "ok" : "fail");
                  }}
                  disabled={checking}
                  className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                >
                  {checking ? "Connecting\u2026" : "Connect"}
                </button>
              </div>
            </Section>
          )}

          {showSection("export-defaults") && (
            <Section
              title="Export defaults"
              defaultOpen={false}
              tabBadge={searchQuery ? "Advanced" : undefined}
            >
              <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Change these only when your handoff defaults have shifted. The
                Export panel reads them as a starting point for future export
                runs.
              </p>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-figma-text)]">
                    Default platforms
                  </span>
                  {!(
                    exportPlatforms.size === 1 && exportPlatforms.has("css")
                  ) && (
                    <button
                      onClick={() => {
                        const defaultPlatforms = new Set(["css"]);
                        setExportPlatforms(defaultPlatforms);
                        lsSetJson(STORAGE_KEYS.EXPORT_PLATFORMS, ["css"]);
                      }}
                      className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      Reset to default
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {PLATFORMS.map((platform) => (
                    <button
                      key={platform.id}
                      onClick={() => handleExportPlatformToggle(platform.id)}
                      className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                        exportPlatforms.has(platform.id)
                          ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white"
                          : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                      }`}
                      title={platform.description}
                    >
                      {platform.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-figma-text)]">
                    CSS selector
                  </span>
                  {cssSelector !== ":root" && (
                    <button
                      onClick={() => handleCssSelectorChange(":root")}
                      className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      Reset to :root
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={cssSelector}
                  onChange={(e) => handleCssSelectorChange(e.target.value)}
                  placeholder=":root"
                  className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 font-mono text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                  Wraps exported custom properties. Leave this at{" "}
                  <code className="font-mono">:root</code> unless your codebase
                  expects a scoped selector.
                </p>
              </div>
            </Section>
          )}

          {showSection("validation") && (
            <Section
              title="Validation rules"
              defaultOpen={false}
              tabBadge={searchQuery ? "Advanced" : undefined}
            >
              <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Change this only when your team needs different linting rules
                than the defaults or when you are debugging why validation is
                behaving unexpectedly. These rules are stored on the local
                server, not in the Figma plugin itself.
              </p>
              {!connected ? (
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Connect to the local server first to inspect or change lint
                  rules.
                </p>
              ) : !lintConfig ? (
                <p className="animate-pulse text-[10px] text-[var(--color-figma-text-secondary)]">
                  Loading lint config\u2026
                </p>
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
            </Section>
          )}

          {(showSection("guided-setup") ||
            showSection("backup") ||
            showSection("undo")) && (
            <div
              className={`flex flex-col gap-3 ${!searchQuery ? "mb-3" : ""}`}
            >
              {!searchQuery && activeTab === "advanced" && (
                <GroupIntro
                  title="Recovery and restart"
                  description="Use these helpers when you need to relaunch setup, move preferences between machines, or keep a deeper local undo buffer. They recover or reshape your working state without wiping the workspace."
                  note="Reversible"
                />
              )}

              {showSection("guided-setup") && (
                <Section
                  title="Guided setup"
                  defaultOpen={false}
                  tabBadge={searchQuery ? "Advanced" : undefined}
                >
                  <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    Re-open the onboarding flow when you want help reconnecting
                    the server, creating a foundation set, mapping semantic
                    roles, or rebuilding your theme setup from scratch.
                  </p>
                  <button
                    onClick={onRestartGuidedSetup}
                    className="flex w-full items-center justify-center gap-1.5 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                    Open guided setup
                  </button>
                </Section>
              )}

              {showSection("backup") && (
                <Section
                  title="Backup and restore"
                  defaultOpen={false}
                  tabBadge={searchQuery ? "Advanced" : undefined}
                >
                  <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    Save or restore a preferences-only backup. This does not
                    import tokens, themes, sets, or any other token-system
                    data from the main Import surface.
                  </p>
                  <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    Use this when moving to another machine, recovering after
                    browser storage is cleared, or snapshotting preferences
                    before broader workflow changes.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportSettings}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                      Export preferences backup
                    </button>
                    <button
                      onClick={() => {
                        setImportError(null);
                        setImportSuccess(false);
                        importFileRef.current?.click();
                      }}
                      disabled={importLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {importLoading ? (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="animate-spin"
                          aria-hidden="true"
                        >
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                      ) : (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                      )}
                      {importLoading
                        ? "Parsing backup\u2026"
                        : "Restore preferences backup"}
                    </button>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".json,application/json"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportFile(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {importSuccess && (
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-success)]">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Preferences restored, reloading\u2026
                    </div>
                  )}
                  {importError && (
                    <p className="text-[10px] text-[var(--color-figma-error)]">
                      {importError}
                    </p>
                  )}
                  {pendingImport && (
                    <div className="overflow-hidden rounded border border-[var(--color-figma-border)]">
                      <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
                        <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                          Preview preference changes ({pendingImport.diff.length}{" "}
                          setting
                          {pendingImport.diff.length !== 1 ? "s" : ""})
                        </span>
                        <button
                          onClick={() => {
                            setPendingImport(null);
                          }}
                          className="text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
                          aria-label="Dismiss preview"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                        {pendingImport.diff.map((entry) => (
                          <div
                            key={entry.key}
                            className="flex flex-col gap-0.5 px-2 py-1.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`rounded px-1 text-[9px] font-medium ${entry.status === "added" ? "bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]" : "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"}`}
                              >
                                {entry.status === "added" ? "NEW" : "CHANGED"}
                              </span>
                              <span className="truncate text-[10px] font-medium text-[var(--color-figma-text)]">
                                {entry.label}
                              </span>
                            </div>
                            {entry.status === "changed" &&
                              entry.oldValue !== null && (
                                <span className="truncate pl-0.5 font-mono text-[9px] text-[var(--color-figma-text-secondary)]">
                                  <span className="text-[var(--color-figma-error)]">
                                    -
                                  </span>{" "}
                                  {entry.oldValue}
                                </span>
                              )}
                            <span className="truncate pl-0.5 font-mono text-[9px] text-[var(--color-figma-text-secondary)]">
                              <span className="text-[var(--color-figma-success)]">
                                +
                              </span>{" "}
                              {entry.newValue}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-start gap-1.5 border-t border-[var(--color-figma-border)] bg-[#FFF3CD]/30 px-2 py-2 dark:bg-amber-900/20">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mt-px shrink-0 text-amber-500"
                          aria-hidden="true"
                        >
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                          Restoring this backup reloads the plugin immediately.
                          Unsaved token or theme edits, selection state, and
                          expanded panel state will be lost when the reload
                          happens.
                        </p>
                      </div>
                      <div className="flex gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                        <button
                          onClick={() => {
                            setPendingImport(null);
                          }}
                          className="flex-1 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleApplyImport}
                          className="flex-1 rounded bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-amber-600"
                        >
                          Restore preferences & reload
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {showSection("undo") && (
                <Section
                  title="Undo history"
                  defaultOpen={false}
                  tabBadge={searchQuery ? "Advanced" : undefined}
                >
                  <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    Increase this only if you regularly make long editing runs
                    and need a deeper local undo stack. Higher values keep more
                    history in browser storage.
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="block text-[10px] text-[var(--color-figma-text-secondary)]">
                        Max undo steps
                      </span>
                      {undoMaxHistory !== 20 && (
                        <button
                          onClick={() => {
                            setUndoMaxHistory(20);
                          }}
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
                      onChange={(e) => {
                        const v = Math.max(
                          1,
                          Math.min(
                            200,
                            Math.round(Number(e.target.value) || 20),
                          ),
                        );
                        setUndoMaxHistory(v);
                      }}
                      className="w-16 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-right text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                    />
                  </div>
                </Section>
              )}
            </div>
          )}

          {!searchQuery &&
            activeTab === "advanced" &&
            showSection("danger") && (
              <GroupIntro
                title="Workspace reset"
                description="This section is only for a full workspace wipe. It deletes token data in the plugin and on the local server, but it does not automatically reset onboarding or other saved preference state."
                note="Irreversible"
                tone="danger"
              />
            )}

          {showSection("danger") && (
            <Section
              title="Danger zone"
              defaultOpen={false}
              danger
              tabBadge={searchQuery ? "Advanced" : undefined}
            >
              {!showClearConfirm ? (
                <>
                  <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    This permanently deletes workspace data: tokens, themes,
                    sets, plus generator, resolver, and undo-history records
                    stored on the local server. It does not reset your saved
                    preferences or automatically re-open onboarding / the start
                    flow.
                  </p>
                  <button
                    onClick={() => {
                      setShowClearConfirm(true);
                      setClearConfirmText("");
                    }}
                    className="w-full rounded border border-[var(--color-figma-error)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)] hover:text-white"
                  >
                    Delete workspace data\u2026
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    Type{" "}
                    <span className="font-mono font-bold text-[var(--color-figma-error)]">
                      DELETE
                    </span>{" "}
                    to confirm permanent removal of tokens, themes, sets, and
                    local server generator / resolver / history data. Your
                    onboarding and start-flow completion state will stay as-is.
                  </p>
                  <input
                    type="text"
                    value={clearConfirmText}
                    onChange={(e) => setClearConfirmText(e.target.value)}
                    placeholder="DELETE"
                    autoFocus
                    aria-label="Type DELETE to confirm"
                    className="w-full rounded border border-[var(--color-figma-error)] bg-[var(--color-figma-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-figma-text)] outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowClearConfirm(false);
                        setClearConfirmText("");
                      }}
                      className="flex-1 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleClearAll}
                      disabled={clearConfirmText !== "DELETE" || clearing}
                      className="flex-1 rounded bg-[var(--color-figma-error)] px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {clearing ? "Clearing\u2026" : "Delete workspace data"}
                    </button>
                  </div>
                </>
              )}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
