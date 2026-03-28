import * as esbuild from 'esbuild';
import { build as viteBuild, createServer } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Sandbox build (esbuild)
async function buildSandbox() {
  const config = {
    entryPoints: [path.join(__dirname, 'src/plugin/controller.ts')],
    bundle: true,
    outfile: path.join(__dirname, 'dist/code.js'),
    format: 'iife',
    target: 'es6',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  };

  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('Watching sandbox...');
  } else {
    await esbuild.build(config);
    console.log('Sandbox built.');
  }
}

// UI build (Vite)
async function buildUI() {
  const config = {
    root: path.join(__dirname, 'src/ui'),
    plugins: [tailwindcss(), viteSingleFile()],
    build: {
      outDir: path.join(__dirname, 'dist'),
      emptyOutDir: false,
      // Disable minification to avoid TDZ errors from scope hoisting —
      // esbuild minification can collapse module-scope const declarations
      // into a single scope and rename them in ways that break initialization
      // order in the single-file bundle.
      minify: false,
      rollupOptions: {
        input: path.join(__dirname, 'src/ui/index.html'),
        output: {
          // IIFE wraps all modules in a function scope, preventing top-level
          // const/let declarations from different modules from conflicting.
          format: 'iife',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src'),
      },
    },
  };

  if (isWatch) {
    const watcher = await viteBuild({ ...config, build: { ...config.build, watch: {} } });
    console.log('Watching UI...');
  } else {
    await viteBuild(config);
    // Rename index.html to ui.html
    const fs = await import('node:fs/promises');
    const src = path.join(__dirname, 'dist/index.html');
    const dest = path.join(__dirname, 'dist/ui.html');
    try { await fs.rename(src, dest); } catch {}
    console.log('UI built.');
  }
}

await Promise.all([buildSandbox(), buildUI()]);
