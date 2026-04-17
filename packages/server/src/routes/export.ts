import type { FastifyPluginAsync } from 'fastify';
import { exportTokens, type ExportPlatform, type CssExportOptions } from '../services/style-dict.js';
import type { TokenGroup } from '@tokenmanager/core';
import { handleRouteError } from '../errors.js';

const VALID_PLATFORMS: ExportPlatform[] = ['css', 'dart', 'ios-swift', 'android', 'json', 'scss', 'less', 'typescript', 'tailwind', 'css-in-js'];

/**
 * Recursively filter a token group, keeping only tokens whose resolved $type
 * is in the given set. Parent-group $type is inherited when a leaf has none.
 * Returns null if the filtered group is empty.
 */
function filterTokensByType(group: TokenGroup, types: string[], inheritedType?: string): TokenGroup | null {
  const result: TokenGroup = {};
  let hasContent = false;

  const groupType = (group.$type as string | undefined) ?? inheritedType;

  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) {
      // Keep metadata fields as-is
      result[key] = value;
      continue;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if ('$value' in obj) {
        // Leaf token
        const tokenType = (obj.$type as string | undefined) ?? groupType;
        if (tokenType && types.includes(tokenType)) {
          result[key] = value;
          hasContent = true;
        }
      } else {
        // Nested group — recurse
        const filtered = filterTokensByType(value as TokenGroup, types, groupType);
        if (filtered !== null) {
          result[key] = filtered;
          hasContent = true;
        }
      }
    }
  }

  return hasContent ? result : null;
}

/**
 * Filter a token group to only include tokens whose full dot-separated paths are in the given set.
 * Returns null if the filtered group is empty.
 */
function filterTokensByPaths(group: TokenGroup, paths: Set<string>, prefix?: string): TokenGroup | null {
  const result: TokenGroup = {};
  let hasContent = false;

  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) {
      result[key] = value;
      continue;
    }
    if (value && typeof value === 'object') {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const obj = value as Record<string, unknown>;
      if ('$value' in obj) {
        // Leaf token — include only if path is in the set
        if (paths.has(currentPath)) {
          result[key] = value;
          hasContent = true;
        }
      } else {
        // Nested group — recurse
        const filtered = filterTokensByPaths(value as TokenGroup, paths, currentPath);
        if (filtered !== null) {
          result[key] = filtered;
          hasContent = true;
        }
      }
    }
  }

  return hasContent ? result : null;
}

/**
 * Validate a CSS selector string to prevent injection.
 * Allows typical selectors: element names, classes, IDs, attributes, pseudo-classes,
 * combinators, and common punctuation — but rejects braces, semicolons, comments,
 * and other characters that could break out of a selector context.
 */
function isValidCssSelector(selector: string): boolean {
  if (!selector || selector.length > 200) return false;
  // Reject characters that could escape the selector context in CSS output
  // Braces, semicolons, angle brackets, comments, @-rules, backticks, quotes
  if (/[{};<>`@\\]|\/\*|\*\//.test(selector)) return false;
  // Must look like a selector (starts with a word char, dot, hash, colon, or bracket)
  if (!/^[a-zA-Z.#:[*]/.test(selector)) return false;
  return true;
}

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/export — export tokens to specified platforms
  // Optional body fields:
  //   collections: string[]     — export only these collections (default: all collections)
  //   group: string[]           — path segments to a sub-group within each collection (e.g. ["color","brand"])
  //                               Using an array avoids ambiguity when segment names contain literal dots.
  //   types: string[]           — keep only tokens whose $type is in this list (default: all types)
  //   pathPrefix: string        — keep only tokens under this dot-separated path prefix (e.g. "color.brand")
  //   cssSelector: string       — CSS selector to wrap CSS variables (default: :root)
  //   changedPaths: string[]    — keep only tokens whose full dot-separated path is in this list (for "changes only" export)
  fastify.post<{ Body: { platforms: ExportPlatform[]; collections?: string[]; group?: string[]; types?: string[]; pathPrefix?: string; cssSelector?: string; changedPaths?: string[] } }>(
    '/export',
    async (request, reply) => {
      const { platforms, collections, group, types, pathPrefix, cssSelector, changedPaths } = request.body || {};

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
        const collectionIds = await fastify.collectionService.listCollectionIds();
        const allowedCollectionIds = new Set(collectionIds);
        const allTokenData = Object.fromEntries(
          Object.entries(fastify.tokenStore.getAllTokenData()).filter(
            ([collectionId]) => allowedCollectionIds.has(collectionId),
          ),
        );

        // Filter by collections (if provided, only include the specified collections)
        let tokenData: Record<string, TokenGroup> = allTokenData;
        if (collections && collections.length > 0) {
          await fastify.collectionService.requireCollectionsExist(collections);
          tokenData = {};
          for (const collectionId of collections) {
            if (allTokenData[collectionId]) {
              tokenData[collectionId] = allTokenData[collectionId];
            }
          }
        }

        // Filter by group (navigate nested path segments within each collection)
        if (group && group.length > 0) {
          const segments = group;
          const filtered: Record<string, TokenGroup> = {};
          for (const [collectionId, tokens] of Object.entries(tokenData)) {
            let current: TokenGroup | undefined = tokens;
            for (const seg of segments) {
              if (current && typeof current === 'object' && seg in current) {
                current = (current as Record<string, unknown>)[seg] as TokenGroup | undefined;
              } else {
                current = undefined;
                break;
              }
            }
            if (current && typeof current === 'object') {
              filtered[collectionId] = current;
            }
          }
          tokenData = filtered;
          if (Object.keys(tokenData).length === 0) {
            return reply.status(404).send({
              error: `Group "${group}" not found in any token collection`,
            });
          }
        }

        // Filter by path prefix (dot-separated, e.g. "color.brand")
        if (pathPrefix && pathPrefix.trim()) {
          const segments = pathPrefix.trim().split('.');
          const filtered: Record<string, TokenGroup> = {};
          for (const [collectionId, tokens] of Object.entries(tokenData)) {
            let current: TokenGroup | undefined = tokens;
            for (const seg of segments) {
              if (current && typeof current === 'object' && seg in current) {
                current = (current as Record<string, unknown>)[seg] as TokenGroup | undefined;
              } else {
                current = undefined;
                break;
              }
            }
            if (current && typeof current === 'object') {
              filtered[collectionId] = current;
            }
          }
          tokenData = filtered;
          if (Object.keys(tokenData).length === 0) {
            return reply.status(404).send({
              error: `Path prefix "${pathPrefix}" not found in any token collection`,
            });
          }
        }

        // Filter by token type
        if (types && types.length > 0) {
          const filtered: Record<string, TokenGroup> = {};
          for (const [collectionId, tokens] of Object.entries(tokenData)) {
            const result = filterTokensByType(tokens, types);
            if (result !== null) {
              filtered[collectionId] = result;
            }
          }
          tokenData = filtered;
          if (Object.keys(tokenData).length === 0) {
            return reply.status(404).send({
              error: `No tokens with type(s) "${types.join(', ')}" found`,
            });
          }
        }

        // Filter by specific changed paths (for "changes only" export mode)
        if (changedPaths && changedPaths.length > 0) {
          const pathSet = new Set(changedPaths);
          const filtered: Record<string, TokenGroup> = {};
          for (const [collectionId, tokens] of Object.entries(tokenData)) {
            const result = filterTokensByPaths(tokens, pathSet);
            if (result !== null) {
              filtered[collectionId] = result;
            }
          }
          tokenData = filtered;
          if (Object.keys(tokenData).length === 0) {
            return reply.status(404).send({
              error: 'None of the changed token paths were found in the current token data',
            });
          }
        }

        if (Object.keys(tokenData).length === 0) {
          return reply.status(404).send({
            error: collections && collections.length > 0
              ? `None of the requested collections exist: ${collections.join(', ')}`
              : 'No token data available to export',
          });
        }

        if (cssSelector && !isValidCssSelector(cssSelector)) {
          return reply.status(400).send({
            error: 'Invalid CSS selector — must not contain braces, semicolons, or other unsafe characters',
          });
        }

        const cssOptions: CssExportOptions | undefined = cssSelector
          ? { selector: cssSelector }
          : undefined;
        const { results, warnings } = await exportTokens(tokenData, platforms, undefined, cssOptions);
        return { results, ...(warnings.length > 0 && { warnings }) };
      } catch (err) {
        return handleRouteError(reply, err, 'Failed to export tokens');
      }
    },
  );
};
