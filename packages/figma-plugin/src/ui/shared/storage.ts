/**
 * Centralized localStorage persistence utility.
 * All storage keys are declared here; components import keys and helpers
 * instead of sprinkling raw strings and try/catch blocks everywhere.
 */

type BrowserStorageKind = "local" | "session";
const STORAGE_PROBE_VALUE = "__tokenmanager_storage_probe__";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

const storageFallbacks: Record<BrowserStorageKind, Storage> = {
  local: createMemoryStorage(),
  session: createMemoryStorage(),
};

const storageCache: Partial<Record<BrowserStorageKind, Storage>> = {};
const storageFallbackLogged = new Set<BrowserStorageKind>();

function logStorageFallback(kind: BrowserStorageKind, reason: unknown): void {
  if (storageFallbackLogged.has(kind)) {
    return;
  }
  storageFallbackLogged.add(kind);
  console.debug(`[storage] ${kind}Storage unavailable; using memory fallback:`, reason);
}

function getStorageRoot():
  | (Window & typeof globalThis)
  | (typeof globalThis & { localStorage?: Storage; sessionStorage?: Storage }) {
  return typeof window !== "undefined"
    ? window
    : (globalThis as typeof globalThis & {
        localStorage?: Storage;
        sessionStorage?: Storage;
      });
}

function verifyStorage(kind: BrowserStorageKind, storage: Storage): boolean {
  const probeKey = `${STORAGE_PROBE_VALUE}:${kind}`;
  let previousValue: string | null = null;
  try {
    previousValue = storage.getItem(probeKey);
    storage.setItem(probeKey, STORAGE_PROBE_VALUE);
    return storage.getItem(probeKey) === STORAGE_PROBE_VALUE;
  } catch {
    return false;
  } finally {
    try {
      if (previousValue === null) {
        storage.removeItem(probeKey);
      } else {
        storage.setItem(probeKey, previousValue);
      }
    } catch {
      // Ignore restore failures and fall back to memory storage.
    }
  }
}

function getStorage(kind: BrowserStorageKind): Storage {
  const cached = storageCache[kind];
  if (cached) return cached;

  try {
    const root = getStorageRoot();
    const storage =
      kind === "local" ? root.localStorage : root.sessionStorage;
    if (!storage) throw new Error(`${kind}Storage is unavailable.`);
    if (!verifyStorage(kind, storage)) {
      throw new Error(`${kind}Storage is not writable.`);
    }
    storageCache[kind] = storage;
    return storage;
  } catch (error) {
    logStorageFallback(kind, error);
    const fallback = storageFallbacks[kind];
    storageCache[kind] = fallback;
    return fallback;
  }
}

function storageGet(kind: BrowserStorageKind, key: string): string | null {
  try {
    return getStorage(kind).getItem(key);
  } catch (error) {
    console.debug(`[storage] ${kind}Storage read failed:`, key, error);
    return null;
  }
}

function storageSet(kind: BrowserStorageKind, key: string, value: string): void {
  try {
    getStorage(kind).setItem(key, value);
  } catch (error) {
    console.debug(`[storage] ${kind}Storage write failed:`, key, error);
  }
}

function storageRemove(kind: BrowserStorageKind, key: string): void {
  try {
    getStorage(kind).removeItem(key);
  } catch (error) {
    console.debug(`[storage] ${kind}Storage remove failed:`, key, error);
  }
}

function storageGetJson<T>(kind: BrowserStorageKind, key: string, fallback: T): T {
  const raw = storageGet(kind, key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.debug(`[storage] ${kind}Storage JSON read failed:`, key, error);
    storageRemove(kind, key);
    return fallback;
  }
}

function storageSetJson<T>(kind: BrowserStorageKind, key: string, value: T): void {
  try {
    storageSet(kind, key, JSON.stringify(value));
  } catch (error) {
    console.debug(`[storage] ${kind}Storage JSON write failed:`, key, error);
  }
}

function storageEntries(kind: BrowserStorageKind): Array<[string, string]> {
  try {
    const storage = getStorage(kind);
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key);
      if (value !== null) entries.push([key, value]);
    }
    return entries;
  } catch (error) {
    console.debug(`[storage] ${kind}Storage iteration failed:`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  EXPANDED:              'tm_expanded',
  WINDOW_WIDTH:          'tm_window_width',
  WINDOW_HEIGHT:         'tm_window_height',
  LIBRARY_BROWSE_COLLECTION_ID: 'tm_library_browse_collection_id',
  ACTIVE_TAB:            'tm_active_tab',
  ACTIVE_TOP_TAB:        'tm_active_top_tab',
  ACTIVE_SUB_TAB_LIBRARY:  'tm_sub_tab_library',
  ACTIVE_SUB_TAB_CANVAS:   'tm_sub_tab_canvas',
  ACTIVE_SUB_TAB_SYNC:     'tm_sub_tab_sync',
  ACTIVE_SUB_TAB_EXPORT:   'tm_sub_tab_export',
  ACTIVE_SUB_TAB_VERSIONS: 'tm_sub_tab_versions',
  COLLAPSED_FOLDERS:     'tm_collapsed_folders',
  SERVER_URL:            'tokenmanager_server_url',
  PALETTE_RECENT:        'tm_palette_recent',
  ANALYTICS_CANONICAL:   'analytics_canonicalPick',
  COLLECTION_CARD_ORDER:  'tm_collection_card_order',
  EXPORT_PLATFORMS:      'exportPanel.selectedPlatforms',
  EXPORT_CSS_SELECTOR:   'exportPanel.cssSelector',
  EXPORT_ZIP_FILENAME:   'exportPanel.zipFilename',
  EXPORT_NEST_PLATFORM:  'exportPanel.nestByPlatform',
  EXPORT_TYPES:          'exportPanel.selectedTypes',
  EXPORT_PATH_PREFIX:    'exportPanel.pathPrefix',
  EXPORT_PRESETS:        'exportPanel.presets',
  EXPORT_PRESET_APPLY:   'exportPanel.presetApply',
  EXPORT_CHANGES_ONLY:         'exportPanel.changesOnly',
  EXPORT_LAST_EXPORT_TIMESTAMP: 'exportPanel.lastExportTimestamp',
  UNDO_MAX_HISTORY:      'tm_undo_max_history',
  HIDE_DEPRECATED:       'tm_hide_deprecated',
  RECENT_COLORS:         'tm_recent_colors',
  COLOR_FORMAT:          'tm_color_format',
  ADVANCED_MODE:         'tm_advanced_mode',
  CONTRAST_BG:           'tm_contrast_bg',
  FIRST_RUN_DONE:        'tm_first_run_done',
  POST_SETUP_HINT_PENDING: 'tm_post_setup_hint_pending',
  DEEP_INSPECT:          'tm_deep_inspect',
  RECENT_TOKENS:         'tm_recent_tokens',
  STARRED_TOKENS:        'tm_starred_tokens',
  PREFERRED_COPY_FORMAT: 'tm_preferred_copy_format',
  INSPECT_PROP_FILTER:      'tm_inspect_prop_filter',
  INSPECT_PROP_FILTER_MODE: 'tm_inspect_prop_filter_mode',
  SETTINGS_ACTIVE_TAB:      'tm_settings_active_tab',
  ACTIVE_RESOLVER:          'tm_active_resolver',
  RESOLVER_INPUT:           'tm_resolver_input',
  SIDEBAR_WIDTH:            'tm_sidebar_width',
  SIDE_EDITOR_WIDTH:        'tm_side_editor_width',
  INSPECTOR_SUGGESTIONS_OPEN: 'inspector-suggestions-open',
  LAST_CREATE_GROUP:        'tm_last_create_group',
  LAST_CREATE_TYPE:         'tm_last_token_type',
  EDITOR_DETAILS:           'tm_editor_details',
  READINESS_CHANGE_KEY:     'tm_readiness_change_key',
  CONSISTENCY_REJECTED:     'tm_consistency_rejected',
  CANVAS_SCAN_TAB:          'tm_canvas_scan_tab',
  PUBLISH_CREATE_STYLES:    'tm_publish_create_styles',
} as const;

/** Dynamic key builders for collection-scoped client view state. */
export const STORAGE_KEY_BUILDERS = {
  tokenSort:       (collectionId: string) => `token-sort:${collectionId}`,
  tokenTypeFilter: (collectionId: string) => `token-type-filter:${collectionId}`,
  tokenViewMode:   (collectionId: string) => `tm_view-mode:${collectionId}`,
  tokenGroupBy: (collectionId: string) => `tm_group-by:${collectionId}`,
  tokenShowResolvedValues: (collectionId: string) => `tm_show_resolved_values:${collectionId}`,
  staleGeneratedBannerDismissed: (collectionId: string) => `tm_stale_generated_banner_dismissed:${collectionId}`,
  tokenExpansion: (collectionId: string) => `token-expand:${collectionId}`,
  editorDraft: (collectionId: string, tokenPath: string) => `tm_editor_draft:${collectionId}:${tokenPath}`,
  tableCreateDraft: (collectionId: string) => `tokenmanager:table-create-draft:${collectionId || '__default__'}`,
  modeColumnWidth: (collectionId: string, modeName: string) => `tm_mode_col_width:${collectionId}:${modeName}`,
};

/** Key prefix strings used for bulk-delete operations */
export const STORAGE_PREFIXES = {
  TOKEN_SORT:        'token-sort:',
  TOKEN_TYPE_FILTER: 'token-type-filter:',
  TOKEN_VIEW_MODE: 'tm_view-mode:',
  TOKEN_GROUP_BY: 'tm_group-by:',
  TOKEN_SHOW_RESOLVED_VALUES: 'tm_show_resolved_values:',
  STALE_GENERATED_BANNER_DISMISSED: 'tm_stale_generated_banner_dismissed:',
  TOKEN_EXPANSION: 'token-expand:',
  EDITOR_DRAFT: 'tm_editor_draft:',
  TABLE_CREATE_DRAFT: 'tokenmanager:table-create-draft:',
} as const;

const WORKSPACE_RECOVERY_RESET_KEYS = [
  STORAGE_KEYS.LIBRARY_BROWSE_COLLECTION_ID,
  STORAGE_KEYS.ACTIVE_TAB,
  STORAGE_KEYS.ACTIVE_TOP_TAB,
  STORAGE_KEYS.ACTIVE_SUB_TAB_LIBRARY,
  STORAGE_KEYS.ACTIVE_SUB_TAB_CANVAS,
  STORAGE_KEYS.ACTIVE_SUB_TAB_SYNC,
  STORAGE_KEYS.ACTIVE_SUB_TAB_EXPORT,
  STORAGE_KEYS.ACTIVE_SUB_TAB_VERSIONS,
  STORAGE_KEYS.ANALYTICS_CANONICAL,
  STORAGE_KEYS.COLLECTION_CARD_ORDER,
  STORAGE_KEYS.ACTIVE_RESOLVER,
  STORAGE_KEYS.RESOLVER_INPUT,
  STORAGE_KEYS.FIRST_RUN_DONE,
  STORAGE_KEYS.LAST_CREATE_GROUP,
  STORAGE_KEYS.LAST_CREATE_TYPE,
  STORAGE_KEYS.READINESS_CHANGE_KEY,
] as const;

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** Read a string value; returns null (or the provided fallback) on any error. */
export function lsGet(key: string): string | null;
export function lsGet(key: string, fallback: string): string;
export function lsGet(key: string, fallback?: string): string | null {
  const value = storageGet("local", key);
  return value ?? fallback ?? null;
}

/** Write a string value; silently ignores errors (quota, private mode). */
export function lsSet(key: string, value: string): void {
  storageSet("local", key, value);
}

/** Remove a key; silently ignores errors. */
export function lsRemove(key: string): void {
  storageRemove("local", key);
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/** Read and parse a JSON value; returns fallback on missing key or parse error. */
export function lsGetJson<T>(key: string, fallback: T): T {
  return storageGetJson("local", key, fallback);
}

/** Stringify and write a JSON value; silently ignores errors. */
export function lsSetJson<T>(key: string, value: T): void {
  storageSetJson("local", key, value);
}

/** Read a string value from sessionStorage; returns null (or fallback) on any error. */
export function ssGet(key: string): string | null;
export function ssGet(key: string, fallback: string): string;
export function ssGet(key: string, fallback?: string): string | null {
  const value = storageGet("session", key);
  return value ?? fallback ?? null;
}

/** Write a string value to sessionStorage; silently ignores errors. */
export function ssSet(key: string, value: string): void {
  storageSet("session", key, value);
}

/** Remove a sessionStorage key; silently ignores errors. */
export function ssRemove(key: string): void {
  storageRemove("session", key);
}

/** Read and parse a JSON value from sessionStorage; returns fallback on error. */
export function ssGetJson<T>(key: string, fallback: T): T {
  return storageGetJson("session", key, fallback);
}

/** Stringify and write a JSON value to sessionStorage; silently ignores errors. */
export function ssSetJson<T>(key: string, value: T): void {
  storageSetJson("session", key, value);
}

/** Snapshot all localStorage entries, falling back to an empty list when unavailable. */
export function lsEntries(): Array<[string, string]> {
  return storageEntries("local");
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * Remove all keys that start with any of the given prefixes.
 * Iterates localStorage in a single pass.
 */
function clearStorageByPrefix(kind: BrowserStorageKind, ...prefixes: string[]): void {
  for (const [key] of storageEntries(kind)) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      storageRemove(kind, key);
    }
  }
}

/**
 * Clear persisted workspace-selection state so a full data wipe can relaunch
 * the explicit recovery / Start here flow without stale onboarding flags.
 */
export function resetWorkspaceStateForRecovery(): void {
  for (const key of WORKSPACE_RECOVERY_RESET_KEYS) {
    lsRemove(key);
  }

  clearStorageByPrefix(
    "local",
    STORAGE_PREFIXES.TOKEN_SORT,
    STORAGE_PREFIXES.TOKEN_TYPE_FILTER,
    STORAGE_PREFIXES.TOKEN_VIEW_MODE,
    STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES,
    STORAGE_PREFIXES.STALE_GENERATED_BANNER_DISMISSED,
    STORAGE_PREFIXES.TOKEN_EXPANSION,
    STORAGE_PREFIXES.TABLE_CREATE_DRAFT,
  );

  clearStorageByPrefix(
    "session",
    STORAGE_PREFIXES.EDITOR_DRAFT,
  );
}
