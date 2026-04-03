import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log, safeReadJson, safeWriteJson } from '../utils/index.js';
import type { HealthGrade } from '../analyzers/types.js';

interface TrendEntry {
  date: string;
  grade: HealthGrade;
  score: number;
  breakdown: {
    dependencies: number;
    stability: number;
    solid: number;
    architecture: number;
  };
  violations: {
    circular: number;
    layer: number;
    barrel: number;
    stability: number;
    solid: number;
  };
  modules: number;
  filesParsed: number;
}

interface TrendHistory {
  entries: TrendEntry[];
}

function historyPath(projectRoot: string): string {
  return path.join(projectRoot, '.goodbot', 'history.json');
}

export const trendCommand = new Command('trend')
  .description('Track architecture health over time')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--record', 'Record current score to history', false)
  .option('--json', 'Output as JSON', false)
  .option('-n, --last <count>', 'Show last N entries', '20')
  .action(async (opts) => {
    const projectRoot = opts.path;

    if (opts.record) {
      await recordEntry(projectRoot);
      return;
    }

    // Show trend
    const history = await safeReadJson<TrendHistory>(historyPath(projectRoot));
    if (!history || history.entries.length === 0) {
      log.info('No history yet. Run `goodbot trend --record` to save your first snapshot.');
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(history, null, 2));
      return;
    }

    renderTrend(history, parseInt(opts.last, 10));
  });

async function recordEntry(projectRoot: string): Promise<void> {
  const spinner = ora('Analyzing...').start();

  const scan = await runFullScan(projectRoot);
  let config;
  try { config = await loadConfig(projectRoot); } catch { /* no config */ }

  const result = await runFullAnalysis(projectRoot, scan.structure, config);
  spinner.succeed('Analysis complete');

  const entry: TrendEntry = {
    date: new Date().toISOString(),
    grade: result.health.grade,
    score: result.health.score,
    breakdown: result.health.breakdown,
    violations: {
      circular: result.dependency.circularDependencies.length,
      layer: result.dependency.layerViolations.length,
      barrel: result.dependency.barrelViolations.length,
      stability: result.dependency.stabilityViolations.length,
      solid: result.solid.violations.filter((v) => v.severity === 'error').length,
    },
    modules: result.dependency.modules.length,
    filesParsed: result.dependency.filesParsed,
  };

  const hp = historyPath(projectRoot);
  const history = (await safeReadJson<TrendHistory>(hp)) ?? { entries: [] };
  history.entries.push(entry);

  // Keep max 365 entries
  if (history.entries.length > 365) {
    history.entries = history.entries.slice(-365);
  }

  await safeWriteJson(hp, history);
  log.success(`Recorded: ${entry.grade} (${entry.score}/100) — ${history.entries.length} total entries`);
}

function renderTrend(history: TrendHistory, count: number): void {
  const entries = history.entries.slice(-count);
  const latest = entries[entries.length - 1];
  const oldest = entries[0];

  const gradeColor = (grade: string) =>
    grade.startsWith('A') ? chalk.green
    : grade.startsWith('B') ? chalk.cyan
    : grade.startsWith('C') ? chalk.yellow
    : chalk.red;

  log.header('Architecture Health Trend');
  console.log(chalk.dim('─'.repeat(55)));

  // Current vs first
  const delta = latest.score - oldest.score;
  const deltaStr = delta > 0 ? chalk.green(`+${delta}`)
    : delta < 0 ? chalk.red(`${delta}`)
    : chalk.dim('±0');

  log.table('Current', `${gradeColor(latest.grade).bold(latest.grade)} ${chalk.dim(`(${latest.score}/100)`)}`);
  log.table('First recorded', `${gradeColor(oldest.grade)(oldest.grade)} ${chalk.dim(`(${oldest.score}/100)`)}`);
  log.table('Change', deltaStr);
  log.table('Entries', String(history.entries.length));
  log.table('Period', `${formatDate(oldest.date)} → ${formatDate(latest.date)}`);

  // Sparkline chart
  console.log();
  console.log(chalk.dim('  Score over time:'));
  const sparkline = entries.map((e) => {
    const height = Math.round(e.score / 10);
    return { score: e.score, grade: e.grade, bar: '█'.repeat(height) + '░'.repeat(10 - height) };
  });

  // Show chart (last N entries as vertical bars sideways)
  console.log();
  for (const entry of sparkline) {
    const color = gradeColor(entry.grade);
    const date = '';
    console.log(`  ${color(entry.bar)} ${chalk.dim(String(entry.score))}`);
  }

  // Breakdown trend (latest vs previous)
  if (entries.length >= 2) {
    const prev = entries[entries.length - 2];
    console.log();
    log.header('Latest vs Previous');
    console.log(chalk.dim('─'.repeat(55)));

    const showDelta = (label: string, curr: number, prevVal: number) => {
      const d = curr - prevVal;
      const ds = d > 0 ? chalk.green(`+${d}`) : d < 0 ? chalk.red(`${d}`) : chalk.dim('±0');
      log.table(label, `${curr} ${ds}`);
    };

    showDelta('Dependencies', latest.breakdown.dependencies, prev.breakdown.dependencies);
    showDelta('Stability', latest.breakdown.stability, prev.breakdown.stability);
    showDelta('SOLID', latest.breakdown.solid, prev.breakdown.solid);
    showDelta('Architecture', latest.breakdown.architecture, prev.breakdown.architecture);

    console.log();
    showDelta('Circular deps', latest.violations.circular, prev.violations.circular);
    showDelta('Layer violations', latest.violations.layer, prev.violations.layer);
    showDelta('SOLID errors', latest.violations.solid, prev.violations.solid);
  }

  console.log();
  log.dim('Run `goodbot trend --record` after each sprint to track progress.');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
