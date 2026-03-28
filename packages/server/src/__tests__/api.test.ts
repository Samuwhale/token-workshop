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
