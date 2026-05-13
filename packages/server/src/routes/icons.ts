import archiver from "archiver";
import type { FastifyPluginAsync } from "fastify";
import { handleRouteError } from "../errors.js";
import {
  browsePublicIconCollection,
  listPublicIconCollections,
  listPublicIconProviders,
  searchPublicIcons,
} from "../services/icon-public-sources.js";

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

  fastify.post<{ Body: unknown }>(
    "/icons/import/figma",
    async (request, reply) => {
      try {
        const result = await fastify.iconStore.importFigmaSelection(request.body);
        return reply.send({ ok: true, ...result });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to import Figma icons");
      }
    },
  );

  fastify.get("/icons/public/providers", async (_request, reply) => {
    try {
      return { providers: listPublicIconProviders() };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load public icon providers");
    }
  });

  fastify.get<{ Querystring: Record<string, unknown> }>(
    "/icons/public/search",
    async (request, reply) => {
      try {
        return await searchPublicIcons(request.query);
      } catch (err) {
        return handleRouteError(reply, err, "Failed to search public icons");
      }
    },
  );

  fastify.get<{ Querystring: Record<string, unknown> }>(
    "/icons/public/collections",
    async (request, reply) => {
      try {
        return await listPublicIconCollections(request.query);
      } catch (err) {
        return handleRouteError(reply, err, "Failed to load public icon collections");
      }
    },
  );

  fastify.get<{ Querystring: Record<string, unknown> }>(
    "/icons/public/collection",
    async (request, reply) => {
      try {
        return await browsePublicIconCollection(request.query);
      } catch (err) {
        return handleRouteError(reply, err, "Failed to browse public icon collection");
      }
    },
  );

  fastify.post<{ Body: unknown }>(
    "/icons/import/public",
    async (request, reply) => {
      try {
        const result = await fastify.iconStore.importPublicIcons(request.body);
        return reply.send({ ok: true, ...result });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to import public icons");
      }
    },
  );

  fastify.get("/icons/attribution", async (_request, reply) => {
    try {
      return await fastify.iconStore.getAttributionManifest();
    } catch (err) {
      return handleRouteError(reply, err, "Failed to export icon attribution");
    }
  });

  fastify.get("/icons/source-updates", async (_request, reply) => {
    try {
      return await fastify.iconStore.checkSourceUpdates();
    } catch (err) {
      return handleRouteError(reply, err, "Failed to check icon source updates");
    }
  });

  fastify.get("/icons/export", async (_request, reply) => {
    try {
      const bundle = await fastify.iconStore.getExportBundle();
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err) => {
        reply.raw.destroy(err);
      });
      for (const file of bundle.files) {
        archive.append(file.content, { name: file.path });
      }
      void archive.finalize();
      reply
        .header("Content-Type", "application/zip")
        .header(
          "Content-Disposition",
          `attachment; filename="${bundle.fileName}"`,
        )
        .header("X-Icon-Exported-Count", String(bundle.summary.exportedIconCount))
        .header("X-Icon-Skipped-Count", String(bundle.summary.skippedIconCount));
      return reply.send(archive);
    } catch (err) {
      return handleRouteError(reply, err, "Failed to export icons");
    }
  });

  fastify.patch<{ Params: { iconId: string }; Body: unknown }>(
    "/icons/:iconId/status",
    async (request, reply) => {
      try {
        const result = await fastify.iconStore.updateIconStatus(
          request.params.iconId,
          request.body,
        );
        return reply.send({ ok: true, ...result });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to update icon status");
      }
    },
  );

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
