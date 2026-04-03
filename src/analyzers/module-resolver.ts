import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { fileExists } from '../utils/index.js';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', 'coverage',
  '__tests__', '__mocks__', 'test', 'tests', 'e2e',
  '.git', '.cache',
]);

/**
 * Determine which module a file belongs to based on its path relative to srcRoot.
 * e.g., /project/src/services/orderService.ts → 'services'
 */
export function getModuleName(filePath: string, srcRootAbsolute: string): string {
  const relative = path.relative(srcRootAbsolute, filePath);
  const firstDir = relative.split(path.sep)[0];
  // Files directly in srcRoot (no subdirectory)
  if (firstDir === relative || firstDir.includes('.')) {
    return '_root';
  }
  return firstDir;
}

/**
 * Resolve an import specifier to an absolute file path.
 * Tries various extensions and index files.
 */
export async function resolveImportPath(
  specifier: string,
  fromDir: string,
): Promise<string | null> {
  const base = path.resolve(fromDir, specifier);

  // Try exact path first (must be a file, not directory)
  try {
    const s = await stat(base);
    if (s.isFile()) return base;
  } catch {
    // doesn't exist, continue
  }

  // Try with extensions
  for (const ext of SOURCE_EXTENSIONS) {
    const withExt = base + ext;
    if (await fileExists(withExt)) {
      return withExt;
    }
  }

  // Try as directory with index file
  for (const ext of SOURCE_EXTENSIONS) {
    const indexPath = path.join(base, `index${ext}`);
    if (await fileExists(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Collect all parseable source files under srcRoot, recursively.
 * Skips node_modules, dist, test directories, and .d.ts files.
 */
export async function collectSourceFiles(srcRootAbsolute: string): Promise<string[]> {
  const files: string[] = [];
  await walkDir(srcRootAbsolute, files);
  return files;
}

async function walkDir(dir: string, files: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkDir(path.join(dir, entry.name), files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!SOURCE_EXTENSIONS.includes(ext)) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;
      files.push(path.join(dir, entry.name));
    }
  }
}
