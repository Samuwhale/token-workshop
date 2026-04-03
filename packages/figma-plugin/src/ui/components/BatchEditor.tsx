import { useState, useMemo, useRef, useEffect } from 'react';
import { TokenValidator } from '@tokenmanager/core';
import type { Token } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';
import { apiFetch } from '../shared/apiFetch';
import { FIGMA_SCOPES } from './MetadataEditor';
import { AliasAutocomplete } from './AliasAutocomplete';
import { isAlias } from '../../shared/resolveAlias';

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

type NumericOpMode = 'multiply' | 'divide' | 'add' | 'subtract';
type ColorAdjustOp = 'lighten' | 'darken' | 'saturate' | 'desaturate' | 'hue';

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

/** Apply an arithmetic operation to a dimension or number value. */
function applyNumericTransform(value: unknown, op: NumericOpMode, operand: number): unknown {
  if (typeof value === 'number') {
    let result: number;
    switch (op) {
      case 'multiply': result = value * operand; break;
      case 'divide': result = value / operand; break;
      case 'add': result = value + operand; break;
      case 'subtract': result = value - operand; break;
    }
    return parseFloat(result!.toFixed(6));
  }
  if (typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) {
    const dim = value as { value: number; unit: string };
    const transformed = applyNumericTransform(dim.value, op, operand) as number;
    return { value: transformed, unit: dim.unit };
  }
  if (typeof value === 'string') {
    const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (match) {
      const transformed = applyNumericTransform(parseFloat(match[1]), op, operand) as number;
      return `${parseFloat(transformed.toFixed(6))}${match[2]}`;
    }
  }
  return null;
}

// Pure HSL ↔ RGB math (no external imports).
function rgbToHslLocal(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6; break;
  }
  return { h, s, l };
}

function hslToRgbLocal(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue2rgb(h + 1 / 3), g: hue2rgb(h), b: hue2rgb(h - 1 / 3) };
}

/** Adjust a hex color's hue/saturation/lightness. Returns new hex or null if not a plain hex color. */
function applyColorAdjust(colorValue: unknown, op: ColorAdjustOp, amount: number): string | null {
  if (typeof colorValue !== 'string') return null;
  const raw = colorValue.replace('#', '');
  if (raw.length !== 6 && raw.length !== 8) return null;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const alphaHex = raw.length === 8 ? raw.slice(6, 8) : '';
  let { h, s, l } = rgbToHslLocal(r, g, b);
  const delta = amount / 100;
  switch (op) {
    case 'lighten': l = Math.min(1, l + delta); break;
    case 'darken': l = Math.max(0, l - delta); break;
    case 'saturate': s = Math.min(1, s + delta); break;
    case 'desaturate': s = Math.max(0, s - delta); break;
    case 'hue': h = ((h + amount / 360) % 1 + 1) % 1; break;
  }
  const { r: nr, g: ng, b: nb } = hslToRgbLocal(h, s, l);
  const toHex2 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0');
  return `#${toHex2(nr)}${toHex2(ng)}${toHex2(nb)}${alphaHex}`;
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
  const [aliasInput, setAliasInput] = useState('');
  const [aliasRef, setAliasRef] = useState('');
  const [showAliasAutocomplete, setShowAliasAutocomplete] = useState(false);
  const [newType, setNewType] = useState('');
  const [targetSet, setTargetSet] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [aliasFindText, setAliasFindText] = useState('');
  const [aliasReplaceText, setAliasReplaceText] = useState('');
  const [applying, setApplying] = useState(false);
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [aliasReplacing, setAliasReplacing] = useState(false);
  const [numericOpMode, setNumericOpMode] = useState<NumericOpMode>('multiply');
  const [colorAdjustOp, setColorAdjustOp] = useState<ColorAdjustOp>('lighten');
  const [colorAdjustAmt, setColorAdjustAmt] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showTypeConfirm, setShowTypeConfirm] = useState(false);
  const [batchScopes, setBatchScopes] = useState<string[]>([]);
  const [showScopes, setShowScopes] = useState(false);
  const [batchExtensions, setBatchExtensions] = useState<Array<{ key: string; value: string }>>([]);
  const [showExtensions, setShowExtensions] = useState(false);
  const [expandedPreviews, setExpandedPreviews] = useState<Record<string, boolean>>({});
  const descriptionRef = useRef<HTMLInputElement>(null);
  const findTextRef = useRef<HTMLInputElement>(null);
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const handleApplyRef = useRef<() => void>(() => {});

  const togglePreview = (key: string) => setExpandedPreviews(p => ({ ...p, [key]: !p[key] }));

  const selectedEntries = useMemo(() => (
    [...selectedPaths]
      .map(p => ({ path: p, entry: allTokensFlat[p] }))
      .filter((x): x is { path: string; entry: TokenMapEntry } => x.entry != null)
  ), [selectedPaths, allTokensFlat]);

  const colorCount = useMemo(() =>
    selectedEntries.filter(x => x.entry.$type === 'color').length,
    [selectedEntries]
  );
  const hasColors = colorCount > 0;
  const allColors = colorCount === selectedEntries.length && selectedEntries.length > 0;

  const scalableCount = useMemo(() =>
    selectedEntries.filter(x => x.entry.$type === 'dimension' || x.entry.$type === 'number').length,
    [selectedEntries]
  );
  const hasScalable = scalableCount > 0;
  const allScalable = scalableCount === selectedEntries.length && selectedEntries.length > 0;

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
  // applyNumericTransform() returns null for these, so they are skipped during transforms.
  const skippedAliasTokens = useMemo(() => {
    if (!hasScalable) return [];
    return selectedEntries.filter(({ entry }) => {
      if (entry.$type !== 'dimension' && entry.$type !== 'number') return false;
      const v = entry.$value;
      return typeof v === 'string' && v.includes('{');
    });
  }, [hasScalable, selectedEntries]);

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
      } catch (err) { console.warn('[BatchEditor] failed to fetch target set paths:', err); if (!cancelled) setTargetSetPaths(null); }
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

  // Dry-run: compute numeric transform values for preview
  const scalePreview = useMemo(() => {
    if (!numericTransformActive) return null;
    const operand = parseFloat(scaleFactor);
    if (isNaN(operand)) return null;
    return selectedEntries
      .filter(({ entry }) => entry.$type === 'dimension' || entry.$type === 'number')
      .map(({ path, entry }) => {
        const result = applyNumericTransform(entry.$value, numericOpMode, operand);
        if (result === null) return null;
        return { path, from: entry.$value, to: result };
      })
      .filter((x): x is { path: string; from: unknown; to: unknown } => x !== null);
  }, [numericTransformActive, scaleFactor, numericOpMode, selectedEntries]);

  // Dry-run: compute color adjust values for preview
  const colorAdjustPreview = useMemo(() => {
    if (!colorAdjustActive) return null;
    const amount = parseFloat(colorAdjustAmt);
    if (isNaN(amount)) return null;
    return selectedEntries
      .filter(({ entry }) => entry.$type === 'color')
      .map(({ path, entry }) => {
        const result = applyColorAdjust(entry.$value, colorAdjustOp, amount);
        if (result === null) return null;
        return { path, from: entry.$value, to: result };
      })
      .filter((x): x is { path: string; from: unknown; to: unknown } => x !== null);
  }, [colorAdjustActive, colorAdjustAmt, colorAdjustOp, selectedEntries]);

  const aliasActive = aliasRef !== '' && isAlias(aliasRef);

  const opacityActive = hasColors && opacityPct !== '' && !isNaN(parseFloat(opacityPct));

  // For multiply/divide the operand must be non-zero; for add/subtract any number is valid.
  const numericTransformActive = useMemo(() => {
    if (!hasScalable || scaleFactor === '') return false;
    const n = parseFloat(scaleFactor);
    if (isNaN(n)) return false;
    if (numericOpMode === 'multiply' || numericOpMode === 'divide') return n !== 0;
    return true;
  }, [hasScalable, scaleFactor, numericOpMode]);

  const colorAdjustActive = hasColors && colorAdjustAmt !== '' && !isNaN(parseFloat(colorAdjustAmt));

  // Alias mode is mutually exclusive with value-modifying operations (opacity, scale, color adjust).
  // If both are active simultaneously, the alias would be silently overwritten.
  const aliasConflict = aliasActive && (opacityActive || numericTransformActive || colorAdjustActive);

  const hasOp = !aliasConflict && (
    description.trim() !== '' ||
    newType !== '' ||
    batchScopes.length > 0 ||
    batchExtensions.some(e => e.key.trim() !== '') ||
    aliasActive ||
    opacityActive ||
    numericTransformActive ||
    colorAdjustActive
  );

  const canMove = targetSet !== '' && !moving && !copying;
  const canCopy = targetSet !== '' && !moving && !copying;

  // Regex parsing for find/replace
  const regexError = useMemo(() => {
    if (!useRegex || !findText) return null;
    try { new RegExp(findText); return null; } catch (e) { return (e as Error).message; }
  }, [useRegex, findText]);

  const parsedRegex = useMemo(() => {
    if (!useRegex || !findText || regexError) return null;
    try { return new RegExp(findText, 'g'); } catch (e) { console.debug('[BatchEditor] regex compilation failed:', e); return null; }
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

  // Alias find/replace: compute $value rewrites for tokens referencing a specific alias path
  const aliasFindChanges = useMemo(() => {
    if (!aliasFindText) return [];
    const findPattern = `{${aliasFindText}}`;
    const replacePattern = aliasReplaceText ? `{${aliasReplaceText}}` : '';
    return selectedEntries
      .filter(({ entry }) => {
        const v = entry.$value;
        return typeof v === 'string' && v.includes(findPattern);
      })
      .map(({ path, entry }) => ({
        path,
        from: entry.$value as string,
        to: (entry.$value as string).split(findPattern).join(replacePattern),
      }))
      .filter(({ from, to }) => from !== to);
  }, [aliasFindText, aliasReplaceText, selectedEntries]);

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
    if (aliasConflict) {
      setFeedback({ ok: false, msg: 'Alias conflicts with value transforms — disable one to apply' });
      return;
    }

    // If a type change is included and we haven't confirmed yet, show the confirmation
    if (newType !== '' && !showTypeConfirm) {
      setShowTypeConfirm(true);
      setFeedback(null);
      return;
    }
    setShowTypeConfirm(false);

    type Op = { path: string; patch: Record<string, unknown>; oldEntry: TokenMapEntry };
    const ops: Op[] = [];
    let skippedNotColor = 0;
    let skippedNotNumeric = 0;

    for (const { path, entry } of selectedEntries) {
      const patch: Record<string, unknown> = {};

      if (description.trim()) {
        patch.$description = description.trim();
      }

      {
        const extPatch: Record<string, unknown> = {};
        if (batchScopes.length > 0) {
          extPatch['com.figma.scopes'] = batchScopes;
        }
        for (const { key, value } of batchExtensions) {
          const k = key.trim();
          if (!k) continue;
          try { extPatch[k] = JSON.parse(value); } catch { extPatch[k] = value; }
        }
        if (Object.keys(extPatch).length > 0) {
          patch.$extensions = extPatch;
        }
      }

      if (newType !== '') {
        patch.$type = newType;
      }

      if (aliasActive) {
        patch.$value = aliasRef;
      }

      // Color value transforms: opacity and HSL adjust are applied sequentially to the
      // running value so they can be composed (e.g., lighten then set opacity).
      if (opacityActive || colorAdjustActive) {
        if (entry.$type === 'color') {
          let cv: unknown = entry.$value;
          if (opacityActive) {
            const pct = parseFloat(opacityPct);
            if (!isNaN(pct)) {
              const nc = applyColorOpacity(cv, pct);
              if (nc !== null) cv = nc;
            }
          }
          if (colorAdjustActive) {
            const amount = parseFloat(colorAdjustAmt);
            if (!isNaN(amount)) {
              const nc = applyColorAdjust(cv, colorAdjustOp, amount);
              if (nc !== null) cv = nc;
            }
          }
          if (cv !== entry.$value) {
            patch.$value = cv;
            patch.$type = entry.$type;
          }
        } else {
          skippedNotColor++;
        }
      }

      if (numericTransformActive) {
        if (entry.$type === 'dimension' || entry.$type === 'number') {
          const operand = parseFloat(scaleFactor);
          if (!isNaN(operand)) {
            const result = applyNumericTransform(entry.$value, numericOpMode, operand);
            if (result !== null) {
              patch.$value = result;
              patch.$type = entry.$type;
            }
          }
        } else {
          skippedNotNumeric++;
        }
      }

      if (Object.keys(patch).length > 0) {
        ops.push({ path, patch, oldEntry: entry });
      }
    }

    if (ops.length === 0) {
      if (numericTransformActive && scaleAliasCount === scalableCount) {
        setFeedback({ ok: false, msg: 'Cannot transform — all selected tokens use reference values' });
      } else if ((opacityActive || colorAdjustActive) && !hasColors) {
        setFeedback({ ok: false, msg: 'No color tokens in selection — cannot apply color transform' });
      } else if (numericTransformActive && !hasScalable) {
        setFeedback({ ok: false, msg: 'No numeric tokens in selection — cannot transform' });
      }
      return;
    }

    setApplying(true);
    setFeedback(null);

    try {
      // Single batch API call — records one operation log entry for undo
      const result = await apiFetch<{ ok: true; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patches: ops.map(({ path, patch }) => ({ path, patch })) }),
        },
      );

      if (onPushUndo && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Batch edit ${result.updated} token${result.updated === 1 ? '' : 's'}`,
          restore: async () => {
            await rollbackOperation(opId);
            onApply();
          },
        });
      }
      onApply();

      const skippedAliases = numericTransformActive ? scaleAliasCount : 0;
      const totalSkipped = skippedAliases + skippedNotColor + skippedNotNumeric;
      const skipParts: string[] = [];
      if (skippedAliases > 0) {
        skipParts.push(`${skippedAliases} reference value${skippedAliases === 1 ? '' : 's'}`);
      }
      if (skippedNotColor > 0) {
        skipParts.push(`${skippedNotColor} not color`);
      }
      if (skippedNotNumeric > 0) {
        skipParts.push(`${skippedNotNumeric} not numeric`);
      }
      const skipNote = totalSkipped > 0
        ? ` (${skipParts.join(', ')} skipped)`
        : '';
      setFeedback({ ok: totalSkipped === 0, msg: `Applied to ${ops.length} token${ops.length === 1 ? '' : 's'}${skipNote}` });
      setDescription('');
      setOpacityPct('');
      setScaleFactor('');
      setColorAdjustAmt('');
      setAliasInput('');
      setAliasRef('');
      setNewType('');
      setBatchExtensions([]);
      setTimeout(() => descriptionRef.current?.focus(), 0);
    } catch (err) {
      console.warn('[BatchEditor] batch apply failed:', err);
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
    }
  };

  const createBatchHandler = (type: 'move' | 'copy') => async () => {
    if (!connected || !canMove) return;
    const setInProgress = type === 'move' ? setMoving : setCopying;
    setInProgress(true);
    setFeedback(null);
    try {
      const paths = selectedEntries.map(e => e.path);
      const result = await apiFetch<{ ok: true; moved?: number; copied?: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-${type}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths, targetSet }),
        },
      );
      const count = (type === 'move' ? result.moved : result.copied) ?? 0;
      const pastVerb = type === 'move' ? 'Moved' : 'Copied';
      if (onPushUndo) {
        const opId = result.operationId;
        onPushUndo({
          description: `${pastVerb} ${count} token${count === 1 ? '' : 's'} to "${targetSet}"`,
          restore: async () => {
            await rollbackOperation(opId);
            onApply();
          },
        });
      }
      onApply();
      setFeedback({ ok: true, msg: `${pastVerb} ${count} token${count === 1 ? '' : 's'} to "${targetSet}"` });
      setTargetSet('');
    } catch (err) {
      console.warn(`[BatchEditor] batch ${type} failed:`, err);
      setFeedback({ ok: false, msg: `${type === 'move' ? 'Move' : 'Copy'} failed — check server connection` });
    } finally {
      setInProgress(false);
    }
  };

  const handleMove = createBatchHandler('move');
  const handleCopy = createBatchHandler('copy');

  const handleRename = async () => {
    if (!connected || !canRename) return;
    const renames = renameChanges.map(({ from, to }) => ({ oldPath: from, newPath: to }));
    if (renames.length === 0) return;

    setRenaming(true);
    setFeedback(null);
    try {
      const result = await apiFetch<{ ok: true; renamed: number; operationId: string }>(
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
    } catch (err) {
      console.warn('[BatchEditor] batch rename failed:', err);
      setFeedback({ ok: false, msg: 'Rename failed — check server connection' });
    } finally {
      setRenaming(false);
    }
  };

  const handleAliasReplace = async () => {
    if (!connected || aliasFindChanges.length === 0 || aliasReplacing) return;
    setAliasReplacing(true);
    setFeedback(null);
    try {
      const patches = aliasFindChanges.map(({ path, to }) => ({ path, patch: { $value: to } }));
      const result = await apiFetch<{ ok: true; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patches }),
        },
      );

      if (onPushUndo && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Alias replace {${aliasFindText}} → {${aliasReplaceText}} in ${result.updated} token${result.updated === 1 ? '' : 's'}`,
          restore: async () => {
            await rollbackOperation(opId);
            onApply();
          },
        });
      }
      onApply();
      setFeedback({ ok: true, msg: `Updated ${result.updated} alias reference${result.updated === 1 ? '' : 's'}` });
      setAliasFindText('');
      setAliasReplaceText('');
    } catch (err) {
      console.warn('[BatchEditor] alias replace failed:', err);
      setFeedback({ ok: false, msg: 'Alias replace failed — check server connection' });
    } finally {
      setAliasReplacing(false);
    }
  };

  // Keep a stable ref to the current handleApply so the keydown listener doesn't
  // need to be re-registered on every state change.
  handleApplyRef.current = handleApply;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleApplyRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

      {/* Custom $extensions — arbitrary namespace key-value pairs */}
      <div>
        <button
          type="button"
          onClick={() => setShowExtensions(v => !v)}
          className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true" className={`transition-transform ${showExtensions ? 'rotate-90' : ''}`}>
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <span>Extensions{batchExtensions.some(e => e.key.trim()) ? ` (${batchExtensions.filter(e => e.key.trim()).length} set)` : ''}</span>
        </button>
        {showExtensions && (
          <div className="ml-[16px] mt-1 space-y-1">
            <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">
              Merge these keys into <span className="font-mono">$extensions</span> on all {selectedPaths.size} selected token{selectedPaths.size === 1 ? '' : 's'}. Values are parsed as JSON if valid.
            </p>
            {batchExtensions.map((entry, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="text"
                  aria-label="Extension key"
                  value={entry.key}
                  onChange={e => setBatchExtensions(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                  placeholder="com.company.key"
                  className="w-[120px] h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] font-mono text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                />
                <input
                  type="text"
                  aria-label="Extension value"
                  value={entry.value}
                  onChange={e => setBatchExtensions(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  placeholder='"value" or true or 42'
                  className="flex-1 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] font-mono text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                />
                <button
                  type="button"
                  onClick={() => setBatchExtensions(prev => prev.filter((_, j) => j !== i))}
                  aria-label="Remove extension"
                  className="text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors shrink-0"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setBatchExtensions(prev => [...prev, { key: '', value: '' }])}
              className="flex items-center gap-1 text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M4 1v6M1 4h6"/></svg>
              Add extension key
            </button>
          </div>
        )}
      </div>

      {/* Opacity — when any selected token is a color */}
      {hasColors && (
        <>
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
          {!allColors && (
            <div className="ml-[88px] text-[10px] text-[var(--color-figma-text-tertiary)]">
              Applies to {colorCount} color token{colorCount === 1 ? '' : 's'} — {selectedEntries.length - colorCount} non-color skipped
            </div>
          )}
        </>
      )}

      {/* Color adjust — lighten/darken/saturate/desaturate/hue shift — when any selected token is color */}
      {hasColors && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Color adjust</span>
            <select
              value={colorAdjustOp}
              onChange={e => setColorAdjustOp(e.target.value as ColorAdjustOp)}
              className="h-6 px-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)] shrink-0"
            >
              <option value="lighten">Lighten</option>
              <option value="darken">Darken</option>
              <option value="saturate">Saturate</option>
              <option value="desaturate">Desaturate</option>
              <option value="hue">Shift hue</option>
            </select>
            <input
              type="number"
              aria-label={colorAdjustOp === 'hue' ? 'Hue shift in degrees' : 'Amount in percent'}
              step="1"
              value={colorAdjustAmt}
              onChange={e => setColorAdjustAmt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleApply(); }}
              placeholder={colorAdjustOp === 'hue' ? '°' : '%'}
              className="w-16 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
            />
            {colorAdjustAmt !== '' && !isNaN(parseFloat(colorAdjustAmt)) && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                {colorAdjustOp === 'hue' ? `${colorAdjustAmt}°` : `${colorAdjustAmt}%`}
              </span>
            )}
          </div>
          {colorAdjustPreview && colorAdjustPreview.length > 0 && (
            <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
              {(expandedPreviews['colorAdjust'] ? colorAdjustPreview : colorAdjustPreview.slice(0, PREVIEW_MAX)).map(({ path, from, to }) => (
                <div key={path} className="flex items-center gap-1.5 text-[10px] leading-snug">
                  <span className="text-[var(--color-figma-text-tertiary)] truncate max-w-[80px]" title={path}>{path.split('.').pop()}</span>
                  <span
                    className="w-3 h-3 rounded-sm shrink-0 border border-[var(--color-figma-border)]"
                    style={{ backgroundColor: String(from) }}
                    title={String(from)}
                  />
                  <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                  <span
                    className="w-3 h-3 rounded-sm shrink-0 border border-[var(--color-figma-border)]"
                    style={{ backgroundColor: String(to) }}
                    title={String(to)}
                  />
                  <span className="text-[var(--color-figma-text)] font-mono font-medium shrink-0">{String(to)}</span>
                </div>
              ))}
              {colorAdjustPreview.length > PREVIEW_MAX && (
                <button type="button" onClick={() => togglePreview('colorAdjust')} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">
                  {expandedPreviews['colorAdjust'] ? 'Show less' : `and ${colorAdjustPreview.length - PREVIEW_MAX} more…`}
                </button>
              )}
            </div>
          )}
          {!allColors && colorAdjustAmt !== '' && (
            <div className="ml-[88px] text-[10px] text-[var(--color-figma-text-tertiary)]">
              Applies to {colorCount} color token{colorCount === 1 ? '' : 's'} — {selectedEntries.length - colorCount} non-color skipped
            </div>
          )}
        </>
      )}

      {/* Numeric transform — when any selected token is dimension or number */}
      {hasScalable && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Transform</span>
            {/* Operation selector */}
            <div className="flex rounded border border-[var(--color-figma-border)] overflow-hidden shrink-0">
              {([['multiply', '×'], ['divide', '÷'], ['add', '+'], ['subtract', '−']] as [NumericOpMode, string][]).map(([op, sym], i) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => setNumericOpMode(op)}
                  aria-label={op}
                  title={op.charAt(0).toUpperCase() + op.slice(1)}
                  className={`w-6 h-6 text-[11px] font-medium transition-colors ${
                    numericOpMode === op
                      ? 'bg-[var(--color-figma-accent)] text-white'
                      : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover,rgba(0,0,0,0.06))] hover:text-[var(--color-figma-text)]'
                  }${i > 0 ? ' border-l border-[var(--color-figma-border)]' : ''}`}
                >
                  {sym}
                </button>
              ))}
            </div>
            <input
              type="number"
              aria-label="Transform operand"
              step="0.1"
              value={scaleFactor}
              onChange={e => setScaleFactor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleApply(); }}
              placeholder={numericOpMode === 'add' || numericOpMode === 'subtract' ? 'e.g. 4' : 'e.g. 1.5'}
              className={`w-24 h-6 px-1.5 rounded border bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] focus:outline-none ${
                scaleFactor !== '' && !numericTransformActive
                  ? 'border-[var(--color-figma-error)] focus:border-[var(--color-figma-error)]'
                  : 'border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)]'
              }`}
            />
            {scaleFactor !== '' && !numericTransformActive && !isNaN(parseFloat(scaleFactor)) ? (
              <span className="text-[10px] text-[var(--color-figma-error)]">cannot be 0</span>
            ) : scaleFactor !== '' && isNaN(parseFloat(scaleFactor)) ? (
              <span className="text-[10px] text-[var(--color-figma-error)]">invalid</span>
            ) : null}
          </div>
          {scaleAliasCount > 0 && numericTransformActive && (
            <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
              <span className="text-[10px] text-[var(--color-figma-warning,#f59e0b)] leading-tight font-medium">
                {scaleAliasCount === scalableCount
                  ? 'All numeric tokens use reference values and cannot be transformed:'
                  : `${scaleAliasCount} token${scaleAliasCount === 1 ? '' : 's'} will be skipped (reference values cannot be transformed):`}
              </span>
              {(expandedPreviews['skippedAlias'] ? skippedAliasTokens : skippedAliasTokens.slice(0, PREVIEW_MAX)).map(({ path, entry }) => (
                <div key={path} className="flex items-center gap-1 text-[10px] leading-snug">
                  <span className="text-[var(--color-figma-text-tertiary)] truncate max-w-[90px]" title={path}>{path.split('.').pop()}</span>
                  <span className="text-[var(--color-figma-text-secondary)] shrink-0 truncate max-w-[120px]" title={String(entry.$value)}>{String(entry.$value)}</span>
                </div>
              ))}
              {skippedAliasTokens.length > PREVIEW_MAX && (
                <button type="button" onClick={() => togglePreview('skippedAlias')} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">
                  {expandedPreviews['skippedAlias'] ? 'Show less' : `and ${skippedAliasTokens.length - PREVIEW_MAX} more…`}
                </button>
              )}
            </div>
          )}
          {scalePreview && scalePreview.length > 0 && (
            <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
              {(expandedPreviews['scale'] ? scalePreview : scalePreview.slice(0, PREVIEW_MAX)).map(({ path, from, to }) => (
                <div key={path} className="flex items-center gap-1 text-[10px] leading-snug">
                  <span className="text-[var(--color-figma-text-tertiary)] truncate max-w-[90px]" title={path}>{path.split('.').pop()}</span>
                  <span className="text-[var(--color-figma-text-secondary)] shrink-0">{formatBatchValue(from)}</span>
                  <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                  <span className="text-[var(--color-figma-text)] shrink-0 font-medium">{formatBatchValue(to)}</span>
                </div>
              ))}
              {scalePreview.length > PREVIEW_MAX && (
                <button type="button" onClick={() => togglePreview('scale')} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">
                  {expandedPreviews['scale'] ? 'Show less' : `and ${scalePreview.length - PREVIEW_MAX} more…`}
                </button>
              )}
            </div>
          )}
          {!allScalable && (
            <div className="ml-[88px] text-[10px] text-[var(--color-figma-text-tertiary)]">
              Applies to {scalableCount} numeric token{scalableCount === 1 ? '' : 's'} — {selectedEntries.length - scalableCount} non-numeric skipped
            </div>
          )}
        </>
      )}

      {/* Set alias — batch-convert all selected tokens to a reference value */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Set alias</span>
          <input
            ref={aliasInputRef}
            type="text"
            aria-label="Alias reference"
            value={aliasInput}
            onChange={e => {
              const val = e.target.value;
              setAliasInput(val);
              // Derive canonical {path} ref: accept typed {path} or bare path
              const stripped = val.startsWith('{') ? val.slice(1).replace(/\}$/, '') : val;
              const canonical = stripped ? `{${stripped}}` : '';
              setAliasRef(canonical);
              setShowAliasAutocomplete(true);
            }}
            onFocus={() => setShowAliasAutocomplete(true)}
            onBlur={() => setTimeout(() => setShowAliasAutocomplete(false), 150)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setShowAliasAutocomplete(false);
                aliasInputRef.current?.blur();
              }
            }}
            placeholder="{color.brand.primary}"
            className="flex-1 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] font-mono focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          {aliasInput && (
            <button
              type="button"
              onClick={() => { setAliasInput(''); setAliasRef(''); setShowAliasAutocomplete(false); }}
              aria-label="Clear alias"
              className="text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors shrink-0"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
        {showAliasAutocomplete && (
          <div className="ml-[88px] relative">
            <AliasAutocomplete
              query={aliasInput.startsWith('{') ? aliasInput.slice(1).replace(/\}$/, '') : aliasInput}
              allTokensFlat={allTokensFlat}
              onSelect={path => {
                const ref = `{${path}}`;
                setAliasInput(ref);
                setAliasRef(ref);
                setShowAliasAutocomplete(false);
              }}
              onClose={() => setShowAliasAutocomplete(false)}
            />
          </div>
        )}
        {aliasActive && !showAliasAutocomplete && (
          aliasConflict ? (
            <div className="ml-[88px] text-[10px] text-[var(--color-figma-error)] leading-snug">
              Alias cannot be combined with value transforms — disable one to apply
            </div>
          ) : (
            <div className="ml-[88px] text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
              Will set <span className="font-mono text-[var(--color-figma-text)]">{aliasRef}</span> on {selectedEntries.length} token{selectedEntries.length === 1 ? '' : 's'}
            </div>
          )
        )}
      </div>

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
              {(expandedPreviews['typeIncompat'] ? typeChangeInfo.incompatible : typeChangeInfo.incompatible.slice(0, PREVIEW_MAX)).map(({ path, error }) => (
                <div key={path} className="flex items-start gap-1 text-[10px] leading-snug">
                  <span className="text-[var(--color-figma-text-tertiary)] truncate max-w-[90px] shrink-0" title={path}>{path.split('.').pop()}</span>
                  <span className="text-[var(--color-figma-error,#ef4444)] truncate" title={error}>
                    {error.includes(':') ? error.split(':').slice(1).join(':').trim() : error}
                  </span>
                </div>
              ))}
              {typeChangeInfo.incompatible.length > PREVIEW_MAX && (
                <button type="button" onClick={() => togglePreview('typeIncompat')} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">
                  {expandedPreviews['typeIncompat'] ? 'Show less' : `and ${typeChangeInfo.incompatible.length - PREVIEW_MAX} more…`}
                </button>
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
        {(applying || moving || renaming || aliasReplacing) ? (
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {applying ? 'Applying…' : moving ? 'Moving…' : renaming ? 'Renaming…' : 'Replacing…'}
          </span>
        ) : feedback ? (
          <span className={`text-[10px] ${feedback.ok ? 'text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-error)]'}`}>
            {feedback.msg}
          </span>
        ) : !hasOp ? (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {!connected
              ? 'Not connected to server'
              : `Set a description${newType === '' ? ', type' : ''}${availableScopes.length > 0 ? ', scopes' : ''}, extensions${hasColors ? ', opacity or color adjust' : ''}${hasScalable ? ', transform' : ''}, or alias to apply`}
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
            {(expandedPreviews['rename'] ? renameChanges : renameChanges.slice(0, PREVIEW_MAX)).map(({ from, to }) => (
              <div key={from} className="text-[10px] leading-snug flex items-baseline gap-1">
                <span className="text-[var(--color-figma-text-secondary)] truncate shrink" title={from}>{from}</span>
                <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                <span className="text-[var(--color-figma-text)] font-medium truncate shrink" title={to}>{to}</span>
              </div>
            ))}
            {renameChanges.length > PREVIEW_MAX && (
              <button type="button" onClick={() => togglePreview('rename')} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">
                {expandedPreviews['rename'] ? 'Show less' : `and ${renameChanges.length - PREVIEW_MAX} more…`}
              </button>
            )}
          </div>
        )}

        {/* Alias find/replace — rewrite {path} references in $value strings */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0">Alias replace</span>
          <input
            type="text"
            aria-label="Find alias path"
            value={aliasFindText}
            onChange={e => setAliasFindText(e.target.value)}
            placeholder="color.primary"
            className="flex-1 min-w-0 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] font-mono focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          <input
            type="text"
            aria-label="Replace alias path with"
            value={aliasReplaceText}
            onChange={e => setAliasReplaceText(e.target.value)}
            placeholder="brand.primary"
            className="flex-1 min-w-0 h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] font-mono focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          <button
            onClick={handleAliasReplace}
            disabled={!connected || aliasFindChanges.length === 0 || aliasReplacing}
            title={
              !connected ? 'Not connected to server'
              : !aliasFindText ? 'Enter an alias path to find'
              : aliasFindChanges.length === 0 ? `No selected tokens reference {${aliasFindText}}`
              : `Rewrite ${aliasFindChanges.length} alias reference${aliasFindChanges.length === 1 ? '' : 's'}`
            }
            className="shrink-0 px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {aliasReplacing ? '…' : `Rewrite${aliasFindChanges.length > 0 ? ` ${aliasFindChanges.length}` : ''}`}
          </button>
        </div>
        {aliasFindText && aliasFindChanges.length > 0 && (
          <div className="ml-[88px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 space-y-0.5">
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] pb-0.5">
              {aliasFindChanges.length} alias reference{aliasFindChanges.length === 1 ? '' : 's'} will change:
            </div>
            {(expandedPreviews['aliasFind'] ? aliasFindChanges : aliasFindChanges.slice(0, PREVIEW_MAX)).map(({ path, from, to }) => (
              <div key={path} className="text-[10px] leading-snug flex items-baseline gap-1">
                <span className="text-[var(--color-figma-text-tertiary)] truncate shrink-0 max-w-[80px]" title={path}>{path.split('.').pop()}</span>
                <span className="text-[var(--color-figma-text-secondary)] font-mono truncate shrink" title={from}>{from}</span>
                <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                <span className="text-[var(--color-figma-text)] font-mono font-medium truncate shrink" title={to}>{to}</span>
              </div>
            ))}
            {aliasFindChanges.length > PREVIEW_MAX && (
              <button type="button" onClick={() => togglePreview('aliasFind')} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">
                {expandedPreviews['aliasFind'] ? 'Show less' : `and ${aliasFindChanges.length - PREVIEW_MAX} more…`}
              </button>
            )}
          </div>
        )}
        {aliasFindText && aliasFindChanges.length === 0 && (
          <div className="ml-[88px] text-[10px] text-[var(--color-figma-text-tertiary)]">
            No selected tokens reference <span className="font-mono">{`{${aliasFindText}}`}</span>
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
              onClick={handleCopy}
              disabled={!connected || !canCopy || copying}
              title={!connected ? 'Not connected to server' : targetSet === '' ? 'Choose a target set first' : `Copy ${selectedPaths.size} token${selectedPaths.size === 1 ? '' : 's'} to "${targetSet}" (originals preserved)`}
              className="shrink-0 px-2 py-1 rounded text-[10px] font-medium border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copying ? '…' : 'Copy'}
            </button>
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
              {(expandedPreviews['move'] ? movePreview.items : movePreview.items.slice(0, PREVIEW_MAX)).map(({ path, conflict }) => (
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
                <button type="button" onClick={() => togglePreview('move')} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">
                  {expandedPreviews['move'] ? 'Show less' : `and ${movePreview.items.length - PREVIEW_MAX} more…`}
                </button>
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
