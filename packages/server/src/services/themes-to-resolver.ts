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

interface TokenSetSource {
  name: string;
  tokens: TokenGroup;
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

function createModeOverrideToken(token: Token, overrideValue: unknown): Token {
  const nextToken = stripModeAuthoringExtensions(token);
  nextToken.$value = overrideValue as Token['$value'];
  return nextToken;
}

function buildFoundationSet(tokenSets: TokenSetSource[]): TokenGroup {
  const foundation: TokenGroup = {};

  for (const set of tokenSets) {
    for (const [path, rawToken] of flattenTokenGroup(set.tokens)) {
      const token = rawToken as Token;
      setTokenAtPath(foundation, path, stripModeAuthoringExtensions(token));
    }
  }

  return foundation;
}

function buildModifierContexts(
  tokenSets: TokenSetSource[],
  dimension: ThemeDimension,
): ResolverModifier {
  const contexts: Record<string, TokenGroup[]> = {};

  for (const option of dimension.options) {
    const contextTokens: TokenGroup = {};

    for (const set of tokenSets) {
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
    }

    contexts[option.name] = [contextTokens];
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
  const sets =
    tokenSets.length > 0
      ? {
          foundation: {
            description: 'Base token values generated from collections',
            sources: [buildFoundationSet(tokenSets)],
          },
        }
      : undefined;

  const modifiers = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.id,
      buildModifierContexts(tokenSets, dimension),
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
