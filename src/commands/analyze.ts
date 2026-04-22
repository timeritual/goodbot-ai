import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import path from 'node:path';
import { runFullAnalysis, summarizeAnalysis } from '../analyzers/index.js';
import { generateArchitectureMd } from '../generators/index.js';
import { loadConfig } from '../config/index.js';
import { log, safeWriteFile } from '../utils/index.js';
import type { DependencyAnalysis, FullAnalysis, HealthScore, SolidAnalysis, GitHistoryAnalysis, TemporalCoupling } from '../analyzers/index.js';
import { analyzeGitHistory, findTemporalCoupling } from '../analyzers/index.js';
import type { GoodbotConfig } from '../config/index.js';

export const analyzeCommand = new Command('analyze')
  .description('Run deep dependency and SOLID analysis on your project')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--json', 'Output as JSON', false)
  .option('--diagram', 'Generate architecture.md with mermaid dependency diagram', false)
  .option('--git', 'Include git history analysis (hotspots, AI commits, temporal coupling)', false)
  .option('--no-ignore', 'Bypass analysis.ignore rules in config (audit mode)')
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

      // Commander sets opts.ignore=false when --no-ignore is passed; treat anything else as "use ignores".
      const noIgnore = opts.ignore === false;
      const result = await runFullAnalysis(projectRoot, scan.structure, config, { noIgnore });

      let gitHistory: GitHistoryAnalysis | undefined;
      let temporalCouplings: TemporalCoupling[] | undefined;

      if (opts.git) {
        spinner.text = 'Analyzing git history...';
        gitHistory = await analyzeGitHistory(projectRoot, 500, scan.structure.srcRoot ?? undefined);
        temporalCouplings = findTemporalCoupling(gitHistory.commits, 3, 0.5, scan.structure.srcRoot ?? undefined);
      }

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
          ...(gitHistory ? { gitHistory: { ...gitHistory, commits: undefined } } : {}),
          ...(temporalCouplings ? { temporalCouplings } : {}),
        };
        console.log(JSON.stringify(serializable, null, 2));
        return;
      }

      renderHealthGrade(result.health);
      renderDependencyAnalysis(result.dependency);
      renderSolidAnalysis(result.solid);

      if (gitHistory) {
        renderGitHistory(gitHistory);
      }
      if (temporalCouplings && temporalCouplings.length > 0) {
        renderTemporalCoupling(temporalCouplings);
      }

      renderFinalSummary(result, config);

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

function colorGrade(grade: string): string {
  const g = chalk.bold(` ${grade} `);
  if (grade.startsWith('A')) return chalk.green(g);
  if (grade.startsWith('B')) return chalk.cyan(g);
  if (grade.startsWith('C')) return chalk.yellow(g);
  return chalk.red(g);
}

export function renderHealthGrade(health: HealthScore): void {
  const bar = (score: number) => {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    const barColor = score >= 70 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
    return barColor('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  };

  console.log();
  console.log(`  ${chalk.bold('Health Grade:')} ${colorGrade(health.grade)} ${chalk.dim(`(${health.score}/100)`)}`);
  console.log();
  console.log(`  ${chalk.dim('Dependencies'.padEnd(16))} ${bar(health.breakdown.dependencies)} ${chalk.dim(String(health.breakdown.dependencies))}`);
  console.log(`  ${chalk.dim('Stability'.padEnd(16))} ${bar(health.breakdown.stability)} ${chalk.dim(String(health.breakdown.stability))}`);
  console.log(`  ${chalk.dim('SOLID'.padEnd(16))} ${bar(health.breakdown.solid)} ${chalk.dim(String(health.breakdown.solid))}`);
  console.log(`  ${chalk.dim('Architecture'.padEnd(16))} ${bar(health.breakdown.architecture)} ${chalk.dim(String(health.breakdown.architecture))}`);

  if (health.contributors.length > 0) {
    console.log();
    console.log(`  ${chalk.dim('Biggest issues:')}`);
    for (const c of health.contributors.slice(0, 5)) {
      const countStr = String(c.count).padStart(4);
      console.log(`    ${chalk.red(countStr)}  ${c.label}`);
    }
  }
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
    log.dim('  Upward dependencies — violates the Stable Dependency Principle.');
    console.log();
    for (const lv of analysis.layerViolations) {
      const fromLabel = lv.fromRole
        ? `${chalk.cyan(`[${lv.fromRole}]`)} ${lv.fromModule} (L${lv.fromLevel})`
        : `${lv.fromModule} (L${lv.fromLevel})`;
      const toLabel = lv.toRole
        ? `${chalk.cyan(`[${lv.toRole}]`)} ${lv.toModule} (L${lv.toLevel})`
        : `${lv.toModule} (L${lv.toLevel})`;
      console.log(`  ${chalk.red('✗')} ${fromLabel} imports from ${toLabel}`);
      console.log(chalk.dim(`    ${lv.file}:${lv.line} → ${lv.specifier}`));
      if (lv.fromRole && lv.toRole) {
        console.log(chalk.dim(`    ${lv.fromRole} must not depend on ${lv.toRole} — dependency direction is wrong.`));
      }
    }
  }

  // Barrel violations
  if (analysis.barrelViolations.length > 0) {
    log.header(`Barrel Import Violations (${analysis.barrelViolations.length})`);
    console.log(chalk.dim('─'.repeat(50)));
    for (const bv of analysis.barrelViolations.slice(0, 10)) {
      const sourceLabel = bv.sourceRole
        ? `${chalk.cyan(`[${bv.sourceRole}]`)} ${bv.file}`
        : bv.file;
      const targetLabel = bv.targetRole
        ? ` (from ${chalk.cyan(`[${bv.targetRole}]`)} ${bv.targetModule})`
        : '';
      console.log(`  ${chalk.red('✗')} ${sourceLabel}:${bv.line}${targetLabel}`);
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
  // Separate custom rule violations from SOLID violations
  const solidViolations = solid.violations.filter((v) => v.principle !== 'CUSTOM');
  const customViolations = solid.violations.filter((v) => v.principle === 'CUSTOM');

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

  if (solidViolations.length > 0) {
    console.log();
    const errors = solidViolations.filter((v) => v.severity === 'error');
    const warnings = solidViolations.filter((v) => v.severity === 'warning');

    if (errors.length > 0) {
      for (const v of errors.slice(0, 8)) {
        console.log(`  ${chalk.red('✗')} ${chalk.red(`[${v.principle}]`)} ${v.message}`);
        console.log(chalk.dim(`    ${v.file}`));
        console.log(chalk.green(`    → ${v.suggestion}`));
      }
    }

    if (warnings.length > 0) {
      for (const v of warnings.slice(0, 15)) {
        console.log(`  ${chalk.yellow('⚠')} ${chalk.yellow(`[${v.principle}]`)} ${v.message}`);
        console.log(chalk.dim(`    ${v.file}`));
      }
    }

    const remaining = solidViolations.length - Math.min(errors.length, 8) - Math.min(warnings.length, 15);
    if (remaining > 0) {
      log.dim(`  ... and ${remaining} more`);
    }
  }

  // Custom Rules — separate section
  if (customViolations.length > 0) {
    log.header(`Custom Rules (${customViolations.length})`);
    console.log(chalk.dim('─'.repeat(50)));

    const customErrors = customViolations.filter((v) => v.severity === 'error');
    const customWarnings = customViolations.filter((v) => v.severity === 'warning');
    const customInfos = customViolations.filter((v) => v.severity === 'info');

    for (const v of customErrors.slice(0, 8)) {
      console.log(`  ${chalk.red('✗')} ${v.message}`);
      console.log(chalk.dim(`    ${v.file}`));
      console.log(chalk.green(`    → ${v.suggestion}`));
    }

    for (const v of customWarnings.slice(0, 10)) {
      console.log(`  ${chalk.yellow('⚠')} ${v.message}`);
      console.log(chalk.dim(`    ${v.file}`));
    }

    for (const v of customInfos.slice(0, 5)) {
      console.log(`  ${chalk.dim('ℹ')} ${v.message}`);
      console.log(chalk.dim(`    ${v.file}`));
    }

    const shown = Math.min(customErrors.length, 8) + Math.min(customWarnings.length, 10) + Math.min(customInfos.length, 5);
    if (customViolations.length > shown) {
      log.dim(`  ... and ${customViolations.length - shown} more`);
    }
  }
}

// ─── Git History ─────────────────────────────────────────

function renderGitHistory(history: GitHistoryAnalysis): void {
  log.header('Git History Analysis');
  console.log(chalk.dim('─'.repeat(50)));

  const aiPct = Math.round(history.aiCommitRatio * 100);
  log.table('Commits analyzed', String(history.totalCommits));
  log.table('AI-authored', `${history.aiCommits} (${aiPct}%)`);
  log.table('Human-authored', String(history.humanCommits));

  if (history.hotspots.length > 0) {
    log.header('Hotspots (high churn × complexity)');
    console.log(chalk.dim('─'.repeat(50)));
    console.log(
      `  ${chalk.dim('File'.padEnd(45))} ${chalk.dim('Changes'.padStart(8))} ${chalk.dim('Churn'.padStart(7))} ${chalk.dim('AI'.padStart(4))} ${chalk.dim('Score'.padStart(6))}`,
    );

    for (const hs of history.hotspots.slice(0, 15)) {
      const name = hs.file.length > 44 ? '…' + hs.file.slice(-43) : hs.file.padEnd(45);
      const scoreColor = hs.hotspotScore > 50 ? chalk.red : hs.hotspotScore > 20 ? chalk.yellow : chalk.dim;
      console.log(
        `  ${name} ${String(hs.changeCount).padStart(8)} ${String(hs.totalChurn).padStart(7)} ${String(hs.aiChangeCount).padStart(4)} ${scoreColor(String(hs.hotspotScore).padStart(6))}`,
      );
    }

    if (history.hotspots.length > 15) {
      log.dim(`  ... and ${history.hotspots.length - 15} more files`);
    }
  }
}

function renderTemporalCoupling(couplings: TemporalCoupling[]): void {
  log.header(`Temporal Coupling (${couplings.length} pair${couplings.length !== 1 ? 's' : ''})`);
  console.log(chalk.dim('─'.repeat(50)));

  for (const tc of couplings.slice(0, 10)) {
    const strength = Math.round(tc.couplingStrength * 100);
    const strengthColor = strength >= 80 ? chalk.red : strength >= 60 ? chalk.yellow : chalk.dim;
    console.log(`  ${chalk.yellow('⚠')} ${tc.fileA} ↔ ${tc.fileB}`);
    console.log(chalk.dim(`    Co-changed ${tc.coChangeCount} times, strength: ${strengthColor(`${strength}%`)}`));
  }

  if (couplings.length > 10) {
    log.dim(`  ... and ${couplings.length - 10} more pairs`);
  }
}

// ─── Final Summary ────────────────────────────────────────

function renderFinalSummary(result: FullAnalysis, config?: GoodbotConfig): void {
  const dep = result.dependency;
  const totalIssues =
    dep.circularDependencies.length +
    dep.layerViolations.length +
    dep.barrelViolations.length +
    dep.stabilityViolations.length +
    result.solid.violations.filter((v) => v.severity === 'error' || v.severity === 'warning').length;

  console.log();
  if (totalIssues === 0) {
    log.success('No architectural violations found.');
  } else {
    log.warn(`${totalIssues} issue${totalIssues > 1 ? 's' : ''} found.`);
  }

  // Budget check
  if (config) {
    const budgetResult = checkBudget(result, config);
    if (budgetResult.length > 0) {
      renderBudgetResult(budgetResult);
    }
  }
}

// ─── Violation Budget ────────────────────────────────────

export interface BudgetEntry {
  category: string;
  actual: number;
  budget: number;
  overBudget: boolean;
}

export function checkBudget(result: FullAnalysis, config: GoodbotConfig): BudgetEntry[] {
  const budget = config.analysis?.budget;
  if (!budget) return [];

  const entries: BudgetEntry[] = [];
  const dep = result.dependency;
  const solid = result.solid.violations;

  const check = (category: string, actual: number, limit: number | undefined) => {
    if (limit === undefined) return;
    entries.push({ category, actual, budget: limit, overBudget: actual > limit });
  };

  check('Circular dependencies', dep.circularDependencies.length, budget.circular);
  check('Layer violations', dep.layerViolations.length, budget.layer);
  check('Barrel violations', dep.barrelViolations.length, budget.barrel);
  check('SRP violations', solid.filter(v => v.principle === 'SRP' && v.severity !== 'info').length, budget.srp);
  check('Complexity issues', solid.filter(v => v.message.includes('complexity') || v.message.includes('Complexity')).length, budget.complexity);
  check('Duplication clusters', solid.filter(v => v.message.includes('duplicat')).length, budget.duplication);
  check('Dead exports', solid.filter(v => v.message.includes('Dead export')).length, budget.deadExports);
  check('Custom rule violations', solid.filter(v => v.principle === 'CUSTOM').length, budget.custom);

  return entries;
}

function renderBudgetResult(entries: BudgetEntry[]): void {
  const hasOverBudget = entries.some(e => e.overBudget);

  console.log();
  log.header('Violation Budget');
  console.log(chalk.dim('─'.repeat(50)));

  for (const entry of entries) {
    const status = entry.overBudget
      ? chalk.red(`${entry.actual}/${entry.budget} ✗ over budget`)
      : chalk.green(`${entry.actual}/${entry.budget} ✓ within budget`);
    console.log(`  ${entry.category.padEnd(24)} ${status}`);
  }

  console.log();
  if (hasOverBudget) {
    const overCount = entries.filter(e => e.overBudget).length;
    log.error(`${overCount} categor${overCount === 1 ? 'y' : 'ies'} over budget.`);
  } else {
    log.success('All categories within budget.');
  }
}

// ─── Summary for scan --analyze ───────────────────────────

export function renderFullAnalysisSummary(result: FullAnalysis): void {
  const dep = result.dependency;
  const summary = summarizeAnalysis(dep);

  log.header(`Architecture Health: ${colorGrade(result.health.grade)} ${chalk.dim(`(${result.health.score}/100)`)}`);
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
