import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import type { Framework, FrameworkPatterns, FrameworkConvention } from './types.js';

export async function detectFrameworkPatterns(
  projectRoot: string,
  framework: Framework,
  srcRoot: string | null,
): Promise<FrameworkPatterns> {
  const detectors: Partial<Record<Framework, () => Promise<FrameworkPatterns>>> = {
    nest: () => detectNestPatterns(projectRoot, srcRoot),
    react: () => detectReactPatterns(projectRoot, srcRoot),
    'react-native': () => detectReactPatterns(projectRoot, srcRoot),
    next: () => detectNextPatterns(projectRoot, srcRoot),
    express: () => detectExpressPatterns(projectRoot, srcRoot),
  };

  const detector = detectors[framework];
  if (!detector) return { conventions: [], structuralNotes: [] };

  return detector();
}

// ─── Helpers ──────────────────────────────────────────────

async function findFiles(dir: string, pattern: RegExp, maxDepth = 4): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir, 0);
  return results;
}

async function grepFiles(files: string[], pattern: RegExp, limit = 5): Promise<string[]> {
  const matches: string[] = [];
  for (const file of files) {
    if (matches.length >= limit) break;
    try {
      const content = await readFile(file, 'utf-8');
      if (pattern.test(content)) {
        matches.push(file);
      }
    } catch {
      // skip unreadable files
    }
  }
  return matches;
}

function relativize(projectRoot: string, files: string[]): string {
  return files.slice(0, 3).map(f => path.relative(projectRoot, f)).join(', ');
}

// ─── NestJS ──────────────────────────────────────────────

async function detectNestPatterns(projectRoot: string, srcRoot: string | null): Promise<FrameworkPatterns> {
  const searchRoot = srcRoot ? path.join(projectRoot, srcRoot) : projectRoot;
  const conventions: FrameworkConvention[] = [];
  const structuralNotes: string[] = [];

  const tsFiles = await findFiles(searchRoot, /\.ts$/);

  // Module organization
  const moduleFiles = tsFiles.filter(f => f.endsWith('.module.ts'));
  if (moduleFiles.length > 0) {
    const moduleDirs = [...new Set(moduleFiles.map(f => path.relative(projectRoot, path.dirname(f))))];
    structuralNotes.push(`NestJS modules detected in: ${moduleDirs.slice(0, 5).join(', ')}`);
  }

  // Guard patterns
  const guardFiles = await grepFiles(tsFiles, /APP_GUARD|@UseGuards/);
  if (guardFiles.length > 0) {
    const globalGuards = await grepFiles(tsFiles, /APP_GUARD/);
    if (globalGuards.length > 0) {
      conventions.push({
        name: 'Global guards',
        description: 'Global guards are registered via APP_GUARD provider — new endpoints are protected by default',
        evidence: relativize(projectRoot, globalGuards),
      });
    }
  }

  // Repository pattern
  const repoFiles = tsFiles.filter(f => /\.repository\.ts$/.test(f));
  if (repoFiles.length > 0) {
    conventions.push({
      name: 'Repository pattern',
      description: 'Data access uses dedicated repository classes — do not access the ORM directly from services',
      evidence: relativize(projectRoot, repoFiles),
    });
  }

  // Entity pattern
  const entityFiles = tsFiles.filter(f => /\.entity\.ts$/.test(f));
  if (entityFiles.length > 0) {
    conventions.push({
      name: 'Entity files',
      description: `${entityFiles.length} entity files detected — follow existing entity patterns when creating new ones`,
      evidence: relativize(projectRoot, entityFiles),
    });

    // Check for custom entity decorators
    const customDecorators = await grepFiles(entityFiles, /@Entity(?:WithSchema|Repository)\b/);
    if (customDecorators.length > 0) {
      conventions.push({
        name: 'Custom entity decorators',
        description: 'Custom entity decorators in use — check existing entities for registration patterns before creating new ones',
        evidence: relativize(projectRoot, customDecorators),
      });
    }
  }

  // DTO pattern
  const dtoFiles = tsFiles.filter(f => /\.dto\.ts$/.test(f));
  if (dtoFiles.length > 0) {
    conventions.push({
      name: 'DTO pattern',
      description: `${dtoFiles.length} DTO files detected — validate request/response data with DTOs, not inline`,
      evidence: relativize(projectRoot, dtoFiles),
    });
  }

  // Interceptors / Pipes
  const interceptorFiles = tsFiles.filter(f => /\.interceptor\.ts$/.test(f));
  const pipeFiles = tsFiles.filter(f => /\.pipe\.ts$/.test(f));
  if (interceptorFiles.length > 0) {
    structuralNotes.push(`${interceptorFiles.length} custom interceptor(s) — check for cross-cutting concerns before adding new ones`);
  }
  if (pipeFiles.length > 0) {
    structuralNotes.push(`${pipeFiles.length} custom pipe(s) for validation/transformation`);
  }

  return { conventions, structuralNotes };
}

// ─── React / React Native ────────────────────────────────

async function detectReactPatterns(projectRoot: string, srcRoot: string | null): Promise<FrameworkPatterns> {
  const searchRoot = srcRoot ? path.join(projectRoot, srcRoot) : projectRoot;
  const conventions: FrameworkConvention[] = [];
  const structuralNotes: string[] = [];

  const tsxFiles = await findFiles(searchRoot, /\.[tj]sx?$/);

  // State management
  const reduxFiles = await grepFiles(tsxFiles, /createSlice|configureStore|@reduxjs\/toolkit/);
  const zustandFiles = await grepFiles(tsxFiles, /create\(.*set.*get/);
  const contextFiles = await grepFiles(tsxFiles, /createContext\s*</);

  if (reduxFiles.length > 0) {
    conventions.push({
      name: 'Redux state management',
      description: 'Uses Redux Toolkit — add new state via slices, not ad-hoc context',
      evidence: relativize(projectRoot, reduxFiles),
    });
  } else if (zustandFiles.length > 0) {
    conventions.push({
      name: 'Zustand state management',
      description: 'Uses Zustand stores — prefer stores over React context for shared state',
      evidence: relativize(projectRoot, zustandFiles),
    });
  } else if (contextFiles.length >= 3) {
    structuralNotes.push(`${contextFiles.length} React contexts detected — check existing contexts before creating new ones`);
  }

  // Custom hooks
  const hookFiles = tsxFiles.filter(f => /use[A-Z].*\.[tj]sx?$/.test(path.basename(f)));
  if (hookFiles.length >= 5) {
    structuralNotes.push(`${hookFiles.length} custom hooks detected — check for existing hooks before creating new ones`);
  }

  return { conventions, structuralNotes };
}

// ─── Next.js ─────────────────────────────────────────────

async function detectNextPatterns(projectRoot: string, srcRoot: string | null): Promise<FrameworkPatterns> {
  const base = await detectReactPatterns(projectRoot, srcRoot);
  const searchRoot = srcRoot ? path.join(projectRoot, srcRoot) : projectRoot;
  const tsFiles = await findFiles(searchRoot, /\.[tj]sx?$/);

  // App Router vs Pages Router
  const appDir = await findFiles(path.join(searchRoot, 'app'), /page\.[tj]sx?$/);
  const pagesDir = await findFiles(path.join(searchRoot, 'pages'), /\.[tj]sx?$/);

  if (appDir.length > 0) {
    base.structuralNotes.push('Uses App Router — new routes go in app/ directory with page.tsx files');
  } else if (pagesDir.length > 0) {
    base.structuralNotes.push('Uses Pages Router — new routes go in pages/ directory');
  }

  // Server actions
  const serverActions = await grepFiles(tsFiles, /'use server'/);
  if (serverActions.length > 0) {
    base.conventions.push({
      name: 'Server actions',
      description: 'Server actions in use — prefer server actions over API routes for mutations',
      evidence: relativize(projectRoot, serverActions),
    });
  }

  return base;
}

// ─── Express ─────────────────────────────────────────────

async function detectExpressPatterns(projectRoot: string, srcRoot: string | null): Promise<FrameworkPatterns> {
  const searchRoot = srcRoot ? path.join(projectRoot, srcRoot) : projectRoot;
  const conventions: FrameworkConvention[] = [];
  const structuralNotes: string[] = [];

  const tsFiles = await findFiles(searchRoot, /\.[tj]s$/);

  // Middleware
  const middlewareFiles = tsFiles.filter(f => /middleware/i.test(f));
  if (middlewareFiles.length > 0) {
    structuralNotes.push(`${middlewareFiles.length} middleware file(s) — check existing middleware before adding new ones`);
  }

  // Router organization
  const routeFiles = tsFiles.filter(f => /\.route[sr]?\.[tj]s$/.test(path.basename(f)));
  if (routeFiles.length > 0) {
    conventions.push({
      name: 'Router file pattern',
      description: `${routeFiles.length} route files detected — follow existing router organization`,
      evidence: relativize(projectRoot, routeFiles),
    });
  }

  return { conventions, structuralNotes };
}
