import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Keep Vite's dependency cache inside the worktree so detached worktrees do
  // not reuse stale optimized-dependency metadata from the source checkout.
  cacheDir: path.join(__dirname, 'dist', '.vite'),
  resolve: {
    alias: {
      '@tokenmanager/core': path.join(__dirname, '..', 'core', 'src', 'index.ts'),
    },
    preserveSymlinks: true,
  },
});
