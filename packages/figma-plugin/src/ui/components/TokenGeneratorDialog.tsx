import { useEffect, useState } from 'react';
import { ConfirmModal } from './ConfirmModal';
import type {
  TokenGenerator,
  GeneratorTemplate,
} from '../hooks/useGenerators';
import { useGeneratorDialog } from '../hooks/useGeneratorDialog';
import { StepperHeader, StepWhere, StepWhat, StepReview } from './generator-steps';
import type { GeneratorStep } from './generator-steps';
import { Spinner } from './Spinner';

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
  allTokensFlat?: Record<string, import('../../shared/types').TokenMapEntry>;
  existingGenerator?: TokenGenerator;
  /** Pre-fill from a quick-start template */
  template?: GeneratorTemplate;
  /** When provided, shows a back arrow to return to the previous step (e.g. template picker) */
  onBack?: () => void;
  onClose: () => void;
  onSaved: (info?: { targetGroup: string }) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog */
  onInterceptSemanticMapping?: (data: { tokens: import('../hooks/useGenerators').GeneratedTokenResult[]; targetGroup: string; targetSet: string; generatorType: import('../hooks/useGenerators').GeneratorType }) => void;
  /** Token path → set name for autocomplete display */
  pathToSet?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Stepper shell
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
  template,
  onBack,
  onClose,
  onSaved,
  onInterceptSemanticMapping,
  pathToSet,
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
    onSaved,
    onInterceptSemanticMapping,
  });

  // --- Stepper state ---
  // Editing? Start on Step 2 (config). New? Start on Step 1 (where).
  const [currentStep, setCurrentStep] = useState<GeneratorStep>(
    dialog.isEditing ? 'what' : 'where'
  );
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // --- Step navigation ---
  const canAdvanceToWhat = dialog.targetGroup.trim().length > 0 && dialog.name.trim().length > 0;
  const canAdvanceToReview = canAdvanceToWhat && (
    !dialog.typeNeedsValue || dialog.hasValue || dialog.isMultiBrand
  );

  const canNavigateTo = (step: GeneratorStep): boolean => {
    switch (step) {
      case 'where': return true;
      case 'what': return canAdvanceToWhat;
      case 'review': return canAdvanceToReview;
    }
  };

  const goNext = () => {
    if (currentStep === 'where' && canAdvanceToWhat) setCurrentStep('what');
    else if (currentStep === 'what' && canAdvanceToReview) setCurrentStep('review');
  };

  const goPrev = () => {
    if (currentStep === 'review') setCurrentStep('what');
    else if (currentStep === 'what') setCurrentStep('where');
  };

  const handleClose = () => {
    if (dialog.isDirtyRef.current) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  // --- Footer button labels ---
  const footerLabel = (() => {
    if (currentStep === 'where') return 'Next: Configure';
    if (currentStep === 'what') {
      if (dialog.isEditing) return 'Save Changes';
      const count = dialog.previewTokens.length;
      return count > 0
        ? `Next: Review (${count} token${count !== 1 ? 's' : ''})`
        : 'Next: Review';
    }
    // review step
    if (dialog.saving) return dialog.isEditing ? 'Saving...' : 'Creating...';
    if (dialog.overwriteCheckLoading) return 'Checking...';
    const aliasCount = dialog.semanticEnabled
      ? dialog.semanticMappings.filter(m => m.semantic.trim()).length
      : 0;
    if (dialog.isEditing) return 'Confirm & Update';
    return aliasCount > 0
      ? `Confirm & Create (+${aliasCount} aliases)`
      : 'Confirm & Create';
  })();

  const footerDisabled = (() => {
    if (currentStep === 'where') return !canAdvanceToWhat;
    if (currentStep === 'what') {
      if (dialog.isEditing) {
        return dialog.saving || !!dialog.existingTokensError || !dialog.targetGroup.trim() || !dialog.name.trim() || (!dialog.isMultiBrand && dialog.typeNeedsValue && !dialog.hasValue);
      }
      return !canAdvanceToReview;
    }
    return dialog.saving || dialog.overwriteCheckLoading;
  })();

  const handleFooterClick = async () => {
    if (currentStep === 'where') {
      goNext();
    } else if (currentStep === 'what') {
      if (dialog.isEditing) {
        // For edits, skip review — save directly via confirmation flow
        await dialog.handleSave();
      } else {
        goNext();
      }
    } else {
      // review step — confirm save
      await dialog.handleConfirmSave();
    }
  };

  // --- Missing field hints ---
  const missingFields = (() => {
    const missing: string[] = [];
    if (!dialog.targetGroup.trim()) missing.push('target group');
    if (!dialog.name.trim()) missing.push('name');
    if (currentStep !== 'where' && !dialog.isMultiBrand && dialog.typeNeedsValue && !dialog.hasValue) {
      missing.push(dialog.selectedType === 'colorRamp' || dialog.selectedType === 'accessibleColorPair' || dialog.selectedType === 'darkModeInversion' ? 'base color' : 'base value');
    }
    return missing;
  })();

  // --- Handle confirmation flow from useGeneratorSave ---
  // When useGeneratorSave sets showConfirmation=true after handleSave(),
  // we navigate to the review step
  useEffect(() => {
    if (dialog.showConfirmation && currentStep !== 'review') {
      setCurrentStep('review');
    }
  }, [dialog.showConfirmation, currentStep]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      {showDiscardConfirm && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description="You have unsaved changes. They will be lost if you close."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={() => { setShowDiscardConfirm(false); onClose(); }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
      <div className="bg-[var(--color-figma-bg)] rounded-t-lg border border-[var(--color-figma-border)] shadow-xl w-full max-w-[min(56rem,95vw)] flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-figma-border)] shrink-0">
          <div className="flex items-center gap-2">
            {currentStep !== 'where' ? (
              <button type="button" onClick={goPrev} aria-label="Back" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
            ) : onBack ? (
              <button type="button" onClick={onBack} aria-label="Back to templates" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
            ) : null}
            <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              {dialog.isEditing ? 'Edit Generator' : template ? template.label : 'New Generator'}
            </span>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step indicator */}
        <StepperHeader
          currentStep={currentStep}
          onStepClick={setCurrentStep}
          canNavigateTo={canNavigateTo}
        />

        {/* Step content */}
        <div className="flex-1 overflow-y-auto" key={currentStep}>
          {currentStep === 'where' && (
            <StepWhere
              name={dialog.name}
              targetSet={dialog.targetSet}
              targetGroup={dialog.targetGroup}
              allSets={allSets}
              isMultiBrand={dialog.isMultiBrand}
              inputTable={dialog.inputTable}
              targetSetTemplate={dialog.targetSetTemplate}
              isEditing={dialog.isEditing}
              onNameChange={dialog.handleNameChange}
              onTargetSetChange={dialog.setTargetSet}
              onTargetGroupChange={dialog.setTargetGroup}
              onToggleMultiBrand={dialog.handleToggleMultiBrand}
              onInputTableChange={dialog.setInputTable}
              onTargetSetTemplateChange={dialog.setTargetSetTemplate}
            />
          )}
          {currentStep === 'what' && (
            <StepWhat
              selectedType={dialog.selectedType}
              recommendedType={dialog.recommendedType}
              currentConfig={dialog.currentConfig}
              typeNeedsValue={dialog.typeNeedsValue}
              hasSource={dialog.hasSource}
              hasValue={dialog.hasValue}
              isMultiBrand={dialog.isMultiBrand}
              editableSourcePath={dialog.editableSourcePath}
              sourceTokenPath={sourceTokenPath}
              sourceTokenType={sourceTokenType}
              sourceTokenValue={sourceTokenValue}
              inlineValue={dialog.inlineValue}
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
              onTypeChange={dialog.handleTypeChange}
              onConfigChange={dialog.handleConfigChange}
              onSourcePathChange={dialog.setEditableSourcePath}
              onInlineValueChange={dialog.setInlineValue}
              onOverrideChange={dialog.handleOverrideChange}
              onOverrideClear={dialog.handleOverrideClear}
              onClearAllOverrides={dialog.clearAllOverrides}
            />
          )}
          {currentStep === 'review' && (
            <StepReview
              selectedType={dialog.selectedType}
              name={dialog.name}
              targetGroup={dialog.targetGroup}
              targetSet={dialog.targetSet}
              isEditing={dialog.isEditing}
              isMultiBrand={dialog.isMultiBrand}
              inputTable={dialog.inputTable}
              targetSetTemplate={dialog.targetSetTemplate}
              previewTokens={dialog.previewTokens}
              overwrittenEntries={dialog.overwrittenEntries}
              existingOverwritePathSet={dialog.existingOverwritePathSet}
              overwritePendingPaths={dialog.overwritePendingPaths}
              overwriteCheckLoading={dialog.overwriteCheckLoading}
              overwriteCheckError={dialog.overwriteCheckError}
              semanticEnabled={dialog.semanticEnabled}
              semanticPrefix={dialog.semanticPrefix}
              semanticMappings={dialog.semanticMappings}
              selectedSemanticPatternId={dialog.selectedSemanticPatternId}
              saveError={dialog.saveError}
              hasInterceptHandler={Boolean(onInterceptSemanticMapping)}
              onSemanticEnabledChange={dialog.setSemanticEnabled}
              onSemanticPrefixChange={dialog.setSemanticPrefix}
              onSemanticMappingsChange={dialog.setSemanticMappings}
              onSemanticPatternSelect={dialog.setSelectedSemanticPatternId}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
          {missingFields.length > 0 && !dialog.saving && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              {missingFields.length === 1
                ? `${missingFields[0].charAt(0).toUpperCase() + missingFields[0].slice(1)} is required.`
                : `Required: ${missingFields.join(', ')}.`}
            </p>
          )}
          {dialog.existingTokensError && (
            <div className="text-[10px] text-[var(--color-figma-error)]">{dialog.existingTokensError}</div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={currentStep === 'where' ? handleClose : goPrev}
              className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
            >
              {currentStep === 'where' ? 'Cancel' : 'Back'}
            </button>
            <button
              type="button"
              onClick={handleFooterClick}
              disabled={footerDisabled}
              className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {dialog.saving && <Spinner size="sm" className="text-white" />}
              {footerLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
