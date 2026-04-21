import { useState, useMemo } from 'react';
import { TokenValidator } from '@tokenmanager/core';
import type { Token } from '@tokenmanager/core';
import { apiFetch } from '../../shared/apiFetch';
import { AUTHORING } from '../../shared/editorClasses';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import type { BatchActionProps } from './types';
import { DTCG_TYPES, PREVIEW_MAX, rollbackOperation } from './transforms';
import { PreviewPath, ActionFeedback } from './BatchActionPreview';

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
          description: `Change type to ${newType} on ${result.updated} token${result.updated === 1 ? '' : 's'}`,
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
          <div className={AUTHORING_SURFACE_CLASSES.footerMeta}>
            <ActionFeedback feedback={feedback} />
          </div>
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button
                onClick={handleApply}
                disabled={applying || !connected || !newType}
                className={AUTHORING.footerBtnPrimary}
              >
                {applying ? 'Applying…' : showConfirm ? (hasIncompatible ? 'Change anyway' : 'Confirm') : `Apply to ${selectedPaths.size}`}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <select
          value={newType}
          onChange={e => { setNewType(e.target.value); setShowConfirm(false); }}
          aria-label="New token type"
          className={AUTHORING.select}
        >
          <option value="">Choose type…</option>
          {DTCG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {newType && typeChangeInfo && !showConfirm && typeChangeInfo.currentTypes.length > 0 && (
          <div className="text-secondary text-[var(--color-figma-text-secondary)] leading-snug">
            {typeChangeInfo.currentTypes.join(', ')} → <span className="text-[var(--color-figma-text)] font-medium">{newType}</span>
            {' '}on {typeChangeInfo.count} token{typeChangeInfo.count === 1 ? '' : 's'}
            {hasIncompatible && (
              <span className="text-[var(--color-figma-error)]">
                {' '}— {typeChangeInfo.incompatible.length} with incompatible value{typeChangeInfo.incompatible.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}

        {showConfirm && typeChangeInfo && (
          <div className={`rounded border px-2 py-1.5 space-y-1 ${
            hasIncompatible
              ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/8'
              : 'border-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/8'
          }`}>
            <p className="text-secondary text-[var(--color-figma-text)] leading-snug">
              Change type of <strong>{typeChangeInfo.count}</strong> token{typeChangeInfo.count === 1 ? '' : 's'}
              {typeChangeInfo.currentTypes.length > 0 && (
                <> from <strong>{typeChangeInfo.currentTypes.join(', ')}</strong></>
              )} to <strong>{newType}</strong>?
            </p>
            {hasIncompatible ? (
              <div className="space-y-0.5">
                <p className="text-secondary text-[var(--color-figma-error)] leading-snug font-medium">
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
                  <button type="button" onClick={() => setExpanded(v => !v)} className="text-secondary text-[var(--color-figma-accent)] hover:underline text-left">
                    {expanded ? 'Show less' : `and ${typeChangeInfo.incompatible.length - PREVIEW_MAX} more…`}
                  </button>
                )}
                <p className="text-secondary text-[var(--color-figma-text-secondary)] leading-snug">
                  This will produce invalid tokens. Update values afterward or cancel.
                </p>
              </div>
            ) : (
              <p className="text-secondary text-[var(--color-figma-text-secondary)] leading-snug">
                May break alias references depending on the current type.
              </p>
            )}
            <button
              onClick={() => setShowConfirm(false)}
              className="text-secondary text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </EditorShell>
  );
}
