import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import path from 'node:path';
import { runFullAnalysis, runDependencyAnalysis, summarizeAnalysis } from '../analyzers/index.js';
import { generateArchitectureMd } from '../generators/mermaid.js';
import { loadConfig } from '../config/index.js';
import { log, safeWriteFile } from '../utils/index.js';
import type { DependencyAnalysis, FullAnalysis, HealthScore, SolidAnalysis } from '../analyzers/types.js';

export const analyzeCommand = new Command('analyze')
  .description('Run deep dependency and SOLID analysis on your project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--json', 'Output as JSON', false)
  .option('--diagram', 'Generate architecture.md with mermaid dependency diagram', false)
  .action(async (opts) => {
    const projectRoot = opts.path;
    const spinner = ora('Scanning project...').start();

    try {
      const scan = await runFullScan(projectRoot);
      spinner.text = 'Analyzing architecture...';

      let config;
      try {
        config = await loadConfig(projectRoot);
      } catch {
        // No config — use scan results only
      }

      const result = await runFullAnalysis(projectRoot, scan.structure, config);

      spinner.succeed(`Analysis complete (${result.dependency.timeTakenMs}ms)`);

      if (opts.json) {
        const serializable = {
          health: result.health,
          solid: result.solid,
          dependency: {
            ...result.dependency,
            modules: result.dependency.modules.map((m) => ({
              ...m,
              dependsOn: Array.from(m.dependsOn),
              dependedOnBy: Array.from(m.dependedOnBy),
            })),
          },
        };
        console.log(JSON.stringify(serializable, null, 2));
        return;
      }

      renderHealthGrade(result.health);
      renderDependencyAnalysis(result.dependency);
      renderSolidAnalysis(result.solid);
      renderFinalSummary(result);

      if (opts.diagram) {
        const diagramPath = path.join(projectRoot, 'architecture.md');
        const content = generateArchitectureMd(result.dependency);
        await safeWriteFile(diagramPath, content);
        console.log();
        log.success(`Dependency diagram saved to architecture.md`);
      }
    } catch (err) {
      spinner.fail('Analysis failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ─── Health Grade ─────────────────────────────────────────

function gradeColor(grade: string): chalk.ChalkInstance {
  if (grade.startsWith('A')) return chalk.green;
  if (grade.startsWith('B')) return chalk.cyan;
  if (grade.startsWith('C')) return chalk.yellow;
  return chalk.red;
}

export function renderHealthGrade(health: HealthScore): void {
  const color = gradeColor(health.grade);
  const bar = (score: number) => {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    const barColor = score >= 70 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
    return barColor('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  };

  console.log();
  console.log(`  ${chalk.bold('Health Grade:')} ${color.bold(` ${health.grade} `)} ${chalk.dim(`(${health.score}/100)`)}`);
  console.log();
  console.log(`  ${chalk.dim('Dependencies'.padEnd(16))} ${bar(health.breakdown.dependencies)} ${chalk.dim(String(health.breakdown.dependencies))}`);
  console.log(`  ${chalk.dim('Stability'.padEnd(16))} ${bar(health.breakdown.stability)} ${chalk.dim(String(health.breakdown.stability))}`);
  console.log(`  ${chalk.dim('SOLID'.padEnd(16))} ${bar(health.breakdown.solid)} ${chalk.dim(String(health.breakdown.solid))}`);
  console.log(`  ${chalk.dim('Architecture'.padEnd(16))} ${bar(health.breakdown.architecture)} ${chalk.dim(String(health.breakdown.architecture))}`);
}

// ─── Dependency Analysis ──────────────────────────────────

export function renderDependencyAnalysis(analysis: DependencyAnalysis): void {
  const summary = summarizeAnalysis(analysis);

  log.header('Dependency Analysis');
  console.log(chalk.dim('─'.repeat(50)));

  log.table('Modules', String(summary.moduleCount));
  log.table('Cross-module edges', String(summary.edgeCount));
  log.table('Files parsed', String(analysis.filesParsed));

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
      console.log(`  ${chalk.red('✗')} ${lv.fromModule} (L${lv.fromLevel}) → ${lv.toModule} (L${lv.toLevel})`);
      console.log(chalk.dim(`    ${lv.file}:${lv.line} → ${lv.specifier}`));
    }
  }

  // Barrel violations
  if (analysis.barrelViolations.length > 0) {
    log.header(`Barrel Import Violations (${analysis.barrelViolations.length})`);
    console.log(chalk.dim('─'.repeat(50)));
    for (const bv of analysis.barrelViolations.slice(0, 10)) {
      console.log(`  ${chalk.red('✗')} ${bv.file}:${bv.line}`);
      console.log(chalk.dim(`    import from '${bv.specifier}'`));
      console.log(chalk.green(`    → ${bv.suggestion}`));
    }
    if (analysis.barrelViolations.length > 10) {
      log.dim(`  ... and ${analysis.barrelViolations.length - 10} more`);
    }
  }

  // Stability violations
  if (analysis.stabilityViolations.length > 0) {
    log.header(`Stability Violations (${analysis.stabilityViolations.length})`);
    console.log(chalk.dim('─'.repeat(50)));
    for (const sv of analysis.stabilityViolations) {
      console.log(`  ${chalk.yellow('⚠')} ${sv.from} ${chalk.dim(`(I=${sv.fromInstability})`)} depends on ${sv.to} ${chalk.dim(`(I=${sv.toInstability})`)}`);
    }
  }
}

// ─── SOLID Analysis ───────────────────────────────────────

export function renderSolidAnalysis(solid: SolidAnalysis): void {
  log.header('SOLID Analysis');
  console.log(chalk.dim('─'.repeat(50)));

  const bar = (score: number) => {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    const color = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
    return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  };

  console.log(`  ${chalk.dim('SRP (Single Responsibility)'.padEnd(32))} ${bar(solid.scores.srp)} ${chalk.dim(String(solid.scores.srp))}`);
  console.log(`  ${chalk.dim('DIP (Dependency Inversion)'.padEnd(32))} ${bar(solid.scores.dip)} ${chalk.dim(String(solid.scores.dip))}`);
  console.log(`  ${chalk.dim('ISP (Interface Segregation)'.padEnd(32))} ${bar(solid.scores.isp)} ${chalk.dim(String(solid.scores.isp))}`);

  if (solid.violations.length > 0) {
    console.log();
    const errors = solid.violations.filter((v) => v.severity === 'error');
    const warnings = solid.violations.filter((v) => v.severity === 'warning');

    if (errors.length > 0) {
      for (const v of errors.slice(0, 5)) {
        console.log(`  ${chalk.red('✗')} ${chalk.red(`[${v.principle}]`)} ${v.message}`);
        console.log(chalk.dim(`    ${v.file}`));
        console.log(chalk.green(`    → ${v.suggestion}`));
      }
    }

    if (warnings.length > 0) {
      for (const v of warnings.slice(0, 10)) {
        console.log(`  ${chalk.yellow('⚠')} ${chalk.yellow(`[${v.principle}]`)} ${v.message}`);
        console.log(chalk.dim(`    ${v.file}`));
      }
    }

    const remaining = solid.violations.length - Math.min(errors.length, 5) - Math.min(warnings.length, 10);
    if (remaining > 0) {
      log.dim(`  ... and ${remaining} more`);
    }
  }
}

// ─── Final Summary ────────────────────────────────────────

function renderFinalSummary(result: FullAnalysis): void {
  const dep = result.dependency;
  const totalIssues =
    dep.circularDependencies.length +
    dep.layerViolations.length +
    dep.barrelViolations.length +
    dep.stabilityViolations.length +
    result.solid.violations.filter((v) => v.severity === 'error').length;

  console.log();
  if (totalIssues === 0) {
    log.success('No architectural violations found.');
  } else {
    log.warn(`${totalIssues} issue${totalIssues > 1 ? 's' : ''} found.`);
  }
}

// ─── Summary for scan --analyze ───────────────────────────

export function renderFullAnalysisSummary(result: FullAnalysis): void {
  const color = gradeColor(result.health.grade);
  const dep = result.dependency;
  const summary = summarizeAnalysis(dep);

  log.header(`Architecture Health: ${color.bold(result.health.grade)} ${chalk.dim(`(${result.health.score}/100)`)}`);
  console.log(chalk.dim('─'.repeat(50)));
  log.table('Modules', String(summary.moduleCount));
  log.table('Edges', String(summary.edgeCount));
  log.table('Circular deps', summary.circularDependencyCount === 0
    ? chalk.green('0') : chalk.red(String(summary.circularDependencyCount)));
  log.table('Layer violations', summary.layerViolationCount === 0
    ? chalk.green('0') : chalk.red(String(summary.layerViolationCount)));
  log.table('SOLID score', result.solid.scores.overall >= 80
    ? chalk.green(String(result.solid.scores.overall))
    : result.solid.scores.overall >= 60
      ? chalk.yellow(String(result.solid.scores.overall))
      : chalk.red(String(result.solid.scores.overall)));

  const totalIssues = summary.circularDependencyCount + summary.layerViolationCount +
    summary.barrelViolationCount + summary.stabilityViolationCount +
    result.solid.violations.filter((v) => v.severity === 'error').length;

  if (totalIssues > 0) {
    console.log();
    log.dim('Run `goodbot analyze` for full details.');
  }
}
