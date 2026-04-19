#!/usr/bin/env node
/**
 * Headless UI validation for agent workflows.
 *
 * Starts the standalone harness, loads it in a headless browser, waits for
 * the UI to render, captures console errors, and exits with code 0/1.
 *
 * Uses playwright-core (no bundled browser) and detects a system Chromium.
 * Falls back to the Playwright-managed browser path if `npx playwright install
 * chromium` was run previously. Exits 0 (graceful skip) when no browser is found.
 *
 * Usage:
 *   node packages/figma-plugin/standalone/validate.mjs
 *
 * Exit codes:
 *   0 — UI loaded without console errors (or no browser available — graceful skip)
 *   1 — Console errors detected or UI failed to load
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarnessServer } from './harness-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 15_000;

function existingPaths(paths) {
  return paths.filter((candidate) => candidate && fs.existsSync(candidate));
}

// --- Detect a usable Chromium binary ---
function findChromium() {
  const playwrightBrowserPaths = findPlaywrightChromePath();

  // Well-known system Chrome paths plus the Playwright cache if installed.
  const candidates = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    // Linux
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

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findPlaywrightChromePath() {
  const configuredCacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const cacheDirs = configuredCacheRoot
    ? configuredCacheRoot === '0'
      ? [
          path.resolve(__dirname, '..', '..', '..', 'node_modules', 'playwright-core', '.local-browsers'),
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
      // Ignore cache read failures and fall back to the next location.
    }
  }

  return [];
}

async function run() {
  // Check if playwright-core is available
  let playwright;
  try {
    playwright = await import('playwright-core');
  } catch {
    console.log('playwright-core not installed — skipping headless UI validation.');
    process.exit(0);
  }

  // Find a Chromium binary
  const executablePath = findChromium();
  if (!executablePath) {
    console.log('No Chromium browser found — skipping headless UI validation.');
    console.log('Install one with: npx playwright install chromium');
    process.exit(0);
  }

  let server;
  let origin;
  try {
    ({ server, origin } = await startHarnessServer());
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err.code === 'EADDRINUSE' || err.code === 'EPERM')
    ) {
      console.log(
        err.code === 'EADDRINUSE'
          ? 'Unable to reserve a local harness port — skipping headless UI validation.'
          : 'Unable to bind a local harness port in this environment — skipping headless UI validation.'
      );
      process.exit(0);
    }
    throw err;
  }

  const errors = [];
  let browser;

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath,
    });
    const page = await browser.newPage();

    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Collect uncaught exceptions
    page.on('pageerror', (err) => {
      errors.push(`Uncaught: ${err.message}`);
    });

    // Navigate and wait for the page to load. We use 'load' rather than
    // 'networkidle' because the plugin UI polls the TokenManager server
    // (which isn't running here), so networkidle is never reached.
    await page.goto(`${origin}/`, {
      waitUntil: 'load',
      timeout: TIMEOUT_MS,
    });

    // Wait a bit more for React to render and any async effects
    await page.waitForTimeout(2000);

    // Check if the iframe loaded
    const frame = page.frameLocator('#plugin-frame');
    const root = frame.locator('#root');
    const hasRoot = await root.count();

    if (hasRoot === 0) {
      errors.push('Plugin UI #root element not found in iframe');
    }

    // Filter out benign errors:
    // - Network failures to :9400 (server not running)
    // - CORS blocks (expected when server is down)
    // - favicon 404 (browser auto-requests it)
    const realErrors = errors.filter((e) =>
      !e.includes('localhost:9400') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError') &&
      !e.includes('net::ERR_') &&
      !e.includes('CORS policy') &&
      !e.includes('favicon.ico')
    );

    if (realErrors.length > 0) {
      console.error('\n  UI validation FAILED — console errors:\n');
      for (const err of realErrors) {
        console.error(`    - ${err}`);
      }
      console.error('');
      process.exitCode = 1;
    } else {
      console.log(`\n  UI validation PASSED (${errors.length} benign network errors filtered)\n`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`\n  UI validation FAILED — ${message}\n`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run();
