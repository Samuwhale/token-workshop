/**
 * Unit tests for TokenStore — the core service handling all token CRUD,
 * alias resolution, circular-reference detection, file persistence, and
 * batch operations.
 *
 * Each describe block gets its own temp directory + initialized store so tests
 * are fully isolated. The store is shut down in afterEach to stop the chokidar
 * watcher and avoid open-handle warnings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TokenStore } from '../services/token-store.js';
import { NotFoundError, ConflictError, BadRequestError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tm-ts-test-'));
}

async function makeStore(dir: string): Promise<TokenStore> {
  const store = new TokenStore(dir);
  await store.initialize();
  return store;
}

// ---------------------------------------------------------------------------
// Set CRUD
// ---------------------------------------------------------------------------

describe('TokenStore — set CRUD', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts with no sets', async () => {
    const sets = await store.getSets();
    expect(sets).toEqual([]);
  });

  it('createSet creates a set and persists it to disk', async () => {
    await store.createSet('base');
    const sets = await store.getSets();
    expect(sets).toContain('base');
    expect(fs.existsSync(path.join(dir, 'base.tokens.json'))).toBe(true);
  });

  it('createSet accepts initial tokens', async () => {
    await store.createSet('colors', {
      red: { $value: '#ff0000', $type: 'color' },
    });
    const set = await store.getSet('colors');
    expect(set).toBeDefined();
    expect((set!.tokens as any).red.$value).toBe('#ff0000');
  });

  it('getSet returns undefined for missing set', async () => {
    const set = await store.getSet('nonexistent');
    expect(set).toBeUndefined();
  });

  it('deleteSet removes the set and its file', async () => {
    await store.createSet('base');
    const deleted = await store.deleteSet('base');
    expect(deleted).toBe(true);
    expect(await store.getSets()).not.toContain('base');
    expect(fs.existsSync(path.join(dir, 'base.tokens.json'))).toBe(false);
  });

  it('deleteSet returns false for missing set', async () => {
    const deleted = await store.deleteSet('ghost');
    expect(deleted).toBe(false);
  });

  it('clearAll removes all token files, nested folders, and rename markers', async () => {
    await store.createSet('a');
    await store.createSet('nested/b');
    fs.writeFileSync(path.join(dir, '$rename-pending.json'), JSON.stringify({ oldName: 'a', newName: 'b' }));
    await store.clearAll();
    expect(await store.getSets()).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'a.tokens.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'nested', 'b.tokens.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'nested'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '$rename-pending.json'))).toBe(false);
  });

  it('renameSet renames the file and updates in-memory state', async () => {
    await store.createSet('old-name');
    await store.renameSet('old-name', 'new-name');
    const sets = await store.getSets();
    expect(sets).toContain('new-name');
    expect(sets).not.toContain('old-name');
    expect(fs.existsSync(path.join(dir, 'new-name.tokens.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'old-name.tokens.json'))).toBe(false);
  });

  it('renameSet throws NotFoundError for missing source set', async () => {
    await expect(store.renameSet('ghost', 'new-name')).rejects.toThrow(NotFoundError);
  });

  it('renameSet throws ConflictError when target name already exists', async () => {
    await store.createSet('a');
    await store.createSet('b');
    await expect(store.renameSet('a', 'b')).rejects.toThrow(ConflictError);
  });

  it('renameSet throws BadRequestError for invalid set name', async () => {
    await store.createSet('mySet');
    await expect(store.renameSet('mySet', 'bad name!')).rejects.toThrow(BadRequestError);
  });

  it('reorderSets reorders in-memory set order', async () => {
    await store.createSet('a');
    await store.createSet('b');
    await store.createSet('c');
    store.reorderSets(['c', 'a', 'b']);
    const sets = await store.getSets();
    expect(sets).toEqual(['c', 'a', 'b']);
  });

  it('reorderSets appends sets not in the list at the end', async () => {
    await store.createSet('a');
    await store.createSet('b');
    await store.createSet('c');
    store.reorderSets(['b']);
    const sets = await store.getSets();
    expect(sets[0]).toBe('b');
    expect(sets).toContain('a');
    expect(sets).toContain('c');
  });

  it('getSetCounts returns token count per set', async () => {
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
        blue: { $value: '#0000ff', $type: 'color' },
      },
    });
    const counts = store.getSetCounts();
    expect(counts['base']).toBe(2);
  });

  it('replaceSetTokens replaces all tokens atomically', async () => {
    await store.createSet('base', {
      old: { $value: 'old-val', $type: 'other' },
    });
    await store.replaceSetTokens('base', {
      new: { $value: 'new-val', $type: 'other' },
    });
    const set = await store.getSet('base');
    expect((set!.tokens as any).new.$value).toBe('new-val');
    expect((set!.tokens as any).old).toBeUndefined();
  });

  it('replaceSetTokens throws NotFoundError for missing set', async () => {
    await expect(store.replaceSetTokens('ghost', {})).rejects.toThrow(NotFoundError);
  });

  it('getAllTokenData returns raw token groups by set name', async () => {
    await store.createSet('base', { tok: { $value: '1', $type: 'other' } });
    const data = store.getAllTokenData();
    expect(data).toHaveProperty('base');
  });
});

// ---------------------------------------------------------------------------
// Set metadata
// ---------------------------------------------------------------------------

describe('TokenStore — set metadata', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('mySet');
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('updateSetDescription sets and retrieves description', async () => {
    await store.updateSetDescription('mySet', 'My set description');
    const descs = store.getSetDescriptions();
    expect(descs['mySet']).toBe('My set description');
  });

  it('updateSetDescription deletes description when empty', async () => {
    await store.updateSetDescription('mySet', 'to be removed');
    await store.updateSetDescription('mySet', '');
    const descs = store.getSetDescriptions();
    expect(descs['mySet']).toBeUndefined();
  });

  it('updateSetCollectionName sets and retrieves collection name', async () => {
    await store.updateSetCollectionName('mySet', 'Primitives');
    const cols = store.getSetCollectionNames();
    expect(cols['mySet']).toBe('Primitives');
  });

  it('updateSetModeName sets and retrieves mode name', async () => {
    await store.updateSetModeName('mySet', 'Light');
    const modes = store.getSetModeNames();
    expect(modes['mySet']).toBe('Light');
  });

  it('updateSetDescription throws NotFoundError for missing set', async () => {
    await expect(store.updateSetDescription('ghost', 'x')).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Token CRUD
// ---------------------------------------------------------------------------

describe('TokenStore — token CRUD', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('getToken returns a token by path', async () => {
    const token = await store.getToken('base', 'color.red');
    expect(token).toBeDefined();
    expect(token!.$value).toBe('#ff0000');
  });

  it('getToken returns undefined for missing path', async () => {
    const token = await store.getToken('base', 'color.missing');
    expect(token).toBeUndefined();
  });

  it('getToken returns undefined for missing set', async () => {
    const token = await store.getToken('ghost', 'color.red');
    expect(token).toBeUndefined();
  });

  it('createToken adds a new token', async () => {
    await store.createToken('base', 'color.blue', { $value: '#0000ff', $type: 'color' });
    const token = await store.getToken('base', 'color.blue');
    expect(token!.$value).toBe('#0000ff');
  });

  it('createToken auto-creates set if it does not exist', async () => {
    await store.createToken('new-set', 'spacing.sm', { $value: '8px', $type: 'dimension' });
    const sets = await store.getSets();
    expect(sets).toContain('new-set');
  });

  it('updateToken applies partial patch', async () => {
    await store.updateToken('base', 'color.red', { $description: 'Primary red' });
    const token = await store.getToken('base', 'color.red');
    expect(token!.$description).toBe('Primary red');
    expect(token!.$value).toBe('#ff0000'); // unchanged
  });

  it('updateToken throws NotFoundError for missing set', async () => {
    await expect(store.updateToken('ghost', 'color.red', { $value: '#fff' })).rejects.toThrow(NotFoundError);
  });

  it('updateToken throws NotFoundError for missing token', async () => {
    await expect(store.updateToken('base', 'color.missing', { $value: '#fff' })).rejects.toThrow(NotFoundError);
  });

  it('deleteToken removes the token', async () => {
    const deleted = await store.deleteToken('base', 'color.red');
    expect(deleted).toBe(true);
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
  });

  it('deleteToken returns false for missing token', async () => {
    const deleted = await store.deleteToken('base', 'color.missing');
    expect(deleted).toBe(false);
  });

  it('deleteToken returns false for missing set', async () => {
    const deleted = await store.deleteToken('ghost', 'color.red');
    expect(deleted).toBe(false);
  });

  it('deleteTokens deletes multiple tokens in one save', async () => {
    await store.createToken('base', 'color.blue', { $value: '#0000ff', $type: 'color' });
    const deleted = await store.deleteTokens('base', ['color.red', 'color.blue']);
    expect(deleted).toContain('color.red');
    expect(deleted).toContain('color.blue');
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
  });

  it('deleteTokens returns empty for missing set', async () => {
    const deleted = await store.deleteTokens('ghost', ['color.red']);
    expect(deleted).toEqual([]);
  });

  it('getFlatTokensForSet returns all tokens as flat map', async () => {
    const flat = await store.getFlatTokensForSet('base');
    expect(flat).toHaveProperty('color.red');
    expect(flat['color.red'].$value).toBe('#ff0000');
  });

  it('getAllFlatTokens returns all tokens across all sets', async () => {
    await store.createSet('other', { tok: { $value: 'x', $type: 'other' } });
    const all = store.getAllFlatTokens();
    const paths = all.map(e => e.path);
    expect(paths).toContain('color.red');
    expect(paths).toContain('tok');
  });

  it('changes are persisted to disk', async () => {
    await store.createToken('base', 'spacing.sm', { $value: '8px', $type: 'dimension' });
    const raw = fs.readFileSync(path.join(dir, 'base.tokens.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.spacing.sm.$value).toBe('8px');
  });
});

// ---------------------------------------------------------------------------
// Circular reference detection
// ---------------------------------------------------------------------------

describe('TokenStore — circular reference detection', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base');
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('allows a chain of non-circular aliases', async () => {
    await store.createToken('base', 'color.primary', { $value: '#ff0000', $type: 'color' });
    await store.createToken('base', 'color.button', { $value: '{color.primary}', $type: 'color' });
    const token = await store.getToken('base', 'color.button');
    expect(token!.$value).toBe('{color.primary}');
  });

  it('rejects self-referencing tokens', async () => {
    await expect(
      store.createToken('base', 'color.self', { $value: '{color.self}', $type: 'color' }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects a two-step cycle A → B → A', async () => {
    await store.createToken('base', 'color.a', { $value: '#ff0000', $type: 'color' });
    await store.createToken('base', 'color.b', { $value: '{color.a}', $type: 'color' });
    await expect(
      store.updateToken('base', 'color.a', { $value: '{color.b}' }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects a three-step cycle A → B → C → A', async () => {
    await store.createToken('base', 'color.a', { $value: '#ff0000', $type: 'color' });
    await store.createToken('base', 'color.b', { $value: '{color.a}', $type: 'color' });
    await store.createToken('base', 'color.c', { $value: '{color.b}', $type: 'color' });
    await expect(
      store.updateToken('base', 'color.a', { $value: '{color.c}' }),
    ).rejects.toThrow(ConflictError);
  });

  it('checkCircularReferences does not throw for safe changes', () => {
    expect(() => {
      store.checkCircularReferences([{ path: 'color.a', value: '#ff0000' }]);
    }).not.toThrow();
  });

  it('checkCircularReferences throws ConflictError for self-reference', async () => {
    await store.createToken('base', 'color.a', { $value: '#ff0000', $type: 'color' });
    expect(() => {
      store.checkCircularReferences([{ path: 'color.a', value: '{color.a}' }]);
    }).toThrow(ConflictError);
  });

  it('replaceSetTokens rejects tokens with circular references', async () => {
    await expect(
      store.replaceSetTokens('base', {
        a: { $value: '{b}', $type: 'color' },
        b: { $value: '{a}', $type: 'color' },
      }),
    ).rejects.toThrow(ConflictError);
  });
});

// ---------------------------------------------------------------------------
// Token rename / move / copy
// ---------------------------------------------------------------------------

describe('TokenStore — renameToken / moveToken / copyToken', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
        blue: { $value: '#0000ff', $type: 'color' },
      },
    });
    await store.createSet('other');
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renameToken renames a token within the same set', async () => {
    await store.renameToken('base', 'color.red', 'color.crimson');
    expect(await store.getToken('base', 'color.crimson')).toBeDefined();
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
  });

  it('renameToken updates alias references in the same set', async () => {
    await store.createToken('base', 'semantic.primary', { $value: '{color.red}', $type: 'color' });
    await store.renameToken('base', 'color.red', 'color.crimson');
    const alias = await store.getToken('base', 'semantic.primary');
    expect(alias!.$value).toBe('{color.crimson}');
  });

  it('renameToken throws NotFoundError for missing set', async () => {
    await expect(store.renameToken('ghost', 'color.red', 'color.new')).rejects.toThrow(NotFoundError);
  });

  it('renameToken throws NotFoundError for missing token', async () => {
    await expect(store.renameToken('base', 'color.missing', 'color.new')).rejects.toThrow(NotFoundError);
  });

  it('renameToken throws ConflictError when target path already exists', async () => {
    await expect(store.renameToken('base', 'color.red', 'color.blue')).rejects.toThrow(ConflictError);
  });

  it('moveToken moves a token to another set', async () => {
    await store.moveToken('base', 'color.red', 'other');
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
    expect(await store.getToken('other', 'color.red')).toBeDefined();
  });

  it('moveToken throws BadRequestError when source and target are the same', async () => {
    await expect(store.moveToken('base', 'color.red', 'base')).rejects.toThrow(BadRequestError);
  });

  it('moveToken throws ConflictError when path already exists in target', async () => {
    await store.createToken('other', 'color.red', { $value: '#ff0000', $type: 'color' });
    await expect(store.moveToken('base', 'color.red', 'other')).rejects.toThrow(ConflictError);
  });

  it('copyToken copies a token to another set, preserving source', async () => {
    await store.copyToken('base', 'color.red', 'other');
    expect(await store.getToken('base', 'color.red')).toBeDefined();
    expect(await store.getToken('other', 'color.red')).toBeDefined();
  });

  it('copyToken throws ConflictError when path already exists in target', async () => {
    await store.createToken('other', 'color.red', { $value: '#ff0000', $type: 'color' });
    await expect(store.copyToken('base', 'color.red', 'other')).rejects.toThrow(ConflictError);
  });

  it('previewRenameToken shows which aliases would be updated', async () => {
    await store.createToken('base', 'semantic.primary', { $value: '{color.red}', $type: 'color' });
    const preview = store.previewRenameToken('color.red', 'color.crimson');
    expect(preview.length).toBeGreaterThan(0);
    expect(preview[0].tokenPath).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Group operations
// ---------------------------------------------------------------------------

describe('TokenStore — group operations', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        $description: 'color group',
        red: { $value: '#ff0000', $type: 'color' },
        blue: { $value: '#0000ff', $type: 'color' },
      },
    });
    await store.createSet('other');
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('createGroup creates an empty group', async () => {
    await store.createGroup('base', 'spacing');
    const set = await store.getSet('base');
    expect(set!.tokens).toHaveProperty('spacing');
  });

  it('createGroup throws ConflictError if path already exists', async () => {
    await expect(store.createGroup('base', 'color')).rejects.toThrow(ConflictError);
  });

  it('updateGroup sets $description on a group', async () => {
    await store.updateGroup('base', 'color', { $description: 'Updated description' });
    const set = await store.getSet('base');
    expect((set!.tokens.color as any).$description).toBe('Updated description');
  });

  it('updateGroup clears $description when null', async () => {
    await store.updateGroup('base', 'color', { $description: null });
    const set = await store.getSet('base');
    expect((set!.tokens.color as any).$description).toBeUndefined();
  });

  it('renameGroup renames tokens under the group', async () => {
    const result = await store.renameGroup('base', 'color', 'palette');
    expect(result.renamedCount).toBe(2);
    expect(await store.getToken('base', 'palette.red')).toBeDefined();
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
  });

  it('renameGroup updates cross-set alias references', async () => {
    await store.createToken('other', 'semantic.primary', { $value: '{color.red}', $type: 'color' });
    const result = await store.renameGroup('base', 'color', 'palette');
    expect(result.aliasesUpdated).toBeGreaterThan(0);
    const alias = await store.getToken('other', 'semantic.primary');
    expect(alias!.$value).toBe('{palette.red}');
  });

  it('renameGroup throws NotFoundError for missing set', async () => {
    await expect(store.renameGroup('ghost', 'color', 'palette')).rejects.toThrow(NotFoundError);
  });

  it('previewRenameGroup is read-only and returns alias changes', async () => {
    await store.createToken('other', 'semantic.primary', { $value: '{color.red}', $type: 'color' });
    const preview = store.previewRenameGroup('color', 'palette');
    expect(preview.length).toBeGreaterThan(0);
    // State must not have changed
    expect(await store.getToken('base', 'color.red')).toBeDefined();
    expect(await store.getToken('other', 'semantic.primary')).toHaveProperty('$value', '{color.red}');
  });

  it('moveGroup moves tokens to another set', async () => {
    const result = await store.moveGroup('base', 'color', 'other');
    expect(result.movedCount).toBe(2);
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
    expect(await store.getToken('other', 'color.red')).toBeDefined();
  });

  it('moveGroup throws BadRequestError when source and target are the same', async () => {
    await expect(store.moveGroup('base', 'color', 'base')).rejects.toThrow(BadRequestError);
  });

  it('copyGroup copies tokens to another set', async () => {
    const result = await store.copyGroup('base', 'color', 'other');
    expect(result.copiedCount).toBe(2);
    expect(await store.getToken('base', 'color.red')).toBeDefined();
    expect(await store.getToken('other', 'color.red')).toBeDefined();
  });

  it('copyGroup throws ConflictError when target paths already exist', async () => {
    await store.createToken('other', 'color.red', { $value: '#ff0000', $type: 'color' });
    await expect(store.copyGroup('base', 'color', 'other')).rejects.toThrow(ConflictError);
  });

  it('duplicateGroup creates a -copy variant', async () => {
    const result = await store.duplicateGroup('base', 'color');
    expect(result.count).toBe(2);
    expect(result.newGroupPath).toBe('color-copy');
    expect(await store.getToken('base', 'color-copy.red')).toBeDefined();
  });

  it('duplicateGroup handles collision by appending -copy-N suffix', async () => {
    await store.duplicateGroup('base', 'color'); // creates color-copy
    const result = await store.duplicateGroup('base', 'color'); // should create color-copy-2
    expect(result.newGroupPath).toBe('color-copy-2');
  });

  it('reorderGroupChildren reorders keys in a group', async () => {
    await store.reorderGroupChildren('base', 'color', ['blue', 'red']);
    const set = await store.getSet('base');
    const keys = Object.keys((set!.tokens.color as any)).filter((k: string) => !k.startsWith('$'));
    expect(keys[0]).toBe('blue');
    expect(keys[1]).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

describe('TokenStore — batchUpsertTokens', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skip strategy preserves existing tokens', async () => {
    const result = await store.batchUpsertTokens(
      'base',
      [{ path: 'color.red', token: { $value: '#ffffff', $type: 'color' } }],
      'skip',
    );
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    const token = await store.getToken('base', 'color.red');
    expect(token!.$value).toBe('#ff0000'); // unchanged
  });

  it('overwrite strategy replaces existing tokens', async () => {
    const result = await store.batchUpsertTokens(
      'base',
      [{ path: 'color.red', token: { $value: '#ffffff', $type: 'color' } }],
      'overwrite',
    );
    expect(result.imported).toBe(1);
    const token = await store.getToken('base', 'color.red');
    expect(token!.$value).toBe('#ffffff');
  });

  it('merge strategy updates value and type but preserves description', async () => {
    await store.updateToken('base', 'color.red', { $description: 'Primary' });
    const result = await store.batchUpsertTokens(
      'base',
      [{ path: 'color.red', token: { $value: '#cc0000', $type: 'color', $description: 'Ignored' } }],
      'merge',
    );
    expect(result.imported).toBe(1);
    const token = await store.getToken('base', 'color.red');
    expect(token!.$value).toBe('#cc0000');
    expect(token!.$description).toBe('Primary'); // preserved
  });

  it('inserts new tokens with any strategy', async () => {
    const result = await store.batchUpsertTokens(
      'base',
      [{ path: 'color.green', token: { $value: '#00ff00', $type: 'color' } }],
      'skip',
    );
    expect(result.imported).toBe(1);
    expect(await store.getToken('base', 'color.green')).toBeDefined();
  });

  it('rejects batch with circular references', async () => {
    await expect(
      store.batchUpsertTokens(
        'base',
        [
          { path: 'x', token: { $value: '{y}', $type: 'color' } },
          { path: 'y', token: { $value: '{x}', $type: 'color' } },
        ],
        'overwrite',
      ),
    ).rejects.toThrow(ConflictError);
  });
});

describe('TokenStore — batchUpdateTokens', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
        blue: { $value: '#0000ff', $type: 'color' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies multiple patches atomically', async () => {
    await store.batchUpdateTokens('base', [
      { path: 'color.red', patch: { $value: '#cc0000' } },
      { path: 'color.blue', patch: { $value: '#0000cc' } },
    ]);
    expect((await store.getToken('base', 'color.red'))!.$value).toBe('#cc0000');
    expect((await store.getToken('base', 'color.blue'))!.$value).toBe('#0000cc');
  });

  it('throws NotFoundError if any token is missing (all-or-nothing)', async () => {
    await expect(
      store.batchUpdateTokens('base', [
        { path: 'color.red', patch: { $value: '#cc0000' } },
        { path: 'color.missing', patch: { $value: '#fff' } },
      ]),
    ).rejects.toThrow(NotFoundError);
    // red should be unchanged
    expect((await store.getToken('base', 'color.red'))!.$value).toBe('#ff0000');
  });

  it('throws NotFoundError for missing set', async () => {
    await expect(
      store.batchUpdateTokens('ghost', [{ path: 'color.red', patch: { $value: '#fff' } }]),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('TokenStore — batchRenameTokens', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
        blue: { $value: '#0000ff', $type: 'color' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renames multiple tokens atomically', async () => {
    const result = await store.batchRenameTokens('base', [
      { oldPath: 'color.red', newPath: 'color.crimson' },
      { oldPath: 'color.blue', newPath: 'color.navy' },
    ]);
    expect(result.renamed).toBe(2);
    expect(await store.getToken('base', 'color.crimson')).toBeDefined();
    expect(await store.getToken('base', 'color.navy')).toBeDefined();
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
  });

  it('throws NotFoundError if a source token is missing', async () => {
    await expect(
      store.batchRenameTokens('base', [{ oldPath: 'color.missing', newPath: 'color.new' }]),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ConflictError if target path already exists', async () => {
    await expect(
      store.batchRenameTokens('base', [{ oldPath: 'color.red', newPath: 'color.blue' }]),
    ).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError for duplicate target paths in the same batch', async () => {
    await store.createToken('base', 'color.green', { $value: '#00ff00', $type: 'color' });
    await expect(
      store.batchRenameTokens('base', [
        { oldPath: 'color.red', newPath: 'color.primary' },
        { oldPath: 'color.green', newPath: 'color.primary' },
      ]),
    ).rejects.toThrow(ConflictError);
  });
});

describe('TokenStore — batchMoveTokens / batchCopyTokens', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('source', {
      a: { $value: '1', $type: 'other' },
      b: { $value: '2', $type: 'other' },
    });
    await store.createSet('target');
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('batchMoveTokens moves multiple tokens to another set', async () => {
    const result = await store.batchMoveTokens('source', ['a', 'b'], 'target');
    expect(result.moved).toBe(2);
    expect(await store.getToken('source', 'a')).toBeUndefined();
    expect(await store.getToken('target', 'a')).toBeDefined();
  });

  it('batchMoveTokens throws BadRequestError for same source and target', async () => {
    await expect(store.batchMoveTokens('source', ['a'], 'source')).rejects.toThrow(BadRequestError);
  });

  it('batchMoveTokens throws ConflictError when any target path exists', async () => {
    await store.createToken('target', 'a', { $value: '99', $type: 'other' });
    await expect(store.batchMoveTokens('source', ['a', 'b'], 'target')).rejects.toThrow(ConflictError);
  });

  it('batchCopyTokens copies tokens without removing source', async () => {
    const result = await store.batchCopyTokens('source', ['a', 'b'], 'target');
    expect(result.copied).toBe(2);
    expect(await store.getToken('source', 'a')).toBeDefined();
    expect(await store.getToken('target', 'a')).toBeDefined();
  });

  it('batchCopyTokens overwrites existing target tokens', async () => {
    await store.createToken('target', 'a', { $value: '99', $type: 'other' });
    const result = await store.batchCopyTokens('source', ['a'], 'target');
    expect(result.copied).toBe(1);
    expect((await store.getToken('target', 'a'))!.$value).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// bulkRename
// ---------------------------------------------------------------------------

describe('TokenStore — bulkRename', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        primary: { $value: '#ff0000', $type: 'color' },
        secondary: { $value: '#0000ff', $type: 'color' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renames matching token paths using plain string', async () => {
    const result = await store.bulkRename('base', 'color.', 'palette.');
    expect(result.renamed).toBe(2);
    expect(await store.getToken('base', 'palette.primary')).toBeDefined();
    expect(await store.getToken('base', 'palette.secondary')).toBeDefined();
  });

  it('renames matching token paths using regex', async () => {
    const result = await store.bulkRename('base', 'color\\.(.*)', 'col.$1', true);
    expect(result.renamed).toBe(2);
    expect(await store.getToken('base', 'col.primary')).toBeDefined();
  });

  it('throws BadRequestError for invalid regex', async () => {
    await expect(store.bulkRename('base', '[invalid(', '', true)).rejects.toThrow(BadRequestError);
  });

  it('skips paths that would collide with existing tokens', async () => {
    // If we rename secondary → primary, it collides with existing primary
    // but primary→primary no-op (not in renames). Actually primary becomes
    // 'primary' (unchanged) so secondary would collide. Let's trigger that.
    // Rename just the prefix of one token to the other
    await store.createToken('base', 'color.tertiary', { $value: '#00ff00', $type: 'color' });
    // Rename 'tertiary' → 'primary' which collides
    const result = await store.bulkRename('base', 'color.tertiary', 'color.primary');
    expect(result.skipped).toContain('color.tertiary');
    expect((await store.getToken('base', 'color.primary'))!.$value).toBe('#ff0000');
  });

  it('throws NotFoundError for missing set', async () => {
    await expect(store.bulkRename('ghost', 'a', 'b')).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

describe('TokenStore — token resolution', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
        alias: { $value: '{color.red}', $type: 'color' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolveTokens resolves all tokens including aliases', async () => {
    const resolved = await store.resolveTokens();
    const alias = resolved.find(r => r.path === 'color.alias');
    expect(alias).toBeDefined();
    expect(alias!.$value).toBe('#ff0000');
  });

  it('resolveToken resolves a single token', async () => {
    const resolved = await store.resolveToken('color.alias');
    expect(resolved).toBeDefined();
    expect(resolved!.$value).toBe('#ff0000');
  });

  it('resolveToken returns undefined for missing token', async () => {
    const resolved = await store.resolveToken('color.missing');
    expect(resolved).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dependents
// ---------------------------------------------------------------------------

describe('TokenStore — getDependents / getGroupDependents', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
      },
    });
    await store.createSet('semantic', {
      primary: { $value: '{color.red}', $type: 'color' },
      button: { $value: '{color.red}', $type: 'color' },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('getDependents lists all tokens that reference the given path', () => {
    const deps = store.getDependents('color.red');
    const paths = deps.map(d => d.path);
    expect(paths).toContain('primary');
    expect(paths).toContain('button');
  });

  it('getDependents returns empty for token with no dependents', () => {
    const deps = store.getDependents('color.red.nonexistent');
    expect(deps).toEqual([]);
  });

  it('getGroupDependents returns external tokens referencing the group', () => {
    const deps = store.getGroupDependents('color');
    const paths = deps.map(d => d.path);
    expect(paths).toContain('primary');
    expect(paths).toContain('button');
  });
});

// ---------------------------------------------------------------------------
// searchTokens
// ---------------------------------------------------------------------------

describe('TokenStore — searchTokens', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color', $description: 'Primary red' },
        blue: { $value: '#0000ff', $type: 'color' },
        alias: { $value: '{color.red}', $type: 'color' },
      },
      spacing: {
        sm: { $value: '4px', $type: 'dimension' },
        lg: { $value: '16px', $type: 'dimension' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns all tokens with no filters', () => {
    const { results, total } = store.searchTokens({});
    expect(total).toBe(5);
    expect(results.length).toBe(5);
  });

  it('filters by free text q (path match)', () => {
    const { results } = store.searchTokens({ q: 'red' });
    const paths = results.map(r => r.path);
    expect(paths).toContain('color.red');
  });

  it('filters by free text q (description match)', () => {
    const { results } = store.searchTokens({ q: 'primary' });
    expect(results.some(r => r.path === 'color.red')).toBe(true);
  });

  it('filters by type', () => {
    const { results } = store.searchTokens({ types: ['dimension'] });
    for (const r of results) {
      expect(r.$type).toBe('dimension');
    }
    expect(results.length).toBe(2);
  });

  it('filters by has:alias', () => {
    const { results } = store.searchTokens({ has: ['alias'] });
    expect(results.every(r => typeof r.$value === 'string' && r.$value.startsWith('{'))).toBe(true);
  });

  it('filters by has:direct (non-alias)', () => {
    const { results } = store.searchTokens({ has: ['direct'] });
    expect(results.every(r => !(typeof r.$value === 'string' && r.$value.startsWith('{')))).toBe(true);
  });

  it('filters by has:description', () => {
    const { results } = store.searchTokens({ has: ['description'] });
    expect(results.every(r => r.$description)).toBe(true);
  });

  it('filters by value content', () => {
    const { results } = store.searchTokens({ values: ['4px'] });
    expect(results.length).toBe(1);
    expect(results[0].path).toBe('spacing.sm');
  });

  it('paginates with limit and offset', () => {
    const { results: page1, total } = store.searchTokens({ limit: 2, offset: 0 });
    expect(page1.length).toBe(2);
    expect(total).toBe(5);
    const { results: page2 } = store.searchTokens({ limit: 2, offset: 2 });
    expect(page2.length).toBe(2);
    // Pages should not overlap
    const page1Paths = page1.map(r => r.path);
    const page2Paths = page2.map(r => r.path);
    expect(page1Paths.filter(p => page2Paths.includes(p))).toEqual([]);
  });

  it('filters by desc qualifier', () => {
    const { results } = store.searchTokens({ descs: ['primary'] });
    expect(results.length).toBe(1);
    expect(results[0].path).toBe('color.red');
  });
});

// ---------------------------------------------------------------------------
// getTokenDefinitions
// ---------------------------------------------------------------------------

describe('TokenStore — getTokenDefinitions', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: { primary: { $value: '#ff0000', $type: 'color' } },
      spacing: { sm: { $value: '4px', $type: 'dimension' } },
    });
    await store.createSet('theme', {
      color: { primary: { $value: '#0000ff', $type: 'color', $description: 'Brand override' } },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty array for a path defined in no sets', () => {
    const defs = store.getTokenDefinitions('color.nonexistent');
    expect(defs).toEqual([]);
  });

  it('returns one entry when only one set defines the path', () => {
    const defs = store.getTokenDefinitions('spacing.sm');
    expect(defs.length).toBe(1);
    expect(defs[0].setName).toBe('base');
    expect(defs[0].token.$value).toBe('4px');
  });

  it('returns one entry per set that defines the path', () => {
    const defs = store.getTokenDefinitions('color.primary');
    expect(defs.length).toBe(2);
    const setNames = defs.map(d => d.setName);
    expect(setNames).toContain('base');
    expect(setNames).toContain('theme');
  });

  it('includes all token fields in each definition', () => {
    const defs = store.getTokenDefinitions('color.primary');
    const themeDef = defs.find(d => d.setName === 'theme');
    expect(themeDef).toBeDefined();
    expect(themeDef!.token.$value).toBe('#0000ff');
    expect(themeDef!.token.$type).toBe('color');
    expect(themeDef!.token.$description).toBe('Brand override');
  });
});

// ---------------------------------------------------------------------------
// Generator ID helpers
// ---------------------------------------------------------------------------

describe('TokenStore — findTokensByGeneratorId / deleteTokensByGeneratorId', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      ramp: {
        100: {
          $value: '#ffeedd',
          $type: 'color',
          $extensions: { 'com.tokenmanager.generator': { generatorId: 'gen-1' } },
        },
        200: {
          $value: '#ffddcc',
          $type: 'color',
          $extensions: { 'com.tokenmanager.generator': { generatorId: 'gen-1' } },
        },
      },
      other: {
        tok: {
          $value: '#aabbcc',
          $type: 'color',
          $extensions: { 'com.tokenmanager.generator': { generatorId: 'gen-2' } },
        },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('findTokensByGeneratorId returns matching tokens', () => {
    const found = store.findTokensByGeneratorId('gen-1');
    expect(found.length).toBe(2);
    expect(found.every(f => f.generatorId === 'gen-1')).toBe(true);
  });

  it('findTokensByGeneratorId with wildcard returns all generator tokens', () => {
    const found = store.findTokensByGeneratorId('*');
    expect(found.length).toBe(3);
  });

  it('deleteTokensByGeneratorId deletes tagged tokens and returns count', async () => {
    const count = await store.deleteTokensByGeneratorId('gen-1');
    expect(count).toBe(2);
    expect(await store.getToken('base', 'ramp.100')).toBeUndefined();
    expect(await store.getToken('base', 'other.tok')).toBeDefined(); // gen-2 untouched
  });

  it('deleteTokensByGeneratorId returns 0 when no match', async () => {
    const count = await store.deleteTokensByGeneratorId('gen-99');
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// restoreSnapshot
// ---------------------------------------------------------------------------

describe('TokenStore — restoreSnapshot', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base', {
      color: {
        red: { $value: '#ff0000', $type: 'color' },
        blue: { $value: '#0000ff', $type: 'color' },
      },
    });
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('restores deleted tokens (token=null means delete)', async () => {
    await store.deleteToken('base', 'color.red');
    await store.restoreSnapshot('base', [
      { path: 'color.red', token: { $value: '#ff0000', $type: 'color' } },
    ]);
    expect(await store.getToken('base', 'color.red')).toBeDefined();
  });

  it('deletes tokens when token is null in the snapshot items', async () => {
    await store.restoreSnapshot('base', [{ path: 'color.red', token: null }]);
    expect(await store.getToken('base', 'color.red')).toBeUndefined();
  });

  it('throws NotFoundError for missing set', async () => {
    await expect(
      store.restoreSnapshot('ghost', [{ path: 'color.red', token: null }]),
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// onChange event emission
// ---------------------------------------------------------------------------

describe('TokenStore — onChange events', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base');
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits token-updated event after createToken', async () => {
    const events: string[] = [];
    store.onChange(e => events.push(e.type));
    await store.createToken('base', 'color.red', { $value: '#ff0000', $type: 'color' });
    expect(events).toContain('token-updated');
  });

  it('emits token-updated event after deleteToken', async () => {
    await store.createToken('base', 'color.red', { $value: '#ff0000', $type: 'color' });
    const events: string[] = [];
    store.onChange(e => events.push(e.type));
    await store.deleteToken('base', 'color.red');
    expect(events).toContain('token-updated');
  });

  it('unsubscribe stops receiving events', async () => {
    const events: string[] = [];
    const unsubscribe = store.onChange(e => events.push(e.type));
    unsubscribe();
    await store.createToken('base', 'color.red', { $value: '#ff0000', $type: 'color' });
    expect(events).toEqual([]);
  });

  it('emitEvent emits arbitrary events to listeners', () => {
    const events: string[] = [];
    store.onChange(e => events.push(e.type));
    store.emitEvent({ type: 'generator-error', setName: 'base', generatorId: 'gen-1', message: 'boom' });
    expect(events).toContain('generator-error');
  });
});

// ---------------------------------------------------------------------------
// File persistence after initialization
// ---------------------------------------------------------------------------

describe('TokenStore — initialization from disk', () => {
  it('loads pre-existing token files on initialize', async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(
      path.join(dir, 'colors.tokens.json'),
      JSON.stringify({ red: { $value: '#ff0000', $type: 'color' } }),
    );
    const store = await makeStore(dir);
    try {
      const sets = await store.getSets();
      expect(sets).toContain('colors');
      const token = await store.getToken('colors', 'red');
      expect(token!.$value).toBe('#ff0000');
    } finally {
      await store.shutdown();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recovers a pending rename marker when new file exists', async () => {
    const dir = makeTmpDir();
    // Simulate a crash: new file exists, old file gone, marker present
    fs.writeFileSync(
      path.join(dir, 'new-name.tokens.json'),
      JSON.stringify({ tok: { $value: '1', $type: 'other' } }),
    );
    fs.writeFileSync(
      path.join(dir, '$rename-pending.json'),
      JSON.stringify({ oldName: 'old-name', newName: 'new-name' }),
    );
    const store = await makeStore(dir);
    try {
      // Marker should have been cleaned up
      expect(fs.existsSync(path.join(dir, '$rename-pending.json'))).toBe(false);
      const sets = await store.getSets();
      expect(sets).toContain('new-name');
    } finally {
      await store.shutdown();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves the rename marker when applyThemesRename throws', async () => {
    const dir = makeTmpDir();
    // Simulate a crash: new file exists, old file gone, marker present
    fs.writeFileSync(
      path.join(dir, 'new-name.tokens.json'),
      JSON.stringify({ tok: { $value: '1', $type: 'other' } }),
    );
    fs.writeFileSync(
      path.join(dir, '$rename-pending.json'),
      JSON.stringify({ oldName: 'old-name', newName: 'new-name' }),
    );
    // Make $themes.json a directory so readFile throws EISDIR (non-ENOENT), causing applyThemesRename to throw
    fs.mkdirSync(path.join(dir, '$themes.json'));
    const store = await makeStore(dir);
    try {
      // Marker must be preserved so the next restart can retry
      expect(fs.existsSync(path.join(dir, '$rename-pending.json'))).toBe(true);
      // The token data should still be available (the store loaded despite the recovery failure)
      const sets = await store.getSets();
      expect(sets).toContain('new-name');
    } finally {
      await store.shutdown();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Batch depth / deferred rebuild
// ---------------------------------------------------------------------------

describe('TokenStore — beginBatch / endBatch', () => {
  let dir: string;
  let store: TokenStore;

  beforeEach(async () => {
    dir = makeTmpDir();
    store = await makeStore(dir);
    await store.createSet('base');
  });

  afterEach(async () => {
    await store.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('flat tokens are accessible after endBatch', async () => {
    store.beginBatch();
    await store.createToken('base', 'color.red', { $value: '#ff0000', $type: 'color' });
    store.endBatch();
    const flat = await store.getFlatTokensForSet('base');
    expect(flat).toHaveProperty('color.red');
  });

  it('nested beginBatch/endBatch rebuilds only on the outermost end', async () => {
    store.beginBatch();
    store.beginBatch();
    await store.createToken('base', 'color.red', { $value: '#ff0000', $type: 'color' });
    store.endBatch(); // inner — should not trigger rebuild yet
    store.endBatch(); // outer — triggers rebuild
    const flat = await store.getFlatTokensForSet('base');
    expect(flat).toHaveProperty('color.red');
  });
});
