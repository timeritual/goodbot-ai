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

/** Extract tsconfig project flag from a build script (e.g. "tsc -p tsconfig.build.json") */
function extractTsconfigFromBuild(scripts: Record<string, string>): string | null {
  const build = scripts['build'] ?? '';
  const match = build.match(/tsc\s+(?:-p|--project)\s+(\S+)/);
  if (match) return match[1];
  return null;
}

export async function detectVerification(projectRoot: string): Promise<VerificationCommands> {
  const pkg = await safeReadJson<PackageJson>(path.join(projectRoot, 'package.json'));
  const scripts = pkg?.scripts ?? {};
  const hasTsConfig = await fileExists(path.join(projectRoot, 'tsconfig.json'));

  // For typecheck: prefer explicit scripts, then derive from build script's tsconfig
  let typecheck = findScript(scripts, 'typecheck', 'type-check', 'check-types', 'tsc');
  if (!typecheck && hasTsConfig) {
    const tsconfig = extractTsconfigFromBuild(scripts);
    typecheck = tsconfig ? `npx tsc -p ${tsconfig} --noEmit` : 'npx tsc --noEmit';
  }

  return {
    typecheck,
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
