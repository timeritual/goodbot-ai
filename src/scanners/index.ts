import path from 'node:path';
import { safeReadJson } from '../utils/index.js';
import { detectFramework } from './framework.js';
import { detectLanguage } from './language.js';
import { analyzeStructure } from './structure.js';
import { detectVerification } from './verification.js';
import { detectFrameworkPatterns } from './patterns.js';
import type { ScanResult } from './types.js';

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

export async function runFullScan(projectRoot: string): Promise<ScanResult> {
  const [framework, language, structure, verification] = await Promise.all([
    detectFramework(projectRoot),
    detectLanguage(projectRoot),
    analyzeStructure(projectRoot),
    detectVerification(projectRoot),
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
  };
}
