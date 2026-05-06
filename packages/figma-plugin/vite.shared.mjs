import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreEntry = path.join(__dirname, '..', 'core', 'src', 'index.ts');

export const testAliases = {
  '@token-workshop/core': coreEntry,
};

export const pluginAliases = {
  ...testAliases,
  '@': path.join(__dirname, 'src'),
};

export function handleUiBuildWarning(warning, defaultHandler) {
  const fromIgnoredDependency =
    typeof warning.id === 'string' &&
    (
      warning.id.includes('/lucide-react/dist/esm/') ||
      warning.id.includes('/@xyflow/react/dist/esm/')
    );

  if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && fromIgnoredDependency) {
    return;
  }

  defaultHandler(warning);
}
