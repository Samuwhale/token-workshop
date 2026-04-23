#!/usr/bin/env node
/**
 * Headless validation for the standalone preview path.
 *
 * Starts the real TokenManager server against the demo workspace, starts the
 * standalone harness, loads the harness in a headless browser, and fails if
 * the browser preview cannot reach the server or still renders as offline.
 *
 * Uses playwright-core (no bundled browser) and detects a system Chromium.
 * Falls back to the Playwright-managed browser path if `npx playwright install
 * chromium` was run previously. Exits 0 (graceful skip) when no browser is found.
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { startHarnessServer } from './harness-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const demoTokenDir = path.join(repoRoot, 'demo', 'tokens');
const collectionsFilePath = path.join(demoTokenDir, '$collections.json');
const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const TIMEOUT_MS = 15_000;

function existingPaths(paths) {
  return paths.filter((candidate) => candidate && fs.existsSync(candidate));
}

function findChromium() {
  const playwrightBrowserPaths = findPlaywrightChromePath();
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    ...existingPaths([
      process.env.CHROMIUM_PATH,
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    ]),
    ...playwrightBrowserPaths,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findPlaywrightChromePath() {
  const configuredCacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const cacheDirs = configuredCacheRoot
    ? configuredCacheRoot === '0'
      ? [
          path.resolve(repoRoot, 'node_modules', 'playwright-core', '.local-browsers'),
          path.resolve(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers'),
        ]
      : [configuredCacheRoot]
    : [
        path.join(process.env.HOME || '', '.cache', 'ms-playwright'),
        path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright'),
      ];

  for (const cacheDir of cacheDirs) {
    if (!fs.existsSync(cacheDir)) {
      continue;
    }

    try {
      const entries = fs.readdirSync(cacheDir).filter((entry) => entry.startsWith('chromium'));
      for (const entry of entries.sort().reverse()) {
        const basePath = path.join(cacheDir, entry);
        const candidates = [
          path.join(basePath, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          path.join(basePath, 'chrome-linux', 'chrome'),
          path.join(basePath, 'chrome-win', 'chrome.exe'),
        ];
        const resolved = existingPaths(candidates);
        if (resolved.length > 0) {
          return resolved;
        }
      }
    } catch {
      // Ignore cache read failures and continue checking the next location.
    }
  }

  return [];
}

function getInitialCollectionId() {
  const raw = fs.readFileSync(collectionsFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  const collectionId = parsed?.$collections?.[0]?.id;
  if (typeof collectionId !== 'string' || collectionId.length === 0) {
    throw new Error(`Demo collections file does not define a first collection id: ${collectionsFilePath}`);
  }
  return collectionId;
}

function formatRequestFailure(request) {
  const failure = request.failure();
  const reason = failure?.errorText ?? 'unknown network failure';
  return `${request.method()} ${request.url()} failed: ${reason}`;
}

function isExpectedAbort(request) {
  const failure = request.failure();
  return failure?.errorText === 'net::ERR_ABORTED';
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a local port.')));
        return;
      }

      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForServer(serverUrl) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TIMEOUT_MS) {
    try {
      const response = await fetch(`${serverUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for preview server at ${serverUrl}`);
}

function startPreviewServer(port) {
  const serverLogs = [];
  const child = spawn(
    pnpmBin,
    [
      '--filter',
      '@tokenmanager/server',
      'exec',
      'tsx',
      'bin/cli.ts',
      '--dir',
      demoTokenDir,
      '--port',
      String(port),
    ],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  );

  const capture = (stream, label) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        serverLogs.push(`[${label}] ${line}`);
      }
    });
    stream.on('end', () => {
      if (buffer.trim().length > 0) {
        serverLogs.push(`[${label}] ${buffer}`);
      }
    });
  };

  capture(child.stdout, 'stdout');
  capture(child.stderr, 'stderr');

  return { child, serverLogs };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  await delay(150);

  if (child.exitCode === null && !child.killed) {
    child.kill('SIGKILL');
  }
}

function buildHarnessUrl(origin, serverUrl) {
  const harnessUrl = new URL(`${origin}/`);
  harnessUrl.searchParams.set('serverUrl', serverUrl);
  return harnessUrl.toString();
}

function printServerLogs(serverLogs) {
  if (serverLogs.length === 0) {
    return;
  }

  console.error('  Preview server logs:\n');
  for (const line of serverLogs.slice(-20)) {
    console.error(`    ${line}`);
  }
  console.error('');
}

async function run() {
  let playwright;
  try {
    playwright = await import('playwright-core');
  } catch {
    console.log('playwright-core not installed — skipping headless UI validation.');
    process.exit(0);
  }

  const executablePath = findChromium();
  if (!executablePath) {
    console.log('No Chromium browser found — skipping headless UI validation.');
    console.log('Install one with: npx playwright install chromium');
    process.exit(0);
  }

  const initialCollectionId = getInitialCollectionId();
  const errors = [];
  let browser;
  let harnessServer;
  let harnessOrigin;
  let previewServerChild;
  let previewServerLogs = [];

  try {
    const serverPort = await reservePort();
    const serverUrl = `http://localhost:${serverPort}`;
    const previewServer = startPreviewServer(serverPort);
    previewServerChild = previewServer.child;
    previewServerLogs = previewServer.serverLogs;

    await waitForServer(serverUrl);
    ({ server: harnessServer, origin: harnessOrigin } = await startHarnessServer());

    browser = await playwright.chromium.launch({
      headless: true,
      executablePath,
    });

    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`Uncaught: ${err.message}`);
    });
    page.on('requestfailed', (request) => {
      if (isExpectedAbort(request)) {
        return;
      }
      errors.push(formatRequestFailure(request));
    });

    const healthResponsePromise = page.waitForResponse(
      (response) => response.url() === `${serverUrl}/api/health` && response.ok(),
      { timeout: TIMEOUT_MS },
    );
    const collectionsResponsePromise = page.waitForResponse(
      (response) => response.url() === `${serverUrl}/api/collections` && response.ok(),
      { timeout: TIMEOUT_MS },
    );
    const tokensResponsePromise = page.waitForResponse(
      (response) => response.url() === `${serverUrl}/api/tokens/${encodeURIComponent(initialCollectionId)}` && response.ok(),
      { timeout: TIMEOUT_MS },
    );

    await page.goto(buildHarnessUrl(harnessOrigin, serverUrl), {
      waitUntil: 'load',
      timeout: TIMEOUT_MS,
    });

    await Promise.all([
      healthResponsePromise,
      collectionsResponsePromise,
      tokensResponsePromise,
    ]);

    const frame = page.frameLocator('#plugin-frame');
    await frame.locator('#root').waitFor({ state: 'attached', timeout: TIMEOUT_MS });
    await page.waitForTimeout(2000);

    const offlineBanner = frame.getByText('Server offline', { exact: true });
    if (await offlineBanner.isVisible()) {
      errors.push('Standalone harness still shows "Server offline" after initial data load.');
    }

    if (errors.length > 0) {
      console.error('\n  UI validation FAILED — browser preview errors:\n');
      for (const error of errors) {
        console.error(`    - ${error}`);
      }
      console.error('');
      printServerLogs(previewServerLogs);
      process.exitCode = 1;
      return;
    }

    console.log('\n  UI validation PASSED — connected preview loaded demo data successfully.\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`\n  UI validation FAILED — ${message}\n`);
    printServerLogs(previewServerLogs);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    if (harnessServer) {
      await new Promise((resolve) => harnessServer.close(resolve));
    }
    await stopChild(previewServerChild);
  }
}

run();
