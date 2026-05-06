import { memo } from 'react';
import type { CubicBezierValue } from '@token-workshop/core';
import { AUTHORING } from '../../shared/editorClasses';
import { Field, Stack } from '../../primitives';
import { normalizeCubicBezierValue, type ValueChangeHandler } from './valueEditorShared';

const BEZIER_PRESETS: { label: string; value: CubicBezierValue }[] = [
  { label: 'linear', value: [0, 0, 1, 1] },
  { label: 'ease', value: [0.25, 0.1, 0.25, 1] },
  { label: 'ease-in', value: [0.42, 0, 1, 1] },
  { label: 'ease-out', value: [0, 0, 0.58, 1] },
  { label: 'ease-in-out', value: [0.42, 0, 0.58, 1] },
];

type CubicBezierEditorProps = {
  value: unknown;
  onChange: ValueChangeHandler<CubicBezierValue>;
};

export const CubicBezierEditor = memo(function CubicBezierEditor({ value, onChange }: CubicBezierEditorProps) {
  const pts = normalizeCubicBezierValue(value);

  const update = (idx: number, v: number) => {
    const next = [...pts] as CubicBezierValue;
    next[idx] = v;
    onChange(next);
  };

  const labels = ['x1', 'y1', 'x2', 'y2'];

  // SVG curve preview
  const w = 80, h = 80, pad = 8;
  const sx = (x: number) => pad + x * (w - 2 * pad);
  const sy = (y: number) => h - pad - y * (h - 2 * pad);

  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} align="end">
        <svg width={w} height={h} className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          <line x1={sx(0)} y1={sy(0)} x2={sx(pts[0])} y2={sy(pts[1])} stroke="var(--color-figma-text-tertiary)" strokeWidth="1" strokeDasharray="2,2" />
          <line x1={sx(1)} y1={sy(1)} x2={sx(pts[2])} y2={sy(pts[3])} stroke="var(--color-figma-text-tertiary)" strokeWidth="1" strokeDasharray="2,2" />
          <path
            d={`M ${sx(0)},${sy(0)} C ${sx(pts[0])},${sy(pts[1])} ${sx(pts[2])},${sy(pts[3])} ${sx(1)},${sy(1)}`}
            fill="none"
            stroke="var(--color-figma-accent)"
            strokeWidth="2"
          />
          <circle cx={sx(pts[0])} cy={sy(pts[1])} r="3" fill="var(--color-figma-accent)" />
          <circle cx={sx(pts[2])} cy={sy(pts[3])} r="3" fill="var(--color-figma-accent)" />
        </svg>
        <div className="flex-1 grid grid-cols-2 gap-1">
          {labels.map((label, i) => (
            <Field key={label} label={label}>
              <input
                type="number"
                step={0.01}
                min={i % 2 === 0 ? 0 : undefined}
                max={i % 2 === 0 ? 1 : undefined}
                value={pts[i]}
                onChange={e => update(i, parseFloat(e.target.value) || 0)}
                className={AUTHORING.input}
              />
            </Field>
          ))}
        </div>
      </Stack>
      <div className="flex flex-wrap gap-1">
        {BEZIER_PRESETS.map(p => {
          const active = p.value.every((v, i) => v === pts[i]);
          return (
            <button
              key={p.label}
              onClick={() => onChange([...p.value])}
              className={`px-2 py-0.5 rounded border text-secondary transition-colors ${active ? 'border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </Stack>
  );
});
