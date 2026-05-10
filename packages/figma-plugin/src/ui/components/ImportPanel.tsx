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
import { SecondaryPanel } from './SecondaryPanel';
import { Button } from '../primitives';

function ImportPanelRoot({
  connected,
  onClose,
  onRetryConnection,
}: {
  connected: boolean;
  onClose: () => void;
  onRetryConnection?: () => void;
}) {
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
      if (e.key !== 'Escape') {
        return;
      }
      if (escapeRef.current) {
        escapeRef.current();
        return;
      }
      if (showHome) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, showHome]);

  if (!connected) {
    return (
      <SecondaryPanel
        title="Import tokens"
        description="Import from Figma or a token file."
        className="relative h-full"
        bodyClassName="items-center justify-center"
        actions={
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
          >
            Close
          </Button>
        }
      >
        <FeedbackPlaceholder
          variant="disconnected"
          title="Connect to the token server"
          description="Import needs a server connection. Start the shared library and retry."
          align="start"
          primaryAction={
            onRetryConnection
              ? { label: "Retry connection", onClick: onRetryConnection }
              : undefined
          }
        />
      </SecondaryPanel>
    );
  }

  return (
    <SecondaryPanel
      title="Import tokens"
      description={showHome ? "Import from Figma or a token file." : undefined}
      className="relative h-full"
      footer={showTokenList ? <ImportPreviewFooter /> : undefined}
      actions={
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
        >
          Close
        </Button>
      }
    >
      {error ? (
        <>
          <FeedbackPlaceholder
            variant="error"
            size="section"
            title="Import failed"
            description={error}
            align="start"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleBack} variant="secondary" size="sm">
              Back
            </Button>
            <Button onClick={onClose} variant="ghost" size="sm">
              Close
            </Button>
          </div>
        </>
      ) : null}

      {!error && showHome && <ImportSourceHome />}
      {!error && showSuccess && <ImportSuccessView />}

      {!error && loading && (
        <div
          aria-label={source === 'variables' ? 'Reading variables...' : 'Reading styles...'}
          aria-busy="true"
        >
          {['w-1/2', 'w-2/3', 'w-5/12', 'w-3/5'].map((w, i) => (
            <SkeletonImportRow key={i} nameWidth={w} />
          ))}
        </div>
      )}

      {!error && showVariables && <ImportVariablesSummary />}
      {!error && showTokenList && <ImportTokenListView />}
    </SecondaryPanel>
  );
}

export function ImportPanel(props: ImportPanelProps) {
  return (
    <ImportPanelProvider {...props}>
      <ImportPanelRoot
        connected={props.connected}
        onClose={props.onClose}
        onRetryConnection={props.onRetryConnection}
      />
    </ImportPanelProvider>
  );
}
