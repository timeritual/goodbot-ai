import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runDependencyAnalysis, summarizeAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log } from '../utils/index.js';
import type { DependencyAnalysis } from '../analyzers/types.js';

export const analyzeCommand = new Command('analyze')
  .description('Run deep dependency analysis on your project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const projectRoot = opts.path;
    const spinner = ora('Scanning project...').start();

    try {
      const scan = await runFullScan(projectRoot);
      spinner.text = 'Analyzing dependencies...';

      // Try to load config for layer definitions, but don't require it
      let config;
      try {
        config = await loadConfig(projectRoot);
      } catch {
        // No config — use scan results only
      }

      const analysis = await runDependencyAnalysis(
        projectRoot,
        scan.structure,
        config,
      );

      spinner.succeed(`Analysis complete (${analysis.timeTakenMs}ms)`);

      if (opts.json) {
        // Serialize Sets as arrays for JSON output
        const serializable = {
          ...analysis,
          modules: analysis.modules.map((m) => ({
            ...m,
            dependsOn: Array.from(m.dependsOn),
            dependedOnBy: Array.from(m.dependedOnBy),
          })),
        };
        console.log(JSON.stringify(serializable, null, 2));
        return;
      }

      renderAnalysis(analysis, projectRoot);
    } catch (err) {
      spinner.fail('Analysis failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

export function renderAnalysis(analysis: DependencyAnalysis, projectRoot: string): void {
  const summary = summarizeAnalysis(analysis);

  // Summary
  log.header('Dependency Analysis');
  console.log(chalk.dim('─'.repeat(50)));

  log.table('Modules', String(summary.moduleCount));
  log.table('Cross-module edges', String(summary.edgeCount));
  log.table('Files parsed', String(analysis.filesParsed));
  log.table('Time', `${analysis.timeTakenMs}ms`);

  // Stability table
  if (analysis.stability.length > 0) {
    log.header('Module Stability');
    console.log(chalk.dim('─'.repeat(50)));
    console.log(
      `  ${chalk.dim('Module'.padEnd(20))} ${chalk.dim('Ca'.padStart(4))} ${chalk.dim('Ce'.padStart(4))}  ${chalk.dim('Instability')}`,
    );

    for (const m of analysis.stability) {
      const barFilled = Math.round((1 - m.instability) * 10);
      const barEmpty = 10 - barFilled;
      const bar = chalk.green('█'.repeat(barFilled)) + chalk.dim('░'.repeat(barEmpty));
      const instColor = m.instability <= 0.3 ? chalk.green : m.instability <= 0.6 ? chalk.yellow : chalk.red;

      console.log(
        `  ${m.moduleName.padEnd(20)} ${String(m.afferentCoupling).padStart(4)} ${String(m.efferentCoupling).padStart(4)}  ${instColor(m.instability.toFixed(2))} ${bar}`,
      );
    }
  }

  // Circular dependencies
  if (analysis.circularDependencies.length > 0) {
    log.header(`Circular Dependencies (${analysis.circularDependencies.length})`);
    console.log(chalk.dim('─'.repeat(50)));

    for (const cd of analysis.circularDependencies) {
      console.log(`  ${chalk.yellow('⚠')} ${cd.cycle.join(' → ')}`);
      for (const f of cd.files.slice(0, 4)) {
        console.log(chalk.dim(`    ${f.sourceFile}:${f.line} → ${f.specifier}`));
      }
    }
  }

  // Layer violations
  if (analysis.layerViolations.length > 0) {
    log.header(`Layer Violations (${analysis.layerViolations.length})`);
    console.log(chalk.dim('─'.repeat(50)));

    for (const lv of analysis.layerViolations) {
      console.log(
        `  ${chalk.red('✗')} ${lv.fromModule} (L${lv.fromLevel}) → ${lv.toModule} (L${lv.toLevel})`,
      );
      console.log(chalk.dim(`    ${lv.file}:${lv.line} → ${lv.specifier}`));
    }
  }

  // Barrel violations
  if (analysis.barrelViolations.length > 0) {
    log.header(`Barrel Import Violations (${analysis.barrelViolations.length})`);
    console.log(chalk.dim('─'.repeat(50)));

    for (const bv of analysis.barrelViolations.slice(0, 20)) {
      console.log(`  ${chalk.red('✗')} ${bv.file}:${bv.line}`);
      console.log(chalk.dim(`    import from '${bv.specifier}'`));
      console.log(chalk.green(`    → ${bv.suggestion}`));
    }
    if (analysis.barrelViolations.length > 20) {
      log.dim(`  ... and ${analysis.barrelViolations.length - 20} more`);
    }
  }

  // Stability violations
  if (analysis.stabilityViolations.length > 0) {
    log.header(`Stability Violations (${analysis.stabilityViolations.length})`);
    console.log(chalk.dim('─'.repeat(50)));

    for (const sv of analysis.stabilityViolations) {
      console.log(
        `  ${chalk.yellow('⚠')} ${sv.from} ${chalk.dim(`(I=${sv.fromInstability})`)} depends on ${sv.to} ${chalk.dim(`(I=${sv.toInstability})`)}`,
      );
      console.log(chalk.dim(`    Stable module depends on less stable module`));
    }
  }

  // Final summary
  const totalIssues =
    analysis.circularDependencies.length +
    analysis.layerViolations.length +
    analysis.barrelViolations.length +
    analysis.stabilityViolations.length;

  console.log();
  if (totalIssues === 0) {
    log.success('No architectural violations found.');
  } else {
    log.warn(`${totalIssues} total issue${totalIssues > 1 ? 's' : ''} found.`);
  }
}

export function renderAnalysisSummary(analysis: DependencyAnalysis): void {
  const summary = summarizeAnalysis(analysis);
  const totalIssues =
    summary.circularDependencyCount +
    summary.layerViolationCount +
    summary.barrelViolationCount +
    summary.stabilityViolationCount;

  log.header('Dependency Analysis (summary)');
  console.log(chalk.dim('─'.repeat(50)));
  log.table('Modules', String(summary.moduleCount));
  log.table('Edges', String(summary.edgeCount));
  log.table('Circular deps', summary.circularDependencyCount === 0
    ? chalk.green('0')
    : chalk.red(String(summary.circularDependencyCount)));
  log.table('Layer violations', summary.layerViolationCount === 0
    ? chalk.green('0')
    : chalk.red(String(summary.layerViolationCount)));
  log.table('Barrel violations', summary.barrelViolationCount === 0
    ? chalk.green('0')
    : chalk.red(String(summary.barrelViolationCount)));
  log.table('SDP violations', summary.stabilityViolationCount === 0
    ? chalk.green('0')
    : chalk.yellow(String(summary.stabilityViolationCount)));

  if (totalIssues > 0) {
    console.log();
    log.dim('Run `goodbot analyze` for full details.');
  }
}
