import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { resolveRefValue, evalExpr, isFormula } from '@tokenmanager/core';
import type { ThemeDimension } from '@tokenmanager/core';
import { AliasAutocomplete } from './AliasAutocomplete';
import { ConfirmModal } from './ConfirmModal';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { applyColorModifiers } from '@tokenmanager/core';
import type { ColorModifierOp } from '@tokenmanager/core';
import { wcagContrast } from '../shared/colorUtils';
import { ColorPicker } from './ColorPicker';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';
import { ValueDiff } from './ValueDiff';
import type { TokenGenerator } from '../hooks/useGenerators';

// ---------------------------------------------------------------------------
// Figma variable scopes by token type
// ---------------------------------------------------------------------------
const FIGMA_SCOPES: Record<string, { label: string; value: string }[]> = {
  color: [
    { label: 'Fill Color', value: 'FILL_COLOR' },
    { label: 'Stroke Color', value: 'STROKE_COLOR' },
    { label: 'Text Fill', value: 'TEXT_FILL' },
    { label: 'Effect Color', value: 'EFFECT_COLOR' },
  ],
  number: [
    { label: 'Width & Height', value: 'WIDTH_HEIGHT' },
    { label: 'Gap / Spacing', value: 'GAP' },
    { label: 'Corner Radius', value: 'CORNER_RADIUS' },
    { label: 'Opacity', value: 'OPACITY' },
    { label: 'Font Size', value: 'FONT_SIZE' },
    { label: 'Line Height', value: 'LINE_HEIGHT' },
    { label: 'Letter Spacing', value: 'LETTER_SPACING' },
    { label: 'Stroke Width', value: 'STROKE_FLOAT' },
  ],
  dimension: [
    { label: 'Width & Height', value: 'WIDTH_HEIGHT' },
    { label: 'Gap / Spacing', value: 'GAP' },
    { label: 'Corner Radius', value: 'CORNER_RADIUS' },
    { label: 'Stroke Width', value: 'STROKE_FLOAT' },
  ],
  string: [
    { label: 'Font Family', value: 'FONT_FAMILY' },
    { label: 'Font Style', value: 'FONT_STYLE' },
    { label: 'Text Content', value: 'TEXT_CONTENT' },
  ],
  boolean: [
    { label: 'Visibility (Show/Hide)', value: 'SHOW_HIDE' },
  ],
};


function resolveAliasChain(
  ref: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  visited = new Set<string>()
): { path: string; value: any; type: string }[] {
  const path = ref.startsWith('{') && ref.endsWith('}') ? ref.slice(1, -1) : ref;
  if (visited.has(path)) return [];
  visited.add(path);
  const entry = allTokensFlat[path];
  if (!entry) return [{ path, value: undefined, type: 'unknown' }];
  const v = entry.$value;
  const current = { path, value: v, type: entry.$type as string };
  if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
    return [current, ...resolveAliasChain(v, allTokensFlat, visited)];
  }
  return [current];
}

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
  let current = ref.startsWith('{') && ref.endsWith('}') ? ref.slice(1, -1) : ref;
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
    if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
      current = v.slice(1, -1);
    } else {
      return null;
    }
  }
}

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
}

export function TokenEditor({ tokenPath, tokenName, setName, serverUrl, onBack, allTokensFlat = {}, pathToSet = {}, generators = [], allSets = [], onRefreshGenerators, isCreateMode = false, initialType, initialValue, onDirtyChange, onSaved, dimensions = [] }: TokenEditorProps) {
  const [loading, setLoading] = useState(!isCreateMode);
  // Editable path, only used in create mode
  const [editPath, setEditPath] = useState(tokenPath);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState(initialType || 'color');
  const [value, setValue] = useState<any>(() => {
    if (!isCreateMode) return '';
    const t = initialType || 'color';
    if (t === 'color') return '#000000';
    if (t === 'dimension') return { value: 0, unit: 'px' };
    if (t === 'number' || t === 'duration') return 0;
    if (t === 'boolean') return false;
    if (t === 'shadow') return { x: 0, y: 0, blur: 4, spread: 0, color: '#000000', type: 'dropShadow' };
    return '';
  });
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState(() => {
    if (isCreateMode && initialValue && initialValue.startsWith('{') && initialValue.endsWith('}')) return initialValue;
    return '';
  });
  const [aliasMode, setAliasMode] = useState(() => {
    if (isCreateMode && initialValue && initialValue.startsWith('{') && initialValue.endsWith('}')) return true;
    return false;
  });
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  const preAliasValueRef = useRef<any>(null);
  const [showContrast, setShowContrast] = useState(false);
  const [bgTokenPath, setBgTokenPath] = useState<string>('');
  const [bgQuery, setBgQuery] = useState('');
  const [bgSearchOpen, setBgSearchOpen] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [showScopes, setShowScopes] = useState(false);
  const initialRef = useRef<{ value: any; description: string; reference: string; scopes: string[]; type: string; colorModifiers: ColorModifierOp[]; modeValues: Record<string, any>; extensionsJsonText: string } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGeneratorDialog, setShowGeneratorDialog] = useState(false);
  const [editingGeneratorInDialog, setEditingGeneratorInDialog] = useState<TokenGenerator | undefined>(undefined);
  const [colorModifiers, setColorModifiers] = useState<ColorModifierOp[]>([]);
  const [showModifiers, setShowModifiers] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<string | null>(null);
  const [dependents, setDependents] = useState<Array<{ path: string; setName: string }>>([]);
  const [showDependents, setShowDependents] = useState(false);
  const [dependentsLoading, setDependentsLoading] = useState(false);
  const [showChainPopover, setShowChainPopover] = useState(false);
  const [modeValues, setModeValues] = useState<Record<string, any>>({});
  const [showModeValues, setShowModeValues] = useState(false);
  const [extensionsJsonText, setExtensionsJsonText] = useState('');
  const [showExtensions, setShowExtensions] = useState(false);
  const [extensionsJsonError, setExtensionsJsonError] = useState<string | null>(null);
  const initialServerSnapshotRef = useRef<string | null>(null);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);

  const encodedTokenPath = tokenPath.split('.').map(encodeURIComponent).join('/');

  const existingGeneratorsForToken = generators.filter(g => g.sourceToken === tokenPath);
  const canBeGeneratorSource = ['color', 'dimension', 'number', 'fontSize'].includes(tokenType);

  // Flat map of color token string values — used for reference resolution in this editor.
  const colorFlatMap = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const [p, e] of Object.entries(allTokensFlat)) {
      if (e.$type === 'color') map[p] = e.$value;
    }
    return map;
  }, [allTokensFlat]);

  useEffect(() => {
    if (isCreateMode) return; // skip fetch in create mode
    const fetchToken = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`);
        if (!res.ok) throw new Error('Token not found');
        const data = await res.json();
        const token = data.token;
        setTokenType(token?.$type || 'string');
        setValue(token?.$value ?? '');
        setDescription(token?.$description || '');
        const savedScopes = token?.$extensions?.['com.figma.scopes'] ?? token?.$scopes;
        setScopes(Array.isArray(savedScopes) ? savedScopes : []);
        const savedModifiers = token?.$extensions?.tokenmanager?.colorModifier;
        const loadedModifiers: ColorModifierOp[] = Array.isArray(savedModifiers) ? savedModifiers : [];
        setColorModifiers(loadedModifiers);
        const savedModes = token?.$extensions?.tokenmanager?.modes;
        const loadedModes: Record<string, any> = (savedModes && typeof savedModes === 'object' && !Array.isArray(savedModes)) ? savedModes as Record<string, any> : {};
        setModeValues(loadedModes);
        const ext = token?.$extensions ?? {};
        const knownExtKeys = new Set(['com.figma.scopes', 'tokenmanager']);
        const otherExt: Record<string, any> = {};
        for (const [k, v] of Object.entries(ext)) {
          if (!knownExtKeys.has(k)) otherExt[k] = v;
        }
        const otherExtText = Object.keys(otherExt).length > 0 ? JSON.stringify(otherExt, null, 2) : '';
        setExtensionsJsonText(otherExtText);
        initialServerSnapshotRef.current = JSON.stringify(token ?? null);
        const ref = typeof token?.$value === 'string' && token.$value.startsWith('{') && token.$value.endsWith('}') ? token.$value : '';
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
        };
        if (typeof token?.$value === 'string' && token.$value.startsWith('{') && token.$value.endsWith('}')) {
          setReference(token.$value);
        }
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    fetchToken();
  }, [serverUrl, setName, tokenPath, isCreateMode]);

  // Fetch reverse dependencies (tokens that reference this one)
  useEffect(() => {
    if (isCreateMode) return;
    const fetchDependents = async () => {
      setDependentsLoading(true);
      try {
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/dependents/${encodedTokenPath}`);
        if (res.ok) {
          const data = await res.json();
          setDependents(data.dependents ?? []);
        }
      } catch {
        // silently fail — dependency info is supplementary
      } finally {
        setDependentsLoading(false);
      }
    };
    fetchDependents();
  }, [serverUrl, setName, tokenPath, isCreateMode]);

  // Sync alias mode with loaded reference
  useEffect(() => {
    if (reference) setAliasMode(true);
  }, [reference]);

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
      extensionsJsonText !== init.extensionsJsonText
    );
  }, [tokenType, value, description, reference, scopes, colorModifiers, modeValues, extensionsJsonText]);

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  const aliasHasCycle = useMemo((): string[] | null => {
    if (!aliasMode || !reference.startsWith('{') || !reference.endsWith('}')) return null;
    const currentPath = isCreateMode ? editPath.trim() : tokenPath;
    if (!currentPath) return null;
    return detectAliasCycle(reference, currentPath, allTokensFlat);
  }, [aliasMode, reference, isCreateMode, editPath, tokenPath, allTokensFlat]);

  const canSave = useMemo(() => {
    if (aliasHasCycle) return false;
    if (extensionsJsonError) return false;
    if (tokenType === 'typography' && !aliasMode) {
      const v = typeof value === 'object' && value !== null ? value : {};
      const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      if (!family || String(family).trim() === '') return false;
      const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
      if (fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0) return false;
    }
    return true;
  }, [aliasHasCycle, extensionsJsonError, tokenType, value, aliasMode]);

  const saveBlockReason = useMemo(() => {
    if (aliasHasCycle) return 'Circular reference';
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
  }, [aliasHasCycle, extensionsJsonError, tokenType, value, aliasMode, isCreateMode, editPath]);

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
  };

  const applyTypeChange = (newType: string) => {
    setTokenType(newType);
    setValue(DEFAULT_VALUE_FOR_TYPE[newType] ?? '');
    setScopes([]);
    setReference('');
    setAliasMode(false);
    setShowAutocomplete(false);
    setPendingTypeChange(null);
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
    setAliasMode(!!init.reference);
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
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
      if (preAliasValueRef.current !== null) {
        setValue(preAliasValueRef.current);
        preAliasValueRef.current = null;
      }
      setReference('');
      setShowAutocomplete(false);
    }
  }, [aliasMode, value, reference]);

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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack, isDirty, showDiscardConfirm, showAutocomplete, handleToggleAlias]);

  const handleSave = async (forceOverwrite = false) => {
    if (isCreateMode && !editPath.trim()) {
      setError('Token path cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Conflict detection: if the token was modified on the server since we loaded it, warn the user.
      if (!isCreateMode && !forceOverwrite && initialServerSnapshotRef.current !== null) {
        try {
          const checkRes = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTokenPath}`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const currentSnapshot = JSON.stringify(checkData.token ?? null);
            if (currentSnapshot !== initialServerSnapshotRef.current) {
              setShowConflictConfirm(true);
              setSaving(false);
              return;
            }
          }
        } catch {
          // If the conflict check itself fails (network error), proceed with the save.
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
      if (Object.keys(tmExt).length > 0) extensions.tokenmanager = tmExt;
      const trimmedExtJson = extensionsJsonText.trim();
      if (trimmedExtJson && trimmedExtJson !== '{}') {
        try {
          const parsed = JSON.parse(trimmedExtJson);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(extensions, parsed);
          }
        } catch {
          setError('Invalid JSON in Extensions — fix before saving');
          setSaving(false);
          return;
        }
      }
      if (Object.keys(extensions).length > 0) body.$extensions = extensions;

      const targetPath = isCreateMode ? editPath.trim() : tokenPath;
      const encodedTargetPath = targetPath.split('.').map(encodeURIComponent).join('/');
      const method = isCreateMode ? 'POST' : 'PATCH';
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedTargetPath}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || (isCreateMode ? 'Failed to create token' : 'Failed to save token'));
      }
      const label = isCreateMode ? 'created' : 'saved';
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Token "${targetPath}" ${label}` } }, '*');
      onSaved?.(targetPath);
      onBack();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin" aria-hidden="true" />
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
            <input
              type="text"
              value={editPath}
              onChange={e => { setEditPath(e.target.value); setError(null); }}
              placeholder="Token path (e.g. color.brand.500)"
              autoFocus
              className="w-full text-[11px] font-medium text-[var(--color-figma-text)] bg-transparent border-b border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)] outline-none pb-0.5 truncate"
            />
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{tokenPath}</div>
              {isDirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] shrink-0"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              )}
            </div>
          )}
          <div className="text-[9px] text-[var(--color-figma-text-secondary)]">{isCreateMode ? 'new token' : `in ${setName}`}</div>
        </div>
        {!isCreateMode && <button
          onClick={() => {
            navigator.clipboard.writeText(tokenPath);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy token path"
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
          const refPath = reference.startsWith('{') && reference.endsWith('}') ? reference.slice(1, -1) : null;
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
          className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase cursor-pointer border-0 outline-none appearance-none ${TOKEN_TYPE_BADGE_CLASS[tokenType ?? ''] ?? 'token-type-string'}`}
          style={{ backgroundImage: 'none' }}
        >
          {Object.keys(TOKEN_TYPE_BADGE_CLASS).map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px] break-words max-h-16 overflow-auto">
            {error}
          </div>
        )}

        {/* Type-change confirmation — shown when a type switch would reset a non-default value */}
        {pendingTypeChange && (
          <div className="px-2 py-2 rounded border border-amber-500/30 bg-amber-500/10 text-[10px]">
            <p className="text-[var(--color-figma-text)] mb-2">
              Switch to <strong>{pendingTypeChange}</strong>? This will reset the current value.
              {dependents.length > 0 && (
                <span className="block mt-1 text-amber-400">
                  {dependents.length} dependent token{dependents.length !== 1 ? 's' : ''} reference this token and may break.
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingTypeChange(null)}
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
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Reference
            </label>
            <button
              onClick={handleToggleAlias}
              title={aliasMode ? 'Switch to direct value (⌘L)' : 'Switch to alias reference (⌘L)'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${aliasMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
              </svg>
              Alias mode
            </button>
          </div>
          {aliasMode && (
            <>
            <div className="relative">
              <input
                ref={refInputRef}
                type="text"
                value={reference}
                onChange={e => {
                  const v = e.target.value;
                  setReference(v);
                  const hasOpen = v.includes('{') && !v.endsWith('}');
                  setShowAutocomplete(hasOpen);
                }}
                onFocus={() => {
                  if (reference.includes('{') && !reference.endsWith('}')) {
                    setShowAutocomplete(true);
                  }
                }}
                onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                onKeyDown={e => {
                  if (e.key === '{') setShowAutocomplete(true);
                }}
                placeholder="{color.primary.500}"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-[11px] outline-none placeholder:text-[var(--color-figma-text-secondary)]/50"
              />
              {showAutocomplete && (
                <AliasAutocomplete
                  query={reference.includes('{') ? reference.slice(reference.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
                  allTokensFlat={allTokensFlat}
                  pathToSet={pathToSet}
                  filterType={tokenType}
                  onSelect={path => {
                    setReference(`{${path}}`);
                    setShowAutocomplete(false);
                  }}
                  onClose={() => setShowAutocomplete(false)}
                />
              )}
            </div>
            {!showAutocomplete && !reference && (
              <p className="mt-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
                Type <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">{'{'}</code> to search and select a token
              </p>
            )}
            {!showAutocomplete && aliasHasCycle && (
              <p className="mt-0.5 text-[9px] text-[var(--color-figma-error)]">
                Circular reference: <span className="font-mono">{aliasHasCycle.join(' → ')}</span>
              </p>
            )}
            {!showAutocomplete && !aliasHasCycle && reference.startsWith('{') && reference.endsWith('}') && (() => {
              const chain = resolveAliasChain(reference, allTokensFlat);
              const lastHop = chain[chain.length - 1];
              if (chain.length > 0 && lastHop.value === undefined) {
                const brokenPath = lastHop.path;
                const priorPaths = chain.slice(0, -1).map(h => h.path);
                return (
                  <p className="mt-0.5 text-[9px] text-[var(--color-figma-error)]">
                    Token not found: <span className="font-mono">{brokenPath}</span>
                    {priorPaths.length > 0 && (
                      <span className="opacity-70"> (via {priorPaths.join(' → ')})</span>
                    )}
                  </p>
                );
              }
              return null;
            })()}
            </>
          )}
          {aliasMode && !aliasHasCycle && reference.startsWith('{') && reference.endsWith('}') && (() => {
            const chain = resolveAliasChain(reference, allTokensFlat);
            if (chain.length === 0) return null;
            return (
              <div className="mt-2 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 px-2 py-1.5 flex flex-col gap-1">
                <span className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide font-medium">Resolves to</span>
                {chain.map((hop, i) => {
                  const resolvedColor = hop.type === 'color' && typeof hop.value === 'string' && !hop.value.startsWith('{') ? hop.value : null;
                  const isLast = i === chain.length - 1;
                  return (
                    <div key={hop.path} className="flex items-center gap-1.5 min-w-0">
                      {i > 0 && <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">↳</span>}
                      {resolvedColor && (
                        <div
                          className="w-3 h-3 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)] shrink-0"
                          style={{ backgroundColor: resolvedColor }}
                          aria-hidden="true"
                        />
                      )}
                      <span className={`text-[10px] font-mono truncate ${isLast ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                        {hop.path}
                      </span>
                      {isLast && hop.value === undefined && (
                        <span className="ml-auto shrink-0 text-[9px] text-[var(--color-figma-error)]">not found</span>
                      )}
                      {isLast && hop.value !== undefined && typeof hop.value !== 'object' && !String(hop.value).startsWith('{') && !resolvedColor && (
                        <span className="ml-auto shrink-0 text-[9px] text-[var(--color-figma-text-secondary)] truncate max-w-[80px]" title={String(hop.value)}>
                          {String(hop.value)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {!aliasMode && reference && (() => {
            const chain = reference.startsWith('{') && reference.endsWith('}') ? resolveAliasChain(reference, allTokensFlat) : [];
            return (
              <div className="relative mt-1"
                onMouseEnter={() => setShowChainPopover(true)}
                onMouseLeave={() => setShowChainPopover(false)}
              >
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-accent)]/10 border border-[var(--color-figma-accent)]/30 cursor-default">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
                  </svg>
                  <span className="text-[10px] text-[var(--color-figma-accent)] font-mono truncate">{reference}</span>
                </div>
                {showChainPopover && chain.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg px-2.5 py-2 min-w-[180px] max-w-[260px]">
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide font-medium mb-1.5">Resolution chain</div>
                    <div className="flex flex-col gap-1">
                      {chain.map((hop, i) => {
                        const resolvedColor = hop.type === 'color' && typeof hop.value === 'string' && !hop.value.startsWith('{') ? hop.value : null;
                        const isLast = i === chain.length - 1;
                        return (
                          <div key={hop.path} className="flex items-center gap-1.5 min-w-0">
                            {i > 0 && (
                              <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">→</span>
                            )}
                            {resolvedColor && (
                              <div
                                className="w-3 h-3 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)] shrink-0"
                                style={{ backgroundColor: resolvedColor }}
                                aria-hidden="true"
                              />
                            )}
                            <span className={`text-[10px] font-mono truncate ${isLast ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                              {isLast && hop.value !== undefined && typeof hop.value !== 'object' && !String(hop.value).startsWith('{') && !resolvedColor
                                ? String(hop.value)
                                : hop.path}
                            </span>
                            {isLast && hop.value === undefined && (
                              <span className="ml-auto shrink-0 text-[9px] text-[var(--color-figma-error)]">not found</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Type-specific editor */}
        {!reference && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">Value</label>
              {!canSave && tokenType === 'typography' && (
                <span className="text-[9px] text-[var(--color-figma-error)]">Font family and size required</span>
              )}
            </div>
            {initialRef.current && JSON.stringify(value) !== JSON.stringify(initialRef.current.value) && (
              <ValueDiff type={tokenType} before={initialRef.current.value} after={value} />
            )}
            {tokenType === 'color' && <ColorEditor value={value} onChange={setValue} autoFocus={!isCreateMode} />}
            {tokenType === 'dimension' && <DimensionEditor key={tokenPath} value={value} onChange={setValue} allTokensFlat={allTokensFlat} autoFocus={!isCreateMode} />}
            {tokenType === 'typography' && <TypographyEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {tokenType === 'shadow' && <ShadowEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {tokenType === 'border' && <BorderEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {tokenType === 'gradient' && <GradientEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {tokenType === 'number' && <NumberEditor key={tokenPath} value={value} onChange={setValue} allTokensFlat={allTokensFlat} autoFocus={!isCreateMode} />}
            {tokenType === 'duration' && <DurationEditor value={value} onChange={setValue} autoFocus={!isCreateMode} />}
            {tokenType === 'fontFamily' && <FontFamilyEditor value={value} onChange={setValue} autoFocus={!isCreateMode} />}
            {tokenType === 'fontWeight' && <FontWeightEditor value={value} onChange={setValue} />}
            {tokenType === 'strokeStyle' && <StrokeStyleEditor value={value} onChange={setValue} />}
            {tokenType === 'string' && <StringEditor value={value} onChange={setValue} autoFocus={!isCreateMode} />}
            {tokenType === 'boolean' && <BooleanEditor value={value} onChange={setValue} />}
            {tokenType === 'composition' && <CompositionEditor value={value} onChange={setValue} />}
            {tokenType === 'asset' && <AssetEditor value={value} onChange={setValue} />}
          </div>
        )}

        {/* Color modifiers — only when aliasing a color */}
        {tokenType === 'color' && aliasMode && reference.startsWith('{') && reference.endsWith('}') && (() => {
          const refPath = reference.slice(1, -1);
          const baseHex = resolveRefValue(refPath, colorFlatMap);
          const previewHex = baseHex && colorModifiers.length > 0 ? applyColorModifiers(baseHex, colorModifiers) : baseHex;
          return (
            <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
              <button
                onClick={() => setShowModifiers(v => !v)}
                className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
              >
                <span>Color modifiers {colorModifiers.length > 0 ? `(${colorModifiers.length})` : ''}</span>
                <div className="flex items-center gap-1.5">
                  {previewHex && (
                    <div className="w-3 h-3 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: previewHex }} aria-hidden="true" />
                  )}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showModifiers ? 'rotate-180' : ''}`}>
                    <path d="M2 3.5l3 3 3-3"/>
                  </svg>
                </div>
              </button>
              {showModifiers && (
                <div className="p-3 flex flex-col gap-2 border-t border-[var(--color-figma-border)]">
                  {colorModifiers.length === 0 && (
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No modifiers — add one below.</p>
                  )}
                  {colorModifiers.map((mod, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <select
                        value={mod.type}
                        onChange={e => {
                          const type = e.target.value as ColorModifierOp['type'];
                          setColorModifiers(prev => prev.map((m, idx) => {
                            if (idx !== i) return m;
                            if (type === 'mix') return { type, color: '#888888', ratio: 0.5 };
                            if (type === 'alpha') return { type, amount: 0.5 };
                            return { type, amount: 20 };
                          }));
                        }}
                        className="px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
                      >
                        <option value="lighten">Lighten</option>
                        <option value="darken">Darken</option>
                        <option value="alpha">Alpha</option>
                        <option value="mix">Mix</option>
                      </select>
                      {(mod.type === 'lighten' || mod.type === 'darken') && (
                        <>
                          <input
                            type="range"
                            min={0} max={100} step={1}
                            value={mod.amount}
                            onChange={e => setColorModifiers(prev => prev.map((m, idx) => idx === i ? { ...m, amount: Number(e.target.value) } : m))}
                            className="flex-1"
                          />
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{mod.amount}</span>
                        </>
                      )}
                      {mod.type === 'alpha' && (
                        <>
                          <input
                            type="range"
                            min={0} max={1} step={0.01}
                            value={mod.amount}
                            onChange={e => setColorModifiers(prev => prev.map((m, idx) => idx === i ? { ...m, amount: Number(e.target.value) } : m))}
                            className="flex-1"
                          />
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(mod.amount * 100)}%</span>
                        </>
                      )}
                      {mod.type === 'mix' && (
                        <>
                          <ColorSwatchButton
                            color={mod.color}
                            onChange={v => setColorModifiers(prev => prev.map((m, idx) => idx === i ? { ...m, color: v } : m))}
                            className="w-6 h-6"
                          />
                          <input
                            type="range"
                            min={0} max={1} step={0.01}
                            value={mod.ratio}
                            onChange={e => setColorModifiers(prev => prev.map((m, idx) => idx === i ? { ...m, ratio: Number(e.target.value) } : m))}
                            className="flex-1"
                          />
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(mod.ratio * 100)}%</span>
                        </>
                      )}
                      <button
                        onClick={() => setColorModifiers(prev => prev.filter((_, idx) => idx !== i))}
                        className="shrink-0 p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
                        aria-label="Remove modifier"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l6 6M9 3l-6 6"/></svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setColorModifiers(prev => [...prev, { type: 'lighten', amount: 20 }])}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
                  >
                    + Add modifier
                  </button>
                  {baseHex && colorModifiers.length > 0 && previewHex && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-5 rounded border border-[var(--color-figma-border)]" style={{ backgroundColor: baseHex }} title={`Base: ${baseHex}`} />
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-figma-text-secondary)] shrink-0"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
                      <div className="flex-1 h-5 rounded border border-[var(--color-figma-border)]" style={{ backgroundColor: previewHex }} title={`Modified: ${previewHex}`} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Contrast checker (color tokens only) */}
        {tokenType === 'color' && (
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
            <button
              onClick={() => setShowContrast(v => !v)}
              className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
            >
              <span>Check contrast</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showContrast ? 'rotate-180' : ''}`}>
                <path d="M2 3.5l3 3 3-3"/>
              </svg>
            </button>
            {showContrast && (() => {
              const colorTokens = Object.entries(allTokensFlat).filter(([, e]) => e.$type === 'color');
              const fgHex = resolveRefValue(tokenPath, colorFlatMap) ?? (typeof value === 'string' && !value.startsWith('{') ? value : null);
              const bgHex = bgTokenPath ? resolveRefValue(bgTokenPath, colorFlatMap) : null;
              const ratio = fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null;
              const pass = (r: number, min: number) => r >= min;
              return (
                <div className="p-3 flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Background color token</label>
                    <div className="relative">
                      <input
                        ref={bgInputRef}
                        type="text"
                        value={bgSearchOpen ? bgQuery : bgTokenPath}
                        onChange={e => { setBgQuery(e.target.value); setBgSearchOpen(true); }}
                        onFocus={() => { setBgQuery(''); setBgSearchOpen(true); }}
                        onBlur={() => setTimeout(() => setBgSearchOpen(false), 150)}
                        placeholder="Search color tokens…"
                        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/50"
                      />
                      {bgTokenPath && !bgSearchOpen && (
                        <button
                          onClick={() => { setBgTokenPath(''); setBgQuery(''); }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                          aria-label="Clear background token"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      )}
                      {bgSearchOpen && (
                        <AliasAutocomplete
                          query={bgQuery}
                          allTokensFlat={allTokensFlat}
                          pathToSet={pathToSet}
                          filterType="color"
                          onSelect={path => { setBgTokenPath(path); setBgQuery(''); setBgSearchOpen(false); }}
                          onClose={() => setBgSearchOpen(false)}
                        />
                      )}
                    </div>
                  </div>
                  {ratio !== null ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        {fgHex && bgHex && (
                          <div className="w-10 h-10 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center text-[13px] font-bold" style={{ color: fgHex, background: bgHex }}>Aa</div>
                        )}
                        <div>
                          <div className="text-[18px] font-semibold text-[var(--color-figma-text)]">{ratio.toFixed(2)}:1</div>
                          <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Contrast ratio</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[9px] text-center">
                        {[
                          { label: 'Normal AA', min: 4.5 },
                          { label: 'Large AA', min: 3 },
                          { label: 'Normal AAA', min: 7 },
                          { label: 'Large AAA', min: 4.5 },
                          { label: 'UI (AA)', min: 3 },
                        ].map(({ label, min }) => (
                          <div key={label} className={`rounded px-1 py-1 border ${pass(ratio, min) ? 'border-[var(--color-figma-success)] text-[var(--color-figma-success)]' : 'border-[var(--color-figma-error)] text-[var(--color-figma-error)]'}`}>
                            <div>{pass(ratio, min) ? '✓' : '✕'}</div>
                            <div>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (bgTokenPath ? (
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Could not resolve color values.</div>
                  ) : null)}
                </div>
              );
            })()}
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none min-h-[48px] placeholder:text-[var(--color-figma-text-secondary)]/50"
          />
        </div>
      </div>

      {/* Figma Variable Scopes */}
      {FIGMA_SCOPES[tokenType] && (
        <div className="border-t border-[var(--color-figma-border)]">
          <button
            type="button"
            onClick={() => setShowScopes(v => !v)}
            title="Scopes control which Figma properties this variable is offered for"
            className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
          >
            <span>Figma variable scopes {scopes.length > 0 ? `(${scopes.length} selected)` : ''}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showScopes ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3"/>
            </svg>
          </button>
          {showScopes && (
            <div className="px-3 py-2 flex flex-col gap-1.5">
              <p className="text-[9px] text-[var(--color-figma-text-secondary)] mb-1">
                Controls where this variable appears in Figma's variable picker. Empty = All scopes.
              </p>
              {FIGMA_SCOPES[tokenType].map(scope => (
                <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={e => setScopes(prev =>
                      e.target.checked ? [...prev, scope.value] : prev.filter(s => s !== scope.value)
                    )}
                    className="w-3 h-3 rounded"
                  />
                  <span className="text-[11px] text-[var(--color-figma-text)]">{scope.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generator groups */}
      {canBeGeneratorSource && !aliasMode && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <button
            onClick={() => { setEditingGeneratorInDialog(undefined); setShowGeneratorDialog(true); }}
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
              <span className="text-[9px] text-[var(--color-figma-accent)]">+ Create</span>
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
                  <button
                    onClick={e => { e.stopPropagation(); setEditingGeneratorInDialog(gen); setShowGeneratorDialog(true); }}
                    className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
              <button
                onClick={() => { setEditingGeneratorInDialog(undefined); setShowGeneratorDialog(true); }}
                className="mt-0.5 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors text-left"
              >
                + Add another group
              </button>
            </div>
          )}
        </div>
      )}

      {/* Token dependents — tokens that reference this one */}
      {!isCreateMode && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDependents(v => !v)}
            className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <span className="flex items-center gap-1.5">
              Used by
              {dependentsLoading
                ? <svg className="animate-spin shrink-0 opacity-50" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" /></svg>
                : dependents.length > 0 ? ` (${dependents.length})` : ''}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showDependents ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="M2 1l4 3-4 3V1z"/>
            </svg>
          </button>
          {showDependents && (
            <div className="border-t border-[var(--color-figma-border)]">
              {dependentsLoading ? (
                <div className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  <svg className="animate-spin shrink-0" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" /></svg>
                  Finding references…
                </div>
              ) : dependents.length === 0 ? (
                <p className="px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">Not referenced by any other token.</p>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
                  {dependents.map(dep => {
                    const entry = allTokensFlat[dep.path];
                    // Resolve through alias chains so alias-color dependents also get a swatch
                    const resolvedColor = entry?.$type === 'color' ? resolveRefValue(dep.path, colorFlatMap) : null;

                    // Before/after preview: when this is a color token being edited
                    // and the dependent is an alias (its value resolves through this token)
                    const isAliasDependent = entry?.$type === 'color' && typeof entry.$value === 'string' && entry.$value.startsWith('{');
                    const oldColorHex = typeof initialRef.current?.value === 'string' ? initialRef.current.value.slice(0, 7) : null;
                    const newColorHex = typeof value === 'string' ? value.slice(0, 7) : null;
                    const showBeforeAfter = isAliasDependent && tokenType === 'color' && isDirty && !aliasMode && oldColorHex && newColorHex;

                    return (
                      <div key={dep.path} className="px-3 py-1.5 flex items-center gap-2">
                        {showBeforeAfter ? (
                          <span className="flex items-center gap-1 shrink-0">
                            <span
                              className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                              style={{ background: oldColorHex! }}
                              title="Before"
                            />
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                              <path d="M1 3h5M4 1l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span
                              className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                              style={{ background: newColorHex! }}
                              title="After"
                            />
                          </span>
                        ) : resolvedColor ? (
                          <span
                            className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                            style={{ background: resolvedColor }}
                          />
                        ) : null}
                        <span
                          className="flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate"
                          title={dep.path}
                        >
                          {dep.path}
                        </span>
                        {dep.setName !== setName && (
                          <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                            {dep.setName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mode Values */}
      {dimensions.length > 0 && (
        <div className="border-t border-[var(--color-figma-border)]">
          <button
            type="button"
            onClick={() => setShowModeValues(v => !v)}
            className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
          >
            <span>
              Mode values
              {Object.values(modeValues).filter(v => v !== '' && v !== undefined && v !== null).length > 0
                ? ` (${Object.values(modeValues).filter(v => v !== '' && v !== undefined && v !== null).length} set)`
                : ''}
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showModeValues ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3"/>
            </svg>
          </button>
          {showModeValues && (
            <div className="px-3 py-2 flex flex-col gap-3">
              <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
                Override the default value per mode. Leave empty to inherit the default value.
              </p>
              {dimensions.map(dim => (
                <div key={dim.id}>
                  <div className="text-[9px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide mb-1.5">{dim.name}</div>
                  {dim.options.map(option => {
                    const modeVal = modeValues[option.name] ?? '';
                    const isColorVal = tokenType === 'color' && typeof modeVal === 'string' && modeVal.startsWith('#') && !modeVal.startsWith('{');
                    return (
                      <div key={option.name} className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] text-[var(--color-figma-text)] w-16 shrink-0 truncate" title={option.name}>{option.name}</span>
                        {isColorVal && (
                          <div
                            className="w-4 h-4 rounded-sm border border-white/40 ring-1 ring-[var(--color-figma-border)] shrink-0"
                            style={{ backgroundColor: modeVal }}
                            aria-hidden="true"
                          />
                        )}
                        <input
                          type="text"
                          value={modeVal}
                          onChange={e => setModeValues(prev => ({ ...prev, [option.name]: e.target.value }))}
                          placeholder={aliasMode ? (reference || 'value or {alias}') : String(value !== '' && value !== undefined ? value : 'value or {alias}')}
                          className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/40"
                        />
                        {modeVal !== '' && (
                          <button
                            type="button"
                            onClick={() => setModeValues(prev => { const next = { ...prev }; delete next[option.name]; return next; })}
                            title={`Clear ${option.name} override`}
                            className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Other extensions — any $extensions keys beyond tokenmanager and com.figma.scopes */}
      {!isCreateMode && (
        <div className="border-t border-[var(--color-figma-border)]">
          <button
            type="button"
            onClick={() => setShowExtensions(v => !v)}
            className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
          >
            <span className="flex items-center gap-1.5">
              Extensions
              {extensionsJsonText.trim() && extensionsJsonText.trim() !== '{}' && (
                <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] text-[8px] font-medium">custom</span>
              )}
              {extensionsJsonError && (
                <span className="px-1 py-0.5 rounded bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)] text-[8px] font-medium">invalid JSON</span>
              )}
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showExtensions ? 'rotate-180' : ''}`}>
              <path d="M2 3.5l3 3 3-3"/>
            </svg>
          </button>
          {showExtensions && (
            <div className="px-3 py-2 flex flex-col gap-2 border-t border-[var(--color-figma-border)]">
              <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
                Custom <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">$extensions</code> data as JSON object. The <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">tokenmanager</code> and <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">com.figma.scopes</code> keys are managed above and will not be overwritten here.
              </p>
              <textarea
                value={extensionsJsonText}
                onChange={e => {
                  const text = e.target.value;
                  setExtensionsJsonText(text);
                  const trimmed = text.trim();
                  if (!trimmed || trimmed === '{}') {
                    setExtensionsJsonError(null);
                  } else {
                    try {
                      const parsed = JSON.parse(trimmed);
                      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                        setExtensionsJsonError('Must be a JSON object');
                      } else {
                        setExtensionsJsonError(null);
                      }
                    } catch {
                      setExtensionsJsonError('Invalid JSON');
                    }
                  }
                }}
                placeholder={'{\n  "my.tool": { "category": "brand" }\n}'}
                rows={5}
                spellCheck={false}
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] font-mono outline-none resize-y min-h-[72px] placeholder:text-[var(--color-figma-text-secondary)]/40 ${extensionsJsonError ? 'border-[var(--color-figma-error)] focus:border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)]'}`}
              />
              {extensionsJsonError && (
                <p className="text-[9px] text-[var(--color-figma-error)]">{extensionsJsonError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description="Your edits have not been saved and will be lost."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={onBack}
          onCancel={() => setShowDiscardConfirm(false)}
        />
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
        <button
          onClick={handleSave}
          disabled={saving || !canSave || (!isCreateMode && !isDirty) || (isCreateMode && !editPath.trim())}
          title={saveBlockReason || undefined}
          className="flex-1 px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? (isCreateMode ? 'Creating…' : 'Saving…')
            : (saveBlockReason
              ? saveBlockReason
              : (!isCreateMode && !isDirty ? 'No changes' : (isCreateMode ? 'Create' : 'Save changes')))}
        </button>
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
          existingGenerator={editingGeneratorInDialog}
          onClose={() => setShowGeneratorDialog(false)}
          onSaved={() => {
            setShowGeneratorDialog(false);
            onRefreshGenerators?.();
          }}
        />
      )}
    </div>
  );
}

// --- Sub-editors ---

const inputClass = 'w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]';
const labelClass = 'text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5';

function resolveFormulaPreview(
  formula: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): { result: number | null; error: string | null } {
  try {
    const substituted = formula.replace(/{([^}]+)}/g, (_, refPath: string) => {
      const entry = allTokensFlat[refPath];
      if (!entry) return '0';
      const v = entry.$value;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object' && v !== null && 'value' in v && typeof (v as { value: unknown }).value === 'number') {
        return String((v as { value: number }).value);
      }
      return '0';
    });
    return { result: evalExpr(substituted), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : 'Invalid expression' };
  }
}

function ColorSwatchButton({ color, onChange, className = 'w-8 h-8' }: { color: string; onChange: (hex: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${className} rounded border border-[var(--color-figma-border)] cursor-pointer`}
        style={{ backgroundColor: color.slice(0, 7) }}
        title="Pick color"
        aria-label="Pick color"
      />
      {open && (
        <ColorPicker value={color} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function ColorEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  const hex = typeof value === 'string' ? value : '#000000';
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="relative flex gap-2 items-center">
      <button
        type="button"
        onClick={() => setPickerOpen(!pickerOpen)}
        className="w-10 h-10 rounded border border-[var(--color-figma-border)] cursor-pointer shrink-0 overflow-hidden hover:ring-2 hover:ring-[var(--color-figma-accent)]/50 transition-shadow"
        style={{ backgroundColor: hex.slice(0, 7) }}
        title="Pick color"
        aria-label="Pick color"
      />
      <input
        type="text"
        value={hex}
        onChange={e => onChange(e.target.value)}
        placeholder="#000000"
        autoFocus={autoFocus}
        className={inputClass}
      />
      {pickerOpen && (
        <ColorPicker
          value={hex}
          onChange={onChange}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function StepperInput({
  value,
  onChange,
  className = '',
  autoFocus,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const step = (delta: number) => onChange(Math.round((value + delta) * 1000) / 1000);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    step(e.deltaY < 0 ? 1 : -1);
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        autoFocus={autoFocus}
        className={inputClass + ' w-full pr-5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'}
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[var(--color-figma-border)]">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] leading-none"
        >
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden="true"><path d="M0 5l3-4 3 4H0z"/></svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(-1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)] leading-none"
        >
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden="true"><path d="M0 1l3 4 3-4H0z"/></svg>
        </button>
      </div>
    </div>
  );
}

const UNIT_CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  px: { rem: v => Math.round((v / 16) * 1000) / 1000, em: v => Math.round((v / 16) * 1000) / 1000, '%': v => v },
  rem: { px: v => Math.round(v * 16 * 1000) / 1000, em: v => v, '%': v => v },
  em: { px: v => Math.round(v * 16 * 1000) / 1000, rem: v => v, '%': v => v },
  '%': { px: v => v, rem: v => v, em: v => v },
};

function DimensionEditor({ value, onChange, allTokensFlat = {}, autoFocus }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; autoFocus?: boolean }) {
  const val = typeof value === 'object' ? value : { value: value ?? 0, unit: 'px' };
  const isFormulaValue = typeof val.value === 'string' && isFormula(val.value);
  const [formulaMode, setFormulaMode] = useState(isFormulaValue);
  const numVal = formulaMode ? 0 : (parseFloat(val.value) || 0);
  const formulaStr = formulaMode ? (typeof val.value === 'string' ? val.value : '') : '';
  const preview = formulaMode && formulaStr ? resolveFormulaPreview(formulaStr, allTokensFlat) : null;

  const handleUnitChange = (newUnit: string) => {
    if (formulaMode) {
      onChange({ ...val, unit: newUnit });
      return;
    }
    const convert = UNIT_CONVERSIONS[val.unit]?.[newUnit];
    const newValue = convert ? convert(numVal) : numVal;
    onChange({ value: newValue, unit: newUnit });
  };

  const toggleFormulaMode = () => {
    if (formulaMode) {
      onChange({ value: preview?.result ?? 0, unit: val.unit });
      setFormulaMode(false);
    } else {
      onChange({ value: String(numVal), unit: val.unit });
      setFormulaMode(true);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-center">
        {formulaMode ? (
          <input
            type="text"
            value={formulaStr}
            onChange={e => onChange({ ...val, value: e.target.value })}
            placeholder="{spacing.base} * 2"
            className={inputClass + ' flex-1 font-mono'}
            autoFocus
          />
        ) : (
          <StepperInput
            value={numVal}
            onChange={v => onChange({ ...val, value: v })}
            className="flex-1"
            autoFocus={autoFocus}
          />
        )}
        <select
          value={val.unit}
          onChange={e => handleUnitChange(e.target.value)}
          className={inputClass + ' w-16'}
        >
          <option value="px">px</option>
          <option value="rem">rem</option>
          <option value="em">em</option>
          <option value="%">%</option>
        </select>
        <button
          type="button"
          onClick={toggleFormulaMode}
          title={formulaMode ? 'Switch to literal value' : 'Enter expression'}
          className={`shrink-0 px-1.5 py-1 rounded text-[10px] font-mono border transition-colors ${formulaMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
        >
          fx
        </button>
      </div>
      {formulaMode && formulaStr && (
        <div className={`px-2 py-1 rounded text-[10px] font-mono ${preview?.error ? 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-accent)]/5 border border-[var(--color-figma-accent)]/20'}`}>
          {preview?.error ? preview.error : `= ${preview?.result} ${val.unit}`}
        </div>
      )}
    </div>
  );
}

// Sub-property input that accepts either a raw value or an alias {path.to.token}.
// Shows autocomplete when user types '{'.
function SubPropInput({
  value,
  onChange,
  allTokensFlat,
  pathToSet,
  filterType,
  placeholder,
  className,
  inputType = 'number',
}: {
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  filterType?: string;
  placeholder?: string;
  className?: string;
  inputType?: 'number' | 'string';
}) {
  const isAlias = typeof value === 'string' && value.startsWith('{');
  const displayValue = isAlias ? value : String(value ?? '');
  const [showAC, setShowAC] = useState(false);

  return (
    <div className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={e => {
          const raw = e.target.value;
          setShowAC(raw.includes('{') && !raw.endsWith('}'));
          if (raw.startsWith('{')) {
            onChange(raw);
          } else if (inputType === 'number') {
            const n = parseFloat(raw);
            onChange(isNaN(n) ? 0 : n);
          } else {
            onChange(raw);
          }
        }}
        onFocus={() => {
          if (displayValue.includes('{') && !displayValue.endsWith('}')) setShowAC(true);
        }}
        onBlur={() => setTimeout(() => setShowAC(false), 150)}
        placeholder={placeholder}
        className={`${inputClass}${isAlias ? ' !border-[var(--color-figma-accent)]' : ''}${className ? ` ${className}` : ''}`}
      />
      {showAC && (
        <AliasAutocomplete
          query={displayValue.includes('{') ? displayValue.slice(displayValue.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          filterType={filterType}
          onSelect={path => {
            onChange(`{${path}}`);
            setShowAC(false);
          }}
          onClose={() => setShowAC(false)}
        />
      )}
    </div>
  );
}

function TypographyEditor({ value, onChange, allTokensFlat, pathToSet }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string> }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const isFontSizeAlias = typeof val.fontSize === 'string' && val.fontSize.startsWith('{');
  const fontSize = !isFontSizeAlias && typeof val.fontSize === 'object' ? val.fontSize : { value: val.fontSize ?? 16, unit: 'px' };
  const isFontWeightAlias = typeof val.fontWeight === 'string' && val.fontWeight.startsWith('{');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Font Family</div>
        <SubPropInput
          value={Array.isArray(val.fontFamily) ? val.fontFamily[0] : (val.fontFamily || '')}
          onChange={v => update('fontFamily', v)}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          inputType="string"
          placeholder="Inter"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Font Size</div>
          {isFontSizeAlias ? (
            <SubPropInput
              value={val.fontSize}
              onChange={v => update('fontSize', v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />
          ) : (
            <div className="flex gap-1">
              <input
                type="number"
                value={fontSize.value}
                onChange={e => update('fontSize', { ...fontSize, value: parseFloat(e.target.value) || 0 })}
                className={inputClass + ' flex-1'}
                placeholder="{token}"
                onKeyDown={e => {
                  if (e.key === '{') {
                    e.preventDefault();
                    update('fontSize', '{');
                  }
                }}
              />
              <select
                value={fontSize.unit}
                onChange={e => update('fontSize', { ...fontSize, unit: e.target.value })}
                className={inputClass + ' w-14'}
              >
                <option value="px">px</option>
                <option value="rem">rem</option>
              </select>
            </div>
          )}
        </div>
        <div className="w-20">
          <div className={labelClass}>Weight</div>
          {isFontWeightAlias ? (
            <SubPropInput
              value={val.fontWeight}
              onChange={v => update('fontWeight', v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />
          ) : (
            <select
              value={val.fontWeight ?? 400}
              onChange={e => update('fontWeight', parseInt(e.target.value))}
              className={inputClass}
            >
              <option value={100}>100 Thin</option>
              <option value={200}>200 ExtraLight</option>
              <option value={300}>300 Light</option>
              <option value={400}>400 Regular</option>
              <option value={500}>500 Medium</option>
              <option value={600}>600 SemiBold</option>
              <option value={700}>700 Bold</option>
              <option value={800}>800 ExtraBold</option>
              <option value={900}>900 Black</option>
            </select>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Line Height</div>
          <SubPropInput
            value={typeof val.lineHeight === 'object' ? val.lineHeight.value : (val.lineHeight ?? 1.5)}
            onChange={v => update('lineHeight', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            placeholder="1.5"
          />
        </div>
        <div className="flex-1">
          <div className={labelClass}>Letter Spacing</div>
          <SubPropInput
            value={typeof val.letterSpacing === 'object' ? val.letterSpacing.value : (val.letterSpacing ?? 0)}
            onChange={v => update('letterSpacing', typeof v === 'string' && v.startsWith('{') ? v : { value: typeof v === 'number' ? v : parseFloat(String(v)) || 0, unit: 'px' })}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}

function ShadowEditor({ value, onChange, allTokensFlat, pathToSet }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string> }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const getDim = (v: any) => (typeof v === 'string' && v.startsWith('{') ? v : (typeof v === 'object' ? v.value : (v ?? 0)));
  const setDim = (key: string, v: any) => update(key, typeof v === 'string' && v.startsWith('{') ? v : { value: typeof v === 'number' ? v : parseFloat(String(v)) || 0, unit: 'px' });
  const isColorAlias = typeof val.color === 'string' && val.color.startsWith('{');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          {!isColorAlias && (
            <ColorSwatchButton
              color={val.color || '#000000'}
              onChange={v => update('color', v)}
            />
          )}
          <SubPropInput
            value={val.color || '#00000040'}
            onChange={v => update('color', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            filterType="color"
            inputType="string"
            placeholder="#00000040 or {token}"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={labelClass}>Offset X</div>
          <SubPropInput value={getDim(val.offsetX)} onChange={v => setDim('offsetX', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Offset Y</div>
          <SubPropInput value={getDim(val.offsetY)} onChange={v => setDim('offsetY', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Blur</div>
          <SubPropInput value={getDim(val.blur)} onChange={v => setDim('blur', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Spread</div>
          <SubPropInput value={getDim(val.spread)} onChange={v => setDim('spread', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
      </div>
      <div>
        <div className={labelClass}>Type</div>
        <select
          value={val.type || 'dropShadow'}
          onChange={e => update('type', e.target.value)}
          className={inputClass}
        >
          <option value="dropShadow">Drop Shadow</option>
          <option value="innerShadow">Inner Shadow</option>
        </select>
      </div>
    </div>
  );
}

function BorderEditor({ value, onChange, allTokensFlat, pathToSet }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string> }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const isWidthAlias = typeof val.width === 'string' && val.width.startsWith('{');
  const width = !isWidthAlias && typeof val.width === 'object' ? val.width : { value: val.width ?? 1, unit: 'px' };
  const isColorAlias = typeof val.color === 'string' && val.color.startsWith('{');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          {!isColorAlias && (
            <ColorSwatchButton
              color={val.color || '#000000'}
              onChange={v => update('color', v)}
            />
          )}
          <SubPropInput
            value={val.color || '#000000'}
            onChange={v => update('color', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            filterType="color"
            inputType="string"
            placeholder="#000000 or {token}"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Width</div>
          {isWidthAlias ? (
            <SubPropInput
              value={val.width}
              onChange={v => update('width', v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />
          ) : (
            <div className="flex gap-1">
              <input
                type="number"
                value={width.value}
                onChange={e => update('width', { ...width, value: parseFloat(e.target.value) || 0 })}
                className={inputClass + ' flex-1'}
                onKeyDown={e => {
                  if (e.key === '{') {
                    e.preventDefault();
                    update('width', '{');
                  }
                }}
              />
              <select
                value={width.unit}
                onChange={e => update('width', { ...width, unit: e.target.value })}
                className={inputClass + ' w-14'}
              >
                <option value="px">px</option>
                <option value="rem">rem</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className={labelClass}>Style</div>
          <select
            value={val.style || 'solid'}
            onChange={e => update('style', e.target.value)}
            className={inputClass}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function NumberEditor({ value, onChange, allTokensFlat = {}, autoFocus }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; autoFocus?: boolean }) {
  const isFormulaValue = typeof value === 'string' && isFormula(value);
  const [formulaMode, setFormulaMode] = useState(isFormulaValue);
  const numVal = formulaMode ? 0 : (parseFloat(value) || 0);
  const formulaStr = formulaMode ? (typeof value === 'string' ? value : '') : '';
  const preview = formulaMode && formulaStr ? resolveFormulaPreview(formulaStr, allTokensFlat) : null;

  const toggleFormulaMode = () => {
    if (formulaMode) {
      onChange(preview?.result ?? 0);
      setFormulaMode(false);
    } else {
      onChange(String(numVal));
      setFormulaMode(true);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-center">
        {formulaMode ? (
          <input
            type="text"
            value={formulaStr}
            onChange={e => onChange(e.target.value)}
            placeholder="{spacing.base} * 2"
            className={inputClass + ' flex-1 font-mono'}
            autoFocus
          />
        ) : (
          <StepperInput
            value={numVal}
            onChange={onChange}
            className="flex-1"
            autoFocus={autoFocus}
          />
        )}
        <button
          type="button"
          onClick={toggleFormulaMode}
          title={formulaMode ? 'Switch to literal value' : 'Enter expression'}
          className={`shrink-0 px-1.5 py-1 rounded text-[10px] font-mono border transition-colors ${formulaMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
        >
          fx
        </button>
      </div>
      {formulaMode && formulaStr && (
        <div className={`px-2 py-1 rounded text-[10px] font-mono ${preview?.error ? 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-accent)]/5 border border-[var(--color-figma-accent)]/20'}`}>
          {preview?.error ? preview.error : `= ${preview?.result}`}
        </div>
      )}
    </div>
  );
}

function StringEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter value"
      autoFocus={autoFocus}
      className={inputClass}
    />
  );
}

function AssetEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const url = typeof value === 'string' ? value : '';
  const isValidUrl = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'));
  return (
    <div className="flex flex-col gap-2">
      <input
        type="url"
        value={url}
        onChange={e => onChange(e.target.value)}
        placeholder="https://example.com/image.png"
        className={inputClass}
      />
      {isValidUrl && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden bg-[var(--color-figma-bg-secondary)] flex items-center justify-center" style={{ minHeight: '80px', maxHeight: '160px' }}>
          <img
            src={url}
            alt="Asset preview"
            className="max-w-full max-h-40 object-contain"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute('hidden'); }}
          />
          <span hidden className="text-[10px] text-[var(--color-figma-text-secondary)] p-2">Unable to load image</span>
        </div>
      )}
    </div>
  );
}

function BooleanEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(!value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
      <span className="text-[11px] text-[var(--color-figma-text)]">{value ? 'true' : 'false'}</span>
    </div>
  );
}

function FontFamilyEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  return (
    <input
      type="text"
      value={typeof value === 'string' ? value : ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Inter, system-ui, sans-serif"
      autoFocus={autoFocus}
      className={inputClass}
    />
  );
}

const FONT_WEIGHTS = [
  { value: 100, label: '100 Thin' },
  { value: 200, label: '200 ExtraLight' },
  { value: 300, label: '300 Light' },
  { value: 400, label: '400 Regular' },
  { value: 500, label: '500 Medium' },
  { value: 600, label: '600 SemiBold' },
  { value: 700, label: '700 Bold' },
  { value: 800, label: '800 ExtraBold' },
  { value: 900, label: '900 Black' },
];

function FontWeightEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const w = typeof value === 'number' ? value : 400;
  return (
    <select
      value={w}
      onChange={e => onChange(parseInt(e.target.value))}
      className={inputClass}
    >
      {FONT_WEIGHTS.map(fw => (
        <option key={fw.value} value={fw.value}>{fw.label}</option>
      ))}
    </select>
  );
}

const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];

function StrokeStyleEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'solid'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {STROKE_STYLES.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

const DURATION_PRESETS = [100, 150, 200, 300, 500];

function DurationEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  const ms = typeof value?.value === 'number' ? value.value : typeof value === 'number' ? value : 200;
  const unit: 'ms' | 's' = value?.unit === 's' ? 's' : 'ms';
  const update = (patch: { value?: number; unit?: 'ms' | 's' }) =>
    onChange({ value: ms, unit, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step={unit === 'ms' ? 50 : 0.05}
          value={ms}
          onChange={e => update({ value: parseFloat(e.target.value) || 0 })}
          autoFocus={autoFocus}
          className={inputClass + ' flex-1'}
        />
        <select
          value={unit}
          onChange={e => update({ unit: e.target.value as 'ms' | 's' })}
          className={inputClass + ' w-16'}
        >
          <option value="ms">ms</option>
          <option value="s">s</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {DURATION_PRESETS.map(p => (
          <button
            key={p}
            onClick={() => onChange({ value: p, unit: 'ms' })}
            className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${ms === p && unit === 'ms' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
          >
            {p}ms
          </button>
        ))}
      </div>
    </div>
  );
}

interface GradientStop {
  color: string;
  position: number;
}

interface GradientEditorProps {
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
}

function GradientEditor({ value, onChange, allTokensFlat, pathToSet }: GradientEditorProps) {
  const stops: GradientStop[] = Array.isArray(value?.stops) && value.stops.length >= 2
    ? value.stops
    : [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }];
  const gradientType: string = value?.type || 'linear';

  const updateStop = (idx: number, patch: Partial<GradientStop>) => {
    const next = stops.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...value, stops: next });
  };

  const addStop = () => {
    onChange({ ...value, stops: [...stops, { color: '#808080', position: 0.5 }] });
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 2) return;
    onChange({ ...value, stops: stops.filter((_, i) => i !== idx) });
  };

  const previewParts = stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(s => {
      const color = typeof s.color === 'string' && !s.color.startsWith('{') ? s.color : '#aaaaaa';
      return `${color} ${Math.round(s.position * 100)}%`;
    })
    .join(', ');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <div className={labelClass}>Type</div>
        <select
          value={gradientType}
          onChange={e => onChange({ ...value, type: e.target.value })}
          className={inputClass + ' flex-1'}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </div>
      <div
        className="w-full h-6 rounded border border-[var(--color-figma-border)]"
        style={{ background: `${gradientType}-gradient(to right, ${previewParts})` }}
      />
      <div className={labelClass}>Stops</div>
      {stops.map((stop, idx) => (
        <GradientStopRow
          key={idx}
          stop={stop}
          canRemove={stops.length > 2}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onChange={patch => updateStop(idx, patch)}
          onRemove={() => removeStop(idx)}
        />
      ))}
      <button
        type="button"
        onClick={addStop}
        className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
      >
        + Add stop
      </button>
    </div>
  );
}

function GradientStopRow({ stop, canRemove, allTokensFlat, pathToSet, onChange, onRemove }: {
  stop: GradientStop;
  canRemove: boolean;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  onChange: (patch: Partial<GradientStop>) => void;
  onRemove: () => void;
}) {
  const colorIsAlias = typeof stop.color === 'string' && stop.color.startsWith('{');
  const [aliasMode, setAliasMode] = useState(colorIsAlias);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  const toggleAliasMode = () => {
    const next = !aliasMode;
    setAliasMode(next);
    if (next) {
      onChange({ color: colorIsAlias ? stop.color : '{' });
      setTimeout(() => aliasInputRef.current?.focus(), 0);
    } else {
      onChange({ color: '#000000' });
      setShowAutocomplete(false);
    }
  };

  const aliasQuery = (() => {
    const c = stop.color || '';
    const openIdx = c.lastIndexOf('{');
    if (openIdx === -1) return '';
    return c.slice(openIdx + 1).replace(/\}.*$/, '');
  })();

  return (
    <div className="flex items-start gap-1.5">
      <div className="w-16 shrink-0">
        <StepperInput
          value={Math.round(stop.position * 100)}
          onChange={v => onChange({ position: Math.max(0, Math.min(100, v)) / 100 })}
          className="w-full"
        />
      </div>
      <div className="flex-1 relative min-w-0">
        {aliasMode ? (
          <>
            <input
              ref={aliasInputRef}
              type="text"
              value={stop.color || '{'}
              onChange={e => {
                const v = e.target.value;
                onChange({ color: v });
                setShowAutocomplete(v.includes('{') && !v.endsWith('}'));
              }}
              onFocus={() => {
                if ((stop.color || '').includes('{') && !(stop.color || '').endsWith('}')) {
                  setShowAutocomplete(true);
                }
              }}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
              placeholder="{color.primary}"
              className={inputClass}
            />
            {showAutocomplete && (
              <AliasAutocomplete
                query={aliasQuery}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                filterType="color"
                onSelect={path => {
                  onChange({ color: `{${path}}` });
                  setShowAutocomplete(false);
                }}
                onClose={() => setShowAutocomplete(false)}
              />
            )}
          </>
        ) : (
          <div className="flex gap-1.5 items-center">
            <ColorSwatchButton
              color={stop.color || '#000000'}
              onChange={v => onChange({ color: v })}
            />
            <input
              type="text"
              value={stop.color || '#000000'}
              onChange={e => onChange({ color: e.target.value })}
              placeholder="#000000"
              className={inputClass + ' flex-1'}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={toggleAliasMode}
        title={aliasMode ? 'Switch to raw color' : 'Switch to reference mode'}
        className={`p-1.5 rounded border transition-colors shrink-0 ${aliasMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
        </svg>
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove color stop"
          aria-label="Remove color stop"
          className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
}

const COMPOSITION_PROPERTIES = [
  'fill', 'stroke', 'width', 'height',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'itemSpacing', 'cornerRadius', 'strokeWeight', 'opacity',
  'typography', 'shadow', 'visible',
];

function CompositionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const [newProp, setNewProp] = useState(COMPOSITION_PROPERTIES[0]);
  const val = typeof value === 'object' && value !== null ? value : {};
  const usedProps = Object.keys(val);
  const unusedProps = COMPOSITION_PROPERTIES.filter(p => !usedProps.includes(p));

  const update = (key: string, v: string) => onChange({ ...val, [key]: v });
  const remove = (key: string) => {
    const next = { ...val };
    delete next[key];
    onChange(next);
  };
  const addProp = () => {
    const prop = newProp || unusedProps[0];
    if (!prop || prop in val) return;
    onChange({ ...val, [prop]: '' });
    setNewProp(unusedProps.filter(p => p !== prop)[0] || '');
  };

  return (
    <div className="flex flex-col gap-2">
      {usedProps.length === 0 && (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No properties yet — add one below.</p>
      )}
      {usedProps.map(prop => (
        <div key={prop} className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 w-24 truncate" title={prop}>{prop}</span>
          <input
            type="text"
            value={typeof val[prop] === 'string' ? val[prop] : JSON.stringify(val[prop])}
            onChange={e => update(prop, e.target.value)}
            placeholder="{token.path} or value"
            className={inputClass + ' flex-1'}
          />
          <button
            type="button"
            onClick={() => remove(prop)}
            title={`Remove ${prop}`}
            className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      ))}
      {unusedProps.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--color-figma-border)]">
          <select
            value={newProp}
            onChange={e => setNewProp(e.target.value)}
            className={inputClass + ' flex-1'}
          >
            {unusedProps.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            type="button"
            onClick={addProp}
            className="px-2 py-1 rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/30 shrink-0"
          >+ Add</button>
        </div>
      )}
    </div>
  );
}

