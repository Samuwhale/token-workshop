import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Global ignores
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.mjs'] },

  // Base JS rules
  eslint.configs.recommended,

  // TypeScript rules (type-aware linting is too slow for agent loops — use basic rules)
  ...tseslint.configs.recommended,

  // React hooks rules for plugin UI
  {
    files: ['packages/figma-plugin/src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Tuning: keep rules that catch real bugs, disable noisy ones
  {
    rules: {
      // These catch real bugs
      'no-undef': 'off', // TypeScript handles this
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off', // too noisy for rapid dev
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', {
        allowShortCircuit: true,
        allowTernary: true,
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off', // intentional in git-sync sanitizer
      'no-constant-binary-expression': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unreachable-loop': 'error',
    },
  },

  // Plugin sandbox has Figma globals
  {
    files: ['packages/figma-plugin/src/plugin/**/*.ts'],
    languageOptions: {
      globals: {
        figma: 'readonly',
        __html__: 'readonly',
      },
    },
  },
];
