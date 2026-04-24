import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedTokenValue } from '../../shared/types';
import { ALL_BINDABLE_PROPERTIES, tokenTypeBadgeClass } from '../../shared/types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Spinner } from './Spinner';
import { createTokenValueBody, upsertToken } from '../shared/tokenMutations';
import { getScopeLabels } from '../shared/tokenMetadata';
import { dispatchToast } from '../shared/toastBus';
import { getErrorMessage, stableStringify, COLLECTION_NAME_RE } from '../shared/utils';
import { getDefaultScopesForProperty } from './selectionInspectorUtils';
import { AUTHORING_SURFACE_CLASSES } from './EditorShell';
import { AUTHORING } from '../shared/editorClasses';

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
  source: 'consistency';
  title: string;
  description: string;
  options: CanvasCreateDraftOption[];
}

interface CanvasCreateTokenDialogProps {
  draft: CanvasCreateDraft;
  connected: boolean;
  serverUrl: string;
  currentCollectionId: string;
  collectionIds: string[];
  onClose: () => void;
  onCreated: (result: {
    source: CanvasCreateDraft['source'];
    collectionId: string;
    tokenPath: string;
    option: CanvasCreateDraftOption;
  }) => void | Promise<void>;
}

function isBindablePropertyName(value: string): value is (typeof ALL_BINDABLE_PROPERTIES)[number] {
  return ALL_BINDABLE_PROPERTIES.includes(value as (typeof ALL_BINDABLE_PROPERTIES)[number]);
}

function buildTokenBody(option: CanvasCreateDraftOption) {
  return createTokenValueBody({
    type: option.tokenType,
    value: option.tokenValue,
    defaultScopes: isBindablePropertyName(option.property)
      ? getDefaultScopesForProperty(option.property)
      : undefined,
  });
}

export function CanvasCreateTokenDialog({
  draft,
  connected,
  serverUrl,
  currentCollectionId,
  collectionIds,
  onClose,
  onCreated,
}: CanvasCreateTokenDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [targetCollectionId, setTargetCollectionId] = useState(currentCollectionId);
  const [tokenPath, setTokenPath] = useState(draft.options[0]?.suggestedPath ?? '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedOption = draft.options[selectedIndex] ?? null;
  const hasMultipleOptions = draft.options.length > 1;
  const hasMultipleCollections = collectionIds.length > 1;

  useEffect(() => {
    setSelectedIndex(0);
    setTargetCollectionId(currentCollectionId);
    setTokenPath(draft.options[0]?.suggestedPath ?? '');
    setError('');
  }, [currentCollectionId, draft]);

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
  const defaultApplicabilitySummary = useMemo(() => {
    if (!selectedOption || !isBindablePropertyName(selectedOption.property)) {
      return null;
    }
    const defaultScopes = getDefaultScopesForProperty(selectedOption.property);
    if (defaultScopes.length === 0) return null;
    const labels = getScopeLabels(selectedOption.tokenType, defaultScopes);
    return labels.length > 0 ? `${labels.join(', ')} (from property)` : null;
  }, [selectedOption]);

  const handleCreate = async () => {
    if (!selectedOption || creating) return;
    if (!connected) {
      setError('Connect to the token server before creating tokens from canvas values.');
      return;
    }
    if (!COLLECTION_NAME_RE.test(targetCollectionId)) {
      setError('Pick a valid destination collection.');
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
      await upsertToken(serverUrl, targetCollectionId, tokenPath.trim(), buildTokenBody(selectedOption));
      await onCreated({
        source: draft.source,
        collectionId: targetCollectionId,
        tokenPath: tokenPath.trim(),
        option: selectedOption,
      });
      dispatchToast(
        `Created ${tokenPath.trim()} and bound ${selectedOption.nodeIds.length} layer${selectedOption.nodeIds.length !== 1 ? 's' : ''}.`,
        'success',
        {
          destination: {
            kind: 'token',
            tokenPath: tokenPath.trim(),
            collectionId: targetCollectionId,
          },
        },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)] p-2"
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
              className="text-heading font-semibold text-[var(--color-figma-text)]"
            >
              {draft.title}
            </h3>
            <p className="mt-1 text-secondary leading-relaxed text-[var(--color-figma-text-secondary)]">
              {draft.description}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={creating}
            className="rounded p-1 text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-40"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`${AUTHORING_SURFACE_CLASSES.bodyStack} min-h-0 flex-1 overflow-y-auto`}>
          <section className={AUTHORING.section}>
            <div className={AUTHORING.summaryCard}>
              <div className={AUTHORING.summaryRow}>
                <span className={AUTHORING.summaryLabel}>Layers</span>
                <span className={AUTHORING.summaryValue}>{dialogSummary}</span>
              </div>
              {selectedOption && (
                <>
                  <div className={AUTHORING.summaryRow}>
                    <span className={AUTHORING.summaryLabel}>Property</span>
                    <span className={AUTHORING.summaryValue}>
                      {selectedOption.propertyLabel}
                    </span>
                    <span
                      className={`${tokenTypeBadgeClass(selectedOption.tokenType)} inline-flex shrink-0 rounded px-1.5 py-0.5 text-secondary font-medium`}
                    >
                      {selectedOption.tokenType}
                    </span>
                  </div>
                  {defaultApplicabilitySummary && (
                    <div className={AUTHORING.summaryRow}>
                      <span className={AUTHORING.summaryLabel}>Can apply to</span>
                      <span className={AUTHORING.summaryValue}>
                        {defaultApplicabilitySummary}
                      </span>
                    </div>
                  )}
                  <div className={AUTHORING.summaryRow}>
                    <span className={AUTHORING.summaryLabel}>Preview</span>
                    <span className={AUTHORING.summaryMono}>
                      {selectedOption.previewValue}
                    </span>
                  </div>
                  <div className={AUTHORING.summaryRow}>
                    <span className={AUTHORING.summaryLabel}>Stored</span>
                    <span className={AUTHORING.summaryMono}>
                      {storedValueSummary}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className={AUTHORING.section}>
            {hasMultipleOptions && (
              <label className={AUTHORING.fieldStack}>
                <span className={AUTHORING.label}>Property</span>
                <select
                  value={String(selectedIndex)}
                  onChange={(event) => setSelectedIndex(Number(event.target.value))}
                  className={AUTHORING.select}
                >
                  {draft.options.map((option, index) => (
                    <option key={`${option.property}:${index}`} value={index}>
                      {option.propertyLabel} · {option.previewValue}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={AUTHORING.fieldStack}>
              <span className={AUTHORING.label}>Target collection</span>
              {hasMultipleCollections ? (
                <select
                  value={targetCollectionId}
                  onChange={(event) => setTargetCollectionId(event.target.value)}
                  className={AUTHORING.select}
                >
                  {collectionIds.map((collectionId) => (
                    <option key={collectionId} value={collectionId}>
                      {collectionId}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={`${AUTHORING.input} bg-[var(--color-figma-bg-secondary)] break-words`}>
                  {targetCollectionId}
                </div>
              )}
            </label>

            <label className={AUTHORING.fieldStack}>
              <span className={AUTHORING.label}>Token path</span>
              <input
                value={tokenPath}
                onChange={(event) => {
                  setTokenPath(event.target.value);
                  setError('');
                }}
                placeholder="group.token-name"
                className={AUTHORING.input}
              />
            </label>
          </section>
        </div>

        <div className="tm-authoring-surface__footer">
          <div className={AUTHORING_SURFACE_CLASSES.footer}>
            {error && (
              <div className={AUTHORING_SURFACE_CLASSES.footerMeta}>
                <p role="alert" className={AUTHORING.error}>
                  {error}
                </p>
              </div>
            )}
            <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
              <button
                onClick={onClose}
                disabled={creating}
                className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary} disabled:opacity-50`}
              >
                Cancel
              </button>
              <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
                <button
                  onClick={handleCreate}
                  disabled={!selectedOption || !tokenPath.trim() || creating}
                  className={`${AUTHORING.footerBtnPrimary} flex items-center justify-center gap-1.5`}
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
