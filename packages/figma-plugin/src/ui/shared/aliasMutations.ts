import type { Token, TokenCollection } from "@tokenmanager/core";
import {
  readTokenModeValuesForCollection,
  resolveCollectionIdForPath,
  writeTokenModeValuesForCollection,
} from "@tokenmanager/core";
import {
  fetchToken,
  updateToken,
  type TokenMutationBody,
} from "./tokenMutations";

interface FetchedToken {
  token?: Token;
}

async function readToken(
  serverUrl: string,
  collectionId: string,
  tokenPath: string,
): Promise<Token> {
  const response = await fetchToken<FetchedToken>(
    serverUrl,
    collectionId,
    tokenPath,
  );
  if (!response.token) {
    throw new Error(`Token "${tokenPath}" not found in "${collectionId}"`);
  }
  return response.token;
}

function buildModePatchBody(
  token: Token,
  collection: TokenCollection,
  modeUpdates: Record<string, unknown>,
): TokenMutationBody {
  const currentValues = readTokenModeValuesForCollection(token, collection);
  const nextValues = { ...currentValues, ...modeUpdates };
  const draft: Token = {
    ...token,
    $extensions: token.$extensions ? structuredClone(token.$extensions) : undefined,
  } as Token;
  writeTokenModeValuesForCollection(draft, collection, nextValues);
  return {
    $value: draft.$value,
    $extensions: draft.$extensions ?? null,
  };
}

export async function rewireAliasModes(params: {
  serverUrl: string;
  collection: TokenCollection;
  tokenPath: string;
  targetPath: string;
  targetCollectionId: string;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  modeNames: string[];
}): Promise<void> {
  const {
    serverUrl,
    collection,
    tokenPath,
    targetPath,
    targetCollectionId,
    pathToCollectionId,
    collectionIdsByPath,
    modeNames,
  } = params;
  const targetResolution = resolveCollectionIdForPath({
    path: targetPath,
    pathToCollectionId,
    collectionIdsByPath,
    preferredCollectionId: collection.id,
  });
  if (targetResolution.collectionId !== targetCollectionId) {
    throw new Error(
      targetResolution.reason === "ambiguous"
        ? `Cannot store an unambiguous alias to "${targetPath}" because that path exists in multiple collections.`
        : `Cannot store an alias to "${targetPath}" in collection "${targetCollectionId}" from "${collection.id}".`,
    );
  }
  const token = await readToken(serverUrl, collection.id, tokenPath);
  const aliasRef = `{${targetPath}}`;
  const updates: Record<string, unknown> = {};
  for (const modeName of modeNames) {
    updates[modeName] = aliasRef;
  }
  const body = buildModePatchBody(token, collection, updates);
  await updateToken(serverUrl, collection.id, tokenPath, body);
}

export async function detachAliasModes(params: {
  serverUrl: string;
  collection: TokenCollection;
  tokenPath: string;
  modeLiterals: Record<string, unknown>;
}): Promise<void> {
  const { serverUrl, collection, tokenPath, modeLiterals } = params;
  if (Object.keys(modeLiterals).length === 0) return;
  const token = await readToken(serverUrl, collection.id, tokenPath);
  const body = buildModePatchBody(token, collection, modeLiterals);
  await updateToken(serverUrl, collection.id, tokenPath, body);
}
