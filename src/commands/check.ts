import { Command } from 'commander';
import path from 'node:path';
import chalk from 'chalk';
import { loadConfig, loadChecksums } from '../config/index.js';
import { FILE_MAP } from '../generators/index.js';
import { log, safeReadFile, contentHash, fileExists } from '../utils/index.js';

export const checkCommand = new Command('check')
  .description('Check if generated files are in sync with your config')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (opts) => {
    const projectRoot = opts.path;

    let config;
    try {
      config = await loadConfig(projectRoot);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const checksums = await loadChecksums(projectRoot);
    if (Object.keys(checksums).length === 0) {
      log.error('No checksums found. Run `goodbot generate` first.');
      process.exit(1);
    }

    let issues = 0;

    console.log();

    for (const entry of FILE_MAP) {
      if (!config.agentFiles[entry.configKey]) continue;

      const filePath = path.join(projectRoot, entry.outputPath);
      const exists = await fileExists(filePath);

      if (!exists) {
        console.log(`  ${entry.displayName.padEnd(28)} ${chalk.red('✗ missing')}`);
        issues++;
        continue;
      }

      const content = await safeReadFile(filePath);
      if (!content) {
        console.log(`  ${entry.displayName.padEnd(28)} ${chalk.red('✗ unreadable')}`);
        issues++;
        continue;
      }

      const currentHash = contentHash(content);
      const storedHash = checksums[entry.outputPath];

      if (!storedHash) {
        console.log(`  ${entry.displayName.padEnd(28)} ${chalk.yellow('⚠ no checksum (regenerate)')}`);
        issues++;
      } else if (currentHash === storedHash) {
        console.log(`  ${entry.displayName.padEnd(28)} ${chalk.green('✓ in sync')}`);
      } else {
        console.log(`  ${entry.displayName.padEnd(28)} ${chalk.red('✗ drifted')} ${chalk.dim('(manually edited)')}`);
        issues++;
      }
    }

    console.log();

    if (issues > 0) {
      log.warn(`${issues} issue${issues > 1 ? 's' : ''} found. Run \`goodbot generate --force\` to regenerate.`);
      process.exit(1);
    } else {
      log.success('All files in sync.');
    }
  });
