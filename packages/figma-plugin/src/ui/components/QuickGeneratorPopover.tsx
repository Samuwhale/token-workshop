import { useEffect, useMemo, useRef } from 'react';
import type {
  ColorRampConfig,
  GeneratedTokenResult,
  GeneratorType,
  SpacingScaleConfig,
  TypeScaleConfig,
} from '../hooks/useGenerators';
import { useGeneratorDialog, type GeneratorDialogInitialDraft } from '../hooks/useGeneratorDialog';
import type { UndoSlot } from '../hooks/useUndo';
import { formatValue, isDimensionLike } from './generators/generatorShared';
import { COLOR_STEP_PRESETS } from './generators/ColorRampGenerator';
import { SPACING_STEP_PRESETS } from './generators/SpacingScaleGenerator';
import { TYPE_RATIO_PRESETS, TYPE_STEP_PRESETS } from './generators/TypeScaleGenerator';
import { autoName, suggestTargetGroup } from './generators/generatorUtils';
import { getGeneratorTypeLabel } from './GeneratorPipelineCard';

const POPOVER_CLASS =
  'fixed z-50 w-[360px] max-w-[calc(100vw-16px)] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl';
const SEGMENT_BUTTON_CLASS =
  'rounded-md border px-2 py-1 text-[10px] font-medium transition-colors';

interface QuickGeneratorPopoverProps {
  serverUrl: string;
  position: { x: number; y: number };
  generatorType: GeneratorType;
  sourceTokenPath: string;
  sourceTokenName: string;
  sourceTokenType?: string;
  sourceTokenValue?: unknown;
  activeSet: string;
  onClose: () => void;
  onCreated: (info?: { targetGroup: string }) => void;
  onOpenAdvanced: (draft: GeneratorDialogInitialDraft) => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

function getStepValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (isDimensionLike(value)) return value.value;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function DimensionPreviewStrip({ tokens }: { tokens: GeneratedTokenResult[] }) {
  const maxValue = Math.max(1, ...tokens.map(token => getStepValue(token.value)));
  return (
    <div className="space-y-1.5">
      {tokens.map(token => {
        const numeric = getStepValue(token.value);
        const width = Math.max(8, (numeric / maxValue) * 100);
        return (
          <div key={token.path} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[9px] font-mono text-[var(--color-figma-text-secondary)] text-right">
              {token.stepName}
            </span>
            <div className="h-2 flex-1 rounded-full bg-[var(--color-figma-bg-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--color-figma-accent)]/70"
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-[9px] font-mono text-[var(--color-figma-text-tertiary)] text-right">
              {formatValue(token.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GenericPreviewStrip({ tokens }: { tokens: GeneratedTokenResult[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.map(token => (
        <div
          key={token.path}
          className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1"
        >
          <div className="text-[9px] font-mono text-[var(--color-figma-text-secondary)]">{token.stepName}</div>
          <div className="text-[10px] text-[var(--color-figma-text)]">{formatValue(token.value)}</div>
        </div>
      ))}
    </div>
  );
}

function PreviewStrip({ type, tokens }: { type: GeneratorType; tokens: GeneratedTokenResult[] }) {
  if (type === 'colorRamp') {
    return (
      <div className="flex gap-0.5 overflow-hidden rounded-md">
        {tokens.map(token => (
          <div
            key={token.path}
            className="flex h-14 flex-1 min-w-0 items-end justify-center pb-1"
            style={{ background: String(token.value) }}
            title={`${token.stepName}: ${formatValue(token.value)}`}
          >
            <span className="rounded-sm bg-black/20 px-1 py-0.5 text-[8px] font-mono text-white">
              {token.stepName}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'typeScale' || type === 'spacingScale' || type === 'borderRadiusScale') {
    return <DimensionPreviewStrip tokens={tokens} />;
  }

  return <GenericPreviewStrip tokens={tokens} />;
}

export function QuickGeneratorPopover({
  serverUrl,
  position,
  generatorType,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  sourceTokenValue,
  activeSet,
  onClose,
  onCreated,
  onOpenAdvanced,
  onPushUndo,
}: QuickGeneratorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const initialDraft = useMemo<GeneratorDialogInitialDraft>(() => ({
    selectedType: generatorType,
    name: autoName(sourceTokenPath, generatorType),
    nameIsAuto: true,
    targetSet: activeSet,
    targetGroup: suggestTargetGroup(sourceTokenPath, sourceTokenName),
  }), [activeSet, generatorType, sourceTokenName, sourceTokenPath]);

  const dialog = useGeneratorDialog({
    serverUrl,
    sourceTokenPath,
    sourceTokenName,
    sourceTokenType,
    sourceTokenValue,
    activeSet,
    initialDraft,
    onSaved: (info) => onCreated(info),
    pushUndo: onPushUndo,
  });

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const advancedDraft = useMemo<GeneratorDialogInitialDraft>(() => ({
    selectedType: dialog.selectedType,
    name: dialog.name,
    nameIsAuto: true,
    targetSet: dialog.targetSet,
    targetGroup: dialog.targetGroup,
    inlineValue: dialog.inlineValue,
    configs: {
      [dialog.selectedType]: dialog.currentConfig,
    },
    pendingOverrides: dialog.pendingOverrides,
  }), [
    dialog.currentConfig,
    dialog.inlineValue,
    dialog.name,
    dialog.pendingOverrides,
    dialog.selectedType,
    dialog.targetGroup,
    dialog.targetSet,
  ]);

  const colorConfig = dialog.selectedType === 'colorRamp' ? dialog.currentConfig as ColorRampConfig : null;
  const typeConfig = dialog.selectedType === 'typeScale' ? dialog.currentConfig as TypeScaleConfig : null;
  const spacingConfig = dialog.selectedType === 'spacingScale' ? dialog.currentConfig as SpacingScaleConfig : null;

  const canCreate = dialog.targetGroup.trim().length > 0
    && dialog.name.trim().length > 0
    && (!dialog.typeNeedsValue || dialog.hasValue);

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Quick ${getGeneratorTypeLabel(dialog.selectedType)}`}
      className={POPOVER_CLASS}
      style={{ top: position.y, left: position.x }}
      onClick={event => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-figma-border)] px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            {getGeneratorTypeLabel(dialog.selectedType)}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Quick setup for the current token
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          aria-label="Close quick generator"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="max-h-[min(70vh,540px)] space-y-3 overflow-y-auto px-3 py-3">
        <div className="space-y-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">Source token</div>
            <div className="mt-0.5 text-[11px] font-mono text-[var(--color-figma-text)]">{sourceTokenPath}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">Target set</div>
              <div className="mt-0.5 text-[10px] text-[var(--color-figma-text)]">{dialog.targetSet}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">Target group</div>
              <div className="mt-0.5 text-[10px] font-mono text-[var(--color-figma-text)]">{dialog.targetGroup}</div>
            </div>
          </div>
        </div>

        {colorConfig && (
          <>
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">Steps</div>
              <div className="flex flex-wrap gap-1">
                {COLOR_STEP_PRESETS.map((preset) => {
                  const active = preset.steps.length === colorConfig.steps.length
                    && preset.steps.every((step, index) => step === colorConfig.steps[index]);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.description}
                      onClick={() => dialog.handleConfigChange('colorRamp', { ...colorConfig, steps: [...preset.steps] })}
                      className={`${SEGMENT_BUTTON_CLASS} ${
                        active
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Light end</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={80}
                    max={99}
                    step={1}
                    value={colorConfig.lightEnd}
                    onChange={event => dialog.handleConfigChange('colorRamp', { ...colorConfig, lightEnd: Number(event.target.value) })}
                    className="flex-1 accent-[var(--color-figma-accent)]"
                  />
                  <span className="w-7 text-right text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                    {colorConfig.lightEnd}
                  </span>
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Dark end</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={1}
                    value={colorConfig.darkEnd}
                    onChange={event => dialog.handleConfigChange('colorRamp', { ...colorConfig, darkEnd: Number(event.target.value) })}
                    className="flex-1 accent-[var(--color-figma-accent)]"
                  />
                  <span className="w-7 text-right text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                    {colorConfig.darkEnd}
                  </span>
                </div>
              </label>
            </div>
          </>
        )}

        {typeConfig && (
          <>
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">Ratio preset</div>
              <div className="flex flex-wrap gap-1">
                {TYPE_RATIO_PRESETS.map((preset) => {
                  const active = Math.abs(typeConfig.ratio - preset.value) < 0.0001;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      title={preset.description}
                      onClick={() => dialog.handleConfigChange('typeScale', { ...typeConfig, ratio: preset.value })}
                      className={`${SEGMENT_BUTTON_CLASS} ${
                        active
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">Steps preset</div>
              <div className="flex flex-wrap gap-1">
                {TYPE_STEP_PRESETS.map((preset) => {
                  const active = preset.steps.length === typeConfig.steps.length
                    && preset.steps.every((step, index) => step.name === typeConfig.steps[index]?.name);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.description}
                      onClick={() => dialog.handleConfigChange('typeScale', {
                        ...typeConfig,
                        steps: preset.steps.map(step => ({ ...step })),
                        baseStep: preset.steps.find(step => step.exponent === 0)?.name
                          ?? preset.steps[Math.floor(preset.steps.length / 2)]?.name
                          ?? typeConfig.baseStep,
                      })}
                      className={`${SEGMENT_BUTTON_CLASS} ${
                        active
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {spacingConfig && (
          <div>
            <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">Steps preset</div>
            <div className="flex flex-wrap gap-1">
              {SPACING_STEP_PRESETS.map((preset) => {
                const active = preset.steps.length === spacingConfig.steps.length
                  && preset.steps.every((step, index) => step.name === spacingConfig.steps[index]?.name);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    title={preset.description}
                    onClick={() => dialog.handleConfigChange('spacingScale', {
                      ...spacingConfig,
                      steps: preset.steps.map(step => ({ ...step })),
                    })}
                    className={`${SEGMENT_BUTTON_CLASS} ${
                      active
                        ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                        : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">Preview</div>
            {dialog.previewLoading && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Updating…</span>
            )}
          </div>
          <div className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
            {dialog.previewError ? (
              <div className="text-[10px] text-[var(--color-figma-error)]">{dialog.previewError}</div>
            ) : dialog.previewTokens.length > 0 ? (
              <PreviewStrip type={dialog.selectedType} tokens={dialog.previewTokens} />
            ) : (
              <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                Waiting for a preview from the generator service.
              </div>
            )}
          </div>
        </div>

        {dialog.saveError && (
          <div className="rounded-md border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/8 px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
            {dialog.saveError}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-figma-border)] px-3 py-2.5">
        <button
          type="button"
          onClick={() => onOpenAdvanced(advancedDraft)}
          className="text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
        >
          Advanced options…
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate || dialog.saving}
            onClick={() => { void dialog.handleQuickSave(); }}
            className="rounded-md bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dialog.saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
