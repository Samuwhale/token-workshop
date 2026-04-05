import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PlatformExporter, ExporterContext } from './types.js';

export const cssExporter: PlatformExporter = {
  id: 'css',
  label: 'CSS Variables',
  fileExtension: '.css',
  usesCssTokens: true,

  async format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const sourceFile = path.join(ctx.tmpDir, 'tokens-css.json');
    const buildPath = path.join(ctx.tmpDir, 'css');
    await fs.mkdir(buildPath, { recursive: true });

    const destination = 'variables.css';
    const selector = ctx.cssOptions?.selector;
    const fileConfig =
      selector && selector !== ':root'
        ? { destination, format: 'css/variables', options: { selector } }
        : { destination, format: 'css/variables' };

    const sd = new StyleDictionary({
      source: [sourceFile],
      platforms: {
        css: {
          transformGroup: 'css',
          buildPath: buildPath + '/',
          files: [fileConfig],
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
