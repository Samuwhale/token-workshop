import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedTokenValue } from '../../shared/types';
import { ALL_BINDABLE_PROPERTIES, TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Spinner } from './Spinner';
import { createTokenBody, upsertToken } from '../shared/tokenMutations';
import { dispatchToast } from '../shared/toastBus';
import { getErrorMessage, stableStringify, SET_NAME_RE } from '../shared/utils';
import { getDefaultScopesForProperty } from './selectionInspectorUtils';
import { AUTHORING_SURFACE_CLASSES } from './EditorShell';
import { QUICK_CREATE_SURFACE_CLASSES } from './quickCreateSurface';

export interface CanvasCreateDraftOption {
  property: string;
  propertyLabel: string;
  tokenType: string;
  tokenValue: ResolvedTokenValue;
  previewValue: string;
  nodeIds: string[];
  layerLabel: string;
  suggestedPath: string;
  resolutionKeys?: string[];
}

export interface CanvasCreateDraft {
  source: 'heatmap' | 'consistency';
  title: string;
  description: string;
  options: CanvasCreateDraftOption[];
}

interface CanvasCreateTokenDialogProps {
  draft: CanvasCreateDraft;
  connected: boolean;
  serverUrl: string;
  activeSet: string;
  sets: string[];
  onClose: () => void;
  onCreated: (result: {
    source: CanvasCreateDraft['source'];
    setName: string;
    tokenPath: string;
    option: CanvasCreateDraftOption;
  }) => void | Promise<void>;
}

function isBindablePropertyName(value: string): value is (typeof ALL_BINDABLE_PROPERTIES)[number] {
  return ALL_BINDABLE_PROPERTIES.includes(value as (typeof ALL_BINDABLE_PROPERTIES)[number]);
}

function buildTokenBody(option: CanvasCreateDraftOption) {
  const base = createTokenBody({
    $type: option.tokenType,
    $value: option.tokenValue,
  });

  if (!isBindablePropertyName(option.property)) {
    return base;
  }

  const scopes = getDefaultScopesForProperty(option.property);
  if (scopes.length === 0) {
    return base;
  }

  return createTokenBody({
    ...base,
    $extensions: {
      'com.figma.scopes': scopes,
    },
  });
}

export function CanvasCreateTokenDialog({
  draft,
  connected,
  serverUrl,
  activeSet,
  sets,
  onClose,
  onCreated,
}: CanvasCreateTokenDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [targetSet, setTargetSet] = useState(activeSet);
  const [tokenPath, setTokenPath] = useState(draft.options[0]?.suggestedPath ?? '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedOption = draft.options[selectedIndex] ?? null;
  const hasMultipleOptions = draft.options.length > 1;
  const hasMultipleSets = sets.length > 1;

  useEffect(() => {
    setSelectedIndex(0);
    setTargetSet(activeSet);
    setTokenPath(draft.options[0]?.suggestedPath ?? '');
    setError('');
  }, [activeSet, draft]);

  useEffect(() => {
    if (!selectedOption) return;
    setTokenPath(selectedOption.suggestedPath);
    setError('');
  }, [selectedOption]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [creating, onClose]);

  const dialogSummary = useMemo(() => {
    if (!selectedOption) return '';
    const layerCount = selectedOption.nodeIds.length;
    return layerCount === 1
      ? selectedOption.layerLabel
      : `${layerCount} layers from ${selectedOption.layerLabel}`;
  }, [selectedOption]);
  const storedValueSummary = useMemo(() => {
    if (!selectedOption) return '';
    return stableStringify(selectedOption.tokenValue);
  }, [selectedOption]);

  const handleCreate = async () => {
    if (!selectedOption || creating) return;
    if (!connected) {
      setError('Connect to the token server before creating tokens from canvas values.');
      return;
    }
    if (!SET_NAME_RE.test(targetSet)) {
      setError('Pick a valid destination set.');
      return;
    }
    if (!tokenPath.trim()) {
      setError('Enter a token path.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(tokenPath.trim())) {
      setError('Path must use dot-separated segments with letters, numbers, - and _.');
      return;
    }

    setCreating(true);
    setError('');

    try {
      await upsertToken(serverUrl, targetSet, tokenPath.trim(), buildTokenBody(selectedOption));
      await onCreated({
        source: draft.source,
        setName: targetSet,
        tokenPath: tokenPath.trim(),
        option: selectedOption,
      });
      dispatchToast(
        `Created ${tokenPath.trim()} and bound ${selectedOption.nodeIds.length} layer${selectedOption.nodeIds.length !== 1 ? 's' : ''}.`,
        'success',
      );
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !creating) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-create-token-title"
        className="tm-authoring-surface flex max-h-full w-full max-w-[360px] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
      >
        <div className="tm-authoring-surface__header flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3
              id="canvas-create-token-title"
              className="text-[12px] font-semibold text-[var(--color-figma-text)]"
            >
              {draft.title}
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              {draft.description}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={creating}
            className="rounded p-1 text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-40"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
            </svg>
          </button>
        </div>

        <div className={`${AUTHORING_SURFACE_CLASSES.bodyStack} min-h-0 flex-1 overflow-y-auto`}>
          <section className={QUICK_CREATE_SURFACE_CLASSES.section}>
            <div className={QUICK_CREATE_SURFACE_CLASSES.summaryCard}>
              <div className={QUICK_CREATE_SURFACE_CLASSES.summaryRow}>
                <span className={QUICK_CREATE_SURFACE_CLASSES.summaryLabel}>Layers</span>
                <span className={QUICK_CREATE_SURFACE_CLASSES.summaryValue}>{dialogSummary}</span>
              </div>
              {selectedOption && (
                <>
                  <div className={QUICK_CREATE_SURFACE_CLASSES.summaryRow}>
                    <span className={QUICK_CREATE_SURFACE_CLASSES.summaryLabel}>Property</span>
                    <span className={QUICK_CREATE_SURFACE_CLASSES.summaryValue}>
                      {selectedOption.propertyLabel}
                    </span>
                    <span
                      className={`${TOKEN_TYPE_BADGE_CLASS[selectedOption.tokenType] ?? 'token-type-string'} inline-flex shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide`}
                    >
                      {selectedOption.tokenType}
                    </span>
                  </div>
                  <div className={QUICK_CREATE_SURFACE_CLASSES.summaryRow}>
                    <span className={QUICK_CREATE_SURFACE_CLASSES.summaryLabel}>Preview</span>
                    <span className={QUICK_CREATE_SURFACE_CLASSES.summaryMono}>
                      {selectedOption.previewValue}
                    </span>
                  </div>
                  <div className={QUICK_CREATE_SURFACE_CLASSES.summaryRow}>
                    <span className={QUICK_CREATE_SURFACE_CLASSES.summaryLabel}>Stored</span>
                    <span className={QUICK_CREATE_SURFACE_CLASSES.summaryMono}>
                      {storedValueSummary}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className={QUICK_CREATE_SURFACE_CLASSES.section}>
            {hasMultipleOptions && (
              <label className={QUICK_CREATE_SURFACE_CLASSES.fieldStack}>
                <span className={QUICK_CREATE_SURFACE_CLASSES.fieldLabel}>Property</span>
                <select
                  value={String(selectedIndex)}
                  onChange={(event) => setSelectedIndex(Number(event.target.value))}
                  className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                >
                  {draft.options.map((option, index) => (
                    <option key={`${option.property}:${index}`} value={index}>
                      {option.propertyLabel} · {option.previewValue}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={QUICK_CREATE_SURFACE_CLASSES.fieldStack}>
              <span className={QUICK_CREATE_SURFACE_CLASSES.fieldLabel}>Target set</span>
              {hasMultipleSets ? (
                <select
                  value={targetSet}
                  onChange={(event) => setTargetSet(event.target.value)}
                  className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                >
                  {sets.map((setName) => (
                    <option key={setName} value={setName}>
                      {setName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] break-words">
                  {targetSet}
                </div>
              )}
            </label>

            <label className={QUICK_CREATE_SURFACE_CLASSES.fieldStack}>
              <span className={QUICK_CREATE_SURFACE_CLASSES.fieldLabel}>Token path</span>
              <input
                value={tokenPath}
                onChange={(event) => {
                  setTokenPath(event.target.value);
                  setError('');
                }}
                placeholder="group.token-name"
                className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
              />
            </label>
          </section>
        </div>

        <div className="tm-authoring-surface__footer">
          <div className={AUTHORING_SURFACE_CLASSES.footer}>
            {error && (
              <p className="text-[10px] text-[var(--color-figma-error)] break-words">
                {error}
              </p>
            )}
            <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
              <button
                onClick={onClose}
                disabled={creating}
                className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-text)] disabled:opacity-50`}
              >
                Cancel
              </button>
              <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
                <button
                  onClick={handleCreate}
                  disabled={!selectedOption || !tokenPath.trim() || creating}
                  className="flex w-full items-center justify-center gap-1.5 rounded bg-[var(--color-figma-accent)] px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                >
                  {creating && <Spinner size="sm" className="text-white" />}
                  {creating ? 'Creating…' : 'Create & bind'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
