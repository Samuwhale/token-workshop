/**
 * Shared lint rule registry — single source of truth for rule metadata used by
 * LintConfigPanel (config UI) and AnalyticsPanel (violation display).
 */

export interface LintRuleOptionMeta {
  key: string;
  label: string;
  type: 'number' | 'text';
  placeholder?: string;
}

export interface LintRuleMeta {
  id: string;
  /** Short human-readable name used in both the config panel and analytics panel */
  label: string;
  /** Longer description shown in the config UI */
  description: string;
  /** Actionable tip shown next to violations in the analytics panel */
  tip: string;
  options?: LintRuleOptionMeta[];
}

export const LINT_RULE_REGISTRY: LintRuleMeta[] = [
  {
    id: 'no-raw-color',
    label: 'Raw color value',
    description: 'Flag color tokens using raw hex values instead of aliases.',
    tip: 'Extract the color to a primitive token and reference it',
  },
  {
    id: 'require-description',
    label: 'Missing description',
    description: 'Require all tokens to have a $description field.',
    tip: 'Add a $description to improve discoverability',
  },
  {
    id: 'path-pattern',
    label: 'Naming convention',
    description: 'Validate token path segments against a regex pattern.',
    tip: 'Rename the token to match the configured pattern',
    options: [
      { key: 'pattern', label: 'Pattern', type: 'text', placeholder: '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$' },
    ],
  },
  {
    id: 'max-alias-depth',
    label: 'Deep reference chain',
    description: 'Prevent alias chains from getting too deep.',
    tip: 'Shorten the chain by pointing closer to the source token',
    options: [{ key: 'maxDepth', label: 'Max depth', type: 'number' }],
  },
  {
    id: 'no-duplicate-values',
    label: 'Duplicate value',
    description: 'Detect multiple tokens with identical raw values.',
    tip: 'Consider extracting a shared token',
  },
];

/** Quick lookup by rule id */
export const LINT_RULE_BY_ID: Record<string, LintRuleMeta> = Object.fromEntries(
  LINT_RULE_REGISTRY.map(r => [r.id, r]),
);
