import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { ConfirmModal } from "./ConfirmModal";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import type { TokenGenerator, GeneratorTemplate } from "../hooks/useGenerators";
import type { SemanticStarter } from "./graph-templates";
import {
  useGeneratorDialog,
  type GeneratorDialogInitialDraft,
} from "../hooks/useGeneratorDialog";
import type { GeneratorSaveSuccessInfo } from "../hooks/useGeneratorSave";
import {
  StepSemanticPlanning,
  StepWhere,
  StepWhat,
  StepReview,
} from "./generator-steps";
import { Spinner } from "./Spinner";
import type { ToastAction } from "../shared/toastBus";

// ---------------------------------------------------------------------------
// Props (unchanged public API)
// ---------------------------------------------------------------------------

export interface TokenGeneratorDialogProps {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  allSets: string[];
  activeSet: string;
  /** All tokens flat map for source token autocomplete and config field tokenRefs */
  allTokensFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  existingGenerator?: TokenGenerator;
  initialDraft?: GeneratorDialogInitialDraft;
  /** Pre-fill from a quick-start template */
  template?: GeneratorTemplate & { semanticStarter?: SemanticStarter };
  /** When provided, shows a back arrow to return to the previous step (e.g. template picker) */
  onBack?: () => void;
  onClose: () => void;
  onSaved: (info?: GeneratorSaveSuccessInfo) => void;
  /** Legacy hook for callers that still inspect semantic-ready generator output after save. */
  onInterceptSemanticMapping?: (data: {
    tokens: import("../hooks/useGenerators").GeneratedTokenResult[];
    targetGroup: string;
    targetSet: string;
    generatorType: import("../hooks/useGenerators").GeneratorType;
  }) => void;
  getSuccessToastAction?: (
    info: GeneratorSaveSuccessInfo,
  ) => ToastAction | undefined;
  /** Token path → set name for autocomplete display */
  pathToSet?: Record<string, string>;
  /** Push an undo slot after a successful generator save */
  onPushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  /** When set to panel, render without the modal backdrop/chrome so the caller can host it in a drawer or side panel. */
  presentation?: "modal" | "panel";
  /** Mirrors the dialog dirty state to the host surface so navigation guards can reuse it. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Allows the host surface to trigger the dialog's close flow, including discard confirmation. */
  closeRef?: MutableRefObject<(() => void) | null>;
}

// ---------------------------------------------------------------------------
// Single-form generator dialog (replaces the 3-step wizard)
// ---------------------------------------------------------------------------

export function TokenGeneratorDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  sourceTokenValue,
  allSets,
  activeSet,
  allTokensFlat,
  existingGenerator,
  initialDraft,
  template,
  onBack,
  onClose,
  onSaved,
  onInterceptSemanticMapping,
  getSuccessToastAction,
  pathToSet,
  onPushUndo,
  presentation = "modal",
  onDirtyChange,
  closeRef,
}: TokenGeneratorDialogProps) {
  const dialog = useGeneratorDialog({
    serverUrl,
    sourceTokenPath,
    sourceTokenName,
    sourceTokenType,
    sourceTokenValue,
    activeSet,
    existingGenerator,
    template,
    initialDraft,
    onSaved,
    onInterceptSemanticMapping,
    getSuccessToastAction,
    pushUndo: onPushUndo,
  });

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleClose = useCallback(() => {
    if (dialog.isDirtyRef.current) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [dialog.isDirtyRef, onClose]);

  // --- Save logic ---
  const canSave =
    dialog.targetGroup.trim().length > 0 &&
    dialog.name.trim().length > 0 &&
    (dialog.isMultiBrand || !dialog.typeNeedsValue || dialog.hasValue);

  const handleSave = async () => {
    if (dialog.showConfirmation) {
      await dialog.handleConfirmSave();
    } else {
      await dialog.handleSave();
    }
  };

  const saveLabel = (() => {
    if (!dialog.showConfirmation) {
      return dialog.isEditing ? "Review Changes" : "Review Generator";
    }
    if (dialog.saving)
      return dialog.isEditing ? "Saving\u2026" : "Creating\u2026";
    if (dialog.overwriteCheckLoading) return "Checking\u2026";
    if (dialog.previewReviewStale) return "Review Updated Preview";
    const aliasCount = dialog.semanticEnabled
      ? dialog.semanticMappings.filter((m) => m.semantic.trim()).length
      : 0;
    if (dialog.isEditing) {
      return `Save Changes (${dialog.previewTokens.length} token${dialog.previewTokens.length === 1 ? "" : "s"})`;
    }
    return aliasCount > 0
      ? `Create Generator (+${aliasCount} aliases)`
      : "Create Generator";
  })();

  // --- Missing field hints ---
  const missingFields = (() => {
    const missing: string[] = [];
    if (!dialog.targetGroup.trim()) missing.push("target group");
    if (!dialog.name.trim()) missing.push("name");
    if (!dialog.isMultiBrand && dialog.typeNeedsValue && !dialog.hasValue) {
      missing.push(
        dialog.selectedType === "colorRamp" ||
          dialog.selectedType === "accessibleColorPair" ||
          dialog.selectedType === "darkModeInversion"
          ? "base color"
          : "base value",
      );
    }
    return missing;
  })();

  // --- Accessibility ---
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleClose]);

  useEffect(() => {
    onDirtyChange?.(Boolean(dialog.isDirtyRef.current));
  });

  useEffect(() => {
    if (!closeRef) return;
    closeRef.current = handleClose;
    return () => {
      if (closeRef.current === handleClose) closeRef.current = null;
    };
  }, [closeRef, handleClose]);

  const isPanel = presentation === "panel";
  const shellClassName = isPanel
    ? "h-full flex flex-col"
    : "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4";
  const dialogClassName = isPanel
    ? "bg-[var(--color-figma-bg)] w-full h-full flex flex-col overflow-hidden"
    : "bg-[var(--color-figma-bg)] rounded-lg border border-[var(--color-figma-border)] shadow-xl w-full max-w-[min(56rem,95vw)] flex flex-col max-h-[90vh]";
  const title = (
    <span
      id="token-generator-dialog-title"
      className="text-[12px] font-semibold text-[var(--color-figma-text)]"
    >
      {dialog.isEditing
        ? "Edit Generator"
        : template
          ? template.label
          : "New Generator"}
    </span>
  );
  const headerActions = (
    <button
      type="button"
      onClick={handleClose}
      aria-label="Close"
      className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
  const footer = (
    <div className={AUTHORING_SURFACE_CLASSES.footer}>
      {missingFields.length > 0 && !dialog.saving && !dialog.showConfirmation && (
        <p className={AUTHORING_SURFACE_CLASSES.footerMeta}>
          {missingFields.length === 1
            ? `${missingFields[0].charAt(0).toUpperCase() + missingFields[0].slice(1)} is required.`
            : `Required: ${missingFields.join(", ")}.`}
        </p>
      )}
      {dialog.existingTokensError && !dialog.showConfirmation && (
        <div role="alert" className={AUTHORING.error}>
          {dialog.existingTokensError}
        </div>
      )}
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        <button
          type="button"
          onClick={
            dialog.showConfirmation ? dialog.handleCancelConfirmation : handleClose
          }
          className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
        >
          {dialog.showConfirmation ? "Back to Edit" : "Cancel"}
        </button>
        <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || dialog.saving || dialog.overwriteCheckLoading}
            className={`${AUTHORING.footerBtnPrimary} flex items-center justify-center gap-1.5`}
          >
            {dialog.saving && <Spinner size="sm" className="text-white" />}
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={shellClassName}>
      {showDiscardConfirm && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description="You have unsaved changes. They will be lost if you close."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onClose();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={isPanel ? undefined : true}
        aria-labelledby="token-generator-dialog-title"
        className={dialogClassName}
      >
        <EditorShell
          surface="authoring"
          onBack={onBack}
          backAriaLabel="Back to templates"
          title={title}
          headerActions={headerActions}
          footer={footer}
          bodyClassName={AUTHORING_SURFACE_CLASSES.bodyStack}
        >
          {existingGenerator?.detachedPaths &&
            existingGenerator.detachedPaths.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                <p className="text-[var(--color-figma-text)]">
                  {existingGenerator.detachedPaths.length} output
                  {existingGenerator.detachedPaths.length === 1 ? "" : "s"}{" "}
                  detached from this generator.
                </p>
                <p className="mt-1">
                  Detached tokens stay manual and will not update on the next
                  generator run unless you recreate them through the generator.
                </p>
              </div>
            )}

          {dialog.showConfirmation ? (
            <StepReview
              selectedType={dialog.selectedType}
              name={dialog.name}
              targetGroup={dialog.targetGroup}
              targetSet={dialog.targetSet}
              isEditing={dialog.isEditing}
              isMultiBrand={dialog.isMultiBrand}
              inputTable={dialog.inputTable}
              targetSetTemplate={dialog.targetSetTemplate}
              semanticEnabled={dialog.semanticEnabled}
              semanticPrefix={dialog.semanticPrefix}
              semanticMappings={dialog.semanticMappings}
              previewTokens={dialog.previewTokens}
              previewAnalysis={dialog.previewAnalysis}
              existingOverwritePathSet={dialog.existingOverwritePathSet}
              overwritePendingPaths={dialog.overwritePendingPaths}
              overwriteCheckLoading={dialog.overwriteCheckLoading}
              overwriteCheckError={dialog.overwriteCheckError}
              saveError={dialog.saveError}
              previewReviewStale={dialog.previewReviewStale}
            />
          ) : (
            <>
              <StepWhat
                selectedType={dialog.selectedType}
                recommendedType={dialog.recommendedType}
                currentConfig={dialog.currentConfig}
                typeNeedsValue={dialog.typeNeedsValue}
                hasSource={dialog.hasSource}
                hasValue={dialog.hasValue}
                isMultiBrand={dialog.isMultiBrand}
                sourceTokenPath={sourceTokenPath}
                sourceTokenValue={sourceTokenValue}
                inlineValue={dialog.inlineValue}
                previewTokens={dialog.previewTokens}
                previewLoading={dialog.previewLoading}
                previewError={dialog.previewError}
                previewBrand={dialog.previewBrand}
                multiBrandPreviews={dialog.multiBrandPreviews}
                previewAnalysis={dialog.previewAnalysis}
                pendingOverrides={dialog.pendingOverrides}
                lockedCount={dialog.lockedCount}
                overwrittenEntries={dialog.overwrittenEntries}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                canUndo={dialog.canUndo}
                canRedo={dialog.canRedo}
                onUndo={dialog.handleUndo}
                onRedo={dialog.handleRedo}
                onConfigInteractionStart={dialog.handleConfigInteractionStart}
                onTypeChange={dialog.handleTypeChange}
                onConfigChange={dialog.handleConfigChange}
                onSourcePathChange={dialog.setEditableSourcePath}
                onInlineValueChange={dialog.setInlineValue}
                onOverrideChange={dialog.handleOverrideChange}
                onOverrideClear={dialog.handleOverrideClear}
                onClearAllOverrides={dialog.clearAllOverrides}
              />

              <StepWhere
                name={dialog.name}
                targetSet={dialog.targetSet}
                targetGroup={dialog.targetGroup}
                allSets={allSets}
                isMultiBrand={dialog.isMultiBrand}
                inputTable={dialog.inputTable}
                targetSetTemplate={dialog.targetSetTemplate}
                onNameChange={dialog.handleNameChange}
                onTargetSetChange={dialog.setTargetSet}
                onTargetGroupChange={dialog.setTargetGroup}
                onToggleMultiBrand={dialog.handleToggleMultiBrand}
                onInputTableChange={dialog.setInputTable}
                onTargetSetTemplateChange={dialog.setTargetSetTemplate}
              />

              {!dialog.isEditing && dialog.previewTokens.length > 0 && (
                <StepSemanticPlanning
                  selectedType={dialog.selectedType}
                  targetGroup={dialog.targetGroup}
                  previewTokens={dialog.previewTokens}
                  templateStarter={template?.semanticStarter}
                  semanticEnabled={dialog.semanticEnabled}
                  semanticPrefix={dialog.semanticPrefix}
                  semanticMappings={dialog.semanticMappings}
                  onSemanticEnabledChange={dialog.setSemanticEnabled}
                  onSemanticPrefixChange={dialog.setSemanticPrefix}
                  onSemanticMappingsChange={dialog.setSemanticMappings}
                  onSemanticPatternSelect={dialog.setSelectedSemanticPatternId}
                />
              )}
            </>
          )}
        </EditorShell>
      </div>
    </div>
  );
}
