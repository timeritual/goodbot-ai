import path from 'node:path';
import { safeReadJson, fileExists } from '../utils/index.js';
import type { Framework, FrameworkDetection } from './types.js';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function detectFramework(projectRoot: string): Promise<FrameworkDetection> {
  // Try package.json first (JS/TS ecosystem)
  const pkg = await safeReadJson<PackageJson>(path.join(projectRoot, 'package.json'));
  if (pkg) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    // Order matters: meta-frameworks (nuxt, next) must be checked before their base (vue, react)
    const checks: Array<{ key: string; framework: Framework }> = [
      { key: 'react-native', framework: 'react-native' },
      { key: 'next', framework: 'next' },
      { key: 'nuxt', framework: 'nuxt' },
      { key: '@angular/core', framework: 'angular' },
      { key: '@nestjs/core', framework: 'nest' },
      { key: 'express', framework: 'express' },
      { key: 'react', framework: 'react' },
      { key: 'vue', framework: 'vue' },
    ];

    for (const { key, framework } of checks) {
      if (allDeps[key]) {
        return { framework, confidence: 'high', detectedFrom: `package.json → "${key}"` };
      }
    }

    return { framework: 'node', confidence: 'medium', detectedFrom: 'package.json (no framework detected)' };
  }

  // Python ecosystem
  for (const manifest of ['requirements.txt', 'pyproject.toml', 'setup.py']) {
    const manifestPath = path.join(projectRoot, manifest);
    if (await fileExists(manifestPath)) {
      const { detectPythonFramework } = await import('./framework-python.js');
      return detectPythonFramework(manifestPath, manifest);
    }
  }

  // Go ecosystem
  if (await fileExists(path.join(projectRoot, 'go.mod'))) {
    return { framework: 'go', confidence: 'high', detectedFrom: 'go.mod' };
  }

  return { framework: 'other', confidence: 'low', detectedFrom: 'no manifest file found' };
}
