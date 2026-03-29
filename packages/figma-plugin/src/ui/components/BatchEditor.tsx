import { useState, useMemo, useRef, useEffect } from 'react';
import { TokenValidator } from '@tokenmanager/core';
import type { Token } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';
import { apiFetch } from '../shared/apiFetch';
import { FIGMA_SCOPES } from './MetadataEditor';

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

const PREVIEW_MAX = 8;

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
  const [showTypeConfirm, setShowTypeConfirm] = useState(false);
  const [batchScopes, setBatchScopes] = useState<string[]>([]);
  const [showScopes, setShowScopes] = useState(false);
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

  // Compute available Figma scopes based on the types of selected tokens.
  // If all selected tokens share one type that has scopes, show those scopes.
  // If types are mixed, show the intersection of available scopes.
  const availableScopes = useMemo(() => {
    if (selectedEntries.length === 0) return [];
    const types = [...new Set(selectedEntries.map(x => x.entry.$type).filter(Boolean))];
    if (types.length === 0) return [];
    // Start with the scopes of the first type, intersect with the rest
    const first = FIGMA_SCOPES[types[0]];
    if (!first) return [];
    if (types.length === 1) return first;
    // Intersect: only keep scopes whose value exists in all types
    return first.filter(scope =>
      types.every(t => FIGMA_SCOPES[t]?.some(s => s.value === scope.value))
    );
  }, [selectedEntries]);

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
        const data = await apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}`);
        if (cancelled) return;
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

  const hasOp = description.trim() !== '' ||
    newType !== '' ||
    batchScopes.length > 0 ||
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

  // Dry-run: compute path changes for find/replace preview (supports both literal and regex)
  const renameChanges = useMemo(() => {
    if (!findText) return [];
    if (useRegex) {
      if (regexError || !parsedRegex) return [];
      return selectedEntries
        .filter(({ path }) => path.search(parsedRegex) >= 0)
        .map(({ path }) => {
          // Reset lastIndex since parsedRegex has 'g' flag
          parsedRegex.lastIndex = 0;
          return { from: path, to: path.replace(parsedRegex, replaceText) };
        })
        .filter(({ from, to }) => from !== to);
    }
    return selectedEntries
      .filter(({ path }) => path.includes(findText))
      .map(({ path }) => ({
        from: path,
        to: path.split(findText).join(replaceText),
      }))
      .filter(({ from, to }) => from !== to);
  }, [findText, replaceText, useRegex, regexError, parsedRegex, selectedEntries]);

  // Find/replace: count tokens whose paths would change
  const renamePreview = useMemo(() => {
    if (!findText) return 0;
    if (useRegex) {
      if (regexError || !parsedRegex) return 0;
      return selectedEntries.filter(({ path }) => path.search(parsedRegex) >= 0).length;
    }
    return selectedEntries.filter(({ path }) => path.includes(findText)).length;
  }, [findText, useRegex, parsedRegex, regexError, selectedEntries]);

  const canRename = findText !== '' && renamePreview > 0 && !renaming && !regexError;

  /** Rollback a server operation by ID — used for single-entry undo of batch operations. */
  const rollbackOperation = async (operationId: string) => {
    await apiFetch(`${serverUrl}/api/operations/${operationId}/rollback`, { method: 'POST' });
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

      if (batchScopes.length > 0) {
        patch.$extensions = { 'com.figma.scopes': batchScopes };
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

    if (ops.length === 0) {
      const scalingActive = allScalable && scaleFactor !== '' && !isNaN(parseFloat(scaleFactor)) && parseFloat(scaleFactor) > 0;
      if (scalingActive && scaleAliasCount === selectedEntries.length) {
        setFeedback({ ok: false, msg: 'Cannot scale — all selected tokens use reference values' });
      }
      return;
    }

    setApplying(true);
    setFeedback(null);

    try {
      // Single batch API call — records one operation log entry for undo
      const result = await apiFetch<{ updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patches: ops.map(({ path, patch }) => ({ path, patch })) }),
        },
      );

      if (succeeded > 0) {
        if (onPushUndo) {
          const successOps = ops.filter((_, i) => results[i].status === 'fulfilled');
          onPushUndo({
            description: `Batch edit ${successOps.length} token${successOps.length === 1 ? '' : 's'}`,
            restore: async () => {
              await Promise.all(successOps.map(({ path, oldEntry }) => {
                const restorePatch: Record<string, unknown> = { $type: oldEntry.$type, $value: oldEntry.$value };
                if (batchScopes.length > 0) {
                  // Restore old scopes (or clear if none were set)
                  restorePatch.$extensions = { 'com.figma.scopes': oldEntry.$scopes ?? [] };
                }
                return patchToken(path, restorePatch);
              }));
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
      onApply();

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
        setBatchScopes([]);
        setShowScopes(false);
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
    }
  };

  const handleMove = async () => {
    if (!connected || !canMove) return;
    setMoving(true);
    setFeedback(null);
    try {
      const paths = selectedEntries.map(e => e.path);
      const result = await apiFetch<{ moved: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-move`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths, targetSet }),
        },
      );

      if (onPushUndo) {
        const opId = result.operationId;
        onPushUndo({
          description: `Move ${result.moved} token${result.moved === 1 ? '' : 's'} to "${targetSet}"`,
          restore: async () => {
            await rollbackOperation(opId);
            onApply();
          },
        });
      }
      onApply();
      setFeedback({ ok: true, msg: `Moved ${result.moved} token${result.moved === 1 ? '' : 's'} to "${targetSet}"` });
      setTargetSet('');
    } catch {
      setFeedback({ ok: false, msg: 'Move failed — check server connection' });
    } finally {
      setMoving(false);
    }
  };

  const handleRename = async () => {
    if (!connected || !canRename) return;
    // Build rename pairs from selected entries
    const renames: Array<{ oldPath: string; newPath: string }> = [];
    for (const { path } of selectedEntries) {
      const newPath = useRegex && parsedRegex
        ? path.replace(parsedRegex, replaceText)
        : path.split(findText).join(replaceText);
      if (newPath !== path) {
        renames.push({ oldPath: path, newPath });
      }
    }
    if (renames.length === 0) return;

    setRenaming(true);
    setFeedback(null);
    try {
      const result = await apiFetch<{ renamed: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-rename-paths`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renames }),
        },
      );

      if (onPushUndo) {
        const opId = result.operationId;
        onPushUndo({
          description: `Rename ${result.renamed} token${result.renamed === 1 ? '' : 's'}`,
          restore: async () => {
            await rollbackOperation(opId);
            onApply();
          },
        });
      }
      onApply();
      setFeedback({ ok: true, msg: `Renamed ${result.renamed} token${result.renamed === 1 ? '' : 's'}` });
      setFindText('');
      setReplaceText('');
      setTimeout(() => findTextRef.current?.focus(), 0);
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

      {/* Figma variable scopes — when selected tokens have applicable scope options */}
      {availableScopes.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowScopes(v => !v)}
            className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true" className={`transition-transform ${showScopes ? 'rotate-90' : ''}`}>
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            <span>Figma scopes{batchScopes.length > 0 ? ` (${batchScopes.length} selected)` : ''}</span>
          </button>
          {showScopes && (
            <div className="ml-[16px] mt-1 space-y-1">
              <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">
                Set scopes on all {selectedPaths.size} selected token{selectedPaths.size === 1 ? '' : 's'}. Empty = all scopes.
              </p>
              {availableScopes.map(scope => (
                <label key={scope.value} className="flex items-start gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchScopes.includes(scope.value)}
                    onChange={e => setBatchScopes(
                      e.target.checked
                        ? [...batchScopes, scope.value]
                        : batchScopes.filter(s => s !== scope.value)
                    )}
                    className="w-3 h-3 rounded mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="text-[10px] text-[var(--color-figma-text)] leading-snug">{scope.label}</span>
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">{scope.description}</span>
                  </span>
                </label>
              ))}
              {batchScopes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBatchScopes([])}
                  className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] underline"
                >
                  Clear all scopes
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
        {(applying || moving || renaming) ? (
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {applying ? 'Applying…' : moving ? 'Moving…' : 'Renaming…'}
          </span>
        ) : feedback ? (
          <span className={`text-[10px] ${feedback.ok ? 'text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-error)]'}`}>
            {feedback.msg}
          </span>
        ) : !hasOp ? (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {!connected
              ? 'Not connected to server'
              : `Set a description${newType === '' ? ', type' : ''}${availableScopes.length > 0 ? ', scopes' : ''}${allColors ? ', or opacity' : allScalable ? ', or scale factor' : ''} to apply`}
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
        {regexError && useRegex && findText && (
          <div className="ml-[88px] text-[10px] text-[var(--color-figma-error)]">
            {regexError}
          </div>
        )}
        {renameChanges.length > 0 && (
          <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] pb-0.5">
              {renameChanges.length} path{renameChanges.length === 1 ? '' : 's'} will change
              {renamePreview > renameChanges.length && (
                <span className="font-normal text-[var(--color-figma-text-tertiary)]"> ({renamePreview - renameChanges.length} unchanged)</span>
              )}:
            </div>
            {renameChanges.slice(0, PREVIEW_MAX).map(({ from, to }) => (
              <div key={from} className="text-[10px] leading-snug flex items-baseline gap-1">
                <span className="text-[var(--color-figma-text-secondary)] truncate shrink" title={from}>{from}</span>
                <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                <span className="text-[var(--color-figma-text)] font-medium truncate shrink" title={to}>{to}</span>
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
