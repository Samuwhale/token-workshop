/**
 * Applied Preview — shows generated tokens applied to a mini UI composition.
 * Helps designers see how their tokens look in context.
 */
import { useState } from 'react';
import type { GeneratorType, GeneratedTokenResult } from '../../hooks/useGenerators';

// ---------------------------------------------------------------------------
// Color Ramp Applied Preview
// ---------------------------------------------------------------------------

function ColorRampApplied({ tokens }: { tokens: GeneratedTokenResult[] }) {
  // Build a palette from the generated color tokens
  const colors = tokens
    .filter(t => typeof t.value === 'string')
    .map(t => ({ step: String(t.stepName), hex: String(t.value) }));

  if (colors.length < 3) return null;

  // Pick semantic-ish colors: lightest for surface, mid for primary, darkest for text
  const surface = colors[0]?.hex ?? '#f8f9fa';
  const surfaceSubtle = colors[1]?.hex ?? '#f1f3f5';
  const primary = colors[Math.floor(colors.length * 0.5)]?.hex ?? '#3b82f6';
  const textDefault = colors[colors.length - 1]?.hex ?? '#111827';
  const textSubtle = colors[Math.floor(colors.length * 0.65)]?.hex ?? '#6b7280';
  const border = colors[Math.floor(colors.length * 0.2)]?.hex ?? '#e5e7eb';

  return (
    <div className="rounded-lg overflow-hidden border border-[var(--color-figma-border)]" style={{ background: surface }}>
      {/* Mini card */}
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex-none" style={{ background: primary }} />
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="text-[10px] font-semibold" style={{ color: textDefault }}>Card title</div>
            <div className="text-[8px]" style={{ color: textSubtle }}>Descriptive subtitle text</div>
          </div>
        </div>
        <div className="text-[8px] leading-relaxed" style={{ color: textSubtle }}>
          This preview shows your color scale applied to a simple card component.
        </div>
        <div className="h-px" style={{ background: border }} />
        <div className="flex items-center gap-1.5">
          <div className="px-2 py-0.5 rounded text-[8px] font-medium text-white" style={{ background: primary }}>
            Primary
          </div>
          <div className="px-2 py-0.5 rounded text-[8px] font-medium border" style={{ color: primary, borderColor: primary }}>
            Secondary
          </div>
          <div className="px-2 py-0.5 rounded text-[8px]" style={{ color: textSubtle, background: surfaceSubtle }}>
            Tertiary
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type Scale Applied Preview
// ---------------------------------------------------------------------------

function TypeScaleApplied({ tokens }: { tokens: GeneratedTokenResult[] }) {
  // Sort by value descending (largest first)
  const steps = tokens
    .map(t => {
      let size = 16;
      if (typeof t.value === 'number') size = t.value;
      else if (typeof t.value === 'object' && t.value !== null && 'value' in (t.value as Record<string, unknown>)) {
        size = Number((t.value as { value: number }).value) || 16;
      }
      return { step: String(t.stepName), size };
    })
    .sort((a, b) => b.size - a.size);

  if (steps.length < 2) return null;

  return (
    <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 flex flex-col gap-1.5">
      {steps.slice(0, 5).map((s, i) => {
        // Scale to fit: cap at 20px for preview
        const displaySize = Math.min(20, Math.max(8, s.size * 0.8));
        return (
          <div key={s.step} className="flex items-baseline gap-2">
            <span className="w-8 text-[8px] text-[var(--color-figma-text-secondary)] text-right shrink-0 font-mono">{s.step}</span>
            <span
              className="text-[var(--color-figma-text)] font-medium truncate"
              style={{ fontSize: `${displaySize}px`, lineHeight: 1.3 }}
            >
              {i === 0 ? 'Display heading' : i === 1 ? 'Page heading' : i === 2 ? 'Section heading' : i === 3 ? 'Body text' : 'Caption text'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spacing Applied Preview
// ---------------------------------------------------------------------------

function SpacingApplied({ tokens }: { tokens: GeneratedTokenResult[] }) {
  const steps = tokens.map(t => {
    let size = 4;
    if (typeof t.value === 'number') size = t.value;
    else if (typeof t.value === 'object' && t.value !== null && 'value' in (t.value as Record<string, unknown>)) {
      size = Number((t.value as { value: number }).value) || 4;
    }
    return { step: String(t.stepName), size };
  }).sort((a, b) => a.size - b.size);

  if (steps.length < 2) return null;

  return (
    <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 flex flex-col gap-1">
      {steps.slice(0, 6).map(s => {
        const barW = Math.min(100, Math.max(2, s.size * 2));
        return (
          <div key={s.step} className="flex items-center gap-2">
            <span className="w-8 text-[8px] text-[var(--color-figma-text-secondary)] text-right shrink-0 font-mono">{s.step}</span>
            <div
              className="h-2.5 rounded-sm bg-[var(--color-figma-accent)]/30"
              style={{ width: `${barW}%` }}
            />
            <span className="text-[8px] text-[var(--color-figma-text-secondary)] font-mono">{s.size}px</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AppliedPreview
// ---------------------------------------------------------------------------

export function AppliedPreview({ type, tokens }: { type: GeneratorType; tokens: GeneratedTokenResult[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tokens.length === 0) return null;

  const hasPreview = type === 'colorRamp' || type === 'typeScale' || type === 'spacingScale';
  if (!hasPreview) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors mb-1.5"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 100ms' }}
        >
          <path d="M2 1.5l3 2.5-3 2.5" />
        </svg>
        Applied preview
      </button>
      {expanded && (
        <div className="animate-in fade-in duration-150">
          {type === 'colorRamp' && <ColorRampApplied tokens={tokens} />}
          {type === 'typeScale' && <TypeScaleApplied tokens={tokens} />}
          {type === 'spacingScale' && <SpacingApplied tokens={tokens} />}
        </div>
      )}
    </div>
  );
}
