/**
 * Convert existing $themes.json dimensions into a DTCG v2025.10 resolver file.
 *
 * Each ThemeDimension becomes a modifier with its options as contexts.
 * Sets with status "source" form a base set; "enabled" sets go into
 * the modifier context. The resolutionOrder puts the base set first,
 * then modifiers in dimension order.
 */

import type { ThemeDimension, ResolverFile, ResolverSet, ResolverModifier, ResolverSource } from '@tokenmanager/core';

function setNameToRef(setName: string): ResolverSource {
  return { $ref: `${setName}.tokens.json` };
}

export function convertThemesToResolver(
  dimensions: ThemeDimension[],
  allSetNames: string[],
): ResolverFile {
  const sets: Record<string, ResolverSet> = {};
  const modifiers: Record<string, ResolverModifier> = {};
  const resolutionOrder: { $ref: string }[] = [];

  // Collect all set names referenced by any dimension option
  const themedSetNames = new Set<string>();
  for (const dim of dimensions) {
    for (const opt of dim.options) {
      for (const setName of Object.keys(opt.sets)) {
        themedSetNames.add(setName);
      }
    }
  }

  // Base set: all sets NOT assigned to any dimension (global foundation)
  const baseSources: ResolverSource[] = [];
  for (const setName of allSetNames) {
    if (!themedSetNames.has(setName)) {
      baseSources.push(setNameToRef(setName));
    }
  }

  // Also collect source-status sets across all dimensions as foundation
  const sourceSets = new Set<string>();
  for (const dim of dimensions) {
    for (const opt of dim.options) {
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status === 'source') sourceSets.add(setName);
      }
    }
  }
  for (const setName of sourceSets) {
    baseSources.push(setNameToRef(setName));
  }

  if (baseSources.length > 0) {
    sets['foundation'] = {
      description: 'Base tokens not controlled by any theme dimension',
      sources: baseSources,
    };
    resolutionOrder.push({ $ref: '#/sets/foundation' });
  }

  // Each dimension becomes a modifier
  for (const dim of dimensions) {
    const contexts: Record<string, ResolverSource[]> = {};
    let defaultContext: string | undefined;

    for (let i = 0; i < dim.options.length; i++) {
      const opt = dim.options[i];
      const contextSources: ResolverSource[] = [];

      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status === 'enabled') {
          contextSources.push(setNameToRef(setName));
        }
      }

      contexts[opt.name] = contextSources;
      if (i === 0) defaultContext = opt.name;
    }

    const modName = dim.name.toLowerCase().replace(/\s+/g, '-');
    modifiers[modName] = {
      description: dim.name,
      contexts,
      default: defaultContext,
    };
    resolutionOrder.push({ $ref: `#/modifiers/${modName}` });
  }

  return {
    version: '2025.10',
    name: 'Migrated from themes',
    description: 'Auto-generated from $themes.json dimensions',
    sets,
    modifiers,
    resolutionOrder,
  };
}
