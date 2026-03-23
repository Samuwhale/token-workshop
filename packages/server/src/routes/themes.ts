import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Theme, ThemesFile } from '@tokenmanager/core';

interface ThemesStore {
  filePath: string;
  load(): Promise<Theme[]>;
  save(themes: Theme[]): Promise<void>;
}

function createThemesStore(tokenDir: string): ThemesStore {
  const filePath = path.join(tokenDir, '$themes.json');

  return {
    filePath,

    async load(): Promise<Theme[]> {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content) as ThemesFile;
        return data.$themes || [];
      } catch {
        return [];
      }
    },

    async save(themes: Theme[]): Promise<void> {
      const data: ThemesFile = { $themes: themes };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    },
  };
}

export const themeRoutes: FastifyPluginAsync = async (fastify) => {
  // Determine token directory from the tokenStore's internal dir.
  // We access it through a known set file or use the configured path.
  // For simplicity, reconstruct the dir from the server config.
  let tokenDir: string;

  fastify.addHook('onReady', async () => {
    // Get the token directory from a set's filePath, or fallback
    const sets = await fastify.tokenStore.getSets();
    if (sets.length > 0) {
      const set = await fastify.tokenStore.getSet(sets[0]);
      if (set?.filePath) {
        tokenDir = path.dirname(set.filePath);
        return;
      }
    }
    // Fallback: get from cwd-based default
    tokenDir = path.resolve('./tokens');
  });

  // We need a way to get tokenDir before onReady in route handlers.
  // Use a lazy approach: derive from the store on first call.
  async function getTokenDir(): Promise<string> {
    if (tokenDir) return tokenDir;
    const sets = await fastify.tokenStore.getSets();
    if (sets.length > 0) {
      const set = await fastify.tokenStore.getSet(sets[0]);
      if (set?.filePath) {
        tokenDir = path.dirname(set.filePath);
        return tokenDir;
      }
    }
    // Fallback: create a temp set to find the dir, then delete it
    const tmpSet = await fastify.tokenStore.createSet('__tmp_dir_probe__');
    tokenDir = path.dirname(tmpSet.filePath!);
    await fastify.tokenStore.deleteSet('__tmp_dir_probe__');
    return tokenDir;
  }

  // GET /api/themes — list themes
  fastify.get('/themes', async (_request, reply) => {
    try {
      const dir = await getTokenDir();
      const store = createThemesStore(dir);
      const themes = await store.load();
      return { themes };
    } catch (err) {
      reply.status(500).send({ error: 'Failed to load themes', detail: String(err) });
    }
  });

  // POST /api/themes — create or update theme
  fastify.post<{ Body: Theme }>('/themes', async (request, reply) => {
    const theme = request.body;
    if (!theme?.name) {
      return reply.status(400).send({ error: 'Theme name is required' });
    }
    if (!theme.sets || typeof theme.sets !== 'object') {
      return reply.status(400).send({ error: 'Theme must have a sets object' });
    }

    try {
      const dir = await getTokenDir();
      const store = createThemesStore(dir);
      const themes = await store.load();

      const existingIdx = themes.findIndex(t => t.name === theme.name);
      if (existingIdx >= 0) {
        themes[existingIdx] = theme;
      } else {
        themes.push(theme);
      }

      await store.save(themes);
      reply.status(existingIdx >= 0 ? 200 : 201).send({ theme });
    } catch (err) {
      reply.status(500).send({ error: 'Failed to save theme', detail: String(err) });
    }
  });

  // DELETE /api/themes/:name — delete theme
  fastify.delete<{ Params: { name: string } }>('/themes/:name', async (request, reply) => {
    const { name } = request.params;

    try {
      const dir = await getTokenDir();
      const store = createThemesStore(dir);
      const themes = await store.load();
      const filtered = themes.filter(t => t.name !== name);

      if (filtered.length === themes.length) {
        return reply.status(404).send({ error: `Theme "${name}" not found` });
      }

      await store.save(filtered);
      return { deleted: true, name };
    } catch (err) {
      reply.status(500).send({ error: 'Failed to delete theme', detail: String(err) });
    }
  });
};
