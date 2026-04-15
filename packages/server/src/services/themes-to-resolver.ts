import {
  flattenTokenGroup,
  type ResolverFile,
  type ResolverModifier,
  type ThemeDimension,
  type Token,
  type TokenExtensions,
  type TokenGroup,
} from '@tokenmanager/core';
import { setTokenAtPath } from './token-tree-utils.js';

type ModeValues = Record<string, Record<string, unknown>>;

const RECIPE_EXTENSION_KEY = 'com.tokenmanager.recipe';

interface TokenSetSource {
  name: string;
  tokens: TokenGroup;
}

function isRecipeManagedToken(token: Token): boolean {
  return Boolean(token.$extensions?.[RECIPE_EXTENSION_KEY]);
}

function buildCanonicalTokenSource(tokens: TokenGroup): TokenGroup {
  const source: TokenGroup = {};

  for (const [path, rawToken] of flattenTokenGroup(tokens)) {
    const token = rawToken as Token;
    if (isRecipeManagedToken(token)) {
      continue;
    }
    setTokenAtPath(source, path, token);
  }

  return source;
}

function readTokenModes(token: Token): ModeValues | null {
  const modes = (token.$extensions as TokenExtensions | undefined)?.tokenmanager?.modes;
  if (!modes || typeof modes !== 'object' || Array.isArray(modes)) {
    return null;
  }
  return modes as ModeValues;
}

function stripModeAuthoringExtensions(token: Token): Token {
  const nextToken = structuredClone(token);
  const tokenmanager = nextToken.$extensions?.tokenmanager;
  if (!tokenmanager) {
    return nextToken;
  }

  delete tokenmanager.modes;
  if (Object.keys(tokenmanager).length === 0) {
    delete nextToken.$extensions?.tokenmanager;
  }
  if (nextToken.$extensions && Object.keys(nextToken.$extensions).length === 0) {
    delete nextToken.$extensions;
  }
  return nextToken;
}

function filterCanonicalTokenSets(tokenSets: TokenSetSource[]): TokenSetSource[] {
  const filtered: TokenSetSource[] = [];

  for (const set of tokenSets) {
    const canonicalTokens = buildCanonicalTokenSource(set.tokens);
    if (Object.keys(canonicalTokens).length === 0) {
      continue;
    }
    filtered.push({ name: set.name, tokens: canonicalTokens });
  }

  return filtered;
}

function createModeOverrideToken(token: Token, overrideValue: unknown): Token {
  const nextToken = stripModeAuthoringExtensions(token);
  nextToken.$value = overrideValue as Token['$value'];
  return nextToken;
}

function buildStrippedTokenSource(tokens: TokenGroup): TokenGroup {
  const source: TokenGroup = {};

  for (const [path, rawToken] of flattenTokenGroup(tokens)) {
    const token = rawToken as Token;
    setTokenAtPath(source, path, stripModeAuthoringExtensions(token));
  }

  return source;
}

function buildModifierContexts(
  tokenSets: TokenSetSource[],
  dimension: ThemeDimension,
): ResolverModifier {
  const contexts: Record<string, TokenGroup[]> = {};

  for (const option of dimension.options) {
    const contextSources: TokenGroup[] = [];

    for (const set of tokenSets) {
      const contextTokens: TokenGroup = {};

      for (const [path, rawToken] of flattenTokenGroup(set.tokens)) {
        const token = rawToken as Token;
        const overrideValue = readTokenModes(token)?.[dimension.id]?.[option.name];
        if (overrideValue === undefined) {
          continue;
        }
        setTokenAtPath(
          contextTokens,
          path,
          createModeOverrideToken(token, overrideValue),
        );
      }

      if (Object.keys(contextTokens).length > 0) {
        contextSources.push(contextTokens);
      }
    }

    contexts[option.name] = contextSources;
  }

  return {
    description: dimension.name,
    contexts,
    default: dimension.options[0]?.name,
  };
}

export function convertThemesToResolver(
  dimensions: ThemeDimension[],
  tokenSets: TokenSetSource[],
): ResolverFile {
  const canonicalTokenSets = filterCanonicalTokenSets(tokenSets);
  const sets =
    canonicalTokenSets.length > 0
      ? {
          foundation: {
            description: 'Base token values generated from collections',
            sources: canonicalTokenSets.map((set) => buildStrippedTokenSource(set.tokens)),
          },
        }
      : undefined;

  const modifiers = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.id,
      buildModifierContexts(canonicalTokenSets, dimension),
    ]),
  );

  const resolutionOrder = [
    ...(sets ? [{ $ref: '#/sets/foundation' }] : []),
    ...dimensions.map((dimension) => ({ $ref: `#/modifiers/${dimension.id}` })),
  ];

  return {
    version: '2025.10',
    name: 'Generated from theme modes',
    description: 'Generated from base token values and inline mode overrides',
    ...(sets ? { sets } : {}),
    modifiers,
    resolutionOrder,
  };
}
