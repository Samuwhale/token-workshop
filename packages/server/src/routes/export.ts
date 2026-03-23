import type { FastifyPluginAsync } from 'fastify';
import { exportTokens, type ExportPlatform } from '../services/style-dict.js';

const VALID_PLATFORMS: ExportPlatform[] = ['css', 'dart', 'ios-swift', 'android', 'json'];

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/export — export tokens to specified platforms
  fastify.post<{ Body: { platforms: ExportPlatform[] } }>(
    '/export',
    async (request, reply) => {
      const { platforms } = request.body || {};

      if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
        return reply.status(400).send({
          error: 'At least one platform is required',
          validPlatforms: VALID_PLATFORMS,
        });
      }

      // Validate platforms
      const invalid = platforms.filter(p => !VALID_PLATFORMS.includes(p));
      if (invalid.length > 0) {
        return reply.status(400).send({
          error: `Invalid platform(s): ${invalid.join(', ')}`,
          validPlatforms: VALID_PLATFORMS,
        });
      }

      try {
        const tokenData = fastify.tokenStore.getAllTokenData();
        const results = await exportTokens(tokenData, platforms);
        return { results };
      } catch (err) {
        reply.status(500).send({ error: 'Failed to export tokens', detail: String(err) });
      }
    },
  );
};
