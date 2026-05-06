import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await fs.rm(path.join(__dirname, 'dist'), { recursive: true, force: true });

await esbuild.build({
  entryPoints: [path.join(__dirname, 'bin', 'cli.ts')],
  outfile: path.join(__dirname, 'dist', 'bin', 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external: [
    '@fastify/cors',
    'chokidar',
    'fastify',
    'simple-git',
    'style-dictionary',
  ],
  plugins: [
    {
      name: 'token-workshop-core-alias',
      setup(build) {
        build.onResolve({ filter: /^@token-workshop\/core$/ }, () => ({
          path: path.join(__dirname, '..', 'core', 'src', 'index.ts'),
        }));
      },
    },
  ],
});

await fs.chmod(path.join(__dirname, 'dist', 'bin', 'cli.js'), 0o755);
