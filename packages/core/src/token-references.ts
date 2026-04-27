import { readTokenCollectionModeValues } from './collections.js';
import { extractDerivationRefPaths, validateDerivationOps } from './derivation-ops.js';
import { collectReferencePaths } from './dtcg-types.js';
import { getTokenManagerExt, type Token } from './types.js';

export interface CollectTokenReferencePathsOptions {
  collectionId?: string;
  includeModeOverrides?: boolean;
  includeDerivationRefs?: boolean;
  includeExtends?: boolean;
}

export function collectTokenReferencePaths(
  token: { $value: unknown; $extensions?: Token['$extensions'] },
  options: CollectTokenReferencePathsOptions = {},
): string[] {
  const {
    collectionId,
    includeModeOverrides = true,
    includeDerivationRefs = true,
    includeExtends = false,
  } = options;
  const refs = new Set<string>(collectReferencePaths(token.$value));

  if (includeModeOverrides) {
    const modeValuesByCollection = readTokenCollectionModeValues(token);
    if (collectionId) {
      const collectionModes = modeValuesByCollection[collectionId];
      if (collectionModes) {
        for (const modeValue of Object.values(collectionModes)) {
          for (const refPath of collectReferencePaths(modeValue)) {
            refs.add(refPath);
          }
        }
      }
    } else {
      for (const collectionModes of Object.values(modeValuesByCollection)) {
        for (const modeValue of Object.values(collectionModes)) {
          for (const refPath of collectReferencePaths(modeValue)) {
            refs.add(refPath);
          }
        }
      }
    }
  }

  const tokenManager = getTokenManagerExt(token);

  if (includeExtends) {
    const extendsPath = tokenManager?.extends?.trim();
    if (extendsPath) {
      refs.add(extendsPath);
    }
  }

  if (includeDerivationRefs && tokenManager?.derivation) {
    try {
      const ops = validateDerivationOps(tokenManager.derivation.ops);
      for (const refPath of extractDerivationRefPaths(ops)) {
        refs.add(refPath);
      }
    } catch {
      // Ignore malformed derivation metadata so callers can keep scanning
      // references while the user is still editing an invalid token.
    }
  }

  return [...refs];
}
