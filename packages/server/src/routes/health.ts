import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync<{ version: string }> = async (fastify, opts) => {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      version: opts.version,
      timestamp: new Date().toISOString(),
    };
  });
};
