import { Command } from 'commander';
import { watch } from 'chokidar';
import path from 'node:path';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log } from '../utils/index.js';
import type { FullAnalysis } from '../analyzers/types.js';

export const watchCommand = new Command('watch')
  .description('Continuously monitor your project for architectural violations')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (opts) => {
    const projectRoot = opts.path;

    // Initial scan to find src root
    const scan = await runFullScan(projectRoot);
    if (!scan.structure.srcRoot) {
      log.error('No src directory found. Nothing to watch.');
      process.exit(1);
    }

    let config: Awaited<ReturnType<typeof loadConfig>> | undefined;
    try { config = await loadConfig(projectRoot); } catch { /* no config */ }

    const srcPath = path.join(projectRoot, scan.structure.srcRoot);
    let lastAnalysis: FullAnalysis | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Run initial analysis
    await runAndRender(projectRoot, scan, config);

    // Watch for changes
    const watcher = watch(srcPath, {
      ignored: [
        '**/node_modules/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/__tests__/**',
        '**/.git/**',
      ],
      persistent: true,
      ignoreInitial: true,
    });

    const onFileChange = (filePath: string) => {
      if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const relative = path.relative(projectRoot, filePath);
        console.log(chalk.dim(`\n  File changed: ${relative}`));
        await runAndRender(projectRoot, scan, config);
      }, 500);
    };

    watcher.on('change', onFileChange);
    watcher.on('add', onFileChange);
    watcher.on('unlink', onFileChange);

    console.log(chalk.dim(`\n  Watching ${srcPath} for changes... (Ctrl+C to stop)\n`));

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      watcher.close();
      console.log('\n');
      log.info('Watch stopped.');
      process.exit(0);
    });

    async function runAndRender(
      root: string,
      scanResult: Awaited<ReturnType<typeof runFullScan>>,
      cfg: typeof config,
    ) {
      try {
        const result = await runFullAnalysis(root, scanResult.structure, cfg);
        const prev = lastAnalysis;
        lastAnalysis = result;

        // Clear screen
        process.stdout.write('\x1B[2J\x1B[0f');

        const now = new Date().toLocaleTimeString();
        const grade = result.health.grade;
        const gradeColor = grade.startsWith('A') ? chalk.green
          : grade.startsWith('B') ? chalk.cyan
          : grade.startsWith('C') ? chalk.yellow
          : chalk.red;

        console.log(`  ${chalk.bold('goodbot')} watching... ${chalk.dim(`(${now}, ${result.dependency.filesParsed} files, ${result.dependency.timeTakenMs}ms)`)}`);
        console.log();
        console.log(`  ${chalk.bold('Health:')} ${gradeColor.bold(` ${grade} `)} ${chalk.dim(`(${result.health.score}/100)`)}`);
        console.log(chalk.dim('  ' + '─'.repeat(48)));

        const dep = result.dependency;

        const delta = (current: number, previous: number | undefined) => {
          if (previous === undefined) return '';
          if (current > previous) return chalk.red(` (+${current - previous})`);
          if (current < previous) return chalk.green(` (-${previous - current})`);
          return chalk.dim(' (unchanged)');
        };

        const prevDep = prev?.dependency;
        const prevSolid = prev?.solid;

        log.table('Circular deps', colorCount(dep.circularDependencies.length) + delta(dep.circularDependencies.length, prevDep?.circularDependencies.length));
        log.table('Layer violations', colorCount(dep.layerViolations.length) + delta(dep.layerViolations.length, prevDep?.layerViolations.length));
        log.table('Barrel violations', colorCount(dep.barrelViolations.length) + delta(dep.barrelViolations.length, prevDep?.barrelViolations.length));
        log.table('SDP violations', colorCount(dep.stabilityViolations.length) + delta(dep.stabilityViolations.length, prevDep?.stabilityViolations.length));

        const solidErrors = result.solid.violations.filter((v) => v.severity === 'error').length;
        const solidWarnings = result.solid.violations.filter((v) => v.severity === 'warning').length;
        const prevSolidTotal = prevSolid ? prevSolid.violations.length : undefined;
        log.table('SOLID', `${solidErrors} errors, ${solidWarnings} warnings` + delta(result.solid.violations.length, prevSolidTotal));

        // Show new violations (if there's a previous analysis to compare)
        if (prev) {
          const newSolid = result.solid.violations.filter((v) => {
            return !prev.solid.violations.some((p) => p.file === v.file && p.principle === v.principle && p.message === v.message);
          });

          if (newSolid.length > 0) {
            console.log();
            console.log(chalk.yellow('  New violations:'));
            for (const v of newSolid.slice(0, 5)) {
              console.log(`    ${chalk.yellow('⚠')} ${chalk.dim(`[${v.principle}]`)} ${v.file}`);
              console.log(chalk.dim(`      ${v.message}`));
            }
          }

          const resolved = prev.solid.violations.filter((v) => {
            return !result.solid.violations.some((c) => c.file === v.file && c.principle === v.principle && c.message === v.message);
          });

          if (resolved.length > 0) {
            console.log();
            console.log(chalk.green('  Resolved:'));
            for (const v of resolved.slice(0, 5)) {
              console.log(`    ${chalk.green('✓')} ${chalk.dim(`[${v.principle}]`)} ${v.file}`);
            }
          }
        }
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
      }
    }
  });

function colorCount(n: number): string {
  return n === 0 ? chalk.green(String(n)) : chalk.red(String(n));
}
