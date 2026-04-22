import { Command } from 'commander';
import path from 'node:path';
import chalk from 'chalk';
import { loadConfig, loadChecksums } from '../config/index.js';
import { FILE_MAP } from '../generators/index.js';
import { loadSnapshot } from '../freshness/index.js';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis } from '../analyzers/index.js';
import { log, safeReadFile, contentHash, fileExists } from '../utils/index.js';

export const checkCommand = new Command('check')
  .description('Check if generated files are in sync with your config')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--strict', 'Also fail if any analysis.suppressions entry is orphaned (matches no detected violation)', false)
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

    // Snapshot age check
    const snapshot = await loadSnapshot(projectRoot);
    if (snapshot) {
      const daysSince = Math.floor(
        (Date.now() - new Date(snapshot.generatedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince > 7) {
        console.log(`  ${chalk.yellow('⚠')} Snapshot is ${daysSince} days old. Run ${chalk.cyan('goodbot freshness')} to verify claims.`);
        issues++;
      } else {
        console.log(`  ${'Snapshot age'.padEnd(28)} ${chalk.green(`✓ ${daysSince}d old`)}`);
      }
    } else {
      console.log(`  ${'Snapshot'.padEnd(28)} ${chalk.dim('none (run generate --analyze for freshness tracking)')}`);
    }

    // --strict: verify every analysis.suppressions entry still matches a real
    // violation. Orphans silently disable guardrails, so CI should catch them.
    if (opts.strict) {
      const suppressions = config.analysis.suppressions ?? [];
      if (suppressions.length > 0) {
        console.log();
        const scan = await runFullScan(projectRoot);
        const result = await runFullAnalysis(projectRoot, scan.structure, config);
        const orphans = result.suppressions?.orphaned ?? [];
        if (orphans.length > 0) {
          log.warn(`${orphans.length} suppression${orphans.length === 1 ? '' : 's'} matched no violation:`);
          for (const o of orphans) {
            const ident = o.cycle ? `cycle="${o.cycle}"` : o.file ? `file="${o.file}"` : '(no identifier)';
            console.log(`    ${chalk.yellow('⚠')} #${o.index} ${chalk.cyan(o.rule)} ${ident}`);
            console.log(chalk.dim(`       reason: ${o.reason}`));
          }
          log.dim('  Remove with `goodbot unsuppress <id>` or fix the identifier in .goodbot/config.json.');
          issues += orphans.length;
        } else {
          console.log(`  ${'Suppressions'.padEnd(28)} ${chalk.green(`✓ all ${suppressions.length} match real violations`)}`);
        }
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
