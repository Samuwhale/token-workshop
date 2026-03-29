import { useRef, useCallback, useState } from 'react';
import { labToHex, hexToLab } from '@tokenmanager/core';

// ---------------------------------------------------------------------------
// Bezier math (local copy — cannot import from @tokenmanager/core in plugin UI)
// ---------------------------------------------------------------------------

function evaluateCubicBezier(x: number, cx1: number, cy1: number, cx2: number, cy2: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const xAt = (t: number) => {
    const t1 = 1 - t;
    return 3 * t1 * t1 * t * cx1 + 3 * t1 * t * t * cx2 + t * t * t;
  };
  const dxAt = (t: number) => {
    const t1 = 1 - t;
    return 3 * t1 * t1 * cx1 + 6 * t1 * t * (cx2 - cx1) + 3 * t * t * (1 - cx2);
  };
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = xAt(t) - x;
    if (Math.abs(err) < 1e-7) break;
    const d = dxAt(t);
    if (Math.abs(d) < 1e-7) break;
    t -= err / d;
  }
  if (t < 0 || t > 1) {
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const val = xAt(t);
      if (Math.abs(val - x) < 1e-7) break;
      if (val < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
  }
  const t1 = 1 - t;
  return 3 * t1 * t1 * t * cy1 + 3 * t1 * t * t * cy2 + t * t * t;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const CURVE_PRESETS: { label: string; curve: [number, number, number, number] }[] = [
  { label: 'Linear', curve: [0, 0, 1, 1] },
  { label: 'Ease-in', curve: [0.42, 0, 1, 1] },
  { label: 'Ease-out', curve: [0, 0, 0.58, 1] },
  { label: 'Ease-in-out', curve: [0.42, 0, 0.58, 1] },
  { label: 'Spring', curve: [0.34, 1.56, 0.64, 1] },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BezierCurveEditorProps {
  curve: [number, number, number, number];
  lightEnd: number;
  darkEnd: number;
  stepCount: number;
  onChange: (curve: [number, number, number, number]) => void;
  /** Source color hex — when provided, renders a live color swatch strip. */
  sourceHex?: string;
  /** Chroma boost multiplier — used for live color swatch computation. */
  chromaBoost?: number;
}

const W = 240;
const H = 160;
const PAD = 24;
const GW = W - PAD * 2;
const GH = H - PAD * 2;

export function BezierCurveEditor({ curve, lightEnd, darkEnd, stepCount, onChange, sourceHex, chromaBoost = 1.0 }: BezierCurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);

  const [cx1, cy1, cx2, cy2] = curve;

  // Convert normalized coords to SVG coords (y is inverted: 0=bottom, 1=top)
  const toSvg = (nx: number, ny: number): [number, number] => [
    PAD + nx * GW,
    PAD + (1 - ny) * GH,
  ];

  const fromSvg = (sx: number, sy: number): [number, number] => [
    (sx - PAD) / GW,
    1 - (sy - PAD) / GH,
  ];

  const handlePointerDown = useCallback((idx: 0 | 1, e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(idx);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [nx, ny] = fromSvg(sx, sy);
    const clampedX = Math.max(0, Math.min(1, nx));
    // Allow y to go beyond 0..1 for overshoot/spring curves
    const clampedY = Math.max(-0.5, Math.min(1.8, ny));
    const newCurve: [number, number, number, number] = [...curve];
    if (dragging === 0) {
      newCurve[0] = Math.round(clampedX * 100) / 100;
      newCurve[1] = Math.round(clampedY * 100) / 100;
    } else {
      newCurve[2] = Math.round(clampedX * 100) / 100;
      newCurve[3] = Math.round(clampedY * 100) / 100;
    }
    onChange(newCurve);
  }, [dragging, curve, onChange]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Build the bezier path
  const [sx0, sy0] = toSvg(0, 0);
  const [scx1, scy1] = toSvg(cx1, cy1);
  const [scx2, scy2] = toSvg(cx2, cy2);
  const [sx1, sy1] = toSvg(1, 1);
  const curvePath = `M ${sx0},${sy0} C ${scx1},${scy1} ${scx2},${scy2} ${sx1},${sy1}`;

  // Sample dots along the curve for each step
  const stepDots: { sx: number; sy: number; lstar: number }[] = [];
  for (let i = 0; i < stepCount; i++) {
    const t = stepCount > 1 ? i / (stepCount - 1) : 0.5;
    const y = evaluateCubicBezier(t, cx1, cy1, cx2, cy2);
    const lstar = lightEnd - y * (lightEnd - darkEnd);
    const [dotX, dotY] = toSvg(t, y);
    stepDots.push({ sx: dotX, sy: dotY, lstar });
  }

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(v => {
    const [, y] = toSvg(0, v);
    return y;
  });

  // Compute live color swatches client-side (mirrors runColorRampGenerator logic)
  const sourceLab = sourceHex ? hexToLab(sourceHex) : null;
  const liveSwatches: string[] | null = sourceLab
    ? stepDots.map((dot, i) => {
        const t = stepCount > 1 ? i / (stepCount - 1) : 0.5;
        const L = dot.lstar;
        // Bell-shaped chroma factor: peaks around t≈0.4, tapers to near-zero at both ends
        const chromaFactor = Math.min(1, 4.5 * t * (1 - t) * 1.5) * chromaBoost;
        const a = sourceLab[1] * chromaFactor;
        const b = sourceLab[2] * chromaFactor;
        return labToHex(L, a, b);
      })
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Lightness curve</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {CURVE_PRESETS.map(p => {
          const isActive = p.curve.every((v, i) => Math.abs(v - curve[i]) < 0.01);
          return (
            <button
              key={p.label}
              onClick={() => onChange([...p.curve])}
              title={`cubic-bezier(${p.curve.join(', ')})`}
              className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                isActive
                  ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded select-none overflow-visible"
        style={{ cursor: dragging !== null ? 'grabbing' : 'default', touchAction: 'none', overflow: 'visible' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Grid lines */}
        {gridLines.map((y, i) => (
          <line key={i} x1={PAD} x2={PAD + GW} y1={y} y2={y}
            stroke="var(--color-figma-border)" strokeWidth="0.5" strokeDasharray={i === 0 || i === 4 ? 'none' : '2 2'} />
        ))}
        {/* Vertical grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => {
          const [x] = toSvg(v, 0);
          return <line key={i} x1={x} x2={x} y1={PAD} y2={PAD + GH}
            stroke="var(--color-figma-border)" strokeWidth="0.5" strokeDasharray={i === 0 || i === 4 ? 'none' : '2 2'} />;
        })}

        {/* Diagonal reference (linear) */}
        <line x1={sx0} y1={sy0} x2={sx1} y2={sy1}
          stroke="var(--color-figma-text-secondary)" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3" />

        {/* Control point handles */}
        <line x1={sx0} y1={sy0} x2={scx1} y2={scy1}
          stroke="var(--color-figma-accent)" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
        <line x1={sx1} y1={sy1} x2={scx2} y2={scy2}
          stroke="var(--color-figma-accent)" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />

        {/* The bezier curve */}
        <path d={curvePath} fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" />

        {/* Step dots */}
        {stepDots.map((dot, i) => (
          <g key={i}>
            <circle cx={dot.sx} cy={dot.sy} r="3"
              fill="var(--color-figma-bg)" stroke="var(--color-figma-accent)" strokeWidth="1.5" />
            {/* L* label for first, middle, last */}
            {(i === 0 || i === stepDots.length - 1 || i === Math.floor(stepDots.length / 2)) && (
              <text x={dot.sx} y={dot.sy - 6} textAnchor="middle"
                className="text-[7px] fill-[var(--color-figma-text-secondary)]" style={{ userSelect: 'none' }}>
                L*{Math.round(dot.lstar)}
              </text>
            )}
          </g>
        ))}

        {/* Draggable control points */}
        <circle cx={scx1} cy={scy1} r="6"
          fill="var(--color-figma-accent)" stroke="white" strokeWidth="1.5"
          style={{ cursor: 'grab' }}
          onPointerDown={e => handlePointerDown(0, e)} />
        <circle cx={scx2} cy={scy2} r="6"
          fill="var(--color-figma-accent)" stroke="white" strokeWidth="1.5"
          style={{ cursor: 'grab' }}
          onPointerDown={e => handlePointerDown(1, e)} />

        {/* Axis labels */}
        <text x={PAD - 2} y={PAD + GH + 2} textAnchor="end"
          className="text-[7px] fill-[var(--color-figma-text-secondary)]" style={{ userSelect: 'none' }}>
          L*{lightEnd}
        </text>
        <text x={PAD - 2} y={PAD + 4} textAnchor="end"
          className="text-[7px] fill-[var(--color-figma-text-secondary)]" style={{ userSelect: 'none' }}>
          L*{darkEnd}
        </text>
        <text x={PAD} y={H - 4} textAnchor="middle"
          className="text-[7px] fill-[var(--color-figma-text-secondary)]" style={{ userSelect: 'none' }}>
          Light
        </text>
        <text x={PAD + GW} y={H - 4} textAnchor="middle"
          className="text-[7px] fill-[var(--color-figma-text-secondary)]" style={{ userSelect: 'none' }}>
          Dark
        </text>
      </svg>
      {/* Live color swatch strip — computed client-side for instant feedback */}
      {liveSwatches && (
        <div className="flex gap-0 rounded overflow-hidden h-5" title="Live preview — drag curve to adjust">
          {liveSwatches.map((hex, i) => (
            <div
              key={i}
              className="flex-1 min-w-0"
              style={{ background: hex }}
              title={`Step ${i + 1}: ${hex}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
