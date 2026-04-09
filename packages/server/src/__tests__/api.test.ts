import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../index';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let app: FastifyInstance;
let tokenDir: string;

beforeAll(async () => {
  // Create a temp directory with a minimal token set
  tokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-test-'));
  fs.writeFileSync(
    path.join(tokenDir, 'test-set.tokens.json'),
    JSON.stringify({
      color: {
        red: { $value: '#ff0000', $type: 'color' },
        blue: { $value: '#0000ff', $type: 'color' },
      },
      spacing: {
        sm: { $value: '4px', $type: 'dimension' },
      },
    }),
  );

  app = await startServer({
    tokenDir,
    port: 0, // random available port
    host: '127.0.0.1',
  });
});

afterAll(async () => {
  if (app) await app.close();
  if (tokenDir) fs.rmSync(tokenDir, { recursive: true, force: true });
});

function url(path: string) {
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('Server not started');
  return `http://127.0.0.1:${addr.port}${path}`;
}

async function createSet(name: string, tokens: Record<string, unknown> = {}) {
  const res = await fetch(url('/api/sets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tokens }),
  });
  expect(res.status).toBe(201);
}

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await fetch(url('/api/health'));
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('timestamp');
  });
});

describe('GET /api/sets', () => {
  it('lists available token sets', async () => {
    const res = await fetch(url('/api/sets'));
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.sets).toContain('test-set');
  });
});

describe('GET /api/sets/:name', () => {
  it('returns tokens for an existing set', async () => {
    const res = await fetch(url('/api/sets/test-set'));
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.name).toBe('test-set');
    expect(body.tokens).toBeDefined();
    expect(body.tokens.color).toBeDefined();
  });

  it('returns 404 for missing set', async () => {
    const res = await fetch(url('/api/sets/nonexistent'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/tokens/lint', () => {
  it('lints a token set', async () => {
    const res = await fetch(url('/api/tokens/lint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set: 'test-set' }),
    });
    expect(res.ok).toBe(true);
  });
});

describe('POST /api/tokens/:set/bulk-rename', () => {
  async function createSet(name: string, tokens: Record<string, unknown>) {
    const res = await fetch(url('/api/sets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tokens }),
    });
    expect(res.status).toBe(201);
  }

  it('rejects rename that would create a circular alias reference', async () => {
    // Set1: alpha = {beta} (alias), Set2: beta = #green (literal)
    // Rename "beta" → "alpha" in set2:
    //   set2: beta removed, alpha = #green added
    //   alias update: set1's {beta} → {alpha}
    //   Result: set1: alpha = {alpha} — self-referencing cycle!
    const set1Name = 'cycle-set1';
    const set2Name = 'cycle-set2';
    await createSet(set1Name, {
      alpha: { $value: '{beta}', $type: 'color' },
    });
    await createSet(set2Name, {
      beta: { $value: '#00ff00', $type: 'color' },
    });

    const renameRes = await fetch(url(`/api/tokens/${set2Name}/bulk-rename`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ find: 'beta', replace: 'alpha' }),
    });

    expect(renameRes.ok).toBe(false);
    expect(renameRes.status).toBe(409);
    const body = await renameRes.json();
    expect(body.error).toContain('Circular reference');

    // Verify revert: set1 should still have alpha = {beta}
    const set1Res = await fetch(url(`/api/tokens/${set1Name}`));
    const set1Body = await set1Res.json();
    expect(set1Body.tokens.alpha.$value).toBe('{beta}');

    // set2 should still have beta, not alpha
    const set2Res = await fetch(url(`/api/tokens/${set2Name}`));
    const set2Body = await set2Res.json();
    expect(set2Body.tokens.beta).toBeDefined();
    expect(set2Body.tokens.alpha).toBeUndefined();

    // Cleanup
    fs.rmSync(path.join(tokenDir, `${set1Name}.tokens.json`), { force: true });
    fs.rmSync(path.join(tokenDir, `${set2Name}.tokens.json`), { force: true });
  });

  it('succeeds for renames that do not create cycles', async () => {
    const setName = 'rename-ok-test';
    await createSet(setName, {
      old: { $value: '#ff0000', $type: 'color' },
      ref: { $value: '{old}', $type: 'color' },
    });

    const renameRes = await fetch(url(`/api/tokens/${setName}/bulk-rename`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ find: 'old', replace: 'new' }),
    });

    expect(renameRes.ok).toBe(true);
    const body = await renameRes.json();
    expect(body.renamed).toBe(1);
    expect(body.aliasesUpdated).toBe(1);

    // Verify the alias was updated
    const getRes = await fetch(url(`/api/tokens/${setName}`));
    const getBody = await getRes.json();
    expect(getBody.tokens.new.$value).toBe('#ff0000');
    expect(getBody.tokens.ref.$value).toBe('{new}');

    // Cleanup
    fs.rmSync(path.join(tokenDir, `${setName}.tokens.json`), { force: true });
  });
});

describe('POST /api/themes/dimensions/:id/duplicate', () => {
  it('duplicates a dimension and all of its options in one response', async () => {
    const createDimRes = await fetch(url('/api/themes/dimensions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'mode', name: 'Mode' }),
    });
    expect(createDimRes.status).toBe(201);

    const lightSets = { 'test-set': 'source' };
    const darkSets = { 'test-set': 'enabled' };

    const lightRes = await fetch(url('/api/themes/dimensions/mode/options'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Light', sets: lightSets }),
    });
    expect(lightRes.status).toBe(201);

    const darkRes = await fetch(url('/api/themes/dimensions/mode/options'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dark', sets: darkSets }),
    });
    expect(darkRes.status).toBe(201);

    const duplicateRes = await fetch(url('/api/themes/dimensions/mode/duplicate'), {
      method: 'POST',
    });
    expect(duplicateRes.status).toBe(201);

    const duplicateBody = await duplicateRes.json();
    expect(duplicateBody.dimension).toEqual({
      id: 'mode-copy',
      name: 'Mode Copy',
      options: [
        { name: 'Light', sets: lightSets },
        { name: 'Dark', sets: darkSets },
      ],
    });

    const themesRes = await fetch(url('/api/themes'));
    expect(themesRes.ok).toBe(true);
    const themesBody = await themesRes.json();
    expect(themesBody.dimensions).toEqual([
      {
        id: 'mode',
        name: 'Mode',
        options: [
          { name: 'Light', sets: lightSets },
          { name: 'Dark', sets: darkSets },
        ],
      },
      {
        id: 'mode-copy',
        name: 'Mode Copy',
        options: [
          { name: 'Light', sets: lightSets },
          { name: 'Dark', sets: darkSets },
        ],
      },
    ]);

    fs.rmSync(path.join(tokenDir, '$themes.json'), { force: true });
  });
});

describe('PATCH /api/sets/:name/metadata', () => {
  it('updates set metadata atomically, exposes metadata changes in operations, and rolls back without clobbering newer fields', async () => {
    interface MetadataOperationSummary {
      id: string;
      type: string;
      setName: string;
      metadata?: {
        kind?: string;
        name?: string;
        changes?: Array<{
          field: 'description' | 'collectionName' | 'modeName';
          label: 'Description' | 'Collection' | 'Mode';
          before?: string;
          after?: string;
        }>;
      };
    }

    const setName = 'metadata-history-set';
    const createRes = await fetch(url('/api/sets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: setName }),
    });
    expect(createRes.status).toBe(201);

    const firstPatchRes = await fetch(url(`/api/sets/${encodeURIComponent(setName)}/metadata`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ figmaCollection: 'Primitives', figmaMode: 'Light' }),
    });
    expect(firstPatchRes.ok).toBe(true);
    expect(await firstPatchRes.json()).toMatchObject({
      ok: true,
      name: setName,
      collectionName: 'Primitives',
      modeName: 'Light',
      changed: true,
    });

    const secondPatchRes = await fetch(url(`/api/sets/${encodeURIComponent(setName)}/metadata`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Semantic aliases' }),
    });
    expect(secondPatchRes.ok).toBe(true);
    expect(await secondPatchRes.json()).toMatchObject({
      ok: true,
      name: setName,
      description: 'Semantic aliases',
      changed: true,
    });

    const setsBeforeRollbackRes = await fetch(url('/api/sets'));
    expect(setsBeforeRollbackRes.ok).toBe(true);
    const setsBeforeRollback = await setsBeforeRollbackRes.json();
    expect(setsBeforeRollback.descriptions[setName]).toBe('Semantic aliases');
    expect(setsBeforeRollback.collectionNames[setName]).toBe('Primitives');
    expect(setsBeforeRollback.modeNames[setName]).toBe('Light');

    const operationsRes = await fetch(url('/api/operations?limit=50'));
    expect(operationsRes.ok).toBe(true);
    const operationsBody = await operationsRes.json() as { data: MetadataOperationSummary[] };
    const metadataOps = operationsBody.data.filter((entry) => entry.type === 'set-metadata' && entry.setName === setName);
    expect(metadataOps).toHaveLength(2);
    const collectionOp = metadataOps.find((entry) =>
      Array.isArray(entry.metadata?.changes) &&
      entry.metadata.changes.some((change) => change.field === 'collectionName')
    );
    expect(collectionOp).toBeDefined();
    if (!collectionOp) {
      throw new Error('Expected metadata operation for collectionName change');
    }
    expect(collectionOp.metadata).toMatchObject({
      kind: 'set-metadata',
      name: setName,
      changes: [
        { field: 'collectionName', label: 'Collection', after: 'Primitives' },
        { field: 'modeName', label: 'Mode', after: 'Light' },
      ],
    });

    const diffRes = await fetch(url(`/api/operations/${collectionOp.id}/diff`));
    expect(diffRes.ok).toBe(true);
    expect(await diffRes.json()).toMatchObject({
      diffs: [],
      metadataChanges: [
        { field: 'collectionName', label: 'Collection', before: 'Primitives' },
        { field: 'modeName', label: 'Mode', before: 'Light' },
      ],
    });

    const rollbackRes = await fetch(url(`/api/operations/${collectionOp.id}/rollback`), {
      method: 'POST',
    });
    expect(rollbackRes.ok).toBe(true);

    const setsAfterRollbackRes = await fetch(url('/api/sets'));
    expect(setsAfterRollbackRes.ok).toBe(true);
    const setsAfterRollback = await setsAfterRollbackRes.json();
    expect(setsAfterRollback.descriptions[setName]).toBe('Semantic aliases');
    expect(setsAfterRollback.collectionNames[setName]).toBeUndefined();
    expect(setsAfterRollback.modeNames[setName]).toBeUndefined();
  });

  it('does not create an operation for a no-op metadata save and does not clear omitted fields', async () => {
    const setName = 'metadata-noop-set';
    const createRes = await fetch(url('/api/sets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: setName }),
    });
    expect(createRes.status).toBe(201);

    const initialPatchRes = await fetch(url(`/api/sets/${encodeURIComponent(setName)}/metadata`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Base docs', figmaCollection: 'Primitives', figmaMode: 'Dark' }),
    });
    expect(initialPatchRes.ok).toBe(true);

    const beforeNoopRes = await fetch(url('/api/operations?limit=50'));
    expect(beforeNoopRes.ok).toBe(true);
    const beforeNoopBody = await beforeNoopRes.json();

    const noopPatchRes = await fetch(url(`/api/sets/${encodeURIComponent(setName)}/metadata`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Base docs' }),
    });
    expect(noopPatchRes.ok).toBe(true);
    expect(await noopPatchRes.json()).toMatchObject({
      ok: true,
      name: setName,
      description: 'Base docs',
      collectionName: 'Primitives',
      modeName: 'Dark',
      changed: false,
    });

    const afterNoopRes = await fetch(url('/api/operations?limit=50'));
    expect(afterNoopRes.ok).toBe(true);
    const afterNoopBody = await afterNoopRes.json();
    expect(afterNoopBody.total).toBe(beforeNoopBody.total);

    const setsRes = await fetch(url('/api/sets'));
    expect(setsRes.ok).toBe(true);
    const setsBody = await setsRes.json();
    expect(setsBody.descriptions[setName]).toBe('Base docs');
    expect(setsBody.collectionNames[setName]).toBe('Primitives');
    expect(setsBody.modeNames[setName]).toBe('Dark');
  });
});

describe('GET /api/operations', () => {
  it('pages past 50 entries after many unrelated operations are recorded', async () => {
    const prefix = 'operations-page-set';
    const createdSetNames: string[] = [];

    for (let index = 1; index <= 55; index += 1) {
      const setName = `${prefix}-${String(index).padStart(2, '0')}`;
      createdSetNames.push(setName);
      await createSet(setName);
    }

    const firstPageRes = await fetch(url('/api/operations?limit=50&offset=0'));
    expect(firstPageRes.ok).toBe(true);
    const firstPageBody = await firstPageRes.json() as {
      data: Array<{ type: string; setName?: string }>;
      hasMore: boolean;
      limit: number;
      offset: number;
    };
    expect(firstPageBody.limit).toBe(50);
    expect(firstPageBody.offset).toBe(0);
    expect(firstPageBody.data).toHaveLength(50);
    expect(firstPageBody.hasMore).toBe(true);
    expect(firstPageBody.data.every((entry) => entry.type === 'set-create')).toBe(true);
    expect(firstPageBody.data.map((entry) => entry.setName)).toEqual(
      createdSetNames.slice(5).reverse(),
    );

    const secondPageRes = await fetch(url('/api/operations?limit=5&offset=50'));
    expect(secondPageRes.ok).toBe(true);
    const secondPageBody = await secondPageRes.json() as {
      data: Array<{ type: string; setName?: string }>;
      hasMore: boolean;
      limit: number;
      offset: number;
    };
    expect(secondPageBody.limit).toBe(5);
    expect(secondPageBody.offset).toBe(50);
    expect(secondPageBody.data).toHaveLength(5);
    expect(secondPageBody.data.every((entry) => entry.type === 'set-create')).toBe(true);
    expect(secondPageBody.data.map((entry) => entry.setName)).toEqual(
      createdSetNames.slice(0, 5).reverse(),
    );
  });
});

describe('GET /api/operations/path-renames', () => {
  it('preserves rename propagation across rename rollback and redo by exposing inverse rename events', async () => {
    const setName = 'path-rename-history-set';
    await createSet(setName, {
      color: {
        base: { $value: '#123456', $type: 'color' },
        alias: { $value: '{color.base}', $type: 'color' },
      },
    });

    const renameRes = await fetch(url(`/api/tokens/${setName}/tokens/rename`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: 'color.base', newPath: 'color.brand' }),
    });
    expect(renameRes.ok).toBe(true);
    expect(await renameRes.json()).toMatchObject({
      ok: true,
      aliasesUpdated: 1,
    });

    const operationsRes = await fetch(url('/api/operations?limit=10'));
    expect(operationsRes.ok).toBe(true);
    const operationsBody = await operationsRes.json() as {
      data: Array<{ id: string; type: string; setName?: string; affectedPaths: string[] }>;
    };
    const renameOperation = operationsBody.data.find((entry) =>
      entry.type === 'token-rename' &&
      entry.setName === setName &&
      entry.affectedPaths.includes('color.base') &&
      entry.affectedPaths.includes('color.brand')
    );
    expect(renameOperation).toBeDefined();
    if (!renameOperation) {
      throw new Error('Expected token rename operation entry');
    }

    const renamesAfterRenameRes = await fetch(url('/api/operations/path-renames'));
    expect(renamesAfterRenameRes.ok).toBe(true);
    const renamesAfterRenameBody = await renamesAfterRenameRes.json() as {
      renames: Array<{ oldPath: string; newPath: string }>;
    };
    expect(renamesAfterRenameBody.renames.filter(({ oldPath, newPath }) =>
      oldPath === 'color.base' && newPath === 'color.brand'
    )).toEqual([{ oldPath: 'color.base', newPath: 'color.brand' }]);

    const rollbackRenameRes = await fetch(url(`/api/operations/${renameOperation.id}/rollback`), {
      method: 'POST',
    });
    expect(rollbackRenameRes.ok).toBe(true);
    const rollbackRenameBody = await rollbackRenameRes.json() as { rollbackEntryId: string };
    expect(rollbackRenameBody.rollbackEntryId).toBeTruthy();

    const renamesAfterRollbackRes = await fetch(url('/api/operations/path-renames'));
    expect(renamesAfterRollbackRes.ok).toBe(true);
    const renamesAfterRollbackBody = await renamesAfterRollbackRes.json() as {
      renames: Array<{ oldPath: string; newPath: string }>;
    };
    expect(renamesAfterRollbackBody.renames.filter(({ oldPath, newPath }) =>
      (oldPath === 'color.base' && newPath === 'color.brand') ||
      (oldPath === 'color.brand' && newPath === 'color.base')
    )).toEqual([{ oldPath: 'color.brand', newPath: 'color.base' }]);

    const redoRenameRes = await fetch(url(`/api/operations/${rollbackRenameBody.rollbackEntryId}/rollback`), {
      method: 'POST',
    });
    expect(redoRenameRes.ok).toBe(true);

    const renamesAfterRedoRes = await fetch(url('/api/operations/path-renames'));
    expect(renamesAfterRedoRes.ok).toBe(true);
    const renamesAfterRedoBody = await renamesAfterRedoRes.json() as {
      renames: Array<{ oldPath: string; newPath: string }>;
    };
    expect(renamesAfterRedoBody.renames.filter(({ oldPath, newPath }) =>
      (oldPath === 'color.base' && newPath === 'color.brand') ||
      (oldPath === 'color.brand' && newPath === 'color.base')
    )).toEqual([{ oldPath: 'color.base', newPath: 'color.brand' }]);

    const setRes = await fetch(url(`/api/sets/${setName}`));
    expect(setRes.ok).toBe(true);
    const setBody = await setRes.json();
    expect(setBody.tokens.color.brand.$value).toBe('#123456');
    expect(setBody.tokens.color.alias.$value).toBe('{color.brand}');
    expect(setBody.tokens.color.base).toBeUndefined();
  });
});

describe('DELETE /api/data', () => {
  it('clears tokens, themes, generators, resolvers, operation history, and manual snapshots', async () => {
    const nestedSetName = 'reset/base';
    const resolverName = 'reset/resolver';

    const setRes = await fetch(url('/api/sets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nestedSetName,
        tokens: {
          color: {
            brand: { $value: '#3366ff', $type: 'color' },
          },
        },
      }),
    });
    expect(setRes.status).toBe(201);

    fs.writeFileSync(
      path.join(tokenDir, '$themes.json'),
      JSON.stringify({
        $themes: [
          {
            id: 'brand',
            name: 'Brand',
            options: [
              {
                id: 'default',
                name: 'Default',
                sets: { [nestedSetName]: 'enabled' },
              },
            ],
          },
        ],
      }),
    );

    const themesBeforeRes = await fetch(url('/api/themes'));
    expect(themesBeforeRes.ok).toBe(true);
    const themesBefore = await themesBeforeRes.json();
    expect(themesBefore.dimensions).toHaveLength(1);

    const generatorRes = await fetch(url('/api/generators'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'opacityScale',
        name: 'Reset generator',
        targetSet: nestedSetName,
        targetGroup: 'generated.opacity',
        config: {
          steps: [{ name: 'soft', value: 0.5 }],
        },
      }),
    });
    expect(generatorRes.status).toBe(201);

    const resolverRes = await fetch(url('/api/resolvers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: resolverName,
        version: '2025.10',
        sets: {
          base: {
            sources: [{ $ref: `${nestedSetName}.tokens.json` }],
          },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }],
      }),
    });
    expect(resolverRes.status).toBe(201);

    const snapshotRes = await fetch(url('/api/snapshots'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Reset snapshot' }),
    });
    expect(snapshotRes.status).toBe(201);

    fs.writeFileSync(path.join(tokenDir, '$rename-pending.json'), JSON.stringify({ oldName: 'old', newName: 'new' }));
    fs.mkdirSync(path.join(tokenDir, '.tokenmanager'), { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, '.tokenmanager', 'restore-journal.json'),
      JSON.stringify({
        snapshotId: 'pending',
        snapshotLabel: 'Pending restore',
        data: {},
        completedSets: [],
      }),
    );

    const resetRes = await fetch(url('/api/data'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    expect(resetRes.ok).toBe(true);

    const setsRes = await fetch(url('/api/sets'));
    expect(setsRes.ok).toBe(true);
    const setsBody = await setsRes.json();
    expect(setsBody.sets).toEqual([]);

    const themesAfterRes = await fetch(url('/api/themes'));
    expect(themesAfterRes.ok).toBe(true);
    expect(await themesAfterRes.json()).toEqual({ dimensions: [] });

    const generatorsAfterRes = await fetch(url('/api/generators'));
    expect(generatorsAfterRes.ok).toBe(true);
    expect(await generatorsAfterRes.json()).toEqual([]);

    const resolversAfterRes = await fetch(url('/api/resolvers'));
    expect(resolversAfterRes.ok).toBe(true);
    expect(await resolversAfterRes.json()).toEqual({ resolvers: [], loadErrors: {} });

    const operationsAfterRes = await fetch(url('/api/operations'));
    expect(operationsAfterRes.ok).toBe(true);
    expect(await operationsAfterRes.json()).toMatchObject({ data: [], total: 0 });

    const snapshotsAfterRes = await fetch(url('/api/snapshots'));
    expect(snapshotsAfterRes.ok).toBe(true);
    expect(await snapshotsAfterRes.json()).toEqual({ snapshots: [] });

    expect(fs.existsSync(path.join(tokenDir, `${nestedSetName}.tokens.json`))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, '$themes.json'))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, '$generators.json'))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, `${resolverName}.resolver.json`))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, '$rename-pending.json'))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, '.tokenmanager', 'operations.json'))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, '.tokenmanager', 'snapshots.json'))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, '.tokenmanager', 'restore-journal.json'))).toBe(false);
    expect(fs.existsSync(path.join(tokenDir, 'reset'))).toBe(false);

    const tokenManagerDir = path.join(tokenDir, '.tokenmanager');
    expect(fs.existsSync(tokenManagerDir)).toBe(false);
  });
});
