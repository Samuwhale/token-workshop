import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Theme, ThemesFile, ThemeSetStatus } from '@tokenmanager/core';

const VALID_THEME_SET_STATUSES = new Set<string>(['enabled', 'disabled', 'source']);

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

export const themeRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (fastify, opts) => {
  const tokenDir = path.resolve(opts.tokenDir);

  // GET /api/themes — list themes
  fastify.get('/themes', async (_request, reply) => {
    try {
      const dir = tokenDir;
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
    const invalidStatuses = Object.entries(theme.sets).filter(
      ([, v]) => !VALID_THEME_SET_STATUSES.has(v as string),
    );
    if (invalidStatuses.length > 0) {
      return reply.status(400).send({
        error: `Invalid set status values: ${invalidStatuses.map(([k, v]) => `"${k}": "${v}"`).join(', ')}. Must be "enabled", "disabled", or "source".`,
      });
    }

    try {
      const dir = tokenDir;
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
      const dir = tokenDir;
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
