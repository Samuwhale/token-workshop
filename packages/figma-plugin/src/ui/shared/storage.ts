/**
 * Centralized localStorage persistence utility.
 * All storage keys are declared here; components import keys and helpers
 * instead of sprinkling raw strings and try/catch blocks everywhere.
 */

type BrowserStorageKind = "local" | "session";

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

function getStorage(kind: BrowserStorageKind): Storage {
  const cached = storageCache[kind];
  if (cached) return cached;

  try {
    const root =
      typeof window !== "undefined"
        ? window
        : (globalThis as typeof globalThis & {
            localStorage?: Storage;
            sessionStorage?: Storage;
          });
    const storage =
      kind === "local" ? root.localStorage : root.sessionStorage;
    if (!storage) throw new Error(`${kind}Storage is unavailable.`);
    storageCache[kind] = storage;
    return storage;
  } catch (error) {
    console.debug(`[storage] ${kind}Storage unavailable; using memory fallback:`, error);
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
  PREVIEW_SPLIT:         'tm_preview_split',
  PREVIEW_SPLIT_RATIO:   'tm_preview_split_ratio',
  CURRENT_COLLECTION_ID: 'tm_current_collection_id',
  ACTIVE_TAB:            'tm_active_tab',
  ACTIVE_TOP_TAB:        'tm_active_top_tab',
  ACTIVE_SUB_TAB_TOKENS:  'tm_sub_tab_tokens',
  ACTIVE_SUB_TAB_RECIPES: 'tm_sub_tab_recipes',
  ACTIVE_SUB_TAB_COLLECTIONS:  'tm_sub_tab_collections',
  ACTIVE_SUB_TAB_INSPECT: 'tm_sub_tab_inspect',
  ACTIVE_SUB_TAB_SYNC:    'tm_sub_tab_sync',
  SELECTED_MODES:        'tm_selected_modes',
  COLLAPSED_FOLDERS:     'tm_collapsed_folders',
  SERVER_URL:            'tokenmanager_server_url',
  PALETTE_RECENT:        'tm_palette_recent',
  ANALYTICS_CANONICAL:   'analytics_canonicalPick',
  IMPORT_TARGET_COLLECTION: 'tm_import_target_collection',
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
  DENSITY:               'tm_density',
  ADVANCED_MODE:         'tm_advanced_mode',
  CONTRAST_BG:           'tm_contrast_bg',
  FIRST_RUN_DONE:        'tm_first_run_done',
  DEEP_INSPECT:          'tm_deep_inspect',
  RECENT_TOKENS:         'tm_recent_tokens',
  CROSS_COLLECTION_RECENTS: 'tm_cross_collection_recents',
  STARRED_TOKENS:        'tm_starred_tokens',
  PREFERRED_COPY_FORMAT: 'tm_preferred_copy_format',
  CONDENSED_VIEW:        'tm_condensed_view',
  TOKEN_STATS_BAR_OPEN:  'tm_token_stats_bar_open',
  INSPECT_PROP_FILTER:      'tm_inspect_prop_filter',
  INSPECT_PROP_FILTER_MODE: 'tm_inspect_prop_filter_mode',
  SETTINGS_ACTIVE_TAB:      'tm_settings_active_tab',
  FILTER_PRESETS:           'tm_filter_presets',
  ACTIVE_RESOLVER:          'tm_active_resolver',
  RESOLVER_INPUT:           'tm_resolver_input',
  EDITOR_WIDTH:             'tm_editor_width',
  SIDEBAR_COLLAPSED:        'tm_sidebar_collapsed',
} as const;

/** Dynamic key builders for collection-scoped client view state. */
export const STORAGE_KEY_BUILDERS = {
  tokenSort:       (collectionId: string) => `token-sort:${collectionId}`,
  tokenTypeFilter: (collectionId: string) => `token-type-filter:${collectionId}`,
  pinnedTokens:    (collectionId: string) => `tm_pinned:${collectionId}`,
  tokenViewMode:   (collectionId: string) => `tm_view-mode:${collectionId}`,
  tokenShowResolvedValues: (collectionId: string) => `tm_show_resolved_values:${collectionId}`,
  staleRecipeBannerDismissed: (collectionId: string) => `tm_stale_recipe_banner_dismissed:${collectionId}`,
  tokenExpansion: (collectionId: string) => `token-expand:${collectionId}`,
  editorDraft: (collectionId: string, tokenPath: string) => `tm_editor_draft:${collectionId}:${tokenPath}`,
  tableCreateDraft: (collectionId: string) => `tokenmanager:table-create-draft:${collectionId || '__default__'}`,
};

/** Key prefix strings used for bulk-delete operations */
export const STORAGE_PREFIXES = {
  TOKEN_SORT:        'token-sort:',
  TOKEN_TYPE_FILTER: 'token-type-filter:',
  TOKEN_SHOW_RESOLVED_VALUES: 'tm_show_resolved_values:',
} as const;

const WORKSPACE_RECOVERY_RESET_KEYS = [
  STORAGE_KEYS.CURRENT_COLLECTION_ID,
  STORAGE_KEYS.ACTIVE_TAB,
  STORAGE_KEYS.ACTIVE_TOP_TAB,
  STORAGE_KEYS.ACTIVE_SUB_TAB_TOKENS,
  STORAGE_KEYS.ACTIVE_SUB_TAB_RECIPES,
  STORAGE_KEYS.ACTIVE_SUB_TAB_COLLECTIONS,
  STORAGE_KEYS.ACTIVE_SUB_TAB_INSPECT,
  STORAGE_KEYS.ACTIVE_SUB_TAB_SYNC,
  STORAGE_KEYS.ANALYTICS_CANONICAL,
  STORAGE_KEYS.IMPORT_TARGET_COLLECTION,
  STORAGE_KEYS.COLLECTION_CARD_ORDER,
  STORAGE_KEYS.ACTIVE_RESOLVER,
  STORAGE_KEYS.RESOLVER_INPUT,
  STORAGE_KEYS.FIRST_RUN_DONE,
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
export function lsClearByPrefix(...prefixes: string[]): void {
  for (const [key] of lsEntries()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      lsRemove(key);
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
  lsClearByPrefix(
    STORAGE_PREFIXES.TOKEN_SORT,
    STORAGE_PREFIXES.TOKEN_TYPE_FILTER,
    STORAGE_PREFIXES.TOKEN_SHOW_RESOLVED_VALUES,
  );
}
