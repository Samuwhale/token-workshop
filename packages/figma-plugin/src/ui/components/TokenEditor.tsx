import { getErrorMessage, adaptShortcut } from '../shared/utils';
import { SHORTCUT_KEYS } from '../shared/shortcutRegistry';
import { Spinner } from './Spinner';
import { apiFetch } from '../shared/apiFetch';
import { TokenHistorySection } from './TokenHistorySection';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { resolveRefValue } from '@tokenmanager/core';
import type { ThemeDimension } from '@tokenmanager/core';
import { ConfirmModal } from './ConfirmModal';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { ColorModifierOp } from '@tokenmanager/core';
import { validateColorModifiers } from '@tokenmanager/core';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';
import { ValueDiff, OriginalValuePreview } from './ValueDiff';
import type { TokenGenerator } from '../hooks/useGenerators';
import { COMPOSITE_TOKEN_TYPES } from '@tokenmanager/core';
import { ColorEditor, DimensionEditor, TypographyEditor, ShadowEditor, BorderEditor, GradientEditor, NumberEditor, DurationEditor, FontFamilyEditor, FontWeightEditor, StrokeStyleEditor, StringEditor, BooleanEditor, CompositionEditor, AssetEditor, FontStyleEditor, TextDecorationEditor, TextTransformEditor, PercentageEditor, LinkEditor, LetterSpacingEditor, LineHeightEditor, CubicBezierEditor, TransitionEditor, CustomEditor, VALUE_FORMAT_HINTS } from './ValueEditors';
import { AliasPicker, resolveAliasChain } from './AliasPicker';
import { resolveTokenValue, isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { ContrastChecker } from './ContrastChecker';
import { ColorModifiersEditor } from './ColorModifiersEditor';
import { TokenUsages } from './TokenUsages';
import { MetadataEditor } from './MetadataEditor';
import { PathAutocomplete } from './PathAutocomplete';
import { useNearbyTokenMatch } from '../hooks/useNearbyTokenMatch';
import { TokenNudge } from './TokenNudge';

/**
 * Returns the cycle path (e.g. ["a", "b", "c", "a"]) if following `ref`
 * from `currentTokenPath` would create a cycle, or null if no cycle.
 */
function detectAliasCycle(
  ref: string,
  currentTokenPath: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): string[] | null {
  const visited = new Set<string>([currentTokenPath]);
  const chain: string[] = [currentTokenPath];
  let current = isAlias(ref) ? extractAliasPath(ref)! : ref;
  while (true) {
    if (visited.has(current)) {
      const cycleStart = chain.indexOf(current);
      return [...chain.slice(cycleStart), current];
    }
    visited.add(current);
    chain.push(current);
    const entry = allTokensFlat[current];
    if (!entry) return null;
    const v = entry.$value;
    if (isAlias(v)) {
      current = extractAliasPath(v)!;
    } else {
      return null;
    }
  }
}

/** Compact picker for selecting a base token to extend. */
function ExtendsTokenPicker({ tokenType, allTokensFlat, pathToSet, currentPath, onSelect }: {
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  currentPath: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const candidates = useMemo(() => {
    return Object.entries(allTokensFlat)
      .filter(([p, e]) => e.$type === tokenType && p !== currentPath)
      .map(([p]) => p);
  }, [allTokensFlat, tokenType, currentPath]);
  const filteredAll = useMemo(() => {
    if (!search) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(p => p.toLowerCase().includes(q));
  }, [candidates, search]);
  const filtered = useMemo(() => filteredAll.slice(0, 50), [filteredAll]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="w-full px-2 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors text-left"
      >
        + Set base token to inherit from…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${tokenType} tokens…`}
          className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[11px] text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)]"
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setSearch(''); } }}
        />
        <button
          type="button"
          onClick={() => { setOpen(false); setSearch(''); }}
          className="px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >Cancel</button>
      </div>
      {filteredAll.length > 50 && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] px-0.5">
          Showing 50 of {filteredAll.length} — refine search to narrow results
        </p>
      )}
      <div className="max-h-32 overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {filtered.length === 0 && (
          <p className="px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">No matching {tokenType} tokens</p>
        )}
        {filtered.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => { onSelect(p); setOpen(false); setSearch(''); }}
            className="w-full text-left px-2 py-1 text-[11px] font-mono text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] truncate"
            title={`${p} (${pathToSet[p] || ''})`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Parse a raw clipboard/initial string value into the shape the editor expects for the given type. */
function parseInitialValueForType(type: string, raw: string): any {
  const v = raw.trim();
  if (type === 'color') return v;
  if (type === 'dimension') {
    const m = v.match(/^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || 'px' };
    return v;
  }
  if (type === 'duration') {
    const m = v.match(/^(-?\d*\.?\d+)\s*(ms|s)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || 'ms' };
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  if (type === 'number' || type === 'fontWeight') {
    const n = parseFloat(v);
    return isNaN(n) ? v : n;
  }
  if (type === 'boolean') {
    return v.toLowerCase() === 'true';
  }
  return v;
}

/** Suggested namespace prefixes per token type to help new users build consistent hierarchies. */
const NAMESPACE_SUGGESTIONS: Record<string, { prefixes: string[]; example: string }> = {
  color: { prefixes: ['color.'], example: 'color.brand.primary' },
  dimension: { prefixes: ['spacing.', 'sizing.', 'radius.'], example: 'spacing.md' },
  typography: { prefixes: ['typography.'], example: 'typography.heading.lg' },
  shadow: { prefixes: ['shadow.'], example: 'shadow.md' },
  border: { prefixes: ['border.'], example: 'border.default' },
  gradient: { prefixes: ['gradient.'], example: 'gradient.brand' },
  duration: { prefixes: ['duration.'], example: 'duration.fast' },
  fontFamily: { prefixes: ['fontFamily.'], example: 'fontFamily.body' },
  fontWeight: { prefixes: ['fontWeight.'], example: 'fontWeight.bold' },
  number: { prefixes: ['scale.', 'opacity.'], example: 'scale.ratio' },
  string: { prefixes: [], example: 'label.heading' },
  boolean: { prefixes: [], example: 'feature.darkMode' },
  strokeStyle: { prefixes: ['strokeStyle.'], example: 'strokeStyle.dashed' },
};

/** Inline display and editing of per-theme-set token values */
function ThemeValuesSection({
  tokenPath,
  tokenType,
  dimensions,
  perSetFlat,
  serverUrl,
  onRefresh,
}: {
  tokenPath: string;
  tokenType: string;
  dimensions: ThemeDimension[];
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
  serverUrl: string;
  onRefresh?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Build per-option entries grouped by dimension
  const entries = useMemo(() => {
    return dimensions.flatMap(dim =>
      dim.options.map(option => {
        const enabledSets = Object.entries(option.sets).filter(([, s]) => s === 'enabled').map(([sn]) => sn);
        const sourceSets = Object.entries(option.sets).filter(([, s]) => s === 'source').map(([sn]) => sn);
        let targetSet: string | null = null;
        let rawEntry: TokenMapEntry | null = null;
        for (const sn of enabledSets) {
          if (perSetFlat[sn]?.[tokenPath]) { targetSet = sn; rawEntry = perSetFlat[sn][tokenPath]; break; }
        }
        if (!rawEntry) {
          for (const sn of sourceSets) {
            if (perSetFlat[sn]?.[tokenPath]) { targetSet = targetSet ?? sn; rawEntry = perSetFlat[sn][tokenPath]; break; }
          }
        }
        if (!targetSet && enabledSets.length > 0) targetSet = enabledSets[0];
        if (!targetSet && sourceSets.length > 0) targetSet = sourceSets[0];
        return { dimId: dim.id, dimName: dim.name, optionName: option.name, targetSet, rawEntry };
      })
    );
  }, [dimensions, perSetFlat, tokenPath]);

  if (entries.length === 0) return null;

  const isComplexType = COMPOSITE_TOKEN_TYPES.has(tokenType) || tokenType === 'gradient';
  const setCount = entries.filter(e => e.rawEntry !== null).length;

  const rawToString = (v: any): string => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') {
      if ('value' in v && 'unit' in v) return `${v.value}${v.unit}`;
      return JSON.stringify(v);
    }
    return String(v);
  };

  const handleSave = async (optionName: string, targetSet: string, currentRaw: any) => {
    const editedStr = edits[optionName];
    if (editedStr === undefined) return;
    let finalValue: any = editedStr;
    if (tokenType === 'number' || tokenType === 'duration') {
      const n = parseFloat(editedStr);
      if (!isNaN(n)) finalValue = n;
    } else if (tokenType === 'boolean') {
      finalValue = editedStr === 'true' || editedStr === '1';
    }
    setSavingKey(optionName);
    setSaveError(null);
    try {
      const encodedPath = tokenPath.split('.').map(encodeURIComponent).join('/');
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${encodedPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $type: tokenType, $value: finalValue }),
      });
      setEdits(prev => { const next = { ...prev }; delete next[optionName]; return next; });
      onRefresh?.();
    } catch (err) {
      setSaveError(`Failed to save "${optionName}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="border-t border-[var(--color-figma-border)]">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
      >
        <span className="flex items-center gap-1.5">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
          </svg>
          Theme values
          {setCount > 0 && (
            <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] text-[8px] font-medium">
              {setCount} set
            </span>
          )}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <path d="M2 3.5l3 3 3-3"/>
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-[var(--color-figma-border)]">
          {saveError && (
            <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-red-500/10 text-red-400 text-[10px] flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              <span className="flex-1 min-w-0 truncate" title={saveError}>{saveError}</span>
              <button type="button" onClick={() => setSaveError(null)} className="shrink-0 text-red-400 hover:text-red-300 text-[9px] font-medium">Dismiss</button>
            </div>
          )}
          {dimensions.map(dim => {
            const dimEntries = entries.filter(e => e.dimId === dim.id);
            if (dimEntries.length === 0) return null;
            return (
              <div key={dim.id}>
                {dimensions.length > 1 && (
                  <div className="px-3 pt-2 pb-0.5 text-[9px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide">
                    {dim.name}
                  </div>
                )}
                <div className="px-3 py-2 flex flex-col gap-1.5">
                  {dimEntries.map(({ optionName, targetSet, rawEntry }) => {
                    const rawValue = rawEntry?.$value;
                    const isAliasVal = isAlias(rawValue);
                    const editedValue = edits[optionName];
                    const displayValue = editedValue !== undefined ? editedValue : rawToString(rawValue);
                    const isDirtyRow = editedValue !== undefined;

                    return (
                      <div key={optionName} className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="text-[10px] text-[var(--color-figma-text)] w-14 shrink-0 truncate"
                          title={optionName}
                        >
                          {optionName}
                        </span>

                        {isComplexType ? (
                          <span className="flex-1 text-[9px] text-[var(--color-figma-text-secondary)] italic truncate">
                            {rawEntry ? 'overridden' : 'inherited'}
                          </span>
                        ) : isAliasVal ? (
                          <span className="flex-1 text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={String(rawValue)}>
                            {String(rawValue)}
                          </span>
                        ) : (
                          <>
                            {tokenType === 'color' && rawValue && typeof rawValue === 'string' && (
                              <div
                                className="w-3.5 h-3.5 rounded-sm border border-white/40 ring-1 ring-[var(--color-figma-border)] shrink-0"
                                style={{ backgroundColor: rawValue.slice(0, 7) }}
                                aria-hidden="true"
                              />
                            )}
                            <input
                              type="text"
                              value={displayValue}
                              placeholder={rawEntry ? '' : 'inherited'}
                              onChange={e => setEdits(prev => ({ ...prev, [optionName]: e.target.value }))}
                              className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/40"
                            />
                            {isDirtyRow && targetSet && (
                              <button
                                type="button"
                                disabled={savingKey === optionName}
                                onClick={() => handleSave(optionName, targetSet, rawValue)}
                                title={`Save to ${targetSet}`}
                                className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/25 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-colors"
                              >
                                {savingKey === optionName ? '…' : 'Save'}
                              </button>
                            )}
                          </>
                        )}

                        {targetSet && (
                          <span
                            className="text-[8px] text-[var(--color-figma-text-secondary)]/50 truncate max-w-[52px] shrink-0"
                            title={targetSet}
                          >
                            {targetSet}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token value history section
// ---------------------------------------------------------------------------

// TokenHistorySection, HistoryValueChip, HistoryEntryData, and formatRelativeTime
// are defined in TokenHistorySection.tsx and imported above.

// ---------------------------------------------------------------------------
// Draft auto-save utilities
// Drafts are stored in sessionStorage (survives accidental panel close within
// the same browser session but is discarded when the tab closes).
// ---------------------------------------------------------------------------
const EDITOR_DRAFT_PREFIX = 'tm_editor_draft';

interface EditorDraftData {
  tokenType: string;
  value: any;
  description: string;
  reference: string;
  scopes: string[];
  colorModifiers: ColorModifierOp[];
  modeValues: Record<string, any>;
  extensionsJsonText: string;
  lifecycle: 'draft' | 'published' | 'deprecated';
  extendsPath: string;
  savedAt: number;
}

function editorDraftKey(setName: string, tokenPath: string): string {
  return `${EDITOR_DRAFT_PREFIX}:${setName}:${tokenPath}`;
}

function saveEditorDraft(setName: string, tokenPath: string, data: Omit<EditorDraftData, 'savedAt'>): void {
  try {
    sessionStorage.setItem(editorDraftKey(setName, tokenPath), JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch { /* quota exceeded – best-effort */ }
}

function loadEditorDraft(setName: string, tokenPath: string): EditorDraftData | null {
  try {
    const raw = sessionStorage.getItem(editorDraftKey(setName, tokenPath));
    if (!raw) return null;
    return JSON.parse(raw) as EditorDraftData;
  } catch { return null; }
}

function clearEditorDraft(setName: string, tokenPath: string): void {
  try { sessionStorage.removeItem(editorDraftKey(setName, tokenPath)); } catch { /* ignore */ }
}

function formatDraftAge(savedAt: number): string {
  const seconds = Math.floor((Date.now() - savedAt) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
}
// ---------------------------------------------------------------------------

interface TokenEditorProps {
  tokenPath: string;
  tokenName?: string;
  setName: string;
  serverUrl: string;
  onBack: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  generators?: TokenGenerator[];
  allSets?: string[];
  onRefreshGenerators?: () => void;
  /** When true, the editor creates a new token instead of editing an existing one. */
  isCreateMode?: boolean;
  /** Initial token type for create mode. */
  initialType?: string;
  /** Initial value for create mode — when it looks like an alias (e.g. "{color.primary}"), alias mode is activated automatically. */
  initialValue?: string;
  /** Called whenever the dirty state changes so the parent can guard backdrop clicks. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called with the final saved path on a successful save so the parent can highlight it. */
  onSaved?: (savedPath: string) => void;
  /** Theme dimensions used to show per-mode value overrides. */
  dimensions?: ThemeDimension[];
  /** Per-set flat token maps, used to show inline theme values. */
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  /** Called after a theme-value save (stays in editor) to trigger a data refresh. */
  onRefresh?: () => void;
  /** Called after a successful create when the user wants to immediately create another token. Receives the saved path so the parent can derive a sibling prefix. */
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  /** Available font families from Figma for the font picker. */
  availableFonts?: string[];
  /** Map of derived token paths to the generator that produces them. */
  derivedTokenPaths?: Map<string, TokenGenerator>;
  /** Ref that will be assigned the handleBack function so parents can trigger guarded close (e.g. from a backdrop click). */
  closeRef?: MutableRefObject<() => void>;
  /** Navigate to Token Flow panel with this token pre-selected */
  onShowReferences?: (path: string) => void;
}

export function TokenEditor({ tokenPath, tokenName, setName, serverUrl, onBack, allTokensFlat = {}, pathToSet = {}, generators = [], allSets = [], onRefreshGenerators, isCreateMode = false, initialType, initialValue, onDirtyChange, onSaved, onSaveAndCreateAnother, dimensions = [], perSetFlat, onRefresh, availableFonts = [], derivedTokenPaths, closeRef, onShowReferences }: TokenEditorProps) {
  const [loading, setLoading] = useState(!isCreateMode);
  // Editable path, only used in create mode
  const [editPath, setEditPath] = useState(tokenPath);
  const [showPathAutocomplete, setShowPathAutocomplete] = useState(false);
  const pathInputWrapperRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState(initialType || 'color');
  const [value, setValue] = useState<any>(() => {
    if (!isCreateMode) return '';
    const t = initialType || 'color';
    // Pre-fill from initialValue when provided (and not an alias — aliases are handled via reference state)
    if (initialValue && !isAlias(initialValue)) {
      return parseInitialValueForType(t, initialValue);
    }
    if (t === 'color') return '#000000';
    if (t === 'dimension') return { value: 0, unit: 'px' };
    if (t === 'number' || t === 'duration') return 0;
    if (t === 'boolean') return false;
    if (t === 'shadow') return { x: 0, y: 0, blur: 4, spread: 0, color: '#000000', type: 'dropShadow' };
    return '';
  });
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(() => {
    if (isCreateMode && initialValue && isAlias(initialValue)) return initialValue;
    return '';
  });
  const [aliasMode, setAliasMode] = useState(() => {
    if (isCreateMode && initialValue && isAlias(initialValue)) return true;
    return false;
  });
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  const valueEditorContainerRef = useRef<HTMLDivElement>(null);
  const didAutoFocusRef = useRef(false);
  const preAliasValueRef = useRef<any>(null);
  const fontFamilyRef = useRef<HTMLInputElement>(null);
  const fontSizeRef = useRef<HTMLInputElement>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const initialRef = useRef<{ value: any; description: string; reference: string; scopes: string[]; type: string; colorModifiers: ColorModifierOp[]; modeValues: Record<string, any>; extensionsJsonText: string; lifecycle: 'draft' | 'published' | 'deprecated'; extendsPath: string } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGeneratorDialog, setShowGeneratorDialog] = useState(false);
  const [editingGeneratorInDialog, setEditingGeneratorInDialog] = useState<TokenGenerator | undefined>(undefined);
  const [duplicateTemplate, setDuplicateTemplate] = useState<import('../hooks/useGenerators').GeneratorTemplate | undefined>(undefined);
  const [colorModifiers, setColorModifiers] = useState<ColorModifierOp[]>([]);
  const [pendingTypeChange, setPendingTypeChange] = useState<string | null>(null);
  const [showPendingDependents, setShowPendingDependents] = useState(false);
  const [dependents, setDependents] = useState<Array<{ path: string; setName: string }>>([]);
  const [dependentsLoading, setDependentsLoading] = useState(false);
  const [modeValues, setModeValues] = useState<Record<string, any>>({});
  const [extensionsJsonText, setExtensionsJsonText] = useState('');
  const [extensionsJsonError, setExtensionsJsonError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<'draft' | 'published' | 'deprecated'>('published');
  const [extendsPath, setExtendsPath] = useState('');
  const initialServerSnapshotRef = useRef<string | null>(null);
  const handleSaveRef = useRef<(forceOverwrite?: boolean, createAnother?: boolean) => void>(() => {});
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  // Stores the args of the last failed save so the user can retry it
  const [saveRetryArgs, setSaveRetryArgs] = useState<[boolean, boolean] | null>(null);
  // Draft recovery: set when the editor loads and finds a newer draft in sessionStorage
  const [pendingDraft, setPendingDraft] = useState<EditorDraftData | null>(null);

  const encodedTokenPath = tokenPath.split('.').map(encodeURIComponent).join('/');

  const existingGeneratorsForToken = generators.filter(g => g.sourceToken === tokenPath);
  const canBeGeneratorSource = ['color', 'dimension', 'number', 'fontSize'].includes(tokenType);

  // Flat map of color token string values — used for reference resolution in this editor.
  // Overlay the current editor value for the token being edited so dependent previews
  // reflect the latest saved/loaded value even when the parent's allTokensFlat is stale.
  const colorFlatMap = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const [p, e] of Object.entries(allTokensFlat)) {
      if (e.$type === 'color') map[p] = e.$value;
    }
    if (tokenType === 'color' && !isCreateMode) {
      map[tokenPath] = reference || value;
    }
    return map;
  }, [allTokensFlat, tokenType, tokenPath, isCreateMode, reference, value]);

  useEffect(() => {
    if (isCreateMode) return; // skip fetch in create mode
    const controller = new AbortController();
    const fetchToken = async () => {
      try {
        const data = await apiFetch<{ token?: any }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`, { signal: controller.signal });
        const token = data.token;
        setTokenType(token?.$type || 'string');
        setValue(token?.$value ?? '');
        setDescription(token?.$description || '');
        const savedScopes = token?.$extensions?.['com.figma.scopes'] ?? token?.$scopes;
        setScopes(Array.isArray(savedScopes) ? savedScopes : []);
        const savedModifiers = token?.$extensions?.tokenmanager?.colorModifier;
        const loadedModifiers: ColorModifierOp[] = Array.isArray(savedModifiers) ? validateColorModifiers(savedModifiers) : [];
        setColorModifiers(loadedModifiers);
        const savedModes = token?.$extensions?.tokenmanager?.modes;
        const loadedModes: Record<string, any> = (savedModes && typeof savedModes === 'object' && !Array.isArray(savedModes)) ? savedModes as Record<string, any> : {};
        setModeValues(loadedModes);
        const savedLifecycle = token?.$extensions?.tokenmanager?.lifecycle;
        const loadedLifecycle: 'draft' | 'published' | 'deprecated' = (savedLifecycle === 'draft' || savedLifecycle === 'deprecated') ? savedLifecycle : 'published';
        setLifecycle(loadedLifecycle);
        const savedExtends = token?.$extensions?.tokenmanager?.extends;
        const loadedExtends = typeof savedExtends === 'string' ? savedExtends : '';
        setExtendsPath(loadedExtends);
        const ext = token?.$extensions ?? {};
        const knownExtKeys = new Set(['com.figma.scopes', 'tokenmanager']);
        const otherExt: Record<string, any> = {};
        for (const [k, v] of Object.entries(ext)) {
          if (!knownExtKeys.has(k)) otherExt[k] = v;
        }
        const otherExtText = Object.keys(otherExt).length > 0 ? JSON.stringify(otherExt, null, 2) : '';
        setExtensionsJsonText(otherExtText);
        initialServerSnapshotRef.current = JSON.stringify(token ?? null);
        const ref = isAlias(token?.$value) ? token.$value : '';
        if (ref) setReference(ref);
        initialRef.current = {
          value: token?.$value ?? '',
          description: token?.$description || '',
          reference: ref,
          scopes: Array.isArray(savedScopes) ? savedScopes : [],
          type: token?.$type || 'string',
          colorModifiers: loadedModifiers,
          modeValues: loadedModes,
          extensionsJsonText: otherExtText,
          lifecycle: loadedLifecycle,
          extendsPath: loadedExtends,
        };
        if (isAlias(token?.$value)) {
          setReference(token.$value);
        }
        // Check for a saved draft that differs from the current server state
        const draft = loadEditorDraft(setName, tokenPath);
        if (draft) {
          const init = initialRef.current!;
          const draftDiffers = (
            draft.tokenType !== init.type ||
            JSON.stringify(draft.value) !== JSON.stringify(init.value) ||
            draft.description !== init.description ||
            draft.reference !== init.reference ||
            JSON.stringify(draft.scopes) !== JSON.stringify(init.scopes) ||
            JSON.stringify(draft.colorModifiers) !== JSON.stringify(init.colorModifiers) ||
            JSON.stringify(draft.modeValues) !== JSON.stringify(init.modeValues) ||
            draft.extensionsJsonText !== init.extensionsJsonText ||
            draft.lifecycle !== init.lifecycle ||
            draft.extendsPath !== init.extendsPath
          );
          if (draftDiffers) {
            setPendingDraft(draft);
          } else {
            // Draft matches server — no longer needed
            clearEditorDraft(setName, tokenPath);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchToken();
    return () => controller.abort();
  }, [serverUrl, setName, tokenPath, isCreateMode]);

  // Fetch reverse dependencies (tokens that reference this one)
  useEffect(() => {
    if (isCreateMode) return;
    const controller = new AbortController();
    const fetchDependents = async () => {
      setDependentsLoading(true);
      try {
        const data = await apiFetch<{ dependents?: Array<{ path: string; setName: string }> }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/dependents/${encodedTokenPath}`, { signal: controller.signal });
        setDependents(data.dependents ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.warn('[TokenEditor] failed to fetch dependents:', err);
      } finally {
        setDependentsLoading(false);
      }
    };
    fetchDependents();
    return () => controller.abort();
  }, [serverUrl, setName, tokenPath, isCreateMode]);

  // Sync alias mode with loaded reference
  useEffect(() => {
    if (reference) setAliasMode(true);
  }, [reference]);

  // Auto-focus the appropriate field once edit mode data finishes loading
  useEffect(() => {
    if (isCreateMode || loading || didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    if (reference) {
      // Alias token: reference input mounts after aliasMode effect fires (next render)
      setTimeout(() => refInputRef.current?.focus(), 0);
    } else {
      // Non-alias token: value editors are already mounted; focus first text input
      const input = valueEditorContainerRef.current?.querySelector<HTMLElement>(
        'input:not([type="color"]):not([type="checkbox"]):not([type="hidden"]):not([type="radio"]), textarea'
      );
      input?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const isDirty = useMemo(() => {
    if (!initialRef.current) return false;
    const init = initialRef.current;
    return (
      tokenType !== init.type ||
      value !== init.value ||
      description !== init.description ||
      reference !== init.reference ||
      JSON.stringify(scopes) !== JSON.stringify(init.scopes) ||
      JSON.stringify(colorModifiers) !== JSON.stringify(init.colorModifiers) ||
      JSON.stringify(modeValues) !== JSON.stringify(init.modeValues) ||
      extensionsJsonText !== init.extensionsJsonText ||
      lifecycle !== init.lifecycle ||
      extendsPath !== init.extendsPath
    );
  }, [tokenType, value, description, reference, scopes, colorModifiers, modeValues, extensionsJsonText, lifecycle, extendsPath]);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // Auto-save draft to sessionStorage whenever the editor has unsaved changes.
  // This ensures changes survive an accidental panel close within the same session.
  useEffect(() => {
    if (!isDirty || isCreateMode) return;
    saveEditorDraft(setName, tokenPath, {
      tokenType, value, description, reference, scopes, colorModifiers, modeValues, extensionsJsonText, lifecycle, extendsPath,
    });
  }, [isDirty, setName, tokenPath, isCreateMode, tokenType, value, description, reference, scopes, colorModifiers, modeValues, extensionsJsonText, lifecycle, extendsPath]);

  const aliasHasCycle = useMemo((): string[] | null => {
    if (!aliasMode || !isAlias(reference)) return null;
    const currentPath = isCreateMode ? editPath.trim() : tokenPath;
    if (!currentPath) return null;
    return detectAliasCycle(reference, currentPath, allTokensFlat);
  }, [aliasMode, reference, isCreateMode, editPath, tokenPath, allTokensFlat]);

  // Real-time duplicate path detection in create mode
  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return trimmed in allTokensFlat;
  }, [isCreateMode, editPath, allTokensFlat]);

  // Smart alias suggestion: find tokens whose value is near the current value
  const currentPathForMatch = isCreateMode ? editPath.trim() : tokenPath;
  const nearbyMatches = useNearbyTokenMatch(value, tokenType, allTokensFlat, currentPathForMatch, !aliasMode);

  const canSave = useMemo(() => {
    if (aliasHasCycle) return false;
    if (extensionsJsonError) return false;
    if (duplicatePath) return false;
    if (tokenType === 'typography' && !aliasMode) {
      const v = typeof value === 'object' && value !== null ? value : {};
      const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      if (!family || String(family).trim() === '') return false;
      const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
      if (fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0) return false;
    }
    return true;
  }, [aliasHasCycle, extensionsJsonError, duplicatePath, tokenType, value, aliasMode]);

  const saveBlockReason = useMemo(() => {
    if (aliasHasCycle) return 'Circular reference';
    if (duplicatePath) return 'A token with this path already exists';
    if (extensionsJsonError) return 'Fix extensions JSON';
    if (tokenType === 'typography' && !aliasMode) {
      const v = typeof value === 'object' && value !== null ? value : {};
      const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
      const missingFamily = !family || String(family).trim() === '';
      const missingSize = fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0;
      if (missingFamily && missingSize) return 'Font family and size required';
      if (missingFamily) return 'Font family required';
      if (missingSize) return 'Font size required';
    }
    if (isCreateMode && !editPath.trim()) return 'Enter a token path';
    return null;
  }, [aliasHasCycle, duplicatePath, extensionsJsonError, tokenType, value, aliasMode, isCreateMode, editPath]);

  const focusBlockedField = useCallback(() => {
    if (tokenType !== 'typography' || aliasMode) return;
    const v = typeof value === 'object' && value !== null ? value : {};
    const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
    const missingFamily = !family || String(family).trim() === '';
    if (missingFamily) {
      fontFamilyRef.current?.focus();
      return;
    }
    const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
    const missingSize = fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0;
    if (missingSize) {
      fontSizeRef.current?.focus();
    }
  }, [tokenType, aliasMode, value]);

  const DEFAULT_VALUE_FOR_TYPE: Record<string, any> = {
    color: '#000000',
    dimension: { value: 0, unit: 'px' },
    typography: {},
    shadow: { x: 0, y: 0, blur: 4, spread: 0, color: '#000000', type: 'dropShadow' },
    border: {},
    number: 0,
    string: '',
    boolean: false,
    gradient: { type: 'linear', stops: [] },
    duration: 0,
    fontFamily: '',
    composition: {},
    cubicBezier: [0, 0, 1, 1],
    transition: { duration: { value: 200, unit: 'ms' }, delay: { value: 0, unit: 'ms' }, timingFunction: [0.25, 0.1, 0.25, 1] },
    fontStyle: 'normal',
    lineHeight: 1.5,
    letterSpacing: { value: 0, unit: 'px' },
    percentage: 0,
    link: '',
    textDecoration: 'none',
    textTransform: 'none',
    custom: '',
    fontWeight: 400,
    strokeStyle: 'solid',
    asset: '',
  };

  const applyTypeChange = (newType: string) => {
    setTokenType(newType);
    setValue(DEFAULT_VALUE_FOR_TYPE[newType] ?? '');
    setScopes([]);
    setReference('');
    setAliasMode(false);
    setShowAutocomplete(false);
    setPendingTypeChange(null);
    setShowPendingDependents(false);
    setExtendsPath('');
  };

  const handleTypeChange = (newType: string) => {
    if (aliasMode) { applyTypeChange(newType); return; }
    const isDefaultValue = JSON.stringify(value) === JSON.stringify(DEFAULT_VALUE_FOR_TYPE[tokenType] ?? '');
    if (!isDefaultValue) {
      setPendingTypeChange(newType);
    } else {
      applyTypeChange(newType);
    }
  };

  const handleBack = () => {
    if (isDirty) { setShowDiscardConfirm(true); } else { onBack(); }
  };
  // Keep the ref up-to-date so App.tsx's backdrop click can call handleBack()
  if (closeRef) closeRef.current = handleBack;

  const handleRevert = () => {
    if (!initialRef.current) return;
    const init = initialRef.current;
    setTokenType(init.type);
    setValue(init.value);
    setDescription(init.description);
    setReference(init.reference);
    setScopes(init.scopes);
    setColorModifiers(init.colorModifiers);
    setModeValues(init.modeValues);
    setExtensionsJsonText(init.extensionsJsonText);
    setExtensionsJsonError(null);
    setExtendsPath(init.extendsPath);
    setAliasMode(!!init.reference);
    // Clear any saved draft since the user has explicitly reverted
    clearEditorDraft(setName, tokenPath);
    setPendingDraft(null);
  };

  const applyDraft = (draft: EditorDraftData) => {
    setTokenType(draft.tokenType);
    setValue(draft.value);
    setDescription(draft.description);
    setReference(draft.reference);
    setAliasMode(!!draft.reference);
    setScopes(draft.scopes);
    setColorModifiers(draft.colorModifiers);
    setModeValues(draft.modeValues);
    setExtensionsJsonText(draft.extensionsJsonText);
    setLifecycle(draft.lifecycle);
    setExtendsPath(draft.extendsPath);
    setPendingDraft(null);
    // Draft will be re-saved by the auto-save effect since isDirty becomes true
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`, { method: 'DELETE' });
      onBack();
    } catch (err) {
      setError(getErrorMessage(err, 'Delete failed'));
      setShowDeleteConfirm(false);
    }
  };

  const handleToggleAlias = useCallback(() => {
    const next = !aliasMode;
    setAliasMode(next);
    if (next) {
      preAliasValueRef.current = value;
      if (!reference) setReference('{');
      setTimeout(() => { refInputRef.current?.focus(); }, 0);
    } else {
      // Try to resolve the alias to its concrete value so the user keeps
      // the resolved result (e.g. #1a73e8) instead of the stale pre-alias value.
      let resolved: any = null;
      if (reference && isAlias(reference)) {
        const result = resolveTokenValue(reference, tokenType, allTokensFlat);
        if (result.value != null && !result.error) {
          resolved = result.value;
        }
      }
      setValue(resolved ?? preAliasValueRef.current ?? value);
      preAliasValueRef.current = null;
      setReference('');
      setShowAutocomplete(false);
    }
  }, [aliasMode, value, reference, tokenType, allTokensFlat]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showDiscardConfirm) { setShowDiscardConfirm(false); return; }
        if (showAutocomplete) { setShowAutocomplete(false); return; }
        handleBack();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        handleToggleAlias();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey && isCreateMode && onSaveAndCreateAnother) {
          handleSaveRef.current(false, true);
        } else {
          handleSaveRef.current();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack, isDirty, showDiscardConfirm, showAutocomplete, handleToggleAlias, isCreateMode, onSaveAndCreateAnother]);

  const handleSave = async (forceOverwrite = false, createAnother = false) => {
    if (isCreateMode && !editPath.trim()) {
      setSaveRetryArgs(null);
      setError('Token path cannot be empty');
      return;
    }
    setSaving(true);
    setSaveRetryArgs(null);
    setError(null);
    try {
      // Conflict detection: if the token was modified on the server since we loaded it, warn the user.
      if (!isCreateMode && !forceOverwrite && initialServerSnapshotRef.current !== null) {
        try {
          const checkData = await apiFetch<{ token?: any }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`);
          const currentSnapshot = JSON.stringify(checkData.token ?? null);
          if (currentSnapshot !== initialServerSnapshotRef.current) {
            setShowConflictConfirm(true);
            setSaving(false);
            return;
          }
        } catch (err) {
          console.warn('[TokenEditor] conflict check failed, proceeding with save:', err);
        }
      }

      const body: any = {
        $type: tokenType,
        $value: reference || value,
      };
      if (description) body.$description = description;
      const extensions: Record<string, any> = {};
      if (scopes.length > 0) extensions['com.figma.scopes'] = scopes;
      const tmExt: Record<string, any> = {};
      if (colorModifiers.length > 0) tmExt.colorModifier = colorModifiers;
      const cleanModes = Object.fromEntries(Object.entries(modeValues).filter(([, v]) => v !== '' && v !== undefined && v !== null));
      if (Object.keys(cleanModes).length > 0) tmExt.modes = cleanModes;
      if (lifecycle !== 'published') tmExt.lifecycle = lifecycle;
      if (extendsPath) tmExt.extends = extendsPath;
      if (Object.keys(tmExt).length > 0) extensions.tokenmanager = tmExt;
      const trimmedExtJson = extensionsJsonText.trim();
      if (trimmedExtJson && trimmedExtJson !== '{}') {
        try {
          const parsed = JSON.parse(trimmedExtJson);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(extensions, parsed);
          }
        } catch (err) {
          console.debug('[TokenEditor] invalid extensions JSON:', err);
          setSaveRetryArgs(null);
          setError('Invalid JSON in Extensions — fix before saving');
          setSaving(false);
          return;
        }
      }
      if (Object.keys(extensions).length > 0) body.$extensions = extensions;

      const targetPath = isCreateMode ? editPath.trim() : tokenPath;
      const encodedTargetPath = targetPath.split('.').map(encodeURIComponent).join('/');
      const method = isCreateMode ? 'POST' : 'PATCH';
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTargetPath}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const label = isCreateMode ? 'created' : 'saved';
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Token "${targetPath}" ${label}` } }, '*');
      // Clear any saved draft now that the token has been persisted
      clearEditorDraft(setName, targetPath);
      onSaved?.(targetPath);
      if (createAnother && isCreateMode && onSaveAndCreateAnother) {
        onSaveAndCreateAnother(targetPath, tokenType);
      } else {
        onBack();
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setSaveRetryArgs([forceOverwrite, createAnother]);
    } finally {
      setSaving(false);
    }
  };
  handleSaveRef.current = handleSave;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading token...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={handleBack}
          aria-label="Back"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {isCreateMode ? (
            <div className="relative" ref={pathInputWrapperRef}>
              <input
                type="text"
                value={editPath}
                onChange={e => { setEditPath(e.target.value); setError(null); setShowPathAutocomplete(true); }}
                onFocus={() => { if (editPath.trim()) setShowPathAutocomplete(true); }}
                onBlur={e => {
                  // Close autocomplete unless the click is within the autocomplete dropdown
                  if (!pathInputWrapperRef.current?.contains(e.relatedTarget as Node)) {
                    setShowPathAutocomplete(false);
                  }
                }}
                placeholder="Token path (e.g. color.brand.500)"
                autoFocus
                autoComplete="off"
                className={`w-full text-[11px] font-medium text-[var(--color-figma-text)] bg-transparent border-b outline-none pb-0.5 truncate ${duplicatePath ? 'border-[var(--color-figma-danger,#f24822)]' : 'border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)]'}`}
              />
              {showPathAutocomplete && editPath.trim() && (
                <PathAutocomplete
                  query={editPath}
                  allTokensFlat={allTokensFlat}
                  onSelect={path => {
                    setEditPath(path);
                    setError(null);
                    // Keep autocomplete open if the selected path ends with a dot (group)
                    setShowPathAutocomplete(path.endsWith('.'));
                  }}
                  onClose={() => setShowPathAutocomplete(false)}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{tokenPath}</div>
              {isDirty && (
                <span
                  className="shrink-0 px-1 py-px rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/30 leading-none"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                >
                  Unsaved
                </span>
              )}
            </div>
          )}
          {isCreateMode && duplicatePath ? (
            <div className="text-[10px] text-[var(--color-figma-danger,#f24822)]">A token with this path already exists in {pathToSet[editPath.trim()] || setName}</div>
          ) : (
            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">{isCreateMode ? 'new token' : `in ${setName}`}</div>
          )}
          {isCreateMode && !editPath.includes('.') && (NAMESPACE_SUGGESTIONS[tokenType]?.prefixes.length ?? 0) > 0 && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Try:</span>
              {NAMESPACE_SUGGESTIONS[tokenType].prefixes.map(prefix => (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => { setEditPath(prefix); setError(null); }}
                  className="px-1 py-px rounded text-[10px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-pressed)] transition-colors cursor-pointer"
                >
                  {prefix}
                </button>
              ))}
            </div>
          )}
        </div>
        {!isCreateMode && onShowReferences && <button
          onClick={() => onShowReferences(tokenPath)}
          title="Open in dependency graph (Apply → Dependencies)"
          aria-label="Open in dependency graph"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
          </svg>
        </button>}
        {!isCreateMode && <button
          onClick={() => {
            navigator.clipboard.writeText(tokenPath);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy token path"
          aria-label="Copy token path"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0"
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>}
        {aliasMode && reference && tokenType === 'color' && (() => {
          const refPath = extractAliasPath(reference);
          const resolved = refPath ? resolveRefValue(refPath, colorFlatMap) : null;
          if (!resolved) return null;
          return (
            <div
              className="w-3.5 h-3.5 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: resolved }}
              title={resolved}
              aria-hidden="true"
            />
          );
        })()}
        <select
          value={tokenType}
          onChange={e => handleTypeChange(e.target.value)}
          title="Change token type"
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase cursor-pointer border-0 outline-none appearance-none ${TOKEN_TYPE_BADGE_CLASS[tokenType ?? ''] ?? 'token-type-string'}`}
          style={{ backgroundImage: 'none' }}
        >
          {Object.keys(TOKEN_TYPE_BADGE_CLASS).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Draft recovery banner */}
      {pendingDraft && !isCreateMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-400/40 bg-amber-50/80 dark:bg-amber-900/20 text-[11px]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="flex-1 text-amber-800 dark:text-amber-200 truncate">
            Unsaved draft from {formatDraftAge(pendingDraft.savedAt)}
          </span>
          <button
            onClick={() => applyDraft(pendingDraft)}
            className="shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:underline"
          >
            Restore
          </button>
          <button
            onClick={() => { setPendingDraft(null); clearEditorDraft(setName, tokenPath); }}
            className="shrink-0 text-[10px] text-amber-500 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div role="alert" className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px] break-words max-h-16 overflow-auto flex items-start gap-2">
            <span className="flex-1">{error}</span>
            {saveRetryArgs && (
              <button
                type="button"
                onClick={() => { setSaveRetryArgs(null); handleSaveRef.current(saveRetryArgs[0], saveRetryArgs[1]); }}
                className="shrink-0 font-medium underline hover:opacity-80"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Type-change confirmation — shown when a type switch would reset a non-default value */}
        {pendingTypeChange && (
          <div className="px-2 py-2 rounded border border-amber-500/30 bg-amber-500/10 text-[10px]">
            <p className="text-[var(--color-figma-text)] mb-2">
              Switch to <strong>{pendingTypeChange}</strong>? This will reset the current value.
              {dependents.length > 0 && (
                <span className="block mt-1">
                  <button
                    type="button"
                    onClick={() => setShowPendingDependents(v => !v)}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${showPendingDependents ? 'rotate-90' : ''}`} aria-hidden="true">
                      <path d="M2 1l4 3-4 3V1z"/>
                    </svg>
                    {dependents.length} dependent token{dependents.length !== 1 ? 's' : ''} reference this token and may break.
                  </button>
                  {showPendingDependents && (
                    <span className="mt-1 flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                      {dependents.slice(0, 20).map(dep => (
                        onShowReferences ? (
                          <button
                            key={dep.path}
                            type="button"
                            onClick={() => { setPendingTypeChange(null); onShowReferences(dep.path); }}
                            className="flex items-center gap-1 px-1 py-0.5 rounded font-mono text-[9px] text-[var(--color-figma-text)] hover:bg-amber-500/20 hover:text-amber-300 transition-colors text-left w-full"
                            title={`Open ${dep.path} in dependency graph`}
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60">
                              <circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>
                            </svg>
                            <span className="truncate">{dep.path}</span>
                            {dep.setName !== setName && (
                              <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-amber-500/20 text-amber-400 ml-auto">
                                {dep.setName}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span
                            key={dep.path}
                            className="flex items-center gap-1 px-1 py-0.5 font-mono text-[9px] text-[var(--color-figma-text)]"
                          >
                            <span className="truncate">{dep.path}</span>
                            {dep.setName !== setName && (
                              <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-amber-500/20 text-amber-400 ml-auto">
                                {dep.setName}
                              </span>
                            )}
                          </span>
                        )
                      ))}
                      {dependents.length > 20 && (
                        <span className="px-1 py-0.5 text-[9px] text-amber-400/70 italic">
                          and {dependents.length - 20} more…
                        </span>
                      )}
                    </span>
                  )}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setPendingTypeChange(null); setShowPendingDependents(false); }}
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Keep {tokenType}
              </button>
              <button
                onClick={() => applyTypeChange(pendingTypeChange)}
                className="flex-1 px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
              >
                Switch type
              </button>
            </div>
          </div>
        )}

        {/* Alias mode toggle + reference input */}
        <AliasPicker
          aliasMode={aliasMode}
          reference={reference}
          tokenType={tokenType}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onToggleAlias={handleToggleAlias}
          onReferenceChange={setReference}
          showAutocomplete={showAutocomplete}
          onShowAutocompleteChange={setShowAutocomplete}
          aliasHasCycle={aliasHasCycle}
          refInputRef={refInputRef}
        />

        {/* $extends — base token inheritance for composite types */}
        {!aliasMode && COMPOSITE_TOKEN_TYPES.has(tokenType) && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Extends</label>
            {extendsPath ? (
              <div className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-accent)]">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span className="text-[11px] text-[var(--color-figma-text)] font-mono truncate flex-1" title={extendsPath}>{extendsPath}</span>
                <button
                  type="button"
                  onClick={() => setExtendsPath('')}
                  title="Remove base token"
                  className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ) : (
              <ExtendsTokenPicker
                tokenType={tokenType}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                currentPath={isCreateMode ? editPath.trim() : tokenPath}
                onSelect={setExtendsPath}
              />
            )}
            {extendsPath && (() => {
              const base = allTokensFlat[extendsPath];
              if (!base) return <p className="text-[10px] text-[var(--color-figma-error)]">Base token not found</p>;
              return (
                <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-0.5">
                  Inherited properties will be merged with overrides below.
                </p>
              );
            })()}
          </div>
        )}

        {/* Type-specific editor */}
        {!reference && (
          <div className="flex flex-col gap-2" ref={valueEditorContainerRef}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">
                  {extendsPath ? 'Overrides' : 'Value'}
                </label>
                {!canSave && tokenType === 'typography' && saveBlockReason && (
                  <button type="button" onClick={focusBlockedField} className="text-[10px] text-[var(--color-figma-error)] hover:underline cursor-pointer bg-transparent border-none p-0">{saveBlockReason}</button>
                )}
              </div>
              {VALUE_FORMAT_HINTS[tokenType] && (
                <span className="text-[9px] text-[var(--color-figma-text-tertiary)] italic">{VALUE_FORMAT_HINTS[tokenType]}</span>
              )}
            </div>
            {initialRef.current && !isCreateMode && (
              JSON.stringify(value) !== JSON.stringify(initialRef.current.value)
                ? <ValueDiff type={tokenType} before={initialRef.current.value} after={value} />
                : <OriginalValuePreview type={tokenType} value={initialRef.current.value} />
            )}
            {(() => {
              const baseValue: TokenMapEntry['$value'] | undefined = extendsPath ? allTokensFlat[extendsPath]?.$value : undefined;
              return (<>
                {tokenType === 'color' && <ColorEditor value={value} onChange={setValue} autoFocus={!isCreateMode} allTokensFlat={allTokensFlat} />}
                {tokenType === 'dimension' && <DimensionEditor key={tokenPath} value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} autoFocus={!isCreateMode} />}
                {tokenType === 'typography' && <TypographyEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} fontFamilyRef={fontFamilyRef} fontSizeRef={fontSizeRef} baseValue={baseValue} availableFonts={availableFonts} />}
                {tokenType === 'shadow' && <ShadowEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} baseValue={baseValue} />}
                {tokenType === 'border' && <BorderEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} baseValue={baseValue} />}
                {tokenType === 'gradient' && <GradientEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
                {tokenType === 'number' && <NumberEditor key={tokenPath} value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} autoFocus={!isCreateMode} />}
                {tokenType === 'duration' && <DurationEditor value={value} onChange={setValue} autoFocus={!isCreateMode} />}
                {tokenType === 'fontFamily' && <FontFamilyEditor value={value} onChange={setValue} autoFocus={!isCreateMode} availableFonts={availableFonts} />}
                {tokenType === 'fontWeight' && <FontWeightEditor value={value} onChange={setValue} />}
                {tokenType === 'strokeStyle' && <StrokeStyleEditor value={value} onChange={setValue} />}
                {tokenType === 'string' && <StringEditor value={value} onChange={setValue} autoFocus={!isCreateMode} />}
                {tokenType === 'boolean' && <BooleanEditor value={value} onChange={setValue} />}
                {tokenType === 'composition' && <CompositionEditor value={value} onChange={setValue} baseValue={baseValue} />}
                {tokenType === 'cubicBezier' && <CubicBezierEditor value={value} onChange={setValue} />}
                {tokenType === 'transition' && <TransitionEditor value={value} onChange={setValue} />}
                {tokenType === 'fontStyle' && <FontStyleEditor value={value} onChange={setValue} />}
                {tokenType === 'lineHeight' && <LineHeightEditor value={value} onChange={setValue} />}
                {tokenType === 'letterSpacing' && <LetterSpacingEditor value={value} onChange={setValue} />}
                {tokenType === 'percentage' && <PercentageEditor value={value} onChange={setValue} />}
                {tokenType === 'link' && <LinkEditor value={value} onChange={setValue} />}
                {tokenType === 'textDecoration' && <TextDecorationEditor value={value} onChange={setValue} />}
                {tokenType === 'textTransform' && <TextTransformEditor value={value} onChange={setValue} />}
                {tokenType === 'custom' && <CustomEditor value={value} onChange={setValue} />}
              </>);
            })()}
            {tokenType === 'asset' && <AssetEditor value={value} onChange={setValue} />}
            {/* Smart alias suggestion — exact & near matches */}
            <TokenNudge
              matches={nearbyMatches}
              tokenType={tokenType}
              onAccept={(path) => {
                preAliasValueRef.current = value;
                setAliasMode(true);
                setReference(`{${path}}`);
                setTimeout(() => refInputRef.current?.focus(), 0);
              }}
            />
          </div>
        )}

        {/* Color modifiers — available for alias and direct color values */}
        {tokenType === 'color' && (aliasMode ? isAlias(reference) : (typeof value === 'string' && value.length > 0)) && (
          <ColorModifiersEditor
            reference={aliasMode ? reference : undefined}
            colorFlatMap={aliasMode ? colorFlatMap : undefined}
            directColor={!aliasMode && typeof value === 'string' ? value : undefined}
            colorModifiers={colorModifiers}
            onColorModifiersChange={setColorModifiers}
          />
        )}

        {/* Contrast checker (color tokens only) */}
        {tokenType === 'color' && (
          <ContrastChecker
            tokenPath={tokenPath}
            value={value}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            colorFlatMap={colorFlatMap}
          />
        )}

        {/* Lifecycle */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium shrink-0">Lifecycle</label>
          <div className="flex gap-1">
            {(['draft', 'published', 'deprecated'] as const).map(lc => (
              <button
                key={lc}
                onClick={() => setLifecycle(lc)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  lifecycle === lc
                    ? lc === 'draft'
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/40'
                      : lc === 'deprecated'
                        ? 'bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-1 ring-gray-500/40'
                        : 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-accent)]/40'
                    : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {lc}
              </button>
            ))}
          </div>
        </div>

        {/* Inline theme values — per-set overrides for each theme option */}
        {!isCreateMode && dimensions.length > 0 && perSetFlat && Object.keys(perSetFlat).length > 0 && (
          <ThemeValuesSection
            tokenPath={tokenPath}
            tokenType={tokenType}
            dimensions={dimensions}
            perSetFlat={perSetFlat}
            serverUrl={serverUrl}
            onRefresh={onRefresh}
          />
        )}

        {/* Description, Scopes, Mode Values, Extensions */}
        <MetadataEditor
          description={description}
          onDescriptionChange={setDescription}
          tokenType={tokenType}
          scopes={scopes}
          onScopesChange={setScopes}
          dimensions={dimensions}
          modeValues={modeValues}
          onModeValuesChange={setModeValues}
          aliasMode={aliasMode}
          reference={reference}
          value={value}
          extensionsJsonText={extensionsJsonText}
          onExtensionsJsonTextChange={setExtensionsJsonText}
          extensionsJsonError={extensionsJsonError}
          onExtensionsJsonErrorChange={setExtensionsJsonError}
          isCreateMode={isCreateMode}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
        />
      </div>

      {/* Generator groups */}
      {canBeGeneratorSource && !aliasMode && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <button
            onClick={() => { setEditingGeneratorInDialog(undefined); setDuplicateTemplate(undefined); setShowGeneratorDialog(true); }}
            className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="5" cy="2" r="1.5"/>
                <circle cx="2" cy="8" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5"/>
              </svg>
              {existingGeneratorsForToken.length > 0
                ? `Derived groups (${existingGeneratorsForToken.length})`
                : 'Derived groups'}
            </span>
            {existingGeneratorsForToken.length === 0 ? (
              <span className="text-[10px] text-[var(--color-figma-accent)]">+ Create</span>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 2L3 5l4 3"/>
              </svg>
            )}
          </button>
          {existingGeneratorsForToken.length > 0 && (
            <div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[var(--color-figma-border)]">
              {existingGeneratorsForToken.map(gen => (
                <div key={gen.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                      gen.type === 'colorRamp' ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]' :
                      gen.type === 'typeScale' ? 'bg-purple-500/15 text-purple-600' :
                      gen.type === 'spacingScale' ? 'bg-green-500/15 text-green-600' :
                      'bg-orange-500/15 text-orange-600'
                    }`}>
                      {gen.type === 'colorRamp' ? 'Ramp' : gen.type === 'typeScale' ? 'Scale' : gen.type === 'spacingScale' ? 'Spacing' : 'Opacity'}
                    </span>
                    <span className="text-[10px] text-[var(--color-figma-text)] truncate">{gen.targetGroup}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingGeneratorInDialog(gen); setDuplicateTemplate(undefined); setShowGeneratorDialog(true); }}
                      className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        // Duplicate: open as new with pre-filled config via template
                        setDuplicateTemplate({
                          id: `dup-${gen.id}`,
                          label: `${gen.name} (copy)`,
                          description: '',
                          defaultPrefix: gen.targetGroup,
                          generatorType: gen.type,
                          config: gen.config,
                          requiresSource: false,
                        });
                        setEditingGeneratorInDialog(undefined);
                        setShowGeneratorDialog(true);
                      }}
                      title="Duplicate generator"
                      className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                    >
                      Duplicate
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => { setEditingGeneratorInDialog(undefined); setDuplicateTemplate(undefined); setShowGeneratorDialog(true); }}
                className="mt-0.5 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors text-left"
              >
                + Add another group
              </button>
            </div>
          )}
        </div>
      )}

      {/* Token references: incoming aliases, variable bindings, generators, layers */}
      {!isCreateMode && (
        <TokenUsages
          dependents={dependents}
          dependentsLoading={dependentsLoading}
          setName={setName}
          tokenPath={tokenPath}
          tokenType={tokenType}
          value={value}
          isDirty={isDirty}
          aliasMode={aliasMode}
          allTokensFlat={allTokensFlat}
          colorFlatMap={colorFlatMap}
          initialValue={initialRef.current?.value}
          producingGenerator={derivedTokenPaths?.get(tokenPath) ?? null}
          sourceGenerators={existingGeneratorsForToken}
        />
      )}

      {/* Per-token value history */}
      {!isCreateMode && (
        <TokenHistorySection
          tokenPath={tokenPath}
          serverUrl={serverUrl}
          tokenType={tokenType}
        />
      )}

      {/* Save changes confirmation */}
      {showDiscardConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowDiscardConfirm(false); }}
        >
          <div className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="save-changes-title">
            <div className="px-4 pt-4 pb-3">
              <h3 id="save-changes-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">Save changes?</h3>
              <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                Your edits have not been saved and will be lost if you close.
              </p>
            </div>
            <div className="px-4 pb-4 flex flex-col gap-2">
              {canSave && (!isCreateMode || editPath.trim() !== '') && (
                <button
                  onClick={() => { setShowDiscardConfirm(false); handleSaveRef.current(); }}
                  disabled={saving}
                  className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
              <button
                onClick={() => { setShowDiscardConfirm(false); clearEditorDraft(setName, tokenPath); onBack(); }}
                className="w-full px-3 py-1.5 rounded text-[11px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-border)]"
              >
                Discard
              </button>
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmModal
          title={`Delete "${tokenPath.split('.').pop()}"?`}
          description={`Token path: ${tokenPath}`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Conflict confirmation */}
      {showConflictConfirm && (
        <ConfirmModal
          title="Token modified on server"
          description="This token was changed on the server since you opened the editor. Overwrite the server version with your changes?"
          confirmLabel="Overwrite"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            setShowConflictConfirm(false);
            handleSave(true);
          }}
          onCancel={() => setShowConflictConfirm(false)}
        />
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        {!isCreateMode && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete token"
            aria-label="Delete token"
            className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        )}
        <button
          onClick={handleBack}
          className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          {isDirty || isCreateMode ? 'Cancel' : 'Close'}
        </button>
        {isDirty && !isCreateMode && (
          <button
            onClick={handleRevert}
            title="Revert to last saved state"
            className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            Revert
          </button>
        )}
        {isCreateMode && onSaveAndCreateAnother && (
          <button
            onClick={() => handleSave(false, true)}
            disabled={saving || !canSave || !editPath.trim()}
            title={`Create this token and immediately start creating another (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)})`}
            className="px-3 py-2 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : (<>Create & New <span className="ml-1 opacity-50 text-[10px]">{adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)}</span></>)}
          </button>
        )}
        <div className="flex-1" onClick={() => { if (!canSave && saveBlockReason && tokenType === 'typography') focusBlockedField(); }}>
          <button
            onClick={() => handleSave()}
            disabled={saving || !canSave || (!isCreateMode && !isDirty) || (isCreateMode && !editPath.trim())}
            title={saveBlockReason || `Save (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE)})`}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? (isCreateMode ? 'Creating…' : 'Saving…')
              : (saveBlockReason
                ? saveBlockReason
                : (!isCreateMode && !isDirty ? 'No changes' : (<>{isCreateMode ? 'Create' : 'Save changes'} <span className="ml-1 opacity-60 text-[10px]">{adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE)}</span></>)))}
          </button>
        </div>
      </div>

      {/* Token Generator Dialog */}
      {showGeneratorDialog && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          sourceTokenPath={tokenPath}
          sourceTokenName={tokenName}
          sourceTokenType={tokenType}
          sourceTokenValue={aliasMode ? null : value}
          allSets={allSets}
          activeSet={setName}
          allTokensFlat={allTokensFlat}
          existingGenerator={editingGeneratorInDialog}
          template={duplicateTemplate}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onClose={() => { setShowGeneratorDialog(false); setDuplicateTemplate(undefined); }}
          onSaved={() => {
            setShowGeneratorDialog(false);
            setDuplicateTemplate(undefined);
            onRefreshGenerators?.();
          }}
        />
      )}
    </div>
  );
}

