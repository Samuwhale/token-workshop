import { useState, useCallback, useEffect, useRef } from 'react';
import { getErrorMessage } from '../shared/utils';
import type { GeneratedTokenResult, GeneratorType } from '../hooks/useGenerators';
import { GRAPH_TEMPLATES, type GraphTemplate } from './graph-templates';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';
import { SemanticMappingDialog } from './SemanticMappingDialog';
import { apiFetch } from '../shared/apiFetch';
import { createGeneratorDraftFromTemplate } from '../hooks/useGeneratorDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3;
type PrereqPhase = 'connect' | 'create-set' | null;

interface SemanticData {
  tokens: GeneratedTokenResult[];
  targetGroup: string;
  targetSet: string;
  generatorType: GeneratorType;
}

interface QuickStartWizardProps {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  connected: boolean;
  checking?: boolean;
  onClose: () => void;
  onComplete: () => void;
  onSetCreated?: (name: string) => void;
  onRetryConnection?: () => void;
  embedded?: boolean;
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Step labels
// ---------------------------------------------------------------------------

const STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: 'Foundations' },
  { step: 2, label: 'Semantics' },
  { step: 3, label: 'Themes' },
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
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Start the Token Manager server</p>
        <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
          Run the following in your project directory:
        </p>
      </div>

      <div className="rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] px-3 py-2">
        <code className="text-[11px] font-mono text-[var(--color-figma-accent)]">token-manager start</code>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
        <span>Connecting to:</span>
        <code className="font-mono px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)]">{serverUrl}</code>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Close
        </button>
        <button
          onClick={onRetry}
          disabled={checking}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-60"
        >
          {checking ? 'Checking…' : 'Retry Connection'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Set Step
// ---------------------------------------------------------------------------

function CreateSetStep({ serverUrl, onCreated }: {
  serverUrl: string;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState('primitives');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Set name is required'); return; }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(trimmed)) {
      setError('Use letters, numbers, hyphens, or underscores (slashes for folders)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      onCreated(trimmed);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Create your first token set</p>
        <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
          Token sets are JSON files that hold your design system foundations.
          You can add more sets later for semantics, themes, or brands.
        </p>
      </div>

      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1" htmlFor="wizard-set-name">
          Set name
        </label>
        <input
          id="wizard-set-name"
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="primitives"
          autoFocus
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
        />
        {error && <p className="mt-1 text-[10px] text-[var(--color-figma-error)]">{error}</p>}
      </div>

      <div className="rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
        Will create <code className="font-mono text-[var(--color-figma-accent)]">{name.trim() || 'primitives'}.tokens.json</code> in your token directory.
      </div>

      <button
        onClick={handleCreate}
        disabled={saving || !name.trim()}
        className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create Token Set'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme Step (inline)
// ---------------------------------------------------------------------------

function ThemeStep({ serverUrl, activeSet, onDone, onSkip }: {
  serverUrl: string;
  activeSet: string;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [dimName, setDimName] = useState('Color Mode');
  const [lightName, setLightName] = useState('Light');
  const [darkName, setDarkName] = useState('Dark');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const handleCreate = async () => {
    if (!dimName.trim()) { setError('Dimension name is required'); return; }
    if (!lightName.trim() || !darkName.trim()) { setError('Both option names are required'); return; }
    setSaving(true);
    setError('');
    try {
      const dimId = slugify(dimName);
      await apiFetch(`${serverUrl}/api/themes/dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dimId, name: dimName.trim() }),
      });

      const lightSets: Record<string, string> = {};
      lightSets[activeSet] = 'source';
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lightName.trim(), sets: lightSets }),
      });

      const darkSets: Record<string, string> = {};
      darkSets[activeSet] = 'disabled';
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: darkName.trim(), sets: darkSets }),
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
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="w-8 h-8 rounded-full bg-[var(--color-figma-accent)]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Theme axis created</p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
            "{dimName}" with "{lightName}" and "{darkName}" options
          </p>
        </div>
        <button
          onClick={onDone}
          className="px-4 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
        >
          Finish Setup
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Dimension name</label>
        <input
          type="text"
          value={dimName}
          onChange={e => setDimName(e.target.value)}
          placeholder="Color Mode"
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Light option</label>
          <input
            type="text"
            value={lightName}
            onChange={e => setLightName(e.target.value)}
            placeholder="Light"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Dark option</label>
          <input
            type="text"
            value={darkName}
            onChange={e => setDarkName(e.target.value)}
            placeholder="Dark"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
      </div>
      {error && <p className="text-[10px] text-[var(--color-figma-error)]">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Skip
        </button>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Theme'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact template picker for wizard step 1
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
              <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{template.label}</span>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">{template.description}</p>
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
// Stepper Bar
// ---------------------------------------------------------------------------

function StepperBar({ currentStep, completedSteps }: {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
}) {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {STEPS.map(({ step, label }, i) => {
        const isActive = step === currentStep;
        const isCompleted = completedSteps.has(step);
        return (
          <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
            {i > 0 && (
              <div className={`w-4 h-px shrink-0 ${isCompleted || isActive ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`} />
            )}
            <div className={`flex items-center gap-1.5 min-w-0 ${isActive ? '' : 'opacity-50'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                isCompleted
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : isActive
                    ? 'border-2 border-[var(--color-figma-accent)] text-[var(--color-figma-accent)]'
                    : 'border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
              }`}>
                {isCompleted ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                ) : step}
              </div>
              <span className={`text-[10px] truncate ${isActive ? 'font-medium text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

export function QuickStartWizard({
  serverUrl,
  activeSet,
  allSets,
  connected,
  checking,
  onClose,
  onComplete,
  onSetCreated,
  onRetryConnection,
  embedded = false,
  onBack,
}: QuickStartWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());

  // Prereq phase state
  const [prereqPhase, setPrereqPhase] = useState<PrereqPhase>(() => {
    if (!connected) return 'connect';
    if (allSets.length === 0) return 'create-set';
    return null;
  });

  const [wizardCreatedSet, setWizardCreatedSet] = useState<string | null>(null);
  const effectiveActiveSet = wizardCreatedSet || activeSet;

  const allSetsRef = useRef(allSets);
  allSetsRef.current = allSets;
  useEffect(() => {
    if (connected && prereqPhase === 'connect') {
      setPrereqPhase(allSetsRef.current.length === 0 ? 'create-set' : null);
    }
  }, [connected, prereqPhase]);

  // Data passed from step 1 → step 2
  const [semanticData, setSemanticData] = useState<SemanticData | null>(null);

  // Step 1: selected template for generator dialog
  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(null);

  const markCompleted = useCallback((step: WizardStep) => {
    setCompletedSteps(prev => new Set([...prev, step]));
  }, []);

  const advanceTo = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  // Prereq: set created
  const handleSetCreated = useCallback((name: string) => {
    setWizardCreatedSet(name);
    onSetCreated?.(name);
    setPrereqPhase(null);
  }, [onSetCreated]);

  // Step 1 handlers
  const handleStep1InterceptSemantic = useCallback((data: SemanticData) => {
    setSemanticData(data);
  }, []);

  const handleStep1Complete = useCallback(() => {
    setSelectedTemplate(null);
    markCompleted(1);
    // Skip step 2 if no semantic data to map
    advanceTo(semanticData ? 2 : 3);
  }, [semanticData, markCompleted, advanceTo]);

  const handleStep1Skip = () => {
    markCompleted(1);
    advanceTo(3);
  };

  // Step 2 handlers
  const handleStep2Created = () => {
    markCompleted(2);
    advanceTo(3);
  };

  const handleStep2Skip = () => {
    markCompleted(2);
    advanceTo(3);
  };

  // Step 3 handlers
  const handleStep3Done = () => {
    markCompleted(3);
    onComplete();
  };

  const handleStep3Skip = () => {
    markCompleted(3);
    onComplete();
  };

  // -- Prereq phase rendering (inline within wizard shell, stepper visible above) --

  if (prereqPhase === 'connect' || prereqPhase === 'create-set') {
    const prereqContent = (
      <>
        {!embedded && (
          <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
            <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">Guided setup</div>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className="opacity-40 pointer-events-none">
          <StepperBar currentStep={1} completedSteps={new Set()} />
        </div>
        <div className="border-t border-[var(--color-figma-border)]" />

        <div className="p-4">
          {prereqPhase === 'connect' && (
            <ConnectStep
              serverUrl={serverUrl}
              checking={checking}
              onRetry={onRetryConnection}
              onClose={embedded && onBack ? onBack : onClose}
            />
          )}
          {prereqPhase === 'create-set' && (
            <CreateSetStep
              serverUrl={serverUrl}
              onCreated={handleSetCreated}
            />
          )}
        </div>
      </>
    );

    if (embedded) {
      return <div className="flex h-full min-h-0 flex-col">{prereqContent}</div>;
    }

    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col">
          {prereqContent}
        </div>
      </div>
    );
  }

  // -- Main wizard (prereqs complete) --

  // If a template is selected in step 1, show TokenGeneratorDialog as overlay
  if (selectedTemplate) {
    return (
      <TokenGeneratorDialog
        serverUrl={serverUrl}
        activeSet={effectiveActiveSet}
        allSets={allSets}
        template={selectedTemplate}
        initialDraft={createGeneratorDraftFromTemplate(selectedTemplate, effectiveActiveSet)}
        onBack={() => setSelectedTemplate(null)}
        onClose={onClose}
        onInterceptSemanticMapping={handleStep1InterceptSemantic}
        onSaved={() => {
          handleStep1Complete();
        }}
      />
    );
  }

  // Step 2: show SemanticMappingDialog as overlay
  if (currentStep === 2 && semanticData) {
    return (
      <SemanticMappingDialog
        serverUrl={serverUrl}
        generatedTokens={semanticData.tokens}
        generatorType={semanticData.generatorType}
        targetGroup={semanticData.targetGroup}
        targetSet={semanticData.targetSet}
        onClose={handleStep2Skip}
        onCreated={handleStep2Created}
      />
    );
  }

  // Main wizard shell
  const wizardContent = (
    <>
      {!embedded && (
        <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
          <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">Guided setup</div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <StepperBar currentStep={currentStep} completedSteps={completedSteps} />
      <div className="border-t border-[var(--color-figma-border)]" />

      <div className="flex-1 overflow-y-auto">
          {currentStep === 1 && (
            <>
              <CompactTemplatePicker
                templates={GRAPH_TEMPLATES}
                connected={connected}
                onSelect={setSelectedTemplate}
              />
              <div className="px-4 py-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                <button
                  onClick={handleStep1Skip}
                  className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Skip for now
                </button>
              </div>
            </>
          )}

          {currentStep === 3 && (
            <div className="p-4 flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Add theme modes</p>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">
                  Create a theme axis such as light and dark so your token system can switch across contexts.
                </p>
              </div>
              <ThemeStep
                serverUrl={serverUrl}
                activeSet={effectiveActiveSet}
                onDone={handleStep3Done}
                onSkip={handleStep3Skip}
              />
            </div>
          )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col">{wizardContent}</div>;
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col" style={{ maxHeight: '85vh' }}>
        {wizardContent}
      </div>
    </div>
  );
}
