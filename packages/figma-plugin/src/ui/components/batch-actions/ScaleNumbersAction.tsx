import { useState, useMemo } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import type { BatchActionProps } from './types';
import type { NumericOpMode } from './transforms';
import {
  applyNumericTransform,
  COMPOSITE_SUB_PROPS_BY_TYPE, COMPOSITE_TOKEN_TYPES,
  PREVIEW_MAX, rollbackOperation,
} from './transforms';
import { PreviewPath, PreviewCard, ValueTransition, ActionFeedback } from './BatchActionPreview';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';

const OP_SYMBOLS: [NumericOpMode, string][] = [['multiply', '×'], ['divide', '÷'], ['add', '+'], ['subtract', '−']];

export function ScaleNumbersAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [opMode, setOpMode] = useState<NumericOpMode>('multiply');
  const [operand, setOperand] = useState('');
  const [compositeSubPropKey, setCompositeSubPropKey] = useState('');
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expandedPreviews, setExpandedPreviews] = useState<Record<string, boolean>>({});

  const togglePreview = (key: string) => setExpandedPreviews(p => ({ ...p, [key]: !p[key] }));

  const numericEntries = useMemo(
    () => selectedEntries.filter(x => x.entry.$type === 'dimension' || x.entry.$type === 'number'),
    [selectedEntries],
  );
  const numericCount = numericEntries.length;

  const skippedAliasTokens = useMemo(
    () => numericEntries.filter(({ entry }) => typeof entry.$value === 'string' && (entry.$value as string).includes('{')),
    [numericEntries],
  );

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
  const numericSubProps = useMemo(() => {
    const result: Array<{ key: string; type: string; count: number }> = [];
    for (const [type, entries] of compositeTypeGroups) {
      const defs = COMPOSITE_SUB_PROPS_BY_TYPE[type];
      if (!defs) continue;
      for (const def of defs) {
        if (def.kind === 'numeric') result.push({ key: `${type}.${def.key}`, type, count: entries.length });
      }
    }
    return result;
  }, [compositeTypeGroups]);
  const hasSubProps = numericSubProps.length > 0;

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

  const transformActive = useMemo(() => {
    if (operand === '') return false;
    const n = parseFloat(operand);
    if (isNaN(n)) return false;
    if (opMode === 'multiply' || opMode === 'divide') return n !== 0;
    return true;
  }, [operand, opMode]);

  const scalePreview = useMemo(() => {
    if (!transformActive) return null;
    const n = parseFloat(operand);
    return numericEntries
      .map(({ path, entry }) => {
        const result = applyNumericTransform(entry.$value, opMode, n);
        if (result === null) return null;
        return { path, from: entry.$value, to: result };
      })
      .filter(Boolean) as Array<{ path: string; from: unknown; to: unknown }>;
  }, [transformActive, operand, opMode, numericEntries]);

  const handleApply = async () => {
    if (!connected || applying || !transformActive) return;
    setApplying(true);
    setFeedback(null);
    const n = parseFloat(operand);

    const patches: Array<{ path: string; patch: Record<string, unknown> }> = [];

    for (const { path, entry } of numericEntries) {
      const result = applyNumericTransform(entry.$value, opMode, n);
      if (result !== null) {
        patches.push({ path, patch: { $value: result, $type: entry.$type } });
      }
    }

    if (compositeSubPropName && compositeSubPropTargets.length > 0) {
      for (const { path, entry } of compositeSubPropTargets) {
        const v = entry.$value;
        let newValue: unknown = null;

        const transformObj = (obj: Record<string, unknown>): Record<string, unknown> | null => {
          const newSub = applyNumericTransform(obj[compositeSubPropName], opMode, n);
          return newSub !== null ? { ...obj, [compositeSubPropName]: newSub } : null;
        };

        if (Array.isArray(v)) {
          let changed = false;
          const newArr = v.map(item => {
            if (typeof item !== 'object' || item === null || !(compositeSubPropName in (item as object))) return item;
            const result = transformObj(item as Record<string, unknown>);
            if (result) { changed = true; return result; }
            return item;
          });
          if (changed) newValue = newArr;
        } else if (typeof v === 'object' && v !== null) {
          newValue = transformObj(v as Record<string, unknown>);
        }

        if (newValue !== null) {
          const existing = patches.find(p => p.path === path);
          if (existing) existing.patch.$value = newValue;
          else patches.push({ path, patch: { $value: newValue, $type: entry.$type } });
        }
      }
    }

    if (patches.length === 0) {
      setFeedback({ ok: false, msg: skippedAliasTokens.length > 0 ? 'All selected tokens use reference values' : 'No changes to apply' });
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
          description: `Scale ${result.updated} token${result.updated === 1 ? '' : 's'}`,
          restore: async () => { await rollbackOperation(serverUrl, opId); onApply(); },
        });
      }
      onApply();
      const skipped = skippedAliasTokens.length;
      const skipNote = skipped > 0 ? ` (${skipped} reference value${skipped === 1 ? '' : 's'} skipped)` : '';
      setFeedback({ ok: skipped === 0, msg: `Applied to ${result.updated} token${result.updated === 1 ? '' : 's'}${skipNote}` });
      setOperand('');
    } catch {
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <EditorShell
      title="Scale numbers"
      surface="authoring"
      footer={
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          <div className={AUTHORING_SURFACE_CLASSES.footerMeta}>
            <ActionFeedback feedback={feedback} />
          </div>
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button onClick={handleApply} disabled={applying || !connected || !transformActive} className={AUTHORING.footerBtnPrimary}>
                {applying ? 'Applying…' : `Apply to ${selectedPaths.size}`}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded border border-[var(--color-figma-border)] overflow-hidden shrink-0">
            {OP_SYMBOLS.map(([op, sym], i) => (
              <button
                key={op} type="button" onClick={() => setOpMode(op)}
                aria-label={op}
                title={op.charAt(0).toUpperCase() + op.slice(1)}
                className={`w-6 h-6 text-body font-medium transition-colors ${
                  opMode === op
                    ? 'bg-[var(--color-figma-accent)] text-white'
                    : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover,rgba(0,0,0,0.06))] hover:text-[var(--color-figma-text)]'
                }${i > 0 ? ' border-l border-[var(--color-figma-border)]' : ''}`}
              >
                {sym}
              </button>
            ))}
          </div>
          <input
            type="number" step="0.1"
            value={operand}
            onChange={e => setOperand(e.target.value)}
            placeholder={opMode === 'add' || opMode === 'subtract' ? 'e.g. 4' : 'e.g. 1.5'}
            className={`min-w-[96px] flex-1 ${AUTHORING.inputBase} ${
              operand !== '' && !transformActive ? 'border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]' : ''
            }`}
            aria-label="Transform operand"
          />
          {operand !== '' && !transformActive && !isNaN(parseFloat(operand)) && (
            <span className="text-secondary text-[var(--color-figma-error)]">cannot be 0</span>
          )}
        </div>

        {skippedAliasTokens.length > 0 && transformActive && (
          <PreviewCard
            count={skippedAliasTokens.length}
            expanded={expandedPreviews['skipped']}
            onToggleExpand={() => togglePreview('skipped')}
          >
            <span className="text-secondary text-[var(--color-figma-warning)] leading-tight font-medium">
              {skippedAliasTokens.length === numericCount
                ? 'All numeric tokens use reference values and cannot be transformed:'
                : `${skippedAliasTokens.length} token${skippedAliasTokens.length === 1 ? '' : 's'} will be skipped (reference values):`}
            </span>
            {(expandedPreviews['skipped'] ? skippedAliasTokens : skippedAliasTokens.slice(0, PREVIEW_MAX)).map(({ path, entry }) => (
              <div key={path} className="flex flex-col gap-0.5 text-secondary leading-snug">
                <PreviewPath path={path} />
                <span className={LONG_TEXT_CLASSES.monoSecondary}>{String(entry.$value)}</span>
              </div>
            ))}
          </PreviewCard>
        )}

        {scalePreview && scalePreview.length > 0 && (
          <PreviewCard count={scalePreview.length} expanded={expandedPreviews['scale']} onToggleExpand={() => togglePreview('scale')}>
            {(expandedPreviews['scale'] ? scalePreview : scalePreview.slice(0, PREVIEW_MAX)).map(({ path, from, to }) => (
              <div key={path} className="flex flex-col gap-0.5 text-secondary leading-snug">
                <PreviewPath path={path} />
                <ValueTransition from={from} to={to} />
              </div>
            ))}
          </PreviewCard>
        )}

        {numericCount > 0 && numericCount < selectedEntries.length && transformActive && (
          <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
            Applies to {numericCount} numeric token{numericCount === 1 ? '' : 's'} — {selectedEntries.length - numericCount} non-numeric skipped
          </div>
        )}

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
                {numericSubProps.map(({ key, type, count }) => (
                  <option key={key} value={key}>
                    {type}: {key.split('.').slice(1).join('.')} ({count} token{count !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
              {compositeSubPropKey && (
                <button
                  type="button"
                  onClick={() => setCompositeSubPropKey('')}
                  className="h-6 px-2 rounded border border-[var(--color-figma-border)] text-secondary text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
            {compositeSubPropKey && compositeSubPropTargets.length > 0 && (
              <div className="text-secondary text-[var(--color-figma-text-secondary)] leading-snug">
                Transform will also target <span className="font-mono text-[var(--color-figma-text)]">.{compositeSubPropName}</span> on {compositeSubPropTargets.length} {compositeSubPropType} token{compositeSubPropTargets.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </EditorShell>
  );
}
