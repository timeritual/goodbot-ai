import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeReadJson } from '../utils/index.js';
import { detectFramework } from './framework.js';
import { detectLanguage } from './language.js';
import { analyzeStructure } from './structure.js';
import { detectVerification } from './verification.js';
import { detectFrameworkPatterns } from './patterns.js';
import { detectSystemType } from './roles.js';
import type { ScanResult } from './types.js';

const execFileAsync = promisify(execFile);

export type { ScanResult } from './types.js';
export type {
  Framework,
  Language,
  FrameworkDetection,
  LanguageDetection,
  DetectedLayer,
  DetectedLayerRole,
  StructureAnalysis,
  VerificationCommands,
  FrameworkPatterns,
  FrameworkConvention,
} from './types.js';
export type { SystemType, LayerRole } from './roles.js';
export { getRolesForSystemType, detectSystemType } from './roles.js';

interface PackageJson {
  name?: string;
}

async function detectDefaultBranch(projectRoot: string): Promise<string> {
  // 1. Local origin/HEAD — authoritative when set (fast, no network)
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: projectRoot });
    const ref = stdout.trim();
    if (ref) return ref.replace('refs/remotes/origin/', '');
  } catch {
    // origin/HEAD not set — continue
  }

  // 2. Ask origin directly (short network timeout). Authoritative — uses GitHub/remote's actual default.
  try {
    const { stdout } = await execFileAsync(
      'git', ['ls-remote', '--symref', 'origin', 'HEAD'],
      { cwd: projectRoot, timeout: 5000 },
    );
    const match = stdout.match(/^ref: refs\/heads\/(\S+)\s+HEAD/);
    if (match) return match[1];
  } catch {
    // Network unavailable, unauthenticated, or timed out — continue
  }

  // 3. Look for well-known default branches on origin (no network — uses local remote-tracking refs).
  //    Order matters: we pick the first match; `main` and `master` come before `develop*` because
  //    most repos that have both use `main` as primary.
  try {
    const { stdout } = await execFileAsync(
      'git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/'],
      { cwd: projectRoot },
    );
    const remoteBranches = new Set(stdout.split('\n').map((b) => b.trim()).filter(Boolean));
    for (const candidate of ['main', 'master', 'development', 'develop', 'trunk']) {
      if (remoteBranches.has(`origin/${candidate}`)) return candidate;
    }
  } catch {
    // Fall through
  }

  // 4. Current branch as last resort
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: projectRoot });
    const branch = stdout.trim();
    if (branch) return branch;
  } catch {
    // Not a git repo
  }

  return 'main';
}

export async function runFullScan(projectRoot: string): Promise<ScanResult> {
  // Framework detection runs first so we know the system type for structure analysis
  const framework = await detectFramework(projectRoot);
  const systemType = detectSystemType(framework.framework);

  const [language, structure, verification, defaultBranch] = await Promise.all([
    detectLanguage(projectRoot),
    analyzeStructure(projectRoot, systemType, framework.framework),
    detectVerification(projectRoot),
    detectDefaultBranch(projectRoot),
  ]);

  const [pkg, frameworkPatterns] = await Promise.all([
    safeReadJson<PackageJson>(path.join(projectRoot, 'package.json')),
    detectFrameworkPatterns(projectRoot, framework.framework, structure.srcRoot),
  ]);
  const projectName = pkg?.name ?? path.basename(projectRoot);

  return {
    projectRoot,
    projectName,
    framework,
    language,
    structure,
    verification,
    frameworkPatterns,
    defaultBranch,
    systemType,
  };
}
