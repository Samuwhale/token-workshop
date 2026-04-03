import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@tokenmanager/core': path.join(__dirname, '..', 'core', 'src', 'index.ts'),
    },
  },
  test: {
    passWithNoTests: true,
  },
});
