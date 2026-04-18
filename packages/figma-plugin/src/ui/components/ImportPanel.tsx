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
import { FeedbackPlaceholder } from './FeedbackPlaceholder';

function ImportPanelRoot({ connected }: { connected: boolean }) {
  const {
    collectionData,
    tokens,
    loading,
    error,
    source,
    workflowStage,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleBack,
  } = useImportSourceContext();
  const { usesCollectionDestination } = useImportDestinationContext();
  const { conflictPaths } = useImportReviewContext();
  const { successMessage, clearSuccessState } = useImportResultContext();

  const showSuccess = collectionData.length === 0 && tokens.length === 0 && !loading && !!successMessage;
  const showSourceSelector = !showSuccess && !loading && (workflowStage === 'family' || workflowStage === 'format');
  const showDestinationRules = !showSuccess && !loading && workflowStage === 'destination' && !usesCollectionDestination && tokens.length > 0;
  const showVariables = !showSuccess && !loading && workflowStage === 'destination' && usesCollectionDestination;
  const showTokenList = !showSuccess && !loading && workflowStage === 'preview' && tokens.length > 0;
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
  } else if ((showVariables || showTokenList || showDestinationRules) && (!conflictPaths || conflictPaths.length === 0)) {
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
        description="Import requires an active server connection."
      />
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
      {...intakeDragHandlers}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {error && (
          <FeedbackPlaceholder
            variant="error"
            size="section"
            title="Import failed"
            description={error}
          />
        )}

        {showSourceSelector && <ImportSourceSelector />}
        {showSuccess && <ImportSuccessView />}

        {loading && (
          <div
            aria-label={source === 'variables' ? 'Reading variables...' : 'Reading styles...'}
            aria-busy="true"
          >
            {['w-1/2', 'w-2/3', 'w-5/12', 'w-3/5'].map((w, i) => (
              <SkeletonImportRow key={i} nameWidth={w} />
            ))}
          </div>
        )}

        {showVariables && <ImportVariablesView />}
        {showDestinationRules && <ImportFileDestinationRules />}
        {showTokenList && <ImportTokenListView />}
      </div>

      {showVariables && <div className="shrink-0"><ImportVariablesFooter /></div>}
      {showTokenList && <div className="shrink-0"><ImportStylesFooter /></div>}
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
