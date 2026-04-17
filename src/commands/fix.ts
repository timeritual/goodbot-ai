import { Command } from 'commander';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import {
  runFullAnalysis, checkDeadExports, collectSourceFiles,
} from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log, safeWriteFile, safeReadFile, fileExists } from '../utils/index.js';
import type { FullAnalysis, BarrelViolation, DeadExportResult } from '../analyzers/index.js';
import type { StructureAnalysis } from '../scanners/index.js';

const VALID_FIX_TYPES = ['barrels', 'imports', 'dead-exports', 'srp', 'sort'] as const;
type FixType = typeof VALID_FIX_TYPES[number];

export const fixCommand = new Command('fix')
  .description('Auto-fix architectural violations where possible')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--dry-run', 'Preview fixes without applying', false)
  .option('--only <type>', 'Run only specific fix type: barrels, imports, dead-exports, srp, sort')
  .action(async (opts) => {
    const projectRoot = opts.path;

    if (opts.only && !VALID_FIX_TYPES.includes(opts.only as FixType)) {
      log.error(`Unknown fix type "${opts.only}". Valid types: ${VALID_FIX_TYPES.join(', ')}`);
      process.exit(1);
    }

    const only: FixType | undefined = opts.only;
    const spinner = ora('Analyzing project...').start();

    try {
      const scan = await runFullScan(projectRoot);
      let config;
      try { config = await loadConfig(projectRoot); } catch { /* no config */ }

      const analysis = await runFullAnalysis(projectRoot, scan.structure, config);
      spinner.succeed('Analysis complete');

      let fixCount = 0;
      const shouldRun = (type: FixType) => !only || only === type;

      // Fix 1: Rewrite barrel-bypassing imports
      if (shouldRun('imports')) {
        fixCount += await fixBarrelImports(projectRoot, analysis, opts.dryRun);
      }

      // Fix 2: Remove dead exports from barrels
      if (shouldRun('dead-exports')) {
        fixCount += await fixDeadExports(projectRoot, scan.structure, opts.dryRun);
      }

      // Fix 3: Generate missing barrel files
      if (shouldRun('barrels')) {
        fixCount += await fixMissingBarrels(projectRoot, scan.structure, opts.dryRun);
      }

      // Fix 4: Sort barrel exports alphabetically
      if (shouldRun('sort')) {
        fixCount += await fixBarrelSorting(projectRoot, scan.structure, opts.dryRun);
      }

      // Fix 5: Add split markers to oversized files
      if (shouldRun('srp')) {
        fixCount += await fixSRPViolations(projectRoot, analysis, opts.dryRun);
      }

      // Fix 6: Generate .cursorignore if missing
      if (shouldRun('barrels')) {
        fixCount += await fixMissingCursorignore(projectRoot, scan, opts.dryRun);
      }

      console.log();
      if (fixCount === 0) {
        log.success('Nothing to fix — good bot!');
      } else if (opts.dryRun) {
        log.info(`${fixCount} fix${fixCount > 1 ? 'es' : ''} available. Run \`goodbot fix\` to apply.`);
      } else {
        log.success(`Applied ${fixCount} fix${fixCount > 1 ? 'es' : ''}.`);
      }
    } catch (err) {
      spinner.fail('Fix failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ─── Fix: Barrel Import Rewrites ─────────────────────────

async function fixBarrelImports(
  projectRoot: string,
  analysis: FullAnalysis,
  dryRun: boolean,
): Promise<number> {
  const violations = analysis.dependency.barrelViolations;
  if (violations.length === 0) return 0;

  // Group violations by file so we can batch-edit each file once
  const byFile = new Map<string, BarrelViolation[]>();
  for (const v of violations) {
    const existing = byFile.get(v.file) ?? [];
    existing.push(v);
    byFile.set(v.file, existing);
  }

  let fixCount = 0;

  if (dryRun && violations.length > 0) {
    console.log();
    log.header(`Barrel Import Fixes (${violations.length})`);
  }

  for (const [file, fileViolations] of byFile) {
    const filePath = path.join(projectRoot, file);
    const content = await safeReadFile(filePath);
    if (!content) continue;

    const lines = content.split('\n');
    let modified = false;

    for (const violation of fileViolations) {
      const lineIdx = violation.line - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;

      const line = lines[lineIdx];

      // Build the barrel import path by stripping the last path segment
      const barrelSpecifier = violation.specifier.replace(/\/[^/]+$/, '').replace(/\/index$/, '');
      if (barrelSpecifier === violation.specifier) continue;

      const newLine = line.replace(violation.specifier, barrelSpecifier);
      if (newLine === line) continue;

      if (dryRun) {
        console.log(`  ${chalk.yellow('~')} ${chalk.dim(file)}:${violation.line} — '${chalk.red(violation.specifier)}' ${chalk.dim('→')} '${chalk.green(barrelSpecifier)}'`);
      } else {
        lines[lineIdx] = newLine;
        modified = true;
      }
      fixCount++;
    }

    if (modified) {
      await safeWriteFile(filePath, lines.join('\n'));
      log.success(`Fixed ${fileViolations.length} barrel import${fileViolations.length > 1 ? 's' : ''} in ${file}`);
    }
  }

  return fixCount;
}

// ─── Fix: Dead Export Removal ─────────────────────────────

async function fixDeadExports(
  projectRoot: string,
  structure: StructureAnalysis,
  dryRun: boolean,
): Promise<number> {
  if (!structure.srcRoot) return 0;

  const srcRootAbsolute = path.resolve(projectRoot, structure.srcRoot);
  const sourceFiles = await collectSourceFiles(srcRootAbsolute);
  if (sourceFiles.length === 0) return 0;

  const { deadExports } = await checkDeadExports(
    sourceFiles, structure.detectedLayers, srcRootAbsolute, projectRoot,
  );

  if (deadExports.length === 0) return 0;

  // Group by module
  const byModule = new Map<string, DeadExportResult[]>();
  for (const de of deadExports) {
    const existing = byModule.get(de.moduleName) ?? [];
    existing.push(de);
    byModule.set(de.moduleName, existing);
  }

  let fixCount = 0;

  if (dryRun) {
    console.log();
    log.header(`Dead Export Removal (${byModule.size} module${byModule.size > 1 ? 's' : ''})`);
  }

  for (const [moduleName, exports] of byModule) {
    const barrelPath = path.join(srcRootAbsolute, moduleName, 'index.ts');
    const content = await safeReadFile(barrelPath);
    if (!content) continue;

    const deadNames = new Set(exports.map(e => e.exportName));
    const lines = content.split('\n');
    const newLines: string[] = [];
    let removedCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Handle: export { a, b, c } from '...'
      const braceMatch = trimmed.match(/^export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
      if (braceMatch) {
        const symbols = braceMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        const kept = symbols.filter(s => {
          const name = s.includes(' as ') ? s.split(/\s+as\s+/)[1].trim() : s.split(/\s/)[0];
          return !deadNames.has(name);
        });

        if (kept.length === 0) {
          // Entire line is dead — remove it
          removedCount += symbols.length;
          continue;
        } else if (kept.length < symbols.length) {
          // Partial removal — rewrite the line
          removedCount += symbols.length - kept.length;
          const typePrefix = trimmed.startsWith('export type') ? 'type ' : '';
          newLines.push(`export ${typePrefix}{ ${kept.join(', ')} } from '${braceMatch[2]}';`);
          continue;
        }
      }

      // Handle: export const/function/type/interface NAME
      const declMatch = trimmed.match(
        /^export\s+(?:default\s+)?(?:const|let|var|function|class|type|interface|enum|async\s+function)\s+(\w+)/,
      );
      if (declMatch && deadNames.has(declMatch[1])) {
        removedCount++;
        continue;
      }

      newLines.push(line);
    }

    if (removedCount === 0) continue;

    const names = exports.map(e => e.exportName).slice(0, 6);
    const more = exports.length > 6 ? ` and ${exports.length - 6} more` : '';

    if (dryRun) {
      console.log(`  ${chalk.yellow('~')} ${chalk.bold(moduleName)}/index.ts — would remove: ${chalk.red(names.join(', '))}${more}`);
    } else {
      await safeWriteFile(barrelPath, newLines.join('\n'));
      log.success(`Removed ${removedCount} dead export${removedCount > 1 ? 's' : ''} from ${moduleName}/index.ts`);
    }
    fixCount++;
  }

  return fixCount;
}

// ─── Fix: Missing Barrel Files ────────────────────────────

async function fixMissingBarrels(
  projectRoot: string,
  structure: StructureAnalysis,
  dryRun: boolean,
): Promise<number> {
  if (!structure.srcRoot) return 0;

  let fixCount = 0;
  const printed = { header: false };

  for (const layer of structure.detectedLayers) {
    if (layer.hasBarrel) continue;

    const layerDir = path.join(projectRoot, layer.path);
    const indexPath = path.join(layerDir, 'index.ts');

    // Don't create barrels for leaf directories (screens, navigation)
    if (layer.suggestedLevel >= 8) continue;

    // Collect exportable files
    const exports = await collectExportableFiles(layerDir);
    if (exports.length === 0) continue;

    const content = exports
      .sort()
      .map((f) => `export * from './${f.replace(/\.(ts|tsx)$/, '.js')}';`)
      .join('\n') + '\n';

    if (dryRun) {
      if (!printed.header) {
        console.log();
        log.header('Missing Barrels');
        printed.header = true;
      }
      console.log(`  ${chalk.cyan('+')} Would create ${chalk.bold(path.relative(projectRoot, indexPath))}`);
    } else {
      await safeWriteFile(indexPath, content);
      log.success(`Created barrel: ${path.relative(projectRoot, indexPath)}`);
    }
    fixCount++;
  }

  return fixCount;
}

async function collectExportableFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .filter((e) => /\.(ts|tsx)$/.test(e.name))
      .filter((e) => !e.name.startsWith('index.'))
      .filter((e) => !e.name.endsWith('.test.ts') && !e.name.endsWith('.spec.ts'))
      .filter((e) => !e.name.endsWith('.d.ts'))
      .map((e) => e.name.replace(/\.(ts|tsx)$/, ''));
  } catch {
    return [];
  }
}

// ─── Fix: Sort Barrel Exports ─────────────────────────────

async function fixBarrelSorting(
  projectRoot: string,
  structure: StructureAnalysis,
  dryRun: boolean,
): Promise<number> {
  if (!structure.srcRoot) return 0;

  let fixCount = 0;
  const printed = { header: false };

  for (const layer of structure.detectedLayers) {
    if (!layer.hasBarrel) continue;

    const srcRootAbsolute = path.resolve(projectRoot, structure.srcRoot!);
    const barrelPath = path.join(srcRootAbsolute, layer.name, 'index.ts');
    const content = await safeReadFile(barrelPath);
    if (!content) continue;

    const lines = content.split('\n');

    // Collect export lines vs non-export lines (comments, blank lines, etc.)
    const exportLines: string[] = [];
    const nonExportLines: { index: number; line: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('export ') && (trimmed.includes('from ') || trimmed.includes('from\t'))) {
        exportLines.push(lines[i]);
      } else {
        nonExportLines.push({ index: i, line: lines[i] });
      }
    }

    if (exportLines.length < 2) continue;

    const sorted = [...exportLines].sort((a, b) => {
      // Sort by the 'from' specifier
      const aFrom = a.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? a;
      const bFrom = b.match(/from\s+['"]([^'"]+)['"]/)?.[1] ?? b;
      return aFrom.localeCompare(bFrom);
    });

    // Check if already sorted
    const alreadySorted = exportLines.every((line, i) => line === sorted[i]);
    if (alreadySorted) continue;

    if (dryRun) {
      if (!printed.header) {
        console.log();
        log.header('Barrel Export Sorting');
        printed.header = true;
      }
      console.log(`  ${chalk.yellow('~')} ${chalk.bold(layer.name)}/index.ts — ${exportLines.length} exports would be sorted`);
    } else {
      // Rebuild the file: non-export lines stay in place, exports are sorted
      // Simple approach: put sorted exports first, then any trailing content
      const result: string[] = [];

      // Preserve any leading non-export content (comments, pragmas)
      for (const ne of nonExportLines) {
        if (ne.index < lines.indexOf(exportLines[0])) {
          result.push(ne.line);
        }
      }

      result.push(...sorted);

      // Preserve any trailing non-export content
      const lastExportIdx = lines.lastIndexOf(exportLines[exportLines.length - 1]);
      for (const ne of nonExportLines) {
        if (ne.index > lastExportIdx) {
          result.push(ne.line);
        }
      }

      await safeWriteFile(barrelPath, result.join('\n'));
      log.success(`Sorted ${exportLines.length} exports in ${layer.name}/index.ts`);
    }
    fixCount++;
  }

  return fixCount;
}

// ─── Fix: SRP Violations (split markers) ──────────────────

async function fixSRPViolations(
  projectRoot: string,
  analysis: FullAnalysis,
  dryRun: boolean,
): Promise<number> {
  const srpErrors = analysis.solid.violations
    .filter((v) => v.principle === 'SRP' && v.severity === 'error')
    .slice(0, 10);

  if (srpErrors.length === 0) return 0;

  let fixCount = 0;
  const printed = { header: false };

  for (const violation of srpErrors) {
    const filePath = path.join(projectRoot, violation.file);
    const splits = await findSplitPoints(filePath);

    if (splits.length === 0) continue;

    if (dryRun) {
      if (!printed.header) {
        console.log();
        log.header('SRP Split Points');
        printed.header = true;
      }
      console.log(`  ${chalk.yellow('~')} ${chalk.bold(violation.file)} — ${splits.length} suggested split point${splits.length > 1 ? 's' : ''}:`);
      for (const split of splits) {
        console.log(chalk.dim(`    Line ${split.line}: // --- split: ${split.suggestedName} ---`));
      }
    } else {
      const content = await safeReadFile(filePath);
      if (!content) continue;

      const lines = content.split('\n');
      let offset = 0;
      for (const split of splits) {
        const marker = `// --- goodbot: consider extracting to ${split.suggestedName} ---`;
        const insertAt = split.line - 1 + offset;
        if (insertAt < lines.length && !lines[insertAt].includes('goodbot:')) {
          lines.splice(insertAt, 0, marker);
          offset++;
        }
      }

      await safeWriteFile(filePath, lines.join('\n'));
      log.success(`Added ${splits.length} split markers to ${violation.file}`);
    }
    fixCount++;
  }

  return fixCount;
}

interface SplitPoint {
  line: number;
  suggestedName: string;
}

async function findSplitPoints(filePath: string): Promise<SplitPoint[]> {
  const splits: SplitPoint[] = [];
  let lineNumber = 0;
  let lastExportLine = 0;
  let exportCount = 0;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNumber++;
    const trimmed = line.trim();

    const exportMatch = trimmed.match(
      /^export\s+(?:default\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/,
    );

    if (exportMatch) {
      exportCount++;
      if (lastExportLine > 0 && lineNumber - lastExportLine > 80) {
        const name = exportMatch[1];
        const suggestedFile = `${camelToKebab(name)}.ts`;
        splits.push({ line: lineNumber, suggestedName: suggestedFile });
      }
      lastExportLine = lineNumber;
    }
  }

  return exportCount >= 2 ? splits.slice(0, 3) : [];
}

function camelToKebab(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// ─── Fix: Missing .cursorignore ───────────────────────────

async function fixMissingCursorignore(
  projectRoot: string,
  scan: Awaited<ReturnType<typeof runFullScan>>,
  dryRun: boolean,
): Promise<number> {
  const ignorePath = path.join(projectRoot, '.cursorignore');
  if (await fileExists(ignorePath)) return 0;

  const content = [
    '# Generated by goodbot',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.env',
    '.env.*',
    '*.lock',
    '.DS_Store',
    '',
  ].join('\n');

  if (dryRun) {
    console.log();
    console.log(`  ${chalk.cyan('+')} Would create ${chalk.bold('.cursorignore')}`);
  } else {
    await safeWriteFile(ignorePath, content);
    log.success('Created .cursorignore');
  }

  return 1;
}
