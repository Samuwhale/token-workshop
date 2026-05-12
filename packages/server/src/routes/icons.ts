import type { FastifyPluginAsync } from "fastify";
import { handleRouteError } from "../errors.js";

export const iconRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/icons", async (_request, reply) => {
    try {
      await fastify.iconStore.reloadFromDisk();
      return { registry: fastify.iconStore.getRegistry() };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load icons");
    }
  });

  fastify.get<{ Params: { iconId: string } }>(
    "/icons/:iconId/content",
    async (request, reply) => {
      try {
        const result = await fastify.iconStore.getSvgContent(
          request.params.iconId,
        );
        return {
          icon: result.icon,
          content: result.content,
          hash: result.icon.svg.hash,
        };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to load icon SVG content");
      }
    },
  );

  fastify.post<{ Body: unknown }>("/icons/contents", async (request, reply) => {
    try {
      const contents = await fastify.iconStore.getSvgContents(request.body);
      return { contents };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load icon SVG contents");
    }
  });

  fastify.post<{ Body: unknown }>("/icons/import/svg", async (request, reply) => {
    try {
      const result = await fastify.iconStore.importSvg(request.body);
      return reply.send({ ok: true, ...result });
    } catch (err) {
      return handleRouteError(reply, err, "Failed to import SVG icon");
    }
  });

  fastify.post<{ Body: unknown }>("/icons/import/svgs", async (request, reply) => {
    try {
      const result = await fastify.iconStore.importSvgs(request.body);
      return reply.send({ ok: true, ...result });
    } catch (err) {
      return handleRouteError(reply, err, "Failed to import SVG icons");
    }
  });

  fastify.patch<{ Params: { iconId: string }; Body: unknown }>(
    "/icons/:iconId/figma",
    async (request, reply) => {
      try {
        const result = await fastify.iconStore.updateFigmaLink(
          request.params.iconId,
          request.body,
        );
        return reply.send({ ok: true, ...result });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to update icon Figma link");
      }
    },
  );

  fastify.patch<{ Body: unknown }>(
    "/icons/figma-links",
    async (request, reply) => {
      try {
        const result = await fastify.iconStore.updateFigmaLinks(request.body);
        return reply.send({ ok: true, ...result });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to update icon Figma links");
      }
    },
  );
};
