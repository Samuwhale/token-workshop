import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import type { TokenGenerator, GeneratorTemplate } from "../hooks/useGenerators";
import type { EditorSessionRegistration } from "../contexts/WorkspaceControllerContext";
import type { TokenCollection } from "@tokenmanager/core";
import type { SemanticStarter } from "./graph-templates";
import {
  useGeneratedGroupDialog,
  type GeneratorDialogInitialDraft,
} from "../hooks/useGeneratedGroupEditor";
import type { GeneratorSaveSuccessInfo } from "../hooks/useGeneratedGroupSave";
import { requiresGeneratedGroupReview } from "../hooks/useGeneratedGroupPreview";
import { StepIntent } from "./generated-group-editor/StepIntent";
import { StepSource } from "./generated-group-editor/StepSource";
import type { StepWhereProps } from "./generated-group-editor/StepWhere";
import { StepSave } from "./generated-group-editor/StepSave";
import { Spinner } from "./Spinner";
import type { ToastAction } from "../shared/toastBus";
import { GRAPH_TEMPLATES } from "./graph-templates";
import { getSingleObviousGeneratorType } from "./generators/generatorUtils";
import {
  getGeneratedGroupKeepUpdatedAvailability,
  getGeneratedGroupTypeLabel,
} from "../shared/generatedGroupUtils";

export interface GeneratedGroupEditorProps {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  intentPreset?: "semantic-aliases";
  currentCollectionId: string;
  allTokensFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  sourceValuesFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  perCollectionFlat?: Record<
    string,
    Record<string, import("../../shared/types").TokenMapEntry>
  >;
  collections?: TokenCollection[];
  existingGenerator?: TokenGenerator;
  initialDraft?: GeneratorDialogInitialDraft;
  template?: GeneratorTemplate & { semanticStarter?: SemanticStarter };
  onBack?: () => void;
  onClose: () => void;
  onSaved: (info?: GeneratorSaveSuccessInfo) => void;
  onInterceptSemanticMapping?: (data: {
    tokens: import("../hooks/useGenerators").GeneratedTokenResult[];
    targetGroup: string;
    targetCollection: string;
    generatorType: import("../hooks/useGenerators").GeneratorType;
  }) => void;
  getSuccessToastAction?: (
    info: GeneratorSaveSuccessInfo,
  ) => ToastAction | undefined;
  pathToCollectionId?: Record<string, string>;
  onPushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  presentation?: "modal" | "panel";
  editorSessionHost?: {
    registerSession: (session: EditorSessionRegistration | null) => void;
    requestClose: () => void;
  };
}

function getDialogTitle(params: {
  isEditing: boolean;
  selectedType: import("../hooks/useGenerators").GeneratorType;
  outcomeChooserVisible: boolean;
}) {
  if (params.isEditing) {
    return `Edit ${getGeneratedGroupTypeLabel(params.selectedType).toLowerCase()}`;
  }
  if (params.outcomeChooserVisible) {
    return "Generate\u2026";
  }
  return `Generate ${getGeneratedGroupTypeLabel(params.selectedType).toLowerCase()}`;
}

export function GeneratedGroupEditor({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  sourceTokenValue,
  intentPreset,
  currentCollectionId,
  allTokensFlat,
  sourceValuesFlat,
  perCollectionFlat,
  collections = [],
  existingGenerator,
  initialDraft,
  template,
  onBack,
  onClose,
  onSaved,
  onInterceptSemanticMapping,
  getSuccessToastAction,
  pathToCollectionId,
  onPushUndo,
  presentation = "modal",
  editorSessionHost,
}: GeneratedGroupEditorProps) {
  const dialog = useGeneratedGroupDialog({
    serverUrl,
    sourceTokenPath,
    sourceTokenName,
    sourceTokenType,
    sourceTokenValue,
    currentCollectionId,
    existingGenerator,
    template,
    initialDraft,
    allTokensFlat,
    sourceValuesFlat,
    onSaved,
    onInterceptSemanticMapping,
    getSuccessToastAction,
    pushUndo: onPushUndo,
  });
  const requestClose = editorSessionHost?.requestClose ?? onClose;
  const activeSourceValue =
    (dialog.editableSourcePath &&
      sourceValuesFlat?.[dialog.editableSourcePath]?.$value) ??
    (dialog.editableSourcePath === sourceTokenPath
      ? sourceTokenValue
      : undefined);
  const activeModeLabel = useMemo(() => {
    const collection = collections.find(
      (candidate) => candidate.id === dialog.targetCollection,
    );
    if (!collection || collection.modes.length === 0) {
      return null;
    }
    return collection.modes[0]?.name ?? null;
  }, [collections, dialog.targetCollection]);
  const keepUpdatedAvailability = useMemo(
    () =>
      getGeneratedGroupKeepUpdatedAvailability({
        sourceTokenPath: dialog.editableSourcePath || sourceTokenPath,
        sourceTokenEntry:
          (dialog.editableSourcePath
            ? allTokensFlat?.[dialog.editableSourcePath]
            : undefined) ??
          (sourceTokenPath ? allTokensFlat?.[sourceTokenPath] : undefined),
        collections,
        pathToCollectionId,
        perCollectionFlat,
      }),
    [
      allTokensFlat,
      collections,
      dialog.editableSourcePath,
      pathToCollectionId,
      perCollectionFlat,
      sourceTokenPath,
    ],
  );

  useEffect(() => {
    if (!keepUpdatedAvailability.supported && dialog.keepUpdated) {
      dialog.setKeepUpdated(false);
    }
  }, [dialog, keepUpdatedAvailability.supported]);

  const hasPrefilledSource = Boolean(sourceTokenPath?.trim());
  const hasExplicitOutcome = Boolean(template || initialDraft?.selectedType);
  const hasSingleObviousOutcome = Boolean(
    hasPrefilledSource &&
      getSingleObviousGeneratorType(
        sourceTokenType,
        sourceTokenPath,
        sourceTokenName,
        sourceTokenValue,
      ),
  );
  const [outcomeChooserVisible, setOutcomeChooserVisible] = useState(
    !existingGenerator && !hasExplicitOutcome && !hasSingleObviousOutcome,
  );

  useEffect(() => {
    setOutcomeChooserVisible(
      !existingGenerator && !hasExplicitOutcome && !hasSingleObviousOutcome,
    );
  }, [existingGenerator, hasExplicitOutcome, hasSingleObviousOutcome]);

  const intentTemplates =
    intentPreset === "semantic-aliases"
      ? GRAPH_TEMPLATES.filter(
          (candidate) => (candidate.semanticStarter?.mappings.length ?? 0) > 0,
        )
      : GRAPH_TEMPLATES;
  const canChangeOutcome = !dialog.isEditing && !template;
  const intentTitle =
    intentPreset === "semantic-aliases"
      ? "Choose the foundations to alias"
      : "Choose an outcome";
  const intentDescription =
    intentPreset === "semantic-aliases"
      ? "Pick the foundation group you want to generate, then adjust the group inside this collection."
      : "Pick the kind of generated group you want to add to this collection.";

  const destinationProps: StepWhereProps = {
    name: dialog.name,
    targetCollection: dialog.targetCollection,
    targetGroup: dialog.targetGroup,
    keepUpdated: dialog.keepUpdated,
    keepUpdatedDisabled: !keepUpdatedAvailability.supported,
    keepUpdatedHint: keepUpdatedAvailability.reason,
    semanticEnabled: dialog.semanticEnabled,
    semanticPrefix: dialog.semanticPrefix,
    semanticMappings: dialog.semanticMappings,
    selectedSemanticPatternId: dialog.selectedSemanticPatternId,
    previewTokens: dialog.previewTokens,
    selectedType: dialog.selectedType,
    onNameChange: dialog.handleNameChange,
    onTargetGroupChange: dialog.setTargetGroup,
    onKeepUpdatedChange: dialog.setKeepUpdated,
    onSemanticLayerChange: (layer) => {
      if (!layer) {
        dialog.setSemanticEnabled(false);
        dialog.setSemanticMappings([]);
        dialog.setSelectedSemanticPatternId(null);
        return;
      }
      dialog.setSemanticEnabled(true);
      dialog.setSemanticPrefix(layer.prefix);
      dialog.setSemanticMappings(layer.mappings);
      dialog.setSelectedSemanticPatternId(layer.patternId ?? null);
    },
  };

  const canSave =
    dialog.targetGroup.trim().length > 0 &&
    (!dialog.typeNeedsValue || dialog.hasValue);

  const handleSave = async () => {
    if (dialog.showConfirmation) {
      await dialog.handleConfirmSave();
    } else {
      await dialog.handleSave();
    }
  };

  const footerContent = (() => {
    if (dialog.showConfirmation) {
      const saveLabel = (() => {
        if (dialog.saving) return dialog.isEditing ? "Saving…" : "Creating…";
        if (dialog.overwriteCheckLoading) return "Checking…";
        if (dialog.previewReviewStale) return "Review update";
        return dialog.isEditing
          ? `Save group (${dialog.previewTokens.length} token${dialog.previewTokens.length === 1 ? "" : "s"})`
          : "Create group";
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

    const missingFields: string[] = [];
    if (!dialog.targetGroup.trim()) missingFields.push("group");

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
            onClick={requestClose}
            className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
          >
            Cancel
          </button>
          <div className={AUTHORING_SURFACE_CLASSES.footerPrimary}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || dialog.saving || dialog.overwriteCheckLoading}
              className={`${AUTHORING.footerBtnPrimary} flex items-center justify-center gap-1.5`}
            >
              {dialog.saving && <Spinner size="sm" className="text-white" />}
              {dialog.overwriteCheckLoading
                ? "Checking…"
                : requiresGeneratedGroupReview(dialog.previewAnalysis)
                  ? "Review changes"
                  : dialog.isEditing
                    ? "Save group"
                    : "Create group"}
            </button>
          </div>
        </div>
      </div>
    );
  })();

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose]);

  useEffect(() => {
    if (!editorSessionHost) {
      return;
    }
    const {
      handleConfirmSave,
      handleQuickSave,
      isDirty,
      overwriteCheckLoading,
      saving,
      showConfirmation,
    } = dialog;
    editorSessionHost.registerSession({
      isDirty,
      canSave: canSave && !saving && !overwriteCheckLoading,
      save: () =>
        showConfirmation ? handleConfirmSave() : handleQuickSave(),
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
    dialog,
    editorSessionHost,
    onClose,
  ]);

  const isPanel = presentation === "panel";
  const shellClassName = isPanel
    ? "h-full flex flex-col"
    : "fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50 p-4";
  const dialogClassName = isPanel
    ? "bg-[var(--color-figma-bg)] w-full h-full flex flex-col overflow-hidden"
    : "bg-[var(--color-figma-bg)] rounded-lg border border-[var(--color-figma-border)] shadow-xl w-full max-w-[min(42rem,95vw)] flex flex-col max-h-[90vh]";
  const title = getDialogTitle({
    isEditing: dialog.isEditing,
    selectedType: dialog.selectedType,
    outcomeChooserVisible,
  });
  const activeSourceLabel =
    dialog.editableSourcePath?.trim() || sourceTokenPath?.trim() || null;
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
        aria-labelledby="generated-group-editor-title"
        className={dialogClassName}
      >
        <EditorShell
          surface="authoring"
          onBack={onBack}
          backAriaLabel="Back to templates"
          title={
            <span
              id="generated-group-editor-title"
              className="text-heading font-semibold text-[var(--color-figma-text)]"
            >
              {title}
            </span>
          }
          headerActions={headerActions}
          footer={footerContent}
          bodyClassName={AUTHORING_SURFACE_CLASSES.bodyStack}
        >
          <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
            <div className={AUTHORING.generatorSectionCard}>
              <div className="flex flex-wrap items-start gap-3 text-secondary text-[var(--color-figma-text-secondary)]">
                <span>
                  Collection{" "}
                  <span className="font-mono text-[var(--color-figma-text)]">
                    {dialog.targetCollection}
                  </span>
                </span>
                {activeModeLabel && (
                  <span>
                    Mode{" "}
                    <span className="text-[var(--color-figma-text)]">
                      {activeModeLabel}
                    </span>
                  </span>
                )}
                {activeSourceLabel && (
                  <span>
                    Source token{" "}
                    <span className="font-mono text-[var(--color-figma-text)]">
                      {activeSourceLabel}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </section>
          {dialog.showConfirmation ? (
            <StepSave
              name={dialog.name}
              targetGroup={dialog.targetGroup}
              targetCollection={dialog.targetCollection}
              collectionModeLabel={activeModeLabel}
              selectedType={dialog.selectedType}
              isEditing={dialog.isEditing}
              keepUpdated={dialog.keepUpdated}
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
              {!dialog.isEditing && (
                outcomeChooserVisible ? (
                  <StepIntent
                    templates={intentTemplates}
                    title={intentTitle}
                    description={intentDescription}
                    selectedType={dialog.selectedType}
                    recommendedType={dialog.recommendedType}
                    connected
                    currentCollectionId={currentCollectionId}
                    sourceTokenPath={sourceTokenPath}
                    sourceTokenName={sourceTokenName}
                    sourceTokenType={sourceTokenType}
                    prefilled={false}
                    onTypeChange={(type) => {
                      dialog.handleTypeChange(type);
                    }}
                    onTemplateApply={(_template, draft) => {
                      if (draft.selectedType) dialog.handleTypeChange(draft.selectedType);
                      if (draft.configs) {
                        const type = draft.selectedType ?? dialog.selectedType;
                        const config = draft.configs[type];
                        if (config) dialog.handleConfigChange(type, config);
                      }
                      if (draft.name && draft.nameIsAuto) dialog.handleNameChange(draft.name);
                      if (draft.targetGroup) dialog.setTargetGroup(draft.targetGroup);
                      if (draft.keepUpdated !== undefined) dialog.setKeepUpdated(draft.keepUpdated);
                      if (draft.semanticEnabled !== undefined) dialog.setSemanticEnabled(draft.semanticEnabled);
                      if (draft.semanticPrefix) dialog.setSemanticPrefix(draft.semanticPrefix);
                      if (draft.semanticMappings) dialog.setSemanticMappings(draft.semanticMappings);
                      if (draft.selectedSemanticPatternId !== undefined) {
                        dialog.setSelectedSemanticPatternId(draft.selectedSemanticPatternId);
                      }
                      setOutcomeChooserVisible(false);
                    }}
                    onConfigChange={dialog.handleConfigChange}
                  />
                ) : (
                  <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
                    <div className={AUTHORING.generatorSectionCard}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                            Outcome
                          </p>
                          <p className="mt-0.5 text-subheading font-medium text-[var(--color-figma-text)]">
                            {getGeneratedGroupTypeLabel(dialog.selectedType)}
                          </p>
                        </div>
                        {canChangeOutcome && (
                          <button
                            type="button"
                            onClick={() => setOutcomeChooserVisible(true)}
                            className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-secondary font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                )
              )}

              <StepSource
                isEditing={dialog.isEditing}
                selectedType={dialog.selectedType}
                currentConfig={dialog.currentConfig}
                typeNeedsValue={dialog.typeNeedsValue}
                hasValue={dialog.hasValue}
                sourceTokenPath={dialog.editableSourcePath || undefined}
                sourceTokenValue={activeSourceValue}
                inlineValue={dialog.inlineValue}
                previewTokens={dialog.previewTokens}
                previewLoading={dialog.previewLoading}
                previewError={dialog.previewError}
                pendingOverrides={dialog.pendingOverrides}
                lockedCount={dialog.lockedCount}
                overwrittenEntries={dialog.overwrittenEntries}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
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
                detachedCount={existingGenerator?.detachedPaths?.length ?? 0}
                collectionModeLabel={activeModeLabel}
              />
            </>
          )}
        </EditorShell>
      </div>
    </div>
  );
}
