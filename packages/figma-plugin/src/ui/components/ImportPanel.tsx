import { useEffect, useRef } from 'react';
import { SkeletonImportRow } from './Skeleton';
import {
  ImportPanelProvider,
  useImportDestinationContext,
  useImportResultContext,
  useImportReviewContext,
  useImportSourceContext,
  type ImportPanelProps,
} from './ImportPanelContext';
import { ImportSourceSelector } from './ImportSourceSelector';
import { ImportSuccessView } from './ImportSuccessView';
import { ImportVariablesView } from './ImportVariablesView';
import { ImportVariablesFooter } from './ImportVariablesFooter';
import { ImportTokenListView } from './ImportTokenListView';
import { ImportStylesFooter } from './ImportStylesFooter';
import { ImportFileDestinationRules } from './ImportFileDestinationRules';
import { ImportWorkflowSteps } from './ImportWorkflowSteps';
import { getSourceDefinition } from './importPanelTypes';
import { FeedbackPlaceholder } from './FeedbackPlaceholder';
import { InlineBanner } from './InlineBanner';

function ImportPanelRoot({ connected }: { connected: boolean }) {
  const {
    collectionData,
    tokens,
    loading,
    error,
    sourceFamily,
    source,
    workflowStage,
    fileImportValidation,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleBack,
  } = useImportSourceContext();
  const { destinationReady, usesCollectionDestination } = useImportDestinationContext();
  const { conflictPaths } = useImportReviewContext();
  const { successMessage, clearSuccessState } = useImportResultContext();

  const showSuccess = collectionData.length === 0 && tokens.length === 0 && !loading && !!successMessage;
  const showSourceSelector = !showSuccess && !loading && (workflowStage === 'family' || workflowStage === 'format');
  const showDestinationRules = !showSuccess && !loading && workflowStage === 'destination' && !usesCollectionDestination && tokens.length > 0;
  const showVariables = !showSuccess && !loading && workflowStage === 'destination' && usesCollectionDestination;
  const showTokenList = !showSuccess && !loading && workflowStage === 'preview' && tokens.length > 0;
  const showDestinationValidation = !!fileImportValidation && !showSourceSelector && !showSuccess && !showTokenList && (showDestinationRules || showVariables);
  const sourceDefinition = getSourceDefinition(source);
  const intakeDragHandlers = showSourceSelector
    ? {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    }
    : {};

  // Escape key: go back from data views or dismiss success screen.
  // Let ImportConflictResolver handle Escape when conflicts are active.
  const escapeRef = useRef<(() => void) | null>(null);
  escapeRef.current = null;
  if (showSuccess) {
    escapeRef.current = clearSuccessState;
  } else if ((showVariables || showTokenList) && (!conflictPaths || conflictPaths.length === 0)) {
    escapeRef.current = handleBack;
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!connected) {
    return (
      <FeedbackPlaceholder
        variant="disconnected"
        title="Connect to the token server"
        description="Import sources become available again as soon as the server connection is restored."
      />
    );
  }

  return (
    <div
      className="flex flex-col h-full relative"
      {...intakeDragHandlers}
    >
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <FeedbackPlaceholder
            variant="error"
            size="section"
            title="Import failed"
            description={error}
          />
        )}

        {showDestinationValidation && (
          <InlineBanner
            variant={fileImportValidation.status === 'partial' ? 'warning' : 'info'}
            icon={null}
            className="px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                {fileImportValidation.summary}
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                fileImportValidation.status === 'partial'
                  ? 'bg-[var(--color-figma-warning,#e8a100)]/15 text-[var(--color-figma-warning,#e8a100)]'
                  : 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
              }`}>
                {fileImportValidation.status === 'partial' ? 'Needs review' : 'Ready'}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              {fileImportValidation.detail}
            </div>
            {fileImportValidation.nextAction && (
              <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                Next: {fileImportValidation.nextAction}
              </div>
            )}
          </InlineBanner>
        )}

        {!showSuccess && (
          <ImportWorkflowSteps
            sourceFamily={sourceFamily}
            source={source}
            workflowStage={workflowStage}
            destinationReady={workflowStage === 'preview' ? true : destinationReady}
            destinationLabel={sourceDefinition?.destinationLabel}
          />
        )}

        {showSourceSelector && <ImportSourceSelector />}
        {showSuccess && <ImportSuccessView />}

        {loading && (
          <div
            aria-label={source === 'variables' ? 'Reading variables from Figma…' : 'Reading styles from Figma…'}
            aria-busy="true"
          >
            {[
              'w-1/2', 'w-2/3', 'w-5/12', 'w-3/5', 'w-7/12', 'w-1/2',
            ].map((w, i) => (
              <SkeletonImportRow key={i} nameWidth={w} />
            ))}
          </div>
        )}

        {showVariables && <ImportVariablesView />}
        {showDestinationRules && <ImportFileDestinationRules />}
        {showTokenList && <ImportTokenListView />}
      </div>

      {showVariables && <ImportVariablesFooter />}
      {showTokenList && <ImportStylesFooter />}
    </div>
  );
}

export function ImportPanel(props: ImportPanelProps) {
  return (
    <ImportPanelProvider {...props}>
      <ImportPanelRoot connected={props.connected} />
    </ImportPanelProvider>
  );
}
