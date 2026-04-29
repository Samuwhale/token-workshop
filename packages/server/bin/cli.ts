#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { startServer } from '../src/index.js';

function parsePort(rawPort: string | undefined): number {
  if (!rawPort || !/^\d+$/.test(rawPort)) {
    throw new Error(`Invalid --port value "${rawPort}". Use an integer from 1 to 65535.`);
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid --port value "${rawPort}". Use an integer from 1 to 65535.`);
  }
  return port;
}

function readCliConfig() {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string', default: './tokens' },
      port: { type: 'string', default: '9400' },
      host: { type: 'string', default: 'localhost' },
    },
  });

  return {
    tokenDir: path.resolve(values.dir ?? './tokens'),
    port: parsePort(values.port),
    host: values.host ?? 'localhost',
  };
}

try {
  await startServer(readCliConfig());
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to start TokenManager server: ${message}`);
  process.exitCode = 1;
}
