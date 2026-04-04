import { useState } from 'react';
import type { LintConfig, LintRuleConfig, LintRuleSetOverride, Severity } from '../hooks/useLintConfig';
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

/** New-override row being composed in the UI (before it's saved) */
interface PendingOverride {
  setName: string;
  enabled: boolean;
  severity: Severity;
}

export function LintConfigPanel({ config, saving, onUpdateRule, onApplyConfig, onReset, onLintRefresh }: LintConfigPanelProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);
  // Per-rule new-override composition state
  const [pendingOverride, setPendingOverride] = useState<{ ruleId: string; row: PendingOverride } | null>(null);

  function handleExcludePathsChange(ruleId: string, raw: string) {
    const paths = raw.split(',').map(s => s.trim()).filter(Boolean);
    onUpdateRule(ruleId, { excludePaths: paths }).then(() => onLintRefresh());
  }

  function handleSetOverrideChange(ruleId: string, setName: string, patch: Partial<LintRuleSetOverride>, currentOverrides: Record<string, LintRuleSetOverride>) {
    const updated = { ...currentOverrides, [setName]: { ...currentOverrides[setName], ...patch } };
    onUpdateRule(ruleId, { setOverrides: updated }).then(() => onLintRefresh());
  }

  function handleSetOverrideRemove(ruleId: string, setName: string, currentOverrides: Record<string, LintRuleSetOverride>) {
    const updated = { ...currentOverrides };
    delete updated[setName];
    onUpdateRule(ruleId, { setOverrides: updated }).then(() => onLintRefresh());
  }

  function handlePendingOverrideSave(ruleId: string, currentOverrides: Record<string, LintRuleSetOverride>) {
    if (!pendingOverride || pendingOverride.ruleId !== ruleId) return;
    const { setName, enabled, severity } = pendingOverride.row;
    if (!setName.trim()) { setPendingOverride(null); return; }
    const updated = { ...currentOverrides, [setName.trim()]: { enabled, severity } };
    onUpdateRule(ruleId, { setOverrides: updated }).then(() => onLintRefresh());
    setPendingOverride(null);
  }

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

                  {/* Rule-specific options (e.g. pattern, maxDepth) */}
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
                        className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-50"
                        {...(opt.type === 'number' ? { min: 1, max: 100 } : {})}
                      />
                    </label>
                  ))}

                  {/* Scope filters */}
                  <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
                    <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">Scope filters</span>

                    {/* Exclude paths */}
                    <label className="flex items-start gap-2 mt-1.5">
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 pt-0.5">Exclude paths</span>
                      <input
                        type="text"
                        defaultValue={(ruleConfig.excludePaths ?? []).join(', ')}
                        onBlur={e => handleExcludePathsChange(rule.id, e.target.value)}
                        disabled={saving}
                        placeholder="e.g. legacy, internal.raw"
                        title="Comma-separated path prefixes to exclude from this rule. A path is excluded if it equals the prefix or starts with '<prefix>.'"
                        className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)] disabled:opacity-50"
                      />
                    </label>
                    <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">
                      Comma-separated prefixes. Tokens at or under a prefix are skipped.
                    </p>

                    {/* Per-set overrides */}
                    <div className="mt-2">
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Set overrides</span>
                      {Object.keys(ruleConfig.setOverrides ?? {}).length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {Object.entries(ruleConfig.setOverrides!).map(([sn, ov]) => (
                            <div key={sn} className="flex items-center gap-1.5">
                              <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={sn}>{sn}</span>
                              {/* enabled toggle */}
                              <button
                                onClick={() => handleSetOverrideChange(rule.id, sn, { enabled: !(ov.enabled ?? ruleConfig.enabled) }, ruleConfig.setOverrides!)}
                                disabled={saving}
                                className="relative shrink-0 w-5 h-3 rounded-full transition-colors disabled:opacity-50"
                                style={{ backgroundColor: (ov.enabled ?? ruleConfig.enabled) ? 'var(--color-figma-accent)' : 'var(--color-figma-border)' }}
                                role="switch"
                                aria-checked={ov.enabled ?? ruleConfig.enabled}
                                aria-label={`${sn} enabled`}
                              >
                                <span
                                  className="absolute top-0.5 w-2 h-2 rounded-full bg-white shadow-sm transition-transform"
                                  style={{ left: (ov.enabled ?? ruleConfig.enabled) ? '10px' : '2px' }}
                                />
                              </button>
                              {/* severity select */}
                              <select
                                value={ov.severity ?? ruleConfig.severity ?? 'warning'}
                                onChange={e => handleSetOverrideChange(rule.id, sn, { severity: e.target.value as Severity }, ruleConfig.setOverrides!)}
                                disabled={saving}
                                className="text-[10px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] px-1 py-0.5 outline-none disabled:opacity-40"
                                style={{ color: SEVERITY_COLORS[ov.severity ?? ruleConfig.severity ?? 'warning'] }}
                              >
                                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              {/* remove */}
                              <button
                                onClick={() => handleSetOverrideRemove(rule.id, sn, ruleConfig.setOverrides!)}
                                disabled={saving}
                                className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] transition-colors disabled:opacity-40"
                                title={`Remove override for "${sn}"`}
                                aria-label={`Remove override for ${sn}`}
                              >
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pending new override row */}
                      {pendingOverride?.ruleId === rule.id ? (
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            type="text"
                            value={pendingOverride.row.setName}
                            onChange={e => setPendingOverride({ ruleId: rule.id, row: { ...pendingOverride.row, setName: e.target.value } })}
                            onKeyDown={e => { if (e.key === 'Enter') handlePendingOverrideSave(rule.id, ruleConfig.setOverrides ?? {}); if (e.key === 'Escape') setPendingOverride(null); }}
                            placeholder="Set name"
                            autoFocus
                            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-[10px] outline-none"
                          />
                          <button
                            onClick={() => setPendingOverride({ ruleId: rule.id, row: { ...pendingOverride.row, enabled: !pendingOverride.row.enabled } })}
                            className="relative shrink-0 w-5 h-3 rounded-full transition-colors"
                            style={{ backgroundColor: pendingOverride.row.enabled ? 'var(--color-figma-accent)' : 'var(--color-figma-border)' }}
                            role="switch"
                            aria-checked={pendingOverride.row.enabled}
                            aria-label="Override enabled"
                          >
                            <span className="absolute top-0.5 w-2 h-2 rounded-full bg-white shadow-sm transition-transform" style={{ left: pendingOverride.row.enabled ? '10px' : '2px' }} />
                          </button>
                          <select
                            value={pendingOverride.row.severity}
                            onChange={e => setPendingOverride({ ruleId: rule.id, row: { ...pendingOverride.row, severity: e.target.value as Severity } })}
                            className="text-[10px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] px-1 py-0.5 outline-none"
                            style={{ color: SEVERITY_COLORS[pendingOverride.row.severity] }}
                          >
                            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button
                            onClick={() => handlePendingOverrideSave(rule.id, ruleConfig.setOverrides ?? {})}
                            disabled={!pendingOverride.row.setName.trim() || saving}
                            className="text-[10px] text-[var(--color-figma-accent)] hover:underline disabled:opacity-40"
                            title="Save override"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setPendingOverride(null)}
                            className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                            title="Cancel"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingOverride({ ruleId: rule.id, row: { setName: '', enabled: ruleConfig.enabled, severity: ruleConfig.severity ?? 'warning' } })}
                          disabled={saving}
                          className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors disabled:opacity-40"
                        >
                          + Add set override
                        </button>
                      )}
                      <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">
                        Override enabled/severity for a specific token set.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
