/**
 * Single source of truth for all keyboard shortcut definitions.
 *
 * - SHORTCUT_KEYS: key combo constants (Mac display strings) for use in handlers and JSX
 * - SHORTCUT_REGISTRY: full metadata for every shortcut (used by KeyboardShortcutsModal)
 * - SHORTCUT_SECTIONS: registry grouped and ordered to match the help modal layout
 *
 * Handler logic (the actual e.key matching) stays in each component — only the
 * display strings are centralised here so the modal can never drift from reality.
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
  TOKEN_NEW:             'N',
  TOKEN_SEARCH:          '/',
  TOKEN_COPY:            '⌘C',
  TOKEN_COPY_CSS_VAR:    '⌘⇧C',
  TOKEN_MULTI_SELECT:    'M',
  TOKEN_EXPAND_ALL:      '⌘→',
  TOKEN_COLLAPSE_ALL:    '⌘←',
  TOKEN_RENAME:          'F2',
  TOKEN_DELETE:          '⌫',
  TOKEN_DUPLICATE:       '⌘D',
  // Paste Modal
  PASTE_CONFIRM:         '⌘↵',
} as const;

export type ShortcutKey = keyof typeof SHORTCUT_KEYS;

export const SHORTCUT_REGISTRY: ShortcutEntry[] = [
  // ── Global ──────────────────────────────────────────────────────────────
  { id: 'OPEN_PALETTE',          group: 'Global',          description: 'Open command palette',           mac: SHORTCUT_KEYS.OPEN_PALETTE },
  { id: 'EXPORT_WITH_PRESET',    group: 'Global',          description: 'Export with preset (palette)',   mac: SHORTCUT_KEYS.EXPORT_WITH_PRESET },
  { id: 'OPEN_TOKEN_SEARCH',     group: 'Global',          description: 'Open token search',              mac: SHORTCUT_KEYS.OPEN_TOKEN_SEARCH },
  { id: 'PASTE_TOKENS',          group: 'Global',          description: 'Paste tokens',                   mac: SHORTCUT_KEYS.PASTE_TOKENS },
  { id: 'OPEN_SETTINGS',         group: 'Global',          description: 'Open settings',                  mac: SHORTCUT_KEYS.OPEN_SETTINGS },
  { id: 'TOGGLE_PREVIEW',        group: 'Global',          description: 'Toggle preview panel',           mac: SHORTCUT_KEYS.TOGGLE_PREVIEW },
  { id: 'UNDO',                  group: 'Global',          description: 'Undo',                           mac: '⌘Z',                                  displayOnly: true },
  { id: 'REDO',                  group: 'Global',          description: 'Redo',                           mac: '⌘⇧Z', altMac: '⌘Y',                  displayOnly: true },

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
  { id: 'TOKEN_RENAME',          group: 'Token List',      description: 'Rename token',                   mac: SHORTCUT_KEYS.TOKEN_RENAME,    displayOnly: true },
  { id: 'TOKEN_DELETE',          group: 'Token List',      description: 'Delete token',                   mac: SHORTCUT_KEYS.TOKEN_DELETE,    altMac: 'Del', displayOnly: true },
  { id: 'TOKEN_DUPLICATE',       group: 'Token List',      description: 'Duplicate token',                mac: SHORTCUT_KEYS.TOKEN_DUPLICATE, displayOnly: true },

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
