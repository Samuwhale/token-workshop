#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const demoTokenDir = path.join(repoRoot, 'demo', 'tokens');
const snapshotFilePath = path.join(
  repoRoot,
  'packages',
  'figma-plugin',
  'standalone',
  'demo-snapshot.json',
);

const { values } = parseArgs({
  options: {
    'server-url': { type: 'string', default: 'http://localhost:9400' },
    operations: { type: 'string', default: '50' },
  },
});

const serverUrl = values['server-url'].replace(/\/+$/u, '');
const operationsLimit = Math.max(
  1,
  Math.min(200, Number.parseInt(values.operations, 10) || 50),
);

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function fetchJson(pathname, init) {
  const response = await fetch(`${serverUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${pathname} failed with ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function ensureDemoTokenDir() {
  await fs.mkdir(demoTokenDir, { recursive: true });
}

async function listTokenFiles(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTokenFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.tokens.json')) {
      files.push(relativePath);
    }
  }

  return files;
}

async function removeEmptyDirectories(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const childDir = path.join(dir, entry.name);
        await removeEmptyDirectories(childDir);
        const remaining = await fs.readdir(childDir);
        if (remaining.length === 0) {
          await fs.rmdir(childDir);
        }
      }),
  );
}

function tokenFilePath(collectionId) {
  return path.join(demoTokenDir, `${collectionId}.tokens.json`);
}

async function clearRemovedTokenFiles(collectionIds) {
  const expected = new Set(collectionIds.map((collectionId) => `${collectionId}.tokens.json`));
  const tokenFiles = await listTokenFiles(demoTokenDir);

  await Promise.all(
    tokenFiles.map(async (relativePath) => {
      if (expected.has(relativePath)) {
        return;
      }
      await fs.unlink(path.join(demoTokenDir, ...relativePath.split('/')));
    }),
  );
  await removeEmptyDirectories(demoTokenDir);
}

async function capture() {
  const [health, collectionsResponse, validationResponse, lintResponse, deprecatedUsageResponse, generators, operationsResponse, pathRenamesResponse, syncStatus, publishRouting, resolvers] = await Promise.all([
    fetchJson('/api/health'),
    fetchJson('/api/collections'),
    fetchJson('/api/tokens/validate', { method: 'POST' }),
    fetchJson('/api/tokens/lint', { method: 'POST' }),
    fetchJson('/api/tokens/deprecated-usage'),
    fetchJson('/api/generators'),
    fetchJson(`/api/operations?limit=${operationsLimit}`),
    fetchJson('/api/operations/path-renames'),
    fetchJson('/api/sync/status'),
    fetchJson('/api/sync/publish-routing'),
    fetchJson('/api/resolvers'),
  ]);

  const collections = Array.isArray(collectionsResponse.collections)
    ? collectionsResponse.collections
    : [];

  const tokenEntries = await Promise.all(
    collections.map(async (collection) => {
      const response = await fetchJson(`/api/tokens/${encodeURIComponent(collection.id)}`);
      return [collection.id, response.tokens ?? {}];
    }),
  );
  const tokensByCollectionId = Object.fromEntries(tokenEntries);

  await ensureDemoTokenDir();
  await clearRemovedTokenFiles(collections.map((collection) => collection.id));

  await fs.writeFile(
    path.join(demoTokenDir, '$collections.json'),
    prettyJson({
      $collections: collections.map(({ tokenCount, ...collection }) => collection),
    }),
  );

  await Promise.all(
    tokenEntries.map(async ([collectionId, tokens]) => {
      const targetPath = tokenFilePath(collectionId);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, prettyJson(tokens));
    }),
  );

  const snapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    sourceServerUrl: serverUrl,
    health,
    collectionsResponse,
    tokensByCollectionId,
    validationResponse,
    lintResponse,
    deprecatedUsageResponse,
    generators,
    operationsResponse,
    pathRenamesResponse,
    syncStatus,
    publishRouting,
    resolvers,
  };

  await fs.writeFile(snapshotFilePath, prettyJson(snapshot));

  console.log(`Captured preview snapshot from ${serverUrl}`);
  console.log(`Collections: ${collections.length}`);
  console.log(`Snapshot: ${snapshotFilePath}`);
}

capture().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
