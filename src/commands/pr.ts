import { Command } from 'commander';
import { execSync } from 'node:child_process';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';
import { log } from '../utils/index.js';
import type { FullAnalysis } from '../analyzers/index.js';

export const prCommand = new Command('pr')
  .description('Generate a PR description with architectural impact summary')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('-b, --base <branch>', 'Base branch', 'main')
  .option('--copy', 'Copy to clipboard (macOS)', false)
  .action(async (opts) => {
    const projectRoot = opts.path;
    const spinner = ora('Analyzing...').start();

    try {
      const changedFiles = getChangedFiles(projectRoot, opts.base);
      const scan = await runFullScan(projectRoot);
      let config;
      try { config = await loadConfig(projectRoot); } catch { /* no config */ }

      const analysis = await runFullAnalysis(projectRoot, scan.structure, config);
      spinner.succeed('Analysis complete');

      const markdown = generatePRDescription(analysis, changedFiles, opts.base);

      if (opts.copy) {
        try {
          execSync('pbcopy', { input: markdown, cwd: projectRoot });
          log.success('PR description copied to clipboard!');
        } catch {
          log.warn('Could not copy to clipboard. Output below:');
        }
      }

      console.log();
      console.log(chalk.dim('─── Copy below this line ───'));
      console.log();
      console.log(markdown);
      console.log();
      console.log(chalk.dim('─── Copy above this line ───'));
    } catch (err) {
      spinner.fail('Failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

function getChangedFiles(projectRoot: string, baseBranch: string): string[] {
  try {
    const output = execSync(
      `git diff --name-only --diff-filter=ACMR ${baseBranch}...HEAD 2>/dev/null || git diff --name-only --diff-filter=ACMR HEAD`,
      { cwd: projectRoot, encoding: 'utf-8' },
    );
    return output.split('\n').filter((f) => f.trim());
  } catch {
    return [];
  }
}

function generatePRDescription(
  analysis: FullAnalysis,
  changedFiles: string[],
  baseBranch: string,
): string {
  const { health, solid, dependency: dep } = analysis;
  const grade = health.grade;
  const gradeEmoji = grade.startsWith('A') ? '🟢'
    : grade.startsWith('B') ? '🔵'
    : grade.startsWith('C') ? '🟡'
    : '🔴';

  const sourceFiles = changedFiles.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
  const changed = new Set(changedFiles);

  // Violations in changed files
  const newLayerViolations = dep.layerViolations.filter((v) => changed.has(v.file));
  const newBarrelViolations = dep.barrelViolations.filter((v) => changed.has(v.file));
  const newSolidViolations = solid.violations.filter((v) => changed.has(v.file));
  const totalNew = newLayerViolations.length + newBarrelViolations.length + newSolidViolations.length;

  const lines: string[] = [];

  lines.push(`## Architecture Impact`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Health Grade | ${gradeEmoji} **${grade}** (${health.score}/100) |`);
  lines.push(`| Files Changed | ${changedFiles.length} (${sourceFiles.length} source) |`);
  lines.push(`| Violations in PR | ${totalNew === 0 ? '0 ✅' : `${totalNew} ⚠️`} |`);
  lines.push(`| Modules | ${dep.modules.length} |`);
  lines.push(`| Circular Deps | ${dep.circularDependencies.length === 0 ? '0 ✅' : `${dep.circularDependencies.length} ⚠️`} |`);
  lines.push('');

  // Breakdown
  lines.push(`<details>`);
  lines.push(`<summary>Health Breakdown</summary>`);
  lines.push('');
  lines.push(`| Dimension | Score |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| Dependencies | ${health.breakdown.dependencies}/100 |`);
  lines.push(`| Stability | ${health.breakdown.stability}/100 |`);
  lines.push(`| SOLID | ${health.breakdown.solid}/100 |`);
  lines.push(`| Architecture | ${health.breakdown.architecture}/100 |`);
  lines.push('');
  lines.push(`</details>`);

  // Violations in changed files
  if (totalNew > 0) {
    lines.push('');
    lines.push(`### Violations in Changed Files`);
    lines.push('');

    for (const v of newLayerViolations) {
      lines.push(`- **Layer**: \`${v.file}:${v.line}\` — ${v.fromModule} (L${v.fromLevel}) → ${v.toModule} (L${v.toLevel})`);
    }
    for (const v of newBarrelViolations) {
      lines.push(`- **Barrel**: \`${v.file}:${v.line}\` — bypasses barrel: \`${v.specifier}\``);
    }
    for (const v of newSolidViolations.slice(0, 5)) {
      lines.push(`- **${v.principle}**: \`${v.file}\` — ${v.message}`);
    }
    if (newSolidViolations.length > 5) {
      lines.push(`- ... and ${newSolidViolations.length - 5} more`);
    }
  }

  lines.push('');
  lines.push(`---`);
  lines.push(`*Generated by [goodbot](https://github.com/timeritual/goodbot-ai)*`);

  return lines.join('\n');
}
