import { Command } from 'commander';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig, loadChecksums, saveChecksums } from '../config/index.js';
import { generateAll, buildContext } from '../generators/index.js';
import { runFullScan } from '../scanners/index.js';
import { runFullAnalysis, analyzeGitHistory, findTemporalCoupling } from '../analyzers/index.js';
import type { FullAnalysis, GitHistoryAnalysis, TemporalCoupling } from '../analyzers/index.js';
import { buildSnapshot, saveSnapshot, loadSnapshot, snapshotToInsights } from '../freshness/index.js';
import type { AnalysisInsights } from '../generators/index.js';
import { log, safeWriteFile, safeReadFile, contentHash, fileExists } from '../utils/index.js';
import { decideFileWrite, type ExistingFileStrategy } from './file-write-decision.js';

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
    let cachedInsights: AnalysisInsights | undefined;

    // Always scan for framework patterns
    const scanSpinner = ora('Scanning project...').start();
    const scan = await runFullScan(projectRoot);
    scanSpinner.succeed('Scan complete');

    // Auto-analyze on first run (no existing snapshot). Otherwise reuse the cached snapshot.
    let shouldAnalyze = opts.analyze;
    const existingSnapshot = await loadSnapshot(projectRoot);
    if (!shouldAnalyze) {
      if (!existingSnapshot) {
        shouldAnalyze = true;
        log.info('First run detected — running analysis automatically.');
      } else {
        cachedInsights = snapshotToInsights(existingSnapshot);
        log.dim(`Using cached analysis from snapshot (${cachedInsights.healthGrade}, ${cachedInsights.healthScore}/100). Use --analyze to refresh.`);
      }
    }

    if (shouldAnalyze) {
      const analyzeSpinner = ora('Analyzing project for adaptive guardrails...').start();
      try {
        fullAnalysis = await runFullAnalysis(projectRoot, scan.structure, config);
        analyzeSpinner.text = 'Analyzing git history...';
        gitHistory = await analyzeGitHistory(projectRoot, 500, scan.structure.srcRoot ?? undefined);
        temporalCouplings = findTemporalCoupling(gitHistory.commits, 3, 0.5, scan.structure.srcRoot ?? undefined);
        const aiPct = Math.round(gitHistory.aiCommitRatio * 100);
        analyzeSpinner.succeed(
          `Analysis complete — ${fullAnalysis.health.grade} (${fullAnalysis.health.score}/100), ${gitHistory.totalCommits} commits (${aiPct}% AI)`,
        );
        if (fullAnalysis.health.contributors.length > 0) {
          log.dim('  Biggest issues:');
          for (const c of fullAnalysis.health.contributors.slice(0, 5)) {
            log.dim(`    ${String(c.count).padStart(4)}  ${c.label}`);
          }
        }
        const orphans = fullAnalysis.suppressions?.orphaned ?? [];
        if (orphans.length > 0) {
          console.log();
          log.warn(`${orphans.length} suppression${orphans.length === 1 ? '' : 's'} matched no violation:`);
          for (const o of orphans) {
            const ident = o.cycle ? `cycle="${o.cycle}"` : o.file ? `file="${o.file}"` : '(no identifier)';
            console.log(`    ${chalk.yellow('⚠')} #${o.index} ${chalk.cyan(o.rule)} ${ident}`);
          }
          log.dim('  These entries do NOT suppress anything. Fix or remove in .goodbot/config.json. Run `goodbot analyze` for details.');
        }
      } catch (err) {
        analyzeSpinner.warn('Analysis failed — generating without analysis data');
        log.dim(`  ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const spinner = ora('Generating files...').start();

    try {
      const files = await generateAll(config, fullAnalysis, gitHistory, temporalCouplings, scan.frameworkPatterns, cachedInsights);
      spinner.succeed(`Generated ${files.length} files`);

      const existingChecksums = await loadChecksums(projectRoot);
      const checksums: Record<string, string> = {};

      const strategy = (config.agentFiles.existingFileStrategy ?? 'merge') as ExistingFileStrategy;

      for (const file of files) {
        const filePath = path.join(projectRoot, file.relativePath);
        const existing = await safeReadFile(filePath);

        const decision = decideFileWrite({
          generated: file.content,
          existing,
          mergeWithExisting: file.mergeWithExisting,
          strategy,
          checksumExists: existingChecksums[file.relativePath] !== undefined,
        });

        // Dry-run: describe the action and move on
        if (opts.dryRun) {
          switch (decision.action) {
            case 'create':
              log.success(`${file.fileName} ${chalk.dim('(would create)')}`);
              break;
            case 'merge':
              log.warn(`${file.fileName} ${chalk.dim('(would update goodbot section, preserve your content)')}`);
              break;
            case 'overwrite':
              log.warn(`${file.fileName} ${chalk.dim('(would overwrite)')}`);
              break;
            case 'skip':
              log.dim(`  ${file.fileName} ${chalk.dim('(would skip — existing file)')}`);
              break;
            case 'no-change':
              log.dim(`  ${file.fileName} ${chalk.dim('(no changes)')}`);
              break;
          }
          continue;
        }

        if (decision.action === 'skip') {
          log.dim(`  ${file.fileName} — skipped (existing file)`);
          continue;
        }

        if (decision.action === 'no-change') {
          log.dim(`  ${file.fileName} — no changes`);
          checksums[file.relativePath] = contentHash(decision.content);
          continue;
        }

        // Log what we're doing when overwriting/merging existing files
        if (existing && !opts.force) {
          if (decision.action === 'merge') {
            log.info(`${file.fileName} — updating goodbot section (your content preserved)`);
          } else if (decision.action === 'overwrite') {
            log.warn(`${file.fileName} — overwriting (use --dry-run to preview)`);
          }
        }

        await safeWriteFile(filePath, decision.content);
        checksums[file.relativePath] = contentHash(decision.content);
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

        // Ensure .goodbot/.gitignore exists
        const gitignorePath = path.join(projectRoot, '.goodbot', '.gitignore');
        if (!(await fileExists(gitignorePath))) {
          await safeWriteFile(gitignorePath, `# Generated by goodbot — local analysis state, not shared\nsnapshot.json\nchecksums.json\nhistory.json\n`);
          log.dim('Created .goodbot/.gitignore — commit .goodbot/config.json, ignore the rest.');
        }

        console.log();
        log.dim('Next steps:');
        console.log('  • Install git hooks:  npx goodbot-ai hooks install');
        console.log('  • Track freshness:    npx goodbot-ai freshness');
        console.log('  • Add to CI:          npx goodbot-ai check');
      }
    } catch (err) {
      spinner.fail('Generation failed');
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
