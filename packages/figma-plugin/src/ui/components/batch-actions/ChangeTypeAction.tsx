import { useState, useMemo } from 'react';
import { TokenValidator } from '@tokenmanager/core';
import type { Token } from '@tokenmanager/core';
import { apiFetch } from '../../shared/apiFetch';
import { AUTHORING } from '../../shared/editorClasses';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import type { BatchActionProps } from './types';
import { PREVIEW_MAX, rollbackOperation } from './transforms';
import { PreviewPath, ActionFeedbackToast } from './BatchActionPreview';
import { TypePicker } from '../TypePicker';
import { getTokenTypeLabel } from '../../shared/tokenTypeCategories';

const typeValidator = new TokenValidator();

export function ChangeTypeAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [newType, setNewType] = useState('');
  const [applying, setApplying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const typeChangeInfo = useMemo(() => {
    if (!newType) return null;
    const currentTypes = [...new Set(selectedEntries.map(x => x.entry.$type).filter(Boolean))];
    const incompatible: { path: string; error: string }[] = [];
    for (const { path, entry } of selectedEntries) {
      if (entry.$type === newType) continue;
      const result = typeValidator.validate({ $value: entry.$value, $type: newType } as Token, path);
      if (!result.valid) {
        incompatible.push({ path, error: result.errors[0] ?? 'incompatible value' });
      }
    }
    return { currentTypes, count: selectedEntries.length, incompatible };
  }, [newType, selectedEntries]);

  const currentTypeLabels = useMemo(
    () => typeChangeInfo?.currentTypes.map(getTokenTypeLabel).join(', ') ?? '',
    [typeChangeInfo],
  );
  const newTypeLabel = getTokenTypeLabel(newType);

  const handleApply = async () => {
    if (!connected || applying || !newType) return;

    if (!showConfirm) {
      setShowConfirm(true);
      setFeedback(null);
      return;
    }

    setApplying(true);
    setFeedback(null);
    try {
      const patches = selectedEntries.map(({ path }) => ({ path, patch: { $type: newType } }));
      const result = await apiFetch<{ ok: true; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patches }),
        },
      );
      if (onPushUndo && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Change type to ${newTypeLabel} on ${result.updated} token${result.updated === 1 ? '' : 's'}`,
          restore: async () => { await rollbackOperation(serverUrl, opId); onApply(); },
        });
      }
      onApply();
      setFeedback({ ok: true, msg: `Changed type on ${result.updated} token${result.updated === 1 ? '' : 's'}` });
      setNewType('');
      setShowConfirm(false);
    } catch {
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
    }
  };

  const hasIncompatible = (typeChangeInfo?.incompatible.length ?? 0) > 0;

  return (
    <EditorShell
      title="Change type"
      surface="authoring"
      footer={
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          <ActionFeedbackToast feedback={feedback} />
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button
                onClick={handleApply}
                disabled={applying || !connected || !newType || hasIncompatible}
                className={AUTHORING.footerBtnPrimary}
              >
                {applying
                  ? 'Applying…'
                  : hasIncompatible
                    ? `${typeChangeInfo?.incompatible.length ?? 0} incompatible`
                    : showConfirm
                      ? 'Confirm'
                      : `Apply to ${selectedPaths.size}`}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <TypePicker
          value={newType}
          onChange={v => { setNewType(v); setShowConfirm(false); }}
          ariaLabel="New token type"
          placeholder="Choose type…"
          className={AUTHORING.select}
        />

        {newType && typeChangeInfo && !showConfirm && typeChangeInfo.currentTypes.length > 0 && (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)] leading-snug">
            {currentTypeLabels} → <span className="text-[color:var(--color-figma-text)] font-medium">{newTypeLabel}</span>
            {' '}on {typeChangeInfo.count} token{typeChangeInfo.count === 1 ? '' : 's'}
            {hasIncompatible && (
              <span className="text-[color:var(--color-figma-text-error)]">
                {' '}— {typeChangeInfo.incompatible.length} with incompatible value{typeChangeInfo.incompatible.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        {(showConfirm || hasIncompatible) && typeChangeInfo && (
          <div className={`rounded border px-2 py-1.5 space-y-1 ${
            hasIncompatible
              ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/8'
              : 'border-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/8'
          }`}>
            <p className="text-secondary text-[color:var(--color-figma-text)] leading-snug">
              Change type of <strong>{typeChangeInfo.count}</strong> token{typeChangeInfo.count === 1 ? '' : 's'}
              {typeChangeInfo.currentTypes.length > 0 && (
                <> from <strong>{currentTypeLabels}</strong></>
              )} to <strong>{newTypeLabel}</strong>?
            </p>
            {hasIncompatible ? (
              <div className="space-y-0.5">
                <p className="text-secondary text-[color:var(--color-figma-text-error)] leading-snug font-medium">
                  {typeChangeInfo.incompatible.length} token{typeChangeInfo.incompatible.length === 1 ? ' has a' : 's have'} incompatible value{typeChangeInfo.incompatible.length === 1 ? '' : 's'}:
                </p>
                {(expanded ? typeChangeInfo.incompatible : typeChangeInfo.incompatible.slice(0, PREVIEW_MAX)).map(({ path, error }) => (
                  <div key={path} className="flex flex-col gap-0.5 text-secondary leading-snug">
                    <PreviewPath path={path} />
                    <span className={LONG_TEXT_CLASSES.text} title={error}>
                      {error.includes(':') ? error.split(':').slice(1).join(':').trim() : error}
                    </span>
                  </div>
                ))}
                {typeChangeInfo.incompatible.length > PREVIEW_MAX && (
                  <button type="button" onClick={() => setExpanded(v => !v)} className="text-secondary text-[color:var(--color-figma-text-accent)] hover:underline text-left">
                    {expanded ? 'Show less' : `and ${typeChangeInfo.incompatible.length - PREVIEW_MAX} more…`}
                  </button>
                )}
                <p className="text-secondary text-[color:var(--color-figma-text-secondary)] leading-snug">
                  Change is blocked until these values are updated or removed from selection.
                </p>
              </div>
            ) : (
              <p className="text-secondary text-[color:var(--color-figma-text-secondary)] leading-snug">
                May break alias references depending on the current type.
              </p>
            )}
            <button
              onClick={() => setShowConfirm(false)}
              className="text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-secondary)] underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </EditorShell>
  );
}
