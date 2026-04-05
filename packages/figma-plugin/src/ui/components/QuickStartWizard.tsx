import { useState, useCallback, useEffect, useRef } from 'react';
import { getErrorMessage } from '../shared/utils';
import type { GeneratedTokenResult, GeneratorType, GeneratorTemplate } from '../hooks/useGenerators';
import {
  QUICK_START_TEMPLATES,
  TemplateIcon,
  getTemplateStepNames,
  getTokenCount,
  formatStepPreview,
} from './QuickStartDialog';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';
import { SemanticMappingDialog } from './SemanticMappingDialog';
import { apiFetch } from '../shared/apiFetch';

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
}

// ---------------------------------------------------------------------------
// Step labels
// ---------------------------------------------------------------------------

const STEPS: { step: WizardStep; label: string; description: string }[] = [
  { step: 1, label: 'Generate Primitives', description: 'Create a color ramp, spacing scale, or type scale from a template' },
  { step: 2, label: 'Map Semantics', description: 'Create reference tokens that give meaning to your primitives' },
  { step: 3, label: 'Set Up Theme', description: 'Create a theme axis (e.g. Mode: light, dark) to switch token sets' },
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
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-figma-bg-secondary)] flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
            <circle cx="12" cy="10" r="2" />
            <path d="M7.5 7.5a6.5 6.5 0 0 1 9 0M5 5a10 10 0 0 1 14 0" />
          </svg>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Start the Token Manager server</p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
            Token Manager needs a local server to read and write your token files.
            Run the following in your project directory:
          </p>
        </div>
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

      <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug">
        Once the server is running, click "Retry Connection" or this panel will reconnect automatically.
      </p>
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
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--color-figma-accent)]/10 flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Create your first token set</p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
            Token sets are JSON files that hold your design tokens.
            Give your first set a name — you can add more later.
          </p>
        </div>
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
      // Create dimension
      await apiFetch(`${serverUrl}/api/themes/dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dimId, name: dimName.trim() }),
      });

      // Create Light option (active set as source)
      const lightSets: Record<string, string> = {};
      lightSets[activeSet] = 'source';
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lightName.trim(), sets: lightSets }),
      });

      // Create Dark option (active set disabled by default)
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
      <div className="border border-[var(--color-figma-border)] rounded p-2 bg-[var(--color-figma-bg-secondary)]">
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
          This will create a <span className="font-medium text-[var(--color-figma-text)]">{dimName || 'Color Mode'}</span> axis with:
        </p>
        <ul className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)] list-disc pl-4">
          <li><span className="font-medium text-[var(--color-figma-text)]">{lightName || 'Light'}</span> — uses <span className="font-mono text-[var(--color-figma-accent)]">{activeSet}</span> as base</li>
          <li><span className="font-medium text-[var(--color-figma-text)]">{darkName || 'Dark'}</span> — ready for a dark override set</li>
        </ul>
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
// Stepper Bar
// ---------------------------------------------------------------------------

function StepperBar({ currentStep, completedSteps, onStepClick }: {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  onStepClick?: (step: WizardStep) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {STEPS.map(({ step, label }, i) => {
        const isActive = step === currentStep;
        const isCompleted = completedSteps.has(step);
        const clickable = !!onStepClick && !isActive;
        return (
          <div key={step} className="flex items-center gap-1 flex-1 min-w-0">
            {i > 0 && (
              <div className={`w-4 h-px shrink-0 ${isCompleted || isActive ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`} />
            )}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick!(step)}
              className={`flex items-center gap-1.5 min-w-0 bg-transparent border-0 p-0 ${clickable ? 'cursor-pointer hover:opacity-100' : ''} ${isActive ? '' : 'opacity-60'}`}
            >
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
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template list for step 1 (inlined from QuickStartDialog)
// ---------------------------------------------------------------------------

function TemplateButton({ template, onClick }: { template: GeneratorTemplate; onClick: () => void }) {
  const count = getTokenCount(template);
  const stepNames = getTemplateStepNames(template);
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-14">
          <TemplateIcon id={template.id} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{template.label}</span>
            {count > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] font-medium tabular-nums">
                {count} tokens
              </span>
            )}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">{template.description}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-mono px-1 py-px rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]">
              {template.defaultPrefix}.*
            </span>
            {stepNames.length > 0 && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)] truncate">
                {formatStepPreview(stepNames)}
              </span>
            )}
          </div>
        </div>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
          <path d="M4.5 2.5L8 6l-3.5 3.5" />
        </svg>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Prereq indicator bar (shown at top when in connect/create-set phase)
// ---------------------------------------------------------------------------

function PrereqBar({ phase, needsConnect, needsSet }: {
  phase: PrereqPhase;
  needsConnect: boolean;
  needsSet: boolean;
}) {
  const steps = [
    needsConnect && { key: 'connect', label: 'Connect server' },
    needsSet && { key: 'create-set', label: 'Create token set' },
  ].filter(Boolean) as { key: string; label: string }[];

  if (steps.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-2.5">
      {steps.map(({ key, label }, i) => {
        const isActive = phase === key;
        const isDone = phase !== key && (
          (key === 'connect' && phase !== 'connect') ||
          (key === 'create-set' && phase === null)
        );
        return (
          <div key={key} className="flex items-center gap-1 min-w-0">
            {i > 0 && <div className="w-3 h-px shrink-0 bg-[var(--color-figma-border)]" />}
            <div className={`flex items-center gap-1.5 ${isActive ? '' : 'opacity-50'}`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                isDone
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : isActive
                    ? 'border-2 border-[var(--color-figma-accent)] text-[var(--color-figma-accent)]'
                    : 'border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
              }`}>
                {isDone ? (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                ) : (i + 1)}
              </div>
              <span className={`text-[10px] truncate ${isActive ? 'font-medium text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                {label}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-1 ml-1 opacity-40">
        <div className="w-3 h-px bg-[var(--color-figma-border)]" />
        <span className="text-[9px] text-[var(--color-figma-text-secondary)] truncate">then 3 setup steps</span>
      </div>
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
}: QuickStartWizardProps) {
  // Track initial prereq needs so PrereqBar shows correct steps
  const initialNeedsConnect = useRef(!connected);
  const initialNeedsSet = useRef(allSets.length === 0 && connected);

  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());

  // Prereq phase state — computed once at mount, then driven by effects
  const [prereqPhase, setPrereqPhase] = useState<PrereqPhase>(() => {
    if (!connected) return 'connect';
    if (allSets.length === 0) return 'create-set';
    return null;
  });

  // Token set created during the wizard prereq phase (used as active set for main steps)
  const [wizardCreatedSet, setWizardCreatedSet] = useState<string | null>(null);
  const effectiveActiveSet = wizardCreatedSet || activeSet;

  // When connection status changes from outside, advance prereq phase
  const allSetsRef = useRef(allSets);
  allSetsRef.current = allSets;
  useEffect(() => {
    if (connected && prereqPhase === 'connect') {
      initialNeedsSet.current = allSetsRef.current.length === 0;
      setPrereqPhase(allSetsRef.current.length === 0 ? 'create-set' : null);
    }
  }, [connected, prereqPhase]);

  // Data passed from step 1 → step 2
  const [semanticData, setSemanticData] = useState<SemanticData | null>(null);

  // Step 1: selected template for generator dialog
  const [selectedTemplate, setSelectedTemplate] = useState<GeneratorTemplate | null>(null);

  const markCompleted = useCallback((step: WizardStep) => {
    setCompletedSteps(prev => new Set([...prev, step]));
  }, []);

  const advanceTo = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  // Jump to any step directly (from StepperBar click)
  const handleStepClick = useCallback((step: WizardStep) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      for (let s = 1 as WizardStep; s < step; s = (s + 1) as WizardStep) {
        next.add(s);
      }
      return next;
    });
    setSelectedTemplate(null);
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
    if (semanticData) {
      advanceTo(2);
    } else {
      // Generator didn't produce semantic-mappable tokens (e.g. z-index) — skip to step 3
      advanceTo(3);
    }
  }, [semanticData, markCompleted, advanceTo]);

  const handleStep1Skip = () => {
    markCompleted(1);
    advanceTo(2);
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

  // -- Prereq phase rendering --

  if (prereqPhase === 'connect' || prereqPhase === 'create-set') {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col">

          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">Before You Begin</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
                {prereqPhase === 'connect'
                  ? 'A running server is required to manage token files'
                  : 'You need at least one token set to store your tokens'}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Prereq progress bar */}
          <PrereqBar
            phase={prereqPhase}
            needsConnect={initialNeedsConnect.current}
            needsSet={initialNeedsSet.current || prereqPhase === 'create-set'}
          />
          <div className="border-t border-[var(--color-figma-border)]" />

          {/* Step content */}
          <div className="p-4">
            {prereqPhase === 'connect' && (
              <ConnectStep
                serverUrl={serverUrl}
                checking={checking}
                onRetry={onRetryConnection}
                onClose={onClose}
              />
            )}
            {prereqPhase === 'create-set' && (
              <CreateSetStep
                serverUrl={serverUrl}
                onCreated={handleSetCreated}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // -- Main wizard (prereqs complete) --

  // If a template is selected in step 1, show TokenGeneratorDialog as overlay
  if (selectedTemplate) {
    const stepNames = getTemplateStepNames(selectedTemplate);
    return (
      <TokenGeneratorDialog
        serverUrl={serverUrl}
        activeSet={effectiveActiveSet}
        allSets={allSets}
        template={selectedTemplate}
        onBack={() => setSelectedTemplate(null)}
        onClose={onClose}
        onInterceptSemanticMapping={handleStep1InterceptSemantic}
        onSaved={(info) => {
          const firstStep = stepNames[0];
          const _firstPath = info?.targetGroup && firstStep
            ? `${info.targetGroup}.${firstStep}`
            : undefined;
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
  const sourceTemplates = QUICK_START_TEMPLATES.filter(t => t.requiresSource);
  const standaloneTemplates = QUICK_START_TEMPLATES.filter(t => !t.requiresSource);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col" style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--color-figma-border)] flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">Guided Setup</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
              Set up your design tokens in 3 steps
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Stepper */}
        <StepperBar currentStep={currentStep} completedSteps={completedSteps} onStepClick={handleStepClick} />
        <div className="border-t border-[var(--color-figma-border)]" />

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          {currentStep === 1 && (
            <>
              {/* Template list — inlined directly as step 1 */}
              <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Derived from a source token</div>
                  <div className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-0.5">Pick a base token, then generate a scale from it</div>
                </div>
              </div>
              {sourceTemplates.map(template => (
                <TemplateButton
                  key={template.id}
                  template={template}
                  onClick={() => setSelectedTemplate(template)}
                />
              ))}
              <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Standalone</div>
                <div className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-0.5">Ready to use — no source token needed</div>
              </div>
              {standaloneTemplates.map(template => (
                <TemplateButton
                  key={template.id}
                  template={template}
                  onClick={() => setSelectedTemplate(template)}
                />
              ))}
              {/* Skip button at bottom */}
              <div className="px-4 py-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                <button
                  onClick={handleStep1Skip}
                  className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Skip — I'll add tokens manually
                </button>
              </div>
            </>
          )}

          {currentStep === 2 && !semanticData && (
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-figma-bg-secondary)] flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 10V7l4-6 4 6v3H8V8H4v2H2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Map Semantics</p>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">
                    No primitives were generated in step 1. You can set up semantic tokens later from the token list or graph view.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleStep2Skip}
                  className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
                >
                  Continue to Themes
                </button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-figma-accent)]/10 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 6.5A4.5 4.5 0 0 1 4.5 1a4.5 4.5 0 1 0 5.5 5.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[var(--color-figma-text)]">Set Up Theme</p>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">
                    Create a theme axis (e.g. Mode: light, dark) to support switching token sets.
                  </p>
                </div>
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
      </div>
    </div>
  );
}
