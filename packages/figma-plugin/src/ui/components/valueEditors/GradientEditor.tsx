import { useState, useRef, memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { AUTHORING } from '../../shared/editorClasses';
import { AliasAutocomplete } from '../AliasAutocomplete';
import { ColorSwatchButton } from './ColorEditor';
import { StepperInput } from './DimensionEditor';

interface GradientStop {
  color: string;
  position: number;
}

function gradientStopColor(stop: GradientStop): string {
  return typeof stop.color === 'string' && !stop.color.startsWith('{') ? stop.color : '#aaaaaa';
}

function buildGradientCss(gradientType: string, stops: GradientStop[]): string {
  const parts = stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(s => `${gradientStopColor(s)} ${Math.round(s.position * 100)}%`)
    .join(', ');
  switch (gradientType) {
    case 'radial':
      return `radial-gradient(circle at center, ${parts})`;
    case 'angular':
      return `conic-gradient(from 0deg, ${parts})`;
    case 'diamond':
      // CSS has no diamond-gradient primitive. Use the closest supported preview.
      return `radial-gradient(circle at center, ${parts})`;
    case 'linear':
    default:
      return `linear-gradient(90deg, ${parts})`;
  }
}

function GradientStopMarker({ position, color, isSelected, onSelect, onMove, getBarPos }: {
  position: number;
  color: string;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (pos: number) => void;
  getBarPos: (clientX: number) => number;
}) {
  const draggingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    onMove(getBarPos(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize z-10"
      style={{ left: `${position * 100}%`, transform: 'translateX(-50%)' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={e => e.stopPropagation()}
    >
      {/* Caret pointing up into the gradient bar */}
      <div
        className="absolute"
        style={{
          top: -4,
          width: 6,
          height: 6,
          transform: 'rotate(45deg)',
          backgroundColor: isSelected ? 'var(--color-figma-accent)' : 'var(--color-figma-bg-secondary)',
          boxShadow: isSelected ? '0 0 0 1px var(--color-figma-accent)' : '0 0 0 1px var(--color-figma-text-tertiary)',
        }}
      />
      {/* Color swatch circle */}
      <div
        className="rounded-full"
        style={{
          width: 12,
          height: 12,
          backgroundColor: color,
          border: isSelected
            ? '2px solid var(--color-figma-accent)'
            : '2px solid var(--color-figma-text-secondary)',
          boxShadow: isSelected
            ? '0 0 0 1px var(--color-figma-accent), 0 1px 3px rgba(0,0,0,0.5)'
            : '0 1px 3px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
}

function GradientBar({ stops, selectedIdx, gradientType, onSelect, onMove, onAdd }: {
  stops: GradientStop[];
  selectedIdx: number;
  gradientType: string;
  onSelect: (idx: number) => void;
  onMove: (idx: number, newPos: number) => void;
  onAdd: (pos: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  const getBarPos = (clientX: number): number => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleBarPointerDown = (e: React.PointerEvent) => {
    const pos = getBarPos(e.clientX);
    // Select nearest stop if within 5% threshold, otherwise add
    let nearestIdx = -1;
    let nearestDist = Infinity;
    stops.forEach((s, i) => {
      const d = Math.abs(s.position - pos);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    });
    if (nearestDist < 0.05) {
      onSelect(nearestIdx);
    } else {
      onAdd(pos);
    }
  };

  const gradientCss = buildGradientCss(gradientType, stops);

  return (
    <div className="flex flex-col select-none">
      {/* Gradient preview bar — click to add stops */}
      <div
        ref={barRef}
        className="w-full rounded-t border-x border-t border-[var(--color-figma-border)] cursor-crosshair"
        style={{ height: 28, background: gradientCss }}
        onPointerDown={handleBarPointerDown}
        title="Click to add a stop"
      />
      {/* Stop markers strip */}
      <div
        className="relative w-full rounded-b border border-[var(--color-figma-border)] border-t-[var(--color-figma-border)] cursor-crosshair overflow-visible"
        style={{ height: 18, background: 'var(--color-figma-bg-secondary)' }}
        onPointerDown={handleBarPointerDown}
      >
        {stops.map((stop, idx) => (
          <GradientStopMarker
            key={idx}
            position={stop.position}
            color={gradientStopColor(stop)}
            isSelected={selectedIdx === idx}
            onSelect={() => onSelect(idx)}
            onMove={newPos => onMove(idx, newPos)}
            getBarPos={getBarPos}
          />
        ))}
      </div>
    </div>
  );
}

function GradientStopRow({ stop, isSelected, canRemove, allTokensFlat, pathToCollectionId, onSelect, onChange, onRemove }: {
  stop: GradientStop;
  isSelected: boolean;
  canRemove: boolean;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  onSelect: () => void;
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
    <div
      role="button"
      tabIndex={0}
      className={`flex items-start gap-1.5 rounded px-1 -mx-1 cursor-pointer transition-colors ${isSelected ? 'bg-[var(--color-figma-accent)]/10 ring-1 ring-[var(--color-figma-accent)]/30' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
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
              aria-label="Token value"
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
              className={AUTHORING.input}
            />
            {showAutocomplete && (
              <AliasAutocomplete
                query={aliasQuery}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
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
            <ColorSwatchButton
              color={stop.color || '#000000'}
              onChange={v => onChange({ color: v })}
            />
            <input
              type="text"
              value={stop.color || '#000000'}
              onChange={e => onChange({ color: e.target.value })}
              placeholder="#000000"
              className={AUTHORING.input + ' flex-1'}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={toggleAliasMode}
        title={aliasMode ? 'Switch to raw color' : 'Switch to reference mode'}
        aria-label={aliasMode ? 'Switch to raw color' : 'Switch to reference mode'}
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
          title="Remove color stop"
          aria-label="Remove color stop"
          className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
}

export const GradientEditor = memo(function GradientEditor({ value, onChange, allTokensFlat, pathToCollectionId }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToCollectionId: Record<string, string> }) {
  const stops: GradientStop[] = Array.isArray(value?.stops) && value.stops.length >= 2
    ? value.stops
    : [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }];
  const gradientType: string = value?.type || 'linear';
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeSelectedIdx = Math.min(selectedIdx, stops.length - 1);

  const updateStop = (idx: number, patch: Partial<GradientStop>) => {
    const next = stops.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...value, stops: next });
  };

  const addStop = (pos?: number) => {
    const newPos = pos ?? 0.5;
    const newStops = [...stops, { color: '#808080', position: newPos }];
    onChange({ ...value, stops: newStops });
    setSelectedIdx(newStops.length - 1);
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 2) return;
    const newStops = stops.filter((_, i) => i !== idx);
    onChange({ ...value, stops: newStops });
    setSelectedIdx(Math.min(idx, newStops.length - 1));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <div className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Type</div>
        <select
          value={gradientType}
          onChange={e => onChange({ ...value, type: e.target.value })}
          className={AUTHORING.input + ' flex-1'}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </div>
      <GradientBar
        stops={stops}
        selectedIdx={safeSelectedIdx}
        gradientType={gradientType}
        onSelect={setSelectedIdx}
        onMove={(idx, newPos) => updateStop(idx, { position: newPos })}
        onAdd={addStop}
      />
      <div className="text-secondary text-[var(--color-figma-text-secondary)]">Stops</div>
      {stops.map((stop, idx) => (
        <GradientStopRow
          key={idx}
          stop={stop}
          isSelected={idx === safeSelectedIdx}
          canRemove={stops.length > 2}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          onSelect={() => setSelectedIdx(idx)}
          onChange={patch => updateStop(idx, patch)}
          onRemove={() => removeStop(idx)}
        />
      ))}
      <button
        type="button"
        onClick={() => addStop()}
        className="text-secondary text-[var(--color-figma-accent)] hover:underline text-left"
      >
        + Add stop
      </button>
    </div>
  );
});
