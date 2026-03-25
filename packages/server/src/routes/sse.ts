import type { FastifyPluginAsync } from 'fastify';

export const sseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send initial connection event
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    const unsubscribe = fastify.tokenStore.onChange((event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Keep alive ping every 15 seconds
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    request.raw.on('close', () => {
      unsubscribe();
      clearInterval(keepAlive);
      reply.raw.end();
    });
  });
};
