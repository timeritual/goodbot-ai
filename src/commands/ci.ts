import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis, summarizeAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log, safeWriteFile } from '../utils/index.js';
import type { FullAnalysis, HealthGrade } from '../analyzers/types.js';

const GRADE_ORDER: HealthGrade[] = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];

export const ciCommand = new Command('ci')
  .description('Run analysis for CI/CD — outputs markdown for PR comments')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--mode <mode>', 'Analysis mode: full or diff', 'diff')
  .option('--base <branch>', 'Base branch for diff', 'main')
  .option('--output <file>', 'Write markdown result to file')
  .option('--json <file>', 'Write JSON result to file')
  .option('--check-grade <grade>', 'Check if grade meets threshold')
  .option('--threshold <grade>', 'Minimum acceptable grade')
  .action(async (opts) => {
    // Grade check mode (used by GitHub Action)
    if (opts.checkGrade && opts.threshold) {
      const gradeIdx = GRADE_ORDER.indexOf(opts.checkGrade as HealthGrade);
      const thresholdIdx = GRADE_ORDER.indexOf(opts.threshold as HealthGrade);
      if (gradeIdx > thresholdIdx) {
        log.error(`Grade ${opts.checkGrade} is below threshold ${opts.threshold}`);
        process.exit(1);
      }
      log.success(`Grade ${opts.checkGrade} meets threshold ${opts.threshold}`);
      return;
    }

    const projectRoot = opts.path;
    const spinner = ora('Running CI analysis...').start();

    try {
      const scan = await runFullScan(projectRoot);
      let config;
      try { config = await loadConfig(projectRoot); } catch { /* no config */ }

      const result = await runFullAnalysis(projectRoot, scan.structure, config);
      spinner.succeed(`Analysis complete (${result.dependency.timeTakenMs}ms)`);

      const markdown = generateCIComment(result, opts.mode, opts.base);

      // Write outputs
      if (opts.output) {
        await safeWriteFile(opts.output, markdown);
        log.success(`Markdown written to ${opts.output}`);
      }

      if (opts.json) {
        const serializable = {
          health: result.health,
          solid: result.solid.scores,
          violations: {
            circular: result.dependency.circularDependencies.length,
            layer: result.dependency.layerViolations.length,
            barrel: result.dependency.barrelViolations.length,
            stability: result.dependency.stabilityViolations.length,
            solid: result.solid.violations.length,
          },
          modules: result.dependency.modules.length,
          filesParsed: result.dependency.filesParsed,
        };
        await safeWriteFile(opts.json, JSON.stringify(serializable, null, 2));
        log.success(`JSON written to ${opts.json}`);
      }

      if (!opts.output && !opts.json) {
        console.log(markdown);
      }
    } catch (err) {
      spinner.fail('CI analysis failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function generateCIComment(
  analysis: FullAnalysis,
  mode: string,
  baseBranch: string,
): string {
  const { health, solid, dependency: dep } = analysis;
  const summary = summarizeAnalysis(dep);

  const gradeEmoji = health.grade.startsWith('A') ? '🟢'
    : health.grade.startsWith('B') ? '🔵'
    : health.grade.startsWith('C') ? '🟡'
    : '🔴';

  const totalViolations = dep.circularDependencies.length +
    dep.layerViolations.length + dep.barrelViolations.length +
    dep.stabilityViolations.length +
    solid.violations.filter((v) => v.severity === 'error').length;

  const lines: string[] = [];

  lines.push('<!-- goodbot-analysis -->');
  lines.push(`## ${gradeEmoji} goodbot — Architecture Health: **${health.grade}** (${health.score}/100)`);
  lines.push('');
  lines.push('| Metric | Score |');
  lines.push('|--------|-------|');
  lines.push(`| Dependencies | ${bar(health.breakdown.dependencies)} ${health.breakdown.dependencies}/100 |`);
  lines.push(`| Stability | ${bar(health.breakdown.stability)} ${health.breakdown.stability}/100 |`);
  lines.push(`| SOLID | ${bar(health.breakdown.solid)} ${health.breakdown.solid}/100 |`);
  lines.push(`| Architecture | ${bar(health.breakdown.architecture)} ${health.breakdown.architecture}/100 |`);
  lines.push('');

  // Summary stats
  lines.push('| Check | Result |');
  lines.push('|-------|--------|');
  lines.push(`| Modules | ${dep.modules.length} |`);
  lines.push(`| Files parsed | ${dep.filesParsed} |`);
  lines.push(`| Circular dependencies | ${dep.circularDependencies.length === 0 ? '0 ✅' : `${dep.circularDependencies.length} ⚠️`} |`);
  lines.push(`| Layer violations | ${dep.layerViolations.length === 0 ? '0 ✅' : `${dep.layerViolations.length} ❌`} |`);
  lines.push(`| Barrel violations | ${dep.barrelViolations.length === 0 ? '0 ✅' : `${dep.barrelViolations.length} ❌`} |`);
  lines.push(`| SDP violations | ${dep.stabilityViolations.length === 0 ? '0 ✅' : `${dep.stabilityViolations.length} ⚠️`} |`);
  lines.push(`| SOLID violations | ${solid.violations.filter((v) => v.severity === 'error').length === 0 ? '0 ✅' : `${solid.violations.filter((v) => v.severity === 'error').length} ⚠️`} |`);
  lines.push('');

  // Top violations (collapsed)
  if (totalViolations > 0) {
    lines.push('<details>');
    lines.push('<summary>View violations</summary>');
    lines.push('');

    if (dep.circularDependencies.length > 0) {
      lines.push('**Circular Dependencies:**');
      for (const cd of dep.circularDependencies) {
        lines.push(`- \`${cd.cycle.join(' → ')}\``);
      }
      lines.push('');
    }

    if (dep.layerViolations.length > 0) {
      lines.push('**Layer Violations:**');
      for (const lv of dep.layerViolations.slice(0, 10)) {
        lines.push(`- \`${lv.file}:${lv.line}\` — ${lv.fromModule} (L${lv.fromLevel}) → ${lv.toModule} (L${lv.toLevel})`);
      }
      lines.push('');
    }

    const solidErrors = solid.violations.filter((v) => v.severity === 'error');
    if (solidErrors.length > 0) {
      lines.push('**SOLID Violations:**');
      for (const v of solidErrors.slice(0, 10)) {
        lines.push(`- **[${v.principle}]** \`${v.file}\` — ${v.message}`);
      }
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push('*[goodbot](https://github.com/timeritual/goodbot-ai) — Train your AI to be a good bot*');

  return lines.join('\n');
}

function bar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const green = '🟩';
  const gray = '⬜';
  return green.repeat(filled) + gray.repeat(empty);
}
