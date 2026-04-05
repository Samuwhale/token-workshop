import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PlatformExporter, ExporterContext } from './types.js';

export const jsonExporter: PlatformExporter = {
  id: 'json',
  label: 'JSON',
  fileExtension: '.json',
  usesCssTokens: false,

  async format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const sourceFile = path.join(ctx.tmpDir, 'tokens.json');
    const buildPath = path.join(ctx.tmpDir, 'json');
    await fs.mkdir(buildPath, { recursive: true });

    const destination = 'tokens.json';

    const sd = new StyleDictionary({
      source: [sourceFile],
      platforms: {
        json: {
          transformGroup: 'js',
          buildPath: buildPath + '/',
          files: [{ destination, format: 'json/flat' }],
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
