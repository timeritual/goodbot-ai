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
  .option('--watch [interval]', 'Continuously monitor freshness (interval in seconds, default 60)')
  .action(async (opts) => {
    const projectRoot = opts.path;

    if (opts.watch !== undefined) {
      const intervalSec = typeof opts.watch === 'string' ? parseInt(opts.watch, 10) : 60;
      if (isNaN(intervalSec) || intervalSec < 10) {
        log.error('Watch interval must be at least 10 seconds.');
        process.exit(1);
      }
      await watchFreshness(projectRoot, intervalSec, opts.json);
      return;
    }

    const report = await runFreshnessCheck(projectRoot);
    if (!report) return;

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      renderReport(report);
    }

    if (report.overallStatus === 'degraded') {
      process.exit(1);
    }
  });

async function runFreshnessCheck(projectRoot: string): Promise<FreshnessReport | null> {
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

    return compareFreshness(stored, currentSnapshot);
  } catch (err) {
    spinner.fail('Freshness check failed');
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function watchFreshness(projectRoot: string, intervalSec: number, json: boolean): Promise<void> {
  log.info(`Watching freshness every ${intervalSec}s... (Ctrl+C to stop)`);
  console.log();

  const runOnce = async () => {
    const stored = await loadSnapshot(projectRoot);
    if (!stored) {
      log.error('No snapshot found. Run `goodbot generate --analyze` first.');
      return null;
    }

    const scan = await runFullScan(projectRoot);
    let config;
    try { config = await loadConfig(projectRoot); } catch { /* no config */ }

    const fullAnalysis = await runFullAnalysis(projectRoot, scan.structure, config);
    const gitHistory = await analyzeGitHistory(projectRoot, 500, scan.structure.srcRoot ?? undefined);
    const temporalCouplings = findTemporalCoupling(gitHistory.commits, 3, 0.5, scan.structure.srcRoot ?? undefined);

    const context = buildContext(config!, undefined, fullAnalysis, gitHistory, temporalCouplings);
    const currentSnapshot = buildSnapshot(
      context.analysisInsights!,
      config?.conventions.customRules ?? [],
      fullAnalysis.dependency.modules.length,
      fullAnalysis.dependency.filesParsed,
    );

    return compareFreshness(stored, currentSnapshot);
  };

  let lastStatus: string | undefined;

  const tick = async () => {
    try {
      const report = await runOnce();
      if (!report) return;

      // Clear screen for clean output
      process.stdout.write('\x1B[2J\x1B[0f');

      const now = new Date().toLocaleTimeString();
      console.log(`  ${chalk.bold('goodbot freshness')} ${chalk.dim(`(${now}, every ${intervalSec}s)`)}`);
      console.log();

      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        renderReport(report);
      }

      // Alert on status change
      if (lastStatus && lastStatus !== report.overallStatus) {
        if (report.overallStatus === 'degraded') {
          console.log();
          log.error('Status changed to DEGRADED');
        } else if (report.overallStatus === 'fresh' && lastStatus !== 'fresh') {
          console.log();
          log.success('Guardrails are now fresh!');
        }
      }
      lastStatus = report.overallStatus;
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Run immediately, then on interval
  await tick();

  const timer = setInterval(tick, intervalSec * 1000);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log('\n');
    log.info('Freshness watch stopped.');
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

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
