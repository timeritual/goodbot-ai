import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig, saveChecksums } from '../config/index.js';
import { generateAll, buildContext } from '../generators/index.js';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis, analyzeGitHistory, findTemporalCoupling } from '../analyzers/index.js';
import type { FullAnalysis, GitHistoryAnalysis, TemporalCoupling } from '../analyzers/index.js';
import { buildSnapshot, saveSnapshot } from '../freshness/index.js';
import { log, safeWriteFile, safeReadFile, contentHash } from '../utils/index.js';

export const generateCommand = new Command('generate')
  .description('Generate AI agent guardrail files from your config')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .option('--force', 'Overwrite existing files without prompting', false)
  .option('--dry-run', 'Show what would be generated without writing', false)
  .option('--analyze', 'Run analysis first and generate adaptive guardrails based on findings', false)
  .action(async (opts) => {
    const projectRoot = opts.path;

    let config;
    try {
      config = await loadConfig(projectRoot);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    let fullAnalysis: FullAnalysis | undefined;
    let gitHistory: GitHistoryAnalysis | undefined;
    let temporalCouplings: TemporalCoupling[] | undefined;

    if (opts.analyze) {
      const analyzeSpinner = ora('Analyzing project for adaptive guardrails...').start();
      try {
        const scan = await runFullScan(projectRoot);
        fullAnalysis = await runFullAnalysis(projectRoot, scan.structure, config);
        analyzeSpinner.text = 'Analyzing git history...';
        gitHistory = await analyzeGitHistory(projectRoot, 500, scan.structure.srcRoot ?? undefined);
        temporalCouplings = findTemporalCoupling(gitHistory.commits, 3, 0.5, scan.structure.srcRoot ?? undefined);
        const aiPct = Math.round(gitHistory.aiCommitRatio * 100);
        analyzeSpinner.succeed(
          `Analysis complete — ${fullAnalysis.health.grade} (${fullAnalysis.health.score}/100), ${gitHistory.totalCommits} commits (${aiPct}% AI)`,
        );
      } catch (err) {
        analyzeSpinner.warn('Analysis failed, generating without analysis data');
      }
    }

    const spinner = ora('Generating files...').start();

    try {
      const files = await generateAll(config, fullAnalysis, gitHistory, temporalCouplings);
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

        // Save analysis snapshot for freshness tracking
        if (fullAnalysis) {
          const context = buildContext(config, undefined, fullAnalysis, gitHistory, temporalCouplings);
          if (context.analysisInsights) {
            const snapshot = buildSnapshot(
              context.analysisInsights,
              config.conventions.customRules,
              fullAnalysis.dependency.modules.length,
              fullAnalysis.dependency.filesParsed,
            );
            await saveSnapshot(projectRoot, snapshot);
            log.dim('Snapshot saved for freshness tracking.');
          }
        }

        console.log();
        log.dim('Run `goodbot check` to verify files stay in sync.');
      }
    } catch (err) {
      spinner.fail('Generation failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
