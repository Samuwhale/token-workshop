import { useState, useMemo } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import type { BatchActionProps } from './types';
import type { ColorAdjustOp } from './transforms';
import {
  applyColorOpacity, applyColorAdjust,
  COMPOSITE_SUB_PROPS_BY_TYPE, COMPOSITE_TOKEN_TYPES,
  PREVIEW_MAX, rollbackOperation,
} from './transforms';
import { PreviewPath, PreviewCard, ColorTransition, ActionFeedbackToast } from './BatchActionPreview';

export function AdjustColorsAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [opacityPct, setOpacityPct] = useState('');
  const [colorAdjustOp, setColorAdjustOp] = useState<ColorAdjustOp>('lighten');
  const [colorAdjustAmt, setColorAdjustAmt] = useState('');
  const [compositeSubPropKey, setCompositeSubPropKey] = useState('');
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expandedPreviews, setExpandedPreviews] = useState<Record<string, boolean>>({});

  const togglePreview = (key: string) => setExpandedPreviews(p => ({ ...p, [key]: !p[key] }));

  const colorEntries = useMemo(
    () => selectedEntries.filter(x => x.entry.$type === 'color'),
    [selectedEntries],
  );
  const colorCount = colorEntries.length;

  const compositeEntries = useMemo(
    () => selectedEntries.filter(({ entry }) => COMPOSITE_TOKEN_TYPES.has(entry.$type ?? '')),
    [selectedEntries],
  );
  const compositeTypeGroups = useMemo(() => {
    const groups = new Map<string, typeof compositeEntries>();
    for (const e of compositeEntries) {
      const type = e.entry.$type ?? '';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(e);
    }
    return groups;
  }, [compositeEntries]);
  const colorSubProps = useMemo(() => {
    const result: Array<{ key: string; type: string; count: number }> = [];
    for (const [type, entries] of compositeTypeGroups) {
      const defs = COMPOSITE_SUB_PROPS_BY_TYPE[type];
      if (!defs) continue;
      for (const def of defs) {
        if (def.kind === 'color') result.push({ key: `${type}.${def.key}`, type, count: entries.length });
      }
    }
    return result;
  }, [compositeTypeGroups]);
  const hasSubProps = colorSubProps.length > 0;

  const compositeSubPropType = compositeSubPropKey ? compositeSubPropKey.split('.')[0] : '';
  const compositeSubPropName = compositeSubPropKey ? compositeSubPropKey.split('.').slice(1).join('.') : '';

  const compositeSubPropTargets = useMemo(() => {
    if (!compositeSubPropType || !compositeSubPropName) return [];
    return selectedEntries.filter(({ entry }) => {
      if (entry.$type !== compositeSubPropType) return false;
      const v = entry.$value;
      if (Array.isArray(v)) return v.some(item => typeof item === 'object' && item !== null && compositeSubPropName in (item as object));
      return typeof v === 'object' && v !== null && compositeSubPropName in (v as Record<string, unknown>);
    });
  }, [compositeSubPropType, compositeSubPropName, selectedEntries]);

  const opacityActive = opacityPct !== '' && !isNaN(parseFloat(opacityPct));
  const colorAdjustActive = colorAdjustAmt !== '' && !isNaN(parseFloat(colorAdjustAmt));
  const hasAnyOp = opacityActive || colorAdjustActive;

  const opacityPreview = useMemo(() => {
    if (!opacityActive) return null;
    const pct = parseFloat(opacityPct);
    return colorEntries
      .map(({ path, entry }) => {
        const result = applyColorOpacity(entry.$value, pct);
        if (!result) return null;
        return { path, from: entry.$value, to: result };
      })
      .filter(Boolean) as Array<{ path: string; from: unknown; to: string }>;
  }, [opacityActive, opacityPct, colorEntries]);

  const colorAdjustPreview = useMemo(() => {
    if (!colorAdjustActive) return null;
    const amount = parseFloat(colorAdjustAmt);
    return colorEntries
      .map(({ path, entry }) => {
        const result = applyColorAdjust(entry.$value, colorAdjustOp, amount);
        if (!result) return null;
        return { path, from: entry.$value, to: result };
      })
      .filter(Boolean) as Array<{ path: string; from: unknown; to: string }>;
  }, [colorAdjustActive, colorAdjustAmt, colorAdjustOp, colorEntries]);

  const handleApply = async () => {
    if (!connected || applying || !hasAnyOp) return;
    setApplying(true);
    setFeedback(null);

    const patches: Array<{ path: string; patch: Record<string, unknown> }> = [];

    for (const { path, entry } of selectedEntries) {
      if (entry.$type === 'color') {
        let cv: unknown = entry.$value;
        if (opacityActive) {
          const nc = applyColorOpacity(cv, parseFloat(opacityPct));
          if (nc !== null) cv = nc;
        }
        if (colorAdjustActive) {
          const nc = applyColorAdjust(cv, colorAdjustOp, parseFloat(colorAdjustAmt));
          if (nc !== null) cv = nc;
        }
        if (cv !== entry.$value) {
          patches.push({ path, patch: { $value: cv, $type: entry.$type } });
        }
      }
    }

    if (compositeSubPropName && compositeSubPropTargets.length > 0) {
      const transformSub = (subVal: unknown): unknown => {
        let v = subVal;
        if (opacityActive) { const nc = applyColorOpacity(v, parseFloat(opacityPct)); if (nc !== null) v = nc; }
        if (colorAdjustActive) { const nc = applyColorAdjust(v, colorAdjustOp, parseFloat(colorAdjustAmt)); if (nc !== null) v = nc; }
        return v;
      };

      for (const { path, entry } of compositeSubPropTargets) {
        const v = entry.$value;
        let newValue: unknown = null;

        if (Array.isArray(v)) {
          let changed = false;
          const newArr = v.map(item => {
            if (typeof item !== 'object' || item === null || !(compositeSubPropName in (item as object))) return item;
            const obj = item as Record<string, unknown>;
            const newSub = transformSub(obj[compositeSubPropName]);
            if (newSub !== obj[compositeSubPropName]) { changed = true; return { ...obj, [compositeSubPropName]: newSub }; }
            return item;
          });
          if (changed) newValue = newArr;
        } else if (typeof v === 'object' && v !== null) {
          const obj = v as Record<string, unknown>;
          const newSub = transformSub(obj[compositeSubPropName]);
          if (newSub !== obj[compositeSubPropName]) newValue = { ...obj, [compositeSubPropName]: newSub };
        }

        if (newValue !== null) {
          const existing = patches.find(p => p.path === path);
          if (existing) existing.patch.$value = newValue;
          else patches.push({ path, patch: { $value: newValue, $type: entry.$type } });
        }
      }
    }

    if (patches.length === 0) {
      setFeedback({ ok: false, msg: 'No changes to apply' });
      setApplying(false);
      return;
    }

    try {
      const result = await apiFetch<{ ok: true; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patches }) },
      );
      if (onPushUndo && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Adjust colors on ${result.updated} token${result.updated === 1 ? '' : 's'}`,
          restore: async () => { await rollbackOperation(serverUrl, opId); onApply(); },
        });
      }
      onApply();
      setFeedback({ ok: true, msg: `Applied to ${result.updated} token${result.updated === 1 ? '' : 's'}` });
      setOpacityPct('');
      setColorAdjustAmt('');
    } catch {
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <EditorShell
      title="Adjust colors"
      surface="authoring"
      footer={
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          <ActionFeedbackToast feedback={feedback} />
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button onClick={handleApply} disabled={applying || !connected || !hasAnyOp} className={AUTHORING.footerBtnPrimary}>
                {applying ? 'Applying…' : `Apply to ${selectedPaths.size}`}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        {/* Opacity */}
        <div className={AUTHORING.sectionCard}>
          <div className={AUTHORING.label}>Opacity %</div>
          <div className="space-y-1">
            <input
              type="range" min="0" max="100" step="1"
              value={opacityPct === '' ? 0 : Math.min(100, Math.max(0, Math.round(parseFloat(opacityPct) || 0)))}
              onChange={e => setOpacityPct(e.target.value)}
              className="w-full accent-[var(--color-figma-accent)]"
              aria-label="Opacity"
            />
            <input
              type="number" min="0" max="100"
              value={opacityPct}
              onChange={e => setOpacityPct(e.target.value)}
              onBlur={e => {
                if (e.target.value === '') return;
                const n = parseFloat(e.target.value);
                if (!isNaN(n)) setOpacityPct(String(Math.min(100, Math.max(0, Math.round(n)))));
              }}
              placeholder="—"
              className={`w-16 ${AUTHORING.inputBase} text-right`}
              aria-label="Opacity value"
            />
          </div>
          {opacityPreview && opacityPreview.length > 0 && (
            <PreviewCard count={opacityPreview.length} expanded={expandedPreviews['opacity']} onToggleExpand={() => togglePreview('opacity')}>
              {(expandedPreviews['opacity'] ? opacityPreview : opacityPreview.slice(0, PREVIEW_MAX)).map(({ path, from, to }) => (
                <div key={path} className="flex flex-col gap-1 text-secondary leading-snug">
                  <PreviewPath path={path} />
                  <ColorTransition from={from} to={to} />
                </div>
              ))}
            </PreviewCard>
          )}
        </div>

        {/* Color adjust */}
        <div className={AUTHORING.sectionCard}>
          <div className={AUTHORING.label}>Color adjust</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={colorAdjustOp}
              onChange={e => setColorAdjustOp(e.target.value as ColorAdjustOp)}
              className={`min-w-0 flex-1 ${AUTHORING.inputBase}`}
              aria-label="Color adjustment"
            >
              <option value="lighten">Lighten</option>
              <option value="darken">Darken</option>
              <option value="saturate">Saturate</option>
              <option value="desaturate">Desaturate</option>
              <option value="hue">Shift hue</option>
            </select>
            <input
              type="number" step="1"
              value={colorAdjustAmt}
              onChange={e => setColorAdjustAmt(e.target.value)}
              placeholder={colorAdjustOp === 'hue' ? '°' : '%'}
              className={`w-20 ${AUTHORING.inputBase}`}
              aria-label={colorAdjustOp === 'hue' ? 'Hue shift in degrees' : 'Amount in percent'}
            />
          </div>
          {colorAdjustPreview && colorAdjustPreview.length > 0 && (
            <PreviewCard count={colorAdjustPreview.length} expanded={expandedPreviews['adjust']} onToggleExpand={() => togglePreview('adjust')}>
              {(expandedPreviews['adjust'] ? colorAdjustPreview : colorAdjustPreview.slice(0, PREVIEW_MAX)).map(({ path, from, to }) => (
                <div key={path} className="flex flex-col gap-1 text-secondary leading-snug">
                  <PreviewPath path={path} />
                  <ColorTransition from={from} to={to} />
                </div>
              ))}
            </PreviewCard>
          )}
          {colorCount > 0 && colorCount < selectedEntries.length && hasAnyOp && (
            <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
              Applies to {colorCount} color token{colorCount === 1 ? '' : 's'} — {selectedEntries.length - colorCount} non-color skipped
            </div>
          )}
        </div>

        {/* Composite sub-property targeting */}
        {hasSubProps && (
          <div className={AUTHORING.sectionCard}>
            <div className={AUTHORING.label}>Sub-property</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={compositeSubPropKey}
                onChange={e => setCompositeSubPropKey(e.target.value)}
                className={`min-w-0 flex-1 ${AUTHORING.inputBase}`}
                aria-label="Composite sub-property"
              >
                <option value="">None</option>
                {colorSubProps.map(({ key, type, count }) => (
                  <option key={key} value={key}>
                    {type}: {key.split('.').slice(1).join('.')} ({count} token{count !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
              {compositeSubPropKey && (
                <button
                  type="button"
                  onClick={() => setCompositeSubPropKey('')}
                  className="h-6 px-2 rounded border border-[var(--color-figma-border)] text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-secondary)] transition-colors shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
            {compositeSubPropKey && compositeSubPropTargets.length > 0 && (
              <div className="text-secondary text-[color:var(--color-figma-text-secondary)] leading-snug">
                Adjustments will also target <span className="font-mono text-[color:var(--color-figma-text)]">.{compositeSubPropName}</span> on {compositeSubPropTargets.length} {compositeSubPropType} token{compositeSubPropTargets.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </EditorShell>
  );
}
