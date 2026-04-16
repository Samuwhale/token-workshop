import { useMemo, useState } from 'react';
import { useTokenFlatMapContext, useTokenSetsContext } from '../contexts/TokenDataContext';
import type { LintConfig, LintRuleConfig, LintRuleSetOverride, Severity } from '../hooks/useLintConfig';
import { LINT_RULE_REGISTRY, LINT_PRESETS, buildLintConfigFromPreset } from '../shared/lintRules';

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

const SEVERITY_COLORS: Record<Severity, string> = {
  error: 'var(--color-figma-error)',
  warning: 'var(--color-figma-warning, #F5A623)',
  info: 'var(--color-figma-text-secondary)',
};

const SEVERITY_HELP: Record<Severity, string> = {
  error: 'Blocks',
  warning: 'Warns',
  info: 'Info only',
};

interface LintConfigPanelProps {
  config: LintConfig;
  saving: boolean;
  onUpdateRule: (ruleId: string, patch: Partial<LintRuleConfig>) => Promise<boolean>;
  onApplyConfig: (config: LintConfig) => Promise<boolean>;
  onReset: () => Promise<boolean | undefined>;
  onLintRefresh: () => void;
}

interface PathExceptionOption {
  path: string;
  count: number;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function buildPathExceptionOptions(paths: string[]): PathExceptionOption[] {
  const counts = new Map<string, number>();

  for (const path of paths) {
    const segments = path.split('.').filter(Boolean);
    const prefixDepth = Math.min(segments.length, 3);
    for (let depth = 1; depth <= prefixDepth; depth += 1) {
      const prefix = segments.slice(0, depth).join('.');
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    if (segments.length > 3) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
    .slice(0, 80);
}

function getPresetBaseId(config: LintConfig): string | null {
  for (const preset of LINT_PRESETS) {
    const presetConfig = buildLintConfigFromPreset(preset);
    const matchesPreset = LINT_RULE_REGISTRY.every(rule => {
      const current = config.lintRules[rule.id] ?? { enabled: false };
      const baseline = presetConfig.lintRules[rule.id] ?? { enabled: false };
      return (
        current.enabled === baseline.enabled &&
        (current.severity ?? 'warning') === (baseline.severity ?? 'warning') &&
        JSON.stringify(current.options ?? {}) === JSON.stringify(baseline.options ?? {})
      );
    });
    if (matchesPreset) {
      return preset.id;
    }
  }
  return null;
}

function getDefaultSetOverride(ruleConfig: LintRuleConfig): LintRuleSetOverride {
  return {
    enabled: !ruleConfig.enabled,
    severity: ruleConfig.severity ?? 'warning',
  };
}

function normalizeSetOverride(ruleConfig: LintRuleConfig, override: LintRuleSetOverride): LintRuleSetOverride | null {
  const normalized: LintRuleSetOverride = {};

  if (override.enabled !== undefined && override.enabled !== ruleConfig.enabled) {
    normalized.enabled = override.enabled;
  }
  if (override.severity !== undefined && override.severity !== ruleConfig.severity) {
    normalized.severity = override.severity;
  }
  if (override.options && Object.keys(override.options).length > 0) {
    normalized.options = override.options;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function describeCoverage(ruleConfig: LintRuleConfig, totalSets: number): string {
  const overrides = Object.values(ruleConfig.setOverrides ?? {});
  const disabledSets = overrides.filter(override => override.enabled === false).length;
  const enabledSets = overrides.filter(override => override.enabled === true).length;

  if (totalSets === 0) {
    return ruleConfig.enabled ? 'All sets' : 'Disabled';
  }

  if (ruleConfig.enabled) {
    if (disabledSets === 0) {
      return `${totalSets} / ${totalSets} sets`;
    }
    const coveredSetCount = Math.max(totalSets - disabledSets, 0);
    return `${coveredSetCount} / ${totalSets} sets`;
  }

  if (enabledSets === 0) {
    return 'Disabled';
  }

  return `${enabledSets} / ${totalSets} sets`;
}

function describeOverrideChip(ruleConfig: LintRuleConfig, setName: string, override: LintRuleSetOverride): string {
  const enabled = override.enabled ?? ruleConfig.enabled;
  const severity = override.severity ?? ruleConfig.severity ?? 'warning';

  if (enabled !== ruleConfig.enabled) {
    return enabled ? setName : `${setName} off`;
  }
  if (severity !== (ruleConfig.severity ?? 'warning')) {
    return `${setName} ${severity}`;
  }
  return setName;
}

function formatPathOptionLabel(option: PathExceptionOption): string {
  return `${option.path} (${option.count} token${option.count === 1 ? '' : 's'})`;
}

export function LintConfigPanel({ config, saving, onUpdateRule, onApplyConfig, onReset, onLintRefresh }: LintConfigPanelProps) {
  const { sets } = useTokenSetsContext();
  const { pathToSet } = useTokenFlatMapContext();

  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);
  const [selectedOverride, setSelectedOverride] = useState<{ ruleId: string; setName: string } | null>(null);
  const [setPickerValues, setSetPickerValues] = useState<Record<string, string>>({});
  const [pathPickerValues, setPathPickerValues] = useState<Record<string, string>>({});

  const presetBaseId = useMemo(() => getPresetBaseId(config), [config]);
  const pathExceptionOptions = useMemo(
    () => buildPathExceptionOptions(Object.keys(pathToSet)),
    [pathToSet],
  );

  async function persistRulePatch(ruleId: string, patch: Partial<LintRuleConfig>) {
    const updated = await onUpdateRule(ruleId, patch);
    if (updated) {
      onLintRefresh();
    }
  }

  async function handleApplyPreset(presetId: string) {
    const preset = LINT_PRESETS.find(candidate => candidate.id === presetId);
    if (!preset) {
      return;
    }
    const updated = await onApplyConfig(buildLintConfigFromPreset(preset) as LintConfig);
    if (updated) {
      onLintRefresh();
    }
  }

  async function handleAddPathException(ruleId: string, ruleConfig: LintRuleConfig) {
    const selectedPath = pathPickerValues[ruleId]?.trim();
    if (!selectedPath) {
      return;
    }
    await persistRulePatch(ruleId, {
      excludePaths: dedupeStrings([...(ruleConfig.excludePaths ?? []), selectedPath]),
    });
    setPathPickerValues(current => ({ ...current, [ruleId]: '' }));
  }

  async function handleRemovePathException(ruleId: string, ruleConfig: LintRuleConfig, targetPath: string) {
    await persistRulePatch(ruleId, {
      excludePaths: (ruleConfig.excludePaths ?? []).filter(path => path !== targetPath),
    });
  }

  async function handleAddSetException(ruleId: string, ruleConfig: LintRuleConfig) {
    const selectedSet = setPickerValues[ruleId]?.trim();
    if (!selectedSet) {
      return;
    }
    const nextOverride = normalizeSetOverride(ruleConfig, getDefaultSetOverride(ruleConfig));
    if (!nextOverride) {
      return;
    }
    await persistRulePatch(ruleId, {
      setOverrides: {
        ...(ruleConfig.setOverrides ?? {}),
        [selectedSet]: nextOverride,
      },
    });
    setSelectedOverride({ ruleId, setName: selectedSet });
    setSetPickerValues(current => ({ ...current, [ruleId]: '' }));
  }

  async function handleSetExceptionChange(
    ruleId: string,
    ruleConfig: LintRuleConfig,
    setName: string,
    patch: Partial<LintRuleSetOverride>,
  ) {
    const currentOverride = ruleConfig.setOverrides?.[setName] ?? {};
    const normalizedOverride = normalizeSetOverride(ruleConfig, { ...currentOverride, ...patch });
    const nextOverrides = { ...(ruleConfig.setOverrides ?? {}) };

    if (normalizedOverride) {
      nextOverrides[setName] = normalizedOverride;
    } else {
      delete nextOverrides[setName];
      if (selectedOverride?.ruleId === ruleId && selectedOverride.setName === setName) {
        setSelectedOverride(null);
      }
    }

    await persistRulePatch(ruleId, { setOverrides: nextOverrides });
  }

  async function handleRemoveSetException(ruleId: string, ruleConfig: LintRuleConfig, setName: string) {
    const nextOverrides = { ...(ruleConfig.setOverrides ?? {}) };
    delete nextOverrides[setName];
    await persistRulePatch(ruleId, { setOverrides: nextOverrides });
    if (selectedOverride?.ruleId === ruleId && selectedOverride.setName === setName) {
      setSelectedOverride(null);
    }
  }

  return (
    <div className="overflow-hidden rounded border border-[var(--color-figma-border)]">
      <div className="flex items-center justify-between bg-[var(--color-figma-bg-secondary)] px-3 py-2">
        <span className="text-[11px] font-medium text-[var(--color-figma-text)]">Lint rules</span>
        <button
          onClick={async () => { await onReset(); onLintRefresh(); }}
          disabled={saving}
          className="text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)] disabled:opacity-50"
          title="Reset to defaults"
        >
          Reset defaults
        </button>
      </div>

      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
        <div className="mb-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          {presetBaseId
            ? `Base preset: ${LINT_PRESETS.find(preset => preset.id === presetBaseId)?.label ?? 'Custom'}`
            : 'Base preset: Custom'}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {LINT_PRESETS.map(preset => {
            const isActive = presetBaseId === preset.id;
            return (
              <div key={preset.id} className="relative">
                <button
                  onClick={() => handleApplyPreset(preset.id)}
                  onMouseEnter={() => setHoveredPreset(preset.id)}
                  onMouseLeave={() => setHoveredPreset(null)}
                  disabled={saving}
                  className="w-full rounded border px-2.5 py-2 text-left transition-colors disabled:opacity-50"
                  style={{
                    borderColor: isActive ? 'var(--color-figma-accent)' : 'var(--color-figma-border)',
                    backgroundColor: 'var(--color-figma-bg-secondary)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{preset.label}</span>
                    {isActive && (
                      <span className="rounded-full bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[9px] font-medium text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">{preset.description}</p>
                </button>
                {hoveredPreset === preset.id && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 shadow-md pointer-events-none">
                    <div className="flex flex-col gap-0.5">
                      {LINT_RULE_REGISTRY.map(rule => {
                        const presetRule = preset.rules[rule.id];
                        return presetRule?.enabled ? (
                          <div key={rule.id} className="flex items-center gap-1">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: SEVERITY_COLORS[presetRule.severity ?? 'warning'] }}
                            />
                            <span className="text-[9px] text-[var(--color-figma-text)]">{rule.label}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
        {LINT_RULE_REGISTRY.map(rule => {
          const ruleConfig = config.lintRules[rule.id] ?? { enabled: false };
          const isExpanded = expandedRule === rule.id;
          const hasOptions = !!rule.options?.length;
          const selectedSetName = selectedOverride?.ruleId === rule.id ? selectedOverride.setName : null;
          const selectedSetOverride = selectedSetName ? ruleConfig.setOverrides?.[selectedSetName] : null;
          const availableSetChoices = sets.filter(setName => !(ruleConfig.setOverrides?.[setName]));
          const currentPathExceptions = ruleConfig.excludePaths ?? [];
          const pathChoices = pathExceptionOptions.filter(option => !currentPathExceptions.includes(option.path));

          return (
            <div key={rule.id} className="px-3 py-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={async () => {
                    await persistRulePatch(rule.id, { enabled: !ruleConfig.enabled });
                  }}
                  disabled={saving}
                  className="relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-50"
                  style={{ backgroundColor: ruleConfig.enabled ? 'var(--color-figma-accent)' : 'var(--color-figma-border)' }}
                  role="switch"
                  aria-checked={ruleConfig.enabled}
                  aria-label={`${rule.label} enabled`}
                >
                  <span
                    className="absolute top-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                    style={{ left: ruleConfig.enabled ? '14px' : '2px' }}
                  />
                </button>

                <button
                  onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                  className="min-w-0 flex-1 text-left"
                  title={rule.description}
                >
                  <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{rule.label}</span>
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">{rule.description}</p>
                  <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    {describeCoverage(ruleConfig, sets.length)}
                    {(ruleConfig.excludePaths?.length ?? 0) > 0 ? ` · ${ruleConfig.excludePaths!.length} token-group exception${ruleConfig.excludePaths!.length === 1 ? '' : 's'}` : ''}
                    {(Object.keys(ruleConfig.setOverrides ?? {}).length) > 0 ? ` · ${Object.keys(ruleConfig.setOverrides ?? {}).length} set exception${Object.keys(ruleConfig.setOverrides ?? {}).length === 1 ? '' : 's'}` : ''}
                  </p>
                </button>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <select
                    value={ruleConfig.severity ?? 'warning'}
                    onChange={async event => {
                      await persistRulePatch(rule.id, { severity: event.target.value as Severity });
                    }}
                    disabled={saving || !ruleConfig.enabled}
                    aria-label="Rule severity"
                    className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] outline-none disabled:opacity-40"
                    style={{ color: ruleConfig.enabled ? SEVERITY_COLORS[ruleConfig.severity ?? 'warning'] : undefined }}
                  >
                    {SEVERITIES.map(severity => (
                      <option key={severity} value={severity}>{severity}</option>
                    ))}
                  </select>
                  <span className="max-w-[120px] text-right text-[9px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                    {SEVERITY_HELP[ruleConfig.severity ?? 'warning']}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className="ml-10 mt-3 space-y-3">
                  {hasOptions && (
                    <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                      <div className="space-y-1.5">
                        {rule.options!.map(option => (
                          <label key={option.key} className="flex items-center gap-2">
                            <span className="w-28 shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">{option.label}</span>
                            <input
                              type={option.type === 'number' ? 'number' : 'text'}
                              value={String(ruleConfig.options?.[option.key] ?? option.placeholder ?? '')}
                              onChange={event => {
                                const nextValue = option.type === 'number' ? Number(event.target.value) : event.target.value;
                                persistRulePatch(rule.id, {
                                  options: {
                                    ...ruleConfig.options,
                                    [option.key]: nextValue,
                                  },
                                });
                              }}
                              disabled={saving}
                              placeholder={option.placeholder}
                              className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-1 text-[10px] text-[var(--color-figma-text)] disabled:opacity-50"
                              {...(option.type === 'number' ? { min: 1, max: 100 } : {})}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                    {currentPathExceptions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {currentPathExceptions.map(path => (
                          <button
                            key={path}
                            onClick={() => handleRemovePathException(rule.id, ruleConfig, path)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-error)] hover:text-[var(--color-figma-error)] disabled:opacity-40"
                            title={`Remove ${path} exception`}
                          >
                            <span>{path}</span>
                            <span aria-hidden="true">×</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No token-group exceptions.</p>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={pathPickerValues[rule.id] ?? ''}
                        onChange={event => setPathPickerValues(current => ({ ...current, [rule.id]: event.target.value }))}
                        disabled={saving || pathChoices.length === 0}
                        aria-label="Token group"
                        className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-1 text-[10px] text-[var(--color-figma-text)] disabled:opacity-40"
                      >
                        <option value="">Pick a token group…</option>
                        {pathChoices.map(option => (
                          <option key={option.path} value={option.path}>
                            {formatPathOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddPathException(rule.id, ruleConfig)}
                        disabled={saving || !pathPickerValues[rule.id]}
                        className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] disabled:opacity-40"
                      >
                        Add exception
                      </button>
                    </div>
                  </div>

                  <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                    {Object.entries(ruleConfig.setOverrides ?? {}).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(ruleConfig.setOverrides ?? {}).map(([setName, override]) => {
                          const isSelected = selectedSetName === setName;
                          return (
                            <button
                              key={setName}
                              onClick={() => setSelectedOverride({ ruleId: rule.id, setName })}
                              className="rounded-full border px-2 py-1 text-[10px] transition-colors"
                              style={{
                                borderColor: isSelected ? 'var(--color-figma-accent)' : 'var(--color-figma-border)',
                                backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-figma-accent) 10%, var(--color-figma-bg))' : 'var(--color-figma-bg)',
                                color: isSelected ? 'var(--color-figma-accent)' : 'var(--color-figma-text)',
                              }}
                            >
                              {describeOverrideChip(ruleConfig, setName, override)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No set exceptions.</p>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={setPickerValues[rule.id] ?? ''}
                        onChange={event => setSetPickerValues(current => ({ ...current, [rule.id]: event.target.value }))}
                        disabled={saving || availableSetChoices.length === 0}
                        aria-label="Token collection"
                        className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-1 text-[10px] text-[var(--color-figma-text)] disabled:opacity-40"
                      >
                        <option value="">Pick a set…</option>
                        {availableSetChoices.map(setName => (
                          <option key={setName} value={setName}>{setName}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddSetException(rule.id, ruleConfig)}
                        disabled={saving || !setPickerValues[rule.id]}
                        className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] disabled:opacity-40"
                      >
                        Add set
                      </button>
                    </div>

                    {selectedSetName && selectedSetOverride && (
                      <div className="mt-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">{selectedSetName}</span>
                          <button
                            onClick={() => handleRemoveSetException(rule.id, ruleConfig, selectedSetName)}
                            disabled={saving}
                            className="text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-error)] disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Enabled</span>
                          <button
                            onClick={() => handleSetExceptionChange(rule.id, ruleConfig, selectedSetName, { enabled: !(selectedSetOverride.enabled ?? ruleConfig.enabled) })}
                            disabled={saving}
                            className="relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-50"
                            style={{ backgroundColor: (selectedSetOverride.enabled ?? ruleConfig.enabled) ? 'var(--color-figma-accent)' : 'var(--color-figma-border)' }}
                            role="switch"
                            aria-checked={selectedSetOverride.enabled ?? ruleConfig.enabled}
                            aria-label={`${selectedSetName} enabled`}
                          >
                            <span
                              className="absolute top-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                              style={{ left: (selectedSetOverride.enabled ?? ruleConfig.enabled) ? '14px' : '2px' }}
                            />
                          </button>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <span className="w-28 shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">Severity</span>
                          <select
                            value={selectedSetOverride.severity ?? ruleConfig.severity ?? 'warning'}
                            onChange={async event => {
                              await handleSetExceptionChange(rule.id, ruleConfig, selectedSetName, { severity: event.target.value as Severity });
                            }}
                            disabled={saving || !(selectedSetOverride.enabled ?? ruleConfig.enabled)}
                            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 text-[10px] text-[var(--color-figma-text)] disabled:opacity-40"
                            style={{ color: SEVERITY_COLORS[selectedSetOverride.severity ?? ruleConfig.severity ?? 'warning'] }}
                          >
                            {SEVERITIES.map(severity => (
                              <option key={severity} value={severity}>{severity}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
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
