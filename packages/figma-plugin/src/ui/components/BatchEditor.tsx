import { useState, useMemo } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';

interface BatchEditorProps {
  selectedPaths: Set<string>;
  allTokensFlat: Record<string, TokenMapEntry>;
  setName: string;
  serverUrl: string;
  connected: boolean;
  onApply: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

/** Set the alpha channel on a hex color string. Handles both #RRGGBB and #RRGGBBAA. */
function applyColorOpacity(colorValue: unknown, opacityPercent: number): string | null {
  if (typeof colorValue !== 'string') return null;
  const hex = colorValue.replace('#', '');
  if (hex.length !== 6 && hex.length !== 8) return null;
  const rgb = hex.slice(0, 6);
  const alphaHex = Math.round(Math.max(0, Math.min(100, opacityPercent)) / 100 * 255)
    .toString(16).padStart(2, '0');
  // Only append alpha if it would change anything (skip ff for fully opaque)
  if (alphaHex === 'ff' && hex.length === 6) return `#${rgb}`;
  return `#${rgb}${alphaHex}`;
}

/** Scale a dimension or number value by a factor. */
function scaleValue(value: unknown, factor: number): unknown {
  if (typeof value === 'number') {
    return parseFloat((value * factor).toFixed(6));
  }
  if (typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) {
    const dim = value as { value: number; unit: string };
    return { value: parseFloat((dim.value * factor).toFixed(6)), unit: dim.unit };
  }
  if (typeof value === 'string') {
    const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (match) {
      const scaled = parseFloat(match[1]) * factor;
      return `${parseFloat(scaled.toFixed(6))}${match[2]}`;
    }
  }
  return null;
}

export function BatchEditor({
  selectedPaths,
  allTokensFlat,
  setName,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchEditorProps) {
  const [description, setDescription] = useState('');
  const [opacityPct, setOpacityPct] = useState('');
  const [scaleFactor, setScaleFactor] = useState('');
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const selectedEntries = useMemo(() => (
    [...selectedPaths]
      .map(p => ({ path: p, entry: allTokensFlat[p] }))
      .filter((x): x is { path: string; entry: TokenMapEntry } => x.entry != null)
  ), [selectedPaths, allTokensFlat]);

  const allColors = useMemo(() =>
    selectedEntries.length > 0 && selectedEntries.every(x => x.entry.$type === 'color'),
    [selectedEntries]
  );

  const allScalable = useMemo(() =>
    selectedEntries.length > 0 &&
    selectedEntries.every(x => x.entry.$type === 'dimension' || x.entry.$type === 'number'),
    [selectedEntries]
  );

  const hasOp = description.trim() !== '' ||
    (allColors && opacityPct !== '' && !isNaN(parseFloat(opacityPct))) ||
    (allScalable && scaleFactor !== '' && !isNaN(parseFloat(scaleFactor)) && parseFloat(scaleFactor) > 0);

  const handleApply = async () => {
    if (!connected || applying || !hasOp) return;

    type Op = { path: string; patch: Record<string, unknown>; oldEntry: TokenMapEntry };
    const ops: Op[] = [];

    for (const { path, entry } of selectedEntries) {
      const patch: Record<string, unknown> = {};

      if (description.trim()) {
        patch.$description = description.trim();
      }

      if (allColors && opacityPct !== '') {
        const pct = parseFloat(opacityPct);
        if (!isNaN(pct)) {
          const newColor = applyColorOpacity(entry.$value, pct);
          if (newColor !== null) {
            patch.$value = newColor;
            patch.$type = entry.$type;
          }
        }
      }

      if (allScalable && scaleFactor !== '') {
        const factor = parseFloat(scaleFactor);
        if (!isNaN(factor) && factor > 0) {
          const scaled = scaleValue(entry.$value, factor);
          if (scaled !== null) {
            patch.$value = scaled;
            patch.$type = entry.$type;
          }
        }
      }

      if (Object.keys(patch).length > 0) {
        ops.push({ path, patch, oldEntry: entry });
      }
    }

    if (ops.length === 0) return;

    setApplying(true);
    setFeedback(null);

    const patchToken = async (path: string, body: Record<string, unknown>) => {
      const encoded = path.split('.').map(encodeURIComponent).join('/');
      await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encoded}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    try {
      await Promise.all(ops.map(({ path, patch }) => patchToken(path, patch)));

      if (onPushUndo) {
        onPushUndo({
          description: `Batch edit ${ops.length} token${ops.length === 1 ? '' : 's'}`,
          restore: async () => {
            await Promise.all(ops.map(({ path, oldEntry }) =>
              patchToken(path, { $type: oldEntry.$type, $value: oldEntry.$value })
            ));
            onApply();
          },
          redo: async () => {
            await Promise.all(ops.map(({ path, patch }) => patchToken(path, patch)));
            onApply();
          },
        });
      }

      setFeedback({ ok: true, msg: `Applied to ${ops.length} token${ops.length === 1 ? '' : 's'}` });
      setDescription('');
      setOpacityPct('');
      setScaleFactor('');
      onApply();
    } catch {
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="px-2 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] space-y-1.5">
      {/* Description */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Description</span>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleApply(); }}
          placeholder="Set on all selected…"
          className="flex-1 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
        />
      </div>

      {/* Opacity — only when all selected tokens are colors */}
      {allColors && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Opacity %</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={opacityPct === '' ? '' : Math.round(parseFloat(opacityPct))}
            onChange={e => setOpacityPct(e.target.value)}
            className="flex-1 accent-[var(--color-figma-accent)]"
          />
          <input
            type="number"
            min="0"
            max="100"
            value={opacityPct}
            onChange={e => setOpacityPct(e.target.value)}
            placeholder="—"
            className="w-12 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)] text-right"
          />
        </div>
      )}

      {/* Scale — only when all selected tokens are dimension or number */}
      {allScalable && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Multiply by</span>
          <input
            type="number"
            min="0.001"
            step="0.1"
            value={scaleFactor}
            onChange={e => setScaleFactor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleApply(); }}
            placeholder="e.g. 1.5"
            className={`w-24 h-6 px-1.5 rounded border bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none ${
              scaleFactor !== '' && (isNaN(parseFloat(scaleFactor)) || parseFloat(scaleFactor) <= 0)
                ? 'border-[var(--color-figma-error)] focus:border-[var(--color-figma-error)]'
                : 'border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)]'
            }`}
          />
          {scaleFactor !== '' && (isNaN(parseFloat(scaleFactor)) || parseFloat(scaleFactor) <= 0) ? (
            <span className="text-[10px] text-[var(--color-figma-error)]">must be &gt; 0</span>
          ) : scaleFactor && !isNaN(parseFloat(scaleFactor)) ? (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              ×{scaleFactor}
            </span>
          ) : null}
        </div>
      )}

      {/* Footer: feedback + Apply button */}
      <div className="flex items-center justify-between pt-0.5">
        {feedback ? (
          <span className={`text-[10px] ${feedback.ok ? 'text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-error)]'}`}>
            {feedback.msg}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {selectedPaths.size} token{selectedPaths.size === 1 ? '' : 's'} selected
          </span>
        )}
        <button
          onClick={handleApply}
          disabled={applying || !connected || !hasOp}
          className="px-3 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {applying ? 'Applying…' : `Apply to ${selectedPaths.size}`}
        </button>
      </div>
    </div>
  );
}
