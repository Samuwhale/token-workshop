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
 * so the UI can boot without a real Figma context. When no `serverUrl` query
 * param is provided it serves a checked-in API snapshot captured from a live
 * local TokenManager server, so the browser preview is populated out of the box.
 */

import { startHarnessServer } from './harness-server.mjs';

function parsePortArg(argv) {
  const equalsArg = argv.find((value) => value.startsWith('--port='));
  const rawPort = equalsArg
    ? equalsArg.slice('--port='.length)
    : argv.find((_, index, values) => values[index - 1] === '--port') ?? '3200';
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid --port value "${rawPort}"`);
  }
  return port;
}

const PORT = parsePortArg(process.argv);

try {
  const { origin } = await startHarnessServer({ port: PORT });
  console.log(`\n  Standalone UI harness: ${origin}`);
  console.log(`  Plugin UI (direct):   ${origin}/dist/ui.html`);
  console.log(`\n  The harness mocks Figma postMessage so the UI can boot.`);
  console.log(`  Captured snapshot data is served automatically.`);
  console.log(`  Add ?serverUrl=http://localhost:9400 to point the UI at a live TokenManager server.\n`);
} catch (error) {
  console.error(`\n  Failed to start standalone UI harness — ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exit(1);
}
