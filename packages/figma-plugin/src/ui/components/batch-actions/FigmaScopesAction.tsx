import { useState, useMemo } from 'react';
import type { BatchActionProps } from './types';
import { apiFetch } from '../../shared/apiFetch';
import { rollbackOperation } from './transforms';
import { ActionFeedback } from './BatchActionPreview';
import { AUTHORING } from '../../shared/editorClasses';
import { FIGMA_SCOPE_OPTIONS } from '../../shared/tokenMetadata';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';

export function FigmaScopesAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const availableScopes = useMemo(() => {
    const types = new Set(selectedEntries.map(({ entry }) => entry.$type as string));
    if (types.size === 0) return [];

    let intersection: Array<{ label: string; value: string; description: string }> | null = null;
    for (const type of types) {
      const opts = FIGMA_SCOPE_OPTIONS[type];
      if (!opts) return [];
      if (!intersection) {
        intersection = [...opts];
      } else {
        const values = new Set(opts.map((o) => o.value));
        intersection = intersection.filter((s) => values.has(s.value));
      }
    }
    return intersection ?? [];
  }, [selectedEntries]);

  function toggleScope(value: string) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function handleApply() {
    setFeedback(null);
    try {
      const scopes = Array.from(selectedScopes);
      const patches = selectedEntries.map(({ path }) => ({
        path,
        patch: { $extensions: { 'com.figma.scopes': scopes } },
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

  if (availableScopes.length === 0) {
    return (
      <EditorShell title="Figma scopes" surface="authoring">
        <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
          <p className="text-secondary text-[var(--color-figma-text-secondary)]">
            Selected token types don't support Figma scopes
          </p>
        </div>
      </EditorShell>
    );
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
        <div className="flex items-center justify-between">
          <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
            Empty = all scopes
          </span>
          {selectedScopes.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedScopes(new Set())}
              className="text-secondary text-[var(--color-figma-accent)] hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          {availableScopes.map((scope) => (
            <label key={scope.value} className="flex items-start gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedScopes.has(scope.value)}
                onChange={() => toggleScope(scope.value)}
                className="mt-0.5 accent-[var(--color-figma-accent)]"
              />
              <div className="min-w-0">
                <div className="text-body text-[var(--color-figma-text)]">{scope.label}</div>
                <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
                  {scope.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </EditorShell>
  );
}
