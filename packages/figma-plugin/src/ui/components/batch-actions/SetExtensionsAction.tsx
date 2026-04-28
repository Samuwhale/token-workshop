import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { BatchActionProps } from './types';
import { apiFetch } from '../../shared/apiFetch';
import { rollbackOperation } from './transforms';
import { ActionFeedback } from './BatchActionPreview';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';

interface ExtensionRow {
  id: number;
  key: string;
  value: string;
}

function parseExtensionValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function SetExtensionsAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [rows, setRows] = useState<ExtensionRow[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const nextRowId = useRef(0);

  const validRows = rows.filter((r) => r.key.trim().length > 0);
  const canApply = validRows.length > 0 && selectedPaths.size > 0 && connected;

  function addRow() {
    const id = nextRowId.current;
    nextRowId.current += 1;
    setRows((prev) => [...prev, { id, key: '', value: '' }]);
  }

  function updateRow(id: number, field: 'key' | 'value', val: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleApply() {
    setFeedback(null);
    try {
      const extensions: Record<string, unknown> = {};
      for (const row of validRows) {
        extensions[row.key.trim()] = parseExtensionValue(row.value);
      }
      const patches = selectedEntries.map(({ path }) => ({
        path,
        patch: { $extensions: extensions },
      }));
      const result = await apiFetch<{ ok: boolean; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        { method: 'POST', body: JSON.stringify({ patches }), headers: { 'Content-Type': 'application/json' } },
      );
      setFeedback({ ok: true, msg: `Updated ${result.updated} tokens` });
      setRows([]);
      if (onPushUndo && result.updated > 0) {
        onPushUndo({
          description: `Set extensions on ${result.updated} tokens`,
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
      title="Set extensions"
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
        <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
          Merged into $extensions. Values parsed as JSON.
        </span>

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start gap-1.5">
              <input
                type="text"
                value={row.key}
                onChange={(e) => updateRow(row.id, 'key', e.target.value)}
                placeholder="Key"
                className={`${AUTHORING.inputMonoBase} flex-1`}
              />
              <input
                type="text"
                value={row.value}
                onChange={(e) => updateRow(row.id, 'value', e.target.value)}
                placeholder="Value"
                className={`${AUTHORING.inputMonoBase} flex-1`}
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="shrink-0 p-1.5 rounded-md text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                aria-label="Remove row"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="text-secondary text-[var(--color-figma-accent)] hover:underline text-left"
        >
          Add extension key
        </button>
      </div>
    </EditorShell>
  );
}
