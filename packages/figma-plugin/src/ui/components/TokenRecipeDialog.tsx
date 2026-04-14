import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import type { TokenRecipe, RecipeTemplate } from "../hooks/useRecipes";
import type { EditorSessionRegistration } from "../contexts/WorkspaceControllerContext";
import type { SemanticStarter } from "./graph-templates";
import type { GraphTemplate } from "./graph-templates";
import {
  useRecipeDialog,
  type RecipeDialogInitialDraft,
} from "../hooks/useRecipeDialog";
import type { RecipeSaveSuccessInfo } from "../hooks/useRecipeSave";
import { StepIntent } from "./recipe-steps/StepIntent";
import { StepSource } from "./recipe-steps/StepSource";
import { StepWhere } from "./recipe-steps/StepWhere";
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
// Single-form recipe dialog (replaces the 3-step wizard)
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
  const [appliedTemplate, setAppliedTemplate] = useState<GraphTemplate | undefined>(undefined);
  const activeTemplate = appliedTemplate ?? template;

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
      return "Review";
    }
    if (dialog.saving)
      return dialog.isEditing ? "Saving\u2026" : "Creating\u2026";
    if (dialog.overwriteCheckLoading) return "Checking\u2026";
    if (dialog.previewReviewStale) return "Review update";
    const aliasCount = dialog.semanticEnabled
      ? dialog.semanticMappings.filter((m) => m.semantic.trim()).length
      : 0;
    if (dialog.isEditing) {
      return `Save Changes (${dialog.previewTokens.length} token${dialog.previewTokens.length === 1 ? "" : "s"})`;
    }
    return aliasCount > 0
      ? `Create (+${aliasCount} aliases)`
      : "Create";
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
        onClose();
      },
      closeWhenClean: onClose,
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
    editorSessionHost,
    onClose,
  ]);

  const isPanel = presentation === "panel";
  const shellClassName = isPanel
    ? "h-full flex flex-col"
    : "fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4";
  const dialogClassName = isPanel
    ? "bg-[var(--color-figma-bg)] w-full h-full flex flex-col overflow-hidden"
    : "bg-[var(--color-figma-bg)] rounded-lg border border-[var(--color-figma-border)] shadow-xl w-full max-w-[min(56rem,95vw)] flex flex-col max-h-[90vh]";
  const title = (
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
            dialog.showConfirmation ? dialog.handleCancelConfirmation : requestClose
          }
          className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
        >
          {dialog.showConfirmation ? "Back" : "Cancel"}
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
          footer={footer}
          bodyClassName={AUTHORING_SURFACE_CLASSES.bodyStack}
        >
          {existingRecipe?.detachedPaths &&
            existingRecipe.detachedPaths.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-[var(--color-figma-text)]">
                {existingRecipe.detachedPaths.length} detached output
                {existingRecipe.detachedPaths.length === 1 ? "" : "s"}
              </div>
            )}

          {dialog.showConfirmation ? (
            <StepSave
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
              templateStarter={activeTemplate?.semanticStarter}
              onSemanticEnabledChange={dialog.setSemanticEnabled}
              onSemanticPrefixChange={dialog.setSemanticPrefix}
              onSemanticMappingsChange={dialog.setSemanticMappings}
              onSemanticPatternSelect={dialog.setSelectedSemanticPatternId}
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
              <StepIntent
                selectedType={dialog.selectedType}
                recommendedType={dialog.recommendedType}
                connected
                activeSet={activeSet}
                sourceTokenPath={sourceTokenPath}
                sourceTokenName={sourceTokenName}
                sourceTokenType={sourceTokenType}
                prefilled={Boolean(initialDraft?.selectedType || existingRecipe || template)}
                onTypeChange={dialog.handleTypeChange}
                onTemplateApply={(tmpl, draft) => {
                  setAppliedTemplate(tmpl);
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
                }}
                onConfigChange={dialog.handleConfigChange}
              />

              <StepSource
                isEditing={dialog.isEditing}
                selectedType={dialog.selectedType}
                currentConfig={dialog.currentConfig}
                typeNeedsValue={dialog.typeNeedsValue}
                hasValue={dialog.hasValue}
                sourceTokenPath={sourceTokenPath}
                sourceTokenValue={sourceTokenValue}
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
              />

              <StepWhere
                name={dialog.name}
                targetSet={dialog.targetSet}
                targetGroup={dialog.targetGroup}
                allSets={allSets}
                isMultiBrand={dialog.isMultiBrand}
                targetSetTemplate={dialog.targetSetTemplate}
                onNameChange={dialog.handleNameChange}
                onTargetSetChange={dialog.setTargetSet}
                onTargetGroupChange={dialog.setTargetGroup}
                onTargetSetTemplateChange={dialog.setTargetSetTemplate}
              />
            </>
          )}
        </EditorShell>
      </div>
    </div>
  );
}
