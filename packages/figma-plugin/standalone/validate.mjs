#!/usr/bin/env node
/**
 * Headless UI validation for agent workflows.
 *
 * Starts the standalone harness, loads it in a headless browser, waits for
 * the UI to render, captures console errors, and exits with code 0/1.
 *
 * Prerequisites: Playwright must be installed (`npx playwright install chromium`).
 *
 * Usage:
 *   node packages/figma-plugin/standalone/validate.mjs
 *
 * Exit codes:
 *   0 — UI loaded without console errors
 *   1 — Console errors detected or UI failed to load
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3201; // Use different port from dev harness
const TIMEOUT_MS = 15_000;

// --- Start the harness server inline (avoid spawning a subprocess) ---
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
      if (url.pathname === '/' || url.pathname === '/harness') {
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
  // Check if Playwright is available
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.log('Playwright not installed — skipping headless UI validation.');
    console.log('Install with: npx playwright install chromium');
    process.exit(0); // Graceful skip, not a failure
  }

  const server = await startServer();
  const errors = [];
  let browser;

  try {
    browser = await playwright.chromium.launch({ headless: true });
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

    // Filter out benign errors (network failures to :9400 are expected when server isn't running)
    const realErrors = errors.filter((e) =>
      !e.includes('localhost:9400') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError') &&
      !e.includes('net::ERR_')
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
