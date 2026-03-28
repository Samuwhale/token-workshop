import { useState } from 'react';
import type { LintConfig, LintRuleConfig, Severity } from '../hooks/useLintConfig';

interface RuleMeta {
  id: string;
  label: string;
  description: string;
  options?: OptionMeta[];
}

interface OptionMeta {
  key: string;
  label: string;
  type: 'number' | 'text';
  placeholder?: string;
}

const RULE_DEFS: RuleMeta[] = [
  {
    id: 'no-raw-color',
    label: 'Raw color values',
    description: 'Flag color tokens using raw hex values instead of aliases.',
  },
  {
    id: 'require-description',
    label: 'Require description',
    description: 'Require all tokens to have a $description field.',
  },
  {
    id: 'path-pattern',
    label: 'Naming convention',
    description: 'Validate token path segments against a regex pattern.',
    options: [{ key: 'pattern', label: 'Pattern', type: 'text', placeholder: '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$' }],
  },
  {
    id: 'max-alias-depth',
    label: 'Max alias depth',
    description: 'Prevent alias chains from getting too deep.',
    options: [{ key: 'maxDepth', label: 'Max depth', type: 'number' }],
  },
  {
    id: 'no-duplicate-values',
    label: 'Duplicate values',
    description: 'Detect multiple tokens with identical raw values.',
  },
];

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
  onReset: () => Promise<boolean | undefined>;
  onLintRefresh: () => void;
}

export function LintConfigPanel({ config, saving, onUpdateRule, onReset, onLintRefresh }: LintConfigPanelProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

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
      <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
        {RULE_DEFS.map(rule => {
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
