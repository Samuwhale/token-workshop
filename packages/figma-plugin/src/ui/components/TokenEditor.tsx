import { useState, useEffect, useRef, useMemo } from 'react';
import { AliasAutocomplete } from './AliasAutocomplete';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { hexToLuminance, wcagContrast, applyColorModifiers } from '../shared/colorUtils';
import type { ColorModifierOp } from '../shared/colorUtils';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';

type GeneratorType = 'colorRamp' | 'typeScale' | 'spacingScale' | 'opacityScale' | 'borderRadiusScale' | 'zIndexScale' | 'customScale';

interface TokenGenerator {
  id: string;
  type: GeneratorType;
  name: string;
  sourceToken?: string;
  targetSet: string;
  targetGroup: string;
  config: any;
  createdAt: string;
  updatedAt: string;
}

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

function resolveColorValue(path: string, allTokensFlat: Record<string, TokenMapEntry>, visited = new Set<string>()): string | null {
  if (visited.has(path)) return null;
  visited.add(path);
  const entry = allTokensFlat[path];
  if (!entry || entry.$type !== 'color') return null;
  const v = entry.$value;
  return typeof v === 'string' && v.startsWith('{')
    ? resolveColorValue(v.slice(1, -1), allTokensFlat, visited)
    : typeof v === 'string' ? v : null;
}

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

interface TokenEditorProps {
  tokenPath: string;
  setName: string;
  serverUrl: string;
  onBack: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  generators?: TokenGenerator[];
  allSets?: string[];
  onRefreshGenerators?: () => void;
}

export function TokenEditor({ tokenPath, setName, serverUrl, onBack, allTokensFlat = {}, pathToSet = {}, generators = [], allSets = [], onRefreshGenerators }: TokenEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState('color');
  const [value, setValue] = useState<any>('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [aliasMode, setAliasMode] = useState(false);
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
  const initialRef = useRef<{ value: any; description: string; reference: string; scopes: string[]; type: string; colorModifiers: ColorModifierOp[] } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGeneratorDialog, setShowGeneratorDialog] = useState(false);
  const [colorModifiers, setColorModifiers] = useState<ColorModifierOp[]>([]);
  const [showModifiers, setShowModifiers] = useState(false);

  const existingGeneratorsForToken = generators.filter(g => g.sourceToken === tokenPath);
  const canBeGeneratorSource = ['color', 'dimension', 'number', 'fontSize'].includes(tokenType);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/tokens/${setName}/${tokenPath}`);
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
        const ref = typeof token?.$value === 'string' && token.$value.startsWith('{') && token.$value.endsWith('}') ? token.$value : '';
        if (ref) setReference(ref);
        initialRef.current = {
          value: token?.$value ?? '',
          description: token?.$description || '',
          reference: ref,
          scopes: Array.isArray(savedScopes) ? savedScopes : [],
          type: token?.$type || 'string',
          colorModifiers: loadedModifiers,
        };
        if (typeof token?.$value === 'string' && token.$value.startsWith('{') && token.$value.endsWith('}')) {
          setReference(token.$value);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };
    fetchToken();
  }, [serverUrl, setName, tokenPath]);

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
      JSON.stringify(colorModifiers) !== JSON.stringify(init.colorModifiers)
    );
  }, [tokenType, value, description, reference, scopes, colorModifiers]);

  const canSave = useMemo(() => {
    if (tokenType === 'typography' && !aliasMode) {
      const v = typeof value === 'object' && value !== null ? value : {};
      const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
      if (!family || String(family).trim() === '') return false;
      const fsVal = typeof v.fontSize === 'object' ? v.fontSize?.value : v.fontSize;
      if (fsVal === undefined || fsVal === null || fsVal === '' || isNaN(Number(fsVal)) || Number(fsVal) <= 0) return false;
    }
    return true;
  }, [tokenType, value, aliasMode]);

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
  };

  const handleTypeChange = (newType: string) => {
    setTokenType(newType);
    setValue(DEFAULT_VALUE_FOR_TYPE[newType] ?? '');
    setScopes([]);
    setReference('');
    setAliasMode(false);
    setShowAutocomplete(false);
  };

  const handleBack = () => {
    if (isDirty) { setShowDiscardConfirm(true); } else { onBack(); }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showDiscardConfirm) { setShowDiscardConfirm(false); return; }
        if (showAutocomplete) { setShowAutocomplete(false); return; }
        handleBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack, isDirty, showDiscardConfirm, showAutocomplete]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        $type: tokenType,
        $value: reference || value,
      };
      if (description) body.$description = description;
      const extensions: Record<string, any> = {};
      if (scopes.length > 0) extensions['com.figma.scopes'] = scopes;
      if (colorModifiers.length > 0) extensions.tokenmanager = { colorModifier: colorModifiers };
      if (Object.keys(extensions).length > 0) body.$extensions = extensions;

      const res = await fetch(`${serverUrl}/api/tokens/${setName}/${tokenPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || 'Failed to save token');
      }
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Token "${tokenPath}" saved` } }, '*');
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
          onClick={onBack}
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{tokenPath}</div>
          <div className="text-[9px] text-[var(--color-figma-text-secondary)]">in {setName}</div>
        </div>
        <button
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
        </button>
        {aliasMode && reference && tokenType === 'color' && (() => {
          const refPath = reference.startsWith('{') && reference.endsWith('}') ? reference.slice(1, -1) : null;
          const resolved = refPath ? resolveColorValue(refPath, allTokensFlat) : null;
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

        {/* Alias mode toggle + reference input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Reference
            </label>
            <button
              onClick={() => {
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
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${aliasMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
              </svg>
              Alias mode
            </button>
          </div>
          {aliasMode && (
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
          )}
          {aliasMode && reference.startsWith('{') && reference.endsWith('}') && (() => {
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
          {!aliasMode && reference && (
            <div className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-accent)]/10 border border-[var(--color-figma-accent)]/30">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
              </svg>
              <span className="text-[10px] text-[var(--color-figma-accent)] font-mono truncate">{reference}</span>
            </div>
          )}
        </div>

        {/* Type-specific editor */}
        {!reference && (
          <div className="flex flex-col gap-2">
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">Value</label>
            {tokenType === 'color' && <ColorEditor value={value} onChange={setValue} />}
            {tokenType === 'dimension' && <DimensionEditor value={value} onChange={setValue} />}
            {tokenType === 'typography' && <TypographyEditor value={value} onChange={setValue} />}
            {tokenType === 'shadow' && <ShadowEditor value={value} onChange={setValue} />}
            {tokenType === 'border' && <BorderEditor value={value} onChange={setValue} />}
            {tokenType === 'gradient' && <GradientEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {tokenType === 'number' && <NumberEditor value={value} onChange={setValue} />}
            {tokenType === 'duration' && <DurationEditor value={value} onChange={setValue} />}
            {tokenType === 'fontFamily' && <FontFamilyEditor value={value} onChange={setValue} />}
            {tokenType === 'fontWeight' && <FontWeightEditor value={value} onChange={setValue} />}
            {tokenType === 'strokeStyle' && <StrokeStyleEditor value={value} onChange={setValue} />}
            {tokenType === 'string' && <StringEditor value={value} onChange={setValue} />}
            {tokenType === 'boolean' && <BooleanEditor value={value} onChange={setValue} />}
          </div>
        )}

        {/* Color modifiers — only when aliasing a color */}
        {tokenType === 'color' && aliasMode && reference.startsWith('{') && reference.endsWith('}') && (() => {
          const refPath = reference.slice(1, -1);
          const baseHex = resolveColorValue(refPath, allTokensFlat);
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
                          <input
                            type="color"
                            value={mod.color.slice(0, 7)}
                            onChange={e => setColorModifiers(prev => prev.map((m, idx) => idx === i ? { ...m, color: e.target.value } : m))}
                            className="w-6 h-6 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent shrink-0"
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
              const fgHex = resolveColorValue(tokenPath, allTokensFlat) ?? (typeof value === 'string' && !value.startsWith('{') ? value : null);
              const bgHex = bgTokenPath ? resolveColorValue(bgTokenPath, allTokensFlat) : null;
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
            onClick={() => setShowGeneratorDialog(true)}
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
                    onClick={e => { e.stopPropagation(); setShowGeneratorDialog(true); }}
                    className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowGeneratorDialog(true)}
                className="mt-0.5 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors text-left"
              >
                + Add another group
              </button>
            </div>
          )}
        </div>
      )}

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <div className="mx-3 mb-2 p-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px]">
          <p className="text-[var(--color-figma-text)] mb-2">Discard unsaved changes?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDiscardConfirm(false)}
              className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Keep editing
            </button>
            <button
              onClick={onBack}
              className="flex-1 px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={handleBack}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
        >
          {isDirty ? 'Cancel' : 'Back'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !canSave || !isDirty}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Token Generator Dialog */}
      {showGeneratorDialog && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          sourceTokenPath={tokenPath}
          sourceTokenType={tokenType}
          sourceTokenValue={aliasMode ? null : value}
          allSets={allSets}
          activeSet={setName}
          existingGenerator={existingGeneratorsForToken[0]}
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
const labelClass = 'text-[9px] text-[var(--color-figma-text-secondary)] mb-0.5';

function ColorEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const hex = typeof value === 'string' ? value : '#000000';
  // Preserve alpha suffix (#RRGGBBAA) when the color picker (which only supports #RRGGBB) changes
  const alpha = hex.length === 9 ? hex.slice(7) : '';
  return (
    <div className="flex gap-2 items-center">
      <input
        type="color"
        value={hex.slice(0, 7)}
        onChange={e => onChange(e.target.value + alpha)}
        className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent"
      />
      <input
        type="text"
        value={hex}
        onChange={e => onChange(e.target.value)}
        placeholder="#000000"
        className={inputClass}
      />
    </div>
  );
}

function StepperInput({
  value,
  onChange,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
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
        className={inputClass + ' w-full pr-5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'}
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[var(--color-figma-border)]">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] leading-none"
          style={{ fontSize: 6 }}
        >▲</button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(-1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)] leading-none"
          style={{ fontSize: 6 }}
        >▼</button>
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

function DimensionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : { value: value ?? 0, unit: 'px' };
  const numVal = parseFloat(val.value) || 0;

  const handleUnitChange = (newUnit: string) => {
    const convert = UNIT_CONVERSIONS[val.unit]?.[newUnit];
    const newValue = convert ? convert(numVal) : numVal;
    onChange({ value: newValue, unit: newUnit });
  };

  return (
    <div className="flex gap-2">
      <StepperInput
        value={numVal}
        onChange={v => onChange({ ...val, value: v })}
        className="flex-1"
      />
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
    </div>
  );
}

function TypographyEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const fontSize = typeof val.fontSize === 'object' ? val.fontSize : { value: val.fontSize ?? 16, unit: 'px' };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Font Family</div>
        <input
          type="text"
          value={Array.isArray(val.fontFamily) ? val.fontFamily[0] : (val.fontFamily || '')}
          onChange={e => update('fontFamily', e.target.value)}
          placeholder="Inter"
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Font Size</div>
          <div className="flex gap-1">
            <input
              type="number"
              value={fontSize.value}
              onChange={e => update('fontSize', { ...fontSize, value: parseFloat(e.target.value) || 0 })}
              className={inputClass + ' flex-1'}
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
        </div>
        <div className="w-20">
          <div className={labelClass}>Weight</div>
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
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Line Height</div>
          <input
            type="number"
            step="0.1"
            value={typeof val.lineHeight === 'object' ? val.lineHeight.value : (val.lineHeight ?? 1.5)}
            onChange={e => update('lineHeight', parseFloat(e.target.value) || 1.5)}
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <div className={labelClass}>Letter Spacing</div>
          <input
            type="number"
            step="0.1"
            value={typeof val.letterSpacing === 'object' ? val.letterSpacing.value : (val.letterSpacing ?? 0)}
            onChange={e => update('letterSpacing', { value: parseFloat(e.target.value) || 0, unit: 'px' })}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

function ShadowEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const getDim = (v: any) => (typeof v === 'object' ? v.value : (v ?? 0));
  const setDim = (key: string, n: number) => update(key, { value: n, unit: 'px' });

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={(val.color || '#000000').slice(0, 7)}
            onChange={e => update('color', e.target.value + (val.color?.length === 9 ? val.color.slice(7) : ''))}
            className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent"
          />
          <input
            type="text"
            value={val.color || '#00000040'}
            onChange={e => update('color', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={labelClass}>Offset X</div>
          <input type="number" value={getDim(val.offsetX)} onChange={e => setDim('offsetX', parseFloat(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <div className={labelClass}>Offset Y</div>
          <input type="number" value={getDim(val.offsetY)} onChange={e => setDim('offsetY', parseFloat(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <div className={labelClass}>Blur</div>
          <input type="number" value={getDim(val.blur)} onChange={e => setDim('blur', parseFloat(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <div className={labelClass}>Spread</div>
          <input type="number" value={getDim(val.spread)} onChange={e => setDim('spread', parseFloat(e.target.value) || 0)} className={inputClass} />
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

function BorderEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const width = typeof val.width === 'object' ? val.width : { value: val.width ?? 1, unit: 'px' };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={(val.color || '#000000').slice(0, 7)}
            onChange={e => update('color', e.target.value + (val.color?.length === 9 ? val.color.slice(7) : ''))}
            className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent"
          />
          <input
            type="text"
            value={val.color || '#000000'}
            onChange={e => update('color', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Width</div>
          <div className="flex gap-1">
            <input
              type="number"
              value={width.value}
              onChange={e => update('width', { ...width, value: parseFloat(e.target.value) || 0 })}
              className={inputClass + ' flex-1'}
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

function NumberEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <StepperInput
      value={parseFloat(value) || 0}
      onChange={onChange}
    />
  );
}

function StringEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter value"
      className={inputClass}
    />
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

function FontFamilyEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <input
      type="text"
      value={typeof value === 'string' ? value : ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Inter, system-ui, sans-serif"
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

function DurationEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
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
            <input
              type="color"
              value={(stop.color || '#000000').slice(0, 7)}
              onChange={e => onChange({ color: e.target.value + (stop.color?.length === 9 ? stop.color.slice(7) : '') })}
              className="w-8 h-[26px] rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent shrink-0"
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
        title={aliasMode ? 'Switch to raw color' : 'Switch to alias mode'}
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
          className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
}

