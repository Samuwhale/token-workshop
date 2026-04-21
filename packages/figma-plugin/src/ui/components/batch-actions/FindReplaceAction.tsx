import { useState, useMemo } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import { PreviewPath, PreviewCard, ActionFeedback } from './BatchActionPreview';
import { rollbackOperation, PREVIEW_MAX } from './transforms';
import type { BatchActionProps } from './types';

interface FindReplaceActionProps extends BatchActionProps {
  onSelectedPathsChange?: (next: Set<string>) => void;
}

export function FindReplaceAction({
  selectedPaths,
  selectedEntries,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
  onSelectedPathsChange,
}: FindReplaceActionProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { renames, regexError } = useMemo(() => {
    if (!findText) return { renames: [], regexError: null };

    if (useRegex) {
      try {
        const re = new RegExp(findText, 'g');
        const results: Array<{ oldPath: string; newPath: string }> = [];
        for (const { path } of selectedEntries) {
          const newPath = path.replace(re, replaceText);
          if (newPath !== path) results.push({ oldPath: path, newPath });
        }
        return { renames: results, regexError: null };
      } catch (e) {
        return { renames: [], regexError: (e as Error).message };
      }
    }

    const results: Array<{ oldPath: string; newPath: string }> = [];
    for (const { path } of selectedEntries) {
      if (path.includes(findText)) {
        results.push({ oldPath: path, newPath: path.split(findText).join(replaceText) });
      }
    }
    return { renames: results, regexError: null };
  }, [findText, replaceText, useRegex, selectedEntries]);

  const canApply = renames.length > 0 && !regexError && !renaming && connected;

  async function handleApply() {
    setRenaming(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; renamed: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-rename-paths`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renames }),
        },
      );

      if (onPushUndo && res.operationId) {
        onPushUndo({
          description: `Rename ${res.renamed} path${res.renamed === 1 ? '' : 's'}`,
          restore: async () => { await rollbackOperation(serverUrl, res.operationId); onApply(); },
        });
      }

      if (onSelectedPathsChange) {
        const renameMap = new Map(renames.map(r => [r.oldPath, r.newPath]));
        const next = new Set<string>();
        for (const p of selectedPaths) {
          next.add(renameMap.get(p) ?? p);
        }
        onSelectedPathsChange(next);
      }

      setFeedback({ ok: true, msg: `Renamed ${res.renamed} path${res.renamed === 1 ? '' : 's'}` });
      setFindText('');
      setReplaceText('');
      onApply();
    } catch (e) {
      setFeedback({ ok: false, msg: (e as Error).message });
    } finally {
      setRenaming(false);
    }
  }

  const visibleRenames = expanded ? renames : renames.slice(0, PREVIEW_MAX);

  const footer = (
    <div className={AUTHORING_SURFACE_CLASSES.footer}>
      <div className={AUTHORING_SURFACE_CLASSES.footerMeta}>
        <ActionFeedback feedback={feedback} />
      </div>
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
          <button onClick={handleApply} disabled={!canApply} className={AUTHORING.footerBtnPrimary}>
            {renaming ? 'Renaming…' : `Rename ${renames.length}`}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <EditorShell title="Find & replace paths" surface="authoring" footer={footer}>
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <div className={AUTHORING.fieldStack}>
          <label className={AUTHORING.label}>Find</label>
          <div className="relative">
            <input
              type="text"
              value={findText}
              onChange={e => setFindText(e.target.value)}
              placeholder="text to find in paths"
              className={`${AUTHORING.inputMono} pr-8`}
            />
            <button
              type="button"
              onClick={() => setUseRegex(r => !r)}
              title={useRegex ? 'Regex mode on' : 'Regex mode off'}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-1 py-0.5 rounded text-[11px] font-mono leading-none transition-colors ${
                useRegex
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'
              }`}
            >
              .*
            </button>
          </div>
          {regexError && (
            <span className={AUTHORING.error}>{regexError}</span>
          )}
        </div>

        <div className={AUTHORING.fieldStack}>
          <label className={AUTHORING.label}>Replace</label>
          <input
            type="text"
            value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            placeholder="replacement text"
            className={AUTHORING.inputMono}
          />
        </div>

        {findText && !regexError && (
          <div className={AUTHORING.fieldStack}>
            <span className={AUTHORING.label}>
              {renames.length === 0
                ? 'No paths match'
                : `${renames.length} path${renames.length === 1 ? '' : 's'} will change`}
            </span>
            {renames.length > 0 && (
              <PreviewCard
                count={renames.length}
                expanded={expanded}
                onToggleExpand={() => setExpanded(e => !e)}
              >
                {visibleRenames.map(r => (
                  <div key={r.oldPath} className="flex flex-wrap items-center gap-1">
                    <PreviewPath path={r.oldPath} />
                    <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
                    <PreviewPath path={r.newPath} className="!text-[var(--color-figma-text)]" />
                  </div>
                ))}
              </PreviewCard>
            )}
          </div>
        )}
      </div>
    </EditorShell>
  );
}
