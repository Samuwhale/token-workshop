import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PlatformExporter, ExporterContext } from './types.js';

export const androidExporter: PlatformExporter = {
  id: 'android',
  label: 'Android / XML',
  fileExtension: '.xml',
  usesCssTokens: false,

  async format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const sourceFile = path.join(ctx.tmpDir, 'tokens.json');
    const buildPath = path.join(ctx.tmpDir, 'android');
    await fs.mkdir(buildPath, { recursive: true });

    const destination = 'tokens.xml';

    const sd = new StyleDictionary({
      source: [sourceFile],
      platforms: {
        android: {
          transformGroup: 'android',
          buildPath: buildPath + '/',
          files: [{ destination, format: 'android/resources' }],
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
