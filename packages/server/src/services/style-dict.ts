import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { TokenGroup } from '@tokenmanager/core';

export type ExportPlatform = 'css' | 'dart' | 'ios-swift' | 'android' | 'json';

export interface ExportResult {
  platform: ExportPlatform;
  files: { path: string; content: string }[];
}

const PLATFORM_CONFIGS: Record<ExportPlatform, any> = {
  css: {
    transformGroup: 'css',
    buildPath: 'css/',
    files: [{ destination: 'variables.css', format: 'css/variables' }],
  },
  dart: {
    transformGroup: 'flutter',
    buildPath: 'dart/',
    files: [{ destination: 'tokens.dart', format: 'flutter/class.dart' }],
  },
  'ios-swift': {
    transformGroup: 'ios-swift',
    buildPath: 'ios/',
    files: [{ destination: 'Tokens.swift', format: 'ios-swift/class.swift', className: 'Tokens' }],
  },
  android: {
    transformGroup: 'android',
    buildPath: 'android/',
    files: [{ destination: 'tokens.xml', format: 'android/resources' }],
  },
  json: {
    transformGroup: 'js',
    buildPath: 'json/',
    files: [{ destination: 'tokens.json', format: 'json/flat' }],
  },
};

export async function exportTokens(
  tokens: Record<string, TokenGroup>,
  platforms: ExportPlatform[],
  outputDir?: string,
): Promise<ExportResult[]> {
  const tmpDir = outputDir || path.join(os.tmpdir(), `tokenmanager-export-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  // Write tokens as a single JSON for Style Dictionary
  const tokenFile = path.join(tmpDir, 'tokens.json');
  // Merge all sets into one object
  const merged: Record<string, any> = {};
  for (const [_setName, tokenGroup] of Object.entries(tokens)) {
    Object.assign(merged, tokenGroup);
  }
  await fs.writeFile(tokenFile, JSON.stringify(merged, null, 2));

  const results: ExportResult[] = [];

  for (const platform of platforms) {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) continue;

    const buildPath = path.join(tmpDir, config.buildPath);
    await fs.mkdir(buildPath, { recursive: true });

    try {
      const sd = new StyleDictionary({
        source: [tokenFile],
        platforms: {
          [platform]: {
            ...config,
            buildPath: buildPath + '/',
          },
        },
      });

      await sd.buildAllPlatforms();

      // Read generated files
      const files: { path: string; content: string }[] = [];
      for (const fileConfig of config.files) {
        const filePath = path.join(buildPath, fileConfig.destination);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          files.push({ path: fileConfig.destination, content });
        } catch {
          // File may not have been generated
        }
      }

      results.push({ platform, files });
    } catch (err) {
      results.push({ platform, files: [{ path: 'error.txt', content: String(err) }] });
    }
  }

  return results;
}
