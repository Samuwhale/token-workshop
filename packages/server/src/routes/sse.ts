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

    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(keepAlive);
      reply.raw.end();
    };

    const unsubscribe = fastify.tokenStore.onChange((event) => {
      if (closed) return;
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        fastify.log.warn({ err }, 'SSE write failed; closing connection');
        cleanup();
      }
    });

    // Keep alive ping every 15 seconds
    const keepAlive = setInterval(() => {
      if (closed) return;
      try {
        reply.raw.write(': keepalive\n\n');
      } catch (err) {
        fastify.log.warn({ err }, 'SSE keepalive write failed; closing connection');
        cleanup();
      }
    }, 15000);

    request.raw.on('close', () => {
      cleanup();
    });
  });
};
