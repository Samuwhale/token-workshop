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
