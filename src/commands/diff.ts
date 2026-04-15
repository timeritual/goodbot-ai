import { Command } from 'commander';
import { execSync } from 'node:child_process';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis, analyzeGitHistory, findTemporalCoupling } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { buildContext } from '../generators/index.js';
import { loadSnapshot, buildSnapshot, compareFreshness } from '../freshness/index.js';
import type { FreshnessReport, FreshnessClaim } from '../freshness/index.js';
import { log } from '../utils/index.js';
import { renderHealthGrade } from './analyze.js';
import type { FullAnalysis } from '../analyzers/index.js';

export const diffCommand = new Command('diff')
  .description('Analyze only changed files — shows new/resolved violations vs base branch')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-b, --base <branch>', 'Base branch to compare against', 'main')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const projectRoot = opts.path;
    const spinner = ora('Getting changed files...').start();

    try {
      // Get list of changed files
      const changedFiles = getChangedFiles(projectRoot, opts.base);

      if (changedFiles.length === 0) {
        spinner.succeed('No changed files found');
        log.info('No source files changed compared to ' + opts.base);
        return;
      }

      spinner.text = `Analyzing ${changedFiles.length} changed files...`;

      const scan = await runFullScan(projectRoot);
      let config;
      try { config = await loadConfig(projectRoot); } catch { /* no config */ }

      // Run full analysis on current state
      const current = await runFullAnalysis(projectRoot, scan.structure, config);

      // Build freshness report if snapshot exists
      let freshnessReport: FreshnessReport | undefined;
      const stored = await loadSnapshot(projectRoot);
      if (stored) {
        spinner.text = 'Comparing against guardrail snapshot...';
        const gitHistory = await analyzeGitHistory(projectRoot, 500, scan.structure.srcRoot ?? undefined);
        const temporalCouplings = findTemporalCoupling(gitHistory.commits, 3, 0.5, scan.structure.srcRoot ?? undefined);
        const context = buildContext(config!, undefined, current, gitHistory, temporalCouplings);
        if (context.analysisInsights) {
          const currentSnapshot = buildSnapshot(
            context.analysisInsights,
            config?.conventions.customRules ?? [],
            current.dependency.modules.length,
            current.dependency.filesParsed,
          );
          freshnessReport = compareFreshness(stored, currentSnapshot);
        }
      }

      spinner.succeed(`Analyzed ${changedFiles.length} changed files (${current.dependency.timeTakenMs}ms)`);

      if (opts.json) {
        const output = {
          changedFiles,
          health: current.health,
          violations: filterToChangedFiles(current, changedFiles),
          freshness: freshnessReport,
        };
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      renderDiff(current, changedFiles, opts.base, freshnessReport);
    } catch (err) {
      spinner.fail('Diff analysis failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function getChangedFiles(projectRoot: string, baseBranch: string): string[] {
  try {
    // Get changed files compared to base branch
    const output = execSync(
      `git diff --name-only --diff-filter=ACMR ${baseBranch}...HEAD 2>/dev/null || git diff --name-only --diff-filter=ACMR HEAD`,
      { cwd: projectRoot, encoding: 'utf-8' },
    );

    return output
      .split('\n')
      .filter((f) => f.trim())
      .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
      .filter((f) => !f.includes('.test.') && !f.includes('.spec.'));
  } catch {
    // Fallback: get uncommitted changes
    try {
      const output = execSync('git diff --name-only --diff-filter=ACMR HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
      });
      return output
        .split('\n')
        .filter((f) => f.trim())
        .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
    } catch {
      log.warn('Could not read git history. Are you in a git repository?');
      return [];
    }
  }
}

interface FilteredViolations {
  layerViolations: number;
  barrelViolations: number;
  solidViolations: number;
  details: Array<{ type: string; file: string; message: string }>;
}

function filterToChangedFiles(analysis: FullAnalysis, changedFiles: string[]): FilteredViolations {
  const changed = new Set(changedFiles);

  const layerViolations = analysis.dependency.layerViolations.filter((v) => changed.has(v.file));
  const barrelViolations = analysis.dependency.barrelViolations.filter((v) => changed.has(v.file));
  const solidViolations = analysis.solid.violations.filter((v) => changed.has(v.file));

  const details: FilteredViolations['details'] = [];
  for (const v of layerViolations) {
    details.push({ type: 'layer', file: v.file, message: `${v.fromModule} (L${v.fromLevel}) → ${v.toModule} (L${v.toLevel})` });
  }
  for (const v of barrelViolations) {
    details.push({ type: 'barrel', file: v.file, message: `Bypasses barrel: ${v.specifier}` });
  }
  for (const v of solidViolations) {
    details.push({ type: v.principle, file: v.file, message: v.message });
  }

  return {
    layerViolations: layerViolations.length,
    barrelViolations: barrelViolations.length,
    solidViolations: solidViolations.length,
    details,
  };
}

function renderDiff(
  analysis: FullAnalysis,
  changedFiles: string[],
  baseBranch: string,
  freshnessReport?: FreshnessReport,
): void {
  renderHealthGrade(analysis.health);

  log.header(`Changes vs ${baseBranch}`);
  console.log(chalk.dim('─'.repeat(50)));
  log.table('Files changed', String(changedFiles.length));

  const filtered = filterToChangedFiles(analysis, changedFiles);
  const totalNew = filtered.layerViolations + filtered.barrelViolations + filtered.solidViolations;

  if (totalNew === 0) {
    console.log();
    log.success('No violations in changed files. Good bot!');
  } else {
    log.table('Layer violations', filtered.layerViolations === 0
      ? chalk.green('0') : chalk.red(String(filtered.layerViolations)));
    log.table('Barrel violations', filtered.barrelViolations === 0
      ? chalk.green('0') : chalk.red(String(filtered.barrelViolations)));
    log.table('SOLID violations', filtered.solidViolations === 0
      ? chalk.green('0') : chalk.yellow(String(filtered.solidViolations)));

    log.header('Violations in Changed Files');
    console.log(chalk.dim('─'.repeat(50)));

    for (const d of filtered.details) {
      const icon = d.type === 'layer' || d.type === 'barrel' ? chalk.red('✗') : chalk.yellow('⚠');
      const tag = chalk.dim(`[${d.type}]`);
      console.log(`  ${icon} ${tag} ${d.message}`);
      console.log(chalk.dim(`    ${d.file}`));
    }

    console.log();
    log.warn(`${totalNew} violation${totalNew > 1 ? 's' : ''} in changed files.`);
  }

  // Show freshness impact if snapshot exists
  if (freshnessReport) {
    renderFreshnessImpact(freshnessReport);
  }
}

function renderFreshnessImpact(report: FreshnessReport): void {
  const moved = report.claims.filter(c => c.status !== 'fresh');
  if (moved.length === 0) return;

  console.log();
  log.header('Guardrail Impact');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim(`  Your guardrails were generated ${report.daysSinceGeneration}d ago. This diff has moved:`));
  console.log();

  for (const claim of moved) {
    const icon = claimIcon(claim.status);
    const delta = claim.delta !== undefined
      ? ` (${claim.delta > 0 ? '+' : ''}${claim.delta})`
      : '';
    console.log(`  ${icon} ${claim.label}: ${claim.storedValue} → ${claim.currentValue}${delta}`);
  }

  console.log();
  if (report.summary.degraded > 0) {
    log.warn(`${report.summary.degraded} guardrail claim${report.summary.degraded > 1 ? 's' : ''} degraded. Run \`goodbot generate --analyze --force\` to update.`);
  } else {
    log.info(`${moved.length} guardrail claim${moved.length > 1 ? 's' : ''} changed. Run \`goodbot generate --analyze --force\` to update.`);
  }
}

function claimIcon(status: FreshnessClaim['status']): string {
  switch (status) {
    case 'fresh': return chalk.green('✓');
    case 'stale': return chalk.yellow('⚠');
    case 'degraded': return chalk.red('✗');
    case 'improved': return chalk.blue('↑');
  }
}
