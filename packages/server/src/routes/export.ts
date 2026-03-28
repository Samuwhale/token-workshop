import type { FastifyPluginAsync } from 'fastify';
import { exportTokens, type ExportPlatform, type CssExportOptions } from '../services/style-dict.js';
import type { TokenGroup } from '@tokenmanager/core';

const VALID_PLATFORMS: ExportPlatform[] = ['css', 'dart', 'ios-swift', 'android', 'json'];

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
  if (!/^[a-zA-Z.#:\[*]/.test(selector)) return false;
  return true;
}

export const exportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/export — export tokens to specified platforms
  // Optional body fields:
  //   sets: string[]    — export only these token sets (default: all sets)
  //   group: string[]   — path segments to a sub-group within each set (e.g. ["color","brand"] or ["spacing","1.5"])
  //                       Using an array avoids ambiguity when segment names contain literal dots.
  fastify.post<{ Body: { platforms: ExportPlatform[]; sets?: string[]; group?: string[]; cssSelector?: string } }>(
    '/export',
    async (request, reply) => {
      const { platforms, sets, group, cssSelector } = request.body || {};

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
        const allTokenData = fastify.tokenStore.getAllTokenData();

        // Filter by sets (if provided, only include the specified sets)
        let tokenData: Record<string, TokenGroup> = allTokenData;
        if (sets && sets.length > 0) {
          tokenData = {};
          for (const setName of sets) {
            if (allTokenData[setName]) {
              tokenData[setName] = allTokenData[setName];
            }
          }
        }

        // Filter by group (navigate nested path segments within each set)
        if (group && group.length > 0) {
          const segments = group;
          const filtered: Record<string, TokenGroup> = {};
          for (const [setName, tokens] of Object.entries(tokenData)) {
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
              filtered[setName] = current;
            }
          }
          tokenData = filtered;
          if (Object.keys(tokenData).length === 0) {
            return reply.status(404).send({
              error: `Group "${group}" not found in any token set`,
            });
          }
        }

        if (Object.keys(tokenData).length === 0) {
          return reply.status(404).send({
            error: sets && sets.length > 0
              ? `None of the requested sets exist: ${sets.join(', ')}`
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
        return reply.status(500).send({ error: 'Failed to export tokens', detail: String(err) });
      }
    },
  );
};
