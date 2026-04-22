import { useState, useCallback, useEffect, useRef } from 'react';
import { getErrorMessage } from '../shared/utils';
import { GRAPH_TEMPLATES, type GraphTemplate } from './graph-templates';
import { GeneratedGroupEditor } from './GeneratedGroupEditor';
import { apiFetch } from '../shared/apiFetch';
import { createGeneratorDraftFromTemplate } from '../hooks/useGeneratedGroupEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskId = 'author-tokens' | 'modes' | 'foundations';
type ChecklistView = 'list' | 'template-picker' | 'modes-inline';
type PrereqPhase = 'connect' | 'create-collection' | null;

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
  embedded?: boolean;
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

interface TaskDef {
  id: TaskId;
  label: string;
  description: string;
}

const TASKS: TaskDef[] = [
  { id: 'author-tokens', label: 'Add your first tokens', description: 'Create tokens by hand in the token editor' },
  { id: 'modes', label: 'Add modes (optional)', description: 'Create variations like Light / Dark. Skip if you only need one mode' },
  { id: 'foundations', label: 'Accelerate with a generator (optional)', description: 'Generate a color ramp, type scale, spacing scale, or other foundation' },
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
        <p className="text-body font-medium text-[var(--color-figma-text)]">Connect your token project</p>
        <p className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5">
          Run this in your token project folder, then come back here:
        </p>
      </div>

      <div className="rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] px-2.5 py-1.5">
        <code className="text-body font-mono text-[var(--color-figma-accent)]">token-manager start</code>
      </div>

      <div className="flex items-center gap-2 text-secondary text-[var(--color-figma-text-secondary)]">
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
  const [name, setName] = useState('primitives');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Collection name is required'); return; }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(trimmed)) {
      setError('Use letters, numbers, hyphens, or underscores (slashes for folders)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`${serverUrl}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trimmed }),
      });
      onCreated(trimmed);
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
          This is the container where you will author tokens and modes.
        </p>
      </div>

      <div>
        <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1" htmlFor="wizard-collection-name">
          Collection name
        </label>
        <input
          id="wizard-collection-name"
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="primitives"
          autoFocus
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
        />
        {error && <p className="mt-1 text-secondary text-[var(--color-figma-error)]">{error}</p>}
      </div>

      <div className="rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] px-2.5 py-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
        Creates <code className="font-mono text-[var(--color-figma-accent)]">{name.trim() || 'primitives'}.tokens.json</code>
      </div>

      <button
        onClick={handleCreate}
        disabled={saving || !name.trim()}
        className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create Collection'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode Step (inline)
// ---------------------------------------------------------------------------

function ModeStep({ serverUrl, currentCollectionId, onDone, onSkip }: {
  serverUrl: string;
  currentCollectionId: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [lightName, setLightName] = useState('Light');
  const [darkName, setDarkName] = useState('Dark');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleCreate = async () => {
    if (!currentCollectionId.trim()) { setError('Create a collection first'); return; }
    if (!lightName.trim() || !darkName.trim()) { setError('Both option names are required'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(currentCollectionId)}/modes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lightName.trim() }),
      });

      await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(currentCollectionId)}/modes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: darkName.trim() }),
      });

      setDone(true);
      setSaving(false);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        <p className="text-body font-medium text-[var(--color-figma-text)]">
          Added {lightName} / {darkName} to "{currentCollectionId}"
        </p>
        <button
          onClick={onDone}
          className="px-4 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)]"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-medium text-[var(--color-figma-text)]">Add modes to "{currentCollectionId}"</p>
        <p className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
          Each collection owns its own modes, just like Figma collections.
        </p>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1" htmlFor="wizard-light-option">First mode</label>
          <input
            id="wizard-light-option"
            type="text"
            value={lightName}
            onChange={e => setLightName(e.target.value)}
            placeholder="Light"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
        <div className="flex-1">
          <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1" htmlFor="wizard-dark-option">Second mode</label>
          <input
            id="wizard-dark-option"
            type="text"
            value={darkName}
            onChange={e => setDarkName(e.target.value)}
            placeholder="Dark"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
      </div>
      {error && <p className="text-secondary text-[var(--color-figma-error)]">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-body hover:bg-[var(--color-figma-bg-hover)]"
        >
          Back
        </button>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add Modes'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact template picker for foundations task
// ---------------------------------------------------------------------------

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
          className="w-full text-left px-4 py-2.5 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
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
// Task Checklist
// ---------------------------------------------------------------------------

function TaskChecklist({ completedTasks, connected, onSelect }: {
  completedTasks: Set<TaskId>;
  connected: boolean;
  onSelect: (taskId: TaskId) => void;
}) {
  return (
    <div className="flex flex-col">
      {TASKS.map(task => {
        const isCompleted = completedTasks.has(task.id);
        const isDisabled = !connected;

        return (
          <button
            key={task.id}
            onClick={() => onSelect(task.id)}
            disabled={isDisabled && !isCompleted}
            className="w-full text-left px-4 py-3 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 ${
                isCompleted
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'border-[1.5px] border-[var(--color-figma-border)]'
              }`}>
                {isCompleted && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-body font-medium ${isCompleted ? 'text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-text)]'}`}>{task.label}</span>
                <p className="text-secondary text-[var(--color-figma-text-secondary)] mt-0.5">{task.description}</p>
              </div>
              {!isCompleted && !(isDisabled) && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
                  <path d="M4.5 2.5L8 6l-3.5 3.5" />
                </svg>
              )}
            </div>
          </button>
        );
      })}
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
  embedded = false,
  onBack,
}: QuickStartWizardProps) {
  const [completedTasks, setCompletedTasks] = useState<Set<TaskId>>(new Set());
  const [checklistView, setChecklistView] = useState<ChecklistView>('list');

  const [prereqPhase, setPrereqPhase] = useState<PrereqPhase>(() => {
    if (!connected) return 'connect';
    if (collectionIds.length === 0) return 'create-collection';
    return null;
  });

  const [wizardCreatedCollection, setWizardCreatedCollection] = useState<string | null>(null);
  const effectiveCollectionId = wizardCreatedCollection || currentCollectionId;

  const collectionIdsRef = useRef(collectionIds);
  collectionIdsRef.current = collectionIds;
  useEffect(() => {
    if (connected && prereqPhase === 'connect') {
      setPrereqPhase(collectionIdsRef.current.length === 0 ? 'create-collection' : null);
    }
  }, [connected, prereqPhase]);

  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(null);

  const markCompleted = useCallback((task: TaskId) => {
    setCompletedTasks(prev => new Set([...prev, task]));
  }, []);

  const handleCollectionCreated = useCallback((name: string) => {
    setWizardCreatedCollection(name);
    onCollectionCreated?.(name);
    setPrereqPhase(null);
  }, [onCollectionCreated]);

  const handleFoundationsSaved = useCallback(() => {
    setSelectedTemplate(null);
    setChecklistView('list');
    markCompleted('foundations');
  }, [markCompleted]);

  const handleTemplateBack = useCallback(() => {
    setSelectedTemplate(null);
  }, []);

  const handleModesDone = useCallback(() => {
    setChecklistView('list');
    markCompleted('modes');
  }, [markCompleted]);

  const handleModesBack = useCallback(() => {
    setChecklistView('list');
  }, []);

  const handleTaskSelect = useCallback((taskId: TaskId) => {
    switch (taskId) {
      case 'author-tokens':
        markCompleted('author-tokens');
        onAuthorFirstToken?.();
        break;
      case 'foundations':
        setChecklistView('template-picker');
        break;
      case 'modes':
        setChecklistView('modes-inline');
        break;
    }
  }, [markCompleted, onAuthorFirstToken]);

  if (prereqPhase === 'connect' || prereqPhase === 'create-collection') {
    const prereqContent = (
      <>
        {!embedded && (
          <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
            <div className="text-heading font-semibold text-[var(--color-figma-text)]">Author a token system</div>
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

  if (selectedTemplate) {
    return (
      <GeneratedGroupEditor
        serverUrl={serverUrl}
        currentCollectionId={effectiveCollectionId}
        template={selectedTemplate}
        initialDraft={createGeneratorDraftFromTemplate(selectedTemplate, effectiveCollectionId)}
        onBack={handleTemplateBack}
        onClose={onClose}
        onSaved={handleFoundationsSaved}
      />
    );
  }

  const hasCompletedAny = completedTasks.size > 0;

  const showBackButton = checklistView !== 'list';
  const viewTitle = checklistView === 'template-picker'
    ? 'Choose a template'
    : checklistView === 'modes-inline'
      ? 'Add modes'
      : null;

  const mainContent = (
    <>
      {!embedded && (
        <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showBackButton && (
              <button
                onClick={() => setChecklistView('list')}
                className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                aria-label="Back"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
              <div className="text-heading font-semibold text-[var(--color-figma-text)]">
              {viewTitle ?? 'Author a token system'}
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
            onClick={() => setChecklistView('list')}
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
        {checklistView === 'list' && (
          <>
            <TaskChecklist
              completedTasks={completedTasks}
              connected={connected}
              onSelect={handleTaskSelect}
            />
            {hasCompletedAny && (
              <div className="px-4 py-3">
                <button
                  onClick={onComplete}
                  className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)]"
                >
                  Finish Setup
                </button>
              </div>
            )}
          </>
        )}

        {checklistView === 'template-picker' && (
          <CompactTemplatePicker
            templates={GRAPH_TEMPLATES}
            connected={connected}
            onSelect={setSelectedTemplate}
          />
        )}

        {checklistView === 'modes-inline' && (
          <div className="p-3 flex flex-col gap-2">

            <ModeStep
              serverUrl={serverUrl}
              currentCollectionId={effectiveCollectionId}
              onDone={handleModesDone}
              onSkip={handleModesBack}
            />
          </div>
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
