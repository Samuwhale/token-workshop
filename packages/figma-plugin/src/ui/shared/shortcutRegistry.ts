/**
 * Single source of truth for all keyboard shortcut definitions.
 *
 * - SHORTCUT_KEYS: key combo constants (Mac display strings) for use in handlers and JSX
 * - SHORTCUT_MATCHERS: key-matching descriptors (actual e.key + modifier flags) for handlers
 * - matchesShortcut(e, id): helper to check whether a keyboard event matches a named shortcut
 * - SHORTCUT_REGISTRY: full metadata for every shortcut (used by KeyboardShortcutsModal)
 * - SHORTCUT_SECTIONS: registry grouped and ordered to match the help modal layout
 *
 * Handler files import matchesShortcut and SHORTCUT_KEYS rather than hard-coding key
 * strings, so the registry is the single source of truth for both display AND behaviour.
 */

export type ShortcutGroup =
  | 'Global'
  | 'Navigation'
  | 'Command Palette'
  | 'Token Search'
  | 'Inspect'
  | 'Token List'
  | 'Token Editor'
  | 'Paste Modal';

export interface ShortcutEntry {
  /** Stable identifier matching a SHORTCUT_KEYS key where applicable */
  id: string;
  group: ShortcutGroup;
  description: string;
  /**
   * Mac display string — the canonical form, e.g. '⌘K', '⌘⇧V'.
   * Pass through adaptShortcut() at render time to get a platform-aware label.
   * For entries with multiple alternates (Redo), use altMac.
   * For qualifier entries this is the example syntax string, e.g. 'type:color'.
   */
  mac: string;
  /** Optional alternate shortcut shown after a '/' separator in the modal */
  altMac?: string;
  /**
   * When true, this shortcut is documented in the modal but not backed by a
   * named SHORTCUT_KEYS constant — e.g. navigation keys, mouse gestures.
   */
  displayOnly?: true;
  /**
   * When true, this entry describes a search qualifier (not a keyboard shortcut).
   * The modal renders these with code styling instead of kbd styling.
   */
  qualifier?: true;
}

/** Mac display strings for every named shortcut. Import these in handler files. */
export const SHORTCUT_KEYS = {
  // Global
  OPEN_PALETTE:          '⌘K',
  EXPORT_WITH_PRESET:    '⌘⇧E',
  OPEN_TOKEN_SEARCH:     '⌘⇧F',
  PASTE_TOKENS:          '⌘⇧V',
  OPEN_SETTINGS:         '⌘,',
  SHOW_SHORTCUTS:        '?',
  TOGGLE_QUICK_APPLY:    '⌘⇧A',
  QUICK_SWITCH_SET:      '⌘⇧S',
  TOGGLE_PREVIEW:        '⌘P',
  // Navigation
  GO_TO_DEFINE:          '⌘1',
  GO_TO_APPLY:           '⌘2',
  GO_TO_SHIP:            '⌘3',
  GO_TO_RESOLVER:        '⌘⇧R',
  // Inspect / Selection
  CREATE_FROM_SELECTION: '⌘T',
  TOGGLE_DEEP_INSPECT:   '⌘⇧D',
  NEXT_LINT_ISSUE:       'F8',
  // Token Editor
  EDITOR_SAVE:           '⌘↵',
  EDITOR_SAVE_AND_NEW:   '⌘⇧↵',
  EDITOR_TOGGLE_ALIAS:   '⌘L',
  EDITOR_NEXT_TOKEN:     '⌘]',
  EDITOR_PREV_TOKEN:     '⌘[',
  // Token List
  TOKEN_NEW:             '⌘N',
  TOKEN_SEARCH:          '/',
  TOKEN_COPY:            '⌘C',
  TOKEN_COPY_CSS_VAR:    '⌘⇧C',
  TOKEN_MULTI_SELECT:    'M',
  TOKEN_EXPAND_ALL:      '⌘→',
  TOKEN_COLLAPSE_ALL:    '⌘←',
  TOKEN_APPLY_SELECTION: 'V',
  TOKEN_RENAME:          'F2',
  TOKEN_DELETE:          '⌫',
  TOKEN_DUPLICATE:       '⌘D',
  TOKEN_BATCH_MOVE_TO_SET: '⌘⇧M',
  TOKEN_BATCH_COPY_TO_SET: '⌘⇧Y',
  // Paste Modal
  PASTE_CONFIRM:         '⌘↵',
} as const;

export type ShortcutKey = keyof typeof SHORTCUT_KEYS;

// ---------------------------------------------------------------------------
// Key matchers — the runtime matching data for each named shortcut.
// ---------------------------------------------------------------------------

/**
 * Describes exactly which key combination triggers a shortcut.
 *
 * - `key`: `e.key` value to match (case-insensitive for letter keys; use exact case
 *   for special keys like 'Enter', 'Backspace', 'F8', 'ArrowRight').
 * - `meta`: when true, metaKey OR ctrlKey must be held; when false, neither may be held;
 *   when undefined, this modifier is not checked (use only for keys like '?' whose shift
 *   state is implied by the character itself on most keyboard layouts).
 * - `shift`: when true, shiftKey must be held; when false, it must not be; undefined = not checked.
 * - `alt`: when true, altKey must be held; when false, it must not be; undefined = not checked.
 *
 * Unspecified (undefined) modifier fields are NOT checked — this is intentional only for
 * special cases where the modifier state is implied by `e.key` (e.g. '?' always requires
 * shift on US keyboards, so checking `shift: false` would break the shortcut).
 */
export interface KeyMatcher {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Key-matching descriptor for every named shortcut.
 * Handlers import `matchesShortcut` and pass one of these ids — they never hard-code
 * key strings or modifier checks.
 *
 * Note: EDITOR_SAVE and PASTE_CONFIRM share the same combo (⌘↵). This is intentional —
 * the two handlers are active in mutually-exclusive modal contexts so there is no runtime
 * conflict, but the dev-mode checker will log an informational note about the duplication.
 */
export const SHORTCUT_MATCHERS: Partial<Record<ShortcutKey, KeyMatcher>> = {
  // Global
  OPEN_PALETTE:          { key: 'k',          meta: true,  shift: false, alt: false },
  EXPORT_WITH_PRESET:    { key: 'e',          meta: true,  shift: true,  alt: false },
  OPEN_TOKEN_SEARCH:     { key: 'f',          meta: true,  shift: true,  alt: false },
  PASTE_TOKENS:          { key: 'v',          meta: true,  shift: true,  alt: false },
  OPEN_SETTINGS:         { key: ',',          meta: true,  shift: false, alt: false },
  SHOW_SHORTCUTS:        { key: '?',          meta: false },                           // shift not checked: '?' implies Shift on US keyboards
  TOGGLE_QUICK_APPLY:    { key: 'a',          meta: true,  shift: true,  alt: false },
  QUICK_SWITCH_SET:      { key: 's',          meta: true,  shift: true,  alt: false },
  TOGGLE_PREVIEW:        { key: 'p',          meta: true,  shift: false, alt: false },
  // Navigation
  GO_TO_DEFINE:          { key: '1',          meta: true,  shift: false, alt: false },
  GO_TO_APPLY:           { key: '2',          meta: true,  shift: false, alt: false },
  GO_TO_SHIP:            { key: '3',          meta: true,  shift: false, alt: false },
  GO_TO_RESOLVER:        { key: 'r',          meta: true,  shift: true,  alt: false },
  // Inspect
  CREATE_FROM_SELECTION: { key: 't',          meta: true,  shift: false, alt: false },
  TOGGLE_DEEP_INSPECT:   { key: 'd',          meta: true,  shift: true,  alt: false },
  NEXT_LINT_ISSUE:       { key: 'F8',         meta: false, shift: false, alt: false },
  // Token Editor
  EDITOR_SAVE:           { key: 'Enter',      meta: true,  shift: false, alt: false },
  EDITOR_SAVE_AND_NEW:   { key: 'Enter',      meta: true,  shift: true,  alt: false },
  EDITOR_TOGGLE_ALIAS:   { key: 'l',          meta: true,  shift: false, alt: false },
  EDITOR_NEXT_TOKEN:     { key: ']',          meta: true,  shift: false, alt: false },
  EDITOR_PREV_TOKEN:     { key: '[',          meta: true,  shift: false, alt: false },
  // Token List
  TOKEN_NEW:             { key: 'n',          meta: true,  shift: false, alt: false },
  TOKEN_SEARCH:          { key: '/',          meta: false, shift: false, alt: false },
  TOKEN_COPY:            { key: 'c',          meta: true,  shift: false, alt: false },
  TOKEN_COPY_CSS_VAR:    { key: 'c',          meta: true,  shift: true,  alt: false },
  TOKEN_MULTI_SELECT:    { key: 'm',          meta: false, shift: false, alt: false },
  TOKEN_EXPAND_ALL:      { key: 'ArrowRight', meta: true,  shift: false, alt: false },
  TOKEN_COLLAPSE_ALL:    { key: 'ArrowLeft',  meta: true,  shift: false, alt: false },
  TOKEN_APPLY_SELECTION: { key: 'v',          meta: false, shift: false, alt: false },
  TOKEN_RENAME:            { key: 'F2',         meta: false, shift: false, alt: false },
  TOKEN_DELETE:            { key: 'Backspace',  meta: false, shift: false, alt: false },
  TOKEN_DUPLICATE:         { key: 'd',          meta: true,  shift: false, alt: false },
  TOKEN_BATCH_MOVE_TO_SET: { key: 'm',          meta: true,  shift: true,  alt: false },
  TOKEN_BATCH_COPY_TO_SET: { key: 'y',          meta: true,  shift: true,  alt: false },
  // Paste Modal (same combo as EDITOR_SAVE — context-only, not a real conflict)
  PASTE_CONFIRM:         { key: 'Enter',      meta: true,  shift: false, alt: false },
};

/**
 * Returns true when a keyboard event matches the named shortcut's combo exactly.
 *
 * Accepts both native `KeyboardEvent` and React synthetic keyboard events.
 * Key comparison is case-insensitive (handles e.g. 'A' vs 'a' when shift is held).
 * Only modifier fields that are NOT `undefined` in the matcher are checked, so
 * shortcuts with partial specs (like SHOW_SHORTCUTS) behave as documented above.
 */
export function matchesShortcut(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  id: ShortcutKey,
): boolean {
  const m = SHORTCUT_MATCHERS[id];
  if (!m) return false;
  if (e.key.toLowerCase() !== m.key.toLowerCase()) return false;
  const hasMeta = e.metaKey || e.ctrlKey;
  if (m.meta !== undefined && !!m.meta !== hasMeta) return false;
  if (m.shift !== undefined && !!m.shift !== e.shiftKey) return false;
  if (m.alt !== undefined && !!m.alt !== e.altKey) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Dev-mode conflict detection — runs once at module load in non-production builds
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
  (() => {
    const seen = new Map<string, string>();
    for (const [id, matcher] of Object.entries(SHORTCUT_MATCHERS) as [string, KeyMatcher | undefined][]) {
      if (!matcher) continue;
      // Build a canonical signature; undefined modifier fields are skipped
      const sig = [
        matcher.key.toLowerCase(),
        `meta:${matcher.meta ?? '*'}`,
        `shift:${matcher.shift ?? '*'}`,
        `alt:${matcher.alt ?? '*'}`,
      ].join('|');
      const prev = seen.get(sig);
      if (prev) {
        // Only log an info note for known context-only duplicates; warn for unexpected ones
        const known = new Set(['EDITOR_SAVE|PASTE_CONFIRM', 'PASTE_CONFIRM|EDITOR_SAVE']);
        const pair = `${prev}|${id}`;
        if (!known.has(pair)) {
          console.warn(`[ShortcutRegistry] ⚠ Conflict: "${id}" shares combo "${sig}" with "${prev}"`);
        } else {
          console.info(`[ShortcutRegistry] Context-only duplicate: "${id}" and "${prev}" share "${sig}" — intentional`);
        }
      } else {
        seen.set(sig, id);
      }
    }
  })();
}

export const SHORTCUT_REGISTRY: ShortcutEntry[] = [
  // ── Global ──────────────────────────────────────────────────────────────
  { id: 'OPEN_PALETTE',          group: 'Global',          description: 'Open command palette',           mac: SHORTCUT_KEYS.OPEN_PALETTE },
  { id: 'EXPORT_WITH_PRESET',    group: 'Global',          description: 'Export with preset (palette)',   mac: SHORTCUT_KEYS.EXPORT_WITH_PRESET },
  { id: 'OPEN_TOKEN_SEARCH',     group: 'Global',          description: 'Open token search',              mac: SHORTCUT_KEYS.OPEN_TOKEN_SEARCH },
  { id: 'PASTE_TOKENS',          group: 'Global',          description: 'Paste tokens',                   mac: SHORTCUT_KEYS.PASTE_TOKENS },
  { id: 'OPEN_SETTINGS',         group: 'Global',          description: 'Open settings',                  mac: SHORTCUT_KEYS.OPEN_SETTINGS },
  { id: 'TOGGLE_PREVIEW',        group: 'Global',          description: 'Toggle preview panel',           mac: SHORTCUT_KEYS.TOGGLE_PREVIEW },
  { id: 'UNDO',                  group: 'Global',          description: 'Undo',                           mac: '⌘Z' },
  { id: 'REDO',                  group: 'Global',          description: 'Redo',                           mac: '⌘⇧Z', altMac: '⌘Y' },

  // ── Navigation ──────────────────────────────────────────────────────────
  { id: 'GO_TO_DEFINE',          group: 'Navigation',      description: 'Go to Define',                   mac: SHORTCUT_KEYS.GO_TO_DEFINE },
  { id: 'GO_TO_APPLY',           group: 'Navigation',      description: 'Go to Apply',                    mac: SHORTCUT_KEYS.GO_TO_APPLY },
  { id: 'GO_TO_SHIP',            group: 'Navigation',      description: 'Go to Ship',                     mac: SHORTCUT_KEYS.GO_TO_SHIP },
  { id: 'GO_TO_RESOLVER',        group: 'Navigation',      description: 'Open DTCG Resolver (in Themes)',  mac: SHORTCUT_KEYS.GO_TO_RESOLVER },
  { id: 'QUICK_SWITCH_SET',      group: 'Navigation',      description: 'Quick-switch token set',         mac: SHORTCUT_KEYS.QUICK_SWITCH_SET },

  // ── Command Palette ──────────────────────────────────────────────────────
  { id: 'PALETTE_NAVIGATE',      group: 'Command Palette', description: 'Navigate results',               mac: '↑↓',    displayOnly: true },
  { id: 'PALETTE_RUN',           group: 'Command Palette', description: 'Run selected command',           mac: '↵',     displayOnly: true },
  { id: 'PALETTE_TOKEN_MODE',    group: 'Command Palette', description: 'Switch to token search',         mac: '>',     displayOnly: true },
  { id: 'PALETTE_CLOSE',         group: 'Command Palette', description: 'Close palette',                  mac: 'Esc',   displayOnly: true },

  // ── Token Search qualifiers ──────────────────────────────────────────────
  { id: 'QUALIFIER_TYPE',        group: 'Token Search',    description: 'Filter by token type',                       mac: 'type:color',          displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_HAS_ALIAS',   group: 'Token Search',    description: 'Only reference (alias) tokens',              mac: 'has:alias',           displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_HAS_DIRECT',  group: 'Token Search',    description: 'Only direct-value tokens',                   mac: 'has:direct',          displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_HAS_DUP',     group: 'Token Search',    description: 'Only tokens with duplicate values',          mac: 'has:duplicate',       displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_HAS_DESC',    group: 'Token Search',    description: 'Only tokens with a description',             mac: 'has:description',     displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_HAS_EXT',     group: 'Token Search',    description: 'Only tokens with extensions',                mac: 'has:extension',       displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_HAS_GEN',     group: 'Token Search',    description: 'Only generator-produced tokens',             mac: 'has:generated',       displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_HAS_UNUSED',  group: 'Token Search',    description: 'Tokens with no Figma usage or dependents',   mac: 'has:unused',          displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_VALUE',       group: 'Token Search',    description: 'Search within token values',                 mac: 'value:#ff0000',       displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_DESC',        group: 'Token Search',    description: 'Search within descriptions',                 mac: 'desc:primary',        displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_PATH',        group: 'Token Search',    description: 'Filter by path prefix',                      mac: 'path:colors.brand',   displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_NAME',        group: 'Token Search',    description: 'Search by leaf name only',                   mac: 'name:500',            displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_GENERATOR',   group: 'Token Search',    description: 'Filter by generator name',                   mac: 'generator:color-ramp', displayOnly: true, qualifier: true },
  { id: 'QUALIFIER_GROUP',       group: 'Token Search',    description: 'Navigate to a group path',                   mac: 'group:colors.brand',  displayOnly: true, qualifier: true },

  // ── Inspect ──────────────────────────────────────────────────────────────
  { id: 'TOGGLE_QUICK_APPLY',    group: 'Inspect',         description: 'Quick apply token to selection', mac: SHORTCUT_KEYS.TOGGLE_QUICK_APPLY },
  { id: 'CREATE_FROM_SELECTION', group: 'Inspect',         description: 'Create token from selection',    mac: SHORTCUT_KEYS.CREATE_FROM_SELECTION },
  { id: 'TOGGLE_DEEP_INSPECT',   group: 'Inspect',         description: 'Toggle deep inspect',            mac: SHORTCUT_KEYS.TOGGLE_DEEP_INSPECT },

  // ── Token List ───────────────────────────────────────────────────────────
  { id: 'TOKEN_NEW',             group: 'Token List',      description: 'New token',                      mac: SHORTCUT_KEYS.TOKEN_NEW },
  { id: 'TOKEN_APPLY_SELECTION', group: 'Token List',      description: 'Apply focused token to selection', mac: SHORTCUT_KEYS.TOKEN_APPLY_SELECTION },
  { id: 'TOKEN_DBLCLICK',        group: 'Token List',      description: 'Edit token',                     mac: 'Double-click', displayOnly: true },
  { id: 'TOKEN_SEARCH',          group: 'Token List',      description: 'Focus search',                   mac: SHORTCUT_KEYS.TOKEN_SEARCH },
  { id: 'TOKEN_MULTI_SELECT',    group: 'Token List',      description: 'Toggle multi-select mode',       mac: SHORTCUT_KEYS.TOKEN_MULTI_SELECT },
  { id: 'TOKEN_NAV_ROWS',        group: 'Token List',      description: 'Navigate rows',                  mac: '↑↓',    displayOnly: true },
  { id: 'TOKEN_EXPAND_GROUP',    group: 'Token List',      description: 'Collapse / expand group',        mac: '←→',    displayOnly: true },
  { id: 'TOKEN_ESC',             group: 'Token List',      description: 'Exit multi-select / close form', mac: 'Esc',   displayOnly: true },
  { id: 'TOKEN_COPY',            group: 'Token List',      description: 'Copy selected tokens as JSON',   mac: SHORTCUT_KEYS.TOKEN_COPY },
  { id: 'TOKEN_COPY_CSS_VAR',   group: 'Token List',      description: 'Copy token value (preferred format — set in Settings)', mac: SHORTCUT_KEYS.TOKEN_COPY_CSS_VAR },
  { id: 'TOKEN_EXPAND_ALL',      group: 'Token List',      description: 'Expand all groups',              mac: SHORTCUT_KEYS.TOKEN_EXPAND_ALL },
  { id: 'TOKEN_COLLAPSE_ALL',    group: 'Token List',      description: 'Collapse all groups',            mac: SHORTCUT_KEYS.TOKEN_COLLAPSE_ALL },
  { id: 'TOKEN_RENAME',            group: 'Token List',      description: 'Rename token',                              mac: SHORTCUT_KEYS.TOKEN_RENAME,    displayOnly: true },
  { id: 'TOKEN_DELETE',            group: 'Token List',      description: 'Delete token / delete selected (batch)',    mac: SHORTCUT_KEYS.TOKEN_DELETE,    altMac: 'Del' },
  { id: 'TOKEN_DUPLICATE',         group: 'Token List',      description: 'Duplicate token',                           mac: SHORTCUT_KEYS.TOKEN_DUPLICATE, displayOnly: true },
  { id: 'TOKEN_BATCH_MOVE_TO_SET', group: 'Token List',      description: 'Move selected tokens to another set',       mac: SHORTCUT_KEYS.TOKEN_BATCH_MOVE_TO_SET },
  { id: 'TOKEN_BATCH_COPY_TO_SET', group: 'Token List',      description: 'Copy selected tokens to another set',       mac: SHORTCUT_KEYS.TOKEN_BATCH_COPY_TO_SET },

  // ── Token Editor ─────────────────────────────────────────────────────────
  { id: 'EDITOR_NEXT',           group: 'Token Editor',    description: 'Next token',                     mac: SHORTCUT_KEYS.EDITOR_NEXT_TOKEN },
  { id: 'EDITOR_PREV',           group: 'Token Editor',    description: 'Previous token',                 mac: SHORTCUT_KEYS.EDITOR_PREV_TOKEN },
  { id: 'EDITOR_TOGGLE_ALIAS',   group: 'Token Editor',    description: 'Toggle reference mode',          mac: SHORTCUT_KEYS.EDITOR_TOGGLE_ALIAS },
  { id: 'EDITOR_SAVE',           group: 'Token Editor',    description: 'Save token',                     mac: SHORTCUT_KEYS.EDITOR_SAVE },
  { id: 'EDITOR_SAVE_NEW',       group: 'Token Editor',    description: 'Save and create another',        mac: SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW },
  { id: 'EDITOR_ESC',            group: 'Token Editor',    description: 'Back / discard',                 mac: 'Esc',   displayOnly: true },

  // ── Paste Modal ───────────────────────────────────────────────────────────
  { id: 'PASTE_CONFIRM',         group: 'Paste Modal',     description: 'Confirm paste',                  mac: SHORTCUT_KEYS.PASTE_CONFIRM },
];

const GROUP_ORDER: ShortcutGroup[] = [
  'Global',
  'Navigation',
  'Command Palette',
  'Token Search',
  'Inspect',
  'Token List',
  'Token Editor',
  'Paste Modal',
];

export const SHORTCUT_SECTIONS = GROUP_ORDER.map(header => ({
  header,
  shortcuts: SHORTCUT_REGISTRY.filter(e => e.group === header),
}));
