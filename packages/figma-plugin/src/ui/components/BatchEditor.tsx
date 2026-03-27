import { useState, useMemo } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';

const DTCG_TYPES = [
  'color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier',
  'number', 'strokeStyle', 'border', 'transition', 'shadow', 'gradient',
  'typography', 'fontStyle', 'letterSpacing', 'lineHeight', 'percentage',
  'string', 'boolean', 'link', 'textDecoration', 'textTransform', 'custom',
  'composition', 'asset',
] as const;

interface BatchEditorProps {
  selectedPaths: Set<string>;
  allTokensFlat: Record<string, TokenMapEntry>;
  setName: string;
  sets: string[];
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
  sets,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchEditorProps) {
  const [description, setDescription] = useState('');
  const [opacityPct, setOpacityPct] = useState('');
  const [scaleFactor, setScaleFactor] = useState('');
  const [newType, setNewType] = useState('');
  const [targetSet, setTargetSet] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [applying, setApplying] = useState(false);
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState(false);
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

  const otherSets = useMemo(() => sets.filter(s => s !== setName), [sets, setName]);

  const hasOp = description.trim() !== '' ||
    newType !== '' ||
    (allColors && opacityPct !== '' && !isNaN(parseFloat(opacityPct))) ||
    (allScalable && scaleFactor !== '' && !isNaN(parseFloat(scaleFactor)) && parseFloat(scaleFactor) > 0);

  const canMove = targetSet !== '' && !moving;

  // Find/replace: count tokens whose paths would change
  const renamePreview = useMemo(() => {
    if (!findText) return 0;
    return selectedEntries.filter(({ path }) => path.includes(findText)).length;
  }, [findText, selectedEntries]);

  const canRename = findText !== '' && renamePreview > 0 && !renaming;

  const encodedPath = (path: string) =>
    path.split('.').map(encodeURIComponent).join('/');

  const patchToken = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedPath(path)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path} failed (${res.status})`);
  };

  const handleApply = async () => {
    if (!connected || applying || !hasOp) return;

    type Op = { path: string; patch: Record<string, unknown>; oldEntry: TokenMapEntry };
    const ops: Op[] = [];

    for (const { path, entry } of selectedEntries) {
      const patch: Record<string, unknown> = {};

      if (description.trim()) {
        patch.$description = description.trim();
      }

      if (newType !== '') {
        patch.$type = newType;
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

    try {
      const results = await Promise.allSettled(ops.map(({ path, patch }) => patchToken(path, patch)));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (succeeded > 0) {
        if (onPushUndo) {
          const successOps = ops.filter((_, i) => results[i].status === 'fulfilled');
          onPushUndo({
            description: `Batch edit ${successOps.length} token${successOps.length === 1 ? '' : 's'}`,
            restore: async () => {
              await Promise.all(successOps.map(({ path, oldEntry }) =>
                patchToken(path, { $type: oldEntry.$type, $value: oldEntry.$value })
              ));
              onApply();
            },
            redo: async () => {
              await Promise.all(successOps.map(({ path, patch }) => patchToken(path, patch)));
              onApply();
            },
          });
        }
        onApply();
      }

      if (failed === 0) {
        setFeedback({ ok: true, msg: `Applied to ${succeeded} token${succeeded === 1 ? '' : 's'}` });
        setDescription('');
        setOpacityPct('');
        setScaleFactor('');
        setNewType('');
      } else if (succeeded === 0) {
        setFeedback({ ok: false, msg: `Failed to update all ${failed} token${failed === 1 ? '' : 's'}` });
      } else {
        setFeedback({ ok: false, msg: `${succeeded} updated, ${failed} failed` });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
    }
  };

  const handleMove = async () => {
    if (!connected || !canMove) return;
    setMoving(true);
    setFeedback(null);
    try {
      const results = await Promise.allSettled(
        selectedEntries.map(async ({ path }) => {
          const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenPath: path, targetSet }),
          });
          if (!res.ok) throw new Error(`Move ${path} failed (${res.status})`);
        })
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (succeeded > 0) onApply();

      if (failed === 0) {
        setFeedback({ ok: true, msg: `Moved ${succeeded} token${succeeded === 1 ? '' : 's'} to "${targetSet}"` });
        setTargetSet('');
      } else if (succeeded === 0) {
        setFeedback({ ok: false, msg: `Failed to move all ${failed} token${failed === 1 ? '' : 's'}` });
      } else {
        setFeedback({ ok: false, msg: `${succeeded} moved, ${failed} failed` });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Move failed — check server connection' });
    } finally {
      setMoving(false);
    }
  };

  const handleRename = async () => {
    if (!connected || !canRename) return;
    const toRename = selectedEntries.filter(({ path }) => path.includes(findText));
    setRenaming(true);
    setFeedback(null);
    try {
      // Rename sequentially to avoid conflicts when paths share prefixes
      let succeeded = 0;
      let failed = 0;
      for (const { path } of toRename) {
        const newPath = path.split(findText).join(replaceText);
        if (newPath !== path) {
          try {
            const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath: path, newPath }),
            });
            if (!res.ok) throw new Error(`Rename ${path} failed (${res.status})`);
            succeeded++;
          } catch {
            failed++;
          }
        } else {
          succeeded++; // no-op rename counts as success
        }
      }

      if (succeeded > 0) onApply();

      if (failed === 0) {
        setFeedback({ ok: true, msg: `Renamed ${succeeded} token${succeeded === 1 ? '' : 's'}` });
        setFindText('');
        setReplaceText('');
      } else if (succeeded === 0) {
        setFeedback({ ok: false, msg: `Failed to rename all ${failed} token${failed === 1 ? '' : 's'}` });
      } else {
        setFeedback({ ok: false, msg: `${succeeded} renamed, ${failed} failed` });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Rename failed — check server connection' });
    } finally {
      setRenaming(false);
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

      {/* Change $type */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Change type</span>
        <select
          value={newType}
          onChange={e => setNewType(e.target.value)}
          className="flex-1 h-6 px-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
        >
          <option value="">— keep current —</option>
          {DTCG_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
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
        ) : !hasOp ? (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {!connected
              ? 'Not connected to server'
              : `Set a description${newType === '' ? ', type' : ''}${allColors ? ', or opacity' : allScalable ? ', or scale factor' : ''} to apply`}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {selectedPaths.size} token{selectedPaths.size === 1 ? '' : 's'} selected
          </span>
        )}
        <button
          onClick={handleApply}
          disabled={applying || !connected || !hasOp}
          title={!connected ? 'Not connected to server' : !hasOp ? 'Fill in at least one field above' : `Apply changes to ${selectedPaths.size} token${selectedPaths.size === 1 ? '' : 's'}`}
          className="px-3 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {applying ? 'Applying…' : `Apply to ${selectedPaths.size}`}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--color-figma-border)] pt-1 space-y-1.5">
        {/* Find / Replace rename */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Find/replace</span>
          <input
            type="text"
            value={findText}
            onChange={e => setFindText(e.target.value)}
            placeholder="find in path…"
            className="flex-1 min-w-0 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          <input
            type="text"
            value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            placeholder="replace with…"
            className="flex-1 min-w-0 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          <button
            onClick={handleRename}
            disabled={!connected || !canRename}
            title={!connected ? 'Not connected to server' : !findText ? 'Enter text to find in token paths' : renamePreview === 0 ? 'No selected tokens match the find text' : `Rename ${renamePreview} token path${renamePreview === 1 ? '' : 's'}`}
            className="shrink-0 px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {renaming ? '…' : `Rename${renamePreview > 0 ? ` ${renamePreview}` : ''}`}
          </button>
        </div>

        {/* Move to set — only when multiple sets exist */}
        {otherSets.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Move to set</span>
            <select
              value={targetSet}
              onChange={e => setTargetSet(e.target.value)}
              className="flex-1 h-6 px-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
            >
              <option value="">— choose set —</option>
              {otherSets.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={handleMove}
              disabled={!connected || !canMove || moving}
              title={!connected ? 'Not connected to server' : targetSet === '' ? 'Choose a target set first' : `Move ${selectedPaths.size} token${selectedPaths.size === 1 ? '' : 's'} to "${targetSet}"`}
              className="shrink-0 px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {moving ? '…' : 'Move'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
