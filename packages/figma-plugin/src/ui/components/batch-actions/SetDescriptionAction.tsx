import { useState } from 'react';
import type { BatchActionProps } from './types';
import { apiFetch } from '../../shared/apiFetch';
import { rollbackOperation } from './transforms';
import { ActionFeedback } from './BatchActionPreview';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';

export function SetDescriptionAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const trimmed = description.trim();
  const canApply = trimmed.length > 0 && selectedPaths.size > 0 && connected;

  async function handleApply() {
    setFeedback(null);
    try {
      const patches = selectedEntries.map(({ path }) => ({
        path,
        patch: { $description: trimmed },
      }));
      const result = await apiFetch<{ ok: boolean; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        { method: 'POST', body: JSON.stringify({ patches }), headers: { 'Content-Type': 'application/json' } },
      );
      setFeedback({ ok: true, msg: `Updated ${result.updated} tokens` });
      setDescription('');
      if (onPushUndo && result.updated > 0) {
        onPushUndo({
          description: `Set description on ${result.updated} tokens`,
          restore: async () => {
            await rollbackOperation(serverUrl, result.operationId);
            onApply();
          },
        });
      }
      onApply();
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Failed' });
    }
  }

  return (
    <EditorShell
      title="Set description"
      surface="authoring"
      footer={
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          <div className={AUTHORING_SURFACE_CLASSES.footerMeta}>
            <ActionFeedback feedback={feedback} />
          </div>
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button onClick={handleApply} disabled={!canApply} className={AUTHORING.footerBtnPrimary}>
                Apply to {selectedPaths.size}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <div className={AUTHORING.fieldStack}>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Set on all selected…"
            className={AUTHORING.input}
          />
        </div>
      </div>
    </EditorShell>
  );
}
