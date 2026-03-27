import { useMemo, useState } from 'react';
import type { TokenNode } from '../hooks/useTokens';
import type { TokenMapEntry } from '../../shared/types';
import { hexToHsl } from '../shared/colorUtils';
import { isAlias } from '../../shared/resolveAlias';
import { flattenLeafNodes } from './tokenListUtils';

interface TokenCanvasProps {
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  onEdit: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Dimension helpers
// ---------------------------------------------------------------------------

function dimToPx(val: unknown): number {
  if (!val || typeof val !== 'object') return 0;
  const v = val as { value?: number; unit?: string };
  const num = typeof v.value === 'number' ? v.value : 0;
  const unit = v.unit ?? 'px';
  if (unit === 'rem' || unit === 'em') return num * 16;
  return num;
}

function dimLabel(val: unknown): string {
  if (!val || typeof val !== 'object') return String(val ?? '');
  const v = val as { value?: number; unit?: string };
  return `${v.value ?? ''}${v.unit ?? ''}`;
}

// ---------------------------------------------------------------------------
// Canvas constants
// ---------------------------------------------------------------------------

const CANVAS_W = 272;
const CANVAS_H = 164;
const PADDING = 12;
const DOT_R = 5;
// Right strip for achromatic colors
const GRAY_STRIP_X = CANVAS_W - PADDING - 18;

// ---------------------------------------------------------------------------
// Section header / shared styles
// ---------------------------------------------------------------------------

const SEC = 'mb-5';
const SEC_HDR =
  'text-[9px] uppercase tracking-wider font-semibold text-[var(--color-figma-text-secondary)] mb-2 select-none flex items-center gap-1.5';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TokenCanvas({ tokens, allTokensFlat, onEdit }: TokenCanvasProps) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const leaves = useMemo(() => flattenLeafNodes(tokens), [tokens]);

  const byType = useMemo(() => {
    const map: Record<string, typeof leaves> = {};
    for (const leaf of leaves) {
      const t = leaf.$type ?? 'other';
      (map[t] ??= []).push(leaf);
    }
    return map;
  }, [leaves]);

  // -------------------------------------------------------------------------
  // Color section: place each color token at (hue, lightness) in 2D
  // -------------------------------------------------------------------------
  const colorData = useMemo(() => {
    const colors = byType['color'] ?? [];
    // Track tokens placed within each hue bucket to offset duplicates
    const bucketCounts: Record<number, number> = {};

    return colors.map(tok => {
      const raw = tok.$value;
      const resolved = allTokensFlat[tok.path];
      const hexRaw = resolved ? String(resolved.$value) : typeof raw === 'string' ? raw : '';
      const hsl = hexToHsl(hexRaw);

      let cx: number;
      let cy: number;

      if (!hsl || hsl.s < 8) {
        // Achromatic → gray strip on the right
        const lightness = hsl ? hsl.l : 50;
        cx = GRAY_STRIP_X + 4;
        cy = PADDING + ((100 - lightness) / 100) * (CANVAS_H - 2 * PADDING);
      } else {
        const { h: hue, l: lightness } = hsl;
        const bucket = Math.round(hue / 8) * 8;
        const idx = bucketCounts[bucket] ?? 0;
        bucketCounts[bucket] = idx + 1;
        // Offset overlapping dots horizontally within their bucket
        const xJitter = (idx % 3) * 2.5 - 2.5;
        cx = PADDING + (hue / 360) * (GRAY_STRIP_X - PADDING - 4) + xJitter;
        cy = PADDING + ((100 - lightness) / 100) * (CANVAS_H - 2 * PADDING);
      }

      return {
        path: tok.path,
        name: tok.name,
        hex: hexRaw || '#888888',
        cx,
        cy,
        isRef: isAlias(raw),
      };
    });
  }, [byType, allTokensFlat]);

  // -------------------------------------------------------------------------
  // Dimension section: horizontal scale ladder
  // -------------------------------------------------------------------------
  const dimData = useMemo(() => {
    const dims = byType['dimension'] ?? [];
    return dims
      .map(tok => ({ path: tok.path, name: tok.name, px: dimToPx(tok.$value), label: dimLabel(tok.$value) }))
      .sort((a, b) => a.px - b.px);
  }, [byType]);

  const maxDimPx = useMemo(
    () => Math.max(...dimData.map(d => d.px), 1),
    [dimData],
  );

  // -------------------------------------------------------------------------
  // Typography section
  // -------------------------------------------------------------------------
  const typData = byType['typography'] ?? [];

  // -------------------------------------------------------------------------
  // Other simple types
  // -------------------------------------------------------------------------
  const numberData = byType['number'] ?? [];
  const boolData = byType['boolean'] ?? [];
  const stringData = byType['string'] ?? [];

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  if (leaves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-figma-text-secondary)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="opacity-30">
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <line x1="8.5" y1="6" x2="15.5" y2="6" />
          <line x1="6" y1="8.5" x2="6" y2="15.5" />
          <line x1="18" y1="8.5" x2="18" y2="15.5" />
          <line x1="8.5" y1="18" x2="15.5" y2="18" />
        </svg>
        <p className="text-[11px] font-medium">No tokens to display</p>
        <p className="text-[10px] opacity-60 text-center max-w-[160px] leading-relaxed">Canvas view renders token relationships — add tokens to a set to see them here.</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Hover tooltip for color canvas
  // -------------------------------------------------------------------------
  const hoveredDot = hoveredPath ? colorData.find(c => c.path === hoveredPath) : null;

  return (
    <div className="overflow-auto flex-1 px-3 py-3">

      {/* ------------------------------------------------------------------ */}
      {/* Color canvas                                                         */}
      {/* ------------------------------------------------------------------ */}
      {colorData.length > 0 && (
        <div className={SEC}>
          <div className={SEC_HDR}>
            <span>Colors</span>
            <span className="text-[var(--color-figma-text-secondary)] opacity-50 font-normal normal-case">
              {colorData.length} — hue × lightness
            </span>
          </div>
          <div
            className="relative border border-[var(--color-figma-border)] rounded overflow-hidden bg-[var(--color-figma-bg-secondary)]"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            <svg
              width={CANVAS_W}
              height={CANVAS_H}
              className="block"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="tc-hue-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"    stopColor="hsl(0,60%,50%)"   stopOpacity="0.07" />
                  <stop offset="16.6%" stopColor="hsl(60,60%,50%)"  stopOpacity="0.07" />
                  <stop offset="33.3%" stopColor="hsl(120,60%,50%)" stopOpacity="0.07" />
                  <stop offset="50%"   stopColor="hsl(180,60%,50%)" stopOpacity="0.07" />
                  <stop offset="66.6%" stopColor="hsl(240,60%,50%)" stopOpacity="0.07" />
                  <stop offset="83.3%" stopColor="hsl(300,60%,50%)" stopOpacity="0.07" />
                  <stop offset="100%"  stopColor="hsl(360,60%,50%)" stopOpacity="0.07" />
                </linearGradient>
              </defs>

              {/* Background hue rainbow hint */}
              <rect x="0" y="0" width={GRAY_STRIP_X} height={CANVAS_H} fill="url(#tc-hue-grad)" />

              {/* Midpoint line (50% lightness) */}
              <line
                x1={PADDING} y1={CANVAS_H / 2}
                x2={GRAY_STRIP_X - 4} y2={CANVAS_H / 2}
                stroke="currentColor" strokeOpacity="0.06" strokeDasharray="3 4"
              />

              {/* Gray strip separator */}
              <line
                x1={GRAY_STRIP_X} y1={PADDING}
                x2={GRAY_STRIP_X} y2={CANVAS_H - PADDING}
                stroke="currentColor" strokeOpacity="0.1" strokeDasharray="2 2"
              />

              {/* Axis labels */}
              <text x={PADDING}      y={CANVAS_H - 3} fontSize="7" fill="currentColor" fillOpacity="0.25" textAnchor="start">0°</text>
              <text x={GRAY_STRIP_X} y={CANVAS_H - 3} fontSize="7" fill="currentColor" fillOpacity="0.25" textAnchor="end">360°</text>
              <text x={GRAY_STRIP_X + 9} y={CANVAS_H - 3} fontSize="7" fill="currentColor" fillOpacity="0.25" textAnchor="middle">⬜</text>
              <text x={PADDING - 2} y={PADDING + 4}        fontSize="7" fill="currentColor" fillOpacity="0.25" textAnchor="start">light</text>
              <text x={PADDING - 2} y={CANVAS_H - PADDING} fontSize="7" fill="currentColor" fillOpacity="0.25" textAnchor="start">dark</text>

              {/* Token dots */}
              {colorData.map(c => {
                const isHov = hoveredPath === c.path;
                const fillHex = c.hex.length >= 7 ? c.hex.slice(0, 7) : c.hex;
                return (
                  <g key={c.path} style={{ cursor: 'pointer' }} onClick={() => onEdit(c.path)}>
                    {/* Alias ring */}
                    {c.isRef && (
                      <circle
                        cx={c.cx} cy={c.cy}
                        r={DOT_R + 3}
                        fill="none"
                        stroke="rgba(255,255,255,0.45)"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    )}
                    {/* Color dot */}
                    <circle
                      cx={c.cx} cy={c.cy}
                      r={isHov ? DOT_R + 2 : DOT_R}
                      fill={fillHex}
                      stroke={isHov ? '#fff' : 'rgba(0,0,0,0.28)'}
                      strokeWidth={isHov ? 1.5 : 0.5}
                    />
                    {/* Invisible larger hit area */}
                    <circle
                      cx={c.cx} cy={c.cy}
                      r={DOT_R + 6}
                      fill="transparent"
                      onMouseEnter={() => setHoveredPath(c.path)}
                      onMouseLeave={() => setHoveredPath(null)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {hoveredDot && (
              <div
                className="absolute pointer-events-none bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1.5 py-1 text-[9px] text-[var(--color-figma-text)] shadow-md max-w-[150px]"
                style={{
                  left: Math.min(hoveredDot.cx + 10, CANVAS_W - 155),
                  top: Math.max(hoveredDot.cy - 30, 4),
                  zIndex: 10,
                }}
              >
                <div className="font-mono truncate font-medium">{hoveredDot.path}</div>
                <div className="opacity-50 font-mono">{hoveredDot.hex.slice(0, 7)}</div>
                {hoveredDot.isRef && (
                  <div className="opacity-60 italic mt-0.5">reference</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Dimension scale ladder                                               */}
      {/* ------------------------------------------------------------------ */}
      {dimData.length > 0 && (
        <div className={SEC}>
          <div className={SEC_HDR}>
            <span>Dimensions</span>
            <span className="text-[var(--color-figma-text-secondary)] opacity-50 font-normal normal-case">
              {dimData.length} — scale ladder
            </span>
          </div>
          <div className="space-y-0.5">
            {dimData.map(d => {
              const barW = Math.max(3, (d.px / maxDimPx) * (CANVAS_W - 72));
              return (
                <div
                  key={d.path}
                  className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-[var(--color-figma-bg-hover)] group"
                  onClick={() => onEdit(d.path)}
                >
                  <div
                    className="h-1.5 rounded-full bg-[var(--color-figma-accent)] shrink-0 opacity-60 group-hover:opacity-90 transition-opacity"
                    style={{ width: barW }}
                  />
                  <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate flex-1 group-hover:text-[var(--color-figma-text)] transition-colors">
                    {d.path}
                  </span>
                  <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] shrink-0">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Typography specimens                                                 */}
      {/* ------------------------------------------------------------------ */}
      {typData.length > 0 && (
        <div className={SEC}>
          <div className={SEC_HDR}>
            <span>Typography</span>
            <span className="text-[var(--color-figma-text-secondary)] opacity-50 font-normal normal-case">
              {typData.length} — type specimens
            </span>
          </div>
          <div className="border border-[var(--color-figma-border)] rounded divide-y divide-[var(--color-figma-border)]/50 overflow-hidden">
            {typData.map(tok => {
              const val = tok.$value && typeof tok.$value === 'object' ? (tok.$value as Record<string, unknown>) : {};
              const ff = String(val['fontFamily'] ?? 'inherit');
              const fsRaw = val['fontSize'];
              const fsPx = typeof fsRaw === 'object' && fsRaw !== null
                ? `${(fsRaw as { value?: number }).value ?? 14}px`
                : String(fsRaw ?? '14px');
              const fw = String(val['fontWeight'] ?? 'normal');
              const previewSize = Math.min(parseInt(fsPx) || 14, 22);
              return (
                <div
                  key={tok.path}
                  className="px-2 py-2 cursor-pointer hover:bg-[var(--color-figma-bg-hover)]"
                  onClick={() => onEdit(tok.path)}
                >
                  <div
                    className="text-[var(--color-figma-text)] mb-0.5"
                    style={{ fontFamily: ff, fontSize: previewSize, fontWeight: fw, lineHeight: 1.2 }}
                  >
                    Aa — The quick brown fox
                  </div>
                  <div className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                    {tok.path}
                  </div>
                  <div className="text-[8px] text-[var(--color-figma-text-secondary)] opacity-50 truncate mt-0.5">
                    {ff} · {fsPx} · {fw}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Number tokens                                                        */}
      {/* ------------------------------------------------------------------ */}
      {numberData.length > 0 && (
        <div className={SEC}>
          <div className={SEC_HDR}>
            <span>Numbers</span>
            <span className="text-[var(--color-figma-text-secondary)] opacity-50 font-normal normal-case">
              {numberData.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {numberData.map(tok => (
              <button
                key={tok.path}
                onClick={() => onEdit(tok.path)}
                title={tok.path}
                className="px-2 py-1 rounded border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/50 hover:bg-[var(--color-figma-bg-hover)] text-left transition-colors"
              >
                <div className="text-[11px] font-mono font-medium text-[var(--color-figma-text)]">
                  {String(tok.$value ?? '')}
                </div>
                <div className="text-[8px] font-mono text-[var(--color-figma-text-secondary)] truncate max-w-[80px]">
                  {tok.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Boolean tokens                                                       */}
      {/* ------------------------------------------------------------------ */}
      {boolData.length > 0 && (
        <div className={SEC}>
          <div className={SEC_HDR}>
            <span>Booleans</span>
            <span className="text-[var(--color-figma-text-secondary)] opacity-50 font-normal normal-case">
              {boolData.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {boolData.map(tok => (
              <button
                key={tok.path}
                onClick={() => onEdit(tok.path)}
                title={tok.path}
                className="px-2 py-1 rounded border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/50 hover:bg-[var(--color-figma-bg-hover)] text-left transition-colors"
              >
                <div className={`text-[11px] font-mono font-medium ${tok.$value ? 'text-green-500' : 'text-red-400'}`}>
                  {String(tok.$value ?? 'false')}
                </div>
                <div className="text-[8px] font-mono text-[var(--color-figma-text-secondary)] truncate max-w-[80px]">
                  {tok.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* String tokens                                                        */}
      {/* ------------------------------------------------------------------ */}
      {stringData.length > 0 && (
        <div className={SEC}>
          <div className={SEC_HDR}>
            <span>Strings</span>
            <span className="text-[var(--color-figma-text-secondary)] opacity-50 font-normal normal-case">
              {stringData.length}
            </span>
          </div>
          <div className="space-y-0.5">
            {stringData.map(tok => (
              <div
                key={tok.path}
                className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-[var(--color-figma-bg-hover)] group"
                onClick={() => onEdit(tok.path)}
              >
                <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate flex-1 group-hover:text-[var(--color-figma-text)]">
                  {tok.path}
                </span>
                <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate max-w-[120px]">
                  &ldquo;{String(tok.$value ?? '')}&rdquo;
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
