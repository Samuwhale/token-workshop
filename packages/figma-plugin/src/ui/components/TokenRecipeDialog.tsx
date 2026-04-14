import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import type { TokenRecipe, RecipeTemplate } from "../hooks/useRecipes";
import type { EditorSessionRegistration } from "../contexts/WorkspaceControllerContext";
import type { SemanticStarter } from "./graph-templates";
import {
  useRecipeDialog,
  type RecipeDialogInitialDraft,
} from "../hooks/useRecipeDialog";
import type { RecipeSaveSuccessInfo } from "../hooks/useRecipeSave";
import { hasPreviewRisks } from "../hooks/useRecipePreview";
import { StepIntent } from "./recipe-steps/StepIntent";
import { StepSource } from "./recipe-steps/StepSource";
import type { StepWhereProps } from "./recipe-steps/StepWhere";
import { StepSave } from "./recipe-steps/StepSave";
import { Spinner } from "./Spinner";
import type { ToastAction } from "../shared/toastBus";

// ---------------------------------------------------------------------------
// Props (unchanged public API)
// ---------------------------------------------------------------------------

export interface TokenRecipeDialogProps {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  allSets: string[];
  activeSet: string;
  /** All tokens flat map for source token autocomplete and config field tokenRefs */
  allTokensFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  existingRecipe?: TokenRecipe;
  initialDraft?: RecipeDialogInitialDraft;
  /** Pre-fill from a quick-start template */
  template?: RecipeTemplate & { semanticStarter?: SemanticStarter };
  /** When provided, shows a back arrow to return to the previous step (e.g. template picker) */
  onBack?: () => void;
  onClose: () => void;
  onSaved: (info?: RecipeSaveSuccessInfo) => void;
  /** Legacy hook for callers that still inspect semantic-ready recipe output after save. */
  onInterceptSemanticMapping?: (data: {
    tokens: import("../hooks/useRecipes").GeneratedTokenResult[];
    targetGroup: string;
    targetSet: string;
    recipeType: import("../hooks/useRecipes").RecipeType;
  }) => void;
  getSuccessToastAction?: (
    info: RecipeSaveSuccessInfo,
  ) => ToastAction | undefined;
  /** Token path → set name for autocomplete display */
  pathToSet?: Record<string, string>;
  /** Push an undo slot after a successful recipe save */
  onPushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  /** When set to panel, render without the modal backdrop/chrome so the caller can host it in a drawer or side panel. */
  presentation?: "modal" | "panel";
  editorSessionHost?: {
    registerSession: (session: EditorSessionRegistration | null) => void;
    requestClose: () => void;
  };
}

// ---------------------------------------------------------------------------
// Step progress dots
// ---------------------------------------------------------------------------

type Step = 1 | 2;

function StepDots({ active, total }: { active: Step; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const step = (i + 1) as Step;
        const isActive = step === active;
        const isComplete = step < active;
        return (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all ${
              isActive
                ? "w-4 bg-[var(--color-figma-accent)]"
                : isComplete
                  ? "w-1.5 bg-[var(--color-figma-accent)]/50"
                  : "w-1.5 bg-[var(--color-figma-border)]"
            }`}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper recipe dialog
// ---------------------------------------------------------------------------

export function TokenRecipeDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  sourceTokenValue,
  allSets,
  activeSet,
  allTokensFlat,
  existingRecipe,
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
  editorSessionHost,
}: TokenRecipeDialogProps) {
  const dialog = useRecipeDialog({
    serverUrl,
    sourceTokenPath,
    sourceTokenName,
    sourceTokenType,
    sourceTokenValue,
    activeSet,
    existingRecipe,
    template,
    initialDraft,
    allTokensFlat,
    onSaved,
    onInterceptSemanticMapping,
    getSuccessToastAction,
    pushUndo: onPushUndo,
  });
  const requestClose = editorSessionHost?.requestClose ?? onClose;
  const activeSourceValue =
    (dialog.editableSourcePath && allTokensFlat?.[dialog.editableSourcePath]?.$value) ??
    (dialog.editableSourcePath === sourceTokenPath ? sourceTokenValue : undefined);

  // --- Stepper state ---
  const skipTypeStep = Boolean(existingRecipe || initialDraft?.selectedType || template);
  const [activeStep, setActiveStep] = useState<Step>(skipTypeStep ? 2 : 1);

  // Destination props passed into StepSource's inline output section
  const destinationProps: Omit<StepWhereProps, 'onToggleMultiBrand' | 'inputTable' | 'onInputTableChange'> = {
    name: dialog.name,
    targetSet: dialog.targetSet,
    targetGroup: dialog.targetGroup,
    allSets,
    isMultiBrand: dialog.isMultiBrand,
    targetSetTemplate: dialog.targetSetTemplate,
    onNameChange: dialog.handleNameChange,
    onTargetSetChange: dialog.setTargetSet,
    onTargetGroupChange: dialog.setTargetGroup,
    onTargetSetTemplateChange: dialog.setTargetSetTemplate,
  };

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

  // --- Footer buttons per step ---
  const footerContent = (() => {
    // Step 3 confirmation view (after "Review" click)
    if (dialog.showConfirmation) {
      const saveLabel = (() => {
        if (dialog.saving)
          return dialog.isEditing ? "Saving\u2026" : "Creating\u2026";
        if (dialog.overwriteCheckLoading) return "Checking\u2026";
        if (dialog.previewReviewStale) return "Review update";
        if (dialog.isEditing) {
          return `Save (${dialog.previewTokens.length} token${dialog.previewTokens.length === 1 ? "" : "s"})`;
        }
        return "Create";
      })();

      return (
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          {dialog.existingTokensError && (
            <div role="alert" className={AUTHORING.error}>
              {dialog.existingTokensError}
            </div>
          )}
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <button
              type="button"
              onClick={dialog.handleCancelConfirmation}
              className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
            >
              Back
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
    }

    // Step 1: Type selection
    if (activeStep === 1) {
      return (
        <div className={AUTHORING_SURFACE_CLASSES.footer}>
          <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
            <button
              type="button"
              onClick={requestClose}
              className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
            >
              Cancel
            </button>
            <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className={AUTHORING.footerBtnPrimary}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Step 2: Configure + Destination (merged)
    const missingFields: string[] = [];
    if (!dialog.targetGroup.trim()) missingFields.push("output path");
    if (!dialog.name.trim()) missingFields.push("name");

    return (
      <div className={AUTHORING_SURFACE_CLASSES.footer}>
        {missingFields.length > 0 && !dialog.saving && (
          <p className={AUTHORING_SURFACE_CLASSES.footerMeta}>
            {missingFields.length === 1
              ? `${missingFields[0].charAt(0).toUpperCase() + missingFields[0].slice(1)} is required.`
              : `Required: ${missingFields.join(", ")}.`}
          </p>
        )}
        <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
          <button
            type="button"
            onClick={() => skipTypeStep ? requestClose() : setActiveStep(1)}
            className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
          >
            {skipTypeStep ? "Cancel" : "Back"}
          </button>
          <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || dialog.saving || dialog.overwriteCheckLoading || (dialog.typeNeedsValue && !dialog.hasValue && !dialog.isMultiBrand)}
              className={`${AUTHORING.footerBtnPrimary} flex items-center justify-center gap-1.5`}
            >
              {dialog.saving && <Spinner size="sm" className="text-white" />}
              {dialog.overwriteCheckLoading
                ? "Checking\u2026"
                : hasPreviewRisks(dialog.previewAnalysis)
                  ? "Review"
                  : dialog.isEditing ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    );
  })();

  // --- Accessibility ---
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose]);

  useEffect(() => {
    if (!editorSessionHost) {
      return;
    }
    editorSessionHost.registerSession({
      isDirty: dialog.isDirty,
      canSave: canSave && !dialog.saving && !dialog.overwriteCheckLoading,
      save: () =>
        dialog.showConfirmation
          ? dialog.handleConfirmSave()
          : dialog.handleQuickSave(),
      discard: async () => {
        requestClose();
      },
      closeWhenClean: requestClose,
    });
    return () => {
      editorSessionHost.registerSession(null);
    };
  }, [
    canSave,
    dialog.handleConfirmSave,
    dialog.handleQuickSave,
    dialog.isDirty,
    dialog.overwriteCheckLoading,
    dialog.saving,
    dialog.showConfirmation,
    dialog,
    editorSessionHost,
    requestClose,
  ]);

  const isPanel = presentation === "panel";
  const shellClassName = isPanel
    ? "h-full flex flex-col"
    : "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4";
  const dialogClassName = isPanel
    ? "bg-[var(--color-figma-bg)] w-full h-full flex flex-col overflow-hidden"
    : "bg-[var(--color-figma-bg)] rounded-lg border border-[var(--color-figma-border)] shadow-xl w-full max-w-[min(40rem,95vw)] flex flex-col max-h-[90vh]";

  const stepCount = skipTypeStep ? 1 : 2;
  const displayStep = skipTypeStep ? 1 as Step : activeStep;

  const title = (
    <div className="flex items-center gap-2.5">
      <span
        id="token-recipe-dialog-title"
        className="text-[12px] font-semibold text-[var(--color-figma-text)]"
      >
        {dialog.isEditing
          ? "Edit recipe"
          : template
            ? template.label
            : "New recipe"}
      </span>
      {!dialog.showConfirmation && (
        <StepDots active={displayStep} total={stepCount} />
      )}
    </div>
  );
  const headerActions = (
    <button
      type="button"
      onClick={requestClose}
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

  return (
    <div className={shellClassName}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={isPanel ? undefined : true}
        aria-labelledby="token-recipe-dialog-title"
        className={dialogClassName}
      >
        <EditorShell
          surface="authoring"
          onBack={onBack}
          backAriaLabel="Back to templates"
          title={title}
          headerActions={headerActions}
          footer={footerContent}
          bodyClassName={AUTHORING_SURFACE_CLASSES.bodyStack}
        >
          {dialog.showConfirmation ? (
            <StepSave
              name={dialog.name}
              targetGroup={dialog.targetGroup}
              targetSet={dialog.targetSet}
              isEditing={dialog.isEditing}
              isMultiBrand={dialog.isMultiBrand}
              inputTable={dialog.inputTable}
              targetSetTemplate={dialog.targetSetTemplate}
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
              {activeStep === 1 && (
                <StepIntent
                  selectedType={dialog.selectedType}
                  recommendedType={dialog.recommendedType}
                  connected
                  activeSet={activeSet}
                  sourceTokenPath={sourceTokenPath}
                  sourceTokenName={sourceTokenName}
                  sourceTokenType={sourceTokenType}
                  prefilled={false}
                  onTypeChange={(type) => {
                    dialog.handleTypeChange(type);
                  }}
                  onTemplateApply={(_tmpl, draft) => {
                    if (draft.selectedType) dialog.handleTypeChange(draft.selectedType);
                    if (draft.configs) {
                      const type = draft.selectedType ?? dialog.selectedType;
                      const cfg = draft.configs[type];
                      if (cfg) dialog.handleConfigChange(type, cfg);
                    }
                    if (draft.name && draft.nameIsAuto) dialog.handleNameChange(draft.name);
                    if (draft.targetGroup) dialog.setTargetGroup(draft.targetGroup);
                    if (draft.semanticEnabled !== undefined) dialog.setSemanticEnabled(draft.semanticEnabled);
                    if (draft.semanticPrefix) dialog.setSemanticPrefix(draft.semanticPrefix);
                    if (draft.semanticMappings) dialog.setSemanticMappings(draft.semanticMappings);
                    if (draft.selectedSemanticPatternId !== undefined) dialog.setSelectedSemanticPatternId(draft.selectedSemanticPatternId);
                    setActiveStep(2);
                  }}
                  onConfigChange={dialog.handleConfigChange}
                />
              )}

              {activeStep === 2 && (
                <StepSource
                  isEditing={dialog.isEditing}
                  selectedType={dialog.selectedType}
                  currentConfig={dialog.currentConfig}
                  typeNeedsValue={dialog.typeNeedsValue}
                  hasValue={dialog.hasValue}
                  sourceTokenPath={dialog.editableSourcePath || undefined}
                  sourceTokenValue={activeSourceValue}
                  inlineValue={dialog.inlineValue}
                  isMultiBrand={dialog.isMultiBrand}
                  inputTable={dialog.inputTable}
                  onToggleMultiBrand={dialog.handleToggleMultiBrand}
                  onInputTableChange={dialog.setInputTable}
                  previewTokens={dialog.previewTokens}
                  previewLoading={dialog.previewLoading}
                  previewError={dialog.previewError}
                  previewBrand={dialog.previewBrand}
                  multiBrandPreviews={dialog.multiBrandPreviews}
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
                  onConfigChange={dialog.handleConfigChange}
                  onSourcePathChange={dialog.setEditableSourcePath}
                  onInlineValueChange={dialog.setInlineValue}
                  onOverrideChange={dialog.handleOverrideChange}
                  onOverrideClear={dialog.handleOverrideClear}
                  onClearAllOverrides={dialog.clearAllOverrides}
                  destination={destinationProps}
                  detachedCount={existingRecipe?.detachedPaths?.length ?? 0}
                />
              )}
            </>
          )}
        </EditorShell>
      </div>
    </div>
  );
}
