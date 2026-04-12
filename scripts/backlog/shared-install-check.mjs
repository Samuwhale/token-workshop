#!/usr/bin/env node

import { lstat, readdir, readFile, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SHARED_DEPENDENCY_BOOTSTRAP_MARKER = '.backlog-shared-dependencies.json';
const STALE_SHARED_INSTALL_STATE_CODE = 'BACKLOG_STALE_SHARED_INSTALL_STATE';
const MAIN_REPO_INSTALL_REQUIRED_CODE = 'BACKLOG_MAIN_REPO_INSTALL_REQUIRED';
const SHARED_INSTALL_RECOVERY_INSTRUCTION =
  'remove poisoned package-local node_modules links and rerun pnpm install from the main repo root.';

const TEMP_BACKLOG_PATH_PATTERNS = [
  /(?:^|\/)tmp\/backlog-[^/]+(?:\/|$)/i,
  /(?:^|\/)(?:private\/)?var\/folders\/[^/]+\/[^/]+\/T\/backlog-[^/]+(?:\/|$)/i,
];

function normalizeForMatching(value) {
  return value.replace(/\\/g, '/');
}

function describePathOrRoot(value) {
  return value === '' ? '.' : value;
}

async function pathExists(targetPath) {
  try {
    await lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isInspectableDirectory(targetPath) {
  try {
    await readdir(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isTempBacklogPath(targetPath) {
  const normalized = normalizeForMatching(targetPath);
  if (!/\/backlog-[^/]+(?:\/|$)/i.test(normalized)) {
    return false;
  }

  const systemTmp = normalizeForMatching(tmpdir()).replace(/\/+$/, '');
  const tmpPrefixes = [...new Set([
    systemTmp,
    systemTmp.startsWith('/var/') ? `/private${systemTmp}` : '',
    systemTmp.startsWith('/private/var/') ? systemTmp.replace(/^\/private/, '') : '',
  ].filter(Boolean))];

  return tmpPrefixes.some(prefix => normalized.startsWith(`${prefix}/backlog-`))
    || TEMP_BACKLOG_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

async function inspectScopedDir(projectRoot, scopedDir) {
  const issues = [];
  let entries = [];
  try {
    entries = await readdir(scopedDir);
  } catch {
    return issues;
  }

  for (const entryName of entries) {
    const entryPath = path.join(scopedDir, entryName);
    try {
      const stat = await lstat(entryPath);
      if (!stat.isSymbolicLink()) {
        continue;
      }

      const target = path.resolve(path.dirname(entryPath), await readlink(entryPath));
      if (!isTempBacklogPath(target)) {
        continue;
      }

      issues.push({
        path: describePathOrRoot(normalizeForMatching(path.relative(projectRoot, entryPath))),
        target: normalizeForMatching(target),
      });
    } catch {
      // Ignore entries that disappear mid-run.
    }
  }

  return issues;
}

async function inspectNodeModulesRoot(projectRoot, nodeModulesRoot) {
  const issues = [];
  let entries = [];
  try {
    entries = await readdir(nodeModulesRoot);
  } catch {
    return issues;
  }

  for (const entryName of entries) {
    const entryPath = path.join(nodeModulesRoot, entryName);
    try {
      const stat = await lstat(entryPath);
      if (stat.isSymbolicLink()) {
        const target = path.resolve(path.dirname(entryPath), await readlink(entryPath));
        if (isTempBacklogPath(target)) {
          issues.push({
            path: describePathOrRoot(normalizeForMatching(path.relative(projectRoot, entryPath))),
            target: normalizeForMatching(target),
          });
        }
        continue;
      }

      if (stat.isDirectory() && entryName.startsWith('@')) {
        issues.push(...await inspectScopedDir(projectRoot, entryPath));
      }
    } catch {
      // Ignore entries that disappear mid-run.
    }
  }

  return issues;
}

async function inspectSharedInstallState(projectRoot, requiredNodeModules) {
  const missingNodeModules = [];
  const nodeModulesRoots = [];

  for (const relativePath of [...new Set(requiredNodeModules.map(item => normalizeForMatching(item)))]) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (await pathExists(absolutePath) && await isInspectableDirectory(absolutePath)) {
      nodeModulesRoots.push(absolutePath);
    } else {
      missingNodeModules.push(relativePath);
    }
  }

  const staleSymlinks = [];
  for (const nodeModulesRoot of nodeModulesRoots) {
    staleSymlinks.push(...await inspectNodeModulesRoot(projectRoot, nodeModulesRoot));
  }

  return { missingNodeModules, staleSymlinks };
}

function formatStaleTargets(staleSymlinks) {
  return staleSymlinks.map(entry => `${entry.path} -> ${entry.target}`).join(', ');
}

function formatMainRepoInstallRequired(inspection) {
  const parts = [];
  if (inspection.missingNodeModules.length > 0) {
    parts.push(`missing bootstrapped node_modules: ${inspection.missingNodeModules.join(', ')}`);
  }
  if (inspection.staleSymlinks.length > 0) {
    parts.push(`poisoned shared install targets: ${formatStaleTargets(inspection.staleSymlinks)}`);
  }
  const detail = parts.join('; ') || 'shared dependency bootstrap is incomplete';
  return `dependency refresh required from main repo [${MAIN_REPO_INSTALL_REQUIRED_CODE}]: ${detail} Recovery: ${SHARED_INSTALL_RECOVERY_INSTRUCTION}`;
}

async function readMarker(projectRoot) {
  const markerPath = path.join(projectRoot, SHARED_DEPENDENCY_BOOTSTRAP_MARKER);
  if (!await pathExists(markerPath)) {
    return null;
  }

  const parsed = JSON.parse(await readFile(markerPath, 'utf8'));
  if (!parsed || parsed.kind !== 'shared-dependency-bootstrap' || !Array.isArray(parsed.requiredNodeModules)) {
    throw new Error(`stale shared install state [${STALE_SHARED_INSTALL_STATE_CODE}]: invalid shared dependency bootstrap marker. Recovery: ${SHARED_INSTALL_RECOVERY_INSTRUCTION}`);
  }

  return parsed;
}

async function main() {
  const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const marker = await readMarker(projectRoot);
  if (!marker) {
    process.exit(0);
  }

  const inspection = await inspectSharedInstallState(projectRoot, marker.requiredNodeModules);
  if (inspection.missingNodeModules.length === 0 && inspection.staleSymlinks.length === 0) {
    process.exit(0);
  }

  console.error(formatMainRepoInstallRequired(inspection));
  process.exit(1);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
