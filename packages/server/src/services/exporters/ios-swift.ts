import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PlatformExporter, ExporterContext } from './types.js';

export const iosSwiftExporter: PlatformExporter = {
  id: 'ios-swift',
  label: 'iOS / Swift',
  fileExtension: '.swift',
  usesCssTokens: false,

  async format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const sourceFile = path.join(ctx.tmpDir, 'tokens.json');
    const buildPath = path.join(ctx.tmpDir, 'ios');
    await fs.mkdir(buildPath, { recursive: true });

    const destination = 'Tokens.swift';

    const sd = new StyleDictionary({
      source: [sourceFile],
      platforms: {
        'ios-swift': {
          transformGroup: 'ios-swift',
          buildPath: buildPath + '/',
          files: [{ destination, format: 'ios-swift/class.swift', className: 'Tokens' }],
        },
      },
    });

    await sd.buildAllPlatforms();

    const filePath = path.join(buildPath, destination);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return [{ path: destination, content }];
    } catch {
      return [];
    }
  },
};
