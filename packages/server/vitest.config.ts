import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@tokenmanager/core': path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 10_000,
  },
});
