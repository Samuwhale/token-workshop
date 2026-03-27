import type { FastifyPluginAsync } from 'fastify';

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
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
        },
      };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to get sync status', detail: String(err) });
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
      return { initialized: true };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to initialize git repo', detail: String(err) });
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
      return { commit: commitHash, message };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to commit', detail: String(err) });
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
      return { pushed: true };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to push', detail: String(err) });
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
      await fastify.gitSync.pull();
      return { pulled: true };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to pull', detail: String(err) });
    }
  });

  // GET /api/sync/log — recent commits
  fastify.get<{ Querystring: { limit?: string } }>('/sync/log', async (request, reply) => {
    try {
      const raw = parseInt(request.query.limit ?? '', 10);
      const limit = isNaN(raw) || raw < 1 ? 20 : Math.min(raw, 100);
      const log = await fastify.gitSync.log(limit);
      return {
        commits: log.all.map(entry => ({
          hash: entry.hash,
          date: entry.date,
          message: entry.message,
          author: entry.author_name,
        })),
      };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to get log', detail: String(err) });
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
      return { remote: trimmed };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to set remote', detail: String(err) });
    }
  });

  // GET /api/sync/branches — list branches
  fastify.get('/sync/branches', async (_request, reply) => {
    try {
      const branches = await fastify.gitSync.getBranches();
      const current = await fastify.gitSync.getCurrentBranch();
      return { branches, current };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to list branches', detail: String(err) });
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
      return { branch, created: !!create };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to checkout branch', detail: String(err) });
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
      return reply.status(500).send({ error: 'Failed to compute diff', detail: String(err) });
    }
  });

  // POST /api/sync/apply-diff — apply direction choices from unified diff
  fastify.post<{ Body: { choices: Record<string, 'push' | 'pull' | 'skip'> } }>(
    '/sync/apply-diff',
    async (request, reply) => {
      try {
        const { choices } = request.body ?? {};
        if (!choices) return reply.status(400).send({ error: 'choices is required' });
        await fastify.gitSync.applyDiffChoices(choices);
        return { applied: true };
      } catch (err) {
        return reply.status(500).send({ error: 'Failed to apply diff', detail: String(err) });
      }
    },
  );
};
