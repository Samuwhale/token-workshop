#!/usr/bin/env node
/**
 * Standalone dev server for the TokenManager plugin UI.
 *
 * Serves the built plugin UI outside of Figma so agents (and humans) can:
 *   - See the rendered UI in a browser
 *   - Check the console for runtime errors
 *   - Use Playwright / Chrome DevTools MCP for automated validation
 *
 * Usage:
 *   node packages/figma-plugin/standalone/serve.mjs [--port 3200]
 *
 * The harness intercepts Figma postMessage calls and returns canned responses
 * so the UI can boot without a real Figma context. The local server on :9400
 * is still used for token data (if running).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') ?? '3200', 10);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  let filePath;

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204); res.end(); return;
  } else if (url.pathname === '/' || url.pathname === '/harness') {
    filePath = path.join(__dirname, 'harness.html');
  } else if (url.pathname === '/dist/ui.html' || url.pathname.startsWith('/dist/')) {
    filePath = path.join(pluginRoot, url.pathname);
  } else {
    // Try standalone dir, then plugin root
    filePath = path.join(__dirname, url.pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(pluginRoot, url.pathname);
    }
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Standalone UI harness: http://${HOST}:${PORT}`);
  console.log(`  Plugin UI (direct):   http://${HOST}:${PORT}/dist/ui.html`);
  console.log(`\n  The harness mocks Figma postMessage so the UI can boot.`);
  console.log(`  Make sure the local server is running on :9400 for token data.\n`);
});
