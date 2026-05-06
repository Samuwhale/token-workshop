#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');

const { values } = parseArgs({
  args: cliArgs,
  options: {
    dir: { type: 'string', default: 'demo/tokens' },
    'server-port': { type: 'string', default: '9400' },
    'ui-port': { type: 'string', default: '3200' },
    open: { type: 'boolean', default: false },
  },
});

const tokenDir = path.resolve(repoRoot, values.dir);
const serverPort = Number.parseInt(values['server-port'], 10);
const uiPort = Number.parseInt(values['ui-port'], 10);

if (!fs.existsSync(tokenDir)) {
  console.error(`Preview token directory does not exist: ${tokenDir}`);
  process.exit(1);
}

if (Number.isNaN(serverPort) || Number.isNaN(uiPort)) {
  console.error('Ports must be integers.');
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function prefixOutput(stream, label, target) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length === 0) continue;
      target.write(`[${label}] ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      target.write(`[${label}] ${buffer}\n`);
    }
  });
}

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  prefixOutput(child.stdout, label, process.stdout);
  prefixOutput(child.stderr, label, process.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
    console.error(`[${label}] stopped with ${reason}`);
    shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

async function runBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn(
      pnpmBin,
      ['--filter', '@token-workshop/figma-plugin', 'build'],
      { cwd: repoRoot, stdio: 'inherit', env: process.env },
    );

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Initial plugin build failed with exit code ${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

async function assertPortAvailable(port, label, flagName) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
        reject(new Error(`${label} port ${port} is already in use. Stop the existing process or rerun with ${flagName}.`));
        return;
      }
      reject(error);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close((closeError) => {
        if (closeError) reject(closeError);
        else resolve();
      });
    });
  });
}

async function waitFor(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  await delay(150);

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }

  process.exit(exitCode);
}

function maybeOpen(url) {
  if (!values.open) return;

  if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true });
    return;
  }

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true });
    return;
  }

  spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  const serverOrigin = `http://localhost:${serverPort}`;
  const buildHarnessUrl = (pathname = '/') => {
    const url = new URL(`http://localhost:${uiPort}${pathname}`);
    url.searchParams.set('serverUrl', serverOrigin);
    return url.toString();
  };

  console.log(`Using token directory: ${tokenDir}`);
  await assertPortAvailable(serverPort, 'Server', '--server-port <port>');
  await assertPortAvailable(uiPort, 'Harness', '--ui-port <port>');
  console.log('Building the plugin once so the harness has a fresh UI bundle...');
  await runBuild();

  run(pnpmBin, ['--filter', '@token-workshop/figma-plugin', 'dev'], 'plugin');
  run(
    pnpmBin,
    ['--filter', 'token-workshop', 'exec', 'tsx', 'watch', 'bin/cli.ts', '--dir', tokenDir, '--port', String(serverPort)],
    'server',
  );
  run(
    pnpmBin,
    ['--filter', '@token-workshop/figma-plugin', 'standalone', '--', '--port', String(uiPort)],
    'harness',
  );

  const uiHtmlPath = path.join(repoRoot, 'packages/figma-plugin/dist/ui.html');
  await waitFor(async () => fs.existsSync(uiHtmlPath), 15_000, 'plugin UI bundle');
  await waitFor(async () => {
    try {
      const res = await fetch(`http://localhost:${serverPort}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }, 15_000, 'preview server');
  await waitFor(async () => {
    try {
      const res = await fetch(`http://localhost:${uiPort}/`);
      return res.ok;
    } catch {
      return false;
    }
  }, 15_000, 'standalone harness');

  const harnessUrl = buildHarnessUrl('/');
  const directUiUrl = buildHarnessUrl('/dist/ui.html');
  const docsUrl = `http://localhost:${serverPort}/docs`;
  const healthUrl = `http://localhost:${serverPort}/api/health`;

  console.log('');
  console.log('Preview stack is ready.');
  console.log(`Harness:   ${harnessUrl}`);
  console.log(`Plugin UI: ${directUiUrl}`);
  console.log(`Docs:      ${docsUrl}`);
  console.log(`Health:    ${healthUrl}`);
  console.log('');
  console.log('The harness includes a mock Figma bridge and a "Mock Selection" button.');
  console.log('Press Ctrl+C to stop every preview process.');

  maybeOpen(harnessUrl);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await shutdown(1);
}
