import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig, saveChecksums } from '../config/index.js';
import { generateAll } from '../generators/index.js';
import { log, safeWriteFile, safeReadFile, contentHash } from '../utils/index.js';

export const generateCommand = new Command('generate')
  .description('Generate AI agent guardrail files from your config')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--force', 'Overwrite existing files without prompting', false)
  .option('--dry-run', 'Show what would be generated without writing', false)
  .action(async (opts) => {
    const projectRoot = opts.path;

    let config;
    try {
      config = await loadConfig(projectRoot);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const spinner = ora('Generating files...').start();

    try {
      const files = await generateAll(config);
      spinner.succeed(`Generated ${files.length} files`);

      const checksums: Record<string, string> = {};

      for (const file of files) {
        const filePath = path.join(projectRoot, file.relativePath);
        const existing = await safeReadFile(filePath);

        if (opts.dryRun) {
          if (existing) {
            log.warn(`${file.fileName} ${chalk.dim('(would overwrite)')}`);
          } else {
            log.success(`${file.fileName} ${chalk.dim('(would create)')}`);
          }
          continue;
        }

        if (existing && !opts.force) {
          if (existing === file.content) {
            log.dim(`  ${file.fileName} — no changes`);
            checksums[file.relativePath] = contentHash(file.content);
            continue;
          }
          log.warn(`${file.fileName} — overwriting (use --dry-run to preview)`);
        }

        await safeWriteFile(filePath, file.content);
        checksums[file.relativePath] = contentHash(file.content);
        log.success(`${file.fileName}`);
      }

      if (!opts.dryRun) {
        await saveChecksums(projectRoot, checksums);
        console.log();
        log.dim('Run `goodbot check` to verify files stay in sync.');
      }
    } catch (err) {
      spinner.fail('Generation failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
