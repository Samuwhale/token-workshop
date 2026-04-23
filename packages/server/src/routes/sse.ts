import type { FastifyPluginAsync } from 'fastify';
import { isAllowedCorsOrigin } from '../cors.js';

export const sseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/events', async (request, reply) => {
    reply.hijack();

    // reply.hijack() bypasses Fastify's response pipeline (including @fastify/cors),
    // so we must set CORS headers manually on the raw response.
    const origin = request.headers.origin;
    const originAllowed = isAllowedCorsOrigin(origin);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(originAllowed && origin
        ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
        : {}),
    });

    const { eventBus } = fastify;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(keepAlive);
      reply.raw.end();
    };

    // Check if the client is reconnecting with a Last-Event-ID.
    // When the browser creates a new EventSource instance (after CLOSED), it cannot
    // carry the header automatically, so clients also pass it as a query param.
    const lastEventIdHeader = request.headers['last-event-id'];
    const lastEventIdQuery = (request.query as Record<string, string>)['lastEventId'];
    const rawLastEventId = lastEventIdHeader ?? lastEventIdQuery;
    const lastSeq = rawLastEventId ? parseInt(rawLastEventId as string, 10) : NaN;

    if (!isNaN(lastSeq)) {
      // Client is reconnecting — try to replay missed events
      const missed = eventBus.eventsSince(lastSeq);
      if (missed === null) {
        // Too stale — tell client to do a full refresh
        reply.raw.write(`id: ${eventBus.currentSeq()}\nevent: stale\ndata: ${JSON.stringify({ type: 'stale' })}\n\n`);
      } else {
        // Replay missed events
        for (const entry of missed) {
          if (closed) break;
          reply.raw.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}\n\n`);
        }
      }
    }

    // Send initial connection event with the current sequence number
    reply.raw.write(`id: ${eventBus.currentSeq()}\ndata: ${JSON.stringify({ type: 'connected', seq: eventBus.currentSeq() })}\n\n`);

    const unsubscribe = eventBus.subscribe((entry) => {
      if (closed) return;
      try {
        reply.raw.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}\n\n`);
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
