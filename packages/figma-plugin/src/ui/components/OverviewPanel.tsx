import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';

interface OverviewPanelProps {
  tokens: Record<string, TokenMapEntry>;
  onNavigateToToken?: (path: string) => void;
}

function toCssVar(path: string): string {
  return `--${path.replace(/\./g, '-')}`;
}

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
  if ((type === 'dimension' || type === 'spacing' || type === 'borderRadius' || type === 'sizing')
      && /^-?\d+(\.\d+)?$/.test(resolved)) {
    return resolved + 'px';
  }
  return resolved;
}

const FONT_SIZE_TYPES = new Set(['fontSizes', 'fontSize', 'fontsize']);
const SHADOW_TYPES = new Set(['shadow', 'boxShadow', 'innerShadow']);
const TIMING_TYPES = new Set(['transition', 'animation', 'duration', 'cubicBezier']);
const SPACING_TYPES = new Set(['spacing']);
const SIZING_TYPES = new Set(['borderRadius', 'sizing', 'border']);
const OPACITY_TYPES = new Set(['opacity']);

export function OverviewPanel({ tokens, onNavigateToToken }: OverviewPanelProps) {
  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [path, entry] of Object.entries(tokens)) {
      vars[toCssVar(path)] = resolveValue(entry.$value, entry.$type ?? '');
    }
    return vars;
  }, [tokens]);

  const resolveAlias = useCallback(
    (value: string, visited = new Set<string>()): string | null => {
      const match = /^\{([^}]+)\}$/.exec(value);
      if (!match) return value;
      const refPath = match[1];
      if (visited.has(refPath)) return null;
      const target = tokens[refPath];
      if (!target) return null;
      const next = new Set([...visited, refPath]);
      return resolveAlias(String(target.$value ?? ''), next);
    },
    [tokens],
  );

  const {
    colorGroups,
    gradients,
    typographyTokens,
    spacingTokens,
    sizingTokens,
    shadows,
    timings,
    opacityTokens,
  } = useMemo(() => {
    const colorGroups: Record<string, { path: string; value: string }[]> = {};
    const gradients: { path: string; value: string }[] = [];
    const typographyTokens: TypographyEntry[] = [];
    const spacingTokens: { path: string; display: string }[] = [];
    const sizingTokens: { path: string; display: string }[] = [];
    const shadows: { path: string; value: string }[] = [];
    const timings: { path: string; value: string; type: string }[] = [];
    const opacityTokens: { path: string; value: number; display: string }[] = [];

    const entries = Object.entries(tokens);
    const byParent = new Map<string, Map<string, [string, TokenMapEntry]>>();
    for (const [path, entry] of entries) {
      const lastDot = path.lastIndexOf('.');
      if (lastDot === -1) continue;
      const parent = path.slice(0, lastDot);
      const leaf = path.slice(lastDot + 1);
      if (!byParent.has(parent)) byParent.set(parent, new Map());
      byParent.get(parent)!.set(leaf, [path, entry]);
    }

    const findTypeSibling = (path: string, types: string[]): string | undefined => {
      const lastDot = path.lastIndexOf('.');
      const parent = lastDot !== -1 ? path.slice(0, lastDot) : '';
      const siblings = byParent.get(parent);
      if (!siblings) return undefined;
      for (const [, [sibPath, sibEntry]] of siblings) {
        if (sibPath === path) continue;
        if (types.some(t => sibEntry.$type === t)) return toCssVar(sibPath);
      }
      return undefined;
    };

    for (const [path, entry] of entries) {
      const type = entry.$type ?? '';
      const raw = String(entry.$value ?? '');

      if (type === 'color') {
        const resolved = /^\{[^}]+\}$/.test(raw) ? resolveAlias(raw) : raw;
        if (!resolved) continue;
        const prefix = path.split('.')[0];
        (colorGroups[prefix] ??= []).push({ path, value: resolved });
        continue;
      }

      if (type === 'gradient') {
        const resolved = /^\{[^}]+\}$/.test(raw) ? resolveAlias(raw) : raw;
        if (!resolved) continue;
        gradients.push({ path, value: resolved });
        continue;
      }

      if (type === 'typography') {
        const composite = entry.$value as Record<string, unknown> | undefined;
        typographyTokens.push({
          path,
          kind: 'composite',
          fontSizeCss: composite && 'fontSize' in composite
            ? formatTypographyField(composite.fontSize)
            : undefined,
          fontWeight: composite && 'fontWeight' in composite
            ? String(composite.fontWeight ?? '')
            : undefined,
          lineHeight: composite && 'lineHeight' in composite
            ? formatTypographyField(composite.lineHeight)
            : undefined,
          letterSpacing: composite && 'letterSpacing' in composite
            ? formatTypographyField(composite.letterSpacing)
            : undefined,
          fontFamily: composite && 'fontFamily' in composite
            ? String(composite.fontFamily ?? '')
            : undefined,
        });
        continue;
      }

      if (FONT_SIZE_TYPES.has(type)) {
        typographyTokens.push({
          path,
          kind: 'fontSize',
          fontSizeVar: toCssVar(path),
          fontWeightVar: findTypeSibling(path, ['fontWeights', 'fontWeight', 'fontweight']),
          lineHeightVar: findTypeSibling(path, ['lineHeights', 'lineHeight', 'lineheight']),
          letterSpacingVar: findTypeSibling(path, ['letterSpacing', 'letterspacing']),
          fontFamilyVar: findTypeSibling(path, ['fontFamilies', 'fontFamily', 'fontfamily']),
        });
        continue;
      }

      if (SHADOW_TYPES.has(type)) {
        const resolved = resolveValue(entry.$value, type);
        if (resolved) shadows.push({ path, value: resolved });
        continue;
      }

      if (TIMING_TYPES.has(type)) {
        const resolved = /^\{[^}]+\}$/.test(raw) ? resolveAlias(raw) : raw;
        if (resolved) timings.push({ path, value: resolved, type });
        continue;
      }

      if (SPACING_TYPES.has(type)) {
        spacingTokens.push({ path, display: resolveValue(entry.$value, type) });
        continue;
      }

      if (SIZING_TYPES.has(type)) {
        sizingTokens.push({ path, display: resolveValue(entry.$value, type) });
        continue;
      }

      if (OPACITY_TYPES.has(type)) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          opacityTokens.push({ path, value: n, display: resolveValue(entry.$value, type) });
        }
        continue;
      }
    }

    typographyTokens.sort((a, b) => a.path.localeCompare(b.path));
    spacingTokens.sort((a, b) => compareNumericLeaf(a.path, b.path));
    sizingTokens.sort((a, b) => compareNumericLeaf(a.path, b.path));
    opacityTokens.sort((a, b) => a.value - b.value);

    return {
      colorGroups,
      gradients,
      typographyTokens,
      spacingTokens,
      sizingTokens,
      shadows,
      timings,
      opacityTokens,
    };
  }, [tokens, resolveAlias]);

  const hasAny =
    Object.keys(colorGroups).length > 0 ||
    gradients.length > 0 ||
    typographyTokens.length > 0 ||
    spacingTokens.length > 0 ||
    sizingTokens.length > 0 ||
    shadows.length > 0 ||
    timings.length > 0 ||
    opacityTokens.length > 0;

  return (
    <div className="flex flex-col h-full bg-[var(--color-figma-bg)] overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        {!hasAny ? (
          <EmptyOverview />
        ) : (
          <div style={cssVars as CSSProperties} className="flex flex-col gap-5">
            {Object.entries(colorGroups).map(([group, list]) => (
              <ColorGroup
                key={group}
                group={group}
                tokens={list}
                onNavigateToToken={onNavigateToToken}
              />
            ))}
            {gradients.length > 0 && (
              <Section label="Gradients">
                <div className="flex flex-wrap gap-1.5">
                  {gradients.map(({ path, value }) => (
                    <GradientSwatch
                      key={path}
                      path={path}
                      value={value}
                      onNavigateToToken={onNavigateToToken}
                    />
                  ))}
                </div>
              </Section>
            )}
            {typographyTokens.length > 0 && (
              <Section label="Typography">
                <div className="flex flex-col gap-3">
                  {typographyTokens.map((entry) => (
                    <TypographyRow
                      key={entry.path}
                      entry={entry}
                      cssVars={cssVars}
                      onNavigateToToken={onNavigateToToken}
                    />
                  ))}
                </div>
              </Section>
            )}
            {spacingTokens.length > 0 && (
              <Section label="Spacing">
                <DimensionScale tokens={spacingTokens} onNavigateToToken={onNavigateToToken} />
              </Section>
            )}
            {sizingTokens.length > 0 && (
              <Section label="Radius & sizing">
                <DimensionScale tokens={sizingTokens} onNavigateToToken={onNavigateToToken} />
              </Section>
            )}
            {shadows.length > 0 && (
              <Section label="Shadows">
                <div className="flex flex-wrap gap-3">
                  {shadows.map(({ path, value }) => (
                    <ShadowSwatch
                      key={path}
                      path={path}
                      value={value}
                      onNavigateToToken={onNavigateToToken}
                    />
                  ))}
                </div>
              </Section>
            )}
            {timings.length > 0 && (
              <Section label="Motion">
                <div className="flex flex-col gap-2">
                  {timings.map(({ path, value, type }) => (
                    <TransitionRow
                      key={path}
                      path={path}
                      value={value}
                      type={type}
                      onNavigateToToken={onNavigateToToken}
                    />
                  ))}
                </div>
              </Section>
            )}
            {opacityTokens.length > 0 && (
              <Section label="Opacity">
                <div className="flex flex-wrap gap-2">
                  {opacityTokens.map(({ path, value, display }) => (
                    <OpacitySwatch
                      key={path}
                      path={path}
                      value={value}
                      display={display}
                      onNavigateToToken={onNavigateToToken}
                    />
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function compareNumericLeaf(a: string, b: string): number {
  const an = parseFloat(a.split('.').pop() ?? '0');
  const bn = parseFloat(b.split('.').pop() ?? '0');
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return a.localeCompare(b);
}

function formatTypographyField(field: unknown): string | undefined {
  if (field == null) return undefined;
  if (typeof field === 'object') {
    const formatted = formatCompositeValue(field as Record<string, unknown>);
    return formatted ?? undefined;
  }
  return String(field);
}

// ─── Sections ────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-secondary font-medium mb-2 text-[var(--color-figma-text-secondary)]">
      {children}
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
      <p className="text-body text-center max-w-[240px]">
        Add tokens to this collection to see a visual overview.
      </p>
    </div>
  );
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const SWATCHES_COLLAPSED = 24;

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
  return (
    <TokenTile
      path={path}
      cssVar={cssVar}
      rawValue={value}
      leafName={leafName}
      onNavigateToToken={onNavigateToToken}
      width={48}
    >
      <button
        type="button"
        onClick={() => onNavigateToToken?.(path)}
        title={`${path}\n${value}`}
        aria-label={`Inspect ${path}`}
        className="w-12 h-12 rounded-md border border-black/10 shadow-sm cursor-pointer relative p-0"
        style={{ backgroundColor: `var(${cssVar}, ${value})` }}
      />
    </TokenTile>
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
  return (
    <TokenTile
      path={path}
      cssVar={cssVar}
      rawValue={value}
      leafName={leafName}
      onNavigateToToken={onNavigateToToken}
      width={80}
    >
      <button
        type="button"
        onClick={() => onNavigateToToken?.(path)}
        title={`${path}\n${value}`}
        aria-label={`Inspect ${path}`}
        className="w-20 h-12 rounded-md border border-black/10 shadow-sm cursor-pointer relative p-0"
        style={{ background: `var(${cssVar}, ${value})` }}
      />
    </TokenTile>
  );
}

// ─── Typography ──────────────────────────────────────────────────────────────

type TypographyEntry =
  | {
      path: string;
      kind: 'fontSize';
      fontSizeVar: string;
      fontWeightVar?: string;
      lineHeightVar?: string;
      letterSpacingVar?: string;
      fontFamilyVar?: string;
    }
  | {
      path: string;
      kind: 'composite';
      fontSizeCss?: string;
      fontWeight?: string;
      lineHeight?: string;
      letterSpacing?: string;
      fontFamily?: string;
    };

function TypographyRow({
  entry,
  cssVars,
  onNavigateToToken,
}: {
  entry: TypographyEntry;
  cssVars: Record<string, string>;
  onNavigateToToken?: (path: string) => void;
}) {
  const leafName = entry.path.split('.').pop() ?? entry.path;
  const cssVar = toCssVar(entry.path);

  let style: CSSProperties;
  const meta: string[] = [];
  if (entry.kind === 'fontSize') {
    style = { fontSize: `var(${entry.fontSizeVar}, 16px)` };
    if (entry.fontWeightVar) style.fontWeight = `var(${entry.fontWeightVar})`;
    if (entry.lineHeightVar) style.lineHeight = `var(${entry.lineHeightVar})`;
    if (entry.letterSpacingVar) style.letterSpacing = `var(${entry.letterSpacingVar})`;
    if (entry.fontFamilyVar) style.fontFamily = `var(${entry.fontFamilyVar})`;
    meta.push(cssVars[entry.fontSizeVar] ?? '16px');
    if (entry.fontWeightVar && cssVars[entry.fontWeightVar]) meta.push(cssVars[entry.fontWeightVar]);
    if (entry.lineHeightVar && cssVars[entry.lineHeightVar]) meta.push(`/${cssVars[entry.lineHeightVar]}`);
    if (entry.fontFamilyVar && cssVars[entry.fontFamilyVar]) meta.push(cssVars[entry.fontFamilyVar]);
  } else {
    style = {};
    if (entry.fontSizeCss) style.fontSize = entry.fontSizeCss;
    if (entry.fontWeight) style.fontWeight = entry.fontWeight;
    if (entry.lineHeight) style.lineHeight = entry.lineHeight;
    if (entry.letterSpacing) style.letterSpacing = entry.letterSpacing;
    if (entry.fontFamily) style.fontFamily = entry.fontFamily;
    if (entry.fontSizeCss) meta.push(entry.fontSizeCss);
    if (entry.fontWeight) meta.push(entry.fontWeight);
    if (entry.lineHeight) meta.push(`/${entry.lineHeight}`);
    if (entry.fontFamily) meta.push(entry.fontFamily);
  }

  return (
    <div className="group flex items-baseline gap-3 overflow-hidden">
      <button
        type="button"
        onClick={() => onNavigateToToken?.(entry.path)}
        title={`Inspect ${entry.path}`}
        className="flex-1 min-w-0 flex items-baseline gap-3 bg-transparent border-0 p-0 text-left cursor-pointer hover:bg-[var(--color-figma-bg-hover)] rounded px-1 -mx-1 transition-colors"
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
      <CopyCluster cssVar={cssVar} rawValue={meta.join(' ')} />
    </div>
  );
}

// ─── Dimension / spacing / sizing ────────────────────────────────────────────

function DimensionScale({
  tokens,
  onNavigateToToken,
}: {
  tokens: { path: string; display: string }[];
  onNavigateToToken?: (path: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {tokens.map(({ path, display }) => {
        const leafName = path.split('.').pop() ?? path;
        const cssVar = toCssVar(path);
        const numeric = parseFloat(display);
        const barWidth = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 320) : 0;
        return (
          <div key={path} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateToToken?.(path)}
              title={`Inspect ${path}`}
              className="flex-1 min-w-0 flex items-center gap-2 px-1 -mx-1 py-1 rounded hover:bg-[var(--color-figma-bg-hover)] transition-colors bg-transparent border-0 text-left cursor-pointer"
            >
              <span className="w-28 shrink-0 truncate text-body text-[var(--color-figma-text)]">
                {leafName}
              </span>
              <span
                className="h-2 rounded bg-[var(--color-figma-accent)]"
                style={{ width: `${barWidth}px` }}
                aria-hidden
              />
              <span className="text-secondary font-mono text-[var(--color-figma-text-tertiary)]">
                {display}
              </span>
            </button>
            <CopyCluster cssVar={cssVar} rawValue={display} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Shadows ─────────────────────────────────────────────────────────────────

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
  const cssVar = toCssVar(path);
  return (
    <div className="group relative flex flex-col gap-2 p-3 rounded-lg border border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)] transition-colors">
      <button
        type="button"
        onClick={() => onNavigateToToken?.(path)}
        title={`${path}\n${value}`}
        aria-label={`Inspect ${path}`}
        className="flex items-center justify-center h-14 bg-transparent border-0 p-0 cursor-pointer"
      >
        <div
          className="w-12 h-8 rounded-md bg-[var(--color-figma-bg-secondary)]"
          style={{ boxShadow: value }}
        />
      </button>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-secondary font-medium truncate text-[var(--color-figma-text)]">{leafName}</div>
        <div className="text-secondary font-mono truncate text-[var(--color-figma-text-tertiary)]">{value}</div>
      </div>
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <CopyCluster cssVar={cssVar} rawValue={value} />
      </div>
    </div>
  );
}

// ─── Motion ──────────────────────────────────────────────────────────────────

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
  const cssVar = toCssVar(path);
  const transitionValue = type === 'duration'
    ? `all ${value} ease`
    : type === 'cubicBezier'
    ? `all 0.3s cubic-bezier(${value})`
    : value;
  const [hovered, setHovered] = useState(false);

  return (
    <div className="group flex items-center gap-3">
      <button
        type="button"
        onClick={() => onNavigateToToken?.(path)}
        title={`Inspect ${path}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex-1 min-w-0 flex items-center gap-3 bg-transparent border-0 p-0 text-left cursor-pointer"
      >
        <div className="w-28 shrink-0">
          <div className="text-secondary font-medium truncate text-[var(--color-figma-text)]">{leafName}</div>
          <div className="text-secondary font-mono truncate text-[var(--color-figma-text-tertiary)]">{value}</div>
          <div className="text-secondary text-[var(--color-figma-text-tertiary)]">{type}</div>
        </div>
        <div className="relative flex-1 h-8 overflow-hidden rounded border border-[var(--color-figma-border)]">
          <div
            className="absolute top-0 h-full w-6 rounded flex items-center justify-center bg-[var(--color-figma-accent)] text-white"
            style={{
              transition: transitionValue,
              left: hovered ? 'calc(100% - 24px)' : '0',
            }}
            aria-hidden
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>
      <CopyCluster cssVar={cssVar} rawValue={value} />
    </div>
  );
}

// ─── Opacity ─────────────────────────────────────────────────────────────────

function OpacitySwatch({
  path,
  value,
  display,
  onNavigateToToken,
}: {
  path: string;
  value: number;
  display: string;
  onNavigateToToken?: (path: string) => void;
}) {
  const leafName = path.split('.').pop() ?? path;
  const cssVar = toCssVar(path);
  return (
    <TokenTile
      path={path}
      cssVar={cssVar}
      rawValue={display}
      leafName={leafName}
      onNavigateToToken={onNavigateToToken}
      width={48}
    >
      <button
        type="button"
        onClick={() => onNavigateToToken?.(path)}
        title={`${path}\n${display}`}
        aria-label={`Inspect ${path}`}
        className="w-12 h-12 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-text)] cursor-pointer relative p-0"
        style={{ opacity: value }}
      />
    </TokenTile>
  );
}

// ─── Shared primitives ───────────────────────────────────────────────────────

function TokenTile({
  path,
  cssVar,
  rawValue,
  leafName,
  onNavigateToToken,
  width,
  children,
}: {
  path: string;
  cssVar: string;
  rawValue: string;
  leafName: string;
  onNavigateToToken?: (path: string) => void;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 group relative" style={{ width }}>
      {children}
      <button
        type="button"
        onClick={() => onNavigateToToken?.(path)}
        className="text-secondary text-center leading-tight truncate w-full cursor-pointer bg-transparent border-0 p-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
        title={`Inspect ${path}`}
      >
        {leafName}
      </button>
      <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <CopyCluster cssVar={cssVar} rawValue={rawValue} />
      </div>
    </div>
  );
}

function CopyCluster({ cssVar, rawValue }: { cssVar: string; rawValue: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  }, []);
  return (
    <div className="flex flex-col gap-0.5 relative">
      <CopyMini onClick={() => copy(`var(${cssVar})`, 'var')} label="Copy CSS variable" glyph="var" active={copied === 'var'} />
      <CopyMini onClick={() => copy(rawValue, 'val')} label="Copy value" glyph="val" active={copied === 'val'} />
    </div>
  );
}

function CopyMini({
  onClick,
  label,
  glyph,
  active,
}: {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  glyph: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      title={label}
      aria-label={label}
      className={`h-4 px-1 rounded border text-[8px] font-mono font-medium shadow-sm transition-colors ${
        active
          ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]'
          : 'bg-[var(--color-figma-bg-secondary)] border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)]'
      }`}
    >
      {active ? 'ok' : glyph}
    </button>
  );
}
