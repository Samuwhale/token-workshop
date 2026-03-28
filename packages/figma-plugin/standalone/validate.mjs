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

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3201; // Use different port from dev harness
const TIMEOUT_MS = 15_000;

// --- Detect a usable Chromium binary ---
function findChromium() {
  // 1. Playwright-managed browsers (if `npx playwright install chromium` was run)
  try {
    const out = execSync('npx playwright-core install --dry-run chromium 2>/dev/null', { encoding: 'utf-8' });
    // The output includes the install path when already installed
  } catch { /* ignore */ }

  // 2. Well-known system Chrome paths
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
    // Playwright cache (common default path)
    ...findPlaywrightChromePath(),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findPlaywrightChromePath() {
  // Playwright stores browsers in ~/.cache/ms-playwright/ by default
  const cacheDir = path.join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (!fs.existsSync(cacheDir)) return [];
  try {
    const entries = fs.readdirSync(cacheDir).filter(e => e.startsWith('chromium'));
    for (const entry of entries.sort().reverse()) { // newest first
      const macPath = path.join(cacheDir, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
      const linuxPath = path.join(cacheDir, entry, 'chrome-linux', 'chrome');
      if (fs.existsSync(macPath)) return [macPath];
      if (fs.existsSync(linuxPath)) return [linuxPath];
    }
  } catch { /* ignore */ }
  return [];
}

// --- Start the harness server inline ---
const pluginRoot = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      let filePath;
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204); res.end(); return;
      } else if (url.pathname === '/' || url.pathname === '/harness') {
        filePath = path.join(__dirname, 'harness.html');
      } else if (url.pathname.startsWith('/dist/')) {
        filePath = path.join(pluginRoot, url.pathname);
      } else {
        filePath = path.join(__dirname, url.pathname);
        if (!fs.existsSync(filePath)) filePath = path.join(pluginRoot, url.pathname);
      }
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
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

  const server = await startServer();
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

    // Navigate and wait for network to settle
    await page.goto(`http://localhost:${PORT}/`, {
      waitUntil: 'networkidle',
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
    console.error(`\n  UI validation FAILED — ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run();
