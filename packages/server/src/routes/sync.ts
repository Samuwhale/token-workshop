import type { FastifyPluginAsync } from 'fastify';
import type { Token } from '@tokenmanager/core';
import { flattenTokenGroup } from '@tokenmanager/core';
import { snapshotPaths } from '../services/operation-log.js';
import { stableStringify } from '../services/stable-stringify.js';
import { handleRouteError } from '../errors.js';

interface TokenChange {
  path: string;
  set: string;
  type: string;
  status: 'added' | 'modified' | 'removed';
  before?: any;
  after?: any;
}

interface FileDiff {
  file: string;
  before: string | null;
  after: string | null;
}

/** Flatten before/after token files and diff them into a list of token-level changes. */
function buildTokenDiff(fileDiffs: FileDiff[]): TokenChange[] {
  const changes: TokenChange[] = [];

  for (const diff of fileDiffs) {
    const setName = diff.file.replace('.tokens.json', '');
    const beforeTokens = new Map<string, any>();
    const afterTokens = new Map<string, any>();

    if (diff.before) {
      try {
        for (const [p, t] of flattenTokenGroup(JSON.parse(diff.before))) {
          beforeTokens.set(p, t);
        }
      } catch { /* skip unparseable */ }
    }
    if (diff.after) {
      try {
        for (const [p, t] of flattenTokenGroup(JSON.parse(diff.after))) {
          afterTokens.set(p, t);
        }
      } catch { /* skip unparseable */ }
    }

    // Added tokens (in after but not before)
    for (const [p, token] of afterTokens) {
      if (!beforeTokens.has(p)) {
        changes.push({ path: p, set: setName, type: token.$type || 'unknown', status: 'added', after: token.$value });
      }
    }

    // Removed tokens (in before but not after)
    for (const [p, token] of beforeTokens) {
      if (!afterTokens.has(p)) {
        changes.push({ path: p, set: setName, type: token.$type || 'unknown', status: 'removed', before: token.$value });
      }
    }

    // Modified tokens (in both, but value changed)
    for (const [p, afterToken] of afterTokens) {
      const beforeToken = beforeTokens.get(p);
      if (beforeToken) {
        const bVal = stableStringify(beforeToken.$value);
        const aVal = stableStringify(afterToken.$value);
        if (bVal !== aVal) {
          changes.push({
            path: p,
            set: setName,
            type: afterToken.$type || beforeToken.$type || 'unknown',
            status: 'modified',
            before: beforeToken.$value,
            after: afterToken.$value,
          });
        }
      }
    }
  }

  return changes;
}

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;
  // GET /api/sync/status — git status + isRepo + current branch
  fastify.get('/sync/status', async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo) {
        return { isRepo: false, branch: null, status: null, remote: null };
      }

      const [status, branch, remote] = await Promise.all([
        fastify.gitSync.status(),
        fastify.gitSync.getCurrentBranch(),
        fastify.gitSync.getRemote(),
      ]);

      return {
        isRepo: true,
        branch,
        remote,
        status: {
          modified: status.modified,
          created: status.created,
          deleted: status.deleted,
          not_added: status.not_added,
          staged: status.staged,
          isClean: status.isClean(),
          ahead: status.ahead,
          behind: status.behind,
        },
      };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get sync status');
    }
  });

  // POST /api/sync/init — initialize git repo
  fastify.post('/sync/init', async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (isRepo) {
        return reply.status(409).send({ error: 'Git repository already initialized' });
      }
      await fastify.gitSync.init();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to initialize git repo');
    }
  });

  // POST /api/sync/commit — commit with message, optional files array for selective staging
  fastify.post<{ Body: { message: string; files?: string[] } }>('/sync/commit', async (request, reply) => {
    const { message, files } = request.body || {};
    if (!message) {
      return reply.status(400).send({ error: 'Commit message is required' });
    }

    try {
      const commitHash = await fastify.gitSync.commit(message, files);
      return { ok: true, commit: commitHash, message };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to commit');
    }
  });

  // POST /api/sync/push — push to remote
  fastify.post('/sync/push', async (_request, reply) => {
    try {
      const remote = await fastify.gitSync.getRemote();
      if (!remote) {
        return reply.status(400).send({
          error: 'No remote configured',
          detail: 'Set a remote URL via POST /api/sync/remote before pushing.',
        });
      }
      await fastify.gitSync.push();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to push');
    }
  });

  // POST /api/sync/pull — pull from remote
  fastify.post('/sync/pull', async (_request, reply) => {
    try {
      const remote = await fastify.gitSync.getRemote();
      if (!remote) {
        return reply.status(400).send({
          error: 'No remote configured',
          detail: 'Set a remote URL via POST /api/sync/remote before pulling.',
        });
      }
      const result = await fastify.gitSync.pull();
      if (result.conflicts.length > 0) {
        return { ok: true, conflicts: result.conflicts };
      }
      return { ok: true, conflicts: [] };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to pull');
    }
  });

  // GET /api/sync/conflicts — list files with merge conflicts and their parsed regions
  fastify.get('/sync/conflicts', async (_request, reply) => {
    try {
      const conflicts = await fastify.gitSync.getConflicts();
      return { conflicts };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get conflicts');
    }
  });

  // POST /api/sync/conflicts/resolve — resolve conflicts for specific files
  fastify.post<{
    Body: { resolutions: Array<{ file: string; choices: Record<number, 'ours' | 'theirs'> }> };
  }>('/sync/conflicts/resolve', async (request, reply) => {
    try {
      const { resolutions } = request.body ?? {};
      if (!resolutions || !Array.isArray(resolutions)) {
        return reply.status(400).send({ error: 'resolutions array is required' });
      }
      if (resolutions.length === 0) {
        return reply.status(400).send({ error: 'resolutions array must not be empty' });
      }
      // Validate, resolve, and stage all files atomically (with rollback on failure).
      // resolveAllConflicts throws BadRequestError (400) for invalid inputs.
      await fastify.gitSync.resolveAllConflicts(resolutions);
      // Finalize merge if no conflicts remain
      await fastify.gitSync.finalizeMerge();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to resolve conflicts');
    }
  });

  // POST /api/sync/conflicts/abort — abort the current merge
  fastify.post('/sync/conflicts/abort', async (_request, reply) => {
    try {
      await fastify.gitSync.abortMerge();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to abort merge');
    }
  });

  // GET /api/sync/log — recent commits
  fastify.get<{ Querystring: { limit?: string; offset?: string; search?: string } }>('/sync/log', async (request, reply) => {
    try {
      const raw = parseInt(request.query.limit ?? '', 10);
      const limit = isNaN(raw) || raw < 1 ? 20 : Math.min(raw, 100);
      const rawOffset = parseInt(request.query.offset ?? '0', 10);
      const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;
      const search = request.query.search?.trim() || undefined;
      // Fetch one extra to determine if there are more results
      const log = await fastify.gitSync.log(limit + 1, offset, search);
      const all = log.all;
      const hasMore = all.length > limit;
      return {
        commits: all.slice(0, limit).map(entry => ({
          hash: entry.hash,
          date: entry.date,
          message: entry.message,
          author: entry.author_name,
        })),
        hasMore,
      };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get log');
    }
  });

  // GET /api/sync/log/:hash/tokens — token-level diff for a specific commit
  fastify.get<{ Params: { hash: string } }>('/sync/log/:hash/tokens', async (request, reply) => {
    const { hash } = request.params;
    // Validate hash is safe (hex characters only)
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) {
      return reply.status(400).send({ error: 'Invalid commit hash' });
    }

    try {
      const fileDiffs = await fastify.gitSync.getTokenFileDiffs(hash);
      const changes = buildTokenDiff(fileDiffs);
      return { hash, changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to get commit diff');
    }
  });

  // GET /api/sync/compare — token-level diff between two arbitrary commits
  // Query params: from=<hash>&to=<hash>
  fastify.get<{ Querystring: { from: string; to: string } }>('/sync/compare', async (request, reply) => {
    const { from, to } = request.query;
    if (!from || !to) {
      return reply.status(400).send({ error: 'Missing required query params: from, to' });
    }
    if (!/^[0-9a-f]{4,40}$/i.test(from) || !/^[0-9a-f]{4,40}$/i.test(to)) {
      return reply.status(400).send({ error: 'Invalid commit hash' });
    }
    try {
      const fileDiffs = await fastify.gitSync.diffBetweenCommits(from, to);
      const changes = buildTokenDiff(fileDiffs);
      return { from, to, changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to compare commits');
    }
  });

  // POST /api/sync/log/:hash/restore — restore tokens to their state before this commit
  // Body: { tokens?: Array<{ path: string; set: string }> }
  // If tokens is omitted, restores ALL changed tokens in the commit.
  fastify.post<{
    Params: { hash: string };
    Body: { tokens?: Array<{ path: string; set: string }> };
  }>('/sync/log/:hash/restore', async (request, reply) => {
    const { hash } = request.params;
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) {
      return reply.status(400).send({ error: 'Invalid commit hash' });
    }

    try {
      const fileDiffs = await fastify.gitSync.getTokenFileDiffs(hash);

      // Build before/after maps per set
      const beforeBySet = new Map<string, Map<string, Token>>();
      const afterBySet = new Map<string, Map<string, Token>>();
      for (const diff of fileDiffs) {
        const setName = diff.file.replace('.tokens.json', '');
        const beforeTokens = new Map<string, Token>();
        const afterTokens = new Map<string, Token>();
        if (diff.before) {
          try {
            for (const [p, t] of flattenTokenGroup(JSON.parse(diff.before))) {
              beforeTokens.set(p, t as Token);
            }
          } catch { /* skip */ }
        }
        if (diff.after) {
          try {
            for (const [p, t] of flattenTokenGroup(JSON.parse(diff.after))) {
              afterTokens.set(p, t as Token);
            }
          } catch { /* skip */ }
        }
        beforeBySet.set(setName, beforeTokens);
        afterBySet.set(setName, afterTokens);
      }

      // Determine which tokens to restore
      const requested = request.body?.tokens;
      const toRestore: Array<{ path: string; set: string; token: Token | null }> = [];

      if (requested && requested.length > 0) {
        // Restore specific tokens
        for (const { path: tokenPath, set: setName } of requested) {
          const before = beforeBySet.get(setName);
          const after = afterBySet.get(setName);
          if (!before && !after) continue;
          // The "before" state of this commit is what we want to restore to
          const beforeToken = before?.get(tokenPath) ?? null;
          const afterToken = after?.get(tokenPath) ?? null;
          // Only restore if the token actually changed in this commit
          if (beforeToken || afterToken) {
            toRestore.push({ path: tokenPath, set: setName, token: beforeToken });
          }
        }
      } else {
        // Restore all changed tokens
        for (const [setName, beforeTokens] of beforeBySet) {
          const afterTokens = afterBySet.get(setName) ?? new Map();
          // Added in this commit → remove (restore to null)
          for (const [p] of afterTokens) {
            if (!beforeTokens.has(p)) {
              toRestore.push({ path: p, set: setName, token: null });
            }
          }
          // Removed in this commit → restore
          for (const [p, t] of beforeTokens) {
            if (!afterTokens.has(p)) {
              toRestore.push({ path: p, set: setName, token: t });
            }
          }
          // Modified → restore to before
          for (const [p, afterToken] of afterTokens) {
            const beforeToken = beforeTokens.get(p);
            if (beforeToken && stableStringify(beforeToken.$value) !== stableStringify(afterToken.$value)) {
              toRestore.push({ path: p, set: setName, token: beforeToken });
            }
          }
        }
      }

      if (toRestore.length === 0) {
        return reply.status(400).send({ error: 'No tokens to restore' });
      }

      // Acquire token lock for the entire snapshot-restore-snapshot cycle
      return await withLock(async () => {
        // Snapshot current state for undo (operation-log)
        const allPaths = toRestore.map(r => r.path);
        const allSets = [...new Set(toRestore.map(r => r.set))];
        const beforeSnapshot: Record<string, { token: Token | null; setName: string }> = {};
        for (const setName of allSets) {
          const pathsInSet = toRestore.filter(r => r.set === setName).map(r => r.path);
          const snap = await snapshotPaths(fastify.tokenStore, setName, pathsInSet);
          Object.assign(beforeSnapshot, snap);
        }

        // Group by set and restore
        const bySet = new Map<string, Array<{ path: string; token: Token | null }>>();
        for (const { path: p, set: s, token } of toRestore) {
          let list = bySet.get(s);
          if (!list) { list = []; bySet.set(s, list); }
          list.push({ path: p, token });
        }
        for (const [setName, items] of bySet) {
          await fastify.tokenStore.restoreSnapshot(setName, items);
        }

        // Snapshot after state
        const afterSnapshot: Record<string, { token: Token | null; setName: string }> = {};
        for (const setName of allSets) {
          const pathsInSet = toRestore.filter(r => r.set === setName).map(r => r.path);
          const snap = await snapshotPaths(fastify.tokenStore, setName, pathsInSet);
          Object.assign(afterSnapshot, snap);
        }

        // Record in operation log
        const isSingle = toRestore.length === 1;
        const description = isSingle
          ? `Restore ${toRestore[0].path} from commit ${hash.slice(0, 7)}`
          : `Restore ${toRestore.length} tokens from commit ${hash.slice(0, 7)}`;
        const opEntry = await fastify.operationLog.record({
          type: 'version-restore',
          description,
          setName: allSets.join(', '),
          affectedPaths: allPaths,
          beforeSnapshot,
          afterSnapshot,
        });

        return {
          ok: true,
          restored: toRestore.length,
          operationId: opEntry.id,
          paths: allPaths,
        };
      });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to restore tokens');
    }
  });

  // POST /api/sync/remote — set remote URL
  fastify.post<{ Body: { url: string } }>('/sync/remote', async (request, reply) => {
    const { url } = request.body || {};
    if (!url || typeof url !== 'string') {
      return reply.status(400).send({ error: 'Remote URL is required' });
    }

    const trimmed = url.trim();
    // Accept HTTPS, SSH (git@host:path), git://, and file:// remote URLs
    const validPatterns = [
      /^https?:\/\/.+/,         // https://github.com/user/repo.git
      /^git@[\w.-]+:.+/,        // git@github.com:user/repo.git
      /^ssh:\/\/.+/,            // ssh://git@github.com/user/repo.git
      /^git:\/\/.+/,            // git://github.com/repo.git
      /^file:\/\/.+/,           // file:///path/to/repo
    ];
    if (!validPatterns.some(p => p.test(trimmed))) {
      return reply.status(400).send({
        error: 'Invalid remote URL format. Expected an HTTPS, SSH, or git:// URL (e.g. https://github.com/user/repo.git or git@github.com:user/repo.git).',
      });
    }

    try {
      await fastify.gitSync.setRemote(trimmed);
      return { ok: true, remote: trimmed };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to set remote');
    }
  });

  // GET /api/sync/branches — list branches
  fastify.get('/sync/branches', async (_request, reply) => {
    try {
      const branches = await fastify.gitSync.getBranches();
      const current = await fastify.gitSync.getCurrentBranch();
      return { branches, current };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list branches');
    }
  });

  // POST /api/sync/checkout — checkout branch
  fastify.post<{ Body: { branch: string; create?: boolean } }>('/sync/checkout', async (request, reply) => {
    const { branch, create } = request.body || {};
    if (!branch) {
      return reply.status(400).send({ error: 'Branch name is required' });
    }

    try {
      if (create) {
        await fastify.gitSync.createBranch(branch);
      } else {
        await fastify.gitSync.checkout(branch);
      }
      return { ok: true, branch, created: !!create };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to checkout branch');
    }
  });

  // GET /api/sync/push/preview — token-level diff of what push would send + commit list
  fastify.get('/sync/push/preview', async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo) return reply.status(400).send({ error: 'Not a git repository' });

      const { commits, fileDiffs } = await fastify.gitSync.getPushPreview();
      const changes = buildTokenDiff(fileDiffs);
      return { commits, changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to compute push preview');
    }
  });

  // GET /api/sync/pull/preview — token-level diff of what pull would bring in + commit list
  fastify.get('/sync/pull/preview', async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo) return reply.status(400).send({ error: 'Not a git repository' });

      const { commits, fileDiffs } = await fastify.gitSync.getPullPreview();
      const changes = buildTokenDiff(fileDiffs);
      return { commits, changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to compute pull preview');
    }
  });

  // GET /api/sync/diff/tokens — token-level diff of uncommitted working tree changes vs HEAD
  fastify.get('/sync/diff/tokens', async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo) return reply.status(400).send({ error: 'Not a git repository' });

      const fileDiffs = await fastify.gitSync.getWorkingTreeTokenDiff();
      const changes = buildTokenDiff(fileDiffs);
      return { changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to compute token diff');
    }
  });

  // GET /api/sync/diff — compute two-way diff between local HEAD and remote
  fastify.get('/sync/diff', async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo) return reply.status(400).send({ error: 'Not a git repository' });
      const diff = await fastify.gitSync.computeUnifiedDiff();
      return diff;
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to compute diff');
    }
  });

  // POST /api/sync/apply-diff — apply direction choices from unified diff
  fastify.post<{ Body: { choices: Record<string, 'push' | 'pull' | 'skip'> } }>(
    '/sync/apply-diff',
    async (request, reply) => {
      try {
        const { choices } = request.body ?? {};
        if (!choices) return reply.status(400).send({ error: 'choices is required' });
        const result = await fastify.gitSync.applyDiffChoices(choices);
        const hasFailures = result.pullFailedFiles.length > 0
          || result.pullCommitFailed
          || result.pushCommitFailed
          || result.pushFailed;
        return { ok: true, applied: !hasFailures, ...result };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to apply diff');
      }
    },
  );
};
