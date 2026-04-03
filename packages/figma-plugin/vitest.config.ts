import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      '@tokenmanager/core': path.join(__dirname, '..', 'core', 'src', 'index.ts'),
      '@': path.join(__dirname, 'src'),
    },
  },
};
