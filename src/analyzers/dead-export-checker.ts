import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { SolidViolation } from './types.js';
import type { DetectedLayer } from '../scanners/index.js';

/**
 * Dead export detector.
 *
 * Finds exported symbols that are never imported by any other file in the project.
 * Dead exports bloat a module's public interface and mislead consumers about
 * what's actually used. Common in AI-generated codebases where agents create
 * functions that are never wired up.
 *
 * Scope: checks cross-module barrel exports. Intra-module usage is not tracked
 * (a symbol exported from a barrel but only used within its own module is still
 * considered "alive" since we can't cheaply distinguish re-exports for internal use).
 */

export interface DeadExportResult {
  moduleName: string;
  exportName: string;
  file: string;
}

export async function checkDeadExports(
  sourceFiles: string[],
  detectedLayers: DetectedLayer[],
  srcRootAbsolute: string,
  projectRoot: string,
): Promise<{ violations: SolidViolation[]; deadExports: DeadExportResult[] }> {
  const violations: SolidViolation[] = [];
  const deadExports: DeadExportResult[] = [];

  // Only check modules that have barrel files (those define the public API)
  const modulesWithBarrels = detectedLayers.filter(l => l.hasBarrel);
  if (modulesWithBarrels.length === 0) return { violations, deadExports };

  // Step 1: Collect all exported symbol names from each barrel
  const exportsByModule = new Map<string, { names: string[]; file: string }>();
  for (const layer of modulesWithBarrels) {
    const barrelPath = findBarrelPath(srcRootAbsolute, layer.name);
    if (!barrelPath) continue;

    const names = await extractExportNames(barrelPath);
    if (names.length > 0) {
      exportsByModule.set(layer.name, {
        names,
        file: path.relative(projectRoot, barrelPath),
      });
    }
  }

  if (exportsByModule.size === 0) return { violations, deadExports };

  // Step 2: Collect all imported symbol names across the project
  const importedSymbols = new Set<string>(); // "moduleName::symbolName"

  const BATCH = 50;
  for (let i = 0; i < sourceFiles.length; i += BATCH) {
    const batch = sourceFiles.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(f => extractImportedSymbols(f, srcRootAbsolute)),
    );
    for (const symbols of results) {
      for (const sym of symbols) {
        importedSymbols.add(sym);
      }
    }
  }

  // Step 3: Cross-reference — find exports that nothing imports
  for (const [moduleName, { names, file }] of exportsByModule) {
    const unused = names.filter(name => {
      // Check if any file imports this symbol from this module
      return !importedSymbols.has(`${moduleName}::${name}`);
    });

    if (unused.length === 0) continue;

    // Only flag if there are meaningful unused exports (not just types)
    for (const name of unused) {
      deadExports.push({ moduleName, exportName: name, file });
    }

    // Group into a single violation per module for cleaner output
    if (unused.length >= 2) {
      const listed = unused.slice(0, 8).join(', ');
      const more = unused.length > 8 ? ` and ${unused.length - 8} more` : '';
      violations.push({
        principle: 'ISP',
        severity: unused.length >= 5 ? 'warning' : 'info',
        file,
        message: `Dead exports in ${moduleName}: ${listed}${more} (${unused.length} unused of ${names.length} total)`,
        suggestion: 'Remove unused exports to keep the module interface focused',
      });
    }
  }

  return { violations, deadExports };
}

function findBarrelPath(srcRoot: string, moduleName: string): string | null {
  const dir = path.join(srcRoot, moduleName);
  for (const name of ['index.ts', 'index.tsx', 'index.js']) {
    return path.join(dir, name);
  }
  return null;
}

/** Extract named export symbols from a file */
async function extractExportNames(filePath: string): Promise<string[]> {
  const names: string[] = [];

  try {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('export')) continue;

      // export { a, b, c } from '...' or export { a, b, c }
      const braceMatch = trimmed.match(/export\s+(?:type\s+)?\{([^}]+)\}/);
      if (braceMatch) {
        const symbols = braceMatch[1].split(',').map(s => {
          const part = s.trim();
          // Handle `original as alias` — use the alias (that's what consumers import)
          const asMatch = part.match(/\w+\s+as\s+(\w+)/);
          return asMatch ? asMatch[1] : part.split(/\s/)[0];
        }).filter(Boolean);
        names.push(...symbols);
        continue;
      }

      // export * from '...' — we can't know specific names, skip
      if (/export\s+\*\s+from/.test(trimmed)) continue;

      // export const/function/class/type/interface/enum NAME
      const declMatch = trimmed.match(
        /export\s+(?:default\s+)?(?:const|let|var|function|class|type|interface|enum|async\s+function)\s+(\w+)/,
      );
      if (declMatch) {
        names.push(declMatch[1]);
      }
    }
  } catch {
    return [];
  }

  return names;
}

/** Extract which symbols each file imports, keyed as "moduleName::symbolName" */
async function extractImportedSymbols(
  filePath: string,
  srcRootAbsolute: string,
): Promise<string[]> {
  const symbols: string[] = [];

  // Determine this file's module
  const relative = path.relative(srcRootAbsolute, filePath);
  const parts = relative.split(path.sep);
  const fileModule = parts[0].includes('.') ? '_root' : parts[0];

  try {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    let pendingImport = '';

    for await (const line of rl) {
      let trimmed = line.trim();

      // Handle multi-line imports
      if (pendingImport) {
        pendingImport += ' ' + trimmed;
        if (trimmed.includes('from ') || trimmed.includes('from\t')) {
          extractFromImportLine(pendingImport, fileModule, srcRootAbsolute, filePath, symbols);
          pendingImport = '';
        }
        continue;
      }

      if (
        trimmed.startsWith('import ') &&
        trimmed.includes('{') &&
        !trimmed.includes('}') &&
        !trimmed.includes('from')
      ) {
        pendingImport = trimmed;
        continue;
      }

      if (trimmed.startsWith('import ')) {
        extractFromImportLine(trimmed, fileModule, srcRootAbsolute, filePath, symbols);
      }
    }
  } catch {
    // skip unreadable files
  }

  return symbols;
}

function extractFromImportLine(
  line: string,
  fileModule: string,
  srcRootAbsolute: string,
  filePath: string,
  symbols: string[],
): void {
  // Extract the module specifier
  const fromMatch = line.match(/from\s+['"]([^'"]+)['"]/);
  if (!fromMatch) return;
  const specifier = fromMatch[1];
  if (!specifier.startsWith('.')) return; // skip node_modules

  // Resolve to determine target module
  const fileDir = path.dirname(filePath);
  const resolved = path.resolve(fileDir, specifier);
  const relativeToSrc = path.relative(srcRootAbsolute, resolved);
  const targetParts = relativeToSrc.split(path.sep);
  const targetModule = targetParts[0].includes('.') ? '_root' : targetParts[0];

  // Skip intra-module imports (we only track cross-module usage)
  if (targetModule === fileModule) return;

  // Extract named imports: import { a, b as c, type d } from '...'
  const braceMatch = line.match(/\{([^}]+)\}/);
  if (braceMatch) {
    const names = braceMatch[1].split(',').map(s => {
      let name = s.trim();
      // Strip `type ` prefix
      name = name.replace(/^type\s+/, '');
      // Handle `original as alias` — the original is what's exported
      const asMatch = name.match(/(\w+)\s+as\s+\w+/);
      return asMatch ? asMatch[1] : name.split(/\s/)[0];
    }).filter(Boolean);

    for (const name of names) {
      symbols.push(`${targetModule}::${name}`);
    }
  }

  // import * as X — counts as using everything (we can't narrow it)
  if (/import\s+\*\s+as/.test(line)) {
    symbols.push(`${targetModule}::*`);
  }
}
