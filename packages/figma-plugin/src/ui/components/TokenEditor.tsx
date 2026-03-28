import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { resolveRefValue } from '@tokenmanager/core';
import type { ThemeDimension } from '@tokenmanager/core';
import { ConfirmModal } from './ConfirmModal';
import type { ApiErrorBody, TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { ColorModifierOp } from '@tokenmanager/core';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';
import { ValueDiff } from './ValueDiff';
import type { TokenGenerator } from '../hooks/useGenerators';
import { ColorEditor, DimensionEditor, TypographyEditor, ShadowEditor, BorderEditor, GradientEditor, NumberEditor, DurationEditor, FontFamilyEditor, FontWeightEditor, StrokeStyleEditor, StringEditor, BooleanEditor, CompositionEditor, AssetEditor } from './ValueEditors';
import { AliasPicker, resolveAliasChain } from './AliasPicker';
import { resolveTokenValue, isAlias } from '../../shared/resolveAlias';
import { ContrastChecker } from './ContrastChecker';
import { ColorModifiersEditor } from './ColorModifiersEditor';
import { TokenDependents } from './TokenDependents';
import { MetadataEditor } from './MetadataEditor';
import { PathAutocomplete } from './PathAutocomplete';

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
  /** Called after a successful create when the user wants to immediately create another token. Receives the saved path so the parent can derive a sibling prefix. */
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
}

export function TokenEditor({ tokenPath, tokenName, setName, serverUrl, onBack, allTokensFlat = {}, pathToSet = {}, generators = [], allSets = [], onRefreshGenerators, isCreateMode = false, initialType, initialValue, onDirtyChange, onSaved, onSaveAndCreateAnother, dimensions = [] }: TokenEditorProps) {
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
  const [scopes, setScopes] = useState<string[]>([]);
  const initialRef = useRef<{ value: any; description: string; reference: string; scopes: string[]; type: string; colorModifiers: ColorModifierOp[]; modeValues: Record<string, any>; extensionsJsonText: string } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGeneratorDialog, setShowGeneratorDialog] = useState(false);
  const [editingGeneratorInDialog, setEditingGeneratorInDialog] = useState<TokenGenerator | undefined>(undefined);
  const [colorModifiers, setColorModifiers] = useState<ColorModifierOp[]>([]);
  const [pendingTypeChange, setPendingTypeChange] = useState<string | null>(null);
  const [dependents, setDependents] = useState<Array<{ path: string; setName: string }>>([]);
  const [dependentsLoading, setDependentsLoading] = useState(false);
  const [modeValues, setModeValues] = useState<Record<string, any>>({});
  const [extensionsJsonText, setExtensionsJsonText] = useState('');
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

  // Real-time duplicate path detection in create mode
  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return trimmed in allTokensFlat;
  }, [isCreateMode, editPath, allTokensFlat]);

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
          handleSave(false, true);
        } else {
          handleSave();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack, isDirty, showDiscardConfirm, showAutocomplete, handleToggleAlias, isCreateMode, onSaveAndCreateAnother]);

  const handleSave = async (forceOverwrite = false, createAnother = false) => {
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
        const data: ApiErrorBody = await res.json().catch(() => ({}));
        throw new Error(data.error || (isCreateMode ? 'Failed to create token' : 'Failed to save token'));
      }
      const label = isCreateMode ? 'created' : 'saved';
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Token "${targetPath}" ${label}` } }, '*');
      onSaved?.(targetPath);
      if (createAnother && isCreateMode && onSaveAndCreateAnother) {
        onSaveAndCreateAnother(targetPath, tokenType);
      } else {
        onBack();
      }
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
                  className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] shrink-0"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              )}
            </div>
          )}
          {isCreateMode && duplicatePath ? (
            <div className="text-[9px] text-[var(--color-figma-danger,#f24822)]">A token with this path already exists in {pathToSet[editPath.trim()] || setName}</div>
          ) : (
            <div className="text-[9px] text-[var(--color-figma-text-secondary)]">{isCreateMode ? 'new token' : `in ${setName}`}</div>
          )}
          {isCreateMode && !editPath.includes('.') && (NAMESPACE_SUGGESTIONS[tokenType]?.prefixes.length ?? 0) > 0 && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">Try:</span>
              {NAMESPACE_SUGGESTIONS[tokenType].prefixes.map(prefix => (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => { setEditPath(prefix); setError(null); }}
                  className="px-1 py-px rounded text-[9px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-pressed)] transition-colors cursor-pointer"
                >
                  {prefix}
                </button>
              ))}
            </div>
          )}
        </div>
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
        {tokenType === 'color' && aliasMode && reference.startsWith('{') && reference.endsWith('}') && (
          <ColorModifiersEditor
            reference={reference}
            colorFlatMap={colorFlatMap}
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

      {/* Token dependents */}
      {!isCreateMode && (
        <TokenDependents
          dependents={dependents}
          dependentsLoading={dependentsLoading}
          setName={setName}
          tokenType={tokenType}
          value={value}
          isDirty={isDirty}
          aliasMode={aliasMode}
          allTokensFlat={allTokensFlat}
          colorFlatMap={colorFlatMap}
          initialValue={initialRef.current?.value}
        />
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
            title="Create this token and immediately start creating another"
            className="px-3 py-2 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating…' : 'Create & New'}
          </button>
        )}
        <button
          onClick={() => handleSave()}
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

