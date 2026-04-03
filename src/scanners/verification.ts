import path from 'node:path';
import { safeReadJson, fileExists } from '../utils/index.js';
import type { VerificationCommands } from './types.js';

interface PackageJson {
  scripts?: Record<string, string>;
}

export async function detectVerification(projectRoot: string): Promise<VerificationCommands> {
  const pkg = await safeReadJson<PackageJson>(path.join(projectRoot, 'package.json'));
  const scripts = pkg?.scripts ?? {};
  const hasTsConfig = await fileExists(path.join(projectRoot, 'tsconfig.json'));

  return {
    typecheck: scripts['typecheck'] ?? (hasTsConfig ? 'npx tsc --noEmit' : null),
    lint:
      scripts['lint'] ??
      (scripts['eslint'] ? `npm run eslint` : null),
    test:
      scripts['test'] && scripts['test'] !== 'echo "Error: no test specified" && exit 1'
        ? `npm test`
        : null,
    format: scripts['format'] ?? scripts['format:check'] ?? null,
    build: scripts['build'] ? 'npm run build' : null,
  };
}
