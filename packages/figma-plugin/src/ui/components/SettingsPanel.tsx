import { useState, useEffect, useCallback, useRef } from "react";
import {
  STORAGE_KEYS,
  STORAGE_PREFIXES,
  lsEntries,
  lsGet,
  lsSet,
  lsGetJson,
  lsSetJson,
  resetWorkspaceStateForRecovery,
} from "../shared/storage";
import { apiFetch } from "../shared/apiFetch";
import { PLATFORMS } from "../shared/platforms";
import { formatHexAs } from "../shared/colorUtils";
import { dispatchToast } from "../shared/toastBus";
import { buildPluginDocumentationUrl, downloadBlob } from "../shared/utils";
import { SegmentedControl } from "./SegmentedControl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColorFormat = "hex" | "rgb" | "hsl" | "oklch" | "p3";
export type PreferredCopyFormat =
  | "css-var"
  | "dtcg-ref"
  | "scss"
  | "raw"
  | "json";

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
// Section component (collapsible, for infrequent settings)
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  defaultOpen = true,
  suffix,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  suffix?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border overflow-hidden border-[var(--color-figma-border)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-left transition-[background-color,color,box-shadow,transform] duration-150 ease-out outline-none hover:bg-[var(--color-figma-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30 active:translate-y-px ${open ? "bg-[var(--color-figma-bg)]" : ""}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-body font-semibold text-[var(--color-figma-text)]">
            {title}
          </span>
          {suffix}
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
      {open && <div className="p-2.5 flex flex-col gap-3">{children}</div>}
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
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-7 h-4 rounded-full transition-colors ${checked ? "bg-[var(--color-figma-accent)]" : "bg-[var(--color-figma-border)]"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? "translate-x-3" : ""}`}
        />
      </button>
      <span className="text-body text-[var(--color-figma-text)]">
        {label}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SettingsPanelProps {
  serverUrl: string;
  connected: boolean;
  checking: boolean;
  updateServerUrlAndConnect: (url: string) => Promise<boolean>;
  onRestartGuidedSetup: () => void;
  onClearAllComplete?: () => void;
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

const IMPORTABLE_PREFIXES = [
  STORAGE_PREFIXES.TOKEN_SORT,
  STORAGE_PREFIXES.TOKEN_TYPE_FILTER,
  STORAGE_PREFIXES.TOKEN_VIEW_MODE,
  STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES,
] as const;

const PREFIX_LABELS: Array<{ prefix: string; label: string }> = [
  { prefix: STORAGE_PREFIXES.TOKEN_SORT, label: "Sort" },
  { prefix: STORAGE_PREFIXES.TOKEN_TYPE_FILTER, label: "Filter" },
  { prefix: STORAGE_PREFIXES.TOKEN_VIEW_MODE, label: "View mode" },
  { prefix: STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES, label: "Resolved values" },
];

function matchesAnyPrefix(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => key.startsWith(prefix));
}

function labelForImportKey(key: string): string {
  const staticLabel = IMPORT_KEY_LABELS[key];
  if (staticLabel) {
    return staticLabel;
  }

  const prefixLabel = PREFIX_LABELS.find(({ prefix }) => key.startsWith(prefix));
  if (prefixLabel) {
    return `${prefixLabel.label}: ${key.slice(prefixLabel.prefix.length)}`;
  }

  return key;
}

/** Exact localStorage keys that are allowed to be imported. */
const IMPORTABLE_EXACT_KEYS = new Set<string>([
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
]);

/** Returns true only for keys that the export produces and safe to import. */
function isAllowedImportKey(key: string): boolean {
  if (IMPORTABLE_EXACT_KEYS.has(key)) return true;
  return matchesAnyPrefix(key, IMPORTABLE_PREFIXES);
}

const IMPORT_KEY_LABELS: Record<string, string> = {
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
  // --- Connection state ---
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [connectResult, setConnectResult] = useState<"ok" | "fail" | null>(
    null,
  );
  // --- Undo history ---
  const [undoMaxHistory, setUndoMaxHistoryState] = useState(() =>
    lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20),
  );
  const setUndoMaxHistory = (v: number) => {
    setUndoMaxHistoryState(v);
    lsSetJson(STORAGE_KEYS.UNDO_MAX_HISTORY, v);
    dispatchSettingsChanged(STORAGE_KEYS.UNDO_MAX_HISTORY);
  };
  // --- Danger zone ---
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
      resetWorkspaceStateForRecovery();
      setShowClearConfirm(false);
      setClearConfirmText("");
      onClearAllComplete?.();
    } catch (err) {
      console.warn("[SettingsPanel] clear all data request failed:", err);
      dispatchToast("Clear all failed. Server data was not deleted.", "error", {
        destination: { kind: "surface", surface: "settings" },
      });
    } finally {
      setClearing(false);
    }
  };
  // ---- UI Preferences ----
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

  // ---- Backup & Restore ----
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    data: Record<string, string>;
    diff: ImportDiffEntry[];
  } | null>(null);

  const handleExportSettings = useCallback(() => {
    const preferenceKeys: string[] = [
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
    ];

    const out: Record<string, string> = {};
    for (const key of preferenceKeys) {
      const value = lsGet(key);
      if (value !== null) out[key] = value;
    }
    for (const [key, value] of lsEntries()) {
      if (matchesAnyPrefix(key, IMPORTABLE_PREFIXES)) {
        out[key] = value;
      }
    }

    const payload = JSON.stringify(
      { _schemaVersion: 1, _exportedAt: new Date().toISOString(), ...out },
      null,
      2,
    );
    downloadBlob(
      new Blob([payload], { type: "application/json" }),
      "tokenmanager-settings.json",
    );
    dispatchToast("Settings backup exported", "success", {
      destination: { kind: "surface", surface: "settings" },
    });
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
        const data: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (key.startsWith("_")) continue;
          if (typeof value !== "string") continue;
          if (!isAllowedImportKey(key)) continue;
          data[key] = value;
        }
        if (Object.keys(data).length === 0)
          throw new Error("No preferences found in backup file");

        const diff: ImportDiffEntry[] = [];
        for (const [key, newValue] of Object.entries(data)) {
          const oldValue = lsGet(key);
          if (oldValue === newValue) continue;
          const label = labelForImportKey(key);
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
            "No changes — backup matches current settings.",
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
      if (!isAllowedImportKey(key)) continue;
      lsSet(key, value);
      applied++;
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
      { destination: { kind: "surface", surface: "settings" } },
    );
    setTimeout(() => {
      window.location.reload();
    }, 800);
  }, [pendingImport]);

  // ---- Export defaults ----
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

  const handleOpenDocumentation = useCallback(() => {
    window.open(
      buildPluginDocumentationUrl(serverUrl),
      "_blank",
      "noopener,noreferrer",
    );
  }, [serverUrl]);

  // ---- Connection status suffix for section header ----
  const serverStatusSuffix = (
    <span
      className={`flex items-center gap-1 text-secondary font-medium normal-case tracking-normal ${connected ? "text-[var(--color-figma-success)]" : checking ? "text-[var(--color-figma-text-secondary)]" : "text-[var(--color-figma-error)]"}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-[var(--color-figma-success)]" : checking ? "bg-[var(--color-figma-text-secondary)] animate-pulse" : "bg-[var(--color-figma-error)]"}`}
      />
      {connected ? "Connected" : checking ? "Checking..." : "Disconnected"}
    </span>
  );

  return (
    <>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
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
        <span className="text-secondary font-medium text-[var(--color-figma-text)] ml-1">
          Settings
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-2.5">

          {/* ── Everyday preferences (always visible) ── */}
          <div className="flex flex-col gap-2.5">
            <Toggle
              checked={hideDeprecated}
              onChange={handleHideDeprecatedChange}
              label="Hide deprecated tokens"
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-body text-[var(--color-figma-text)]">
                Color format
              </span>
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
                label="Color format"
              />
            </div>
            <div className="flex items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-tertiary,var(--color-figma-bg-secondary))] px-2 py-1.5">
              <div
                className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-figma-border)]"
                style={{ backgroundColor: "#3B82F6" }}
              />
              <span className="truncate select-all font-mono text-secondary text-[var(--color-figma-text)]">
                {formatHexAs("#3B82F6", colorFormat)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-body text-[var(--color-figma-text)]">
                Copy format
              </span>
              <SegmentedControl
                options={[
                  { value: "css-var" as PreferredCopyFormat, label: "CSS" },
                  { value: "dtcg-ref" as PreferredCopyFormat, label: "{ref}" },
                  { value: "scss" as PreferredCopyFormat, label: "$scss" },
                  { value: "raw" as PreferredCopyFormat, label: "Value" },
                  { value: "json" as PreferredCopyFormat, label: "DTCG" },
                ]}
                value={preferredCopyFormat}
                onChange={handlePreferredCopyFormatChange}
                label="Copy format"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-body text-[var(--color-figma-text)]">
                  Contrast background
                </span>
                {contrastBg && (
                  <button
                    onClick={() => handleContrastBgChange("")}
                    className="text-secondary text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={contrastBg || "#ffffff"}
                  onChange={(e) => handleContrastBgChange(e.target.value)}
                  aria-label="Contrast background color picker"
                  className="h-6 w-6 cursor-pointer rounded border border-[var(--color-figma-border)] p-0"
                />
                <input
                  type="text"
                  value={contrastBg}
                  onChange={(e) => handleContrastBgChange(e.target.value)}
                  placeholder="#ffffff"
                  aria-label="Contrast background hex value"
                  className="w-20 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 font-mono text-body text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-body text-[var(--color-figma-text)]">
                Max undo steps
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={undoMaxHistory}
                aria-label="Max undo steps"
                onChange={(e) => {
                  const v = Math.max(
                    1,
                    Math.min(200, Math.round(Number(e.target.value) || 20)),
                  );
                  setUndoMaxHistory(v);
                }}
                className="w-16 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-right text-body text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
              />
            </div>
          </div>

          {/* ── Collapsible sections (infrequent config) ── */}
          <Section title="Server connection" defaultOpen={false} suffix={serverStatusSuffix}>
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
                  const url = serverUrlInput.trim() || "http://localhost:9400";
                  const ok = await updateServerUrlAndConnect(url);
                  setConnectResult(ok ? "ok" : "fail");
                }
              }}
              placeholder="http://localhost:9400"
              aria-label="Server URL"
              className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
            />
            {connectResult === "ok" && (
              <div className="flex items-center gap-1.5 text-secondary text-[var(--color-figma-success)]">
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
              <div className="text-secondary text-[var(--color-figma-error)]">
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
                  <li>Check the URL and port</li>
                  <li>Make sure localhost traffic is not blocked</li>
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
                className="whitespace-nowrap rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-body font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
              >
                Reset to default
              </button>
              <button
                onClick={async () => {
                  const url = serverUrlInput.trim() || "http://localhost:9400";
                  const ok = await updateServerUrlAndConnect(url);
                  setConnectResult(ok ? "ok" : "fail");
                }}
                disabled={checking}
                className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white transition-opacity hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >
                {checking ? "Connecting..." : "Connect"}
              </button>
            </div>
          </Section>

          <Section title="Export defaults" defaultOpen={false}>
            <div>
              <span className="text-body text-[var(--color-figma-text)] mb-1 block">
                Default platforms
              </span>
              <div className="flex flex-wrap gap-1">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform.id}
                    onClick={() => handleExportPlatformToggle(platform.id)}
                    className={`rounded border px-2 py-1 text-secondary font-medium transition-colors ${
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
              <span className="text-body text-[var(--color-figma-text)] mb-1 block">
                CSS selector
              </span>
              <input
                type="text"
                value={cssSelector}
                onChange={(e) => handleCssSelectorChange(e.target.value)}
                placeholder=":root"
                aria-label="CSS selector"
                className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 font-mono text-body text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
              />
            </div>
          </Section>

          <Section title="Help" defaultOpen={false}>
            <p className="text-secondary leading-relaxed text-[var(--color-figma-text-secondary)]">
              Documentation opens from your configured TokenManager server in the browser.
            </p>
            <button
              onClick={handleOpenDocumentation}
              className="w-full rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
            >
              Open documentation
            </button>
          </Section>

          {/* ── Utilities ── */}
          <div className="flex gap-2">
            <button
              onClick={onRestartGuidedSetup}
              className="flex-1 rounded border border-[var(--color-figma-border)] px-2 py-1.5 text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            >
              Re-run setup
            </button>
            <button
              onClick={handleExportSettings}
              className="flex-1 rounded border border-[var(--color-figma-border)] px-2 py-1.5 text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            >
              Export backup
            </button>
            <button
              onClick={() => {
                setImportError(null);
                setImportSuccess(false);
                importFileRef.current?.click();
              }}
              disabled={importLoading}
              className="flex-1 rounded border border-[var(--color-figma-border)] px-2 py-1.5 text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-60"
            >
              {importLoading ? "Parsing..." : "Import backup"}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              aria-label="Import backup file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = "";
              }}
            />
          </div>
          {importSuccess && (
            <div className="flex items-center gap-1.5 text-secondary text-[var(--color-figma-success)]">
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
              Preferences restored, reloading...
            </div>
          )}
          {importError && (
            <p className="text-secondary text-[var(--color-figma-error)]">
              {importError}
            </p>
          )}
          {pendingImport && (
            <div className="overflow-hidden rounded border border-[var(--color-figma-border)]">
              <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
                <span className="text-secondary font-medium text-[var(--color-figma-text)]">
                  Preview changes ({pendingImport.diff.length}{" "}
                  setting{pendingImport.diff.length !== 1 ? "s" : ""})
                </span>
                <button
                  onClick={() => setPendingImport(null)}
                  className="text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
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
                        className={`rounded px-1 text-secondary font-medium ${entry.status === "added" ? "bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]" : "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"}`}
                      >
                        {entry.status === "added" ? "NEW" : "CHANGED"}
                      </span>
                      <span className="truncate text-secondary font-medium text-[var(--color-figma-text)]">
                        {entry.label}
                      </span>
                    </div>
                    {entry.status === "changed" &&
                      entry.oldValue !== null && (
                        <span className="truncate pl-0.5 font-mono text-secondary text-[var(--color-figma-text-secondary)]">
                          <span className="text-[var(--color-figma-error)]">
                            -
                          </span>{" "}
                          {entry.oldValue}
                        </span>
                      )}
                    <span className="truncate pl-0.5 font-mono text-secondary text-[var(--color-figma-text-secondary)]">
                      <span className="text-[var(--color-figma-success)]">
                        +
                      </span>{" "}
                      {entry.newValue}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-warning)]/10 px-2 py-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-px shrink-0 text-[var(--color-figma-warning)]"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-secondary leading-snug text-[var(--color-figma-text-secondary)]">
                  This will reload the plugin. Unsaved edits will be lost.
                </p>
              </div>
              <div className="flex gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                <button
                  onClick={() => setPendingImport(null)}
                  className="flex-1 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-body font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyImport}
                  className="flex-1 rounded bg-[var(--color-figma-warning)] px-3 py-1.5 text-body font-medium text-white transition-colors hover:bg-[var(--color-figma-warning)]"
                >
                  Restore & reload
                </button>
              </div>
            </div>
          )}

          {/* ── Danger zone ── */}
          <div className="border-t border-[var(--color-figma-border)] pt-4">
            {!showClearConfirm ? (
              <button
                onClick={() => {
                  setShowClearConfirm(true);
                  setClearConfirmText("");
                }}
                className="w-full rounded border border-[var(--color-figma-error)] px-3 py-1.5 text-body font-medium text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)] hover:text-white"
              >
                Delete workspace data...
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-secondary leading-relaxed text-[var(--color-figma-text-secondary)]">
                  Type{" "}
                  <span className="font-mono font-bold text-[var(--color-figma-error)]">
                    DELETE
                  </span>{" "}
                  to permanently remove all workspace data.
                </p>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                  aria-label="Type DELETE to confirm"
                  className="w-full rounded border border-[var(--color-figma-error)] bg-[var(--color-figma-bg)] px-2 py-1.5 font-mono text-body text-[var(--color-figma-text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowClearConfirm(false);
                      setClearConfirmText("");
                    }}
                    className="flex-1 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-body font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearAll}
                    disabled={clearConfirmText !== "DELETE" || clearing}
                    className="flex-1 rounded bg-[var(--color-figma-error)] px-3 py-1.5 text-body font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {clearing ? "Clearing..." : "Delete workspace data"}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
