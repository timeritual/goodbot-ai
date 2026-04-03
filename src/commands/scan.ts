import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { runFullScan } from '../scanners/index.js';
import { runDependencyAnalysis } from '../analyzers/index.js';
import { renderAnalysisSummary } from './analyze.js';
import { loadConfig } from '../config/index.js';
import { log } from '../utils/index.js';

export const scanCommand = new Command('scan')
  .description('Analyze your project without generating any files')
  .option('-p, --path <path>', 'Project path to scan', process.cwd())
  .option('-a, --analyze', 'Include dependency analysis', false)
  .action(async (opts) => {
    const spinner = ora('Scanning project...').start();

    try {
      const result = await runFullScan(opts.path);
      spinner.succeed('Scan complete');

      log.header('Project Analysis');
      console.log(chalk.dim('─'.repeat(45)));

      log.table('Project', result.projectName);
      log.table('Framework', `${result.framework.framework} ${chalk.dim(`(${result.framework.detectedFrom})`)}`);
      log.table('Confidence', result.framework.confidence);
      log.table('Language', result.language.primary);
      if (result.language.secondary.length > 0) {
        log.table('Secondary', result.language.secondary.join(', '));
      }
      log.table('Src root', result.structure.srcRoot ?? 'not detected');
      log.table('Test strategy', result.structure.testStrategy);
      log.table('Barrel files', result.structure.hasBarrelFiles ? 'yes' : 'no');
      log.table('Interface files', result.structure.hasInterfaceFiles ? 'yes' : 'no');

      if (result.structure.detectedLayers.length > 0) {
        log.header('Detected Layers');
        console.log(chalk.dim('─'.repeat(45)));

        for (const layer of result.structure.detectedLayers) {
          const barrel = layer.hasBarrel ? chalk.green('barrel') : chalk.dim('no barrel');
          const iface = layer.hasInterfaces ? chalk.green('interfaces') : '';
          const extras = [barrel, iface].filter(Boolean).join(', ');
          console.log(
            `  ${chalk.dim(`L${layer.suggestedLevel}`)} ${layer.name.padEnd(18)} ${chalk.dim(layer.path.padEnd(20))} ${extras}`,
          );
        }
      }

      const cmds = result.verification;
      const hasAnyCmds = cmds.typecheck || cmds.lint || cmds.test || cmds.format || cmds.build;
      if (hasAnyCmds) {
        log.header('Verification Commands');
        console.log(chalk.dim('─'.repeat(45)));
        if (cmds.typecheck) log.table('typecheck', cmds.typecheck);
        if (cmds.lint) log.table('lint', cmds.lint);
        if (cmds.test) log.table('test', cmds.test);
        if (cmds.format) log.table('format', cmds.format);
        if (cmds.build) log.table('build', cmds.build);
      }

      // Optional dependency analysis
      if (opts.analyze) {
        spinner.start('Analyzing dependencies...');
        let config;
        try { config = await loadConfig(opts.path); } catch { /* no config */ }
        const analysis = await runDependencyAnalysis(opts.path, result.structure, config);
        spinner.succeed(`Analysis complete (${analysis.timeTakenMs}ms)`);
        renderAnalysisSummary(analysis);
      }

      console.log();
      log.dim('Run `goodbot init` to configure guardrails for this project.');
    } catch (err) {
      spinner.fail('Scan failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
