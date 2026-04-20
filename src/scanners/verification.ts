import path from 'node:path';
import { safeReadJson, fileExists } from '../utils/index.js';
import type { VerificationCommands } from './types.js';

interface PackageJson {
  scripts?: Record<string, string>;
}

/** Find the first matching script key and return `npm run <key>` */
function findScript(scripts: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (scripts[key]) return `npm run ${key}`;
  }
  return null;
}

export async function detectVerification(projectRoot: string): Promise<VerificationCommands> {
  const pkg = await safeReadJson<PackageJson>(path.join(projectRoot, 'package.json'));
  const scripts = pkg?.scripts ?? {};
  const hasTsConfig = await fileExists(path.join(projectRoot, 'tsconfig.json'));

  return {
    typecheck:
      findScript(scripts, 'typecheck', 'type-check', 'check-types', 'tsc') ??
      (hasTsConfig ? 'npx tsc --noEmit' : null),
    lint:
      findScript(scripts, 'lint', 'lint:check', 'eslint'),
    test:
      scripts['test'] && scripts['test'] !== 'echo "Error: no test specified" && exit 1'
        ? 'npm test'
        : null,
    format:
      findScript(scripts, 'format', 'format:check', 'prettier', 'prettier:check'),
    build:
      findScript(scripts, 'build'),
  };
}
