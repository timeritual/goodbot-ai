import path from 'node:path';
import { safeReadJson, fileExists } from '../utils/index.js';
import type { Language, LanguageDetection } from './types.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function detectLanguage(projectRoot: string): Promise<LanguageDetection> {
  const pkg = await safeReadJson<PackageJson>(path.join(projectRoot, 'package.json'));

  if (pkg) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const hasTsConfig = await fileExists(path.join(projectRoot, 'tsconfig.json'));
    const hasTypeScript = !!allDeps['typescript'] || hasTsConfig;

    const primary: Language = hasTypeScript ? 'typescript' : 'javascript';
    const secondary: Language[] = hasTypeScript ? ['javascript'] : [];
    return { primary, secondary };
  }

  if (
    (await fileExists(path.join(projectRoot, 'requirements.txt'))) ||
    (await fileExists(path.join(projectRoot, 'pyproject.toml'))) ||
    (await fileExists(path.join(projectRoot, 'setup.py')))
  ) {
    return { primary: 'python', secondary: [] };
  }

  if (await fileExists(path.join(projectRoot, 'go.mod'))) {
    return { primary: 'go', secondary: [] };
  }

  return { primary: 'other', secondary: [] };
}
