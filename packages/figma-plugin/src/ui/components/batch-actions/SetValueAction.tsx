import { useState, useMemo } from 'react';
import type { BatchActionProps } from './types';
import { apiFetch } from '../../shared/apiFetch';
import { rollbackOperation, PREVIEW_MAX } from './transforms';
import { PreviewCard, PreviewPath, ValueTransition, ActionFeedback } from './BatchActionPreview';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';

type ParseMode = 'literal' | 'json';

function coerceLiteral(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && !isNaN(Number(raw))) return Number(raw);
  return raw;
}

function parseValue(raw: string, mode: ParseMode): { value: unknown; error: string | null } {
  if (mode === 'json') {
    try {
      return { value: JSON.parse(raw), error: null };
    } catch {
      return { value: undefined, error: 'Invalid JSON' };
    }
  }
  return { value: coerceLiteral(raw), error: null };
}

export function SetValueAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<ParseMode>('literal');
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const { value: parsed, error: parseError } = useMemo(() => parseValue(raw, mode), [raw, mode]);

  const canApply = raw.length > 0 && !parseError && selectedPaths.size > 0 && connected;

  const previewItems = useMemo(() => {
    if (!canApply) return [];
    const limit = expanded ? selectedEntries.length : PREVIEW_MAX;
    return selectedEntries.slice(0, limit).map(({ path, entry }) => ({
      path,
      from: entry.$value,
      to: parsed,
    }));
  }, [selectedEntries, parsed, canApply, expanded]);

  async function handleApply() {
    setFeedback(null);
    try {
      const patches = selectedEntries.map(({ path }) => ({
        path,
        patch: { $value: parsed },
      }));
      const result = await apiFetch<{ ok: boolean; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        { method: 'POST', body: JSON.stringify({ patches }), headers: { 'Content-Type': 'application/json' } },
      );
      setFeedback({ ok: true, msg: `Updated ${result.updated} tokens` });
      setRaw('');
      if (onPushUndo && result.updated > 0) {
        onPushUndo({
          description: `Set value on ${result.updated} tokens`,
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
      title="Set value"
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
          <div className="flex gap-1.5">
            <input
              type="text"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={mode === 'json' ? 'JSON value' : 'Value (auto-coerced)'}
              className={`${AUTHORING.inputMonoBase} flex-1`}
            />
            <button
              type="button"
              onClick={() => setMode(mode === 'literal' ? 'json' : 'literal')}
              title={mode === 'literal' ? 'Switch to JSON mode' : 'Switch to literal mode'}
              className={`shrink-0 px-2 rounded-md border text-body font-mono ${
                mode === 'json'
                  ? 'bg-[var(--color-figma-accent)] text-white border-transparent'
                  : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)]'
              }`}
            >
              {'{}'}
            </button>
          </div>
          {parseError && <span className={AUTHORING.error}>{parseError}</span>}
        </div>

        {previewItems.length > 0 && (
          <PreviewCard
            count={selectedEntries.length}
            expanded={expanded}
            onToggleExpand={() => setExpanded(!expanded)}
          >
            {previewItems.map((item) => (
              <div key={item.path} className="flex flex-col gap-0.5">
                <PreviewPath path={item.path} />
                <ValueTransition from={item.from} to={item.to} />
              </div>
            ))}
          </PreviewCard>
        )}
      </div>
    </EditorShell>
  );
}
