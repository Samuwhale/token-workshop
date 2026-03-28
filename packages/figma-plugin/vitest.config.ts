import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@tokenmanager/core': path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    environment: 'node',
  },
});
