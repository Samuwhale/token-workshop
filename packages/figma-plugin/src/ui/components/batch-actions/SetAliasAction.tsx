import { useState, useMemo, useRef } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { isAlias } from '../../../shared/resolveAlias';
import { AUTHORING } from '../../shared/editorClasses';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import { EditorShell, AUTHORING_SURFACE_CLASSES } from '../EditorShell';
import { AliasAutocomplete } from '../AliasAutocomplete';
import type { BatchActionProps } from './types';
import { PREVIEW_MAX, rollbackOperation, formatBatchValue } from './transforms';
import { PreviewPath, PreviewCard, ActionFeedbackToast } from './BatchActionPreview';

export function SetAliasAction({
  selectedPaths,
  selectedEntries,
  allTokensFlat,
  collectionId,
  serverUrl,
  connected,
  onApply,
  onPushUndo,
}: BatchActionProps) {
  const [aliasInput, setAliasInput] = useState('');
  const [aliasRef, setAliasRef] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const aliasActive = aliasRef !== '' && isAlias(aliasRef);

  const preview = useMemo(() => {
    if (!aliasActive) return null;
    return selectedEntries.map(({ path, entry }) => ({ path, from: entry.$value, to: aliasRef }));
  }, [aliasActive, aliasRef, selectedEntries]);

  const handleApply = async () => {
    if (!connected || applying || !aliasActive) return;
    setApplying(true);
    setFeedback(null);
    try {
      const patches = selectedEntries.map(({ path }) => ({ path, patch: { $value: aliasRef } }));
      const result = await apiFetch<{ ok: true; updated: number; operationId: string }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-update`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patches }) },
      );
      if (onPushUndo && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Set alias ${aliasRef} on ${result.updated} token${result.updated === 1 ? '' : 's'}`,
          restore: async () => { await rollbackOperation(serverUrl, opId); onApply(); },
        });
      }
      onApply();
      setFeedback({ ok: true, msg: `Applied to ${result.updated} token${result.updated === 1 ? '' : 's'}` });
      setAliasInput('');
      setAliasRef('');
    } catch {
      setFeedback({ ok: false, msg: 'Error — check server connection' });
    } finally {
      setApplying(false);
    }
  };

  const handleInputChange = (val: string) => {
    setAliasInput(val);
    const stripped = val.startsWith('{') ? val.slice(1).replace(/\}$/, '') : val;
    setAliasRef(stripped ? `{${stripped}}` : '');
    setShowAutocomplete(true);
  };

  return (
    <EditorShell
      title="Set alias"
      surface="authoring"
      footer={
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          <ActionFeedbackToast feedback={feedback} />
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button onClick={handleApply} disabled={applying || !connected || !aliasActive} className={AUTHORING.footerBtnPrimary}>
                {applying ? 'Applying…' : `Apply to ${selectedPaths.size}`}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className={AUTHORING_SURFACE_CLASSES.bodyStack}>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={aliasInput}
              onChange={e => handleInputChange(e.target.value)}
              onFocus={() => setShowAutocomplete(true)}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setShowAutocomplete(false);
                  inputRef.current?.blur();
                }
              }}
              placeholder="{color.brand.primary}"
              className={`min-w-0 flex-1 ${AUTHORING.inputMonoBase} placeholder-[var(--color-figma-text-tertiary)]`}
              aria-label="Alias reference"
            />
            {aliasInput && (
              <button
                type="button"
                onClick={() => { setAliasInput(''); setAliasRef(''); setShowAutocomplete(false); }}
                className="h-6 px-2 rounded border border-[var(--color-figma-border)] text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-secondary)] transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>
          {showAutocomplete && (
            <div className="relative">
              <AliasAutocomplete
                query={aliasInput.startsWith('{') ? aliasInput.slice(1).replace(/\}$/, '') : aliasInput}
                allTokensFlat={allTokensFlat}
                onSelect={path => {
                  const ref = `{${path}}`;
                  setAliasInput(ref);
                  setAliasRef(ref);
                  setShowAutocomplete(false);
                }}
                onClose={() => setShowAutocomplete(false)}
              />
            </div>
          )}
        </div>

        {aliasActive && !showAutocomplete && (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)] leading-snug">
            Will set <span className="font-mono text-[color:var(--color-figma-text)] break-all">{aliasRef}</span> on {selectedEntries.length} token{selectedEntries.length === 1 ? '' : 's'}
          </div>
        )}

        {preview && preview.length > 0 && !showAutocomplete && (
          <PreviewCard count={preview.length} expanded={expanded} onToggleExpand={() => setExpanded(v => !v)}>
            {(expanded ? preview : preview.slice(0, PREVIEW_MAX)).map(({ path, from }) => (
              <div key={path} className="flex flex-col gap-0.5 text-secondary leading-snug">
                <PreviewPath path={path} />
                <div className="flex flex-wrap items-center gap-1">
                  <span className={LONG_TEXT_CLASSES.monoSecondary}>{formatBatchValue(from)}</span>
                  <span className="text-[color:var(--color-figma-text-tertiary)] shrink-0">→</span>
                  <span className={`${LONG_TEXT_CLASSES.monoPrimary} font-medium`}>{aliasRef}</span>
                </div>
              </div>
            ))}
          </PreviewCard>
        )}
      </div>
    </EditorShell>
  );
}
