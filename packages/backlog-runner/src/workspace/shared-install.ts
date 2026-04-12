import { lstat, readdir, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const SHARED_DEPENDENCY_BOOTSTRAP_MARKER = '.backlog-shared-dependencies.json';
export const STALE_SHARED_INSTALL_STATE_CODE = 'BACKLOG_STALE_SHARED_INSTALL_STATE';
export const MAIN_REPO_INSTALL_REQUIRED_CODE = 'BACKLOG_MAIN_REPO_INSTALL_REQUIRED';
export const SHARED_INSTALL_RECOVERY_INSTRUCTION =
  'remove poisoned package-local node_modules links and rerun pnpm install from the main repo root.';

const TEMP_BACKLOG_PATH_PATTERNS = [
  /(?:^|\/)tmp\/backlog-[^/]+(?:\/|$)/i,
  /(?:^|\/)(?:private\/)?var\/folders\/[^/]+\/[^/]+\/T\/backlog-[^/]+(?:\/|$)/i,
];

export type SharedDependencyBootstrapMarker = {
  kind: 'shared-dependency-bootstrap';
  projectRoot: string;
  requiredNodeModules: string[];
};

export type SharedInstallSymlinkIssue = {
  path: string;
  target: string;
};

export type SharedInstallInspection = {
  missingNodeModules: string[];
  staleSymlinks: SharedInstallSymlinkIssue[];
  inspectedNodeModules: string[];
};

function normalizeForMatching(value: string): string {
  return value.replace(/\\/g, '/');
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isInspectableDirectory(targetPath: string): Promise<boolean> {
  try {
    await readdir(targetPath);
    return true;
  } catch {
    return false;
  }
}

function repoRelative(projectRoot: string, targetPath: string): string {
  return normalizeForMatching(path.relative(projectRoot, targetPath));
}

function describePathOrRoot(value: string): string {
  return value === '' ? '.' : value;
}

function formatStaleTargets(staleSymlinks: SharedInstallSymlinkIssue[]): string {
  return staleSymlinks
    .map(entry => `${entry.path} -> ${entry.target}`)
    .join(', ');
}

export function isTempBacklogPath(targetPath: string): boolean {
  const normalized = normalizeForMatching(targetPath);
  if (!/\/backlog-[^/]+(?:\/|$)/i.test(normalized)) {
    return false;
  }

  const systemTmp = normalizeForMatching(tmpdir()).replace(/\/+$/, '');
  const tmpPrefixes = unique([
    systemTmp,
    systemTmp.startsWith('/var/') ? `/private${systemTmp}` : '',
    systemTmp.startsWith('/private/var/') ? systemTmp.replace(/^\/private/, '') : '',
  ]).filter(Boolean);

  return tmpPrefixes.some(prefix => normalized.startsWith(`${prefix}/backlog-`))
    || TEMP_BACKLOG_PATH_PATTERNS.some(pattern => pattern.test(normalized));
}

export function touchesDependencyManifest(touchPath: string): boolean {
  const normalized = normalizeForMatching(touchPath).replace(/^\.\/+/, '');
  if (normalized === 'pnpm-lock.yaml' || normalized === 'pnpm-workspace.yaml') {
    return true;
  }

  if (normalized === 'package.json') {
    return true;
  }

  return /^packages\/[^/]+\/package\.json$/i.test(normalized);
}

async function collectNodeModulesRoots(
  projectRoot: string,
  requiredNodeModules?: string[],
): Promise<{ missingNodeModules: string[]; nodeModulesRoots: string[] }> {
  if (requiredNodeModules && requiredNodeModules.length > 0) {
    const missingNodeModules: string[] = [];
    const nodeModulesRoots: string[] = [];

    for (const relativePath of unique(requiredNodeModules.map(item => normalizeForMatching(item)))) {
      const absolutePath = path.join(projectRoot, relativePath);
      if (await pathExists(absolutePath) && await isInspectableDirectory(absolutePath)) {
        nodeModulesRoots.push(absolutePath);
      } else {
        missingNodeModules.push(relativePath);
      }
    }

    return { missingNodeModules, nodeModulesRoots };
  }

  const nodeModulesRoots: string[] = [];
  const rootNodeModules = path.join(projectRoot, 'node_modules');
  if (await pathExists(rootNodeModules) && await isInspectableDirectory(rootNodeModules)) {
    nodeModulesRoots.push(rootNodeModules);
  }

  const packagesDir = path.join(projectRoot, 'packages');
  try {
    const packageNames = await readdir(packagesDir);
    for (const packageName of packageNames) {
      const packageNodeModules = path.join(packagesDir, packageName, 'node_modules');
      if (await pathExists(packageNodeModules) && await isInspectableDirectory(packageNodeModules)) {
        nodeModulesRoots.push(packageNodeModules);
      }
    }
  } catch {
    // No workspace packages to inspect.
  }

  return { missingNodeModules: [], nodeModulesRoots };
}

async function collectScopedSymlinkIssues(
  projectRoot: string,
  scopedDir: string,
): Promise<SharedInstallSymlinkIssue[]> {
  const issues: SharedInstallSymlinkIssue[] = [];
  let scopeEntries: string[] = [];
  try {
    scopeEntries = await readdir(scopedDir);
  } catch {
    return issues;
  }

  for (const scopedEntryName of scopeEntries) {
    const scopedEntryPath = path.join(scopedDir, scopedEntryName);
    try {
      const stat = await lstat(scopedEntryPath);
      if (!stat.isSymbolicLink()) {
        continue;
      }

      const symlinkTarget = await readlink(scopedEntryPath);
      const resolvedTarget = path.resolve(path.dirname(scopedEntryPath), symlinkTarget);
      if (!isTempBacklogPath(resolvedTarget)) {
        continue;
      }

      issues.push({
        path: describePathOrRoot(repoRelative(projectRoot, scopedEntryPath)),
        target: normalizeForMatching(resolvedTarget),
      });
    } catch {
      // Ignore entries that disappear mid-inspection.
    }
  }

  return issues;
}

async function inspectNodeModulesRoot(
  projectRoot: string,
  nodeModulesRoot: string,
): Promise<SharedInstallSymlinkIssue[]> {
  const issues: SharedInstallSymlinkIssue[] = [];
  let entries: string[] = [];
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
        const symlinkTarget = await readlink(entryPath);
        const resolvedTarget = path.resolve(path.dirname(entryPath), symlinkTarget);
        if (isTempBacklogPath(resolvedTarget)) {
          issues.push({
            path: describePathOrRoot(repoRelative(projectRoot, entryPath)),
            target: normalizeForMatching(resolvedTarget),
          });
        }
        continue;
      }

      if (!stat.isDirectory() || !entryName.startsWith('@')) {
        continue;
      }

      issues.push(...await collectScopedSymlinkIssues(projectRoot, entryPath));
    } catch {
      // Ignore entries that disappear mid-inspection.
    }
  }

  return issues;
}

export async function inspectSharedInstallState(
  projectRoot: string,
  options: { requiredNodeModules?: string[] } = {},
): Promise<SharedInstallInspection> {
  const { missingNodeModules, nodeModulesRoots } = await collectNodeModulesRoots(projectRoot, options.requiredNodeModules);
  const staleSymlinks: SharedInstallSymlinkIssue[] = [];

  for (const nodeModulesRoot of nodeModulesRoots) {
    staleSymlinks.push(...await inspectNodeModulesRoot(projectRoot, nodeModulesRoot));
  }

  return {
    missingNodeModules,
    staleSymlinks,
    inspectedNodeModules: nodeModulesRoots.map(nodeModulesRoot => describePathOrRoot(repoRelative(projectRoot, nodeModulesRoot))),
  };
}

export function formatStaleSharedInstallState(inspection: SharedInstallInspection): string {
  const detail = inspection.staleSymlinks.length > 0
    ? `poisoned shared install targets: ${formatStaleTargets(inspection.staleSymlinks)}`
    : `shared install inspection found no bootstrapped node_modules to inspect (${inspection.inspectedNodeModules.join(', ') || 'none'})`;
  return `stale shared install state [${STALE_SHARED_INSTALL_STATE_CODE}]: ${detail} Recovery: ${SHARED_INSTALL_RECOVERY_INSTRUCTION}`;
}

export function formatMainRepoInstallRequired(inspection: SharedInstallInspection): string {
  const parts: string[] = [];
  if (inspection.missingNodeModules.length > 0) {
    parts.push(`missing bootstrapped node_modules: ${inspection.missingNodeModules.join(', ')}`);
  }
  if (inspection.staleSymlinks.length > 0) {
    parts.push(`poisoned shared install targets: ${formatStaleTargets(inspection.staleSymlinks)}`);
  }
  const detail = parts.join('; ') || 'shared dependency bootstrap is incomplete';
  return `dependency refresh required from main repo [${MAIN_REPO_INSTALL_REQUIRED_CODE}]: ${detail} Recovery: ${SHARED_INSTALL_RECOVERY_INSTRUCTION}`;
}

export function containsSharedInstallPolicyCode(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }

  return reason.includes(STALE_SHARED_INSTALL_STATE_CODE) || reason.includes(MAIN_REPO_INSTALL_REQUIRED_CODE);
}
