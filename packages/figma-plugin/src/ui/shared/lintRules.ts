/**
 * Shared lint rule registry — single source of truth for rule metadata used by
 * the lint config UI and the library review surfaces.
 */

export interface LintRuleOptionMeta {
  key: string;
  label: string;
  type: 'number' | 'text';
  placeholder?: string;
}

export interface LintRuleMeta {
  id: string;
  /** Short human-readable name used in the config UI and review surfaces */
  label: string;
  /** Longer description shown in the config UI */
  description: string;
  /** Actionable tip shown next to surfaced violations */
  tip: string;
  options?: LintRuleOptionMeta[];
}

export const LINT_RULE_REGISTRY: LintRuleMeta[] = [
  {
    id: 'no-raw-color',
    label: 'Raw color value',
    description: 'Flag color tokens using raw hex values instead of references.',
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
    description: 'Prevent reference chains from getting too deep.',
    tip: 'Shorten the chain by pointing closer to the source token',
    options: [{ key: 'maxDepth', label: 'Max depth', type: 'number' }],
  },
  {
    id: 'references-deprecated-token',
    label: 'Deprecated token in use',
    description: 'Flag tokens whose reference chain still resolves through a deprecated token.',
    tip: 'Replace active references with a non-deprecated successor token',
  },
  {
    id: 'no-duplicate-values',
    label: 'Duplicate value',
    description: 'Detect multiple tokens with identical raw values.',
    tip: 'Consider extracting a shared token',
  },
  {
    id: 'alias-opportunity',
    label: 'Suggested reference',
    description: 'Detect raw-value groups that can be replaced by one shared primitive token.',
    tip: 'Promote the group into one shared token',
  },
  {
    id: 'no-hardcoded-dimensions',
    label: 'Hardcoded dimension',
    description: 'Flag dimension and number tokens using raw values instead of references. Promotes reuse of spacing/sizing scales.',
    tip: 'Extract the value to a primitive scale token and reference it',
  },
  {
    id: 'require-alias-for-semantic-tokens',
    label: 'Raw semantic token',
    description: 'Require tokens in semantic groups (e.g. "semantic", "component", "alias") to reference primitives instead of using raw values.',
    tip: 'Replace the raw value with a reference to a primitive token',
    options: [
      { key: 'semanticPrefixes', label: 'Semantic prefixes (comma-separated)', type: 'text', placeholder: 'semantic,component,alias' },
    ],
  },
  {
    id: 'enforce-token-type-consistency',
    label: 'Mixed types in group',
    description: 'Warn when tokens in the same group have inconsistent $type values. Catches accidental type mismatches.',
    tip: 'Change the token type to match the rest of the group',
    options: [
      { key: 'minGroupSize', label: 'Min group size', type: 'number' },
    ],
  },
];

/** Quick lookup by rule id */
export const LINT_RULE_BY_ID: Record<string, LintRuleMeta> = Object.fromEntries(
  LINT_RULE_REGISTRY.map(r => [r.id, r]),
);

// ---------------------------------------------------------------------------
// Presets — one-click starting configurations for LintConfigPanel
// ---------------------------------------------------------------------------

export interface LintPreset {
  id: string;
  label: string;
  description: string;
  /** Partial rule config keyed by rule id; omitted rules are disabled */
  rules: Record<string, { enabled: boolean; severity?: 'error' | 'warning' | 'info'; options?: Record<string, unknown> }>;
}

/** Build a full LintConfig (all rules present) from a preset */
export function buildLintConfigFromPreset(preset: LintPreset): { lintRules: Record<string, { enabled: boolean; severity?: 'error' | 'warning' | 'info'; options?: Record<string, unknown> }> } {
  const lintRules: Record<string, { enabled: boolean; severity?: 'error' | 'warning' | 'info'; options?: Record<string, unknown> }> = {};
  for (const rule of LINT_RULE_REGISTRY) {
    lintRules[rule.id] = preset.rules[rule.id] ?? { enabled: false };
  }
  return { lintRules };
}

export const LINT_PRESETS: LintPreset[] = [
  {
    id: 'strict',
    label: 'Strict',
    description: 'All rules enabled with error severity and tight thresholds — best for mature, production design systems.',
    rules: {
      'no-raw-color':                        { enabled: true, severity: 'error' },
      'require-description':                 { enabled: true, severity: 'error' },
      'path-pattern':                        { enabled: true, severity: 'error', options: { pattern: '^[a-z][a-z0-9]*([.-][a-z0-9]+)*$' } },
      'max-alias-depth':                     { enabled: true, severity: 'error', options: { maxDepth: 2 } },
      'references-deprecated-token':         { enabled: true, severity: 'error' },
      'no-duplicate-values':                 { enabled: true, severity: 'error' },
      'alias-opportunity':                   { enabled: true, severity: 'warning' },
      'no-hardcoded-dimensions':             { enabled: true, severity: 'error' },
      'require-alias-for-semantic-tokens':   { enabled: true, severity: 'error' },
      'enforce-token-type-consistency':      { enabled: true, severity: 'error', options: { minGroupSize: 2 } },
    },
  },
  {
    id: 'recommended',
    label: 'Recommended',
    description: 'Common quality rules with warning severity — a balanced starting point for most token libraries.',
    rules: {
      'no-raw-color':                        { enabled: true, severity: 'warning' },
      'require-description':                 { enabled: false },
      'path-pattern':                        { enabled: false },
      'max-alias-depth':                     { enabled: true, severity: 'warning', options: { maxDepth: 3 } },
      'references-deprecated-token':         { enabled: true, severity: 'warning' },
      'no-duplicate-values':                 { enabled: true, severity: 'warning' },
      'alias-opportunity':                   { enabled: true, severity: 'info' },
      'no-hardcoded-dimensions':             { enabled: true, severity: 'warning' },
      'require-alias-for-semantic-tokens':   { enabled: true, severity: 'warning' },
      'enforce-token-type-consistency':      { enabled: true, severity: 'warning', options: { minGroupSize: 2 } },
    },
  },
  {
    id: 'permissive',
    label: 'Permissive',
    description: 'Structural rules only with info severity — minimal friction, useful early in a project.',
    rules: {
      'no-raw-color':                        { enabled: false },
      'require-description':                 { enabled: false },
      'path-pattern':                        { enabled: false },
      'max-alias-depth':                     { enabled: true, severity: 'info', options: { maxDepth: 5 } },
      'references-deprecated-token':         { enabled: false },
      'no-duplicate-values':                 { enabled: false },
      'alias-opportunity':                   { enabled: true, severity: 'info' },
      'no-hardcoded-dimensions':             { enabled: false },
      'require-alias-for-semantic-tokens':   { enabled: false },
      'enforce-token-type-consistency':      { enabled: false },
    },
  },
];
