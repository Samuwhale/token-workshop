import { useState, useMemo } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { AUTHORING } from '../../shared/editorClasses';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import { PreviewPath, PreviewCard, ActionFeedbackToast } from './BatchActionPreview';
import { rollbackOperation, PREVIEW_MAX } from './transforms';
import type { BatchActionProps } from './types';

interface FindReplaceActionProps extends BatchActionProps {
  onSelectedPathsChange?: (next: Set<string>) => void;
}

interface RenamePreview {
  oldPath: string;
  newPath: string;
  conflict: string | null;
}

function buildRenamePreviews(
  selectedEntries: BatchActionProps['selectedEntries'],
  collectionTokensFlat: BatchActionProps['collectionTokensFlat'],
  replacePath: (path: string) => string,
): RenamePreview[] {
  const existingPaths = new Set(Object.keys(collectionTokensFlat));
  const previews = selectedEntries
    .map(({ path }) => ({ oldPath: path, newPath: replacePath(path), conflict: null }))
    .filter(({ oldPath, newPath }) => newPath !== oldPath);
  const renamedOldPaths = new Set(previews.map(({ oldPath }) => oldPath));
  const newPathCounts = new Map<string, number>();
  for (const { newPath } of previews) {
    newPathCounts.set(newPath, (newPathCounts.get(newPath) ?? 0) + 1);
  }

  return previews.map((preview) => {
    if ((newPathCounts.get(preview.newPath) ?? 0) > 1) {
      return { ...preview, conflict: 'duplicate target' };
    }
    if (existingPaths.has(preview.newPath) && !renamedOldPaths.has(preview.newPath)) {
      return { ...preview, conflict: 'path exists' };
    }
    return preview;
  });
}

export function FindReplaceAction({
  selectedPaths,
  selectedEntries,
  collectionTokensFlat,
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
        return {
          renames: buildRenamePreviews(
            selectedEntries,
            collectionTokensFlat,
            (path) => path.replace(re, replaceText),
          ),
          regexError: null,
        };
      } catch (e) {
        return { renames: [], regexError: (e as Error).message };
      }
    }

    return {
      renames: buildRenamePreviews(
        selectedEntries,
        collectionTokensFlat,
        (path) => (path.includes(findText) ? path.split(findText).join(replaceText) : path),
      ),
      regexError: null,
    };
  }, [collectionTokensFlat, findText, replaceText, useRegex, selectedEntries]);

  const conflictCount = renames.filter((rename) => rename.conflict).length;
  const validRenames = renames.filter((rename) => !rename.conflict);
  const renamePayload = validRenames.map(({ oldPath, newPath }) => ({ oldPath, newPath }));
  const canApply = renamePayload.length > 0 && conflictCount === 0 && !regexError && !renaming && connected;

  async function handleApply() {
    if (!canApply) return;
    setRenaming(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; renamed: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-rename-paths`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renames: renamePayload }),
        },
      );

      if (onPushUndo && res.operationId) {
        onPushUndo({
          description: `Rename ${res.renamed} path${res.renamed === 1 ? '' : 's'}`,
          restore: async () => { await rollbackOperation(serverUrl, res.operationId); onApply(); },
        });
      }

      if (onSelectedPathsChange) {
        const renameMap = new Map(renamePayload.map(r => [r.oldPath, r.newPath]));
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
      <ActionFeedbackToast feedback={feedback} />
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
          <button onClick={handleApply} disabled={!canApply} className={AUTHORING.footerBtnPrimary}>
            {renaming ? 'Renaming…' : `Rename ${renamePayload.length}`}
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
                  ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]'
                  : 'text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-secondary)]'
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
                : conflictCount > 0
                  ? `${conflictCount} path${conflictCount === 1 ? '' : 's'} need a unique target`
                  : `${renamePayload.length} path${renamePayload.length === 1 ? '' : 's'} will change`}
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
                    <span className="text-[color:var(--color-figma-text-tertiary)] shrink-0">→</span>
                    <PreviewPath
                      path={r.newPath}
                      className={
                        r.conflict
                          ? '!text-[color:var(--color-figma-text-error)]'
                          : '!text-[color:var(--color-figma-text)]'
                      }
                    />
                    {r.conflict ? (
                      <span className="text-secondary text-[color:var(--color-figma-text-error)]">
                        {r.conflict}
                      </span>
                    ) : null}
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
