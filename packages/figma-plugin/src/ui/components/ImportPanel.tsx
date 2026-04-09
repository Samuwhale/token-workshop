import { useEffect, useRef } from 'react';
import { SkeletonImportRow } from './Skeleton';
import { ImportPanelProvider, useImportPanel, type ImportPanelProps } from './ImportPanelContext';
import { ImportSourceSelector } from './ImportSourceSelector';
import { ImportSuccessView } from './ImportSuccessView';
import { ImportVariablesView } from './ImportVariablesView';
import { ImportVariablesFooter } from './ImportVariablesFooter';
import { ImportTokenListView } from './ImportTokenListView';
import { ImportStylesFooter } from './ImportStylesFooter';
import { ImportFileDestinationRules } from './ImportFileDestinationRules';
import { ImportWorkflowSteps } from './ImportWorkflowSteps';
import { getSourceDefinition } from './importPanelTypes';

function ImportPanelRoot() {
  const {
    connected,
    collectionData,
    tokens,
    loading,
    error,
    sourceFamily,
    source,
    workflowStage,
    successMessage,
    conflictPaths,
    destinationReady,
    usesCollectionDestination,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleBack,
    clearSuccessState,
  } = useImportPanel();

  const showSuccess = collectionData.length === 0 && tokens.length === 0 && !loading && !!successMessage;
  const showSourceSelector = !showSuccess && !loading && (workflowStage === 'family' || workflowStage === 'format');
  const showDestinationRules = !showSuccess && !loading && workflowStage === 'destination' && !usesCollectionDestination && tokens.length > 0;
  const showVariables = !showSuccess && !loading && workflowStage === 'destination' && usesCollectionDestination;
  const showTokenList = !showSuccess && !loading && workflowStage === 'preview' && tokens.length > 0;
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
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to import tokens
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full relative"
      {...intakeDragHandlers}
    >
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
            {error}
          </div>
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
      <ImportPanelRoot />
    </ImportPanelProvider>
  );
}
