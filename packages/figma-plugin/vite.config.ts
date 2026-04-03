import { defineConfig } from 'vite';
import path from 'node:path';

// Shared Vite config used by vitest (and referenced by build.mjs for the UI build).
// The @tokenmanager/core alias points to the TypeScript source so vitest can
// resolve the workspace package without requiring a separate build step.
export default defineConfig({
  resolve: {
    alias: {
      '@tokenmanager/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
