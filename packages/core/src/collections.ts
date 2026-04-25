import type {
  CollectionMode,
  CollectionPublishRouting,
  SelectedModes,
  SerializedTokenCollection,
  Token,
  TokenCollection,
  TokenModeValues,
  TokenExtensions,
  ViewPreset,
} from "./types.js";
import { stableStringify } from "./stable-stringify.js";

export const COLLECTION_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

export function isValidCollectionName(name: string): boolean {
  return COLLECTION_NAME_RE.test(name);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isModeValuesRecord(value: unknown): value is TokenModeValues {
  return isPlainObject(value);
}

type ExtensionsReadableToken = {
  $extensions?: unknown;
};

type ModeReadableToken = ExtensionsReadableToken & {
  $value: unknown;
};

function normalizeCollectionMode(value: unknown): CollectionMode | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  return name ? { name } : null;
}

function normalizeCollectionPublishRouting(
  value: unknown,
): CollectionPublishRouting | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const collectionName =
    typeof value.collectionName === "string"
      ? value.collectionName.trim()
      : "";
  const modeName =
    typeof value.modeName === "string" ? value.modeName.trim() : "";

  if (!collectionName && !modeName) {
    return null;
  }

  return {
    ...(collectionName ? { collectionName } : {}),
    ...(modeName ? { modeName } : {}),
  };
}

function normalizeSerializedTokenCollection(
  value: unknown,
): SerializedTokenCollection | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) {
    return null;
  }

  const modes = Array.isArray(value.modes)
    ? value.modes
        .map((mode) => normalizeCollectionMode(mode))
        .filter((mode): mode is CollectionMode => mode !== null)
    : [];

  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  const publishRouting = normalizeCollectionPublishRouting(value.publishRouting);

  return {
    id,
    ...(description ? { description } : {}),
    ...(publishRouting ? { publishRouting } : {}),
    modes,
  };
}

function normalizeSelectedModesRecord(value: unknown): SelectedModes | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const selections: SelectedModes = {};
  for (const [collectionId, modeName] of Object.entries(value)) {
    if (collectionId.trim().length === 0 || typeof modeName !== "string") {
      continue;
    }
    selections[collectionId] = modeName;
  }
  return selections;
}

function normalizeViewPreset(value: unknown): ViewPreset | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const selections = normalizeSelectedModesRecord(value.selections);
  if (!id || !name || !selections) {
    return null;
  }

  return { id, name, selections };
}

export function findCollectionById(
  collections: TokenCollection[],
  collectionId: string,
): TokenCollection | null {
  return collections.find((collection) => collection.id === collectionId) ?? null;
}

export function readTokenCollectionModeValues(
  token: ExtensionsReadableToken | undefined,
): TokenModeValues {
  const rawModes = (token?.$extensions as TokenExtensions | undefined)?.tokenmanager?.modes;
  if (!isModeValuesRecord(rawModes)) {
    return {};
  }

  const modes: TokenModeValues = {};
  for (const [collectionId, modeValues] of Object.entries(rawModes)) {
    if (!isModeValuesRecord(modeValues)) {
      continue;
    }
    modes[collectionId] = { ...modeValues };
  }
  return modes;
}

export function tokenChangesAcrossModesInCollection(
  token: Pick<Token, "$value" | "$extensions"> | undefined,
  collectionId: string,
): boolean {
  if (!token || collectionId.trim().length === 0) {
    return false;
  }

  const collectionModes = readTokenCollectionModeValues(token)[collectionId];
  if (!collectionModes) {
    return false;
  }

  const primaryValue = stableStringify(token.$value);
  return Object.values(collectionModes).some(
    (value) =>
      value !== undefined &&
      value !== null &&
      stableStringify(value) !== primaryValue,
  );
}

export function sanitizeModeValuesForCollection(
  collection: Pick<TokenCollection, "modes">,
  modeValues: Record<string, unknown>,
): Record<string, unknown> {
  const secondaryModeNames = new Set(
    collection.modes.slice(1).map((mode) => mode.name),
  );
  if (secondaryModeNames.size === 0) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(modeValues).filter(
      ([modeName, value]) =>
        secondaryModeNames.has(modeName) &&
        value !== undefined &&
        value !== null,
    ),
  );
}

export function buildTokenExtensionsWithCollectionModes(
  token: Pick<Token, "$extensions">,
  nextModes: TokenModeValues,
): Token["$extensions"] | undefined {
  const nextExtensions = token.$extensions
    ? { ...token.$extensions }
    : {};
  const existingTokenManager =
    nextExtensions.tokenmanager &&
    typeof nextExtensions.tokenmanager === "object" &&
    !Array.isArray(nextExtensions.tokenmanager)
      ? { ...(nextExtensions.tokenmanager as Record<string, unknown>) }
      : {};

  if (Object.keys(nextModes).length > 0) {
    existingTokenManager.modes = nextModes;
    nextExtensions.tokenmanager = existingTokenManager;
  } else if (Object.keys(existingTokenManager).length > 0) {
    delete existingTokenManager.modes;
    if (Object.keys(existingTokenManager).length > 0) {
      nextExtensions.tokenmanager = existingTokenManager;
    } else {
      delete nextExtensions.tokenmanager;
    }
  } else {
    delete nextExtensions.tokenmanager;
  }

  return Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined;
}

export function writeTokenCollectionModeValues(
  token: Token,
  nextModes: TokenModeValues,
): void {
  const nextExtensions = buildTokenExtensionsWithCollectionModes(token, nextModes);
  if (nextExtensions) {
    token.$extensions = nextExtensions;
    return;
  }
  delete token.$extensions;
}

export function readTokenModeValuesForCollection(
  token: ModeReadableToken,
  collection: Pick<TokenCollection, "id" | "modes">,
): Record<string, unknown> {
  const primaryModeName = collection.modes[0]?.name;
  if (!primaryModeName) {
    return {};
  }

  const secondaryModes = readTokenCollectionModeValues(token)[collection.id] ?? {};
  const values: Record<string, unknown> = {
    [primaryModeName]: token.$value,
  };

  for (const mode of collection.modes.slice(1)) {
    values[mode.name] =
      mode.name in secondaryModes
        ? secondaryModes[mode.name]
        : token.$value;
  }

  return values;
}

export function writeTokenModeValuesForCollection(
  token: Token,
  collection: Pick<TokenCollection, "id" | "modes">,
  modeValues: Record<string, unknown>,
): void {
  const primaryModeName = collection.modes[0]?.name;
  if (!primaryModeName) {
    throw new Error(`Collection "${collection.id}" must define at least one mode`);
  }
  if (!(primaryModeName in modeValues)) {
    throw new Error(
      `Missing value for primary mode "${primaryModeName}" in collection "${collection.id}"`,
    );
  }

  token.$value = modeValues[primaryModeName] as Token["$value"];

  const nextModes = readTokenCollectionModeValues(token);
  const nextCollectionModes = sanitizeModeValuesForCollection(
    collection,
    modeValues,
  );

  if (Object.keys(nextCollectionModes).length > 0) {
    nextModes[collection.id] = nextCollectionModes;
  } else {
    delete nextModes[collection.id];
  }

  writeTokenCollectionModeValues(token, nextModes);
}

export function normalizeSelectedModes(
  collections: TokenCollection[],
  selections: SelectedModes,
): SelectedModes {
  const next: SelectedModes = {};

  for (const collection of collections) {
    const selectedMode = selections[collection.id];
    if (
      selectedMode &&
      collection.modes.some((mode) => mode.name === selectedMode)
    ) {
      next[collection.id] = selectedMode;
    }
  }

  return next;
}

export function buildSelectedModesLabel(
  collections: TokenCollection[],
  selections: SelectedModes,
): string {
  return collections
    .map((collection) => {
      const modeName = selections[collection.id];
      return modeName ? `${collection.id} · ${modeName}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

export function createViewPresetName(
  collections: TokenCollection[],
  selections: SelectedModes,
): string {
  const parts = collections
    .map((collection) => selections[collection.id])
    .filter((value): value is string => Boolean(value));
  return parts.join(" / ") || "New view";
}

export function createViewPreset(params: {
  id: string;
  name: string;
  collections: TokenCollection[];
  selections: SelectedModes;
}): ViewPreset {
  const { id, name, collections, selections } = params;
  return {
    id,
    name,
    selections: normalizeSelectedModes(collections, selections),
  };
}

export function deserializeTokenCollections(
  collections: SerializedTokenCollection[],
): TokenCollection[] {
  return collections.map((collection) => ({
    id: collection.id,
    ...(collection.description ? { description: collection.description } : {}),
    ...(collection.publishRouting
      ? { publishRouting: { ...collection.publishRouting } }
      : {}),
    modes: collection.modes.map((mode) => ({ name: mode.name })),
  }));
}

export function serializeTokenCollections(
  collections: TokenCollection[],
): SerializedTokenCollection[] {
  return collections.map((collection) => ({
    id: collection.id,
    ...(collection.description ? { description: collection.description } : {}),
    ...(collection.publishRouting
      ? { publishRouting: { ...collection.publishRouting } }
      : {}),
    modes: collection.modes.map((mode: CollectionMode) => ({ name: mode.name })),
  }));
}

export function readCollectionsFileState(
  file: unknown,
): {
  collections: TokenCollection[];
  views: ViewPreset[];
} {
  const data = isPlainObject(file) ? file : null;
  const rawCollections = Array.isArray(data?.$collections) ? data.$collections : [];
  const rawViews = Array.isArray(data?.$views) ? data.$views : [];
  const collections = deserializeTokenCollections(
    rawCollections
      .map((collection) => normalizeSerializedTokenCollection(collection))
      .filter(
        (collection): collection is SerializedTokenCollection => collection !== null,
      ),
  );

  return {
    collections,
    views: rawViews
      .map((view) => normalizeViewPreset(view))
      .filter((view): view is ViewPreset => view !== null),
  };
}
