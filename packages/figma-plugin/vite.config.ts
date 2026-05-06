import { defineConfig } from 'vite';
import { testAliases } from './vite.shared.mjs';

// Shared Vite config used by vitest (and referenced by build.mjs for the UI build).
// The @token-workshop/core alias points to the TypeScript source so vitest can
// resolve the workspace package without requiring a separate build step.
export default defineConfig({
  resolve: {
    alias: testAliases,
  },
});
