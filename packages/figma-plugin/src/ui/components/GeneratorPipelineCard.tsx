import { useState } from 'react';
import type { TokenGenerator, ColorRampConfig, SpacingScaleConfig, TypeScaleConfig, ShadowScaleConfig, DarkModeInversionConfig, AccessibleColorPairConfig, GeneratorType, GeneratorConfig, BorderRadiusScaleConfig, CustomScaleConfig, ContrastCheckConfig, GeneratedTokenResult } from '../hooks/useGenerators';
import type { TokenMapEntry } from '../../shared/types';
import { apiFetch } from '../shared/apiFetch';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';
import { VALUE_REQUIRED_TYPES } from './generators/generatorUtils';
import { OverrideRow, formatValue } from './generators/generatorShared';
import { swatchBgColor } from '../shared/colorUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getGeneratorTypeLabel(type: GeneratorType): string {
  switch (type) {
    case 'colorRamp': return 'Color ramp';
    case 'spacingScale': return 'Spacing scale';
    case 'typeScale': return 'Type scale';
    case 'opacityScale': return 'Opacity scale';
    case 'borderRadiusScale': return 'Border radius';
    case 'zIndexScale': return 'Z-index scale';
    case 'shadowScale': return 'Shadow scale';
    case 'customScale': return 'Custom scale';
    case 'contrastCheck': return 'Contrast check';
    case 'accessibleColorPair': return 'Accessible color pair';
    case 'darkModeInversion': return 'Dark mode inversion';
    default: return type;
  }
}

export function getGeneratorStepCount(generator: TokenGenerator): number {
  const cfg = generator.config as Record<string, unknown>;
  const steps = cfg.steps;
  if (Array.isArray(steps)) return steps.length;
  return 0;
}

// ---------------------------------------------------------------------------
// Dry-run preview
// ---------------------------------------------------------------------------

interface DryRunDiff {
  created: Array<{ path: string; value: unknown; type: string }>;
  updated: Array<{ path: string; currentValue: unknown; newValue: unknown; type: string }>;
  unchanged: Array<{ path: string; value: unknown; type: string }>;
  deleted: Array<{ path: string; currentValue: unknown }>;
}

function formatTokenValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function DryRunPreview({ diff, onConfirmRun, onClose, running }: {
  diff: DryRunDiff;
  onConfirmRun: () => void;
  onClose: () => void;
  running: boolean;
}) {
  const [expanded, setExpanded] = useState<'created' | 'updated' | 'deleted' | null>(null);
  const totalChanges = diff.created.length + diff.updated.length + diff.deleted.length;

  return (
    <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Preview output</span>
        <button onClick={onClose} className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors" aria-label="Close preview">×</button>
      </div>

      {totalChanges === 0 && diff.unchanged.length === 0 ? (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">No tokens would be generated.</p>
      ) : totalChanges === 0 ? (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">All {diff.unchanged.length} tokens are already up-to-date. Nothing would change.</p>
      ) : (
        <div className="space-y-1">
          {/* Summary pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {diff.created.length > 0 && (
              <button
                onClick={() => setExpanded(expanded === 'created' ? null : 'created')}
                className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === 'created' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'}`}
              >
                +{diff.created.length} new
              </button>
            )}
            {diff.updated.length > 0 && (
              <button
                onClick={() => setExpanded(expanded === 'updated' ? null : 'updated')}
                className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === 'updated' ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'}`}
              >
                ~{diff.updated.length} changed
              </button>
            )}
            {diff.deleted.length > 0 && (
              <button
                onClick={() => setExpanded(expanded === 'deleted' ? null : 'deleted')}
                className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === 'deleted' ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'}`}
              >
                -{diff.deleted.length} removed
              </button>
            )}
            {diff.unchanged.length > 0 && (
              <span className="text-[10px] px-1.5 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)]">
                ={diff.unchanged.length} unchanged
              </span>
            )}
          </div>

          {/* Detail list for expanded section */}
          {expanded === 'created' && diff.created.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-px mt-1">
              {diff.created.map(t => (
                <div key={t.path} className="flex items-center gap-1 text-[10px]">
                  <span className="text-emerald-600 font-medium shrink-0">+</span>
                  <span className="font-mono text-[var(--color-figma-text-secondary)] truncate">{t.path}</span>
                  <span className="ml-auto font-mono text-[var(--color-figma-text-tertiary)] truncate max-w-[80px]">{formatTokenValue(t.value)}</span>
                </div>
              ))}
            </div>
          )}
          {expanded === 'updated' && diff.updated.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-px mt-1">
              {diff.updated.map(t => (
                <div key={t.path} className="flex flex-col gap-px text-[10px] py-0.5 border-b border-[var(--color-figma-border)] last:border-b-0">
                  <span className="font-mono text-[var(--color-figma-text-secondary)] truncate">{t.path}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-figma-text-tertiary)] shrink-0">was</span>
                    <span className="font-mono text-red-500 truncate max-w-[90px]">{formatTokenValue(t.currentValue)}</span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
                    <span className="font-mono text-emerald-600 truncate max-w-[90px]">{formatTokenValue(t.newValue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {expanded === 'deleted' && diff.deleted.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-px mt-1">
              {diff.deleted.map(t => (
                <div key={t.path} className="flex items-center gap-1 text-[10px]">
                  <span className="text-red-500 font-medium shrink-0">−</span>
                  <span className="font-mono text-[var(--color-figma-text-secondary)] truncate">{t.path}</span>
                  <span className="ml-auto font-mono text-[var(--color-figma-text-tertiary)] truncate max-w-[80px]">{formatTokenValue(t.currentValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onConfirmRun}
        disabled={running}
        className="mt-2 w-full py-1.5 px-2 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {running ? 'Running…' : totalChanges === 0 ? 'Run (no changes)' : `Run (apply ${totalChanges} change${totalChanges !== 1 ? 's' : ''})`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick edit panel
// ---------------------------------------------------------------------------

const QE_INPUT = 'w-full px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]';
const QE_LABEL = 'block text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5';

const RATIO_PRESETS = [
  { label: 'Minor Third (1.2)', value: 1.2 },
  { label: 'Major Third (1.25)', value: 1.25 },
  { label: 'Perfect Fourth (1.333)', value: 1.333 },
  { label: 'Augmented Fourth (1.414)', value: 1.414 },
  { label: 'Perfect Fifth (1.5)', value: 1.5 },
  { label: 'Golden Ratio (1.618)', value: 1.618 },
];

const COLOR_STEP_PRESETS = [
  { label: 'Tailwind (11)', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] },
  { label: 'Material (10)', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { label: 'Compact (5)', steps: [100, 300, 500, 700, 900] },
];

function QuickEditTypeFields({ type, config, onChange }: {
  type: GeneratorType;
  config: GeneratorConfig;
  onChange: (c: GeneratorConfig) => void;
}) {
  switch (type) {
    case 'colorRamp': {
      const c = config as ColorRampConfig;
      return (
        <>
          <div>
            <label className={QE_LABEL}>Step preset</label>
            <div className="flex gap-1">
              {COLOR_STEP_PRESETS.map(preset => {
                const active = JSON.stringify(c.steps) === JSON.stringify(preset.steps);
                return (
                  <button
                    key={preset.label}
                    onClick={() => onChange({ ...c, steps: preset.steps })}
                    title={preset.label}
                    className={`flex-1 text-[9px] py-0.5 px-1 rounded border transition-colors ${active ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]'}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <label className={QE_LABEL}>Light end (L*)</label>
              <input
                type="number"
                value={c.lightEnd}
                min={1}
                max={100}
                onChange={e => onChange({ ...c, lightEnd: Number(e.target.value) })}
                className={QE_INPUT}
              />
            </div>
            <div className="flex-1">
              <label className={QE_LABEL}>Dark end (L*)</label>
              <input
                type="number"
                value={c.darkEnd}
                min={1}
                max={100}
                onChange={e => onChange({ ...c, darkEnd: Number(e.target.value) })}
                className={QE_INPUT}
              />
            </div>
            <div className="flex-1">
              <label className={QE_LABEL}>Chroma boost</label>
              <input
                type="number"
                value={c.chromaBoost}
                min={0.1}
                max={3.0}
                step={0.1}
                onChange={e => onChange({ ...c, chromaBoost: Number(e.target.value) })}
                className={QE_INPUT}
              />
            </div>
          </div>
        </>
      );
    }
    case 'typeScale': {
      const c = config as TypeScaleConfig;
      const knownRatio = RATIO_PRESETS.some(p => Math.abs(p.value - c.ratio) < 0.0001);
      return (
        <>
          <div>
            <label className={QE_LABEL}>Scale ratio</label>
            <select
              value={knownRatio ? String(c.ratio) : 'custom'}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange({ ...c, ratio: v });
              }}
              className={QE_INPUT}
            >
              {RATIO_PRESETS.map(p => (
                <option key={p.value} value={String(p.value)}>{p.label}</option>
              ))}
              {!knownRatio && <option value="custom">{c.ratio} (custom)</option>}
            </select>
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <label className={QE_LABEL}>Unit</label>
              <select value={c.unit} onChange={e => onChange({ ...c, unit: e.target.value as 'px' | 'rem' })} className={QE_INPUT}>
                <option value="rem">rem</option>
                <option value="px">px</option>
              </select>
            </div>
            <div className="flex-1">
              <label className={QE_LABEL}>Round to</label>
              <input
                type="number"
                value={c.roundTo}
                min={0}
                max={5}
                onChange={e => onChange({ ...c, roundTo: Number(e.target.value) })}
                className={QE_INPUT}
              />
            </div>
          </div>
        </>
      );
    }
    case 'spacingScale': {
      const c = config as SpacingScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Unit</label>
          <select value={c.unit} onChange={e => onChange({ ...c, unit: e.target.value as 'px' | 'rem' })} className={QE_INPUT}>
            <option value="px">px</option>
            <option value="rem">rem</option>
          </select>
        </div>
      );
    }
    case 'borderRadiusScale': {
      const c = config as BorderRadiusScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Unit</label>
          <select value={c.unit} onChange={e => onChange({ ...c, unit: e.target.value as 'px' | 'rem' })} className={QE_INPUT}>
            <option value="px">px</option>
            <option value="rem">rem</option>
          </select>
        </div>
      );
    }
    case 'shadowScale': {
      const c = config as ShadowScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Shadow color</label>
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0"
              style={{ background: c.color }}
            />
            <input
              type="text"
              value={c.color}
              onChange={e => onChange({ ...c, color: e.target.value })}
              placeholder="#000000"
              className={`${QE_INPUT} font-mono`}
              maxLength={9}
            />
          </div>
        </div>
      );
    }
    case 'customScale': {
      const c = config as CustomScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Formula</label>
          <input
            type="text"
            value={c.formula}
            onChange={e => onChange({ ...c, formula: e.target.value })}
            placeholder="base * ratio^index"
            className={`${QE_INPUT} font-mono`}
          />
        </div>
      );
    }
    case 'accessibleColorPair': {
      const c = config as AccessibleColorPairConfig;
      return (
        <div>
          <label className={QE_LABEL}>Contrast level</label>
          <div className="flex gap-1">
            {(['AA', 'AAA'] as const).map(level => (
              <button
                key={level}
                onClick={() => onChange({ ...c, contrastLevel: level })}
                className={`flex-1 text-[10px] py-0.5 px-2 rounded border transition-colors ${c.contrastLevel === level ? 'bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]'}`}
              >
                {level} ({level === 'AA' ? '4.5:1' : '7:1'})
              </button>
            ))}
          </div>
        </div>
      );
    }
    case 'darkModeInversion': {
      const c = config as DarkModeInversionConfig;
      return (
        <div>
          <label className={QE_LABEL}>Chroma boost</label>
          <input
            type="number"
            value={c.chromaBoost}
            min={0}
            max={2.0}
            step={0.05}
            onChange={e => onChange({ ...c, chromaBoost: Number(e.target.value) })}
            className={QE_INPUT}
          />
        </div>
      );
    }
    case 'contrastCheck': {
      const c = config as ContrastCheckConfig;
      return (
        <div>
          <label className={QE_LABEL}>Background color</label>
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0"
              style={{ background: c.backgroundHex }}
            />
            <input
              type="text"
              value={c.backgroundHex}
              onChange={e => onChange({ ...c, backgroundHex: e.target.value })}
              placeholder="#ffffff"
              className={`${QE_INPUT} font-mono`}
              maxLength={9}
            />
          </div>
        </div>
      );
    }
    case 'opacityScale':
    case 'zIndexScale':
    default:
      return null;
  }
}

function QuickEditPanel({ generator, serverUrl, allSets, onSaved, onOpenFullDialog }: {
  generator: TokenGenerator;
  serverUrl: string;
  allSets: string[];
  onSaved: () => void;
  onOpenFullDialog: () => void;
}) {
  const [config, setConfig] = useState<GeneratorConfig>(() => JSON.parse(JSON.stringify(generator.config)));
  const [sourceToken, setSourceToken] = useState(generator.sourceToken ?? '');
  const [name, setName] = useState(generator.name);
  const [targetGroup, setTargetGroup] = useState(generator.targetGroup ?? '');
  const [targetSet, setTargetSet] = useState(generator.targetSet ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSource = VALUE_REQUIRED_TYPES.includes(generator.type);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, targetGroup, targetSet, config };
      if (needsSource && sourceToken.trim()) body.sourceToken = sourceToken.trim();
      await apiFetch(`${serverUrl}/api/generators/${generator.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)] flex flex-col gap-2">
      {needsSource && (
        <div>
          <label className={QE_LABEL}>Source token</label>
          <input
            type="text"
            value={sourceToken}
            onChange={e => setSourceToken(e.target.value)}
            placeholder="e.g. colors.brand.primary"
            className={`${QE_INPUT} font-mono`}
          />
        </div>
      )}

      <QuickEditTypeFields type={generator.type} config={config} onChange={setConfig} />

      <div className="flex gap-1.5">
        <div className="flex-1">
          <label className={QE_LABEL}>Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={QE_INPUT} />
        </div>
        <div className="flex-1">
          <label className={QE_LABEL}>Target group</label>
          <input type="text" value={targetGroup} onChange={e => setTargetGroup(e.target.value)} className={`${QE_INPUT} font-mono`} />
        </div>
      </div>

      <div>
        <label className={QE_LABEL}>Target set</label>
        <select value={targetSet} onChange={e => setTargetSet(e.target.value)} className={QE_INPUT}>
          {allSets.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && (
        <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 rounded px-2 py-1 border border-[var(--color-figma-error)]/20 break-words">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save & re-run'}
        </button>
        <button
          onClick={onOpenFullDialog}
          className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors whitespace-nowrap"
        >
          Full settings →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generator pipeline card
// ---------------------------------------------------------------------------

export interface GeneratorPipelineCardProps {
  generator: TokenGenerator;
  isFocused?: boolean;
  focusRef?: React.RefObject<HTMLDivElement | null>;
  serverUrl: string;
  allSets: string[];
  activeSet: string;
  onRefresh: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
}

export function GeneratorPipelineCard({
  generator,
  isFocused,
  focusRef,
  serverUrl,
  allSets,
  activeSet,
  onRefresh,
  allTokensFlat,
}: GeneratorPipelineCardProps) {
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDiff, setPreviewDiff] = useState<DryRunDiff | null>(null);
  const [showStepOverrides, setShowStepOverrides] = useState(false);
  const [stepResults, setStepResults] = useState<GeneratedTokenResult[] | null>(null);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepOverrideError, setStepOverrideError] = useState<string | null>(null);
  const stepCount = getGeneratorStepCount(generator);
  const typeLabel = getGeneratorTypeLabel(generator.type);
  const hasError = !!generator.lastRunError;
  const isStale = !!generator.isStale && !hasError;
  const overrideCount = Object.keys(generator.overrides ?? {}).length;

  const handleRerun = async () => {
    setRunning(true);
    setActionError(null);
    setPreviewDiff(null);
    try {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}/run`, { method: 'POST' });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Re-run failed');
    } finally {
      setRunning(false);
    }
  };

  const handlePreviewOutput = async () => {
    setPreviewLoading(true);
    setActionError(null);
    try {
      const diff = await apiFetch<DryRunDiff>(`${serverUrl}/api/generators/${generator.id}/dry-run`, { method: 'POST' });
      setPreviewDiff(diff);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    setActionError(null);
    try {
      const body = {
        type: generator.type,
        name: `${generator.name} (copy)`,
        sourceToken: generator.sourceToken,
        inlineValue: generator.inlineValue,
        targetSet: generator.targetSet,
        targetGroup: generator.targetGroup ? `${generator.targetGroup}_copy` : `${generator.name}_copy`,
        config: generator.config,
        overrides: generator.overrides,
      };
      await apiFetch(`${serverUrl}/api/generators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Duplicate failed');
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async (deleteTokens: boolean) => {
    setDeleting(true);
    setActionError(null);
    try {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}?deleteTokens=${deleteTokens}`, { method: 'DELETE' });
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const fetchStepResults = async () => {
    setStepsLoading(true);
    setStepOverrideError(null);
    try {
      const data = await apiFetch<{ count: number; results: GeneratedTokenResult[] }>(
        `${serverUrl}/api/generators/${generator.id}/steps`,
      );
      setStepResults(data.results);
    } catch (err) {
      setStepOverrideError(err instanceof Error ? err.message : 'Failed to load steps');
    } finally {
      setStepsLoading(false);
    }
  };

  const handleToggleSteps = () => {
    const next = !showStepOverrides;
    setShowStepOverrides(next);
    if (next && !stepResults) {
      fetchStepResults();
    }
  };

  const handleStepPinChange = async (stepName: string, value: string, locked: boolean) => {
    setStepOverrideError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${generator.id}/steps/${encodeURIComponent(stepName)}/override`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value, locked }),
        },
      );
      onRefresh();
      await fetchStepResults();
    } catch (err) {
      setStepOverrideError(err instanceof Error ? err.message : 'Override failed');
    }
  };

  const handleStepPinClear = async (stepName: string) => {
    setStepOverrideError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${generator.id}/steps/${encodeURIComponent(stepName)}/override`,
        { method: 'DELETE' },
      );
      onRefresh();
      await fetchStepResults();
    } catch (err) {
      setStepOverrideError(err instanceof Error ? err.message : 'Clear override failed');
    }
  };

  return (
    <div ref={isFocused ? focusRef : undefined} className={`p-3 rounded border bg-[var(--color-figma-bg)] transition-all duration-500 ${hasError ? 'border-[var(--color-figma-error)]' : isStale ? 'border-yellow-400/70' : isFocused ? 'border-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-accent)]/40' : 'border-[var(--color-figma-border)]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium border border-[var(--color-figma-accent)]/20">
          {typeLabel}
        </span>
        <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate flex-1">{generator.name}</span>
        {isStale && (
          <span
            title={`Source token "${generator.sourceToken}" has changed since this generator last ran. Re-run to update generated tokens.`}
            className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-yellow-600 bg-yellow-50 border border-yellow-300 rounded px-1.5 py-px leading-none"
            aria-label="Generator output may be stale"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Needs re-run
          </span>
        )}
        {hasError && (
          <span title={`Auto-run failed: ${generator.lastRunError!.message}`} className="shrink-0 text-[var(--color-figma-error)]" aria-label="Generator auto-run error">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
        )}
      </div>
      {hasError && (
        <div className="mb-2 text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 rounded px-2 py-1 border border-[var(--color-figma-error)]/20 break-words">
          Auto-run failed: {generator.lastRunError!.message}
        </div>
      )}
      {actionError && (
        <div className="mb-2 text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 rounded px-2 py-1 border border-[var(--color-figma-error)]/20 break-words flex items-start gap-1.5">
          <span className="shrink-0 mt-px">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="shrink-0 hover:opacity-70 transition-opacity" aria-label="Dismiss error">×</button>
        </div>
      )}
      <div className="flex items-center gap-1.5 text-[10px]">
        {generator.sourceToken ? (
          <>
            <span className="font-mono text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] px-1 py-px rounded border border-[var(--color-figma-border)] truncate max-w-[100px]">
              {generator.sourceToken}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          </>
        ) : generator.inlineValue !== undefined ? (
          <>
            <span className="font-mono text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] px-1 py-px rounded border border-[var(--color-figma-border)] truncate max-w-[100px]">
              {typeof generator.inlineValue === 'string' ? generator.inlineValue : typeof generator.inlineValue === 'object' && generator.inlineValue !== null && 'value' in (generator.inlineValue as Record<string, unknown>) ? `${(generator.inlineValue as {value: number; unit?: string}).value}${(generator.inlineValue as {unit?: string}).unit || ''}` : String(generator.inlineValue)}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          </>
        ) : (
          <>
            <span className="text-[10px] px-1 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)]">standalone</span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          </>
        )}
        <span className="font-mono text-[var(--color-figma-text)] bg-[var(--color-figma-bg-secondary)] px-1 py-px rounded border border-[var(--color-figma-border)] truncate max-w-[100px]">
          {generator.targetGroup}.*
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span className="text-[var(--color-figma-text-secondary)] tabular-nums">{stepCount} tokens</span>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--color-figma-border)]">
        <button
          onClick={handleRerun}
          disabled={running || previewLoading}
          className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors disabled:opacity-50"
        >
          {running ? 'Running…' : 'Re-run'}
        </button>
        <button
          onClick={previewDiff ? () => setPreviewDiff(null) : handlePreviewOutput}
          disabled={running || previewLoading}
          className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-50"
          title="Preview what tokens would be created, updated, or deleted without running"
        >
          {previewLoading ? 'Loading…' : previewDiff ? 'Hide preview' : 'Preview output'}
        </button>
        <button
          onClick={handleToggleSteps}
          className={`text-[10px] transition-colors ${showStepOverrides ? 'text-[var(--color-figma-accent)]' : overrideCount > 0 ? 'text-[var(--color-figma-accent)] opacity-70 hover:opacity-100' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          title="View and pin individual step values"
        >
          {showStepOverrides ? 'Hide steps' : overrideCount > 0 ? `Steps (${overrideCount} pinned)` : 'Steps'}
        </button>
        <button
          onClick={() => setShowQuickEdit(v => !v)}
          className={`text-[10px] transition-colors ${showQuickEdit ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
          title={showQuickEdit ? 'Close quick edit' : 'Quick-edit key parameters inline'}
        >
          {showQuickEdit ? 'Close edit' : 'Edit'}
        </button>
        <button
          onClick={handleDuplicate}
          disabled={duplicating}
          className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-50"
          title="Duplicate this generator as a starting point"
        >
          {duplicating ? 'Duplicating…' : 'Duplicate'}
        </button>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] transition-colors ml-auto"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Delete tokens too?</span>
            <button onClick={() => handleDelete(true)} disabled={deleting} className="text-[10px] text-[var(--color-figma-error)] hover:underline disabled:opacity-50">Yes</button>
            <button onClick={() => handleDelete(false)} disabled={deleting} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline disabled:opacity-50">No</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline">Cancel</button>
          </div>
        )}
      </div>

      {previewDiff && (
        <DryRunPreview
          diff={previewDiff}
          onConfirmRun={handleRerun}
          onClose={() => setPreviewDiff(null)}
          running={running}
        />
      )}

      {showStepOverrides && (
        <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Step values</span>
            {overrideCount > 0 && (
              <span className="text-[9px] px-1 py-px rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/20">
                {overrideCount} pinned
              </span>
            )}
            <button
              onClick={fetchStepResults}
              disabled={stepsLoading}
              className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-50"
              title="Refresh step values"
              aria-label="Refresh step values"
            >
              {stepsLoading ? '…' : '↻'}
            </button>
          </div>
          {stepOverrideError && (
            <p className="text-[10px] text-[var(--color-figma-error)] mb-1">{stepOverrideError}</p>
          )}
          {stepsLoading && !stepResults && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">Loading…</p>
          )}
          {stepResults && stepResults.length === 0 && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">No steps generated yet. Run the generator first.</p>
          )}
          {stepResults && stepResults.length > 0 && (
            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {stepResults.map(token => (
                <OverrideRow
                  key={token.stepName}
                  token={token}
                  override={generator.overrides?.[token.stepName]}
                  onOverrideChange={handleStepPinChange}
                  onOverrideClear={handleStepPinClear}
                >
                  {token.type === 'color' && typeof token.value === 'string' && (
                    <span
                      className="shrink-0 w-4 h-3 rounded-sm border border-[var(--color-figma-border)]"
                      style={{ backgroundColor: swatchBgColor(token.value) }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                    {formatValue(token.value)}
                  </span>
                </OverrideRow>
              ))}
            </div>
          )}
        </div>
      )}

      {showQuickEdit && (
        <QuickEditPanel
          generator={generator}
          serverUrl={serverUrl}
          allSets={allSets}
          onSaved={() => { setShowQuickEdit(false); onRefresh(); }}
          onOpenFullDialog={() => { setShowQuickEdit(false); setShowEditDialog(true); }}
        />
      )}

      {showEditDialog && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          allSets={allSets}
          activeSet={activeSet}
          allTokensFlat={allTokensFlat}
          existingGenerator={generator}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => { setShowEditDialog(false); onRefresh(); }}
        />
      )}
    </div>
  );
}
