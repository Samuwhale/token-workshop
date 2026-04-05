import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { flattenTokenGroup, COMPOSITE_TOKEN_TYPES } from '@tokenmanager/core';
import { AliasAutocomplete } from './AliasAutocomplete';
import { parseInlineValue, valuePlaceholderForType } from './tokenListHelpers';
import { getDefaultValue } from './tokenListUtils';
import { validateTokenPath } from '../shared/tokenParsers';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import {
  ColorEditor, DimensionEditor, TypographyEditor, ShadowEditor,
  BorderEditor, GradientEditor, NumberEditor, DurationEditor,
  FontFamilyEditor, FontWeightEditor, StrokeStyleEditor, StringEditor,
  BooleanEditor, CustomEditor, PercentageEditor, LinkEditor,
  LetterSpacingEditor, LineHeightEditor, CubicBezierEditor, TransitionEditor,
  TextDecorationEditor, TextTransformEditor, AssetEditor, FontStyleEditor,
} from './ValueEditors';
import type { GraphTemplate } from './graph-templates';
import type { GeneratorType } from '../hooks/useGenerators';
import { TYPE_LABELS, TYPE_DESCRIPTIONS, PRIMARY_TYPES } from './generators/generatorUtils';
import { TypeThumbnail } from './generators/TypeThumbnail';
import { Collapsible } from './Collapsible';

// ---------------------------------------------------------------------------
// Draft storage for create form
// ---------------------------------------------------------------------------

const CREATE_DRAFT_KEY = 'tm_create_single_draft';

interface CreateSingleDraftData {
  targetSet: string;
  group: string;
  name: string;
  tokenType: string;
  value: any;
  description: string;
  extendsPath: string;
  refMode: boolean;
  refQuery: string;
  savedAt: number;
}

function saveCreateDraft(data: Omit<CreateSingleDraftData, 'savedAt'>): void {
  try { sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); } catch { /* quota */ }
}

function loadCreateDraft(): CreateSingleDraftData | null {
  try { const raw = sessionStorage.getItem(CREATE_DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function clearCreateDraft(): void {
  try { sessionStorage.removeItem(CREATE_DRAFT_KEY); } catch { /* ignore */ }
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
// Type inference from token path
// ---------------------------------------------------------------------------

/**
 * Infer a DTCG token type from the path segments (group + name).
 * Checks each dot/dash/underscore-separated segment against known keywords.
 * Returns null if no keyword matches — caller keeps the current type.
 */
function inferTypeFromPath(group: string, name: string): string | null {
  const full = group ? `${group}.${name}` : name;
  if (!full.trim()) return null;
  const segments = full.toLowerCase().split(/[.\-_/\s]+/);
  for (const seg of segments) {
    if (['color', 'colour', 'colors', 'colours', 'fill', 'fills', 'background', 'backgrounds', 'bg', 'palette', 'hue', 'tint', 'tints', 'shade', 'shades', 'accent', 'brand'].includes(seg)) return 'color';
    if (['typography', 'typographic'].includes(seg)) return 'typography';
    if (['fontfamily', 'typeface'].includes(seg)) return 'fontFamily';
    if (['fontweight'].includes(seg)) return 'fontWeight';
    if (['lineheight', 'leading'].includes(seg)) return 'lineHeight';
    if (['letterspacing', 'tracking', 'kerning'].includes(seg)) return 'letterSpacing';
    if (['fontstyle'].includes(seg)) return 'fontStyle';
    if (['fontsize'].includes(seg)) return 'dimension';
    if (['font', 'fonts'].includes(seg)) return 'fontFamily';
    if (['shadow', 'shadows', 'elevation'].includes(seg)) return 'shadow';
    if (['border', 'borders', 'outline'].includes(seg)) return 'border';
    if (['gradient', 'gradients'].includes(seg)) return 'gradient';
    if (['spacing', 'space', 'spaces', 'gap', 'gaps', 'padding', 'margin', 'inset', 'offset', 'indent', 'size', 'sizes', 'width', 'height', 'radius', 'corner', 'corners', 'distance'].includes(seg)) return 'dimension';
    if (['duration', 'delay', 'timing'].includes(seg)) return 'duration';
    if (['easing', 'ease', 'bezier'].includes(seg)) return 'cubicBezier';
    if (['transition', 'transitions'].includes(seg)) return 'transition';
    if (['opacity', 'alpha'].includes(seg)) return 'number';
    if (['text', 'body', 'heading', 'headings', 'display', 'label', 'labels', 'caption', 'title', 'subtitle'].includes(seg)) return 'typography';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Alias cycle detection
// ---------------------------------------------------------------------------

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
    if (isAlias(v)) { current = extractAliasPath(v)!; } else { return null; }
  }
}

// ---------------------------------------------------------------------------
// ExtendsTokenPicker — compact picker for selecting a base composite token
// ---------------------------------------------------------------------------

function ExtendsTokenPicker({ tokenType, allTokensFlat, pathToSet, currentPath, onSelect, onClear, extendsPath }: {
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  currentPath: string;
  onSelect: (path: string) => void;
  onClear: () => void;
  extendsPath: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const candidates = useMemo(() => {
    return Object.entries(allTokensFlat)
      .filter(([p, e]) => e.$type === tokenType && p !== currentPath)
      .map(([p]) => p);
  }, [allTokensFlat, tokenType, currentPath]);

  const filtered = useMemo(() => {
    if (!search) return candidates.slice(0, 50);
    const q = search.toLowerCase();
    return candidates.filter(p => p.toLowerCase().includes(q)).slice(0, 50);
  }, [candidates, search]);

  if (extendsPath) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-bg)]">
        <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Extends</span>
        <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-accent)] truncate">{extendsPath}</span>
        <button type="button" onClick={onClear} className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)]" title="Remove base token">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    );
  }

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
          className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setSearch(''); } }}
        />
        <button type="button" onClick={() => { setOpen(false); setSearch(''); }} className="px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
      </div>
      {candidates.length > 50 && !search && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] px-0.5">Showing 50 of {candidates.length} — refine search to narrow results</p>
      )}
      <div className="max-h-32 overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {filtered.length === 0
          ? <p className="px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">No matching {tokenType} tokens</p>
          : filtered.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => { onSelect(p); setOpen(false); setSearch(''); }}
              className="w-full text-left px-2 py-1 text-[11px] font-mono text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] truncate"
              title={`${p} (${pathToSet[p] || ''})`}
            >
              {p}
            </button>
          ))
        }
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateTab = 'single' | 'scale' | 'bulk';

export interface CreatePanelProps {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  allGroupPaths: string[];
  connected: boolean;
  /** Pre-fill initial values */
  initialTab?: CreateTab;
  initialPath?: string;
  initialType?: string;
  initialValue?: string;
  /** Available graph templates for the Scale tab */
  graphTemplates?: GraphTemplate[];
  /** When a generator template is selected from the Scale tab */
  onOpenGenerator?: (template: GraphTemplate) => void;
  /** Called when a token is successfully created */
  onTokenCreated?: (path: string) => void;
  /** Called to refresh data after creation */
  onRefresh: () => void;
  /** Close the panel */
  onClose: () => void;
  /** Available fonts for typography editor */
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
}

// ---------------------------------------------------------------------------
// Token type categories (for the type picker)
// ---------------------------------------------------------------------------

const TYPE_CATEGORIES = [
  { group: 'Core', types: ['color', 'dimension', 'number', 'string', 'boolean'] },
  { group: 'Composite', types: ['typography', 'shadow', 'border', 'gradient', 'transition'] },
  { group: 'Specialized', types: ['duration', 'fontFamily', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'cubicBezier', 'percentage', 'strokeStyle', 'textDecoration', 'textTransform', 'link', 'asset'] },
];

// ---------------------------------------------------------------------------
// CreatePanel component
// ---------------------------------------------------------------------------

export function CreatePanel({
  serverUrl,
  activeSet,
  allSets,
  allTokensFlat,
  pathToSet,
  allGroupPaths,
  connected,
  initialTab = 'single',
  initialPath,
  initialType,
  initialValue,
  graphTemplates = [],
  onOpenGenerator,
  onTokenCreated,
  onRefresh,
  onClose,
  availableFonts,
  fontWeightsByFamily,
}: CreatePanelProps) {
  const [activeTab, setActiveTab] = useState<CreateTab>(initialTab);

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
        <div className="flex-1 flex items-center gap-1">
          {(['single', 'scale', 'bulk'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
              }`}
            >
              {tab === 'single' ? 'Single' : tab === 'scale' ? 'Scale' : 'Bulk'}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'single' && (
          <SingleCreateTab
            serverUrl={serverUrl}
            activeSet={activeSet}
            allSets={allSets}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            allGroupPaths={allGroupPaths}
            connected={connected}
            initialPath={initialPath}
            initialType={initialType}
            initialValue={initialValue}
            onTokenCreated={onTokenCreated}
            onRefresh={onRefresh}
            availableFonts={availableFonts}
            fontWeightsByFamily={fontWeightsByFamily}
          />
        )}
        {activeTab === 'scale' && (
          <ScaleTab
            graphTemplates={graphTemplates}
            onOpenGenerator={onOpenGenerator}
          />
        )}
        {activeTab === 'bulk' && (
          <BulkTab
            serverUrl={serverUrl}
            activeSet={activeSet}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            allGroupPaths={allGroupPaths}
            connected={connected}
            onTokenCreated={onTokenCreated}
            onRefresh={onRefresh}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single create tab — full-featured single token creation
// ---------------------------------------------------------------------------

function SingleCreateTab({
  serverUrl,
  activeSet,
  allSets,
  allTokensFlat,
  pathToSet,
  allGroupPaths,
  connected,
  initialPath,
  initialType,
  initialValue,
  onTokenCreated,
  onRefresh,
  availableFonts,
  fontWeightsByFamily,
}: {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  allGroupPaths: string[];
  connected: boolean;
  initialPath?: string;
  initialType?: string;
  initialValue?: string;
  onTokenCreated?: (path: string) => void;
  onRefresh: () => void;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
}) {
  // Parse initial path into group + name
  const [group, setGroup] = useState(() => {
    if (!initialPath) return '';
    const parts = initialPath.split('.');
    return parts.length > 1 ? parts.slice(0, -1).join('.') : '';
  });
  const [name, setName] = useState(() => {
    if (!initialPath) return '';
    const parts = initialPath.split('.');
    return parts[parts.length - 1] || '';
  });
  const [tokenType, setTokenType] = useState(initialType || 'color');
  // Tracks whether the user has explicitly clicked a type button — suppresses path inference when true
  const typeSetManually = useRef(!!initialType);
  const [typeIsInferred, setTypeIsInferred] = useState(false);
  const [value, setValue] = useState<any>(() => {
    if (initialValue) return parseInlineValue(initialType || 'color', initialValue);
    return getDefaultValue(initialType || 'color');
  });
  const [description, setDescription] = useState('');
  const [targetSet, setTargetSet] = useState(activeSet);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refMode, setRefMode] = useState(false);
  const [refQuery, setRefQuery] = useState('');
  const [extendsPath, setExtendsPath] = useState('');
  const [pendingDraft, setPendingDraft] = useState<CreateSingleDraftData | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [groupOpen, setGroupOpen] = useState(false);

  // Load draft on mount (only when no pre-filled initial values)
  useEffect(() => {
    if (initialPath || initialType || initialValue) return;
    const d = loadCreateDraft();
    if (d && d.targetSet === activeSet && d.name) setPendingDraft(d);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft whenever form has a name
  useEffect(() => {
    if (!name.trim()) { clearCreateDraft(); return; }
    saveCreateDraft({ targetSet, group, name, tokenType, value, description, extendsPath, refMode, refQuery });
  }, [targetSet, group, name, tokenType, value, description, extendsPath, refMode, refQuery]);

  const handleRestoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    setGroup(pendingDraft.group);
    setName(pendingDraft.name);
    typeSetManually.current = true; // respect the saved type, not path inference
    setTypeIsInferred(false);
    setTokenType(pendingDraft.tokenType);
    setValue(pendingDraft.value);
    setDescription(pendingDraft.description);
    setExtendsPath(pendingDraft.extendsPath);
    setRefMode(pendingDraft.refMode);
    setRefQuery(pendingDraft.refQuery);
    if (pendingDraft.targetSet !== targetSet) setTargetSet(pendingDraft.targetSet);
    setPendingDraft(null);
  }, [pendingDraft, targetSet]);

  const fullPath = useMemo(() => {
    const g = group.trim();
    const n = name.trim();
    if (!n) return '';
    return g ? `${g}.${n}` : n;
  }, [group, name]);

  const pathError = useMemo(() => {
    if (!fullPath) return null;
    return validateTokenPath(fullPath);
  }, [fullPath]);

  const pathExists = fullPath ? fullPath in allTokensFlat : false;

  const filteredGroups = useMemo(() => {
    if (!group.trim()) return allGroupPaths.slice(0, 20);
    const q = group.trim().toLowerCase();
    return allGroupPaths
      .map(g => ({ path: g, score: fuzzyScore(g.toLowerCase(), q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(x => x.path);
  }, [group, allGroupPaths]);

  // Detect circular alias reference
  const aliasHasCycle = useMemo((): string[] | null => {
    if (!refMode) return null;
    const v = typeof value === 'string' && value.startsWith('{') && value.endsWith('}') ? value : null;
    if (!v || !isAlias(v) || !fullPath) return null;
    return detectAliasCycle(v, fullPath, allTokensFlat);
  }, [refMode, value, fullPath, allTokensFlat]);

  // Consolidated block reason — shown on the button and as an inline error
  const saveBlockReason = useMemo((): string | null => {
    if (!name.trim()) return 'Enter a token name';
    if (pathError) return pathError;
    if (pathExists) return 'Token already exists — edit it instead or choose a different name';
    if (aliasHasCycle) return `Circular reference: ${aliasHasCycle.join(' → ')}`;
    if (tokenType === 'typography' && !refMode) {
      const v = typeof value === 'object' && value !== null ? value : {};
      const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
      const missingFamily = !family || String(family).trim() === '';
      const missingSize = fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0;
      if (missingFamily && missingSize) return 'Font family and size required';
      if (missingFamily) return 'Font family required';
      if (missingSize) return 'Font size required';
    }
    return null;
  }, [name, pathError, pathExists, aliasHasCycle, tokenType, refMode, value]);

  const handleCreate = useCallback(async () => {
    if (saveBlockReason || !connected || saving) return;
    setSaving(true);
    setError('');
    try {
      const body: Record<string, any> = { $type: tokenType, $value: value };
      if (description.trim()) body.$description = description.trim();
      if (extendsPath) body.$extensions = { tokenmanager: { extends: extendsPath } };
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${tokenPathToUrlSegment(fullPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      clearCreateDraft();
      onRefresh();
      onTokenCreated?.(fullPath);
      // Reset for next creation — keep group pre-filled so user can type next sibling name
      setName('');
      setValue(getDefaultValue(tokenType));
      setDescription('');
      setRefMode(false);
      setRefQuery('');
      setExtendsPath('');
      setTimeout(() => nameInputRef.current?.focus(), 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [saveBlockReason, connected, saving, tokenType, value, description, extendsPath, targetSet, fullPath, serverUrl, onRefresh, onTokenCreated]);

  const handleTypeChange = (type: string) => {
    typeSetManually.current = true;
    setTypeIsInferred(false);
    setTokenType(type);
    setValue(getDefaultValue(type));
    setRefMode(false);
    setRefQuery('');
    setExtendsPath('');
  };

  // Stable ref so the keydown handler never goes stale without re-registering
  const handleCreateRef = useRef(handleCreate);
  handleCreateRef.current = handleCreate;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleCreateRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCreateRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="p-4 flex flex-col gap-3">

      {/* Draft restore banner */}
      {pendingDraft && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-text-secondary)]">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
          </svg>
          <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Unsaved draft from {formatDraftAge(pendingDraft.savedAt)} — <strong className="text-[var(--color-figma-text)]">{pendingDraft.group ? `${pendingDraft.group}.${pendingDraft.name}` : pendingDraft.name}</strong>
          </span>
          <button
            type="button"
            onClick={handleRestoreDraft}
            className="px-2 py-0.5 rounded text-[10px] bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
          >Restore</button>
          <button
            type="button"
            onClick={() => { clearCreateDraft(); setPendingDraft(null); }}
            className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)]"
            title="Dismiss draft"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-text-secondary)]">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <select
            value={targetSet}
            onChange={e => setTargetSet(e.target.value)}
            className="flex-1 bg-transparent text-[10px] text-[var(--color-figma-text)] outline-none"
          >
            {allSets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="relative">
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5">Group</label>
        <input
          type="text"
          placeholder="Root (none)"
          value={group}
          onChange={e => {
            const newGroup = e.target.value;
            setGroup(newGroup);
            setGroupOpen(true);
            setError('');
            if (!typeSetManually.current) {
              const inferred = inferTypeFromPath(newGroup, name);
              if (inferred && inferred !== tokenType) { setTokenType(inferred); setValue(getDefaultValue(inferred)); setTypeIsInferred(true); }
            }
          }}
          onFocus={() => setGroupOpen(true)}
          onBlur={() => setTimeout(() => setGroupOpen(false), 150)}
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
        />
        {groupOpen && filteredGroups.length > 0 && (
          <div className="absolute z-50 left-0 right-0 mt-0.5 max-h-[160px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg">
            {filteredGroups.map(gp => (
              <button
                key={gp}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroup(gp);
                  setGroupOpen(false);
                  if (!typeSetManually.current) {
                    const inferred = inferTypeFromPath(gp, name);
                    if (inferred && inferred !== tokenType) { setTokenType(inferred); setValue(getDefaultValue(inferred)); setTypeIsInferred(true); }
                  }
                }}
                className="w-full text-left px-2 py-1 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors truncate"
              >
                {gp}
              </button>
            ))}
          </div>
        )}
      </div>


      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5">Name</label>
        <input
          ref={nameInputRef}
          type="text"
          placeholder="e.g. 500, base, primary"
          value={name}
          onChange={e => {
            const newName = e.target.value;
            setName(newName);
            setError('');
            if (!newName.trim()) { typeSetManually.current = false; setTypeIsInferred(false); }
            if (!typeSetManually.current) {
              const inferred = inferTypeFromPath(group, newName);
              if (inferred && inferred !== tokenType) { setTokenType(inferred); setValue(getDefaultValue(inferred)); setTypeIsInferred(true); }
              else if (!inferred) setTypeIsInferred(false);
            }
          }}
          className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${
            pathError || pathExists ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'
          }`}
          autoFocus
        />
        {fullPath && (
          <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
            Path: <span className="text-[var(--color-figma-text-secondary)] font-mono">{fullPath}</span>
          </div>
        )}
        {pathError && <p className="mt-0.5 text-[10px] text-[var(--color-figma-error)]">{pathError}</p>}
        {pathExists && !pathError && <p className="mt-0.5 text-[10px] text-[var(--color-figma-error)]">Token already exists — edit it instead or choose a different name</p>}
      </div>


      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Type</label>
          {typeIsInferred && (
            <span className="text-[9px] text-[var(--color-figma-text-tertiary)] italic">inferred from path</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {TYPE_CATEGORIES[0].types.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeChange(t)}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                tokenType === t
                  ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Collapsible
          open={!TYPE_CATEGORIES[0].types.includes(tokenType)}
          onToggle={() => {}}
          className="mt-1"
          label="More types"
        >
          <div className="flex flex-wrap gap-1 mt-1">
            {[...TYPE_CATEGORIES[1].types, ...TYPE_CATEGORIES[2].types].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                  tokenType === t
                    ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Collapsible>
      </div>

      {/* Value — with reference toggle */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">Value</label>
          <button
            type="button"
            onClick={() => {
              const next = !refMode;
              setRefMode(next);
              if (next) {
                setRefQuery('');
                setTimeout(() => refInputRef.current?.focus(), 0);
              }
            }}
            title={refMode ? 'Switch to direct value' : 'Reference an existing token'}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              refMode
                ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            {refMode ? 'Reference' : 'Ref'}
          </button>
        </div>

        {refMode ? (
          <div className="relative">
            {typeof value === 'string' && value.startsWith('{') && value.endsWith('}') ? (
              <>
                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border ${aliasHasCycle ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-accent)]/40'}`}>
                  <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-accent)] truncate">
                    {value.slice(1, -1)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setValue(getDefaultValue(tokenType)); setRefQuery(''); }}
                    className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)]"
                    title="Clear reference"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                {aliasHasCycle && (
                  <p className="mt-0.5 text-[10px] text-[var(--color-figma-error)]">
                    Circular reference: {aliasHasCycle.join(' → ')}
                  </p>
                )}
              </>
            ) : (
              <>
                <input
                  ref={refInputRef}
                  type="text"
                  placeholder="Search tokens to reference..."
                  value={refQuery}
                  onChange={e => setRefQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setRefMode(false); }}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none"
                />
                {refQuery && (
                  <AliasAutocomplete
                    query={refQuery}
                    allTokensFlat={allTokensFlat}
                    pathToSet={pathToSet}
                    filterType={tokenType !== 'custom' ? tokenType : undefined}
                    onSelect={path => {
                      setValue(`{${path}}`);
                      setRefQuery('');
                      const entry = allTokensFlat[path];
                      if (entry?.$type) setTokenType(entry.$type);
                    }}
                    onClose={() => setRefQuery('')}
                  />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
            <ValueEditorForType
              type={tokenType}
              value={value}
              onChange={setValue}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              availableFonts={availableFonts}
              fontWeightsByFamily={fontWeightsByFamily}
            />
          </div>
        )}
      </div>

      {/* Similar token detection */}
      <SimilarTokenHint
        value={value}
        tokenType={tokenType}
        allTokensFlat={allTokensFlat}
        onUseReference={(path) => { setValue(`{${path}}`); setRefMode(true); }}
      />

      {/* Description */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5">Description</label>
        <input
          type="text"
          placeholder="Optional description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
        />
      </div>

      {/* Extends — only for composite token types */}
      {COMPOSITE_TOKEN_TYPES.has(tokenType) && !refMode && (
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5">Extends (optional)</label>
          <ExtendsTokenPicker
            tokenType={tokenType}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            currentPath={fullPath}
            extendsPath={extendsPath}
            onSelect={setExtendsPath}
            onClear={() => setExtendsPath('')}
          />
        </div>
      )}

      {error && <p className="text-[10px] text-[var(--color-figma-error)]">{error}</p>}

      <div className="flex flex-col gap-1.5 pt-1">
        <button
          onClick={handleCreate}
          disabled={!!saveBlockReason || !connected || saving}
          title={saveBlockReason ?? 'Create token (⌘↵ or ⌘S)'}
          className="flex-1 px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
        >
          {saving ? 'Creating...' : 'Create Token'}
        </button>
        {saveBlockReason && !pathError && !pathExists && !aliasHasCycle && (
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">{saveBlockReason}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value editor router — renders the right editor for the token type
// ---------------------------------------------------------------------------

function ValueEditorForType({
  type,
  value,
  onChange,
  allTokensFlat,
  pathToSet,
  availableFonts,
  fontWeightsByFamily,
}: {
  type: string;
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
}) {
  switch (type) {
    case 'color': return <ColorEditor value={value} onChange={onChange} />;
    case 'dimension': return <DimensionEditor value={value} onChange={onChange} />;
    case 'typography': return <TypographyEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToSet={pathToSet} availableFonts={availableFonts} fontWeightsByFamily={fontWeightsByFamily} />;
    case 'shadow': return <ShadowEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />;
    case 'border': return <BorderEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />;
    case 'gradient': return <GradientEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />;
    case 'number': return <NumberEditor value={value} onChange={onChange} />;
    case 'duration': return <DurationEditor value={value} onChange={onChange} />;
    case 'fontFamily': return <FontFamilyEditor value={value} onChange={onChange} />;
    case 'fontWeight': return <FontWeightEditor value={value} onChange={onChange} />;
    case 'fontStyle': return <FontStyleEditor value={value} onChange={onChange} />;
    case 'strokeStyle': return <StrokeStyleEditor value={value} onChange={onChange} />;
    case 'boolean': return <BooleanEditor value={value} onChange={onChange} />;
    case 'percentage': return <PercentageEditor value={value} onChange={onChange} />;
    case 'link': return <LinkEditor value={value} onChange={onChange} />;
    case 'letterSpacing': return <LetterSpacingEditor value={value} onChange={onChange} />;
    case 'lineHeight': return <LineHeightEditor value={value} onChange={onChange} />;
    case 'cubicBezier': return <CubicBezierEditor value={value} onChange={onChange} />;
    case 'transition': return <TransitionEditor value={value} onChange={onChange} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />;
    case 'textDecoration': return <TextDecorationEditor value={value} onChange={onChange} />;
    case 'textTransform': return <TextTransformEditor value={value} onChange={onChange} />;
    case 'asset': return <AssetEditor value={value} onChange={onChange} />;
    case 'string': return <StringEditor value={value} onChange={onChange} />;
    default: return <CustomEditor value={value} onChange={onChange} />;
  }
}

// ---------------------------------------------------------------------------
// Scale tab — generator template picker
// ---------------------------------------------------------------------------

function ScaleTab({
  graphTemplates,
  onOpenGenerator,
}: {
  graphTemplates: GraphTemplate[];
  onOpenGenerator?: (template: GraphTemplate) => void;
}) {
  const [search, setSearch] = useState('');

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return graphTemplates;
    const q = search.toLowerCase();
    return graphTemplates.filter(t =>
      t.label.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.generatorType.toLowerCase().includes(q)
    );
  }, [search, graphTemplates]);

  if (!onOpenGenerator) {
    return (
      <div className="p-4 text-[11px] text-[var(--color-figma-text-secondary)]">
        Generator templates are not available in this context.
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
        Generate a full scale of tokens from a single value. Pick a template to get started — you'll configure the details in the next step.
      </p>
      <input
        type="text"
        placeholder="Search templates..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
      />
      <div className="flex flex-col gap-1.5">
        {filteredTemplates.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpenGenerator(t)}
            className="w-full text-left p-3 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/5 transition-all group"
          >
            <div className="flex items-start gap-2.5">
              <div className="flex-none w-8 h-8 rounded flex items-center justify-center bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] group-hover:text-[var(--color-figma-accent)] transition-colors">
                <TypeThumbnail type={t.generatorType as GeneratorType} size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)] transition-colors">
                    {t.label}
                  </span>
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                    {TYPE_LABELS[t.generatorType as GeneratorType] || t.generatorType}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">{t.description}</p>
              </div>
            </div>
          </button>
        ))}
        {filteredTemplates.length === 0 && (
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center py-4">
            {search ? 'No matching templates' : 'No templates available'}
          </p>
        )}
      </div>

      {/* Manual generator types — visual cards */}
      <div className="mt-2 pt-3 border-t border-[var(--color-figma-border)]">
        <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-2">Or start from scratch:</p>
        <div className="flex flex-col gap-1">
          {PRIMARY_TYPES.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => onOpenGenerator({ id: `custom-${type}`, label: TYPE_LABELS[type], description: '', generatorType: type, defaultPrefix: '', config: {}, requiresSource: true, stages: [], semanticLayers: [] } as any)}
              className="w-full text-left px-2.5 py-2 rounded-lg border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-bg-hover)] transition-colors flex items-center gap-2.5 group"
            >
              <div className="flex-none w-6 h-6 rounded flex items-center justify-center text-[var(--color-figma-text-secondary)] group-hover:text-[var(--color-figma-accent)] transition-colors">
                <TypeThumbnail type={type} size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{TYPE_LABELS[type]}</span>
                <p className="text-[9px] text-[var(--color-figma-text-secondary)] leading-snug">{TYPE_DESCRIPTIONS[type]}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk tab — table-based multi-token creation
// ---------------------------------------------------------------------------

function BulkTab({
  serverUrl,
  activeSet,
  allTokensFlat,
  pathToSet,
  allGroupPaths,
  connected,
  onTokenCreated,
  onRefresh,
}: {
  serverUrl: string;
  activeSet: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  allGroupPaths: string[];
  connected: boolean;
  onTokenCreated?: (path: string) => void;
  onRefresh: () => void;
}) {
  const [group, setGroup] = useState('');
  const [rows, setRows] = useState<Array<{ id: string; name: string; type: string; value: string; rawValue?: unknown }>>([
    { id: '1', name: '', type: 'color', value: '' },
    { id: '2', name: '', type: 'color', value: '' },
    { id: '3', name: '', type: 'color', value: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(4);

  const addRow = () => {
    const lastType = rows[rows.length - 1]?.type || 'color';
    setRows(r => [...r, { id: String(nextId.current++), name: '', type: lastType, value: '' }]);
  };

  const updateRow = (id: string, field: string, value: string) => {
    setRows(r => r.map(row => {
      if (row.id !== id) return row;
      // Clear rawValue when user manually edits the value field so parseInlineValue is used
      const update: typeof row = { ...row, [field]: value };
      if (field === 'value') delete update.rawValue;
      return update;
    }));
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(r => r.filter(row => row.id !== id));
  };

  const handleCreateAll = async () => {
    const validRows = rows.filter(r => r.name.trim());
    if (validRows.length === 0 || !connected) return;
    setSaving(true);
    setError('');
    try {
      for (const row of validRows) {
        const fullPath = group.trim() ? `${group.trim()}.${row.name.trim()}` : row.name.trim();
        const parsedValue = row.rawValue !== undefined ? row.rawValue : parseInlineValue(row.type, row.value.trim());
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${tokenPathToUrlSegment(fullPath)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: row.type, $value: parsedValue }),
        });
        onTokenCreated?.(fullPath);
      }
      onRefresh();
      // Reset rows
      setRows([
        { id: String(nextId.current++), name: '', type: 'color', value: '' },
        { id: String(nextId.current++), name: '', type: 'color', value: '' },
        { id: String(nextId.current++), name: '', type: 'color', value: '' },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const validCount = rows.filter(r => r.name.trim()).length;

  // Paste handler: detect DTCG JSON or tab-separated values and auto-populate rows
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain').trim();

    // Try DTCG JSON format first (nested token group)
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          const flat = flattenTokenGroup(parsed);
          if (flat.size > 0) {
            e.preventDefault();
            const newRows = Array.from(flat.entries()).map(([path, token]) => {
              const rawValue = token.$value;
              const displayValue = typeof rawValue === 'string'
                ? rawValue
                : typeof rawValue === 'number' || typeof rawValue === 'boolean'
                  ? String(rawValue)
                  : JSON.stringify(rawValue);
              return {
                id: String(nextId.current++),
                name: path,
                type: token.$type || 'string',
                value: displayValue,
                rawValue,
              };
            });
            if (newRows.length > 0) {
              setRows(newRows);
              return;
            }
          }
        }
      } catch {
        // Not valid JSON — fall through to tab-separated handling
      }
    }

    // Tab-separated fallback (name, type, value)
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2 || !lines[0].includes('\t')) return; // Not tabular data
    e.preventDefault();
    const parsed = lines.map(line => {
      const parts = line.split('\t');
      return {
        id: String(nextId.current++),
        name: (parts[0] || '').trim(),
        type: (['color', 'dimension', 'number', 'string', 'boolean', 'duration'].includes((parts[1] || '').trim().toLowerCase())
          ? (parts[1] || '').trim().toLowerCase()
          : 'color'),
        value: (parts[2] || parts[1] || '').trim(),
      };
    }).filter(r => r.name);
    if (parsed.length > 0) setRows(parsed);
  };

  return (
    <div className="p-4 flex flex-col gap-3" onPaste={handlePaste}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5">Group prefix</label>
          <input
            type="text"
            placeholder="Root (none)"
            value={group}
            onChange={e => setGroup(e.target.value)}
            list="bulk-groups"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
          />
          <datalist id="bulk-groups">
            {allGroupPaths.slice(0, 30).map(g => <option key={g} value={g} />)}
          </datalist>
        </div>
      </div>

      <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">
        Paste DTCG JSON (nested token group) or tab-separated data (name, type, value) to auto-fill rows.
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[20px_1fr_80px_1fr_24px] gap-1 text-[10px] text-[var(--color-figma-text-secondary)] px-0.5">
        <span></span>
        <span>Name</span>
        <span>Type</span>
        <span>Value</span>
        <span></span>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map(row => {
          const isColor = row.type === 'color';
          const hasColorValue = isColor && /^#[0-9a-fA-F]{6}$/i.test(row.value);
          return (
            <div key={row.id} className="grid grid-cols-[20px_1fr_80px_1fr_24px] gap-1 items-center">
              {/* Value preview */}
              <div className="flex items-center justify-center">
                {isColor && hasColorValue ? (
                  <div className="w-4 h-4 rounded-sm border border-[var(--color-figma-border)]" style={{ backgroundColor: row.value }} />
                ) : row.type === 'dimension' && row.value ? (
                  <div className="w-4 h-1.5 rounded-sm bg-[var(--color-figma-accent)]/40" style={{ width: `${Math.min(16, Math.max(4, parseFloat(row.value) || 4))}px` }} />
                ) : (
                  <div className="w-4 h-4 rounded-sm border border-dashed border-[var(--color-figma-border)]/40" />
                )}
              </div>
              <input
                type="text"
                placeholder="name"
                value={row.name}
                onChange={e => updateRow(row.id, 'name', e.target.value)}
                className="px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              />
              <select
                value={row.type}
                onChange={e => updateRow(row.id, 'type', e.target.value)}
                className="px-1 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px]"
              >
                <optgroup label="Core">
                  <option value="color">color</option>
                  <option value="dimension">dimension</option>
                  <option value="number">number</option>
                  <option value="string">string</option>
                  <option value="boolean">boolean</option>
                </optgroup>
                <optgroup label="Composite">
                  <option value="typography">typography</option>
                  <option value="shadow">shadow</option>
                  <option value="border">border</option>
                  <option value="gradient">gradient</option>
                  <option value="transition">transition</option>
                </optgroup>
                <optgroup label="Specialized">
                  <option value="duration">duration</option>
                  <option value="fontFamily">fontFamily</option>
                  <option value="fontWeight">fontWeight</option>
                  <option value="fontStyle">fontStyle</option>
                  <option value="letterSpacing">letterSpacing</option>
                  <option value="lineHeight">lineHeight</option>
                  <option value="cubicBezier">cubicBezier</option>
                  <option value="percentage">percentage</option>
                  <option value="strokeStyle">strokeStyle</option>
                  <option value="textDecoration">textDecoration</option>
                  <option value="textTransform">textTransform</option>
                  <option value="link">link</option>
                  <option value="asset">asset</option>
                </optgroup>
              </select>
              {/* Type-aware value input */}
              <div className="flex items-center gap-1">
                {isColor && (
                  <input
                    type="color"
                    value={hasColorValue ? row.value : '#808080'}
                    onChange={e => updateRow(row.id, 'value', e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border border-[var(--color-figma-border)] shrink-0"
                    aria-label={`Pick color for ${row.name || 'row'}`}
                  />
                )}
                <input
                  type="text"
                  placeholder={valuePlaceholderForType(row.type)}
                  value={row.value}
                  onChange={e => updateRow(row.id, 'value', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 1}
                className="p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] disabled:opacity-30"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="w-full px-2 py-2 rounded-lg border border-dashed border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
      >
        + Add row
      </button>

      {error && <p className="text-[10px] text-[var(--color-figma-error)]">{error}</p>}

      <button
        onClick={handleCreateAll}
        disabled={validCount === 0 || !connected || saving}
        className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
      >
        {saving ? 'Creating...' : `Create ${validCount} token${validCount !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Similar token detection hint
// ---------------------------------------------------------------------------

function SimilarTokenHint({
  value,
  tokenType,
  allTokensFlat,
  onUseReference,
}: {
  value: any;
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  onUseReference: (path: string) => void;
}) {
  const similar = useMemo(() => {
    if (!value || (typeof value === 'string' && value.startsWith('{'))) return [];

    const matches: Array<{ path: string; value: any }> = [];

    if (tokenType === 'color' && typeof value === 'string') {
      const hex = value.toLowerCase().replace(/^#/, '');
      if (hex.length < 3) return [];
      for (const [path, entry] of Object.entries(allTokensFlat)) {
        if (entry.$type !== 'color') continue;
        const ev = typeof entry.$value === 'string' ? entry.$value.toLowerCase().replace(/^#/, '') : '';
        if (ev && ev === hex) {
          matches.push({ path, value: entry.$value });
          if (matches.length >= 3) break;
        }
      }
    } else if (tokenType === 'dimension' && typeof value === 'object' && value !== null && 'value' in value) {
      for (const [path, entry] of Object.entries(allTokensFlat)) {
        if (entry.$type !== 'dimension') continue;
        const ev = entry.$value as any;
        if (typeof ev === 'object' && ev !== null && ev.value === value.value && (ev.unit || 'px') === (value.unit || 'px')) {
          matches.push({ path, value: entry.$value });
          if (matches.length >= 3) break;
        }
      }
    } else if (tokenType === 'number' && typeof value === 'number') {
      for (const [path, entry] of Object.entries(allTokensFlat)) {
        if (entry.$type !== 'number') continue;
        if (entry.$value === value) {
          matches.push({ path, value: entry.$value });
          if (matches.length >= 3) break;
        }
      }
    }

    return matches;
  }, [value, tokenType, allTokensFlat]);

  if (similar.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 rounded border border-dashed border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/5">
      <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
        Similar token{similar.length > 1 ? 's' : ''} already exist{similar.length === 1 ? 's' : ''} — use a reference instead?
      </span>
      {similar.map(s => (
        <button
          key={s.path}
          type="button"
          onClick={() => onUseReference(s.path)}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-left hover:bg-[var(--color-figma-accent)]/10 transition-colors group"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-accent)]">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
          <span className="text-[10px] font-mono text-[var(--color-figma-accent)] truncate">{s.path}</span>
          <span className="text-[9px] text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 shrink-0">Use</span>
        </button>
      ))}
    </div>
  );
}
