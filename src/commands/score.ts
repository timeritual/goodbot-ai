import { Command } from 'commander';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { loadConfig } from '../config/index.js';

export const scoreCommand = new Command('score')
  .description('Show your project health grade — fast, one line')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--no-color', 'Plain output (for scripts)', false)
  .action(async (opts) => {
    try {
      const scan = await runFullScan(opts.path);
      let config;
      try { config = await loadConfig(opts.path); } catch { /* no config */ }

      const result = await runFullAnalysis(opts.path, scan.structure, config);
      const { grade, score } = result.health;

      if (!opts.color) {
        // Plain output for scripts: "B+ 80"
        console.log(`${grade} ${score}`);
        return;
      }

      const color = grade.startsWith('A') ? chalk.green
        : grade.startsWith('B') ? chalk.cyan
        : grade.startsWith('C') ? chalk.yellow
        : chalk.red;

      console.log(`${color.bold(grade)} ${chalk.dim(`(${score}/100)`)}`);

      // Exit with 1 if grade is D or F (useful for git hooks)
      if (grade === 'D' || grade === 'F') {
        process.exit(1);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
