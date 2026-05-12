import { useState, useEffect, useCallback, useRef, useId } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  CheckCircle2,
  Download,
  PlugZap,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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
import { Button } from "../primitives/Button";
import { Field } from "../primitives/Field";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { StatusBanner } from "../primitives/Status";
import { TextInput } from "../primitives/TextInput";
import { SecondaryTakeoverHeader } from "./SecondaryTakeoverHeader";

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

const DEFAULT_SERVER_URL = "http://localhost:9400";

const COLOR_FORMAT_OPTIONS = [
  { value: "hex", label: "HEX" },
  { value: "rgb", label: "RGB" },
  { value: "hsl", label: "HSL" },
  { value: "oklch", label: "OKLCH" },
  { value: "p3", label: "P3" },
] satisfies Array<{ value: ColorFormat; label: string }>;

const COPY_FORMAT_OPTIONS = [
  { value: "css-var", label: "CSS" },
  { value: "dtcg-ref", label: "{ref}" },
  { value: "scss", label: "$scss" },
  { value: "raw", label: "Value" },
  { value: "json", label: "DTCG" },
] satisfies Array<{ value: PreferredCopyFormat; label: string }>;

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 pt-4 first:pt-0">
      <header className="flex min-w-0 flex-col gap-0.5">
        <h3 className="m-0 text-[var(--font-size-md)] font-semibold leading-[var(--leading-tight)] text-[color:var(--color-figma-text)]">
          {title}
        </h3>
        {description ? (
          <p className="m-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
            {description}
          </p>
        ) : null}
      </header>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </section>
  );
}

function SettingsItem({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-md)] py-1">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium leading-[var(--leading-tight)] text-[color:var(--color-figma-text)]">
          {title}
        </span>
        {description ? (
          <span className="text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
            {description}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SwitchRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description?: string;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={() => onChange(!checked)}
      className="group flex w-full min-w-0 items-start justify-between gap-3 rounded-[var(--radius-md)] px-2 py-1.5 text-left outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] focus-visible:outline-offset-[-1px]"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          id={labelId}
          className="text-body font-medium leading-[var(--leading-tight)] text-[color:var(--color-figma-text)]"
        >
          {title}
        </span>
        {description ? (
          <span
            id={descriptionId}
            className="text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]"
          >
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-figma-accent)]" : "bg-[var(--color-figma-border)]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--color-figma-text-onbrand)] transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
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

const IMPORTABLE_PREFIX_LABELS = [
  { prefix: STORAGE_PREFIXES.TOKEN_SORT, label: "Sort" },
  { prefix: STORAGE_PREFIXES.TOKEN_TYPE_FILTER, label: "Filter" },
  { prefix: STORAGE_PREFIXES.TOKEN_VIEW_MODE, label: "View mode" },
  { prefix: STORAGE_PREFIXES.TOKEN_GROUP_BY, label: "Group by" },
  { prefix: STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES, label: "Resolved values" },
  { prefix: STORAGE_PREFIXES.MODE_COLUMN_WIDTH, label: "Mode column width" },
];

const IMPORTABLE_PREFIXES = IMPORTABLE_PREFIX_LABELS.map(({ prefix }) => prefix);

function matchesAnyPrefix(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => key.startsWith(prefix));
}

function labelForImportKey(key: string): string {
  const staticLabel = IMPORT_KEY_LABELS[key];
  if (staticLabel) {
    return staticLabel;
  }

  const prefixLabel = IMPORTABLE_PREFIX_LABELS.find(({ prefix }) =>
    key.startsWith(prefix),
  );
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
      "tokenworkshop-settings.json",
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

  const connectToServer = useCallback(
    async (targetUrl: string) => {
      const url = targetUrl.trim() || DEFAULT_SERVER_URL;
      setServerUrlInput(url);
      setConnectResult(null);
      const ok = await updateServerUrlAndConnect(url);
      setConnectResult(ok ? "ok" : "fail");
    },
    [updateServerUrlAndConnect],
  );

  const handleConnectCurrent = useCallback(async () => {
    await connectToServer(serverUrlInput);
  }, [connectToServer, serverUrlInput]);

  const handleResetServerUrl = useCallback(async () => {
    await connectToServer(DEFAULT_SERVER_URL);
  }, [connectToServer]);

  const activeServerUrl = serverUrl || serverUrlInput || DEFAULT_SERVER_URL;
  const connectionTone = connected ? "success" : checking ? "neutral" : "danger";
  const connectionTitle = connected
    ? "Connected"
    : checking
      ? "Checking connection"
      : "Disconnected";
  const connectionDescription = connected
    ? `Using ${activeServerUrl}`
    : checking
      ? `Checking ${activeServerUrl}`
      : "Start the local server, then reconnect from here.";

  return (
    <>
      <SecondaryTakeoverHeader title="Settings" onClose={onClose} />

      <div className="flex-1 overflow-y-auto bg-[var(--surface-app)]">
        <div className="flex min-w-0 flex-col gap-5 px-3 py-3">
          <SettingsSection
            title="Preferences"
            description="Defaults used while editing, inspecting, and copying tokens."
          >
            <SwitchRow
              checked={hideDeprecated}
              onChange={handleHideDeprecatedChange}
              title="Hide deprecated tokens"
              description="Keeps retired tokens out of lists and pickers."
            />

            <SettingsItem
              title="Color values"
              description="Default notation for color fields and previews."
            >
              <div className="flex min-w-0 flex-col gap-1.5 [&_.tm-segmented-control]:w-full">
                <SegmentedControl
                  options={COLOR_FORMAT_OPTIONS}
                  value={colorFormat}
                  onChange={handleColorFormatChange}
                  ariaLabel="Color format"
                  size="compact"
                />
                <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-group-quiet)] px-2 py-1">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm border border-[var(--color-figma-border)]"
                    style={{ backgroundColor: "#3B82F6" }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate font-mono text-secondary text-[color:var(--color-figma-text)]">
                    {formatHexAs("#3B82F6", colorFormat)}
                  </span>
                </div>
              </div>
            </SettingsItem>

            <SettingsItem
              title="Copy format"
              description="Format used by token copy shortcuts and contextual actions."
            >
              <div className="min-w-0 [&_.tm-segmented-control]:w-full">
                <SegmentedControl
                  options={COPY_FORMAT_OPTIONS}
                  value={preferredCopyFormat}
                  onChange={handlePreferredCopyFormatChange}
                  ariaLabel="Copy format"
                  size="compact"
                />
              </div>
            </SettingsItem>

            <SettingsItem
              title="Contrast background"
              description="Preview background used by color contrast tools."
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={contrastBg || "#ffffff"}
                  onChange={(e) => handleContrastBgChange(e.target.value)}
                  aria-label="Contrast background color picker"
                  className="h-7 w-7 shrink-0 cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-0"
                />
                <TextInput
                  size="sm"
                  value={contrastBg}
                  onChange={(e) => handleContrastBgChange(e.target.value)}
                  placeholder="#ffffff"
                  aria-label="Contrast background hex value"
                  className="min-w-[7rem] flex-1 font-mono"
                />
                {contrastBg && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleContrastBgChange("")}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </SettingsItem>

            <SettingsItem
              title="Undo history"
              description="Maximum local undo steps to keep available."
            >
              <TextInput
                size="sm"
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
                className="w-24 text-right tabular-nums"
              />
            </SettingsItem>
          </SettingsSection>

          <SettingsSection
            title="Connection"
            description="Local Token Workshop server used for storage, history, and export."
          >
            <StatusBanner tone={connectionTone} title={connectionTitle}>
              <span className="break-all">{connectionDescription}</span>
            </StatusBanner>

            <Field label="Server URL">
              <TextInput
                value={serverUrlInput}
                onChange={(e) => {
                  setServerUrlInput(e.target.value);
                  setConnectResult(null);
                }}
                onFocus={(e) => e.target.select()}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    await connectToServer(serverUrlInput);
                  }
                }}
                placeholder={DEFAULT_SERVER_URL}
                aria-label="Server URL"
                className="font-mono"
              />
            </Field>

            {connectResult === "ok" && (
              <StatusBanner tone="success" title="Connected successfully" />
            )}
            {connectResult === "fail" && (
              <StatusBanner tone="danger" title="Cannot reach server">
                Run <span className="font-mono">pnpm server</span> or{" "}
                <span className="font-mono">pnpm preview</span>, then check the
                URL and port.
              </StatusBanner>
            )}

            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
              <Button
                onClick={handleResetServerUrl}
                disabled={checking}
                title={`Reset server URL to ${DEFAULT_SERVER_URL}`}
              >
                <RotateCcw size={13} strokeWidth={1.75} aria-hidden />
                Default
              </Button>
              <Button
                onClick={handleConnectCurrent}
                disabled={checking}
                variant="primary"
              >
                <PlugZap size={13} strokeWidth={1.75} aria-hidden />
                {checking ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Export defaults"
            description="Starting point for code handoff exports."
          >
            <SettingsItem
              title="Default platforms"
              description="Preselected formats when opening export."
            >
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {PLATFORMS.map((platform) => (
                  <button
                    type="button"
                    key={platform.id}
                    aria-pressed={exportPlatforms.has(platform.id)}
                    onClick={() => handleExportPlatformToggle(platform.id)}
                    className={`min-h-7 rounded-[var(--radius-md)] border px-2 py-1 text-secondary font-medium transition-colors ${
                      exportPlatforms.has(platform.id)
                        ? "border-[var(--color-figma-accent)] bg-[var(--surface-selected)] text-[color:var(--color-figma-text)]"
                        : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:border-[color:var(--color-figma-text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)]"
                    }`}
                    title={platform.description}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </SettingsItem>
            <Field label="CSS selector" help="Used as the root selector for CSS variable exports.">
              <TextInput
                type="text"
                value={cssSelector}
                onChange={(e) => handleCssSelectorChange(e.target.value)}
                placeholder=":root"
                aria-label="CSS selector"
                className="font-mono"
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            title="Setup and backups"
            description="Documentation, onboarding, and local preference backups."
          >
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
              <Button onClick={handleOpenDocumentation} wrap>
                <BookOpen size={13} strokeWidth={1.75} aria-hidden />
                Documentation
              </Button>
              <Button onClick={onRestartGuidedSetup} wrap>
                <RotateCcw size={13} strokeWidth={1.75} aria-hidden />
                Re-run setup
              </Button>
              <Button onClick={handleExportSettings} wrap>
                <Download size={13} strokeWidth={1.75} aria-hidden />
                Export backup
              </Button>
              <Button
                onClick={() => {
                  setImportError(null);
                  setImportSuccess(false);
                  importFileRef.current?.click();
                }}
                disabled={importLoading}
                wrap
              >
                <Upload size={13} strokeWidth={1.75} aria-hidden />
                {importLoading ? "Parsing" : "Import backup"}
              </Button>
            </div>
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

            {importSuccess && (
              <StatusBanner
                tone="success"
                title="Preferences restored"
                icon={<CheckCircle2 size={14} strokeWidth={1.75} aria-hidden />}
              >
                Reloading...
              </StatusBanner>
            )}
            {importError && (
              <StatusBanner tone="danger" title="Import failed">
                {importError}
              </StatusBanner>
            )}
            {pendingImport && (
              <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--surface-group-quiet)] p-2">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-body font-medium text-[color:var(--color-figma-text)]">
                      Preview changes
                    </span>
                    <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                      {pendingImport.diff.length} setting
                      {pendingImport.diff.length !== 1 ? "s" : ""} will change.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingImport(null)}
                    aria-label="Dismiss preview"
                    title="Dismiss preview"
                  >
                    <X size={13} strokeWidth={1.75} aria-hidden />
                    Dismiss
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {pendingImport.diff.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex min-w-0 flex-col gap-0.5 py-1.5"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`shrink-0 text-secondary font-medium ${
                            entry.status === "added"
                              ? "text-[color:var(--color-figma-text-success)]"
                              : "text-[color:var(--color-figma-text-accent)]"
                          }`}
                        >
                          {entry.status === "added" ? "New" : "Changed"}
                        </span>
                        <span
                          className="min-w-0 break-words text-secondary font-medium text-[color:var(--color-figma-text)] [overflow-wrap:anywhere]"
                          title={entry.label}
                        >
                          {entry.label}
                        </span>
                      </div>
                      {entry.status === "changed" && entry.oldValue !== null ? (
                        <span
                          className="break-all font-mono text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]"
                          title={entry.oldValue}
                        >
                          <span className="text-[color:var(--color-figma-text-error)]">
                            -
                          </span>{" "}
                          {entry.oldValue}
                        </span>
                      ) : null}
                      <span
                        className="break-all font-mono text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]"
                        title={entry.newValue}
                      >
                        <span className="text-[color:var(--color-figma-text-success)]">
                          +
                        </span>{" "}
                        {entry.newValue}
                      </span>
                    </div>
                  ))}
                </div>
                <StatusBanner tone="warning" title="Restore reloads the plugin">
                  Unsaved edits will be lost.
                </StatusBanner>
                <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  <Button
                    onClick={() => setPendingImport(null)}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleApplyImport} variant="primary">
                    Restore backup
                  </Button>
                </div>
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            title="Workspace data"
            description="Destructive recovery action for the current workspace."
          >
            {!showClearConfirm ? (
              <Button
                onClick={() => {
                  setShowClearConfirm(true);
                  setClearConfirmText("");
                }}
                variant="danger"
                className="self-start"
              >
                <Trash2 size={13} strokeWidth={1.75} aria-hidden />
                Delete workspace data
              </Button>
            ) : (
              <div className="flex min-w-0 flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--surface-error)] p-2">
                <StatusBanner tone="danger" title="Delete all workspace data">
                  Type <span className="font-mono font-bold">DELETE</span> to
                  permanently remove all workspace data.
                </StatusBanner>
                <TextInput
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                  aria-label="Type DELETE to confirm"
                  className="font-mono"
                />
                <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
                  <Button
                    onClick={() => {
                      setShowClearConfirm(false);
                      setClearConfirmText("");
                    }}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleClearAll}
                    disabled={clearConfirmText !== "DELETE" || clearing}
                    variant="danger"
                  >
                    <Trash2 size={13} strokeWidth={1.75} aria-hidden />
                    {clearing ? "Deleting" : "Delete workspace data"}
                  </Button>
                </div>
              </div>
            )}
          </SettingsSection>
        </div>
      </div>
    </>
  );
}
