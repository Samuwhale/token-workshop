import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  TokenGenerator,
  GeneratedTokenResult,
} from '@tokenmanager/core';
import {
  runColorRampGenerator,
  runTypeScaleGenerator,
  runSpacingScaleGenerator,
  runOpacityScaleGenerator,
  runBorderRadiusScaleGenerator,
  runZIndexScaleGenerator,
  runCustomScaleGenerator,
  runAccessibleColorPairGenerator,
  runDarkModeInversionGenerator,
  runResponsiveScaleGenerator,
  runContrastCheckGenerator,
  applyOverrides,
} from '@tokenmanager/core';
import type { TokenStore } from './token-store.js';

interface GeneratorsFile {
  $generators: TokenGenerator[];
}

export class GeneratorService {
  private dir: string;
  private generators: Map<string, TokenGenerator> = new Map();
  /** IDs of generators currently executing — prevents re-entrancy per generator. */
  private runningGenerators = new Set<string>();

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
      const data = JSON.parse(content) as GeneratorsFile;
      this.generators.clear();
      for (const gen of data.$generators ?? []) {
        this.generators.set(gen.id, gen);
      }
    } catch {
      // File doesn't exist yet — perfectly normal on first run
      this.generators.clear();
    }
  }

  private async saveGenerators(): Promise<void> {
    const data: GeneratorsFile = {
      $generators: Array.from(this.generators.values()),
    };
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
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
    await this.saveGenerators();
    return generator;
  }

  async update(
    id: string,
    updates: Partial<Omit<TokenGenerator, 'id' | 'createdAt'>>,
  ): Promise<TokenGenerator> {
    const existing = this.generators.get(id);
    if (!existing) throw new Error(`Generator "${id}" not found`);
    const updated: TokenGenerator = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.generators.set(id, updated);
    await this.saveGenerators();
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.generators.has(id)) return false;
    this.generators.delete(id);
    await this.saveGenerators();
    return true;
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
    const existing = this.generators.get(id);
    if (!existing) throw new Error(`Generator "${id}" not found`);

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
    data: Pick<TokenGenerator, 'type' | 'sourceToken' | 'targetGroup' | 'targetSet' | 'config' | 'overrides'>,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    return this.computeResults(data, tokenStore);
  }

  /** Run a saved generator and persist the derived tokens. */
  async run(id: string, tokenStore: TokenStore): Promise<GeneratedTokenResult[]> {
    const generator = this.generators.get(id);
    if (!generator) throw new Error(`Generator "${id}" not found`);
    return this.executeGenerator(generator, tokenStore);
  }

  /** Returns true if any generator is currently executing. */
  isAnyRunning(): boolean {
    return this.runningGenerators.size > 0;
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
      console.warn('[GeneratorService] Dependency graph error:', err);
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

    // Execute in topological order
    for (const genId of order) {
      if (!affected.has(genId)) continue;
      if (this.runningGenerators.has(genId)) continue;
      const gen = this.generators.get(genId);
      if (!gen) continue;
      await this.executeGenerator(gen, tokenStore).catch(err =>
        console.warn(`[GeneratorService] Generator "${genId}" failed after token update:`, err),
      );
    }
  }

  /**
   * Build a topologically-sorted list of all generator IDs.
   * Generators that depend on another generator's output come after it.
   * Throws if a dependency cycle is detected.
   */
  private buildDependencyOrder(): string[] {
    // Map targetGroup -> generatorId for producer lookup
    const producerByGroup = new Map<string, string>();
    for (const [id, gen] of this.generators) {
      producerByGroup.set(gen.targetGroup, id);
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
      for (const [prefix, producerId] of producerByGroup) {
        if (producerId !== id && gen.sourceToken.startsWith(prefix + '.')) {
          // id depends on producerId
          edges.get(producerId)!.add(id);
          inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
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

  private async executeGenerator(
    generator: TokenGenerator,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    this.runningGenerators.add(generator.id);
    try {
      if (generator.inputTable && generator.inputTable.rows.length > 0) {
        return await this.executeGeneratorMultiBrand(generator, tokenStore);
      }
      return await this.executeSingleBrand(generator, tokenStore, generator.targetSet);
    } finally {
      this.runningGenerators.delete(generator.id);
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

    // Clear non-locked overrides after execution
    const overrides = generator.overrides;
    if (overrides) {
      const cleaned: Record<string, { value: unknown; locked: boolean }> = {};
      for (const [key, val] of Object.entries(overrides)) {
        if (val.locked) cleaned[key] = val;
      }
      const hasRemaining = Object.keys(cleaned).length > 0;
      if (Object.keys(cleaned).length !== Object.keys(overrides).length) {
        await this.update(generator.id, {
          overrides: hasRemaining ? cleaned : undefined,
        });
      }
    }

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
          $type: result.type as any,
          $value: result.value as any,
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
            $type: result.type as any,
            $value: result.value as any,
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

    // Clear non-locked overrides after all brands run
    const overrides = generator.overrides;
    if (overrides) {
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

    return allResults;
  }

  /**
   * Like computeResults but uses a pre-resolved source value directly,
   * bypassing token-store lookup.
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
        if (!hex) throw new Error(`Multi-brand input for colorRamp must be a color string`);
        results = runColorRampGenerator(hex, config as any, targetGroup);
        break;
      }
      case 'typeScale': {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Multi-brand input for typeScale must be a dimension value`);
        }
        results = runTypeScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      case 'spacingScale': {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Multi-brand input for spacingScale must be a dimension value`);
        }
        results = runSpacingScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      case 'opacityScale': {
        results = runOpacityScaleGenerator(config as any, targetGroup);
        break;
      }
      case 'borderRadiusScale': {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Multi-brand input for borderRadiusScale must be a dimension value`);
        }
        results = runBorderRadiusScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      case 'zIndexScale': {
        results = runZIndexScaleGenerator(config as any, targetGroup);
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
        results = runCustomScaleGenerator(base, config as any, targetGroup);
        break;
      }
      case 'accessibleColorPair': {
        const hex = typeof resolvedValue === 'string' ? resolvedValue : null;
        if (!hex) throw new Error(`Multi-brand input for accessibleColorPair must be a color string`);
        results = runAccessibleColorPairGenerator(hex, config as any, targetGroup);
        break;
      }
      case 'darkModeInversion': {
        const hex = typeof resolvedValue === 'string' ? resolvedValue : null;
        if (!hex) throw new Error(`Multi-brand input for darkModeInversion must be a color string`);
        results = runDarkModeInversionGenerator(hex, config as any, targetGroup);
        break;
      }
      case 'responsiveScale': {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Multi-brand input for responsiveScale must be a dimension value`);
        }
        results = runResponsiveScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      default:
        throw new Error(`Unknown generator type: ${(generator as any).type}`);
    }

    return applyOverrides(results, generator.overrides);
  }

  private async computeResults(
    generator: Pick<TokenGenerator, 'type' | 'sourceToken' | 'targetGroup' | 'config' | 'overrides'>,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const { type, targetGroup, config, sourceToken } = generator;

    // Resolve source token only when needed
    const needsSource = (
      type === 'colorRamp' ||
      type === 'typeScale' ||
      type === 'spacingScale' ||
      type === 'borderRadiusScale' ||
      type === 'accessibleColorPair' ||
      type === 'darkModeInversion' ||
      type === 'responsiveScale' ||
      (type === 'customScale' && !!sourceToken)
    );

    let resolved: Awaited<ReturnType<TokenStore['resolveToken']>> | undefined;
    if (needsSource) {
      if (!sourceToken) {
        throw new Error(`Generator type "${type}" requires a source token`);
      }
      resolved = await tokenStore.resolveToken(sourceToken);
      if (!resolved) {
        throw new Error(`Source token "${sourceToken}" not found or could not be resolved`);
      }
    }

    let results: GeneratedTokenResult[];

    switch (type) {
      case 'colorRamp': {
        const hex = typeof resolved!.$value === 'string' ? resolved!.$value : null;
        if (!hex) throw new Error(`Source token "${sourceToken}" is not a color string`);
        results = runColorRampGenerator(hex, config as any, targetGroup);
        break;
      }
      case 'typeScale': {
        const dim = resolved!.$value as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Source token "${sourceToken}" is not a dimension value`);
        }
        results = runTypeScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      case 'spacingScale': {
        const dim = resolved!.$value as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Source token "${sourceToken}" is not a dimension value`);
        }
        results = runSpacingScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      case 'opacityScale': {
        results = runOpacityScaleGenerator(config as any, targetGroup);
        break;
      }
      case 'borderRadiusScale': {
        const dim = resolved!.$value as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Source token "${sourceToken}" is not a dimension value`);
        }
        results = runBorderRadiusScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      case 'zIndexScale': {
        results = runZIndexScaleGenerator(config as any, targetGroup);
        break;
      }
      case 'customScale': {
        // For customScale, extract a numeric base from the resolved token if present
        let base: number | undefined;
        if (resolved) {
          const val = resolved.$value;
          if (typeof val === 'number') {
            base = val;
          } else if (typeof val === 'object' && val !== null && 'value' in val) {
            base = (val as { value: number }).value;
          }
        }
        results = runCustomScaleGenerator(base, config as any, targetGroup);
        break;
      }
      case 'accessibleColorPair': {
        const hex = typeof resolved!.$value === 'string' ? resolved!.$value : null;
        if (!hex) throw new Error(`Source token "${sourceToken}" is not a color string`);
        results = runAccessibleColorPairGenerator(hex, config as any, targetGroup);
        break;
      }
      case 'darkModeInversion': {
        const hex = typeof resolved!.$value === 'string' ? resolved!.$value : null;
        if (!hex) throw new Error(`Source token "${sourceToken}" is not a color string`);
        results = runDarkModeInversionGenerator(hex, config as any, targetGroup);
        break;
      }
      case 'responsiveScale': {
        const dim = resolved!.$value as { value: number; unit: string } | null;
        if (!dim || typeof dim !== 'object' || typeof dim.value !== 'number') {
          throw new Error(`Source token "${sourceToken}" is not a dimension value`);
        }
        results = runResponsiveScaleGenerator(dim, config as any, targetGroup);
        break;
      }
      case 'contrastCheck': {
        results = runContrastCheckGenerator(config as any, targetGroup);
        break;
      }
      default:
        throw new Error(`Unknown generator type: ${(generator as any).type}`);
    }

    return applyOverrides(results, generator.overrides);
  }
}
