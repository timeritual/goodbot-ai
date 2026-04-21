import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileExists } from '../utils/index.js';
import { matchRole, genericFeatureRole, type SystemType } from './roles.js';
import type { DetectedLayer, StructureAnalysis } from './types.js';

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
): Promise<StructureAnalysis> {
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

    // Match directory to a canonical role for this system type
    const fileNames = await getFiles(dirFullPath);
    const role = matchRole(dir, fileNames, systemType) ?? genericFeatureRole(systemType);

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
