import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  TokenGenerator,
  GeneratedTokenResult,
  TokenType,
  Token,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleConfig,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  ContrastCheckConfig,
} from '@tokenmanager/core';
import {
  runColorRampGenerator,
  runTypeScaleGenerator,
  runSpacingScaleGenerator,
  runOpacityScaleGenerator,
  runBorderRadiusScaleGenerator,
  runZIndexScaleGenerator,
  runShadowScaleGenerator,
  runCustomScaleGenerator,
  runAccessibleColorPairGenerator,
  runDarkModeInversionGenerator,
  runContrastCheckGenerator,
  applyOverrides,
  validateStepName,
} from '@tokenmanager/core';
import type { TokenStore } from './token-store.js';
import { stableStringify } from './stable-stringify.js';
import { NotFoundError, BadRequestError } from '../errors.js';

interface GeneratorsFile {
  $generators: TokenGenerator[];
}

const VALID_GENERATOR_TYPES: ReadonlySet<string> = new Set([
  'colorRamp', 'typeScale', 'spacingScale', 'opacityScale',
  'borderRadiusScale', 'zIndexScale', 'shadowScale', 'customScale',
  'accessibleColorPair', 'darkModeInversion', 'contrastCheck',
]);

/**
 * Validates the basic shape of a TokenGenerator loaded from disk.
 * Returns an error string or null if valid.
 */
function validateGeneratorShape(gen: unknown): string | null {
  if (typeof gen !== 'object' || gen === null || Array.isArray(gen)) return 'entry is not an object';
  const g = gen as Record<string, unknown>;
  if (typeof g.id !== 'string' || !g.id) return 'missing or invalid "id"';
  if (typeof g.type !== 'string' || !VALID_GENERATOR_TYPES.has(g.type)) return `invalid generator type "${g.type}"`;
  if (typeof g.name !== 'string') return 'missing or invalid "name"';
  if (typeof g.targetSet !== 'string') return 'missing or invalid "targetSet"';
  if (typeof g.targetGroup !== 'string') return 'missing or invalid "targetGroup"';
  if (g.config !== undefined && (typeof g.config !== 'object' || g.config === null || Array.isArray(g.config))) return '"config" must be an object';
  return null;
}

export class GeneratorService {
  private dir: string;
  private generators: Map<string, TokenGenerator> = new Map();
  /** Per-generator promise chain — serializes concurrent executions instead of skipping them. */
  private generatorLocks = new Map<string, Promise<void>>();
  /** Promise-chain mutex — serializes all saveGenerators() calls to prevent file-rename races. */
  private saveLock: Promise<void> = Promise.resolve();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  async initialize(): Promise<void> {
    await this.loadGenerators();
  }

  private get filePath(): string {
    return path.join(this.dir, '$generators.json');
  }

  private async loadGenerators(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      if (typeof data !== 'object' || data === null || !Array.isArray(data.$generators)) {
        console.warn('[GeneratorService] Invalid generators file: expected { $generators: [...] }');
        this.generators.clear();
        return;
      }
      this.generators.clear();
      for (const gen of data.$generators) {
        const err = validateGeneratorShape(gen);
        if (err) {
          console.warn(`[GeneratorService] Skipping invalid generator entry: ${err}`, gen?.id ?? '(no id)');
          continue;
        }
        this.generators.set((gen as TokenGenerator).id, gen as TokenGenerator);
      }
    } catch {
      // File doesn't exist yet — perfectly normal on first run
      this.generators.clear();
    }
  }

  private saveGenerators(): Promise<void> {
    const next = this.saveLock.then(() => this._doSave());
    this.saveLock = next.catch(() => {});
    return next;
  }

  private async _doSave(): Promise<void> {
    const data: GeneratorsFile = {
      $generators: Array.from(this.generators.values()),
    };
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    try {
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
  }

  async getAll(): Promise<TokenGenerator[]> {
    return Array.from(this.generators.values());
  }

  async getById(id: string): Promise<TokenGenerator | undefined> {
    return this.generators.get(id);
  }

  async create(data: Omit<TokenGenerator, 'id' | 'createdAt' | 'updatedAt'>): Promise<TokenGenerator> {
    const now = new Date().toISOString();
    const generator: TokenGenerator = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.generators.set(generator.id, generator);
    try {
      this.buildDependencyOrder();
    } catch {
      this.generators.delete(generator.id);
      throw new BadRequestError(
        `Creating generator "${generator.name}" would introduce a circular dependency. ` +
          'Ensure no generator sources from its own output group.',
      );
    }
    try {
      await this.saveGenerators();
    } catch (err) {
      this.generators.delete(generator.id);
      throw err;
    }
    return generator;
  }

  async update(
    id: string,
    updates: Partial<Omit<TokenGenerator, 'id' | 'createdAt'>>,
  ): Promise<TokenGenerator> {
    const existing = this.generators.get(id);
    if (!existing) throw new NotFoundError(`Generator "${id}" not found`);
    const updated: TokenGenerator = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.generators.set(id, updated);
    try {
      this.buildDependencyOrder();
    } catch {
      this.generators.set(id, existing);
      throw new BadRequestError(
        `Updating generator "${updated.name}" would introduce a circular dependency. ` +
          'Ensure no generator sources from its own output group.',
      );
    }
    try {
      await this.saveGenerators();
    } catch (err) {
      this.generators.set(id, existing);
      throw err;
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.generators.get(id);
    if (!existing) return false;
    this.generators.delete(id);
    try {
      await this.saveGenerators();
    } catch (err) {
      this.generators.set(id, existing);
      throw err;
    }
    return true;
  }

  /**
   * Restore (upsert) a generator from a full snapshot object.
   * Used by rollback to re-create or revert a generator to a prior state.
   */
  async restore(generator: TokenGenerator): Promise<void> {
    this.generators.set(generator.id, generator);
    await this.saveGenerators();
  }

  /**
   * Update generator references when a token set is renamed.
   * Updates targetSet for any generator pointing at the old set name.
   * Returns the count of generators updated.
   */
  async updateSetName(oldSetName: string, newSetName: string): Promise<number> {
    let count = 0;
    for (const [id, gen] of this.generators) {
      if (gen.targetSet === oldSetName) {
        this.generators.set(id, { ...gen, targetSet: newSetName });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Update generator references when a single token path changes.
   * Updates sourceToken for exact path matches.
   * Returns the count of generators updated.
   */
  async updateTokenPaths(pathMap: Map<string, string>): Promise<number> {
    let count = 0;
    for (const [id, gen] of this.generators) {
      if (gen.sourceToken && pathMap.has(gen.sourceToken)) {
        this.generators.set(id, { ...gen, sourceToken: pathMap.get(gen.sourceToken)! });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Update generator references when a token group is renamed.
   * Updates sourceToken (prefix match) and targetGroup (exact or prefix match).
   * Returns the count of generators updated.
   */
  async updateGroupPath(oldGroupPath: string, newGroupPath: string): Promise<number> {
    let count = 0;
    const prefix = oldGroupPath + '.';
    for (const [id, gen] of this.generators) {
      const updates: Partial<TokenGenerator> = {};
      if (gen.sourceToken) {
        if (gen.sourceToken === oldGroupPath) {
          updates.sourceToken = newGroupPath;
        } else if (gen.sourceToken.startsWith(prefix)) {
          updates.sourceToken = newGroupPath + gen.sourceToken.slice(oldGroupPath.length);
        }
      }
      if (gen.targetGroup === oldGroupPath) {
        updates.targetGroup = newGroupPath;
      } else if (gen.targetGroup.startsWith(prefix)) {
        updates.targetGroup = newGroupPath + gen.targetGroup.slice(oldGroupPath.length);
      }
      if (Object.keys(updates).length > 0) {
        this.generators.set(id, { ...gen, ...updates });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Update generator references after a bulk find/replace rename operation.
   * Applies the same string transformation to sourceToken and targetGroup.
   * Returns the count of generators updated.
   */
  async updateBulkTokenPaths(find: string, replace: string, isRegex = false): Promise<number> {
    let pattern: RegExp | null = null;
    if (isRegex) {
      try {
        pattern = new RegExp(find, 'g');
      } catch (err) {
        throw new BadRequestError(`Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const apply = (s: string): string =>
      pattern ? s.replace(pattern!, replace) : s.split(find).join(replace);

    let count = 0;
    for (const [id, gen] of this.generators) {
      const updates: Partial<TokenGenerator> = {};
      if (gen.sourceToken) {
        const next = apply(gen.sourceToken);
        if (next !== gen.sourceToken) updates.sourceToken = next;
      }
      const nextGroup = apply(gen.targetGroup);
      if (nextGroup !== gen.targetGroup) updates.targetGroup = nextGroup;
      if (Object.keys(updates).length > 0) {
        this.generators.set(id, { ...gen, ...updates });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Set or clear a per-step override on a generator.
   * Pass null to remove the override for that step.
   */
  async setStepOverride(
    id: string,
    stepName: string,
    override: { value: unknown; locked: boolean } | null,
  ): Promise<TokenGenerator> {
    validateStepName(stepName);

    const existing = this.generators.get(id);
    if (!existing) throw new NotFoundError(`Generator "${id}" not found`);

    const overrides = { ...(existing.overrides ?? {}) };
    if (override === null) {
      delete overrides[stepName];
    } else {
      overrides[stepName] = override;
    }

    return this.update(id, { overrides: Object.keys(overrides).length > 0 ? overrides : undefined });
  }

  /** Compute what would be generated without persisting anything. */
  async preview(
    data: Pick<TokenGenerator, 'type' | 'sourceToken' | 'inlineValue' | 'targetGroup' | 'targetSet' | 'config' | 'overrides'>,
    tokenStore: TokenStore,
    sourceValue?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    if (sourceValue !== undefined) {
      // source value already resolved on the client; still resolve config tokenRefs on the server
      const resolvedConfig = await this.resolveConfigTokenRefs(data.config, tokenStore);
      const resolvedData = resolvedConfig !== data.config ? { ...data, config: resolvedConfig } : data;
      return this.computeResultsWithValue(resolvedData, sourceValue);
    }
    return this.computeResults(data, tokenStore);
  }

  /** Run a saved generator and persist the derived tokens. */
  async run(id: string, tokenStore: TokenStore): Promise<GeneratedTokenResult[]> {
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);
    return this.withGeneratorLock(id, () => this.executeGenerator(generator, tokenStore));
  }

  /**
   * Check which existing tokens would be overwritten by a generator re-run
   * and whether they have been manually edited (value differs from what the
   * generator would produce).
   */
  async checkOverwrites(
    id: string,
    tokenStore: TokenStore,
  ): Promise<{ path: string; setName: string; currentValue: unknown; newValue: unknown }[]> {
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);
    const preview = await this.computeResults(generator, tokenStore);
    const effectiveTargetSet = generator.targetSet;
    const modified: { path: string; setName: string; currentValue: unknown; newValue: unknown }[] = [];
    for (const result of preview) {
      const existing = await tokenStore.getToken(effectiveTargetSet, result.path);
      if (existing && stableStringify(existing.$value) !== stableStringify(result.value)) {
        // Only flag tokens that are actually tagged as generated by this generator
        const ext = existing.$extensions?.['com.tokenmanager.generator'];
        if (ext?.generatorId === id) {
          modified.push({
            path: result.path,
            setName: effectiveTargetSet,
            currentValue: existing.$value,
            newValue: result.value,
          });
        }
      }
    }
    return modified;
  }

  /**
   * Compute a full diff of what a generator re-run would produce, without
   * persisting anything.  Returns tokens classified as created / updated /
   * deleted / unchanged so the UI can show an accurate preview.
   *
   * - created:   in preview results but not yet in the token store
   * - updated:   in preview results AND in store but the value would change
   * - unchanged: in preview results AND in store with identical value
   * - deleted:   in the store (tagged with this generator's id) but NOT in the
   *              preview results (e.g. a step was removed from the config)
   */
  async dryRun(
    id: string,
    tokenStore: TokenStore,
  ): Promise<{
    created: Array<{ path: string; value: unknown; type: string }>;
    updated: Array<{ path: string; currentValue: unknown; newValue: unknown; type: string }>;
    unchanged: Array<{ path: string; value: unknown; type: string }>;
    deleted: Array<{ path: string; currentValue: unknown }>;
  }> {
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);

    const preview = await this.computeResults(generator, tokenStore);
    const targetSet = generator.targetSet;

    const created: Array<{ path: string; value: unknown; type: string }> = [];
    const updated: Array<{ path: string; currentValue: unknown; newValue: unknown; type: string }> = [];
    const unchanged: Array<{ path: string; value: unknown; type: string }> = [];
    const previewPaths = new Set<string>();

    for (const result of preview) {
      previewPaths.add(result.path);
      const existing = await tokenStore.getToken(targetSet, result.path);
      if (!existing) {
        created.push({ path: result.path, value: result.value, type: result.type });
      } else if (stableStringify(existing.$value) !== stableStringify(result.value)) {
        updated.push({ path: result.path, currentValue: existing.$value, newValue: result.value, type: result.type });
      } else {
        unchanged.push({ path: result.path, value: result.value, type: result.type });
      }
    }

    // Detect tokens that belong to this generator but would be removed because
    // they are no longer in the preview results (e.g. a step was deleted).
    const flatTokens = await tokenStore.getFlatTokensForSet(targetSet);
    const prefix = generator.targetGroup ? generator.targetGroup + '.' : '';
    const deleted: Array<{ path: string; currentValue: unknown }> = [];
    for (const [path, token] of Object.entries(flatTokens)) {
      if (prefix && !path.startsWith(prefix) && path !== generator.targetGroup) continue;
      const ext = token.$extensions?.['com.tokenmanager.generator'];
      if (ext?.generatorId === id && !previewPaths.has(path)) {
        deleted.push({ path, currentValue: token.$value });
      }
    }

    return { created, updated, unchanged, deleted };
  }

  /** Returns true if any generator is currently executing (has a pending lock chain). */
  isAnyRunning(): boolean {
    return this.generatorLocks.size > 0;
  }

  /**
   * Run all generators affected by the given token path, in topological order.
   * Handles chained generators (Generator B sourcing from Generator A's output).
   * Safe to call from a token-update event listener.
   */
  async runForSourceToken(tokenPath: string, tokenStore: TokenStore): Promise<void> {
    // Find all generators that directly source this token
    const directlyAffected = new Set(
      [...this.generators.values()]
        .filter(g => g.sourceToken === tokenPath)
        .map(g => g.id),
    );
    if (directlyAffected.size === 0) return;

    // Get topological execution order for all generators
    let order: string[];
    try {
      order = this.buildDependencyOrder();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[GeneratorService] Dependency graph error:', err);
      tokenStore.emitEvent({ type: 'generator-error', setName: '', message: `Dependency graph error: ${message}` });
      return;
    }

    // Expand the affected set to include transitive dependents
    const affected = new Set(directlyAffected);
    for (const genId of order) {
      if (affected.has(genId)) continue;
      const gen = this.generators.get(genId);
      if (!gen?.sourceToken) continue;
      for (const affectedId of affected) {
        const affectedGen = this.generators.get(affectedId);
        if (affectedGen && gen.sourceToken.startsWith(affectedGen.targetGroup + '.')) {
          affected.add(genId);
          break;
        }
      }
    }

    // Execute in topological order, serialized per-generator via promise-chain locks.
    // Track failed generator IDs so downstream dependents can be skipped — running
    // a downstream generator after its upstream failed would process stale output.
    const failedIds = new Set<string>();
    for (const genId of order) {
      if (!affected.has(genId)) continue;
      const gen = this.generators.get(genId);
      if (!gen) continue;

      // Skip if any upstream generator (whose output this one sources from) failed.
      const blockingGen = gen.sourceToken
        ? [...failedIds]
            .map(failedId => this.generators.get(failedId))
            .find(failedGen => failedGen && gen.sourceToken!.startsWith(failedGen.targetGroup + '.'))
        : undefined;
      if (blockingGen) {
        const message = `Blocked: upstream generator "${blockingGen.name}" failed`;
        const current = this.generators.get(genId);
        if (current) {
          this.generators.set(genId, { ...current, lastRunError: { message, at: new Date().toISOString(), blockedBy: blockingGen.name } });
          await this.saveGenerators();
        }
        console.warn(`[GeneratorService] Generator "${gen.name}" blocked because upstream "${blockingGen.name}" failed`);
        tokenStore.emitEvent({ type: 'generator-error', setName: '', generatorId: genId, message });
        failedIds.add(genId);
        continue;
      }

      await this.withGeneratorLock(genId, () =>
        this.executeGenerator(gen, tokenStore),
      ).catch(async err => {
        const message = err instanceof Error ? err.message : String(err);
        const current = this.generators.get(genId);
        if (current) {
          this.generators.set(genId, { ...current, lastRunError: { message, at: new Date().toISOString() } });
          await this.saveGenerators();
        }
        console.warn(`[GeneratorService] Generator "${genId}" failed after token update:`, err);
        tokenStore.emitEvent({ type: 'generator-error', setName: '', generatorId: genId, message });
        failedIds.add(genId);
      });
    }
  }

  /**
   * Build a topologically-sorted list of all generator IDs.
   * Generators that depend on another generator's output come after it.
   * Throws if a dependency cycle is detected.
   */
  private buildDependencyOrder(): string[] {
    // Map targetGroup -> set of generatorIds for producer lookup
    const producerByGroup = new Map<string, Set<string>>();
    for (const [id, gen] of this.generators) {
      let producers = producerByGroup.get(gen.targetGroup);
      if (!producers) {
        producers = new Set();
        producerByGroup.set(gen.targetGroup, producers);
      }
      producers.add(id);
    }

    // Build in-degree map and adjacency list
    const inDegree = new Map<string, number>();
    const edges = new Map<string, Set<string>>(); // id -> set of ids that depend on it

    for (const [id] of this.generators) {
      inDegree.set(id, 0);
      edges.set(id, new Set());
    }

    for (const [id, gen] of this.generators) {
      if (!gen.sourceToken) continue;
      for (const [prefix, producerIds] of producerByGroup) {
        if (gen.sourceToken.startsWith(prefix + '.')) {
          for (const producerId of producerIds) {
            if (producerId !== id) {
              // id depends on producerId
              edges.get(producerId)!.add(id);
              inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
            }
          }
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);
      for (const dependent of edges.get(id) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (result.length !== this.generators.size) {
      throw new Error(
        '[GeneratorService] Cycle detected in generator dependencies. ' +
          'Check that no generator sources from its own output.',
      );
    }

    return result;
  }

  /**
   * Promise-chain mutex per generator. Concurrent calls for the same generator
   * are serialized — the second waits for the first to finish instead of being
   * silently skipped or running in parallel.
   */
  private withGeneratorLock<T>(generatorId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.generatorLocks.get(generatorId) ?? Promise.resolve();
    const next = prev.then(() => fn(), () => fn());
    // Store the void chain (swallow errors so subsequent callers still run)
    const voidChain = next.then(() => {}, () => {});
    this.generatorLocks.set(generatorId, voidChain);
    // Clean up when the chain settles and no new work was appended
    voidChain.then(() => {
      if (this.generatorLocks.get(generatorId) === voidChain) {
        this.generatorLocks.delete(generatorId);
      }
    });
    return next;
  }

  private async executeGenerator(
    generator: TokenGenerator,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    let results: GeneratedTokenResult[];
    if (generator.inputTable && generator.inputTable.rows.length > 0) {
      results = await this.executeGeneratorMultiBrand(generator, tokenStore);
    } else {
      results = await this.executeSingleBrand(generator, tokenStore, generator.targetSet);
    }

    // Track when the generator was last run and what the source token's value was,
    // so the UI can detect whether re-running is needed after a source token edit.
    // We update the in-memory record directly (preserving updatedAt) and persist.
    // Important: resolve the source token value BEFORE the final re-read, then
    // re-read current AFTER all awaits so concurrent update() calls are not lost.
    const runAt = new Date().toISOString();
    let lastRunSourceValue: unknown;
    if (generator.sourceToken) {
      const resolved = await tokenStore.resolveToken(generator.sourceToken).catch(() => null);
      if (resolved !== null) lastRunSourceValue = resolved.$value;
    }
    // Re-read after all awaits — prevents overwriting concurrent update() mutations.
    // Also clears any prior lastRunError since all async operations succeeded.
    const current = this.generators.get(generator.id);
    if (current) {
      this.generators.set(generator.id, {
        ...current,
        lastRunAt: runAt,
        lastRunSourceValue: lastRunSourceValue !== undefined ? lastRunSourceValue : current.lastRunSourceValue,
        lastRunError: undefined,
      });
      await this.saveGenerators();
    }

    return results;
  }

  /** Removes non-locked overrides from a generator after execution. */
  private async clearNonLockedOverrides(generator: TokenGenerator): Promise<void> {
    const overrides = generator.overrides;
    if (!overrides) return;
    const cleaned: Record<string, { value: unknown; locked: boolean }> = {};
    for (const [key, val] of Object.entries(overrides)) {
      if (val.locked) cleaned[key] = val;
    }
    if (Object.keys(cleaned).length !== Object.keys(overrides).length) {
      const hasRemaining = Object.keys(cleaned).length > 0;
      await this.update(generator.id, {
        overrides: hasRemaining ? cleaned : undefined,
      });
    }
  }

  /** Original single-brand execution path. Writes to `effectiveTargetSet`. */
  private async executeSingleBrand(
    generator: TokenGenerator,
    tokenStore: TokenStore,
    effectiveTargetSet: string,
    sourceValueOverride?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const results = sourceValueOverride !== undefined
      ? await this.computeResultsWithValue(generator, sourceValueOverride)
      : await this.computeResults(generator, tokenStore);

    await this.clearNonLockedOverrides(generator);

    const extensions = {
      'com.tokenmanager.generator': {
        generatorId: generator.id,
        sourceToken: generator.sourceToken,
      },
    };
    tokenStore.beginBatch();
    try {
      for (const result of results) {
        const token = {
          $type: result.type as TokenType,
          $value: result.value as Token['$value'],
          $extensions: extensions,
        };
        const existing = await tokenStore.getToken(effectiveTargetSet, result.path);
        if (existing) {
          await tokenStore.updateToken(effectiveTargetSet, result.path, token);
        } else {
          await tokenStore.createToken(effectiveTargetSet, result.path, token);
        }
      }
    } finally {
      tokenStore.endBatch();
    }
    return results;
  }

  /** Multi-brand path: runs once per row, writing to a brand-specific set. */
  private async executeGeneratorMultiBrand(
    generator: TokenGenerator,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const { inputTable, targetSetTemplate, targetSet } = generator;
    const allResults: GeneratedTokenResult[] = [];

    // Determine all sets that will be written to so we can snapshot them before any writes.
    const affectedSets = new Set<string>();
    for (const row of inputTable!.rows) {
      if (!row.brand.trim()) continue;
      const setName = targetSetTemplate
        ? targetSetTemplate.replace('{brand}', row.brand)
        : targetSet!;
      affectedSets.add(setName);
    }

    // Capture pre-run state for each affected set so partial failures can be rolled back.
    const preRunSnapshots = new Map<string, Record<string, Token>>();
    for (const setName of affectedSets) {
      const flatTokens = await tokenStore.getFlatTokensForSet(setName).catch(() => ({}));
      preRunSnapshots.set(setName, structuredClone(flatTokens) as Record<string, Token>);
    }

    let succeeded = false;
    try {
      for (const row of inputTable!.rows) {
        if (!row.brand.trim()) continue;
        const sourceValue = row.inputs[inputTable!.inputKey];
        if (sourceValue === undefined) continue;

        const effectiveTargetSet = targetSetTemplate
          ? targetSetTemplate.replace('{brand}', row.brand)
          : targetSet;

        const results = await this.computeResultsWithValue(generator, sourceValue);

        const extensions = {
          'com.tokenmanager.generator': {
            generatorId: generator.id,
            sourceToken: generator.sourceToken,
            brand: row.brand,
          },
        };
        tokenStore.beginBatch();
        try {
          for (const result of results) {
            const token = {
              $type: result.type as TokenType,
              $value: result.value as Token['$value'],
              $extensions: extensions,
            };
            const existing = await tokenStore.getToken(effectiveTargetSet, result.path);
            if (existing) {
              await tokenStore.updateToken(effectiveTargetSet, result.path, token);
            } else {
              await tokenStore.createToken(effectiveTargetSet, result.path, token);
            }
          }
        } finally {
          tokenStore.endBatch();
        }
        allResults.push(...results);
      }
      succeeded = true;
    } catch (err) {
      // Roll back all affected sets to their pre-run state.
      // Build restore items: original tokens to restore + tokens created during the run to delete.
      for (const [setName, preSnapshot] of preRunSnapshots) {
        const currentTokens = await tokenStore.getFlatTokensForSet(setName).catch(() => ({}));
        const restoreItems: Array<{ path: string; token: Token | null }> = [];
        for (const [p, t] of Object.entries(preSnapshot)) {
          restoreItems.push({ path: p, token: t });
        }
        for (const p of Object.keys(currentTokens)) {
          if (!(p in preSnapshot)) {
            restoreItems.push({ path: p, token: null });
          }
        }
        if (restoreItems.length > 0) {
          await tokenStore.restoreSnapshot(setName, restoreItems).catch((rollbackErr) => {
            console.error(`[GeneratorService] Rollback failed for set "${setName}":`, rollbackErr);
            const originalMsg = err instanceof Error ? err.message : String(err);
            const rollbackMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
            throw new Error(
              `Generator run failed (${originalMsg}) and rollback of set "${setName}" also failed (${rollbackMsg}). Token state may be inconsistent.`,
              { cause: rollbackErr },
            );
          });
        }
      }
      throw err;
    } finally {
      // Only clear non-locked overrides when the run completed successfully.
      // On partial failure the overrides must remain intact so a re-run produces the same result.
      if (succeeded) {
        await this.clearNonLockedOverrides(generator);
      }
    }

    return allResults;
  }

  /**
   * Core dispatch: given a pre-resolved source value (or undefined for source-free generators),
   * run the appropriate generator and apply overrides.
   */
  private async computeResultsWithValue(
    generator: Pick<TokenGenerator, 'type' | 'sourceToken' | 'targetGroup' | 'config' | 'overrides'>,
    resolvedValue: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const { type, targetGroup, config } = generator;
    let results: GeneratedTokenResult[];

    switch (type) {
      case 'colorRamp': {
        const hex = typeof resolvedValue === 'string' ? resolvedValue : null;
        if (!hex) throw new BadRequestError(`Source value for colorRamp must be a color string`);
        results = runColorRampGenerator(hex, config as ColorRampConfig, targetGroup);
        break;
      }
      case 'typeScale': {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new BadRequestError(`Source value for typeScale must be a dimension value`);
        }
        results = runTypeScaleGenerator(dim, config as TypeScaleConfig, targetGroup);
        break;
      }
      case 'spacingScale': {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new BadRequestError(`Source value for spacingScale must be a dimension value`);
        }
        results = runSpacingScaleGenerator(dim, config as SpacingScaleConfig, targetGroup);
        break;
      }
      case 'opacityScale': {
        results = runOpacityScaleGenerator(config as OpacityScaleConfig, targetGroup);
        break;
      }
      case 'borderRadiusScale': {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new BadRequestError(`Source value for borderRadiusScale must be a dimension value`);
        }
        results = runBorderRadiusScaleGenerator(dim, config as BorderRadiusScaleConfig, targetGroup);
        break;
      }
      case 'zIndexScale': {
        results = runZIndexScaleGenerator(config as ZIndexScaleConfig, targetGroup);
        break;
      }
      case 'shadowScale': {
        results = runShadowScaleGenerator(config as ShadowScaleConfig, targetGroup);
        break;
      }
      case 'customScale': {
        let base: number | undefined;
        if (resolvedValue !== undefined) {
          if (typeof resolvedValue === 'number') {
            base = resolvedValue;
          } else if (typeof resolvedValue === 'object' && resolvedValue !== null && 'value' in resolvedValue) {
            base = (resolvedValue as { value: number }).value;
          }
        }
        results = runCustomScaleGenerator(base, config as CustomScaleConfig, targetGroup);
        break;
      }
      case 'accessibleColorPair': {
        const hex = typeof resolvedValue === 'string' ? resolvedValue : null;
        if (!hex) throw new BadRequestError(`Source value for accessibleColorPair must be a color string`);
        results = runAccessibleColorPairGenerator(hex, config as AccessibleColorPairConfig, targetGroup);
        break;
      }
      case 'darkModeInversion': {
        const hex = typeof resolvedValue === 'string' ? resolvedValue : null;
        if (!hex) throw new BadRequestError(`Source value for darkModeInversion must be a color string`);
        results = runDarkModeInversionGenerator(hex, config as DarkModeInversionConfig, targetGroup);
        break;
      }
      case 'contrastCheck': {
        results = runContrastCheckGenerator(config as ContrastCheckConfig, targetGroup);
        break;
      }
      default:
        throw new BadRequestError(`Unknown generator type: ${type}`);
    }

    return applyOverrides(results, generator.overrides);
  }

  /**
   * Resolves any $tokenRefs in a generator config by looking up each referenced
   * token in the token store and replacing the config field with the resolved value.
   * Returns a copy of the config with tokenRef fields overridden, or the original
   * config if there are no tokenRefs or all resolutions fail gracefully.
   */
  private async resolveConfigTokenRefs(
    config: TokenGenerator['config'],
    tokenStore: TokenStore,
  ): Promise<TokenGenerator['config']> {
    const c = config as Record<string, unknown>;
    const refs = c.$tokenRefs;
    if (!refs || typeof refs !== 'object' || Array.isArray(refs)) return config;

    const overrides: Record<string, unknown> = {};
    for (const [field, tokenPath] of Object.entries(refs as Record<string, string>)) {
      if (!tokenPath) continue;
      try {
        const resolved = await tokenStore.resolveToken(tokenPath);
        if (resolved) overrides[field] = resolved.$value;
      } catch {
        // Resolution failure: keep the stored literal value for this field
      }
    }

    if (Object.keys(overrides).length === 0) return config;
    // Merge overrides into a new config, preserving $tokenRefs so it's stored intact
    return { ...config, ...overrides } as TokenGenerator['config'];
  }

  private async computeResults(
    generator: Pick<TokenGenerator, 'type' | 'sourceToken' | 'inlineValue' | 'targetGroup' | 'config' | 'overrides'>,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const { type, sourceToken, inlineValue } = generator;

    const needsSource = (
      type === 'colorRamp' ||
      type === 'typeScale' ||
      type === 'spacingScale' ||
      type === 'borderRadiusScale' ||
      type === 'accessibleColorPair' ||
      type === 'darkModeInversion' ||
      (type === 'customScale' && (!!sourceToken || inlineValue !== undefined))
    );

    let resolvedValue: unknown;
    if (needsSource) {
      if (sourceToken) {
        const resolved = await tokenStore.resolveToken(sourceToken);
        if (!resolved) {
          throw new NotFoundError(`Source token "${sourceToken}" not found or could not be resolved`);
        }
        resolvedValue = resolved.$value;
      } else if (inlineValue !== undefined) {
        resolvedValue = inlineValue;
      } else {
        throw new BadRequestError(`Generator type "${type}" requires a source token or inline value`);
      }
    }

    // Resolve any $tokenRefs in the config before executing
    const resolvedConfig = await this.resolveConfigTokenRefs(generator.config, tokenStore);
    return this.computeResultsWithValue({ ...generator, config: resolvedConfig }, resolvedValue);
  }
}
