import fs from "node:fs/promises";
import path from "node:path";
import {
  createDefaultIconRegistry,
  iconComponentNameFromPath,
  iconExportNameFromPath,
  iconIdFromPath,
  iconNameFromPath,
  normalizeIconPath,
  normalizeIconRegistryFile,
  parseIconSvg,
  stableStringify,
  type IconFigmaLink,
  type IconRegistryFile,
  type ManagedIcon,
} from "@token-workshop/core";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import { expectJsonObject, parseJsonFile } from "../utils/json-file.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

export interface IconSvgImportResult {
  icon: ManagedIcon;
  registry: IconRegistryFile;
  created: boolean;
}

export interface IconSvgImportBatchResult {
  icons: ManagedIcon[];
  registry: IconRegistryFile;
  created: boolean[];
}

export interface IconFigmaSelectionImportBatchResult {
  icons: ManagedIcon[];
  registry: IconRegistryFile;
  created: boolean[];
}

export interface IconSvgContentResult {
  icon: ManagedIcon;
  content: string;
}

export interface IconSvgContentBatchItem {
  id: string;
  icon?: ManagedIcon;
  content?: string;
  hash?: string;
  error?: string;
}

export interface IconFigmaLinkUpdateResult {
  icon: ManagedIcon;
  registry: IconRegistryFile;
}

export interface IconFigmaLinkBatchUpdateResult {
  registry: IconRegistryFile;
  icons: ManagedIcon[];
}

type IconImportRequest = {
  source: ManagedIcon["source"];
  svg: ManagedIcon["svg"];
  figma?: IconFigmaLink;
  status?: ManagedIcon["status"];
  path: string;
  name?: string;
  tags?: string[];
};

export class IconStore {
  readonly filePath: string;
  private readonly tokenDir: string;
  private readonly lock = new PromiseChainLock();
  private registry: IconRegistryFile = createDefaultIconRegistry();
  private serializedRegistry = stableStringify(this.registry);
  private diskSignature: string | null = null;

  constructor(tokenDir: string) {
    this.tokenDir = path.resolve(tokenDir);
    this.filePath = path.join(this.tokenDir, "$icons.json");
  }

  async initialize(): Promise<void> {
    await this.reloadFromDisk();
  }

  async reloadFromDisk(): Promise<"changed" | "unchanged"> {
    return this.lock.withLock(() => this.reloadFromDiskUnlocked());
  }

  async importSvg(input: unknown): Promise<IconSvgImportResult> {
    return this.lock.withLock(async () => {
      const request = await this.readImportSvgRequest(input);
      await this.reloadFromDiskUnlocked();
      const result = await this.importSvgRequestsUnlocked([request]);
      const icon = result.icons[0];
      if (!icon) {
        throw new ConflictError(`Icon "${request.path}" was not persisted.`);
      }
      return {
        icon,
        registry: result.registry,
        created: result.created[0] ?? false,
      };
    });
  }

  async importSvgs(input: unknown): Promise<IconSvgImportBatchResult> {
    return this.lock.withLock(async () => {
      const requests = await this.readImportSvgBatchRequest(input);
      await this.reloadFromDiskUnlocked();
      return this.importSvgRequestsUnlocked(requests);
    });
  }

  async importFigmaSelection(
    input: unknown,
  ): Promise<IconFigmaSelectionImportBatchResult> {
    return this.lock.withLock(async () => {
      const requests = this.readImportFigmaSelectionRequest(input);
      await this.reloadFromDiskUnlocked();
      return this.importSvgRequestsUnlocked(requests);
    });
  }

  private async importSvgRequestsUnlocked(
    requests: IconImportRequest[],
  ): Promise<IconSvgImportBatchResult> {
    const registry = structuredClone(this.registry);
    const seenPaths = new Set<string>();
    const created: boolean[] = [];

    for (const request of requests) {
      if (seenPaths.has(request.path)) {
        throw new BadRequestError(`Duplicate icon path "${request.path}".`);
      }
      seenPaths.add(request.path);

      const existingIndex = registry.icons.findIndex(
        (icon) => icon.path === request.path,
      );
      const existing =
        existingIndex >= 0 ? registry.icons[existingIndex] : undefined;
      const duplicate = registry.icons.find(
        (icon) => icon.svg.hash === request.svg.hash && icon.path !== request.path,
      );
      if (duplicate) {
        throw new ConflictError(
          `Icon SVG content already exists as "${duplicate.path}".`,
        );
      }

      const nextIcon: ManagedIcon = {
        id: existing?.id ?? iconIdFromPath(request.path),
        name:
          request.name ??
          existing?.name ??
          iconNameFromPath(request.path),
        path: request.path,
        componentName:
          existing?.componentName ??
          iconComponentNameFromPath(
            request.path,
            registry.settings.componentPrefix,
          ),
        source: request.source,
        svg: request.svg,
        figma: figmaLinkForImportRequest(request, existing),
        code:
          existing?.code ?? {
            exportName: iconExportNameFromPath(request.path),
          },
        status: statusForImportRequest(request, existing),
        ...(request.tags
          ? { tags: request.tags }
          : existing?.tags
            ? { tags: existing.tags }
            : {}),
      };

      if (existingIndex >= 0) {
        registry.icons[existingIndex] = nextIcon;
        created.push(false);
      } else {
        registry.icons.push(nextIcon);
        created.push(true);
      }
    }

    const normalizedRegistry = normalizeIconRegistryFile(registry);
    await this.persistRegistry(normalizedRegistry);
    this.setRegistry(normalizedRegistry);
    const icons = requests.map((request) => {
      const icon = normalizedRegistry.icons.find(
        (candidate) => candidate.path === request.path,
      );
      if (!icon) {
        throw new ConflictError(`Icon "${request.path}" was not persisted.`);
      }
      return icon;
    });
    return {
      icons,
      registry: structuredClone(normalizedRegistry),
      created,
    };
  }

  async getSvgContent(iconId: string): Promise<IconSvgContentResult> {
    return this.lock.withLock(async () => {
      await this.reloadFromDiskUnlocked();
      return this.getSvgContentUnlocked(iconId);
    });
  }

  async getSvgContents(input: unknown): Promise<IconSvgContentBatchItem[]> {
    return this.lock.withLock(async () => {
      const ids = readIconIdsRequest(input);
      await this.reloadFromDiskUnlocked();
      return Promise.all(
        ids.map(async (id) => {
          try {
            const result = await this.getSvgContentUnlocked(id);
            return {
              id,
              icon: result.icon,
              content: result.content,
              hash: result.icon.svg.hash,
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { id, error: message };
          }
        }),
      );
    });
  }

  async updateFigmaLink(
    iconId: string,
    input: unknown,
  ): Promise<IconFigmaLinkUpdateResult> {
    return this.lock.withLock(async () => {
      const request = readFigmaLinkUpdate(input);
      await this.reloadFromDiskUnlocked();

      const normalizedRegistry = await this.updateFigmaLinksUnlocked([
        { id: iconId, ...request },
      ]);
      const persistedIcon = normalizedRegistry.icons.find(
        (candidate) => candidate.id === iconId,
      );
      if (!persistedIcon) {
        throw new ConflictError(`Icon "${iconId}" was not persisted.`);
      }

      return {
        icon: persistedIcon,
        registry: structuredClone(normalizedRegistry),
      };
    });
  }

  async updateFigmaLinks(
    input: unknown,
  ): Promise<IconFigmaLinkBatchUpdateResult> {
    return this.lock.withLock(async () => {
      const requests = readFigmaLinkBatchUpdate(input);
      await this.reloadFromDiskUnlocked();
      const normalizedRegistry = await this.updateFigmaLinksUnlocked(requests);
      const requestIds = new Set(requests.map((request) => request.id));
      return {
        registry: structuredClone(normalizedRegistry),
        icons: normalizedRegistry.icons.filter((icon) => requestIds.has(icon.id)),
      };
    });
  }

  private async reloadFromDiskUnlocked(): Promise<"changed" | "unchanged"> {
    let signature: string;
    try {
      const stats = await fs.stat(this.filePath);
      signature = fileSignature(stats);
      if (this.diskSignature === signature) {
        return "unchanged";
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.diskSignature = null;
        return this.setRegistry(createDefaultIconRegistry());
      }
      throw err;
    }

    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.diskSignature = null;
        return this.setRegistry(createDefaultIconRegistry());
      }
      throw err;
    }

    let normalized: IconRegistryFile;
    try {
      const parsed = expectJsonObject(
        parseJsonFile(raw, {
          filePath: this.filePath,
          relativeTo: path.dirname(this.filePath),
        }),
        {
          filePath: this.filePath,
          relativeTo: path.dirname(this.filePath),
          expectation: "contain a top-level icon registry object",
        },
      );
      normalized = normalizeIconRegistryFile(parsed);
    } catch (err) {
      if (err instanceof ConflictError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ConflictError(message);
    }

    const result = this.setRegistry(normalized);
    this.diskSignature = signature;
    return result;
  }

  getRegistry(): IconRegistryFile {
    return structuredClone(this.registry);
  }

  private findIconById(iconId: string): ManagedIcon {
    const normalizedId = readRequiredNonEmptyString(iconId, "iconId");
    const icon = this.registry.icons.find(
      (candidate) => candidate.id === normalizedId,
    );
    if (!icon) {
      throw new NotFoundError(`Icon "${normalizedId}" was not found.`);
    }
    return structuredClone(icon);
  }

  private async getSvgContentUnlocked(iconId: string): Promise<IconSvgContentResult> {
    const icon = this.findIconById(iconId);

    if (icon.svg.content) {
      const parsed = parseSvgContent(icon.svg.content);
      if (parsed.hash !== icon.svg.hash) {
        throw new ConflictError(
          `Icon "${iconId}" embedded SVG content does not match its registry hash.`,
        );
      }
      return {
        icon,
        content: parsed.content,
      };
    }

    if (icon.source.kind !== "local-svg") {
      throw new NotFoundError(`Icon "${iconId}" has no readable SVG content.`);
    }

    const sourcePath = this.resolveSourceSvgPath(icon.source.path);
    const content = await readLocalSvgFile(sourcePath.absolutePath);
    const parsed = parseSvgContent(content);
    if (parsed.hash !== icon.svg.hash) {
      throw new ConflictError(
        `Icon "${iconId}" source SVG changed. Re-import it before publishing.`,
      );
    }
    return {
      icon,
      content: parsed.content,
    };
  }

  private async updateFigmaLinksUnlocked(
    requests: Array<{
      id: string;
      componentId: string;
      componentKey: string | null;
      lastSyncedHash: string;
    }>,
  ): Promise<IconRegistryFile> {
    const registry = structuredClone(this.registry);
    const seenIds = new Set<string>();

    for (const request of requests) {
      if (seenIds.has(request.id)) {
        throw new BadRequestError(`Duplicate icon id "${request.id}".`);
      }
      seenIds.add(request.id);

      const index = registry.icons.findIndex((icon) => icon.id === request.id);
      if (index < 0) {
        throw new NotFoundError(`Icon "${request.id}" was not found.`);
      }

      const icon = registry.icons[index];
      if (request.lastSyncedHash !== icon.svg.hash) {
        throw new ConflictError(
          `Icon "${request.id}" cannot be marked synced to a different SVG hash.`,
        );
      }

      registry.icons[index] = {
        ...icon,
        figma: {
          componentId: request.componentId,
          componentKey: request.componentKey,
          lastSyncedHash: request.lastSyncedHash,
        },
        status: icon.status === "deprecated" ? icon.status : "published",
      };
    }

    const normalizedRegistry = normalizeIconRegistryFile(registry);
    await this.persistRegistry(normalizedRegistry);
    this.setRegistry(normalizedRegistry);
    return normalizedRegistry;
  }

  private setRegistry(registry: IconRegistryFile): "changed" | "unchanged" {
    const nextSerialized = stableStringify(registry);
    if (nextSerialized === this.serializedRegistry) {
      return "unchanged";
    }
    this.registry = registry;
    this.serializedRegistry = nextSerialized;
    return "changed";
  }

  private async persistRegistry(registry: IconRegistryFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(registry, null, 2), "utf-8");
    try {
      await fs.rename(tmp, this.filePath);
      const stats = await fs.stat(this.filePath);
      this.diskSignature = fileSignature(stats);
    } catch (err) {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
  }

  private async readImportSvgRequest(input: unknown): Promise<IconImportRequest> {
    if (!isRecord(input)) {
      throw new BadRequestError("SVG import body must be a JSON object.");
    }

    const hasSvg = Object.prototype.hasOwnProperty.call(input, "svg");
    const hasFilePath = Object.prototype.hasOwnProperty.call(input, "filePath");
    if (hasSvg === hasFilePath) {
      throw new BadRequestError(
        'SVG import body must include exactly one of "svg" or "filePath".',
      );
    }
    rejectUnsupportedFields(
      input,
      hasSvg
        ? new Set(["svg", "path", "name", "tags"])
        : new Set(["filePath", "path", "name", "tags"]),
    );

    const annotations = readIconImportAnnotations(input);

    if (hasSvg) {
      const svgText = readRequiredNonEmptyString(input.svg, "svg");
      const requestedPath = readRequiredNonEmptyString(input.path, "path");
      const svg = parseSvgMetadata(svgText, true);
      return {
        source: { kind: "pasted-svg" },
        svg,
        path: normalizeImportIconPath(requestedPath),
        ...annotations,
      };
    }

    const sourcePath = this.resolveSourceSvgPath(
      readRequiredNonEmptyString(input.filePath, "filePath"),
    );
    const svgText = await readLocalSvgFile(sourcePath.absolutePath);
    const requestedPath =
      typeof input.path === "string" && input.path.trim()
        ? input.path
        : sourcePath.relativePath.replace(/\.svg$/i, "");
    const svg = parseSvgMetadata(svgText, false);

    return {
      source: { kind: "local-svg", path: sourcePath.relativePath },
      svg,
      path: normalizeImportIconPath(requestedPath),
      ...annotations,
    };
  }

  private async readImportSvgBatchRequest(input: unknown): Promise<IconImportRequest[]> {
    if (!isRecord(input)) {
      throw new BadRequestError("SVG import batch body must be a JSON object.");
    }
    rejectUnsupportedFields(input, new Set(["icons"]));
    if (!Array.isArray(input.icons) || input.icons.length === 0) {
      throw new BadRequestError("icons must be a non-empty array of SVG imports.");
    }
    return Promise.all(
      input.icons.map((icon, index) =>
        this.readImportSvgRequestWithLabel(icon, `icons[${index}]`),
      ),
    );
  }

  private readImportFigmaSelectionRequest(input: unknown): IconImportRequest[] {
    if (!isRecord(input)) {
      throw new BadRequestError("Figma icon import body must be a JSON object.");
    }
    rejectUnsupportedFields(input, new Set(["icons"]));
    if (!Array.isArray(input.icons) || input.icons.length === 0) {
      throw new BadRequestError("icons must be a non-empty array of Figma icon imports.");
    }

    const requests = input.icons.map((icon, index) =>
      this.readImportFigmaSelectionItem(icon, `icons[${index}]`),
    );
    const seenNodeIds = new Set<string>();
    for (const request of requests) {
      if (request.source.kind !== "figma-selection") {
        continue;
      }
      if (seenNodeIds.has(request.source.nodeId)) {
        throw new BadRequestError(
          `Duplicate selected Figma node "${request.source.nodeId}".`,
        );
      }
      seenNodeIds.add(request.source.nodeId);
    }
    return requests;
  }

  private readImportFigmaSelectionItem(
    input: unknown,
    label: string,
  ): IconImportRequest {
    if (!isRecord(input)) {
      throw new BadRequestError(`${label} must be a JSON object.`);
    }
    rejectUnsupportedFields(
      input,
      new Set([
        "svg",
        "path",
        "name",
        "tags",
        "nodeId",
        "fileKey",
        "pageId",
        "pageName",
        "componentId",
        "componentKey",
      ]),
    );

    const svgText = readRequiredNonEmptyString(input.svg, `${label}.svg`);
    const nodeId = readRequiredNonEmptyString(input.nodeId, `${label}.nodeId`);
    const fileKey = readOptionalNullableNonEmptyString(
      input.fileKey,
      `${label}.fileKey`,
    );
    const pageId = readOptionalNullableNonEmptyString(
      input.pageId,
      `${label}.pageId`,
    );
    const pageName = readOptionalNullableNonEmptyString(
      input.pageName,
      `${label}.pageName`,
    );
    const path = normalizeImportIconPath(
      readRequiredNonEmptyString(input.path, `${label}.path`),
    );
    const annotations = readIconImportAnnotations(input, label);
    const svg = parseSvgMetadata(svgText, true);
    const componentId = readOptionalNullableNonEmptyString(
      input.componentId,
      `${label}.componentId`,
    );
    const componentKey = readOptionalNullableNonEmptyString(
      input.componentKey,
      `${label}.componentKey`,
    );

    return {
      source: {
        kind: "figma-selection",
        nodeId,
        ...(fileKey ? { fileKey } : {}),
        ...(pageId ? { pageId } : {}),
        ...(pageName ? { pageName } : {}),
      },
      svg,
      ...(componentId
        ? {
            figma: {
              componentId,
              componentKey: componentKey ?? null,
              lastSyncedHash: null,
            },
          }
        : {}),
      path,
      ...annotations,
    };
  }

  private async readImportSvgRequestWithLabel(
    input: unknown,
    label: string,
  ): Promise<IconImportRequest> {
    try {
      return await this.readImportSvgRequest(input);
    } catch (err) {
      if (
        err instanceof BadRequestError ||
        err instanceof ConflictError ||
        err instanceof NotFoundError
      ) {
        err.message = `${label}: ${err.message}`;
      }
      throw err;
    }
  }

  private resolveSourceSvgPath(filePath: string): {
    absolutePath: string;
    relativePath: string;
  } {
    const normalizedInput = filePath.replace(/\\/g, "/").trim();
    if (
      !normalizedInput ||
      normalizedInput.includes("\0") ||
      path.isAbsolute(normalizedInput) ||
      /^[a-zA-Z]:\//.test(normalizedInput)
    ) {
      throw new BadRequestError(
        "filePath must be a token-directory-relative SVG path.",
      );
    }

    const absolutePath = path.resolve(this.tokenDir, normalizedInput);
    const relativeNative = path.relative(this.tokenDir, absolutePath);
    if (
      !relativeNative ||
      relativeNative.startsWith(`..${path.sep}`) ||
      relativeNative === ".." ||
      path.isAbsolute(relativeNative)
    ) {
      throw new BadRequestError("filePath must stay inside the token directory.");
    }
    if (path.extname(absolutePath).toLowerCase() !== ".svg") {
      throw new BadRequestError("filePath must point to a .svg file.");
    }

    return {
      absolutePath,
      relativePath: relativeNative.split(path.sep).join("/"),
    };
  }
}

function fileSignature(stats: { mtimeMs: number; size: number }): string {
  return `${stats.mtimeMs}:${stats.size}`;
}

function figmaLinkForImportRequest(
  request: IconImportRequest,
  existing: ManagedIcon | undefined,
): IconFigmaLink {
  if (existing?.figma) {
    if (existing.figma.componentId || existing.figma.componentKey) {
      return existing.figma;
    }
    return request.figma ?? existing.figma;
  }
  if (request.figma) {
    return request.figma;
  }
  return {
    componentId: null,
    componentKey: null,
    lastSyncedHash: null,
  };
}

function statusForImportRequest(
  request: IconImportRequest,
  existing: ManagedIcon | undefined,
): ManagedIcon["status"] {
  if (request.status) {
    return request.status;
  }
  if (existing) {
    return existing.status;
  }
  return "draft";
}

function parseSvgMetadata(
  svgText: string,
  keepContent: boolean,
): ManagedIcon["svg"] {
  const parsed = parseSvgContent(svgText);
  return {
    viewBox: parsed.viewBox,
    viewBoxMinX: parsed.viewBoxMinX,
    viewBoxMinY: parsed.viewBoxMinY,
    viewBoxWidth: parsed.viewBoxWidth,
    viewBoxHeight: parsed.viewBoxHeight,
    hash: parsed.hash,
    contentHash: parsed.contentHash,
    color: parsed.color,
    ...(keepContent ? { content: parsed.content } : {}),
  };
}

function parseSvgContent(svgText: string): {
  content: string;
  viewBox: string;
  viewBoxMinX: number;
  viewBoxMinY: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  hash: string;
  contentHash: string;
  color: ManagedIcon["svg"]["color"];
} {
  try {
    return parseIconSvg(svgText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BadRequestError(message);
  }
}

function normalizeImportIconPath(value: string): string {
  try {
    return normalizeIconPath(value);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BadRequestError(message);
  }
}

async function readLocalSvgFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new BadRequestError("filePath does not exist.");
    }
    if ((err as NodeJS.ErrnoException).code === "EISDIR") {
      throw new BadRequestError("filePath must point to a .svg file.");
    }
    throw err;
  }
}

function readRequiredNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalNonEmptyString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readRequiredNonEmptyString(value, field);
}

function readOptionalNullableNonEmptyString(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return readRequiredNonEmptyString(value, field);
}

function readIconImportAnnotations(
  input: Record<string, unknown>,
  label?: string,
): Pick<IconImportRequest, "name" | "tags"> {
  const name = readOptionalNonEmptyString(
    input.name,
    label ? `${label}.name` : "name",
  );
  const tags = readOptionalTags(input.tags, label ? `${label}.tags` : "tags");
  return {
    ...(name ? { name } : {}),
    ...(tags ? { tags } : {}),
  };
}

function readOptionalTags(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an array of strings.`);
  }
  const tags = value.map((tag, index) => {
    if (typeof tag !== "string" || !tag.trim()) {
      throw new BadRequestError(`${field}[${index}] must be a non-empty string.`);
    }
    return tag.trim();
  });
  return Array.from(new Set(tags));
}

function readIconIdsRequest(input: unknown): string[] {
  if (!isRecord(input)) {
    throw new BadRequestError("Icon content request body must be a JSON object.");
  }
  rejectUnsupportedFields(input, new Set(["ids"]));
  if (!Array.isArray(input.ids)) {
    throw new BadRequestError("ids must be an array of icon ids.");
  }
  const ids = input.ids.map((id, index) =>
    readRequiredNonEmptyString(id, `ids[${index}]`),
  );
  return Array.from(new Set(ids));
}

function readFigmaLinkUpdate(input: unknown): {
  componentId: string;
  componentKey: string | null;
  lastSyncedHash: string;
} {
  if (!isRecord(input)) {
    throw new BadRequestError("Figma link update body must be a JSON object.");
  }
  rejectUnsupportedFields(
    input,
    new Set(["componentId", "componentKey", "lastSyncedHash"]),
  );

  return {
    componentId: readRequiredNonEmptyString(input.componentId, "componentId"),
    componentKey:
      input.componentKey === null || input.componentKey === undefined
        ? null
        : readRequiredNonEmptyString(input.componentKey, "componentKey"),
    lastSyncedHash: readRequiredNonEmptyString(
      input.lastSyncedHash,
      "lastSyncedHash",
    ),
  };
}

function readFigmaLinkBatchUpdate(input: unknown): Array<{
  id: string;
  componentId: string;
  componentKey: string | null;
  lastSyncedHash: string;
}> {
  if (!isRecord(input)) {
    throw new BadRequestError("Figma link batch body must be a JSON object.");
  }
  rejectUnsupportedFields(input, new Set(["links"]));
  if (!Array.isArray(input.links)) {
    throw new BadRequestError("links must be an array of Figma link updates.");
  }

  return input.links.map((link, index) => {
    if (!isRecord(link)) {
      throw new BadRequestError(`links[${index}] must be a JSON object.`);
    }
    rejectUnsupportedFields(
      link,
      new Set(["id", "componentId", "componentKey", "lastSyncedHash"]),
    );
    return {
      id: readRequiredNonEmptyString(link.id, `links[${index}].id`),
      componentId: readRequiredNonEmptyString(
        link.componentId,
        `links[${index}].componentId`,
      ),
      componentKey:
        link.componentKey === null || link.componentKey === undefined
          ? null
          : readRequiredNonEmptyString(
              link.componentKey,
              `links[${index}].componentKey`,
            ),
      lastSyncedHash: readRequiredNonEmptyString(
        link.lastSyncedHash,
        `links[${index}].lastSyncedHash`,
      ),
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnsupportedFields(
  record: Record<string, unknown>,
  allowed: Set<string>,
): void {
  const unsupported = Object.keys(record).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new BadRequestError(
      `Unsupported SVG import field${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}.`,
    );
  }
}
