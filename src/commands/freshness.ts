import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis, analyzeGitHistory, findTemporalCoupling } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { buildContext } from '../generators/index.js';
import { loadSnapshot, buildSnapshot, compareFreshness } from '../freshness/index.js';
import type { FreshnessReport, FreshnessClaim } from '../freshness/index.js';
import { log } from '../utils/index.js';

export const freshnessCommand = new Command('freshness')
  .description('Check if your guardrail claims still match codebase reality')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    const projectRoot = opts.path;

    // Load stored snapshot
    const stored = await loadSnapshot(projectRoot);
    if (!stored) {
      log.error('No snapshot found. Run `goodbot generate --analyze` first.');
      process.exit(1);
    }

    const spinner = ora('Analyzing current codebase...').start();

    try {
      const scan = await runFullScan(projectRoot);
      let config;
      try { config = await loadConfig(projectRoot); } catch { /* no config */ }

      spinner.text = 'Running full analysis...';
      const fullAnalysis = await runFullAnalysis(projectRoot, scan.structure, config);

      spinner.text = 'Analyzing git history...';
      const gitHistory = await analyzeGitHistory(projectRoot, 500, scan.structure.srcRoot ?? undefined);
      const temporalCouplings = findTemporalCoupling(gitHistory.commits, 3, 0.5, scan.structure.srcRoot ?? undefined);

      // Build current snapshot from fresh analysis
      const context = buildContext(config!, undefined, fullAnalysis, gitHistory, temporalCouplings);
      const currentSnapshot = buildSnapshot(
        context.analysisInsights!,
        config?.conventions.customRules ?? [],
        fullAnalysis.dependency.modules.length,
        fullAnalysis.dependency.filesParsed,
      );

      spinner.succeed('Analysis complete');

      // Compare
      const report = compareFreshness(stored, currentSnapshot);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        renderReport(report);
      }

      // Exit 1 if degraded (useful for CI)
      if (report.overallStatus === 'degraded') {
        process.exit(1);
      }
    } catch (err) {
      spinner.fail('Freshness check failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function renderReport(report: FreshnessReport): void {
  const ageLabel = report.daysSinceGeneration === 0
    ? 'today'
    : report.daysSinceGeneration === 1
      ? '1 day ago'
      : `${report.daysSinceGeneration} days ago`;

  console.log();
  log.header(`Guardrail Freshness Report (generated ${ageLabel})`);
  console.log(chalk.dim('─'.repeat(55)));

  for (const claim of report.claims) {
    const icon = statusIcon(claim.status);
    const values = formatValues(claim);
    console.log(`  ${claim.label.padEnd(24)} ${values}  ${icon}`);
  }

  console.log();
  const parts: string[] = [];
  if (report.summary.fresh > 0) parts.push(chalk.green(`${report.summary.fresh} fresh`));
  if (report.summary.stale > 0) parts.push(chalk.yellow(`${report.summary.stale} stale`));
  if (report.summary.degraded > 0) parts.push(chalk.red(`${report.summary.degraded} degraded`));
  if (report.summary.improved > 0) parts.push(chalk.blue(`${report.summary.improved} improved`));
  console.log(`  ${parts.join(chalk.dim(' · '))}`);

  console.log();
  if (report.overallStatus === 'degraded') {
    log.error('Your guardrails are stale and codebase health has degraded.');
    log.warn('Run `goodbot generate --analyze --force` to update.');
  } else if (report.overallStatus === 'stale') {
    log.warn('Your guardrails are stale. Run `goodbot generate --analyze --force` to update.');
  } else {
    log.success('Your guardrails are fresh. Good bot!');
  }
}

function statusIcon(status: FreshnessClaim['status']): string {
  switch (status) {
    case 'fresh': return chalk.green('✓ fresh');
    case 'stale': return chalk.yellow('⚠ stale');
    case 'degraded': return chalk.red('✗ degraded');
    case 'improved': return chalk.blue('↑ improved');
  }
}

function formatValues(claim: FreshnessClaim): string {
  const stored = String(claim.storedValue);
  const current = String(claim.currentValue);

  if (claim.status === 'fresh') {
    return chalk.dim(`${stored}`);
  }

  const delta = claim.delta !== undefined
    ? ` (${claim.delta > 0 ? '+' : ''}${claim.delta})`
    : '';

  return `${chalk.dim(stored)} → ${current}${delta}`;
}
