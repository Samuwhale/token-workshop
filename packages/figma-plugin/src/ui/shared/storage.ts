/**
 * Centralized localStorage persistence utility.
 * All storage keys are declared here; components import keys and helpers
 * instead of sprinkling raw strings and try/catch blocks everywhere.
 */

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  EXPANDED:              'tm_expanded',
  PREVIEW_SPLIT:         'tm_preview_split',
  PREVIEW_SPLIT_RATIO:   'tm_preview_split_ratio',
  ACTIVE_SET:            'tm_active_set',
  ACTIVE_TAB:            'tm_active_tab',
  ACTIVE_TOP_TAB:        'tm_active_top_tab',
  ACTIVE_SUB_TAB_DEFINE: 'tm_sub_tab_define',
  ACTIVE_SUB_TAB_APPLY:  'tm_sub_tab_apply',
  ACTIVE_SUB_TAB_SHIP:   'tm_sub_tab_ship',
  ACTIVE_THEMES:         'tm_active_themes',
  COLLAPSED_FOLDERS:     'tm_collapsed_folders',
  SERVER_URL:            'tokenmanager_server_url',
  PALETTE_RECENT:        'tm_palette_recent',
  ANALYTICS_CANONICAL:   'analytics_canonicalPick',
  IMPORT_TARGET_SET:     'importTargetSet',
  THEME_CARD_ORDER:      'themeCardOrder',
  EXPORT_PLATFORMS:      'exportPanel.selectedPlatforms',
  EXPORT_CSS_SELECTOR:   'exportPanel.cssSelector',
  EXPORT_ZIP_FILENAME:   'exportPanel.zipFilename',
  EXPORT_NEST_PLATFORM:  'exportPanel.nestByPlatform',
  EXPORT_TYPES:          'exportPanel.selectedTypes',
  EXPORT_PATH_PREFIX:    'exportPanel.pathPrefix',
  EXPORT_PRESETS:        'exportPanel.presets',
  EXPORT_PRESET_APPLY:   'exportPanel.presetApply',
  EXPORT_CHANGES_ONLY:   'exportPanel.changesOnly',
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
  PREFERRED_COPY_FORMAT: 'tm_preferred_copy_format',
} as const;

/** Per-set dynamic key builders */
export const STORAGE_KEY = {
  tokenSort:       (setName: string) => `token-sort:${setName}`,
  tokenTypeFilter: (setName: string) => `token-type-filter:${setName}`,
  pinnedTokens:    (setName: string) => `tm_pinned:${setName}`,
  tokenViewMode:   (setName: string) => `tm_view-mode:${setName}`,
};

/** Key prefix strings used for bulk-delete operations */
export const STORAGE_PREFIXES = {
  TOKEN_SORT:        'token-sort:',
  TOKEN_TYPE_FILTER: 'token-type-filter:',
} as const;

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** Read a string value; returns null (or the provided fallback) on any error. */
export function lsGet(key: string): string | null;
export function lsGet(key: string, fallback: string): string;
export function lsGet(key: string, fallback?: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
    return fallback ?? null;
  } catch (e) {
    console.debug('[storage] read failed:', key, e);
    return fallback ?? null;
  }
}

/** Write a string value; silently ignores errors (quota, private mode). */
export function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch (e) { console.debug('[storage] write failed:', key, e); }
}

/** Remove a key; silently ignores errors. */
export function lsRemove(key: string): void {
  try { localStorage.removeItem(key); } catch (e) { console.debug('[storage] remove failed:', key, e); }
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/** Read and parse a JSON value; returns fallback on missing key or parse error. */
export function lsGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    console.debug('[storage] JSON read failed:', key, e);
    return fallback;
  }
}

/** Stringify and write a JSON value; silently ignores errors. */
export function lsSetJson<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.debug('[storage] JSON write failed:', key, e); }
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * Remove all keys that start with any of the given prefixes.
 * Iterates localStorage in a single pass.
 */
export function lsClearByPrefix(...prefixes: string[]): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefixes.some(p => k.startsWith(p))) toRemove.push(k);
    }
    for (const k of toRemove) {
      try { localStorage.removeItem(k); } catch (e) { console.debug('[storage] prefix remove failed:', k, e); }
    }
  } catch (e) { console.debug('[storage] prefix clear failed:', e); }
}
