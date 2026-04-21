import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileExists } from '../utils/index.js';
import { matchRole, genericFeatureRole, type SystemType } from './roles.js';
import type { DetectedLayer, Framework, StructureAnalysis } from './types.js';

async function getDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  } catch {
    return [];
  }
}

async function getFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function analyzeStructure(
  projectRoot: string,
  systemType: SystemType = 'library',
  framework?: Framework,
): Promise<StructureAnalysis> {
  // Determine src root — conventional locations, with framework-specific overrides
  let srcRoot: string | null = null;
  for (const candidate of ['src', 'app', 'lib']) {
    if (await fileExists(path.join(projectRoot, candidate))) {
      srcRoot = candidate;
      break;
    }
  }

  // Angular convention: everything lives under src/app/ with src/ containing only app/, main.ts, etc.
  if (srcRoot === 'src' && framework === 'angular') {
    const appPath = path.join(projectRoot, 'src', 'app');
    if (await fileExists(appPath)) {
      srcRoot = 'src/app';
    }
  }

  // Nuxt convention: directories live at project root (components/, pages/, etc.), no src/ wrapper.
  // If we found no src/ but this is Nuxt, use the project root.
  if (!srcRoot && framework === 'nuxt') {
    const nuxtMarkers = ['pages', 'components', 'composables', 'server'];
    for (const marker of nuxtMarkers) {
      if (await fileExists(path.join(projectRoot, marker))) {
        srcRoot = '.';
        break;
      }
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

    // Match directory to a canonical role for this system type (and framework, if it has specific roles)
    const fileNames = await getFiles(dirFullPath);
    const role = matchRole(dir, fileNames, systemType, framework) ?? genericFeatureRole(systemType);

    detectedLayers.push({
      name: dir,
      path: `${srcRoot}/${dir}`,
      suggestedLevel: role.level,
      hasBarrel,
      hasInterfaces,
      role: {
        id: role.id,
        displayName: role.displayName,
        description: role.description,
        isLeaf: role.isLeaf,
      },
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
