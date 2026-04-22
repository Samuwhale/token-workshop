import { useMemo, useState } from 'react';
import type { BatchActionProps } from './types';
import { apiFetch } from '../../shared/apiFetch';
import { rollbackOperation } from './transforms';
import { ActionFeedback } from './BatchActionPreview';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import { ScopeEditor } from '../ScopeEditor';

export function FigmaScopesAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const tokenTypes = useMemo(
    () => Array.from(new Set(selectedEntries.map(({ entry }) => entry.$type as string))),
    [selectedEntries],
  );

  async function handleApply() {
    setFeedback(null);
    try {
      const patches = selectedEntries.map(({ path }) => ({
        path,
        patch: { $extensions: { 'com.figma.scopes': selectedScopes } },
      }));
      const result = await apiFetch<{ ok: boolean; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        { method: 'POST', body: JSON.stringify({ patches }), headers: { 'Content-Type': 'application/json' } },
      );
      setFeedback({ ok: true, msg: `Updated ${result.updated} tokens` });
      if (onPushUndo && result.updated > 0) {
        onPushUndo({
          description: `Set Figma scopes on ${result.updated} tokens`,
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
      title="Figma scopes"
      surface="authoring"
      footer={
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          <div className={AUTHORING_SURFACE_CLASSES.footerMeta}>
            <ActionFeedback feedback={feedback} />
          </div>
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button onClick={handleApply} disabled={selectedPaths.size === 0 || !connected} className={AUTHORING.footerBtnPrimary}>
                Apply to {selectedPaths.size}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <ScopeEditor
          tokenTypes={tokenTypes}
          selectedScopes={selectedScopes}
          onChange={setSelectedScopes}
        />
      </div>
    </EditorShell>
  );
}
