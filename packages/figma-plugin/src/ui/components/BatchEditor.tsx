import { useState, useMemo, useRef, useEffect } from 'react';
import { TokenValidator } from '@tokenmanager/core';
import type { Token } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';

const typeValidator = new TokenValidator();

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

const PREVIEW_MAX = 3;

function formatBatchValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
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
  const [useRegex, setUseRegex] = useState(false);
  const [applying, setApplying] = useState(false);
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [showTypeConfirm, setShowTypeConfirm] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const findTextRef = useRef<HTMLInputElement>(null);

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

  // Collect scalable tokens whose values contain alias references (e.g. {spacing.base}).
  // scaleValue() returns null for these, so they are skipped during scaling.
  const skippedAliasTokens = useMemo(() => {
    if (!allScalable) return [];
    return selectedEntries.filter(({ entry }) => {
      const v = entry.$value;
      return typeof v === 'string' && v.includes('{');
    });
  }, [allScalable, selectedEntries]);

  const scaleAliasCount = skippedAliasTokens.length;

  const otherSets = useMemo(() => sets.filter(s => s !== setName), [sets, setName]);

  // Fetch target set's token paths for conflict detection
  const [targetSetPaths, setTargetSetPaths] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!targetSet || !serverUrl) { setTargetSetPaths(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        // Flatten nested DTCG group to get all token paths
        const paths = new Set<string>();
        const walk = (obj: Record<string, unknown>, prefix: string) => {
          for (const [key, val] of Object.entries(obj)) {
            if (key.startsWith('$')) continue;
            const p = prefix ? `${prefix}.${key}` : key;
            if (val && typeof val === 'object' && '$value' in (val as Record<string, unknown>)) {
              paths.add(p);
            } else if (val && typeof val === 'object') {
              walk(val as Record<string, unknown>, p);
            }
          }
        };
        if (data.tokens) walk(data.tokens, '');
        if (!cancelled) setTargetSetPaths(paths);
      } catch { if (!cancelled) setTargetSetPaths(null); }
    })();
    return () => { cancelled = true; };
  }, [targetSet, serverUrl]);

  // Compute move preview: destination paths + conflict detection
  const movePreview = useMemo(() => {
    if (!targetSet || selectedEntries.length === 0) return null;
    const items = selectedEntries.map(({ path }) => ({
      path,
      conflict: targetSetPaths?.has(path) ?? false,
    }));
    const conflicts = items.filter(i => i.conflict).length;
    return { items, conflicts };
  }, [targetSet, selectedEntries, targetSetPaths]);

  // For type-change confirmation: gather distinct current types + validate value compatibility
  const typeChangeInfo = useMemo(() => {
    if (!newType) return null;
    const currentTypes = [...new Set(selectedEntries.map(x => x.entry.$type).filter(Boolean))];
    // Validate each token's current value against the new type
    const incompatible: { path: string; error: string }[] = [];
    for (const { path, entry } of selectedEntries) {
      // Skip if already the target type
      if (entry.$type === newType) continue;
      const result = typeValidator.validate(
        { $value: entry.$value, $type: newType } as Token,
        path,
      );
      if (!result.valid) {
        incompatible.push({ path, error: result.errors[0] ?? 'incompatible value' });
      }
    }
    return { currentTypes, count: selectedEntries.length, incompatible };
  }, [newType, selectedEntries]);

  // Dry-run: compute scaled values for preview
  const scalePreview = useMemo(() => {
    if (!allScalable || !scaleFactor) return null;
    const factor = parseFloat(scaleFactor);
    if (isNaN(factor) || factor <= 0) return null;
    return selectedEntries
      .map(({ path, entry }) => {
        const scaled = scaleValue(entry.$value, factor);
        if (scaled === null) return null;
        return { path, from: entry.$value, to: scaled };
      })
      .filter((x): x is { path: string; from: unknown; to: unknown } => x !== null);
  }, [allScalable, scaleFactor, selectedEntries]);

  // Dry-run: compute path changes for find/replace preview
  const renameChanges = useMemo(() => {
    if (!findText) return [];
    return selectedEntries
      .filter(({ path }) => path.includes(findText))
      .map(({ path }) => ({
        from: path,
        to: path.split(findText).join(replaceText),
      }))
      .filter(({ from, to }) => from !== to);
  }, [findText, replaceText, selectedEntries]);

  const hasOp = description.trim() !== '' ||
    newType !== '' ||
    (allColors && opacityPct !== '' && !isNaN(parseFloat(opacityPct))) ||
    (allScalable && scaleFactor !== '' && !isNaN(parseFloat(scaleFactor)) && parseFloat(scaleFactor) > 0);

  const canMove = targetSet !== '' && !moving;

  // Regex parsing for find/replace
  const regexError = useMemo(() => {
    if (!useRegex || !findText) return null;
    try { new RegExp(findText); return null; } catch (e) { return (e as Error).message; }
  }, [useRegex, findText]);

  const parsedRegex = useMemo(() => {
    if (!useRegex || !findText || regexError) return null;
    try { return new RegExp(findText, 'g'); } catch { return null; }
  }, [useRegex, findText, regexError]);

  // Find/replace: count tokens whose paths would change
  const renamePreview = useMemo(() => {
    if (!findText) return 0;
    if (useRegex) {
      if (regexError || !parsedRegex) return 0;
      return selectedEntries.filter(({ path }) => new RegExp(findText).test(path)).length;
    }
    return selectedEntries.filter(({ path }) => path.includes(findText)).length;
  }, [findText, useRegex, parsedRegex, regexError, selectedEntries]);

  const canRename = findText !== '' && renamePreview > 0 && !renaming && !regexError;

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

    // If a type change is included and we haven't confirmed yet, show the confirmation
    if (newType !== '' && !showTypeConfirm) {
      setShowTypeConfirm(true);
      setFeedback(null);
      return;
    }
    setShowTypeConfirm(false);

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
          // If scaled is null and the value contains an alias, we'll report it below.
        }
      }

      if (Object.keys(patch).length > 0) {
        ops.push({ path, patch, oldEntry: entry });
      }
    }

    if (ops.length === 0) {
      // If scale is the only op and all tokens have alias values, explain why nothing happened.
      const scalingActive = allScalable && scaleFactor !== '' && !isNaN(parseFloat(scaleFactor)) && parseFloat(scaleFactor) > 0;
      if (scalingActive && scaleAliasCount === selectedEntries.length) {
        setFeedback({ ok: false, msg: 'Cannot scale — all selected tokens use reference values' });
      }
      return;
    }

    setApplying(true);
    setFeedback(null);
    setProgress({ current: 0, total: ops.length });

    try {
      let succeeded = 0;
      let failed = 0;
      const results: PromiseSettledResult<void>[] = [];
      for (let i = 0; i < ops.length; i++) {
        try {
          await patchToken(ops[i].path, ops[i].patch);
          results.push({ status: 'fulfilled', value: undefined });
          succeeded++;
        } catch (e) {
          results.push({ status: 'rejected', reason: e });
          failed++;
        }
        setProgress({ current: i + 1, total: ops.length });
      }

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

      // When scaling, alias-valued tokens produce no patch entry and are not in ops at all.
      const scalingActive = allScalable && scaleFactor !== '' && !isNaN(parseFloat(scaleFactor)) && parseFloat(scaleFactor) > 0;
      const skippedAliases = scalingActive ? scaleAliasCount : 0;

      if (failed === 0) {
        const skipNote = skippedAliases > 0
          ? ` (${skippedAliases} skipped — reference value${skippedAliases === 1 ? '' : 's'} can't be scaled)`
          : '';
        setFeedback({ ok: skippedAliases === 0, msg: `Applied to ${succeeded} token${succeeded === 1 ? '' : 's'}${skipNote}` });
        setDescription('');
        setOpacityPct('');
        setScaleFactor('');
        setNewType('');
        setTimeout(() => descriptionRef.current?.focus(), 0);
      } else if (succeeded === 0) {
        setFeedback({ ok: false, msg: `Failed to update all ${failed} token${failed === 1 ? '' : 's'}` });
      } else {
        setFeedback({ ok: false, msg: `${succeeded} updated, ${failed} failed` });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  const handleMove = async () => {
    if (!connected || !canMove) return;
    setMoving(true);
    setFeedback(null);
    setProgress({ current: 0, total: selectedEntries.length });
    try {
      let succeeded = 0;
      let failed = 0;
      for (let i = 0; i < selectedEntries.length; i++) {
        try {
          const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenPath: selectedEntries[i].path, targetSet }),
          });
          if (!res.ok) throw new Error(`Move ${selectedEntries[i].path} failed (${res.status})`);
          succeeded++;
        } catch {
          failed++;
        }
        setProgress({ current: i + 1, total: selectedEntries.length });
      }

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
      setProgress(null);
    }
  };

  const handleRename = async () => {
    if (!connected || !canRename) return;
    const toRename = useRegex && parsedRegex
      ? selectedEntries.filter(({ path }) => new RegExp(findText).test(path))
      : selectedEntries.filter(({ path }) => path.includes(findText));
    setRenaming(true);
    setFeedback(null);
    setProgress({ current: 0, total: toRename.length });
    try {
      // Rename sequentially to avoid conflicts when paths share prefixes
      let succeeded = 0;
      let failed = 0;
      let done = 0;
      for (const { path } of toRename) {
        const newPath = useRegex && parsedRegex
          ? path.replace(new RegExp(findText, 'g'), replaceText)
          : path.split(findText).join(replaceText);
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
        done++;
        setProgress({ current: done, total: toRename.length });
      }

      if (succeeded > 0) onApply();

      if (failed === 0) {
        setFeedback({ ok: true, msg: `Renamed ${succeeded} token${succeeded === 1 ? '' : 's'}` });
        setFindText('');
        setReplaceText('');
        setTimeout(() => findTextRef.current?.focus(), 0);
      } else if (succeeded === 0) {
        setFeedback({ ok: false, msg: `Failed to rename all ${failed} token${failed === 1 ? '' : 's'}` });
      } else {
        setFeedback({ ok: false, msg: `${succeeded} renamed, ${failed} failed` });
      }
    } catch {
      setFeedback({ ok: false, msg: 'Rename failed — check server connection' });
    } finally {
      setRenaming(false);
      setProgress(null);
    }
  };

  return (
    <div className="px-2 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] space-y-1.5">
      {/* Description */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Description</span>
        <input
          ref={descriptionRef}
          type="text"
          aria-label="Batch description"
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
          onChange={e => { setNewType(e.target.value); setShowTypeConfirm(false); }}
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
            aria-label="Opacity"
            min="0"
            max="100"
            step="1"
            value={opacityPct === '' ? 0 : Math.min(100, Math.max(0, Math.round(parseFloat(opacityPct) || 0)))}
            onChange={e => setOpacityPct(e.target.value)}
            className="flex-1 accent-[var(--color-figma-accent)]"
          />
          <input
            type="number"
            aria-label="Opacity value"
            min="0"
            max="100"
            value={opacityPct}
            onChange={e => setOpacityPct(e.target.value)}
            onBlur={e => {
              if (e.target.value === '') return;
              const n = parseFloat(e.target.value);
              if (!isNaN(n)) setOpacityPct(String(Math.min(100, Math.max(0, Math.round(n)))));
            }}
            placeholder="—"
            className={`w-12 h-6 px-1.5 rounded border bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none text-right ${
              opacityPct !== '' && !isNaN(parseFloat(opacityPct)) && (parseFloat(opacityPct) < 0 || parseFloat(opacityPct) > 100)
                ? 'border-[var(--color-figma-error)] focus:border-[var(--color-figma-error)]'
                : 'border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)]'
            }`}
          />
          {opacityPct !== '' && !isNaN(parseFloat(opacityPct)) && (parseFloat(opacityPct) < 0 || parseFloat(opacityPct) > 100) && (
            <span className="text-[10px] text-[var(--color-figma-error)]">0–100</span>
          )}
        </div>
      )}

      {/* Scale — only when all selected tokens are dimension or number */}
      {allScalable && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Multiply by</span>
            <input
              type="number"
              aria-label="Scale factor"
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
          {scaleAliasCount > 0 && scaleFactor !== '' && !isNaN(parseFloat(scaleFactor)) && parseFloat(scaleFactor) > 0 && (
            <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
              <span className="text-[10px] text-[var(--color-figma-warning,#f59e0b)] leading-tight font-medium">
                {scaleAliasCount === selectedEntries.length
                  ? 'All selected tokens use reference values and cannot be scaled:'
                  : `${scaleAliasCount} token${scaleAliasCount === 1 ? '' : 's'} will be skipped (reference values cannot be scaled):`}
              </span>
              {skippedAliasTokens.slice(0, PREVIEW_MAX).map(({ path, entry }) => (
                <div key={path} className="flex items-center gap-1 text-[10px] leading-snug">
                  <span className="text-[var(--color-figma-text-tertiary)] truncate max-w-[90px]" title={path}>{path.split('.').pop()}</span>
                  <span className="text-[var(--color-figma-text-secondary)] shrink-0 truncate max-w-[120px]" title={String(entry.$value)}>{String(entry.$value)}</span>
                </div>
              ))}
              {skippedAliasTokens.length > PREVIEW_MAX && (
                <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">and {skippedAliasTokens.length - PREVIEW_MAX} more…</div>
              )}
            </div>
          )}
          {scalePreview && scalePreview.length > 0 && (
            <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
              {scalePreview.slice(0, PREVIEW_MAX).map(({ path, from, to }) => (
                <div key={path} className="flex items-center gap-1 text-[10px] leading-snug">
                  <span className="text-[var(--color-figma-text-tertiary)] truncate max-w-[90px]" title={path}>{path.split('.').pop()}</span>
                  <span className="text-[var(--color-figma-text-secondary)] shrink-0">{formatBatchValue(from)}</span>
                  <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                  <span className="text-[var(--color-figma-text)] shrink-0 font-medium">{formatBatchValue(to)}</span>
                </div>
              ))}
              {scalePreview.length > PREVIEW_MAX && (
                <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">and {scalePreview.length - PREVIEW_MAX} more…</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Type-change inline preview (before confirmation) */}
      {newType !== '' && !showTypeConfirm && typeChangeInfo && typeChangeInfo.currentTypes.length > 0 && (
        <div className="ml-[88px] text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
          {typeChangeInfo.currentTypes.join(', ')} → <span className="text-[var(--color-figma-text)] font-medium">{newType}</span>
          {' '}on {typeChangeInfo.count} token{typeChangeInfo.count === 1 ? '' : 's'}
          {typeChangeInfo.incompatible.length > 0 && (
            <span className="text-[var(--color-figma-error,#ef4444)]">
              {' '}— {typeChangeInfo.incompatible.length} with incompatible value{typeChangeInfo.incompatible.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {/* Type-change confirmation banner */}
      {showTypeConfirm && typeChangeInfo && (
        <div className={`rounded border px-2 py-1.5 space-y-1 ${
          typeChangeInfo.incompatible.length > 0
            ? 'border-[var(--color-figma-error,#ef4444)] bg-[rgba(239,68,68,0.08)]'
            : 'border-[var(--color-figma-warning,#f59e0b)] bg-[var(--color-figma-warning-bg,rgba(245,158,11,0.08))]'
        }`}>
          <p className="text-[10px] text-[var(--color-figma-text)] leading-snug">
            Change type of <strong>{typeChangeInfo.count} token{typeChangeInfo.count === 1 ? '' : 's'}</strong>{' '}
            {typeChangeInfo.currentTypes.length > 0 && (
              <>from <strong>{typeChangeInfo.currentTypes.join(', ')}</strong>{' '}</>
            )}
            to <strong>{newType}</strong>?
          </p>
          {typeChangeInfo.incompatible.length > 0 ? (
            <div className="space-y-0.5">
              <p className="text-[10px] text-[var(--color-figma-error,#ef4444)] leading-snug font-medium">
                {typeChangeInfo.incompatible.length} token{typeChangeInfo.incompatible.length === 1 ? ' has a' : 's have'} value{typeChangeInfo.incompatible.length === 1 ? '' : 's'} incompatible with {newType}:
              </p>
              {typeChangeInfo.incompatible.slice(0, PREVIEW_MAX).map(({ path, error }) => (
                <div key={path} className="flex items-start gap-1 text-[10px] leading-snug">
                  <span className="text-[var(--color-figma-text-tertiary)] truncate max-w-[90px] shrink-0" title={path}>{path.split('.').pop()}</span>
                  <span className="text-[var(--color-figma-error,#ef4444)] truncate" title={error}>
                    {error.includes(':') ? error.split(':').slice(1).join(':').trim() : error}
                  </span>
                </div>
              ))}
              {typeChangeInfo.incompatible.length > PREVIEW_MAX && (
                <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">and {typeChangeInfo.incompatible.length - PREVIEW_MAX} more…</div>
              )}
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
                Proceeding will produce invalid tokens. Update their values afterward or cancel.
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
              This may break alias references that depend on the current type.
            </p>
          )}
          <div className="flex gap-1.5 pt-0.5">
            <button
              onClick={handleApply}
              className={`px-2 py-0.5 rounded text-[10px] font-medium text-white hover:opacity-90 transition-opacity ${
                typeChangeInfo.incompatible.length > 0
                  ? 'bg-[var(--color-figma-error,#ef4444)]'
                  : 'bg-[var(--color-figma-accent)]'
              }`}
            >
              {typeChangeInfo.incompatible.length > 0 ? 'Change Anyway' : 'Confirm'}
            </button>
            <button
              onClick={() => setShowTypeConfirm(false)}
              className="px-2 py-0.5 rounded text-[10px] font-medium border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Footer: feedback + Apply button */}
      <div className="flex items-center justify-between pt-0.5">
        {progress ? (
          <div className="flex items-center gap-2 flex-1 mr-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-figma-bg-secondary)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-figma-accent)] transition-[width] duration-150"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] tabular-nums shrink-0">
              {progress.current}/{progress.total}
            </span>
          </div>
        ) : feedback ? (
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
          title={!connected ? 'Not connected to server' : !hasOp ? 'Fill in at least one field above' : newType !== '' && !showTypeConfirm ? `Change type of ${selectedPaths.size} token${selectedPaths.size === 1 ? '' : 's'} to ${newType} — click to review` : `Apply changes to ${selectedPaths.size} token${selectedPaths.size === 1 ? '' : 's'}`}
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
          <div className="flex-1 min-w-0 relative">
            <input
              ref={findTextRef}
              type="text"
              aria-label="Find in path"
              value={findText}
              onChange={e => setFindText(e.target.value)}
              placeholder="find in path…"
              className={`w-full h-6 pl-1.5 pr-7 rounded border bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none ${
                regexError
                  ? 'border-[var(--color-figma-error)] focus:border-[var(--color-figma-error)]'
                  : 'border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)]'
              }`}
            />
            <button
              onClick={() => setUseRegex(v => !v)}
              title={useRegex ? 'Switch to literal match' : 'Switch to regex match'}
              aria-label={useRegex ? 'Switch to literal match' : 'Switch to regex match'}
              className={`absolute right-0.5 top-0.5 h-5 w-6 rounded text-[10px] font-mono flex items-center justify-center transition-colors ${
                useRegex
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover,rgba(0,0,0,0.06))]'
              }`}
            >
              .*
            </button>
          </div>
          <input
            type="text"
            aria-label="Replace with"
            value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            placeholder="replace with…"
            className="flex-1 min-w-0 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          <button
            onClick={handleRename}
            disabled={!connected || !canRename}
            title={!connected ? 'Not connected to server' : !findText ? 'Enter text to find in token paths' : regexError ? `Invalid regex: ${regexError}` : renamePreview === 0 ? 'No selected tokens match the find text' : `Rename ${renamePreview} token path${renamePreview === 1 ? '' : 's'}`}
            className="shrink-0 px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {renaming ? '…' : `Rename${renamePreview > 0 ? ` ${renamePreview}` : ''}`}
          </button>
        </div>
        {renameChanges.length > 0 && (
          <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
            {renameChanges.slice(0, PREVIEW_MAX).map(({ from, to }) => (
              <div key={from} className="text-[10px] leading-snug space-y-0">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--color-figma-text-secondary)] truncate" title={from}>{from}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                  <span className="text-[var(--color-figma-text)] font-medium truncate" title={to}>{to}</span>
                </div>
              </div>
            ))}
            {renameChanges.length > PREVIEW_MAX && (
              <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">and {renameChanges.length - PREVIEW_MAX} more…</div>
            )}
          </div>
        )}

        {/* Move to set — only when multiple sets exist */}
        {otherSets.length > 0 && (<>
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
          {movePreview && movePreview.items.length > 0 && (
            <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
              {movePreview.items.slice(0, PREVIEW_MAX).map(({ path, conflict }) => (
                <div key={path} className="text-[10px] leading-snug space-y-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-figma-text-secondary)] truncate" title={path}>{path}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                    <span className={`font-medium truncate ${conflict ? 'text-[var(--color-figma-warning,#f59e0b)]' : 'text-[var(--color-figma-text)]'}`} title={`${targetSet}: ${path}${conflict ? ' (already exists)' : ''}`}>
                      {targetSet}: {path}
                    </span>
                    {conflict && (
                      <span className="text-[var(--color-figma-warning,#f59e0b)] shrink-0 text-[10px]">conflict</span>
                    )}
                  </div>
                </div>
              ))}
              {movePreview.items.length > PREVIEW_MAX && (
                <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">and {movePreview.items.length - PREVIEW_MAX} more…</div>
              )}
              {movePreview.conflicts > 0 && (
                <div className="text-[10px] text-[var(--color-figma-warning,#f59e0b)] font-medium leading-snug pt-0.5">
                  {movePreview.conflicts} token{movePreview.conflicts === 1 ? '' : 's'} already exist{movePreview.conflicts === 1 ? 's' : ''} in &quot;{targetSet}&quot; and will be overwritten
                </div>
              )}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
