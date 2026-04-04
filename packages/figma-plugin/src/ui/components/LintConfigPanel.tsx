import { useState } from 'react';
import type { LintConfig, LintRuleConfig, Severity } from '../hooks/useLintConfig';
import { LINT_RULE_REGISTRY, LINT_PRESETS, buildLintConfigFromPreset } from '../shared/lintRules';

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

const SEVERITY_COLORS: Record<Severity, string> = {
  error: 'var(--color-figma-error)',
  warning: 'var(--color-figma-warning, #F5A623)',
  info: 'var(--color-figma-text-secondary)',
};

interface LintConfigPanelProps {
  config: LintConfig;
  saving: boolean;
  onUpdateRule: (ruleId: string, patch: Partial<LintRuleConfig>) => Promise<boolean>;
  onApplyConfig: (config: LintConfig) => Promise<boolean>;
  onReset: () => Promise<boolean | undefined>;
  onLintRefresh: () => void;
}

export function LintConfigPanel({ config, saving, onUpdateRule, onApplyConfig, onReset, onLintRefresh }: LintConfigPanelProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);

  async function handleApplyPreset(presetId: string) {
    const preset = LINT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const newConfig = buildLintConfigFromPreset(preset) as LintConfig;
    await onApplyConfig(newConfig);
    onLintRefresh();
  }

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Lint Rules</span>
        <button
          onClick={async () => { await onReset(); onLintRefresh(); }}
          disabled={saving}
          className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-50"
          title="Reset all lint rules to defaults"
        >
          Reset defaults
        </button>
      </div>

      {/* Preset buttons */}
      <div className="px-3 py-2 bg-[var(--color-figma-bg)] border-b border-[var(--color-figma-border)]">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Presets</span>
        </div>
        <div className="flex gap-1.5">
          {LINT_PRESETS.map(preset => (
            <div key={preset.id} className="relative flex-1">
              <button
                onClick={() => handleApplyPreset(preset.id)}
                onMouseEnter={() => setHoveredPreset(preset.id)}
                onMouseLeave={() => setHoveredPreset(null)}
                disabled={saving}
                className="w-full px-2 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors disabled:opacity-50 font-medium"
              >
                {preset.label}
              </button>
              {hoveredPreset === preset.id && (
                <div className="absolute left-0 top-full mt-1 z-10 w-48 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-md px-2 py-1.5 pointer-events-none">
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">{preset.description}</p>
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {LINT_RULE_REGISTRY.map(rule => {
                      const rc = preset.rules[rule.id];
                      return rc?.enabled ? (
                        <div key={rule.id} className="flex items-center gap-1">
                          <span
                            className="shrink-0 w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: SEVERITY_COLORS[rc.severity ?? 'warning'] }}
                          />
                          <span className="text-[9px] text-[var(--color-figma-text)]">{rule.label}</span>
                          {rc.options?.maxDepth != null && (
                            <span className="text-[9px] text-[var(--color-figma-text-secondary)]">≤{String(rc.options.maxDepth)}</span>
                          )}
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
        {LINT_RULE_REGISTRY.map(rule => {
          const ruleConfig = config.lintRules[rule.id] ?? { enabled: false };
          const isExpanded = expandedRule === rule.id;
          const hasOptions = rule.options && rule.options.length > 0;

          return (
            <div key={rule.id} className="px-3 py-2">
              {/* Top row: toggle + label + severity */}
              <div className="flex items-center gap-2">
                {/* Toggle switch */}
                <button
                  onClick={async () => { await onUpdateRule(rule.id, { enabled: !ruleConfig.enabled }); onLintRefresh(); }}
                  disabled={saving}
                  className="relative shrink-0 w-6 h-3.5 rounded-full transition-colors disabled:opacity-50"
                  style={{ backgroundColor: ruleConfig.enabled ? 'var(--color-figma-accent)' : 'var(--color-figma-border)' }}
                  role="switch"
                  aria-checked={ruleConfig.enabled}
                  aria-label={`${rule.label} enabled`}
                >
                  <span
                    className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform"
                    style={{ left: ruleConfig.enabled ? '12px' : '2px' }}
                  />
                </button>

                {/* Label + expand button */}
                <button
                  onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                  className="flex-1 text-left text-[11px] text-[var(--color-figma-text)] hover:underline"
                  title={rule.description}
                >
                  {rule.label}
                </button>

                {/* Severity select */}
                <select
                  value={ruleConfig.severity ?? 'warning'}
                  onChange={async e => { await onUpdateRule(rule.id, { severity: e.target.value as Severity }); onLintRefresh(); }}
                  disabled={saving || !ruleConfig.enabled}
                  className="text-[10px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] px-1 py-0.5 outline-none disabled:opacity-40"
                  style={{ color: ruleConfig.enabled ? SEVERITY_COLORS[ruleConfig.severity ?? 'warning'] : undefined }}
                >
                  {SEVERITIES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Expanded detail area */}
              {isExpanded && (
                <div className="mt-1.5 ml-8">
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed mb-1.5">{rule.description}</p>
                  {hasOptions && ruleConfig.enabled && rule.options!.map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{opt.label}</span>
                      <input
                        type={opt.type === 'number' ? 'number' : 'text'}
                        value={String(ruleConfig.options?.[opt.key] ?? opt.placeholder ?? '')}
                        onChange={e => {
                          const val = opt.type === 'number' ? Number(e.target.value) : e.target.value;
                          onUpdateRule(rule.id, { options: { ...ruleConfig.options, [opt.key]: val } }).then(() => onLintRefresh());
                        }}
                        disabled={saving}
                        placeholder={opt.placeholder}
                        className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] disabled:opacity-50"
                        {...(opt.type === 'number' ? { min: 1, max: 100 } : {})}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
