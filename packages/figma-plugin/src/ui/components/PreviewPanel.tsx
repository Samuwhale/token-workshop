import type { CSSProperties } from 'react';
import { useCallback, useDeferredValue, useMemo, useState, useTransition } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { LintViolation } from '../hooks/useLint';
import { TokenInspector } from './TokenInspector';
import { Spinner } from './Spinner';
import { lsGet, lsSet } from '../shared/storage';
import type { TokenCollection } from '@tokenmanager/core';

interface PreviewPanelProps {
  allTokensFlat: Record<string, TokenMapEntry>;
  onNavigateToToken?: (path: string) => void;
  /** When set, the panel renders token detail instead of collection templates. */
  focusedToken?: { path: string; name?: string; currentCollectionId: string } | null;
  pathToCollectionId?: Record<string, string>;
  collections?: TokenCollection[];
  onClearFocus?: () => void;
  onEditToken?: (path: string, name?: string, currentCollectionId?: string) => void;
  onDuplicateToken?: (path: string) => void;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
}

type Template = 'colors' | 'type-scale' | 'effects';

const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'colors', label: 'Colors' },
  { id: 'type-scale', label: 'Type scale' },
  { id: 'effects', label: 'Effects' },
];

/** Convert a token path to a CSS custom property name. */
function toCssVar(path: string): string {
  return `--${path.replace(/\./g, '-')}`;
}

/** Format a structured DTCG value object into a CSS-compatible string. */
function formatCompositeValue(value: Record<string, unknown>): string | null {
  if ('value' in value && 'unit' in value) {
    return `${value.value}${value.unit}`;
  }
  if ('offsetX' in value && 'offsetY' in value && 'color' in value) {
    const s = value as Record<string, unknown>;
    const ox = formatCompositeValue(s.offsetX as Record<string, unknown>) ?? String(s.offsetX ?? 0);
    const oy = formatCompositeValue(s.offsetY as Record<string, unknown>) ?? String(s.offsetY ?? 0);
    const bl = formatCompositeValue(s.blur as Record<string, unknown>) ?? String(s.blur ?? 0);
    const sp = formatCompositeValue(s.spread as Record<string, unknown>) ?? String(s.spread ?? 0);
    return `${ox} ${oy} ${bl} ${sp} ${s.color ?? ''}`.trim();
  }
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

/** Resolve a token value for CSS use. */
function resolveValue(value: unknown, type: string): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const formatted = formatCompositeValue(value as Record<string, unknown>);
    if (formatted) return formatted;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map(v => typeof v === 'object' && v ? formatCompositeValue(v as Record<string, unknown>) : null)
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  const raw = String(value ?? '');
  const resolved = raw.replace(/\{([^}]+)\}/g, (_, p) => `var(--${p.replace(/\./g, '-')})`);
  if (type === 'dimension' && /^\d+(\.\d+)?$/.test(resolved)) {
    return resolved + 'px';
  }
  return resolved;
}

const STORAGE_KEY_TEMPLATE = 'preview-template';

export function PreviewPanel({
  allTokensFlat,
  onNavigateToToken,
  focusedToken,
  pathToCollectionId,
  collections,
  onClearFocus,
  onEditToken,
  onDuplicateToken,
  lintViolations,
  syncSnapshot,
}: PreviewPanelProps) {
  const [template, setTemplate] = useState<Template>(() => {
    const saved = lsGet(STORAGE_KEY_TEMPLATE);
    return (TEMPLATES.some(t => t.id === saved) ? saved : 'colors') as Template;
  });

  const deferredTokensFlat = useDeferredValue(allTokensFlat);
  const [isPending, startTransition] = useTransition();
  const isStale = allTokensFlat !== deferredTokensFlat || isPending;

  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [path, entry] of Object.entries(deferredTokensFlat)) {
      const name = toCssVar(path);
      vars[name] = resolveValue(entry.$value, entry.$type ?? '');
    }
    return vars;
  }, [deferredTokensFlat]);

  const resolveAlias = useMemo(() => {
    return function resolve(value: string, visited = new Set<string>()): string | null {
      const aliasMatch = /^\{([^}]+)\}$/.exec(value);
      if (!aliasMatch) return value;
      const refPath = aliasMatch[1];
      if (visited.has(refPath)) return null;
      const target = deferredTokensFlat[refPath];
      if (!target) return null;
      return resolve(String(target.$value ?? ''), new Set([...visited, refPath]));
    };
  }, [deferredTokensFlat]);

  const colorGroups = useMemo(() => {
    const groups: Record<string, { path: string; value: string }[]> = {};
    for (const [path, entry] of Object.entries(deferredTokensFlat)) {
      if (entry.$type !== 'color') continue;
      const raw = String(entry.$value ?? '');
      const resolved = /^\{[^}]+\}$/.test(raw) ? resolveAlias(raw) : raw;
      if (!resolved) continue;
      const prefix = path.split('.')[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push({ path, value: resolved });
    }
    return groups;
  }, [deferredTokensFlat, resolveAlias]);

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

  const typeTokens = useMemo(() => {
    const FONT_SIZE_TYPES = new Set(['fontSizes', 'fontSize', 'fontsize']);
    const entries = Object.entries(deferredTokensFlat);

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

        const findSibling = (types: string[], leafNames: string[]): string | undefined => {
          if (!siblings) return undefined;
          for (const [, [sibPath, sibEntry]] of siblings) {
            if (sibPath === path) continue;
            if (types.some(t => sibEntry.$type === t)) return toCssVar(sibPath);
          }
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

  const isEmpty = Object.keys(deferredTokensFlat).length === 0;

  const relevantTemplates = useMemo(() => {
    const types = new Set(Object.values(deferredTokensFlat).map(e => e.$type ?? ''));
    const hasColors = types.has('color') || types.has('gradient');
    const hasFontSize = types.has('fontSize') || types.has('fontSizes') || types.has('fontsize');
    const hasEffects =
      types.has('shadow') || types.has('boxShadow') || types.has('innerShadow') ||
      types.has('transition') || types.has('animation') || types.has('duration') || types.has('cubicBezier');

    const available = new Set<Template>();
    if (hasColors) available.add('colors');
    if (hasFontSize) available.add('type-scale');
    if (hasEffects) available.add('effects');
    if (available.size === 0) return new Set(TEMPLATES.map(t => t.id as Template));
    return available;
  }, [deferredTokensFlat]);

  const visibleTemplates = useMemo(
    () => TEMPLATES.filter(t => relevantTemplates.has(t.id)),
    [relevantTemplates]
  );

  const effectiveTemplate = relevantTemplates.has(template)
    ? template
    : (visibleTemplates[0]?.id ?? 'colors');

  if (focusedToken) {
    return (
      <div className="flex flex-col h-full bg-[var(--color-figma-bg)] overflow-hidden">
        <TokenInspector
          tokenPath={focusedToken.path}
          tokenName={focusedToken.name}
          storageCollectionId={focusedToken.currentCollectionId}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          collections={collections}
          lintViolations={lintViolations?.filter(v => v.path === focusedToken.path)}
          syncSnapshot={syncSnapshot}
          onEdit={() => onEditToken?.(focusedToken.path, focusedToken.name, focusedToken.currentCollectionId)}
          onDuplicate={onDuplicateToken ? () => onDuplicateToken(focusedToken.path) : undefined}
          onClose={onClearFocus ?? (() => {})}
          onNavigateToToken={(path) => onNavigateToToken?.(path)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-figma-bg)] overflow-hidden">
      {visibleTemplates.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[var(--color-figma-border)] shrink-0">
          {visibleTemplates.map(t => (
            <button
              key={t.id}
              onClick={() => { startTransition(() => setTemplate(t.id)); lsSet(STORAGE_KEY_TEMPLATE, t.id); }}
              className={`shrink-0 px-2.5 py-1 text-secondary font-medium rounded transition-colors ${
                effectiveTemplate === t.id
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 relative">
        {isStale && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-figma-bg)]/60 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] shadow-sm">
              <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">Resolving…</span>
            </div>
          </div>
        )}
        {isEmpty ? (
          <EmptyOverview />
        ) : (
          <div
            style={cssVars as React.CSSProperties}
            className="rounded-md overflow-hidden"
          >
            {effectiveTemplate === 'colors' && (
              <ColorsTemplate
                groups={colorGroups}
                gradients={gradientTokens}
                onNavigateToToken={onNavigateToToken}
              />
            )}
            {effectiveTemplate === 'type-scale' && (
              <TypeScaleTemplate
                typeTokens={typeTokens}
                cssVars={cssVars}
                onNavigateToToken={onNavigateToToken}
              />
            )}
            {effectiveTemplate === 'effects' && (
              <EffectsTemplate
                shadows={shadowTokens}
                timings={effectTimingTokens}
                onNavigateToToken={onNavigateToToken}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyOverview() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-figma-text-secondary)]">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      <p className="text-body text-center">Select a token to inspect it, or add tokens to see the overview.</p>
    </div>
  );
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const SWATCHES_COLLAPSED = 24;

function ColorsTemplate({
  groups,
  gradients,
  onNavigateToToken,
}: {
  groups: Record<string, { path: string; value: string }[]>;
  gradients: { path: string; value: string }[];
  onNavigateToToken?: (path: string) => void;
}) {
  const groupEntries = Object.entries(groups);
  if (groupEntries.length === 0 && gradients.length === 0) {
    return (
      <div className="p-3 text-body text-[var(--color-figma-text-secondary)]">
        No color or gradient tokens in this view.
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-4">
      {groupEntries.map(([group, tokens]) => (
        <ColorGroup key={group} group={group} tokens={tokens} onNavigateToToken={onNavigateToToken} />
      ))}
      {gradients.length > 0 && (
        <div>
          <SectionLabel>Gradients</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {gradients.map(({ path, value }) => (
              <GradientSwatch key={path} path={path} value={value} onNavigateToToken={onNavigateToToken} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColorGroup({
  group,
  tokens,
  onNavigateToToken,
}: {
  group: string;
  tokens: { path: string; value: string }[];
  onNavigateToToken?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = tokens.length > SWATCHES_COLLAPSED;
  const visible = expanded ? tokens : tokens.slice(0, SWATCHES_COLLAPSED);
  return (
    <div>
      <SectionLabel>{group}</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(({ path, value }) => (
          <SwatchCell key={path} path={path} value={value} onNavigateToToken={onNavigateToToken} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1.5 text-secondary hover:underline text-[var(--color-figma-text-secondary)]"
        >
          {expanded ? 'Show less' : `Show all ${tokens.length}`}
        </button>
      )}
    </div>
  );
}

function SwatchCell({
  path,
  value,
  onNavigateToToken,
}: {
  path: string;
  value: string;
  onNavigateToToken?: (path: string) => void;
}) {
  const leafName = path.split('.').pop() ?? path;
  const cssVar = toCssVar(path);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  }, []);

  const navigate = () => onNavigateToToken?.(path);

  return (
    <div className="flex flex-col items-center gap-1 w-12 group relative">
      <button
        type="button"
        title={`${path}\n${value}\nClick to inspect`}
        aria-label={`Inspect ${path}`}
        onClick={navigate}
        className="w-12 h-12 rounded-md border border-black/10 shadow-sm cursor-pointer relative p-0"
        style={{ backgroundColor: `var(${cssVar}, ${value})` }}
      >
        {copied && (
          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-[#1a1a1a]/70 text-white text-[8px] font-medium">
            {copied}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={navigate}
        className="text-secondary text-center leading-tight truncate w-full cursor-pointer bg-transparent border-0 p-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
        title={`Inspect ${path}`}
      >
        {leafName}
      </button>
      <div className="absolute -top-1 -right-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <CopyMini onClick={() => handleCopy(`var(${cssVar})`, 'var')} label="Copy CSS variable" glyph="var" />
        <CopyMini onClick={() => handleCopy(value, 'value')} label="Copy value" glyph="val" />
      </div>
    </div>
  );
}

function GradientSwatch({
  path,
  value,
  onNavigateToToken,
}: {
  path: string;
  value: string;
  onNavigateToToken?: (path: string) => void;
}) {
  const leafName = path.split('.').pop() ?? path;
  const cssVar = toCssVar(path);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  }, []);

  const navigate = () => onNavigateToToken?.(path);

  return (
    <div className="flex flex-col items-center gap-1 w-20 group relative">
      <button
        type="button"
        onClick={navigate}
        title={`${path}\nClick to inspect`}
        aria-label={`Inspect ${path}`}
        className="w-20 h-12 rounded-md border border-black/10 shadow-sm cursor-pointer relative p-0"
        style={{ background: `var(${cssVar}, ${value})` }}
      >
        {copied && (
          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-[#1a1a1a]/70 text-white text-[8px] font-medium">
            {copied}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={navigate}
        className="text-secondary text-center leading-tight truncate w-full cursor-pointer bg-transparent border-0 p-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
        title={`Inspect ${path}`}
      >
        {leafName}
      </button>
      <div className="absolute -top-1 -right-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <CopyMini onClick={() => handleCopy(`var(${cssVar})`, 'var')} label="Copy CSS variable" glyph="var" />
        <CopyMini onClick={() => handleCopy(value, 'value')} label="Copy value" glyph="val" />
      </div>
    </div>
  );
}

// ─── Type scale ──────────────────────────────────────────────────────────────

interface TypeScaleEntry {
  path: string;
  entry: TokenMapEntry;
  fontWeightVar?: string;
  lineHeightVar?: string;
  letterSpacingVar?: string;
  fontFamilyVar?: string;
}

function TypeScaleTemplate({
  typeTokens,
  cssVars,
  onNavigateToToken,
}: {
  typeTokens: TypeScaleEntry[];
  cssVars: Record<string, string>;
  onNavigateToToken?: (path: string) => void;
}) {
  if (typeTokens.length === 0) {
    return (
      <div className="p-3 text-body text-[var(--color-figma-text-secondary)]">
        No fontSize tokens in this view.
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-3">
      {typeTokens.map(({ path, fontWeightVar, lineHeightVar, letterSpacingVar, fontFamilyVar }) => {
        const cssVarName = toCssVar(path);
        const resolvedSize = cssVars[cssVarName] ?? '16px';
        const leafName = path.split('.').pop() ?? path;

        const style: CSSProperties = { fontSize: `var(${cssVarName}, 16px)` };
        if (fontWeightVar) style.fontWeight = `var(${fontWeightVar})`;
        if (lineHeightVar) style.lineHeight = `var(${lineHeightVar})`;
        if (letterSpacingVar) style.letterSpacing = `var(${letterSpacingVar})`;
        if (fontFamilyVar) style.fontFamily = `var(${fontFamilyVar})`;

        const meta: string[] = [resolvedSize];
        if (fontWeightVar && cssVars[fontWeightVar]) meta.push(cssVars[fontWeightVar]);
        if (lineHeightVar && cssVars[lineHeightVar]) meta.push(`/${cssVars[lineHeightVar]}`);
        if (letterSpacingVar && cssVars[letterSpacingVar]) meta.push(`ls:${cssVars[letterSpacingVar]}`);
        if (fontFamilyVar && cssVars[fontFamilyVar]) meta.push(cssVars[fontFamilyVar]);

        return (
          <button
            key={path}
            type="button"
            onClick={() => onNavigateToToken?.(path)}
            title={`Inspect ${path}`}
            className="group flex items-baseline gap-3 overflow-hidden bg-transparent border-0 p-0 text-left cursor-pointer hover:bg-[var(--color-figma-bg-hover)] rounded px-1 -mx-1 transition-colors"
          >
            <span className="text-secondary w-24 shrink-0 text-right text-[var(--color-figma-text-tertiary)]">
              {meta.join(' ')}
            </span>
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-[var(--color-figma-text)]"
              style={style}
            >
              {leafName} — The quick brown fox
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Effects ─────────────────────────────────────────────────────────────────

function EffectsTemplate({
  shadows,
  timings,
  onNavigateToToken,
}: {
  shadows: { path: string; value: string }[];
  timings: { path: string; value: string; type: string }[];
  onNavigateToToken?: (path: string) => void;
}) {
  const hasContent = shadows.length > 0 || timings.length > 0;
  if (!hasContent) {
    return (
      <div className="p-3 text-body text-[var(--color-figma-text-secondary)]">
        No shadow, transition, or duration tokens in this view.
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-5">
      {shadows.length > 0 && (
        <div>
          <SectionLabel>Shadows</SectionLabel>
          <div className="flex flex-wrap gap-3">
            {shadows.map(({ path, value }) => (
              <ShadowSwatch key={path} path={path} value={value} onNavigateToToken={onNavigateToToken} />
            ))}
          </div>
        </div>
      )}
      {timings.length > 0 && (
        <div>
          <SectionLabel>Transitions &amp; durations</SectionLabel>
          <div className="flex flex-col gap-2">
            {timings.map(({ path, value, type }) => (
              <TransitionRow key={path} path={path} value={value} type={type} onNavigateToToken={onNavigateToToken} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ShadowSwatch({
  path,
  value,
  onNavigateToToken,
}: {
  path: string;
  value: string;
  onNavigateToToken?: (path: string) => void;
}) {
  const leafName = path.split('.').pop() ?? path;
  return (
    <button
      type="button"
      onClick={() => onNavigateToToken?.(path)}
      title={`${path}\n${value}\nClick to inspect`}
      className="group flex flex-col gap-2 p-3 rounded-lg border border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)] transition-colors cursor-pointer bg-transparent text-left"
    >
      <div className="flex items-center justify-center h-14">
        <div
          className="w-12 h-8 rounded-md bg-[var(--color-figma-bg-secondary)]"
          style={{ boxShadow: value }}
        />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-secondary font-medium truncate text-[var(--color-figma-text)]">{leafName}</div>
        <div className="text-secondary font-mono truncate text-[var(--color-figma-text-tertiary)]">{value}</div>
      </div>
    </button>
  );
}

function TransitionRow({
  path,
  value,
  type,
  onNavigateToToken,
}: {
  path: string;
  value: string;
  type: string;
  onNavigateToToken?: (path: string) => void;
}) {
  const leafName = path.split('.').pop() ?? path;
  const transitionValue = type === 'duration'
    ? `all ${value} ease`
    : type === 'cubicBezier'
    ? `all 0.3s cubic-bezier(${value})`
    : value;

  return (
    <button
      type="button"
      onClick={() => onNavigateToToken?.(path)}
      title={`Inspect ${path}`}
      className="group flex items-center gap-3 bg-transparent border-0 p-0 text-left cursor-pointer w-full"
    >
      <div className="w-28 shrink-0">
        <div className="text-secondary font-medium truncate text-[var(--color-figma-text)]">{leafName}</div>
        <div className="text-secondary font-mono truncate text-[var(--color-figma-text-tertiary)]">{value}</div>
        <div className="text-secondary text-[var(--color-figma-text-tertiary)]">{type}</div>
      </div>
      <div className="relative flex-1 h-8 overflow-hidden rounded border border-[var(--color-figma-border)]">
        <div
          className="absolute left-0 top-0 h-full w-6 rounded flex items-center justify-center bg-[var(--color-figma-accent)] text-white"
          style={{ transition: transitionValue }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.left = 'calc(100% - 24px)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.left = '0'; }}
          title="Hover to preview transition"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
}

// ─── Shared primitives ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-secondary font-medium mb-2 text-[var(--color-figma-text-secondary)]">
      {children}
    </div>
  );
}

function CopyMini({
  onClick,
  label,
  glyph,
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      title={label}
      aria-label={label}
      className="h-4 px-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[8px] font-mono font-medium text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)] shadow-sm"
    >
      {glyph}
    </button>
  );
}

