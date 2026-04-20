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
import { ImportSourceHome } from './ImportSourceHome';
import { ImportSuccessView } from './ImportSuccessView';
import { ImportVariablesSummary } from './ImportVariablesSummary';
import { ImportTokenListView } from './ImportTokenListView';
import { ImportPreviewFooter } from './ImportPreviewFooter';
import { FeedbackPlaceholder } from './FeedbackPlaceholder';

function ImportPanelRoot({ connected }: { connected: boolean }) {
  const {
    collectionData,
    tokens,
    loading,
    error,
    source,
    workflowStage,
    handleBack,
  } = useImportSourceContext();
  const { usesCollectionDestination } = useImportDestinationContext();
  const { conflictPaths } = useImportReviewContext();
  const { successMessage, clearSuccessState } = useImportResultContext();

  const showSuccess = workflowStage === 'success' || (collectionData.length === 0 && tokens.length === 0 && !loading && !!successMessage);
  const showHome = !showSuccess && !loading && workflowStage === 'home';
  const showVariables = !showSuccess && !loading && workflowStage === 'preview' && usesCollectionDestination;
  const showTokenList = !showSuccess && !loading && workflowStage === 'preview' && !usesCollectionDestination && tokens.length > 0;

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
        description="Import requires an active server connection."
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {error && (
          <FeedbackPlaceholder
            variant="error"
            size="section"
            title="Import failed"
            description={error}
          />
        )}

        {showHome && <ImportSourceHome />}
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

        {showVariables && <ImportVariablesSummary />}
        {showTokenList && <ImportTokenListView />}
      </div>

      {showTokenList && <div className="shrink-0"><ImportPreviewFooter /></div>}
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
