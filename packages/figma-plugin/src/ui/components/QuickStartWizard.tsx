import { useState, useCallback, useEffect, useRef } from 'react';
import { getErrorMessage } from '../shared/utils';
import { GRAPH_TEMPLATES, type GraphTemplate } from './graph-templates';
import { apiFetch } from '../shared/apiFetch';
import {
  buildCollectionModeNames,
  CollectionAuthoringFields,
  type CollectionAuthoringDraft,
  validateCollectionAuthoringDraft,
} from './CollectionAuthoringFields';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SetupActionId = 'author-tokens' | 'foundations';
type WizardView = 'overview' | 'template-picker';
type PrereqPhase = 'connect' | 'create-collection' | null;
type GraphApiTemplate = 'colorRamp' | 'spacing' | 'type' | 'radius' | 'opacity' | 'shadow' | 'zIndex' | 'formula' | 'blank';

interface QuickStartWizardProps {
  serverUrl: string;
  currentCollectionId: string;
  collectionIds: string[];
  connected: boolean;
  checking?: boolean;
  onClose: () => void;
  onComplete: () => void;
  onCollectionCreated?: (name: string) => void;
  onRetryConnection?: () => void;
  onAuthorFirstToken?: () => void;
  onOpenGraph?: () => void;
  embedded?: boolean;
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

interface SetupActionDef {
  id: SetupActionId;
  label: string;
  description: string;
  helper?: string;
}

const SETUP_ACTIONS: SetupActionDef[] = [
  {
    id: 'author-tokens',
    label: 'Add your first token',
    description: 'Open the token editor and start authoring in this collection.',
    helper: 'Best next step',
  },
  {
    id: 'foundations',
    label: 'Generate foundations',
    description: 'Start from a color ramp, type scale, spacing scale, or another prepared generator.',
    helper: 'Optional',
  },
];

// ---------------------------------------------------------------------------
// Connect Step
// ---------------------------------------------------------------------------

function ConnectStep({ serverUrl, checking, onRetry, onClose }: {
  serverUrl: string;
  checking?: boolean;
  onRetry?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-medium text-[var(--color-figma-text)]">Connect your token library</p>
        <p className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5">
          Start TokenManager in the folder that contains your tokens, then come back here:
        </p>
      </div>

      <div className="rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] px-2.5 py-1.5">
        <code className="text-body font-mono text-[var(--color-figma-accent)]">token-manager start</code>
      </div>

      <div className="flex items-center gap-2 text-secondary text-[var(--color-figma-text-secondary)]">
        <span className="shrink-0">Looking for:</span>
        <code className="font-mono px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)]">{serverUrl}</code>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-body hover:bg-[var(--color-figma-bg-hover)]"
        >
          Close
        </button>
        <button
          onClick={onRetry}
          disabled={checking}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-60"
        >
          {checking ? 'Checking…' : 'Retry Connection'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Collection Step
// ---------------------------------------------------------------------------

function CreateCollectionStep({ serverUrl, onCreated }: {
  serverUrl: string;
  onCreated: (name: string) => void;
}) {
  const [draft, setDraft] = useState<CollectionAuthoringDraft>({
    name: 'primitives',
    primaryModeName: 'Default',
    secondaryModeEnabled: false,
    secondaryModeName: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const validationError = validateCollectionAuthoringDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`${serverUrl}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.name.trim(),
          modes: buildCollectionModeNames(draft).map((modeName) => ({
            name: modeName,
          })),
        }),
      });
      onCreated(draft.name.trim());
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-medium text-[var(--color-figma-text)]">Create your first token collection</p>
        <p className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5">
          Collections own their modes, so set up the collection and its first mode together.
        </p>
      </div>

      <CollectionAuthoringFields
        draft={draft}
        pending={saving}
        error={error}
        onNameChange={(value) => {
          setDraft((current) => ({ ...current, name: value }));
          setError('');
        }}
        onPrimaryModeChange={(value) => {
          setDraft((current) => ({ ...current, primaryModeName: value }));
          setError('');
        }}
        onSecondaryModeEnabledChange={(enabled) => {
          setDraft((current) => ({
            ...current,
            secondaryModeEnabled: enabled,
            secondaryModeName: enabled ? current.secondaryModeName : '',
          }));
          setError('');
        }}
        onSecondaryModeChange={(value) => {
          setDraft((current) => ({ ...current, secondaryModeName: value }));
          setError('');
        }}
      />

      <button
        onClick={handleCreate}
        disabled={saving || !draft.name.trim()}
        className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create Collection'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact template picker for foundations task
// ---------------------------------------------------------------------------

function graphTemplateForGraphKind(graphKind: GraphTemplate['graphKind']): GraphApiTemplate {
  if (graphKind === 'spacingScale') return 'spacing';
  if (graphKind === 'typeScale') return 'type';
  if (graphKind === 'borderRadiusScale') return 'radius';
  if (graphKind === 'opacityScale') return 'opacity';
  if (graphKind === 'shadowScale') return 'shadow';
  if (graphKind === 'zIndexScale') return 'zIndex';
  if (graphKind === 'customScale') return 'formula';
  return 'colorRamp';
}

function CompactTemplatePicker({ templates, connected, onSelect }: {
  templates: GraphTemplate[];
  connected: boolean;
  onSelect: (template: GraphTemplate) => void;
}) {
  return (
    <div className="flex flex-col">
      {templates.map(template => (
        <button
          key={template.id}
          onClick={() => onSelect(template)}
          disabled={!connected}
          className="w-full text-left px-4 py-2.5 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-body font-medium text-[var(--color-figma-text)]">{template.label}</span>
              <p className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5">{template.description}</p>
            </div>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M4.5 2.5L8 6l-3.5 3.5" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup action list
// ---------------------------------------------------------------------------

function SetupActionList({ connected, onSelect }: {
  connected: boolean;
  onSelect: (taskId: SetupActionId) => void;
}) {
  return (
    <div className="flex flex-col">
      {SETUP_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onSelect(action.id)}
          disabled={!connected}
          className="w-full text-left px-4 py-3 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 group"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-body font-medium text-[var(--color-figma-text)]">{action.label}</span>
                {action.helper ? (
                  <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                    {action.helper}
                  </span>
                ) : null}
              </div>
              <p className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5">
                {action.description}
              </p>
            </div>
            {connected ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-1 shrink-0 text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
                <path d="M4.5 2.5L8 6l-3.5 3.5" />
              </svg>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function QuickStartWizard({
  serverUrl,
  currentCollectionId,
  collectionIds,
  connected,
  checking,
  onClose,
  onComplete,
  onCollectionCreated,
  onRetryConnection,
  onAuthorFirstToken,
  onOpenGraph,
  embedded = false,
  onBack,
}: QuickStartWizardProps) {
  const [wizardView, setWizardView] = useState<WizardView>('overview');

  const [prereqPhase, setPrereqPhase] = useState<PrereqPhase>(() => {
    if (!connected) return 'connect';
    if (collectionIds.length === 0) return 'create-collection';
    return null;
  });

  const [wizardCreatedCollection, setWizardCreatedCollection] = useState<string | null>(null);
  const effectiveCollectionId = wizardCreatedCollection || currentCollectionId;
  const [foundationError, setFoundationError] = useState('');
  const [foundationBusy, setFoundationBusy] = useState(false);

  const collectionIdsRef = useRef(collectionIds);
  collectionIdsRef.current = collectionIds;
  useEffect(() => {
    if (connected && prereqPhase === 'connect') {
      setPrereqPhase(collectionIdsRef.current.length === 0 ? 'create-collection' : null);
    }
  }, [connected, prereqPhase]);

  const handleCollectionCreated = useCallback((name: string) => {
    setWizardCreatedCollection(name);
    onCollectionCreated?.(name);
    setPrereqPhase(null);
  }, [onCollectionCreated]);

  const handleTemplateSelect = useCallback(async (template: GraphTemplate) => {
    if (!effectiveCollectionId) {
      setFoundationError('Create a collection before adding a generator.');
      return;
    }
    setFoundationBusy(true);
    setFoundationError('');
    try {
      await apiFetch(`${serverUrl}/api/graphs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCollectionId: effectiveCollectionId,
          name: template.label,
          template: graphTemplateForGraphKind(template.graphKind),
        }),
      });
      onOpenGraph?.();
    } catch (error) {
      setFoundationError(getErrorMessage(error));
    } finally {
      setFoundationBusy(false);
    }
  }, [effectiveCollectionId, onOpenGraph, serverUrl]);

  const handleActionSelect = useCallback((taskId: SetupActionId) => {
    switch (taskId) {
      case 'author-tokens':
        onAuthorFirstToken?.();
        break;
      case 'foundations':
        setWizardView('template-picker');
        break;
    }
  }, [onAuthorFirstToken]);

  if (prereqPhase === 'connect' || prereqPhase === 'create-collection') {
    const prereqContent = (
      <>
        {!embedded && (
          <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
            <div className="text-heading font-semibold text-[var(--color-figma-text)]">Start a token library</div>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className="p-4">
          {prereqPhase === 'connect' && (
            <ConnectStep
              serverUrl={serverUrl}
              checking={checking}
              onRetry={onRetryConnection}
              onClose={embedded && onBack ? onBack : onClose}
            />
          )}
          {prereqPhase === 'create-collection' && (
            <CreateCollectionStep
              serverUrl={serverUrl}
              onCreated={handleCollectionCreated}
            />
          )}
        </div>
      </>
    );

    if (embedded) {
      return <div className="flex h-full min-h-0 flex-col">{prereqContent}</div>;
    }

    return (
      <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50">
        <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col">
          {prereqContent}
        </div>
      </div>
    );
  }

  const showBackButton = wizardView !== 'overview';
  const viewTitle = wizardView === 'template-picker'
    ? 'Choose a template'
    : null;

  const mainContent = (
    <>
      {!embedded && (
        <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showBackButton && (
              <button
                onClick={() => setWizardView('overview')}
                className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                aria-label="Back"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
              <div className="text-heading font-semibold text-[var(--color-figma-text)]">
              {viewTitle ?? 'Start a token library'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {embedded && showBackButton && (
        <div className="px-4 py-2 border-b border-[var(--color-figma-border)] flex items-center gap-2">
          <button
            onClick={() => setWizardView('overview')}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
            aria-label="Back"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="text-body font-medium text-[var(--color-figma-text)]">{viewTitle}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {wizardView === 'overview' && (
          <>
            <div className="px-4 pb-3 pt-4">
              <p className="text-body font-medium text-[var(--color-figma-text)]">
                {effectiveCollectionId
                  ? `"${effectiveCollectionId}" is ready. Choose what to do next.`
                  : 'Choose what to do next.'}
              </p>
              <p className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">
                Start with authoring, or use a starter recipe to generate a foundation set.
              </p>
            </div>
            <SetupActionList
              connected={connected}
              onSelect={handleActionSelect}
            />
            <div className="px-4 py-3">
              <button
                onClick={onComplete}
                className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)]"
              >
                Done for now
              </button>
            </div>
          </>
        )}

        {wizardView === 'template-picker' && (
          <>
            <CompactTemplatePicker
              templates={GRAPH_TEMPLATES}
              connected={connected && !foundationBusy}
              onSelect={handleTemplateSelect}
            />
            {foundationError ? (
              <p className="px-4 py-2 text-secondary text-[var(--color-figma-error)]">
                {foundationError}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );

  const shell = embedded
    ? <div className="flex h-full min-h-0 flex-col">{mainContent}</div>
    : (
      <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50">
        <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col" style={{ maxHeight: '85vh' }}>
          {mainContent}
        </div>
      </div>
    );

  return shell;
}
