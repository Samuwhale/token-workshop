import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { createMarkdownBacklogStore } from '../store/markdown-store.js';

const tempDirs: string[] = [];

async function makeStoreFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-store-test-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '- [ ] plain item\n- [ ] [HIGH] urgent item\n', 'utf8');
  await writeFile(path.join(root, 'backlog-inbox.md'), '', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Backlog Progress Log\nStarted: today\n---\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/archive.md'), '# Backlog Archive\n', 'utf8');

  const config = normalizeBacklogRunnerConfig(
    {
      files: {
        backlog: './backlog.md',
        inbox: './backlog-inbox.md',
        stop: './backlog-stop',
        patterns: './scripts/backlog/patterns.md',
        progress: './scripts/backlog/progress.txt',
        archive: './scripts/backlog/archive.md',
        counter: './scripts/backlog/.completed-count',
        runnerLogDir: './scripts/backlog',
        runtimeDir: './.backlog-runner',
      },
      prompts: {
        agent: './scripts/backlog/agent.md',
        product: './scripts/backlog/product.md',
        ux: './scripts/backlog/ux.md',
        code: './scripts/backlog/code.md',
      },
      validationCommand: 'bash scripts/backlog/validate.sh',
      cleanup: {
        archiveDoneThreshold: 1,
        progressSectionsToKeep: 1,
      },
    },
    path.join(root, 'backlog.config.mjs'),
  );

  return {
    root,
    config,
    store: createMarkdownBacklogStore(config),
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('markdown store', () => {
  it('claims priority items first and updates statuses', async () => {
    const { root, store } = await makeStoreFixture();
    const claim = await store.claimNextItem();
    expect(claim?.item).toBe('[HIGH] urgent item');

    await store.updateItemStatus(claim!.item, 'x');
    const content = await readFile(path.join(root, 'backlog.md'), 'utf8');
    expect(content).toContain('- [x] [HIGH] urgent item');
  });

  it('drains inbox with dedupe and priority insertion', async () => {
    const { root, store } = await makeStoreFixture();
    await writeFile(
      path.join(root, 'backlog-inbox.md'),
      '- [ ] [HIGH] inbox urgent\n- [ ] plain item\n- [ ] new item\n',
      'utf8',
    );

    const result = await store.drainInbox();
    const backlog = await readFile(path.join(root, 'backlog.md'), 'utf8');

    expect(result.drained).toBe(true);
    expect(result.skippedDuplicates).toBe(1);
    expect(backlog.indexOf('- [ ] [HIGH] inbox urgent')).toBeLessThan(backlog.indexOf('- [ ] plain item'));
    expect(backlog).toContain('- [ ] new item');
  });

  it('archives done items and trims progress', async () => {
    const { root, store } = await makeStoreFixture();
    await writeFile(path.join(root, 'backlog.md'), '- [x] done one\n- [x] done two\n', 'utf8');
    await writeFile(
      path.join(root, 'scripts/backlog/progress.txt'),
      '# Backlog Progress Log\nStarted: today\n---\n## first\nbody\n---\n## second\nbody\n---\n',
      'utf8',
    );

    const cleanup = await store.cleanupIfNeeded();
    const backlog = await readFile(path.join(root, 'backlog.md'), 'utf8');
    const archive = await readFile(path.join(root, 'scripts/backlog/archive.md'), 'utf8');
    const progress = await readFile(path.join(root, 'scripts/backlog/progress.txt'), 'utf8');

    expect(cleanup.archivedCount).toBe(2);
    expect(backlog).not.toContain('[x]');
    expect(archive).toContain('done one');
    expect(progress).toContain('## second');
    expect(progress).not.toContain('## first');
  });
});
