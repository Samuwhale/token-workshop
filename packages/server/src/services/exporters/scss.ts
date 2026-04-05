import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PlatformExporter, ExporterContext } from './types.js';

export const scssExporter: PlatformExporter = {
  id: 'scss',
  label: 'SCSS Variables',
  fileExtension: '.scss',
  usesCssTokens: true,

  async format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const sourceFile = path.join(ctx.tmpDir, 'tokens-css.json');
    const buildPath = path.join(ctx.tmpDir, 'scss');
    await fs.mkdir(buildPath, { recursive: true });

    const destination = '_variables.scss';

    const sd = new StyleDictionary({
      source: [sourceFile],
      platforms: {
        scss: {
          transformGroup: 'css',
          buildPath: buildPath + '/',
          files: [{ destination, format: 'scss/variables' }],
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
