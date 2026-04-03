import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileExists } from '../utils/index.js';
import type { DetectedLayer, StructureAnalysis } from './types.js';

// Known directory names and their typical layer levels
const KNOWN_LAYERS: Record<string, number> = {
  types: 0,
  constants: 0,
  config: 1,
  utils: 1,
  helpers: 1,
  lib: 2,
  api: 3,
  services: 4,
  stores: 5,
  features: 5,
  hooks: 6,
  contexts: 6,
  composables: 6,
  components: 7,
  views: 7,
  pages: 8,
  screens: 8,
  navigation: 8,
  routes: 8,
  app: 8,
};

async function getDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function analyzeStructure(projectRoot: string): Promise<StructureAnalysis> {
  // Determine src root
  let srcRoot: string | null = null;
  for (const candidate of ['src', 'app', 'lib']) {
    if (await fileExists(path.join(projectRoot, candidate))) {
      srcRoot = candidate;
      break;
    }
  }

  if (!srcRoot) {
    return {
      srcRoot: null,
      detectedLayers: [],
      hasBarrelFiles: false,
      hasInterfaceFiles: false,
      testStrategy: 'none',
    };
  }

  const srcPath = path.join(projectRoot, srcRoot);
  const dirs = await getDirectories(srcPath);

  const detectedLayers: DetectedLayer[] = [];
  let hasBarrelFiles = false;
  let hasInterfaceFiles = false;

  for (const dir of dirs) {
    if (dir === '__tests__' || dir === '__mocks__' || dir === 'test' || dir === 'tests') continue;

    const dirFullPath = path.join(srcPath, dir);
    const hasBarrel =
      (await fileExists(path.join(dirFullPath, 'index.ts'))) ||
      (await fileExists(path.join(dirFullPath, 'index.tsx'))) ||
      (await fileExists(path.join(dirFullPath, 'index.js')));
    const hasInterfaces = await fileExists(path.join(dirFullPath, 'interfaces.ts'));

    if (hasBarrel) hasBarrelFiles = true;
    if (hasInterfaces) hasInterfaceFiles = true;

    const suggestedLevel = KNOWN_LAYERS[dir] ?? 5;

    detectedLayers.push({
      name: dir,
      path: `${srcRoot}/${dir}`,
      suggestedLevel,
      hasBarrel,
      hasInterfaces,
    });
  }

  // Sort by suggested level
  detectedLayers.sort((a, b) => a.suggestedLevel - b.suggestedLevel);

  // Detect test strategy
  const hasTestDir =
    (await fileExists(path.join(srcPath, '__tests__'))) ||
    (await fileExists(path.join(projectRoot, 'tests'))) ||
    (await fileExists(path.join(projectRoot, 'test')));
  // Check for colocated tests by looking for .test. files in the first detected layer
  let hasColocatedTests = false;
  if (detectedLayers.length > 0) {
    try {
      const firstDir = path.join(projectRoot, detectedLayers[0].path);
      const files = await readdir(firstDir);
      hasColocatedTests = files.some(
        (f) => f.includes('.test.') || f.includes('.spec.'),
      );
    } catch {
      // ignore
    }
  }

  let testStrategy: StructureAnalysis['testStrategy'] = 'none';
  if (hasTestDir && hasColocatedTests) testStrategy = 'both';
  else if (hasTestDir) testStrategy = 'separate';
  else if (hasColocatedTests) testStrategy = 'colocated';

  return {
    srcRoot,
    detectedLayers,
    hasBarrelFiles,
    hasInterfaceFiles,
    testStrategy,
  };
}
