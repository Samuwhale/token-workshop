import type { CSSProperties } from 'react';
import { useCallback, useDeferredValue, useMemo, useState, useTransition } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { LintViolation } from '../hooks/useLint';
import { TokenDetailPreview } from './TokenDetailPreview';
import { Spinner } from './Spinner';
import { lsGet, lsSet } from '../shared/storage';

interface PreviewPanelProps {
  allTokensFlat: Record<string, TokenMapEntry>;
  dimensions?: ThemeDimension[];
  activeThemes?: Record<string, string>;
  onActiveThemesChange?: (themes: Record<string, string>) => void;
  onGoToTokens?: () => void;
  onNavigateToToken?: (path: string) => void;
  onNavigateToGenerator?: (generatorId: string) => void;
  /** When set, the panel renders token detail instead of collection templates */
  focusedToken?: { path: string; name?: string; set: string } | null;
  pathToSet?: Record<string, string>;
  onClearFocus?: () => void;
  onEditToken?: (path: string, name?: string, set?: string) => void;
  serverUrl?: string;
  tokenUsageCounts?: Record<string, number>;
  generators?: TokenGenerator[];
  generatorsBySource?: Map<string, TokenGenerator[]>;
  derivedTokenPaths?: Map<string, TokenGenerator>;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
}

type Template = 'colors' | 'type-scale' | 'buttons' | 'forms' | 'card' | 'effects';

const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'colors', label: 'Colors' },
  { id: 'type-scale', label: 'Type Scale' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'forms', label: 'Forms' },
  { id: 'card', label: 'Card' },
  { id: 'effects', label: 'Effects' },
];

function previewSectionLabelClassName(darkMode: boolean): string {
  return `text-[10px] font-medium mb-2 ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`;
}

/** Convert a token path to a CSS custom property name */
function toCssVar(path: string): string {
  return `--${path.replace(/\./g, '-')}`;
}

/** Format a structured DTCG value object into a CSS-compatible string */
function formatCompositeValue(value: Record<string, unknown>): string | null {
  // Dimension: { value, unit } → "16px"
  if ('value' in value && 'unit' in value) {
    return `${value.value}${value.unit}`;
  }
  // Shadow: { offsetX, offsetY, blur, spread, color }
  if ('offsetX' in value && 'offsetY' in value && 'color' in value) {
    const s = value as Record<string, unknown>;
    const ox = formatCompositeValue(s.offsetX as Record<string, unknown>) ?? String(s.offsetX ?? 0);
    const oy = formatCompositeValue(s.offsetY as Record<string, unknown>) ?? String(s.offsetY ?? 0);
    const bl = formatCompositeValue(s.blur as Record<string, unknown>) ?? String(s.blur ?? 0);
    const sp = formatCompositeValue(s.spread as Record<string, unknown>) ?? String(s.spread ?? 0);
    return `${ox} ${oy} ${bl} ${sp} ${s.color ?? ''}`.trim();
  }
  // Typography: { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing }
  if ('fontFamily' in value && 'fontSize' in value) {
    const t = value as Record<string, unknown>;
    const weight = t.fontWeight ?? '';
    const size = typeof t.fontSize === 'object' && t.fontSize
      ? formatCompositeValue(t.fontSize as Record<string, unknown>) ?? String(t.fontSize)
      : String(t.fontSize ?? '');
    const lh = t.lineHeight != null
      ? `/${typeof t.lineHeight === 'object' ? formatCompositeValue(t.lineHeight as Record<string, unknown>) ?? String(t.lineHeight) : String(t.lineHeight)}`
      : '';
    const family = t.fontFamily ?? '';
    return `${weight} ${size}${lh} ${family}`.trim();
  }
  return null;
}

/**
 * Given a token store, find the best-matching token path for a set of
 * positive/negative patterns. Returns a `var(--css-name)` string or null.
 */
function pickTokenByPatterns(
  allTokensFlat: Record<string, TokenMapEntry>,
  types: string[],
  positivePatterns: RegExp[],
  negativePatterns: RegExp[] = [],
): string | null {
  let best: { cssVar: string; score: number } | null = null;
  for (const [path, entry] of Object.entries(allTokensFlat)) {
    if (!types.includes(entry.$type ?? '')) continue;
    const lower = path.toLowerCase();
    if (negativePatterns.some(r => r.test(lower))) continue;
    let score = 0;
    for (let i = 0; i < positivePatterns.length; i++) {
      if (positivePatterns[i].test(lower)) score += (positivePatterns.length - i) * 10;
    }
    if (score > 0 && (!best || score > best.score)) best = { cssVar: toCssVar(path), score };
  }
  return best ? `var(${best.cssVar})` : null;
}

/**
 * Scan user tokens and produce `--preview-*` CSS custom properties that
 * map semantic UI roles (primary color, text color, border…) to the
 * user's actual tokens regardless of their naming convention.
 */
function resolvePreviewSlots(allTokensFlat: Record<string, TokenMapEntry>): Record<string, string> {
  const slots: Record<string, string> = {};
  const set = (key: string, val: string | null) => { if (val) slots[`--preview-${key}`] = val; };
  const C = ['color'];
  // ── Color slots ──────────────────────────────────────────────────────────
  set('primary', pickTokenByPatterns(allTokensFlat, C,
    [/\bprimary\b/, /\bbrand\b/, /\baccent\b/],
    [/\b(on|text|fg|foreground|background|bg|surface|muted|secondary)\b/]
  ));
  set('on-primary', pickTokenByPatterns(allTokensFlat, C,
    [/\bon[-_]?primary\b/, /\bprimary[-_]?fg\b/, /\bprimary[-_]?foreground\b/, /\bon[-_]?brand\b/]
  ));
  set('surface', pickTokenByPatterns(allTokensFlat, C,
    [/\bsurface\b/, /\bbackground\b/, /\bbg\b/, /\bcanvas\b/],
    [/[-_](?:2|sub|subtle|muted|elevated)\b/, /\b(?:text|on|content)\b/]
  ));
  set('surface-sub', pickTokenByPatterns(allTokensFlat, C,
    [/\bsurface[-_]?(?:2|sub|subtle|elevated|muted)\b/, /\bneutral[-_]?(?:50|100)\b/, /\bgr[ae]y[-_]?(?:50|100)\b/]
  ));
  set('text', pickTokenByPatterns(allTokensFlat, C,
    [/\btext(?:[-_](?:primary|default|base))?\b/, /\bforeground\b/, /\bcontent\b/, /\bonbackground\b/],
    [/\b(?:secondary|2|muted|subtle|disabled|placeholder|hint)\b/]
  ));
  set('text-secondary', pickTokenByPatterns(allTokensFlat, C,
    [/\btext[-_]?(?:secondary|2|muted|subtle)\b/, /\bforeground[-_]?(?:2|secondary)\b/, /\bmuted\b/, /\bsubtle\b/]
  ));
  set('border', pickTokenByPatterns(allTokensFlat, C,
    [/\bborder(?:[-_](?:default|base))?\b/, /\boutline\b/, /\bdivider\b/, /\bseparator\b/],
    [/\b(?:focus|active|hover|error|danger|input)\b/]
  ));
  set('error', pickTokenByPatterns(allTokensFlat, C,
    [/\berror\b/, /\bdanger\b/, /\bdestructive\b/, /\bnegative\b/]
  ));

  // ── Spacing slots: find dimension tokens in a "spacing" group, sort by value ──
  const spacingEntries = Object.entries(allTokensFlat)
    .filter(([path, e]) => {
      const type = e.$type ?? '';
      return (type === 'dimension' || type === 'number' || type === 'spacing')
        && path.split('.')[0].toLowerCase().includes('spac');
    })
    .map(([path, e]) => ({ path, num: parseFloat(String(e.$value ?? '')) }))
    .filter(({ num }) => !isNaN(num))
    .sort((a, b) => a.num - b.num);
  if (spacingEntries.length >= 2) {
    const sm = spacingEntries[Math.max(0, Math.floor(spacingEntries.length * 0.15))];
    const md = spacingEntries[Math.floor(spacingEntries.length * 0.45)];
    const lg = spacingEntries[Math.min(spacingEntries.length - 1, Math.floor(spacingEntries.length * 0.75))];
    set('spacing-sm', `var(${toCssVar(sm.path)})`);
    set('spacing-md', `var(${toCssVar(md.path)})`);
    set('spacing-lg', `var(${toCssVar(lg.path)})`);
  }

  // ── Border radius slots ───────────────────────────────────────────────────
  const radiusEntries = Object.entries(allTokensFlat)
    .filter(([path, e]) => {
      const type = e.$type ?? '';
      const lp = path.toLowerCase();
      return (type === 'dimension' || type === 'borderRadius')
        && (lp.includes('radius') || lp.includes('rounded') || lp.includes('corner'));
    })
    .map(([path, e]) => ({ path, num: parseFloat(String(e.$value ?? '')) }))
    .filter(({ num }) => !isNaN(num) && num < 100)
    .sort((a, b) => a.num - b.num);
  if (radiusEntries.length >= 1) {
    const sm = radiusEntries[0];
    const md = radiusEntries[Math.floor(radiusEntries.length * 0.5)];
    const lg = radiusEntries[Math.min(radiusEntries.length - 1, Math.floor(radiusEntries.length * 0.85))];
    set('radius-sm', `var(${toCssVar(sm.path)})`);
    set('radius-md', `var(${toCssVar(md.path)})`);
    set('radius-lg', `var(${toCssVar(lg.path)})`);
  }

  // ── Font size slots ───────────────────────────────────────────────────────
  const fontSizeEntries = Object.entries(allTokensFlat)
    .filter(([, e]) => ['fontSize', 'fontSizes', 'fontsize'].includes(e.$type ?? ''))
    .map(([path, e]) => ({ path, num: parseFloat(String(e.$value ?? '')) }))
    .filter(({ num }) => !isNaN(num))
    .sort((a, b) => a.num - b.num);
  if (fontSizeEntries.length >= 1) {
    set('font-size-xs', `var(${toCssVar(fontSizeEntries[0].path)})`);
    if (fontSizeEntries.length >= 2)
      set('font-size-sm', `var(${toCssVar(fontSizeEntries[Math.min(1, fontSizeEntries.length - 1)].path)})`);
    if (fontSizeEntries.length >= 3)
      set('font-size-base', `var(${toCssVar(fontSizeEntries[Math.floor(fontSizeEntries.length * 0.4)].path)})`);
  }

  return slots;
}

/** Resolve a token value for use in CSS */
function resolveValue(value: unknown, type: string): string {
  // Structured DTCG objects (dimension, shadow, typography, etc.)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const formatted = formatCompositeValue(value as Record<string, unknown>);
    if (formatted) return formatted;
  }
  // Array of shadows → comma-separated
  if (Array.isArray(value)) {
    const parts = value
      .map(v => typeof v === 'object' && v ? formatCompositeValue(v as Record<string, unknown>) : null)
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  const raw = String(value ?? '');
  // Alias: {path.here} → var(--path-here)
  const resolved = raw.replace(/\{([^}]+)\}/g, (_, p) => `var(--${p.replace(/\./g, '-')})`);
  // Bare number for dimension tokens → add px
  if (type === 'dimension' && /^\d+(\.\d+)?$/.test(resolved)) {
    return resolved + 'px';
  }
  return resolved;
}

const STORAGE_KEY_TEMPLATE = 'preview-template';
const STORAGE_KEY_DARK_MODE = 'preview-dark-mode';

export function PreviewPanel({ allTokensFlat, dimensions = [], activeThemes = {}, onActiveThemesChange, onGoToTokens, onNavigateToToken, onNavigateToGenerator, focusedToken, pathToSet, onClearFocus, onEditToken, serverUrl, tokenUsageCounts, generators, generatorsBySource, derivedTokenPaths, lintViolations, syncSnapshot }: PreviewPanelProps) {
  const [template, setTemplate] = useState<Template>(() => {
    const saved = lsGet(STORAGE_KEY_TEMPLATE);
    return (TEMPLATES.some(t => t.id === saved) ? saved : 'colors') as Template;
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return lsGet(STORAGE_KEY_DARK_MODE) === 'true';
  });

  // Defer heavy token computations so template switches and token reloads don't block the UI
  const deferredTokensFlat = useDeferredValue(allTokensFlat);
  const [isPending, startTransition] = useTransition();
  const isStale = allTokensFlat !== deferredTokensFlat || isPending;

  // Build CSS vars object from all tokens
  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [path, entry] of Object.entries(deferredTokensFlat)) {
      const name = toCssVar(path);
      vars[name] = resolveValue(entry.$value, entry.$type ?? '');
    }
    return vars;
  }, [deferredTokensFlat]);

  // Resolve alias chain to a concrete (non-alias) value, or null if unresolvable
  const resolveAlias = useMemo(() => {
    return function resolve(value: string, visited = new Set<string>()): string | null {
      const aliasMatch = /^\{([^}]+)\}$/.exec(value);
      if (!aliasMatch) return value;
      const refPath = aliasMatch[1];
      if (visited.has(refPath)) return null; // circular
      const target = deferredTokensFlat[refPath];
      if (!target) return null;
      return resolve(String(target.$value ?? ''), new Set([...visited, refPath]));
    };
  }, [deferredTokensFlat]);

  // Collect color tokens grouped by top-level prefix
  const colorGroups = useMemo(() => {
    const groups: Record<string, { path: string; value: string }[]> = {};
    for (const [path, entry] of Object.entries(deferredTokensFlat)) {
      if (entry.$type !== 'color') continue;
      const raw = String(entry.$value ?? '');
      const resolved = /^\{[^}]+\}$/.test(raw) ? resolveAlias(raw) : raw;
      if (!resolved) continue; // unresolvable alias — skip
      const prefix = path.split('.')[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push({ path, value: resolved });
    }
    return groups;
  }, [deferredTokensFlat, resolveAlias]);

  // Collect gradient tokens
  const gradientTokens = useMemo(() => {
    const result: { path: string; value: string }[] = [];
    for (const [path, entry] of Object.entries(deferredTokensFlat)) {
      if (entry.$type !== 'gradient') continue;
      const raw = String(entry.$value ?? '');
      const resolved = /^\{[^}]+\}$/.test(raw) ? resolveAlias(raw) : raw;
      if (!resolved) continue;
      result.push({ path, value: resolved });
    }
    return result;
  }, [deferredTokensFlat, resolveAlias]);

  // Collect shadow tokens
  const shadowTokens = useMemo(() => {
    const SHADOW_TYPES = new Set(['shadow', 'boxShadow', 'innerShadow']);
    const result: { path: string; value: string }[] = [];
    for (const [path, entry] of Object.entries(deferredTokensFlat)) {
      if (!SHADOW_TYPES.has(entry.$type ?? '')) continue;
      const resolved = resolveValue(entry.$value, entry.$type ?? '');
      if (!resolved) continue;
      result.push({ path, value: resolved });
    }
    return result;
  }, [deferredTokensFlat]);

  // Collect transition/animation/duration tokens
  const effectTimingTokens = useMemo(() => {
    const TIMING_TYPES = new Set(['transition', 'animation', 'duration', 'cubicBezier']);
    const result: { path: string; value: string; type: string }[] = [];
    for (const [path, entry] of Object.entries(deferredTokensFlat)) {
      if (!TIMING_TYPES.has(entry.$type ?? '')) continue;
      const raw = String(entry.$value ?? '');
      const resolved = /^\{[^}]+\}$/.test(raw) ? resolveAlias(raw) : raw;
      if (!resolved) continue;
      result.push({ path, value: resolved, type: entry.$type ?? '' });
    }
    return result;
  }, [deferredTokensFlat, resolveAlias]);

  // Collect typography tokens: fontSize entries + sibling fontWeight/lineHeight/letterSpacing/fontFamily
  const typeTokens = useMemo(() => {
    const FONT_SIZE_TYPES = new Set(['fontSizes', 'fontSize', 'fontsize']);
    const entries = Object.entries(deferredTokensFlat);

    // Build a lookup: parentPath → { propLeaf → [path, entry] }
    // e.g. "heading.lg" → { "fontSize": ["heading.lg.fontSize", entry], "fontWeight": ... }
    const siblingMap = new Map<string, Map<string, [string, TokenMapEntry]>>();
    for (const [path, entry] of entries) {
      const lastDot = path.lastIndexOf('.');
      if (lastDot === -1) continue;
      const parent = path.slice(0, lastDot);
      const leaf = path.slice(lastDot + 1);
      if (!siblingMap.has(parent)) siblingMap.set(parent, new Map());
      siblingMap.get(parent)!.set(leaf, [path, entry]);
    }

    return entries
      .filter(([, e]) => FONT_SIZE_TYPES.has(e.$type ?? ''))
      .sort(([a], [b]) => {
        const numA = parseFloat(a.split('.').pop() ?? '0');
        const numB = parseFloat(b.split('.').pop() ?? '0');
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      })
      .map(([path, entry]) => {
        const lastDot = path.lastIndexOf('.');
        const parent = lastDot !== -1 ? path.slice(0, lastDot) : '';
        const siblings = siblingMap.get(parent);

        // Find sibling typography properties by $type or by leaf name
        const findSibling = (types: string[], leafNames: string[]): string | undefined => {
          if (!siblings) return undefined;
          // Try by $type first
          for (const [, [sibPath, sibEntry]] of siblings) {
            if (sibPath === path) continue;
            if (types.some(t => sibEntry.$type === t)) return toCssVar(sibPath);
          }
          // Fall back to matching leaf name
          for (const name of leafNames) {
            const sib = siblings.get(name);
            if (sib && sib[0] !== path) return toCssVar(sib[0]);
          }
          return undefined;
        };

        return {
          path,
          entry,
          fontWeightVar: findSibling(['fontWeights', 'fontWeight', 'fontweight'], ['fontWeight', 'fontWeights', 'weight']),
          lineHeightVar: findSibling(['lineHeights', 'lineHeight', 'lineheight'], ['lineHeight', 'lineHeights']),
          letterSpacingVar: findSibling(['letterSpacing', 'letterspacing'], ['letterSpacing']),
          fontFamilyVar: findSibling(['fontFamilies', 'fontFamily', 'fontfamily'], ['fontFamily', 'fontFamilies', 'family']),
        };
      });
  }, [deferredTokensFlat]);

  // Resolve semantic slot mappings from the user's actual tokens
  const previewSlots = useMemo(() => resolvePreviewSlots(deferredTokensFlat), [deferredTokensFlat]);

  const isEmpty = Object.keys(deferredTokensFlat).length === 0;

  // Determine which templates are relevant based on token types actually present
  const relevantTemplates = useMemo(() => {
    const types = new Set(Object.values(deferredTokensFlat).map(e => e.$type ?? ''));
    const hasColors = types.has('color');
    const hasGradients = types.has('gradient');
    const hasFontSize = types.has('fontSize') || types.has('fontSizes') || types.has('fontsize');
    const hasShadows = types.has('shadow') || types.has('boxShadow') || types.has('innerShadow');
    const hasTimings = types.has('transition') || types.has('animation') || types.has('duration') || types.has('cubicBezier');

    const available = new Set<Template>();
    if (hasColors || hasGradients) available.add('colors');
    if (hasFontSize) available.add('type-scale');
    if (hasColors) {
      available.add('buttons');
      available.add('forms');
      available.add('card');
    }
    if (hasShadows || hasTimings) available.add('effects');

    // Fall back to all templates when no tokens exist yet (empty state)
    if (available.size === 0) return new Set(TEMPLATES.map(t => t.id as Template));
    return available;
  }, [deferredTokensFlat]);

  const visibleTemplates = useMemo(
    () => TEMPLATES.filter(t => relevantTemplates.has(t.id)),
    [relevantTemplates]
  );

  // If the selected template is no longer relevant, fall back to the first visible one
  const effectiveTemplate = relevantTemplates.has(template)
    ? template
    : (visibleTemplates[0]?.id ?? 'colors');

  // Context-aware: when a token is focused, show its detail instead of collection templates
  if (focusedToken) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-figma-bg)] overflow-hidden">
        <TokenDetailPreview
          tokenPath={focusedToken.path}
          tokenName={focusedToken.name}
          setName={focusedToken.set}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          dimensions={dimensions}
          activeThemes={activeThemes}
          tokenUsageCounts={tokenUsageCounts}
          generators={generators}
          generatorsBySource={generatorsBySource}
          derivedTokenPaths={derivedTokenPaths}
          lintViolations={lintViolations?.filter(violation => violation.path === focusedToken.path)}
          syncSnapshot={syncSnapshot}
          serverUrl={serverUrl}
          onEdit={() => onEditToken?.(focusedToken.path, focusedToken.name, focusedToken.set)}
          onClose={onClearFocus ?? (() => {})}
          onNavigateToAlias={(path) => onNavigateToToken?.(path)}
          onNavigateToGenerator={onNavigateToGenerator}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-figma-bg)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <div className="flex items-center gap-0.5 overflow-x-auto flex-1">
            {visibleTemplates.map(t => (
              <button
                key={t.id}
                onClick={() => { startTransition(() => setTemplate(t.id)); lsSet(STORAGE_KEY_TEMPLATE, t.id); }}
                className={`shrink-0 px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                  effectiveTemplate === t.id
                    ? 'bg-[var(--color-figma-accent)] text-white'
                    : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setDarkMode(v => { const next = !v; lsSet(STORAGE_KEY_DARK_MODE, String(next)); return next; })}
            title={darkMode ? 'Switch to light' : 'Switch to dark'}
            className={`shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
              darkMode
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {darkMode
                ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
                : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              }
            </svg>
            {darkMode ? 'Light' : 'Dark'}
          </button>
        </div>
        {dimensions.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 pb-1.5 flex-wrap">
            {dimensions.map(dim => {
              const activeOption = activeThemes[dim.id] ?? dim.options[0]?.name ?? '';
              return (
                <label key={dim.id} className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                  <span className="shrink-0">{dim.name}</span>
                  <select
                    value={activeOption}
                    onChange={e => onActiveThemesChange?.({ ...activeThemes, [dim.id]: e.target.value })}
                    className="text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 text-[var(--color-figma-text)] cursor-pointer"
                  >
                    {dim.options.map(opt => (
                      <option key={opt.name} value={opt.name}>{opt.name}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview surface */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 relative">
        {isStale && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-figma-bg)]/60 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] shadow-sm">
              <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Resolving…</span>
            </div>
          </div>
        )}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-figma-text-secondary)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <p className="text-[11px] text-center">No tokens loaded.<br />Connect to a server with tokens to preview them.</p>
          </div>
        ) : (
          <div
            style={{ ...cssVars, ...previewSlots } as React.CSSProperties}
            className={`rounded-lg overflow-hidden ${darkMode ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}
          >
            {effectiveTemplate === 'colors' && <ColorsTemplate groups={colorGroups} gradients={gradientTokens} darkMode={darkMode} onGoToTokens={onGoToTokens} onNavigateToToken={onNavigateToToken} />}
            {effectiveTemplate === 'type-scale' && <TypeScaleTemplate typeTokens={typeTokens} cssVars={cssVars} darkMode={darkMode} onGoToTokens={onGoToTokens} onNavigateToToken={onNavigateToToken} />}
            {effectiveTemplate === 'buttons' && <ButtonsTemplate darkMode={darkMode} />}
            {effectiveTemplate === 'forms' && <FormsTemplate darkMode={darkMode} />}
            {effectiveTemplate === 'card' && <CardTemplate darkMode={darkMode} />}
            {effectiveTemplate === 'effects' && <EffectsTemplate shadows={shadowTokens} timings={effectTimingTokens} darkMode={darkMode} onGoToTokens={onGoToTokens} onNavigateToToken={onNavigateToToken} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Color Palette ────────────────────────────────────────────────────────────

const SWATCHES_COLLAPSED = 16;

function ColorGroup({ group, tokens, darkMode, onNavigateToToken }: { group: string; tokens: { path: string; value: string }[]; darkMode: boolean; onNavigateToToken?: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = tokens.length > SWATCHES_COLLAPSED;
  const visible = expanded ? tokens : tokens.slice(0, SWATCHES_COLLAPSED);

  return (
    <div>
      <div className={previewSectionLabelClassName(darkMode)}>
        {group}
        <span className={`ml-1 font-normal normal-case tracking-normal ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>({tokens.length})</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(({ path, value }) => (
          <SwatchCell key={path} path={path} value={value} darkMode={darkMode} onNavigateToToken={onNavigateToToken} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          className={`mt-1.5 text-[10px] hover:underline ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}
        >
          {expanded ? 'Show less' : `Show all ${tokens.length} colors`}
        </button>
      )}
    </div>
  );
}

function ColorsTemplate({ groups, gradients, darkMode, onGoToTokens, onNavigateToToken }: { groups: Record<string, { path: string; value: string }[]>; gradients: { path: string; value: string }[]; darkMode: boolean; onGoToTokens?: () => void; onNavigateToToken?: (path: string) => void }) {
  const groupEntries = Object.entries(groups);
  if (groupEntries.length === 0 && gradients.length === 0) {
    return (
      <div className={`p-4 flex flex-col gap-2 text-[11px] ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
        <span>No color tokens found. Add tokens with <code className="font-mono">$type: &quot;color&quot;</code>.</span>
        {onGoToTokens && (
          <button
            onClick={onGoToTokens}
            className="self-start text-[11px] text-[var(--color-figma-accent)] hover:underline"
          >
            Go to Tokens →
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-4">
      {groupEntries.map(([group, tokens]) => (
        <ColorGroup key={group} group={group} tokens={tokens} darkMode={darkMode} onNavigateToToken={onNavigateToToken} />
      ))}
      {gradients.length > 0 && (
        <div>
          <div className={previewSectionLabelClassName(darkMode)}>
            Gradients
            <span className={`ml-1 font-normal normal-case tracking-normal ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>({gradients.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {gradients.map(({ path, value }) => (
              <GradientSwatch key={path} path={path} value={value} darkMode={darkMode} onNavigateToToken={onNavigateToToken} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SwatchCell({ path, value, darkMode, onNavigateToToken }: { path: string; value: string; darkMode: boolean; onNavigateToToken?: (path: string) => void }) {
  const leafName = path.split('.').pop() ?? path;
  const cssVar = toCssVar(path);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, label: string) => {
    copyText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 w-10 group relative">
      <div
        role="button"
        tabIndex={0}
        className="w-10 h-10 rounded-md border border-black/10 shadow-sm cursor-pointer relative"
        style={{ backgroundColor: `var(${cssVar}, ${value})` }}
        title={`Click to copy CSS variable\n${cssVar}: ${value}`}
        aria-label={`Copy CSS variable ${cssVar}`}
        onClick={() => handleCopy(`var(${cssVar})`, 'var')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopy(`var(${cssVar})`, 'var'); } }}
      >
        {copied && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60 text-white text-[8px] font-medium">
            {copied}
          </div>
        )}
        {onNavigateToToken && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigateToToken(path); }}
            title={`Go to token: ${path}`}
            aria-label={`Go to token: ${path}`}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-figma-accent)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shadow-sm"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
      <span
        role="button"
        tabIndex={0}
        className={`text-[10px] text-center leading-tight truncate w-full cursor-pointer ${darkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700'}`}
        title={`Click to copy value: ${value}`}
        aria-label={`Copy value ${value}`}
        onClick={() => handleCopy(value, 'value')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopy(value, 'value'); } }}
      >
        {leafName}
      </span>
    </div>
  );
}

function GradientSwatch({ path, value, darkMode, onNavigateToToken }: { path: string; value: string; darkMode: boolean; onNavigateToToken?: (path: string) => void }) {
  const leafName = path.split('.').pop() ?? path;
  const cssVar = toCssVar(path);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, label: string) => {
    copyText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 w-16 group relative">
      <div
        role="button"
        tabIndex={0}
        className="w-16 h-10 rounded-md border border-black/10 shadow-sm cursor-pointer relative"
        style={{ background: `var(${cssVar}, ${value})` }}
        title={`Click to copy CSS variable\n${cssVar}: ${value}`}
        aria-label={`Copy CSS variable ${cssVar}`}
        onClick={() => handleCopy(`var(${cssVar})`, 'var')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopy(`var(${cssVar})`, 'var'); } }}
      >
        {copied && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60 text-white text-[8px] font-medium">
            {copied}
          </div>
        )}
        {onNavigateToToken && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigateToToken(path); }}
            title={`Go to token: ${path}`}
            aria-label={`Go to token: ${path}`}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-figma-accent)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shadow-sm"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
      <span
        role="button"
        tabIndex={0}
        className={`text-[10px] text-center leading-tight truncate w-full cursor-pointer ${darkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700'}`}
        title={`Click to copy value: ${value}`}
        aria-label={`Copy value ${value}`}
        onClick={() => handleCopy(value, 'value')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopy(value, 'value'); } }}
      >
        {leafName}
      </span>
    </div>
  );
}

// ─── Type Scale ───────────────────────────────────────────────────────────────

interface TypeScaleEntry {
  path: string;
  entry: TokenMapEntry;
  fontWeightVar?: string;
  lineHeightVar?: string;
  letterSpacingVar?: string;
  fontFamilyVar?: string;
}

function TypeScaleTemplate({ typeTokens, cssVars, darkMode, onGoToTokens, onNavigateToToken }: {
  typeTokens: TypeScaleEntry[];
  cssVars: Record<string, string>;
  darkMode: boolean;
  onGoToTokens?: () => void;
  onNavigateToToken?: (path: string) => void;
}) {
  if (typeTokens.length === 0) {
    return (
      <div className={`p-4 flex flex-col gap-2 text-[11px] ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
        <span>No fontSize tokens found. Add tokens with <code className="font-mono">$type: &quot;fontSize&quot;</code>.</span>
        {onGoToTokens && (
          <button
            onClick={onGoToTokens}
            className="self-start text-[11px] text-[var(--color-figma-accent)] hover:underline"
          >
            Go to Tokens →
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-3">
      {typeTokens.map(({ path, fontWeightVar, lineHeightVar, letterSpacingVar, fontFamilyVar }) => {
        const cssVarName = toCssVar(path);
        const resolvedSize = cssVars[cssVarName] ?? '16px';
        const leafName = path.split('.').pop() ?? path;

        // Build style with all available typography properties
        const style: CSSProperties = {
          fontSize: `var(${cssVarName}, 16px)`,
        };
        if (fontWeightVar) style.fontWeight = `var(${fontWeightVar})`;
        if (lineHeightVar) style.lineHeight = `var(${lineHeightVar})`;
        if (letterSpacingVar) style.letterSpacing = `var(${letterSpacingVar})`;
        if (fontFamilyVar) style.fontFamily = `var(${fontFamilyVar})`;

        // Collect resolved meta for display
        const meta: string[] = [resolvedSize];
        if (fontWeightVar && cssVars[fontWeightVar]) meta.push(cssVars[fontWeightVar]);
        if (lineHeightVar && cssVars[lineHeightVar]) meta.push(`/${cssVars[lineHeightVar]}`);
        if (letterSpacingVar && cssVars[letterSpacingVar]) meta.push(`ls:${cssVars[letterSpacingVar]}`);
        if (fontFamilyVar && cssVars[fontFamilyVar]) meta.push(cssVars[fontFamilyVar]);

        return (
          <div key={path} className="group flex flex-col gap-0.5 overflow-hidden">
            <div className="flex items-baseline gap-3 overflow-hidden">
              <span className={`text-[10px] w-24 shrink-0 text-right ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
                {meta.join(' ')}
              </span>
              <span
                className="overflow-hidden text-ellipsis whitespace-nowrap flex-1"
                style={style}
              >
                {leafName} — The quick brown fox
              </span>
            </div>
            <div className="flex items-center gap-0.5 pl-[calc(6rem+12px)] opacity-0 group-hover:opacity-100 transition-opacity">
              {onNavigateToToken && (
                <button
                  onClick={() => onNavigateToToken(path)}
                  title={`Go to token: ${path}`}
                  className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] transition-colors ${
                    darkMode
                      ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                      : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Go to
                </button>
              )}
              <CopyButton text={`var(${cssVarName})`} label={cssVarName} darkMode={darkMode} />
              <CopyButton text={resolvedSize} label={resolvedSize} darkMode={darkMode} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

function ButtonsTemplate({ darkMode }: { darkMode: boolean }) {
  const clrPrimary = 'var(--preview-primary, var(--color-primary, var(--color-brand-500, var(--color-accent, #0066ff))))';
  const clrOnPrimary = 'var(--preview-on-primary, var(--color-on-primary, var(--color-white, #ffffff)))';
  const clrSurfaceSub = 'var(--preview-surface-sub, var(--color-surface-2, var(--color-neutral-100, var(--color-grey-100, #f0f0f0))))';
  const clrText = 'var(--preview-text, var(--color-text, var(--color-neutral-900, #111111)))';
  const clrError = 'var(--preview-error, var(--color-error, var(--color-danger, var(--color-red-500, #ef4444))))';

  const base = {
    padding: 'var(--preview-spacing-sm, var(--spacing-2, 8px)) var(--preview-spacing-md, var(--spacing-4, 16px))',
    borderRadius: 'var(--preview-radius-md, var(--border-radius-md, var(--radius-md, var(--radius-2, 6px))))',
    fontSize: 'var(--preview-font-size-sm, var(--font-size-sm, var(--font-size-14, var(--typography-size-sm, 13px))))',
    fontWeight: 'var(--font-weight-medium, 500)',
    cursor: 'default',
    border: '1px solid transparent',
    display: 'inline-block' as const,
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <PreviewSection label="Primary" darkMode={darkMode}>
        <button style={{ ...base, background: clrPrimary, color: clrOnPrimary }}>
          Button
        </button>
        <button style={{ ...base, background: clrPrimary, color: clrOnPrimary, opacity: 0.7 }}>
          Hover
        </button>
        <button style={{ ...base, background: clrPrimary, color: clrOnPrimary, opacity: 0.5 }}>
          Disabled
        </button>
      </PreviewSection>
      <PreviewSection label="Secondary" darkMode={darkMode}>
        <button style={{ ...base, background: 'transparent', color: clrPrimary, border: `1px solid ${clrPrimary}` }}>
          Outlined
        </button>
        <button style={{ ...base, background: clrSurfaceSub, color: clrText }}>
          Secondary
        </button>
        <button style={{ ...base, background: 'transparent', color: clrText }}>
          Ghost
        </button>
      </PreviewSection>
      <PreviewSection label="Destructive" darkMode={darkMode}>
        <button style={{ ...base, background: clrError, color: 'var(--preview-on-primary, #ffffff)' }}>
          Delete
        </button>
        <button style={{ ...base, background: 'transparent', color: clrError, border: `1px solid ${clrError}` }}>
          Cancel
        </button>
      </PreviewSection>
    </div>
  );
}

// ─── Forms ────────────────────────────────────────────────────────────────────

function FormsTemplate({ darkMode: _darkMode }: { darkMode: boolean }) {
  const clrBorder = 'var(--preview-border, var(--color-border, var(--color-neutral-200, var(--color-grey-300, #d1d5db))))';
  const clrSurface = 'var(--preview-surface, var(--color-surface, var(--color-white, var(--color-bg, transparent))))';
  const clrText = 'var(--preview-text, var(--color-text, var(--color-neutral-900, inherit)))';
  const clrTextSec = 'var(--preview-text-secondary, var(--color-text-secondary, var(--color-neutral-600, var(--color-grey-600, #4b5563))))';
  const clrError = 'var(--preview-error, var(--color-error, var(--color-danger, #ef4444)))';
  const clrPrimary = 'var(--preview-primary, var(--color-primary, var(--color-brand-500, #0066ff)))';
  const clrOnPrimary = 'var(--preview-on-primary, var(--color-on-primary, #ffffff))';

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 'var(--preview-spacing-sm, var(--spacing-2, 8px)) var(--preview-spacing-sm, var(--spacing-3, 12px))',
    borderRadius: 'var(--preview-radius-sm, var(--border-radius-sm, var(--radius-sm, 4px)))',
    fontSize: 'var(--preview-font-size-sm, var(--font-size-sm, 13px))',
    border: `1px solid ${clrBorder}`,
    background: clrSurface,
    color: clrText,
    outline: 'none',
    pointerEvents: 'none' as const,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--preview-font-size-xs, var(--font-size-xs, 11px))',
    fontWeight: 'var(--font-weight-medium, 500)',
    color: clrTextSec,
    marginBottom: '4px',
  };

  return (
    <div className="p-4 flex flex-col gap-3" style={{ maxWidth: '260px' }}>
      <div>
        <label style={labelStyle}>Email address</label>
        <input readOnly value="name@example.com" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Password</label>
        <input readOnly type="password" value="••••••••" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>With error</label>
        <input readOnly value="invalid input" style={{ ...inputStyle, borderColor: clrError }} />
        <span style={{ fontSize: 'var(--preview-font-size-xs, var(--font-size-xs, 11px))', color: clrError, marginTop: '3px', display: 'block' }}>
          This field is required
        </span>
      </div>
      <div>
        <label style={labelStyle}>Disabled</label>
        <input readOnly value="Disabled input" style={{ ...inputStyle, opacity: 0.5 }} />
      </div>
      <button
        style={{
          marginTop: '4px',
          padding: 'var(--preview-spacing-sm, var(--spacing-2, 8px)) var(--preview-spacing-md, var(--spacing-4, 16px))',
          borderRadius: 'var(--preview-radius-md, var(--border-radius-md, var(--radius-md, 6px)))',
          background: clrPrimary,
          color: clrOnPrimary,
          fontSize: 'var(--preview-font-size-sm, var(--font-size-sm, 13px))',
          fontWeight: 'var(--font-weight-medium, 500)',
          border: 'none',
          cursor: 'default',
          width: '100%',
        }}
      >
        Sign in
      </button>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function CardTemplate({ darkMode }: { darkMode: boolean }) {
  const clrPrimary = 'var(--preview-primary, var(--color-primary, var(--color-brand-500, var(--color-accent, #0066ff))))';
  const clrOnPrimary = 'var(--preview-on-primary, var(--color-on-primary, #ffffff))';
  const clrText = 'var(--preview-text, var(--color-text, var(--color-neutral-900, inherit)))';
  const clrTextSec = 'var(--preview-text-secondary, var(--color-text-secondary, var(--color-neutral-600, var(--color-grey-500, #6b7280))))';
  const clrBorder = darkMode
    ? 'var(--preview-border, var(--color-border, var(--color-neutral-700, #374151)))'
    : 'var(--preview-border, var(--color-border, var(--color-neutral-200, var(--color-grey-200, #e5e7eb))))';
  const cardBg = darkMode
    ? 'var(--preview-surface-sub, var(--color-surface, var(--color-neutral-800, var(--color-grey-800, #1f2937))))'
    : 'var(--preview-surface, var(--color-surface, var(--color-white, var(--color-bg-card, #ffffff))))';
  const radiusMd = 'var(--preview-radius-md, var(--border-radius-md, var(--radius-md, 6px)))';
  const radiusLg = 'var(--preview-radius-lg, var(--border-radius-lg, var(--radius-lg, var(--radius-4, 12px))))';

  return (
    <div className="p-4">
      <div style={{
        background: cardBg,
        border: `1px solid ${clrBorder}`,
        borderRadius: radiusLg,
        overflow: 'hidden',
        maxWidth: '260px',
        boxShadow: 'var(--shadow-md, 0 2px 8px rgba(0,0,0,0.08))',
      }}>
        {/* Card image placeholder */}
        <div style={{
          height: '100px',
          background: clrPrimary,
          opacity: 0.2,
        }} />
        <div style={{ padding: 'var(--preview-spacing-md, var(--spacing-4, 16px))' }}>
          <h3 style={{
            fontSize: 'var(--preview-font-size-base, var(--font-size-base, var(--font-size-16, 15px)))',
            fontWeight: 'var(--font-weight-semibold, 600)',
            color: clrText,
            marginBottom: '6px',
          }}>
            Card Title
          </h3>
          <p style={{
            fontSize: 'var(--preview-font-size-sm, var(--font-size-sm, 12px))',
            color: clrTextSec,
            marginBottom: '14px',
            lineHeight: 1.5,
          }}>
            A sample card component rendered using your design tokens as CSS custom properties.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{
              flex: 1,
              padding: '7px 12px',
              borderRadius: radiusMd,
              background: clrPrimary,
              color: clrOnPrimary,
              fontSize: 'var(--preview-font-size-xs, var(--font-size-xs, 11px))',
              fontWeight: 'var(--font-weight-medium, 500)',
              border: 'none',
              cursor: 'default',
            }}>
              Primary
            </button>
            <button style={{
              flex: 1,
              padding: '7px 12px',
              borderRadius: radiusMd,
              background: 'transparent',
              color: clrText,
              fontSize: 'var(--preview-font-size-xs, var(--font-size-xs, 11px))',
              fontWeight: 'var(--font-weight-medium, 500)',
              border: `1px solid ${clrBorder}`,
              cursor: 'default',
            }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Effects ─────────────────────────────────────────────────────────────────

function ShadowSwatch({ path, value, darkMode, onNavigateToToken }: { path: string; value: string; darkMode: boolean; onNavigateToToken?: (path: string) => void }) {
  const leafName = path.split('.').pop() ?? path;
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, label: string) => {
    copyText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  }, []);

  return (
    <div
      className={`group relative flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
        darkMode ? 'border-neutral-700 hover:border-neutral-500' : 'border-neutral-200 hover:border-neutral-300'
      }`}
      onClick={() => handleCopy(value, 'copied')}
      title={`${path}\n${value}\nClick to copy`}
    >
      {/* Shadow demo box */}
      <div className="flex items-center justify-center h-14">
        <div
          className={`w-12 h-8 rounded-md ${darkMode ? 'bg-neutral-700' : 'bg-white'}`}
          style={{ boxShadow: value }}
        />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className={`text-[10px] font-medium truncate ${darkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>{leafName}</div>
        <div className={`text-[9px] font-mono truncate ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>{value}</div>
      </div>
      {copied && (
        <div className="absolute top-1 right-1 text-[9px] text-green-500 font-medium">{copied}</div>
      )}
      {onNavigateToToken && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigateToToken(path); }}
          title={`Go to token: ${path}`}
          aria-label={`Go to token: ${path}`}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[var(--color-figma-accent)] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

function TransitionRow({ path, value, type, darkMode, onNavigateToToken }: { path: string; value: string; type: string; darkMode: boolean; onNavigateToToken?: (path: string) => void }) {
  const leafName = path.split('.').pop() ?? path;

  // Build a usable transition/animation CSS string
  const transitionValue = type === 'duration'
    ? `all ${value} ease`
    : type === 'cubicBezier'
    ? `all 0.3s cubic-bezier(${value})`
    : value; // raw transition value

  return (
    <div className="group flex items-center gap-3">
      <div className="w-28 shrink-0">
        <div className={`text-[10px] font-medium truncate ${darkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>{leafName}</div>
        <div className={`text-[9px] font-mono truncate ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>{value}</div>
        <div className={`text-[9px] uppercase tracking-wide ${darkMode ? 'text-neutral-600' : 'text-neutral-400'}`}>{type}</div>
      </div>
      {/* Hover demo: a box that slides on hover using the token's transition */}
      <div className="relative flex-1 h-8 overflow-hidden rounded">
        <div
          className={`absolute left-0 top-0 h-full w-6 rounded flex items-center justify-center text-[9px] ${
            darkMode ? 'bg-[var(--color-figma-accent,#0d99ff)]' : 'bg-[var(--color-figma-accent,#0d99ff)]'
          } text-white`}
          style={{ transition: transitionValue }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.left = 'calc(100% - 24px)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.left = '0'; }}
          title="Hover to preview transition"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <div className={`absolute inset-0 rounded border ${darkMode ? 'border-neutral-700' : 'border-neutral-200'}`} style={{ pointerEvents: 'none' }} />
      </div>
      {onNavigateToToken && (
        <button
          onClick={() => onNavigateToToken(path)}
          title={`Go to token: ${path}`}
          aria-label={`Go to token: ${path}`}
          className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${darkMode ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600'}`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

function EffectsTemplate({ shadows, timings, darkMode, onGoToTokens, onNavigateToToken }: {
  shadows: { path: string; value: string }[];
  timings: { path: string; value: string; type: string }[];
  darkMode: boolean;
  onGoToTokens?: () => void;
  onNavigateToToken?: (path: string) => void;
}) {
  const hasContent = shadows.length > 0 || timings.length > 0;

  if (!hasContent) {
    return (
      <div className={`p-4 flex flex-col gap-2 text-[11px] ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
        <span>
          No effect tokens found. Add tokens with{' '}
          <code className="font-mono">$type: &quot;shadow&quot;</code>,{' '}
          <code className="font-mono">&quot;transition&quot;</code>, or{' '}
          <code className="font-mono">&quot;duration&quot;</code>.
        </span>
        {onGoToTokens && (
          <button
            onClick={onGoToTokens}
            className="self-start text-[11px] text-[var(--color-figma-accent)] hover:underline"
          >
            Go to Tokens →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 flex flex-col gap-5">
      {shadows.length > 0 && (
        <div>
          <div className={previewSectionLabelClassName(darkMode)}>
            Shadows
            <span className={`ml-1 font-normal normal-case tracking-normal ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>({shadows.length})</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {shadows.map(({ path, value }) => (
              <ShadowSwatch key={path} path={path} value={value} darkMode={darkMode} onNavigateToToken={onNavigateToToken} />
            ))}
          </div>
        </div>
      )}
      {timings.length > 0 && (
        <div>
          <div className={previewSectionLabelClassName(darkMode)}>
            Transitions &amp; Durations
            <span className={`ml-1 font-normal normal-case tracking-normal ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>({timings.length}) — hover arrows to preview</span>
          </div>
          <div className="flex flex-col gap-2">
            {timings.map(({ path, value, type }) => (
              <TransitionRow key={path} path={path} value={value} type={type} darkMode={darkMode} onNavigateToToken={onNavigateToToken} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Copy to clipboard ──────────────────────────────────────────────────────

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for environments where clipboard API is unavailable
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}

function CopyButton({ text, label, darkMode }: { text: string; label: string; darkMode: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    copyText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      title={`Copy ${label}`}
      className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-mono transition-colors ${
        copied
          ? 'text-green-500'
          : darkMode
            ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
            : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {copied ? (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function PreviewSection({ label, darkMode, children }: { label: string; darkMode: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className={previewSectionLabelClassName(darkMode)}>{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
