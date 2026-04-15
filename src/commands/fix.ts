import { Command } from 'commander';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log, safeWriteFile, safeReadFile, fileExists } from '../utils/index.js';
import type { FullAnalysis } from '../analyzers/index.js';

export const fixCommand = new Command('fix')
  .description('Auto-fix architectural violations where possible')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--dry-run', 'Preview fixes without applying', false)
  .action(async (opts) => {
    const projectRoot = opts.path;
    const spinner = ora('Analyzing project...').start();

    try {
      const scan = await runFullScan(projectRoot);
      let config;
      try { config = await loadConfig(projectRoot); } catch { /* no config */ }

      const analysis = await runFullAnalysis(projectRoot, scan.structure, config);
      spinner.succeed('Analysis complete');

      let fixCount = 0;

      // Fix 1: Generate missing barrel files
      fixCount += await fixMissingBarrels(projectRoot, scan.structure, opts.dryRun);

      // Fix 2: Add split markers to oversized files
      fixCount += await fixSRPViolations(projectRoot, analysis, opts.dryRun);

      // Fix 3: Generate .cursorignore if missing
      fixCount += await fixMissingCursorignore(projectRoot, scan, opts.dryRun);

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

// ─── Fix: Missing Barrel Files ────────────────────────────

async function fixMissingBarrels(
  projectRoot: string,
  structure: Awaited<ReturnType<typeof runFullScan>>['structure'],
  dryRun: boolean,
): Promise<number> {
  if (!structure.srcRoot) return 0;

  let fixCount = 0;

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
      .map((f) => `export * from './${f.replace(/\.(ts|tsx)$/, '.js')}';`)
      .join('\n') + '\n';

    if (dryRun) {
      console.log(`  ${chalk.cyan('+')} Would create ${chalk.bold(path.relative(projectRoot, indexPath))}`);
      for (const f of exports) {
        console.log(chalk.dim(`    export * from './${f.replace(/\.(ts|tsx)$/, '.js')}';`));
      }
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

// ─── Fix: SRP Violations (split markers) ──────────────────

async function fixSRPViolations(
  projectRoot: string,
  analysis: FullAnalysis,
  dryRun: boolean,
): Promise<number> {
  const srpErrors = analysis.solid.violations
    .filter((v) => v.principle === 'SRP' && v.severity === 'error')
    .slice(0, 10); // Limit to top 10

  if (srpErrors.length === 0) return 0;

  let fixCount = 0;

  for (const violation of srpErrors) {
    const filePath = path.join(projectRoot, violation.file);
    const splits = await findSplitPoints(filePath);

    if (splits.length === 0) continue;

    if (dryRun) {
      console.log(`  ${chalk.yellow('~')} ${chalk.bold(violation.file)} — ${splits.length} suggested split point${splits.length > 1 ? 's' : ''}:`);
      for (const split of splits) {
        console.log(chalk.dim(`    Line ${split.line}: // --- split: ${split.suggestedName} ---`));
      }
    } else {
      // Insert split markers into the file
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

    // Track exported functions/components as natural split boundaries
    const exportMatch = trimmed.match(
      /^export\s+(?:default\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/,
    );

    if (exportMatch) {
      exportCount++;
      if (lastExportLine > 0 && lineNumber - lastExportLine > 80) {
        // Significant gap since last export — good split point
        const name = exportMatch[1];
        const suggestedFile = `${camelToKebab(name)}.ts`;
        splits.push({ line: lineNumber, suggestedName: suggestedFile });
      }
      lastExportLine = lineNumber;
    }
  }

  // Only suggest splits if file has multiple exports with significant gaps
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
    console.log(`  ${chalk.cyan('+')} Would create ${chalk.bold('.cursorignore')}`);
  } else {
    await safeWriteFile(ignorePath, content);
    log.success('Created .cursorignore');
  }

  return 1;
}
