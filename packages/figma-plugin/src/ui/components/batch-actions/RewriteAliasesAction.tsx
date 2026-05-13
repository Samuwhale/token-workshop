import { useState, useMemo } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { AUTHORING } from '../../shared/editorClasses';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import { PreviewPath, PreviewCard, ValueTransition, ActionFeedbackToast } from './BatchActionPreview';
import { rollbackOperation, PREVIEW_MAX } from './transforms';
import type { BatchActionProps } from './types';

export function RewriteAliasesAction({
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [findAlias, setFindAlias] = useState('');
  const [replaceAlias, setReplaceAlias] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const matches = useMemo(() => {
    if (!findAlias) return [];
    const needle = `{${findAlias}}`;
    return selectedEntries.filter(
      ({ entry }) => typeof entry.$value === 'string' && entry.$value.includes(needle),
    );
  }, [findAlias, selectedEntries]);

  const canApply = matches.length > 0 && replaceAlias.length > 0 && !replacing && connected;

  async function handleApply() {
    setReplacing(true);
    setFeedback(null);
    const needle = `{${findAlias}}`;
    const replacement = `{${replaceAlias}}`;
    try {
      const patches = matches.map(({ path, entry }) => ({
        path,
        patch: { $value: (entry.$value as string).split(needle).join(replacement) },
      }));

      const res = await apiFetch<{ ok: boolean; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patches }),
        },
      );

      if (onPushUndo && res.operationId) {
        onPushUndo({
          description: `Rewrite ${matches.length} reference${matches.length === 1 ? '' : 's'}: {${findAlias}} → {${replaceAlias}}`,
          restore: async () => { await rollbackOperation(serverUrl, res.operationId); onApply(); },
        });
      }

      setFeedback({ ok: true, msg: `Rewrote ${matches.length} reference${matches.length === 1 ? '' : 's'}` });
      setFindAlias('');
      setReplaceAlias('');
      onApply();
    } catch (e) {
      setFeedback({ ok: false, msg: (e as Error).message });
    } finally {
      setReplacing(false);
    }
  }

  const visibleMatches = expanded ? matches : matches.slice(0, PREVIEW_MAX);

  const footer = (
    <div className={AUTHORING_SURFACE_CLASSES.footer}>
      <ActionFeedbackToast feedback={feedback} />
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
          <button onClick={handleApply} disabled={!canApply} className={AUTHORING.footerBtnPrimary}>
            {replacing ? 'Rewriting…' : `Rewrite ${matches.length}`}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <EditorShell title="Rewrite references" surface="authoring" footer={footer}>
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <div className={AUTHORING.fieldStack}>
          <label className={AUTHORING.label}>Find reference</label>
          <input
            type="text"
            value={findAlias}
            onChange={e => setFindAlias(e.target.value)}
            placeholder="color.primary"
            className={AUTHORING.inputMono}
          />
        </div>

        <div className={AUTHORING.fieldStack}>
          <label className={AUTHORING.label}>Replace with</label>
          <input
            type="text"
            value={replaceAlias}
            onChange={e => setReplaceAlias(e.target.value)}
            placeholder="brand.primary"
            className={AUTHORING.inputMono}
          />
        </div>

        {findAlias && (
          <div className={AUTHORING.fieldStack}>
            {matches.length === 0 ? (
              <span className={LONG_TEXT_CLASSES.textSecondary}>
                No selected tokens reference <span className="font-mono">{`{${findAlias}}`}</span>
              </span>
            ) : (
              <>
                <span className={AUTHORING.label}>
                  {matches.length} token{matches.length === 1 ? '' : 's'} will change
                </span>
                <PreviewCard
                  count={matches.length}
                  expanded={expanded}
                  onToggleExpand={() => setExpanded(e => !e)}
                >
                  {visibleMatches.map(({ path, entry }) => (
                    <div key={path} className="space-y-0.5">
                      <PreviewPath path={path} />
                      <ValueTransition
                        from={entry.$value}
                        to={(entry.$value as string).split(`{${findAlias}}`).join(`{${replaceAlias}}`)}
                      />
                    </div>
                  ))}
                </PreviewCard>
              </>
            )}
          </div>
        )}
      </div>
    </EditorShell>
  );
}
