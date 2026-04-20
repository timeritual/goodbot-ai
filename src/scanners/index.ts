import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeReadJson } from '../utils/index.js';
import { detectFramework } from './framework.js';
import { detectLanguage } from './language.js';
import { analyzeStructure } from './structure.js';
import { detectVerification } from './verification.js';
import { detectFrameworkPatterns } from './patterns.js';
import type { ScanResult } from './types.js';

const execFileAsync = promisify(execFile);

export type { ScanResult } from './types.js';
export type {
  Framework,
  Language,
  FrameworkDetection,
  LanguageDetection,
  DetectedLayer,
  StructureAnalysis,
  VerificationCommands,
  FrameworkPatterns,
  FrameworkConvention,
} from './types.js';

interface PackageJson {
  name?: string;
}

async function detectDefaultBranch(projectRoot: string): Promise<string> {
  // Try remote HEAD first (most reliable for GitHub default branch)
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: projectRoot });
    const ref = stdout.trim(); // e.g. refs/remotes/origin/development
    if (ref) return ref.replace('refs/remotes/origin/', '');
  } catch {
    // No remote HEAD set — fall through
  }

  // Fall back to current branch
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: projectRoot });
    const branch = stdout.trim();
    if (branch) return branch;
  } catch {
    // Not a git repo or git not available
  }

  return 'main';
}

export async function runFullScan(projectRoot: string): Promise<ScanResult> {
  const [framework, language, structure, verification, defaultBranch] = await Promise.all([
    detectFramework(projectRoot),
    detectLanguage(projectRoot),
    analyzeStructure(projectRoot),
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
  };
}
