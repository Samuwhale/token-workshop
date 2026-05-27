#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer } from '../src/index.js';

const require = createRequire(import.meta.url);

function readPackageVersion(): string {
  for (const packagePath of ['../package.json', '../../package.json']) {
    try {
      const pkg = require(packagePath) as { version?: unknown };
      if (typeof pkg.version === 'string') {
        return pkg.version;
      }
    } catch {
      // Source runs from bin/, bundled output runs from dist/bin/.
    }
  }
  return '0.0.0';
}

function printHelp(): void {
  console.log(`Token Workshop ${readPackageVersion()}

Usage:
  token-workshop [options]

Options:
  --dir <path>       Token workspace directory (default: ./tokens)
  --port <number>   Server port, 1-65535 (default: 9400)
  --host <host>     Host to bind (default: localhost)
  --help            Show this help
  --version         Show the CLI version`);
}

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
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.help) {
    printHelp();
    return null;
  }

  if (values.version) {
    console.log(readPackageVersion());
    return null;
  }

  return {
    tokenDir: path.resolve(values.dir ?? './tokens'),
    port: parsePort(values.port),
    host: values.host ?? 'localhost',
  };
}

try {
  const config = readCliConfig();
  if (config) {
    await startServer(config);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to start Token Workshop server: ${message}`);
  process.exitCode = 1;
}
