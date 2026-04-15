import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log, safeReadJson, safeWriteJson } from '../utils/index.js';
import type { HealthGrade } from '../analyzers/index.js';

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
    // Granular categories for effectiveness tracking
    srp?: number;
    complexity?: number;
    duplication?: number;
    deadExports?: number;
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
  .option('--effectiveness', 'Show which violation categories are trending up or down', false)
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

    if (opts.effectiveness) {
      renderEffectiveness(history, parseInt(opts.last, 10));
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

  const solidViolations = result.solid.violations;
  const srpViolations = solidViolations.filter(v => v.principle === 'SRP');

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
      solid: solidViolations.filter((v) => v.severity === 'error').length,
      srp: srpViolations.length,
      complexity: srpViolations.filter(v => v.message.includes('complexity') || v.message.includes('Complexity')).length,
      duplication: srpViolations.filter(v => v.message.includes('duplicat')).length,
      deadExports: solidViolations.filter(v => v.message.includes('Dead export')).length,
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

function renderEffectiveness(history: TrendHistory, count: number): void {
  const entries = history.entries.slice(-count);

  if (entries.length < 2) {
    log.info('Need at least 2 recorded entries. Run `goodbot trend --record` to add more.');
    return;
  }

  const oldest = entries[0];
  const latest = entries[entries.length - 1];

  log.header('Rule Effectiveness');
  console.log(chalk.dim('─'.repeat(55)));
  console.log(chalk.dim(`  ${entries.length} entries from ${formatDate(oldest.date)} → ${formatDate(latest.date)}`));
  console.log();

  const categories: Array<{
    label: string;
    key: keyof TrendEntry['violations'];
    description: string;
  }> = [
    { label: 'Circular deps', key: 'circular', description: 'Dependency cycles' },
    { label: 'Layer violations', key: 'layer', description: 'Upward layer imports' },
    { label: 'Barrel violations', key: 'barrel', description: 'Barrel bypass imports' },
    { label: 'SDP violations', key: 'stability', description: 'Stable→unstable deps' },
    { label: 'SOLID errors', key: 'solid', description: 'Principle violations' },
    { label: 'SRP', key: 'srp', description: 'Single responsibility' },
    { label: 'Complexity', key: 'complexity', description: 'High cyclomatic complexity' },
    { label: 'Duplication', key: 'duplication', description: 'Duplicated code blocks' },
    { label: 'Dead exports', key: 'deadExports', description: 'Unused public exports' },
  ];

  // Table header
  console.log(`  ${'Category'.padEnd(20)} ${'First'.padStart(6)} ${'Latest'.padStart(6)} ${'Delta'.padStart(8)} ${'Trend'.padStart(8)}`);
  console.log(chalk.dim(`  ${'─'.repeat(20)} ${'─'.repeat(6)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(8)}`));

  for (const cat of categories) {
    const firstVal = oldest.violations[cat.key] ?? 0;
    const latestVal = latest.violations[cat.key] ?? 0;
    const delta = latestVal - firstVal;

    // Compute trend from all entries (simple: compare first half avg vs second half avg)
    const values = entries.map(e => e.violations[cat.key] ?? 0);
    const midpoint = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, midpoint);
    const secondHalf = values.slice(midpoint);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const trendDelta = secondAvg - firstAvg;

    const deltaStr = delta === 0 ? chalk.dim('  ±0')
      : delta > 0 ? chalk.red(`  +${delta}`)
      : chalk.green(`  ${delta}`);

    const trendStr = Math.abs(trendDelta) < 0.5 ? chalk.dim('  stable')
      : trendDelta > 0 ? chalk.red('  ↑ worse')
      : chalk.green('  ↓ better');

    console.log(`  ${cat.label.padEnd(20)} ${String(firstVal).padStart(6)} ${String(latestVal).padStart(6)} ${deltaStr.padStart(8)} ${trendStr}`);
  }

  console.log();

  // Summary
  const improving = categories.filter(cat => {
    const firstVal = oldest.violations[cat.key] ?? 0;
    const latestVal = latest.violations[cat.key] ?? 0;
    return latestVal < firstVal;
  });
  const worsening = categories.filter(cat => {
    const firstVal = oldest.violations[cat.key] ?? 0;
    const latestVal = latest.violations[cat.key] ?? 0;
    return latestVal > firstVal;
  });

  if (worsening.length > 0) {
    log.warn(`Getting worse: ${worsening.map(c => c.label).join(', ')}`);
  }
  if (improving.length > 0) {
    log.success(`Improving: ${improving.map(c => c.label).join(', ')}`);
  }
  if (worsening.length === 0 && improving.length === 0) {
    log.info('All categories stable.');
  }

  console.log();
  log.dim('Categories that consistently worsen may need clearer guardrail rules.');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
