import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(__dirname, 'release');
const artifactPath = path.join(releaseDir, 'token-workshop-figma-plugin.zip');
const requiredFiles = [
  'manifest.json',
  path.join('assets', 'token-workshop-icon-32.png'),
  path.join('assets', 'token-workshop-icon-64.png'),
  path.join('assets', 'token-workshop-icon-128.png'),
  path.join('assets', 'token-workshop-icon-256.png'),
  path.join('assets', 'token-workshop-icon-512.png'),
  path.join('assets', 'token-workshop-icon-1024.png'),
  path.join('assets', 'token-workshop-logo.png'),
  path.join('dist', 'code.js'),
  path.join('dist', 'ui.html'),
];

async function ensureRequiredFiles() {
  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(__dirname, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        throw new Error(`${relativePath} is not a file`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Missing Figma release file "${relativePath}": ${detail}`);
    }
  }
}

function runZip() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'zip',
      ['-r', artifactPath, ...requiredFiles],
      { cwd: __dirname, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`zip exited with code ${code ?? 'unknown'}`));
    });
  });
}

await ensureRequiredFiles();
await fs.rm(releaseDir, { recursive: true, force: true });
await fs.mkdir(releaseDir, { recursive: true });
await runZip();

console.log(`Figma release artifact: ${artifactPath}`);
