import { useRef, useCallback, useState } from 'react';
import type { TypeScaleConfig } from '../../hooks/useRecipes';

// ---------------------------------------------------------------------------
// Named ratio snap points
// ---------------------------------------------------------------------------

const NAMED_RATIOS: { value: number; label: string }[] = [
  { value: 1.067, label: 'Minor 2nd' },
  { value: 1.125, label: 'Major 2nd' },
  { value: 1.2,   label: 'Minor 3rd' },
  { value: 1.25,  label: 'Major 3rd' },
  { value: 1.333, label: 'Perf 4th' },
  { value: 1.5,   label: 'Perf 5th' },
  { value: 1.618, label: 'Golden' },
];

const SNAP_THRESHOLD = 0.015;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TypeScaleStaircaseEditorProps {
  config: TypeScaleConfig;
  sourceValue: number;
  onChange: (config: TypeScaleConfig) => void;
}

const W = 240;
const H = 140;
const PAD_L = 36;
const PAD_R = 44;
const PAD_T = 12;
const PAD_B = 8;
const GW = W - PAD_L - PAD_R;
const GH = H - PAD_T - PAD_B;

export function TypeScaleStaircaseEditor({ config, sourceValue, onChange }: TypeScaleStaircaseEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingStep, setDraggingStep] = useState<number | null>(null);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const [snapLabel, setSnapLabel] = useState<string | null>(null);

  const { steps, ratio, baseStep, roundTo, unit } = config;
  const baseStepDef = steps.find(s => s.name === baseStep);
  const baseExponent = baseStepDef?.exponent ?? 0;

  // Compute values for all steps
  const stepValues = steps.map(step => {
    const relExp = step.exponent - baseExponent;
    return sourceValue * Math.pow(ratio, relExp);
  });

  // Find max value for scaling
  const maxVal = Math.max(...stepValues, sourceValue * 2);
  const minVal = Math.min(...stepValues, sourceValue * 0.25);

  // Map value to y position (larger values at top)
  const valToY = (v: number) => PAD_T + GH - ((v - minVal) / (maxVal - minVal)) * GH;
  const yToVal = useCallback((y: number) => minVal + ((PAD_T + GH - y) / GH) * (maxVal - minVal), [minVal, maxVal]);

  // Bar layout
  const barHeight = Math.max(2, Math.min(12, GH / steps.length - 2));
  const barMaxW = GW * 0.85;

  const handlePointerDown = useCallback((stepIdx: number, e: React.PointerEvent) => {
    // Don't allow dragging the base step (exponent 0 doesn't change ratio)
    const step = steps[stepIdx];
    if (step.exponent === baseExponent) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingStep(stepIdx);
  }, [steps, baseExponent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingStep === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sy = (e.clientY - rect.top) * (H / rect.height);
    const desiredValue = yToVal(sy);
    if (desiredValue <= 0) return;

    const step = steps[draggingStep];
    const relExp = step.exponent - baseExponent;
    if (relExp === 0) return;

    // Solve: desiredValue = sourceValue * newRatio^relExp
    // newRatio = (desiredValue / sourceValue) ^ (1 / relExp)
    const rawRatio = Math.pow(desiredValue / sourceValue, 1 / relExp);
    if (!Number.isFinite(rawRatio) || rawRatio <= 1) return;

    // Check snap
    let finalRatio = Math.round(rawRatio * 1000) / 1000;
    let snap: string | null = null;
    for (const named of NAMED_RATIOS) {
      if (Math.abs(finalRatio - named.value) < SNAP_THRESHOLD) {
        finalRatio = named.value;
        snap = named.label;
        break;
      }
    }
    setSnapLabel(snap);

    onChange({ ...config, ratio: finalRatio });
  }, [draggingStep, steps, baseExponent, sourceValue, config, onChange, yToVal]);

  const handlePointerUp = useCallback(() => {
    setDraggingStep(null);
    setSnapLabel(null);
  }, []);

  // Exponential growth curve path
  const curvePoints: string[] = [];
  const curveSteps = 50;
  const minExp = Math.min(...steps.map(s => s.exponent - baseExponent));
  const maxExp = Math.max(...steps.map(s => s.exponent - baseExponent));
  for (let i = 0; i <= curveSteps; i++) {
    const frac = i / curveSteps;
    const exp = minExp + frac * (maxExp - minExp);
    const val = sourceValue * Math.pow(ratio, exp);
    const x = PAD_L + frac * GW;
    const y = valToY(val);
    curvePoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Scale staircase</span>
        <span className="text-[10px] text-[var(--color-figma-text)] font-medium">
          ratio: {ratio}
          {snapLabel && <span className="ml-1 text-[var(--color-figma-accent)]">({snapLabel})</span>}
        </span>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded select-none"
        style={{ cursor: draggingStep !== null ? 'ns-resize' : 'default', touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Base line */}
        <line
          x1={PAD_L} x2={PAD_L + GW}
          y1={valToY(sourceValue)} y2={valToY(sourceValue)}
          stroke="var(--color-figma-accent)" strokeWidth="0.5" strokeDasharray="4 2" opacity="0.4"
        />

        {/* Growth curve */}
        <path d={curvePoints.join(' ')} fill="none"
          stroke="var(--color-figma-text-secondary)" strokeWidth="1" opacity="0.2" />

        {/* Step bars */}
        {steps.map((step, i) => {
          const val = stepValues[i];
          const y = valToY(val);
          const isBase = step.exponent === baseExponent;
          const isDragging = draggingStep === i;
          const isHovered = hoveredStep === i;
          // Bar width proportional to value
          const bw = Math.max(8, (val / maxVal) * barMaxW);
          const formatted = parseFloat(val.toFixed(roundTo));

          return (
            <g key={step.name}>
              {/* Bar */}
              <rect
                x={PAD_L}
                y={y - barHeight / 2}
                width={bw}
                height={barHeight}
                rx={2}
                fill={isBase ? 'var(--color-figma-accent)' : (isDragging || isHovered) ? 'var(--color-figma-accent)' : 'var(--color-figma-text-secondary)'}
                opacity={isBase ? 0.8 : isDragging ? 0.7 : isHovered ? 0.6 : 0.3}
                style={{ cursor: isBase ? 'default' : 'ns-resize', transition: 'opacity 0.12s, fill 0.12s' }}
                onPointerDown={e => handlePointerDown(i, e)}
                onPointerEnter={() => !isBase && setHoveredStep(i)}
                onPointerLeave={() => setHoveredStep(null)}
              />
              {/* Step name label */}
              <text
                x={PAD_L - 4}
                y={y + 3}
                textAnchor="end"
                className="text-[8px]"
                fill={isBase ? 'var(--color-figma-accent)' : 'var(--color-figma-text-secondary)'}
                style={{ userSelect: 'none', fontWeight: isBase ? 600 : 400 }}
              >
                {step.name}
              </text>
              {/* Value label + inline Ag preview */}
              <text
                x={PAD_L + bw + 4}
                y={y + 3}
                textAnchor="start"
                className="text-[8px]"
                fill={isBase ? 'var(--color-figma-accent)' : 'var(--color-figma-text)'}
                style={{ userSelect: 'none' }}
              >
                {formatted}{unit}
              </text>
              {/* Live text size sample */}
              <foreignObject
                x={PAD_L + bw + 38}
                y={y - Math.max(4, Math.min(14, val * (unit === 'rem' ? 16 : 1) * 0.3))}
                width={40}
                height={Math.max(8, Math.min(28, val * (unit === 'rem' ? 16 : 1) * 0.6)) + 2}
                style={{ overflow: 'visible', pointerEvents: 'none' }}
              >
                <span
                  style={{
                    fontSize: `${Math.max(6, Math.min(22, val * (unit === 'rem' ? 16 : 1) * 0.45))}px`,
                    lineHeight: 1,
                    color: isBase ? 'var(--color-figma-accent)' : 'var(--color-figma-text)',
                    fontWeight: isBase ? 600 : 400,
                    userSelect: 'none',
                    display: 'block',
                    opacity: isDragging ? 1 : 0.6,
                  }}
                >
                  Ag
                </span>
              </foreignObject>
              {/* Drag hint arrows for non-base steps */}
              {!isBase && (
                <g opacity={isDragging ? 0.8 : isHovered ? 0.5 : 0} style={{ transition: 'opacity 0.15s' }}>
                  <path
                    d={`M ${PAD_L + bw / 2} ${y - barHeight / 2 - 6} l -3 4 h 6 z`}
                    fill="var(--color-figma-text-secondary)"
                  />
                  <path
                    d={`M ${PAD_L + bw / 2} ${y + barHeight / 2 + 6} l -3 -4 h 6 z`}
                    fill="var(--color-figma-text-secondary)"
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* Snap indicator */}
        {snapLabel && (
          <text x={W / 2} y={H - 2} textAnchor="middle"
            className="text-[8px] fill-[var(--color-figma-accent)]" style={{ userSelect: 'none' }}>
            Snapped to {snapLabel}
          </text>
        )}
      </svg>
      <div className="text-[8px] text-[var(--color-figma-text-secondary)] text-center">
        Drag steps to adjust ratio — base step ({baseStep}) is fixed
      </div>
    </div>
  );
}
